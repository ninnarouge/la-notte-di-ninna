import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FAMIGLIA_IDS } from "../shared/famiglie";
import { madrinaAuthorized, safeEqual } from "../netlify/lib/auth";
import { GameError, answer, castVote, guestView, hintState, initialState, madrinaAction, madrinaView, memberCounts, pickBalanced, publicView, register, type GameState } from "../netlify/lib/game";
import { CHAPTERS, DEFAULT_FINAL_MESSAGE, HINT_AFTER_MS, PASSWORDS } from "../netlify/lib/historia";
import { compactAnswer, fuzzyMatch, messageMatches, normalizeAnswer } from "../netlify/lib/normalize";
import { rateCheck } from "../netlify/lib/ratelimit";
import { _fileStoreForTests, updateState } from "../netlify/lib/storage";
import { splitPieces } from "../netlify/lib/pezzi";

const NIGHT = Date.parse("2026-11-21T21:30:00-03:00");
const open = (): GameState => {
  const s = initialState(NIGHT);
  for (const c of CHAPTERS) s.chapters[c.id] = true;
  return s;
};
const accepts = (id: string, a: string) => fuzzyMatch(a, CHAPTERS.find((c) => c.id === id)!.answers!);

describe("normalización de respuestas", () => {
  it("quita tildes, mayúsculas, signos, espacios y artículos", () => {
    expect(normalizeAnswer("  ¡El   Traidór!  ")).toBe("traidor");
    expect(normalizeAnswer("Nuovo Cinema Paradiso.")).toBe("nuovo cinema paradiso");
    expect(compactAnswer("Extremo Duro")).toBe("extremoduro");
  });
  it("acepta las variantes aprobadas y errores chicos, y rechaza las equivocadas", () => {
    for (const a of ["TRAIDOR", "el traidor", "traidór", "traditore", "traidro", "tradior"]) expect(accepts("codice", a)).toBe(true);
    for (const a of ["Cinema Paradiso", "cinema paradisso", "Nuovo Cinema Paradiso", "paradiso", "el paraiso", "cinema paradizo"]) expect(accepts("prezzo", a)).toBe(true);
    for (const a of ["ROSSO", "rojo", "roso", "Rosso!"]) expect(accepts("cifra", a)).toBe(true);
    for (const a of ["Extremoduro", "extremo duro", "extremo", "extremodur", "estremoduro"]) expect(accepts("chiave", a)).toBe(true);
    for (const a of ["Segundo movimiento", "el segundo movimiento", "el segundo", "2 movimiento", "segundo movimento"]) expect(accepts("brindisi", a)).toBe(true);
    for (const [id, a] of [["codice", "traicion"], ["prezzo", "cinema"], ["cifra", "verde"], ["cifra", "rosa"], ["chiave", "marea"], ["brindisi", "primero"], ["codice", ""]])
      expect(accepts(id, a)).toBe(false);
  });
  it("el mensaje final acepta errores, sin comas ni tildes, o la idea esencial", () => {
    const K = [["pantalla", "monitor"], ["despacho", "oficina"]];
    const ok = (a: string) => messageMatches(a, DEFAULT_FINAL_MESSAGE, K);
    expect(ok("el sello duerme bajo la pantalla en el despacho de la dona")).toBe(true);
    expect(ok("EL SELLO DUERME BAJO LA PANTALA EN EL DESPACHO DE LA DONA")).toBe(true);
    expect(ok("bajo la pantalla de la oficina")).toBe(true);
    expect(ok("en el despacho, bajo la pantaya")).toBe(true);
    expect(ok("el sello duerme en la cocina")).toBe(false);
    expect(ok("pantalla")).toBe(false);
    expect(messageMatches("bajo la pantalla de la oficina", "Otra frase distinta para el sello", [])).toBe(false);
  });
  it("las respuestas viven solo en el servidor: el código del navegador no importa la historia", () => {
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
    const src = fileURLToPath(new URL("../src", import.meta.url));
    for (const f of walk(src).filter((f) => /\.(ts|js)$/.test(f))) {
      const code = readFileSync(f, "utf8");
      expect(code, f).not.toMatch(/netlify\/lib|historia/);
      expect(code, f).not.toMatch(/paradiso|extremoduro|rosso|segundo movimiento|wudlgru/i);
    }
  });
});

describe("piezas en espejo", () => {
  it("reparte el mensaje en seis piezas de 1 a 3 palabras que reconstruyen el original", () => {
    const pieces = splitPieces(DEFAULT_FINAL_MESSAGE, 6);
    expect(pieces).toHaveLength(6);
    for (const p of pieces) expect(p.split(" ").length).toBeGreaterThanOrEqual(1);
    for (const p of pieces) expect(p.split(" ").length).toBeLessThanOrEqual(3);
    expect(pieces.join(" ")).toBe(DEFAULT_FINAL_MESSAGE.toUpperCase().replace(/,/g, ""));
    expect(splitPieces("a b c d e f g", 3).join(" ")).toBe("A B C D E F G");
  });
});

describe("capítulos", () => {
  it("numeración seguida y sin el capítulo informativo antiguo", () => {
    expect(CHAPTERS.map((c) => c.numero)).toEqual(["I", "II", "III", "IV", "V", "VI", "VII", "Epílogo"]);
    expect(CHAPTERS.some((c) => (c.id as string) === "nascondigli")).toBe(false);
    const codice = CHAPTERS.find((c) => c.id === "codice")!;
    expect(codice.rivela).toMatch(/6 piezas/);
    expect(codice.rivela).toMatch(/biblioteca/);
    expect(codice.alfabeto).toBe(true);
    expect(CHAPTERS.find((c) => c.id === "chiave")!.rivela).toMatch(/espejo/);
  });
  it("cada capítulo con acertijo dice dónde responder y tiene pista", () => {
    for (const c of CHAPTERS) {
      expect(c.testo, c.id).toMatch(/aquí abajo/);
      if (c.kind !== "none") expect(c.pista, c.id).toBeTruthy();
      expect(c.testo + (c.rivela ?? "") + (c.pista ?? "")).not.toMatch(/simulad|edad|años/i);
    }
  });
});

describe("pistas automáticas", () => {
  it("aparece sola a los 10 minutos si nadie resolvió", () => {
    const s = initialState(NIGHT);
    madrinaAction(s, { action: "capitulo", id: "codice", valor: true }, NIGHT);
    expect(hintState(s, "codice", NIGHT + HINT_AFTER_MS - 1)).toEqual({ visible: false, at: NIGHT + HINT_AFTER_MS });
    const pub = publicView(s, NIGHT + 60_000).capitoli.find((c) => c.id === "codice")!;
    expect(pub.pista).toBeNull();
    expect(pub.pistaAt).toBe(NIGHT + HINT_AFTER_MS);
    const later = publicView(s, NIGHT + HINT_AFTER_MS).capitoli.find((c) => c.id === "codice")!;
    expect(later.pista).toMatch(/W es T/);
  });
  it("no aparece si una famiglia acertó antes, y sigue visible si acertaron después", () => {
    const s = initialState(NIGHT);
    s.manual.stanza = true;
    madrinaAction(s, { action: "capitulo", id: "codice", valor: true }, NIGHT);
    madrinaAction(s, { action: "capitulo", id: "prezzo", valor: true }, NIGHT);
    const a = register(s, "Ana", NIGHT);
    answer(s, a.token, "codice", "traidor", NIGHT + 5 * 60_000);
    expect(hintState(s, "codice", NIGHT + 20 * 60_000).visible).toBe(false);
    answer(s, a.token, "prezzo", "paradiso", NIGHT + 12 * 60_000);
    expect(hintState(s, "prezzo", NIGHT + 20 * 60_000).visible).toBe(true);
  });
  it("reabrir no reinicia el reloj y la Madrina puede darla antes", () => {
    const s = initialState(NIGHT);
    madrinaAction(s, { action: "capitulo", id: "cifra", valor: true }, NIGHT);
    madrinaAction(s, { action: "capitulo", id: "cifra", valor: false }, NIGHT + 60_000);
    madrinaAction(s, { action: "capitulo", id: "cifra", valor: true }, NIGHT + 120_000);
    expect(hintState(s, "cifra", NIGHT + HINT_AFTER_MS).visible).toBe(true);
    madrinaAction(s, { action: "capitulo", id: "chiave", valor: true }, NIGHT);
    madrinaAction(s, { action: "pista", id: "chiave", valor: true }, NIGHT + 1000);
    expect(hintState(s, "chiave", NIGHT + 1000).visible).toBe(true);
    expect(madrinaView(s, NIGHT + 1000).pistas.find((p) => p.id === "chiave")!.forzada).toBe(true);
    expect(() => madrinaAction(s, { action: "pista", id: "processo", valor: true })).toThrow(/pista/);
  });
  it("un capítulo cerrado no muestra pista y el abecedario solo sale en los de cifras", () => {
    const s = initialState(NIGHT);
    s.hintsForced = { codice: true };
    expect(publicView(s, NIGHT).capitoli.find((c) => c.id === "codice")!.pista).toBeNull();
    madrinaAction(s, { action: "capitulo", id: "codice", valor: true }, NIGHT);
    const caps = publicView(s, NIGHT).capitoli;
    expect(caps.find((c) => c.id === "codice")!.alfabeto).toBe(true);
    expect(caps.find((c) => c.id === "prezzo")!.alfabeto).toBe(false);
  });
});

describe("asignación balanceada al azar", () => {
  it("siempre elige entre las famiglie con menos miembros", () => {
    const s = open();
    for (let i = 0; i < 23; i++) {
      register(s, `Invitado ${String.fromCharCode(65 + i)}`, NIGHT);
      const c = Object.values(memberCounts(s));
      expect(Math.max(...c) - Math.min(...c)).toBeLessThanOrEqual(1);
    }
    expect(s.guests).toHaveLength(23);
  });
  it("usa el azar para desempatar", () => {
    const s = open();
    const seen = new Set(Array.from({ length: 5 }, (_, i) => pickBalanced(s, () => i)));
    expect(seen.size).toBe(5);
  });
  it("reparte mitades de contraseña dentro de cada famiglia", () => {
    const s = open();
    for (let i = 0; i < 10; i++) register(s, `Persona ${String.fromCharCode(65 + i)}`, NIGHT);
    for (const fam of FAMIGLIA_IDS) {
      const halves = s.guests.filter((g) => g.famiglia === fam).map((g) => g.half).sort();
      expect(halves).toEqual([0, 1]);
    }
  });
  it("valida nombres y rechaza duplicados", () => {
    const s = open();
    register(s, "Kiran", NIGHT);
    expect(() => register(s, "kirán", NIGHT)).toThrow(GameError);
    expect(() => register(s, "<b>Ana</b>", NIGHT)).toThrow(/letras/);
    expect(() => register(s, "x".repeat(25), NIGHT)).toThrow(/24/);
    expect(() => register(s, " ", NIGHT)).toThrow();
  });
  it("respeta la hora del servidor", () => {
    const s = initialState();
    expect(() => register(s, "Temprano", Date.parse("2026-11-21T20:59:00-03:00"))).toThrow(/cerrada/);
    s.manual.stanza = true;
    expect(() => register(s, "Temprano", Date.parse("2026-11-21T20:59:00-03:00"))).not.toThrow();
  });
});

describe("acertijos, puntos y votación", () => {
  it("da 5 lire a la primera famiglia y 1 a la segunda, y revela el escondite", () => {
    const s = open();
    const a = register(s, "Ana", NIGHT, () => 0);
    const b = register(s, "Beto", NIGHT, () => 0);
    expect(a.guest.famiglia).not.toBe(b.guest.famiglia);
    expect(answer(s, a.token, "codice", "nada", NIGHT).correct).toBe(false);
    expect(answer(s, a.token, "codice", "Traidor", NIGHT)).toMatchObject({ correct: true, points: 5 });
    expect(answer(s, b.token, "codice", "traidor", NIGHT)).toMatchObject({ correct: true, points: 1 });
    expect(s.scores[a.guest.famiglia]).toBe(5);
    expect(guestView(s, a.guest).rivelazioni[0].testo).toMatch(/biblioteca/);
    expect(JSON.stringify(publicView(s))).not.toMatch(/biblioteca/);
  });
  it("acepta la contraseña completa de la famiglia y el mensaje descifrado", () => {
    const s = open();
    const a = register(s, "Ana", NIGHT);
    const [x, y] = PASSWORDS[a.guest.famiglia];
    expect(answer(s, a.token, "giuramento", `${x} ${y}`, NIGHT).correct).toBe(true);
    expect(answer(s, a.token, "messaggio", "EL SELLO DUERME BAJO LA PANTALLA EN EL DESPACHO DE LA DONA", NIGHT).correct).toBe(true);
    const b = register(s, "Beto", NIGHT);
    const [p, q] = PASSWORDS[b.guest.famiglia];
    expect(answer(s, b.token, "giuramento", `${q}${p}`.toUpperCase(), NIGHT).correct).toBe(true);
  });
  it("no deja responder capítulos cerrados", () => {
    const s = initialState(NIGHT);
    const a = register(s, "Ana", NIGHT);
    expect(() => answer(s, a.token, "codice", "traidor", NIGHT)).toThrow(/no se abre/);
  });
  it("la mayoría de una famiglia que acierta cobra; el traidor no descubierto cobra fuga", () => {
    const s = open();
    const t = Array.from({ length: 10 }, (_, i) => register(s, `Jugador ${String.fromCharCode(65 + i)}`, NIGHT));
    madrinaAction(s, { action: "traditore", id: t[0].guest.id, valor: true }, NIGHT);
    madrinaAction(s, { action: "votacion", valor: "aperta" }, NIGHT);
    const fam = t[0].guest.famiglia;
    for (const p of t.slice(1)) {
      const target = p.guest.famiglia === fam || p.guest.famiglia === t[1].guest.famiglia ? t[0].guest.id : t[1].guest.id;
      castVote(s, p.token, p.guest.id === target ? t[2].guest.id : target);
    }
    expect(() => castVote(s, t[1].token, t[0].guest.id)).toThrow(/sellada/);
    const before = s.scores[t[1].guest.famiglia];
    madrinaAction(s, { action: "votacion", valor: "chiusa" }, NIGHT);
    expect(s.scores[t[1].guest.famiglia]).toBe(before + 5);
    expect(s.vote.result!.scoperti).toContain(t[0].guest.id);
  });
  it("reiniciar exige confirmación, acepta la palabra con espacios y borra un capítulo que ya no existe", () => {
    const s = open();
    register(s, "Ana", NIGHT);
    (s.chapters as Record<string, boolean>).nascondigli = true;
    (s as { active: string }).active = "nascondigli";
    expect(() => madrinaAction(s, { action: "reset" })).toThrow(/REINICIAR/);
    madrinaAction(s, { action: "reset", conferma: " reiniciar " });
    expect(s.guests).toHaveLength(0);
    expect(s.chapters).toEqual({});
    expect(s.active).toBeNull();
    expect(s.finalMessage).toBe(DEFAULT_FINAL_MESSAGE);
  });
  it("un capítulo viejo no deja la mesa sin capítulo en curso", () => {
    const s = initialState(NIGHT);
    s.chapters.giuramento = true;
    (s.chapters as Record<string, boolean>).nascondigli = true;
    (s as { active: string }).active = "nascondigli";
    expect(publicView(s, NIGHT).active).toBe("giuramento");
  });
  it("abrir Il Processo desde la lista abre la votación y cerrarlo borra los votos sin repartir", () => {
    const s = open();
    const a = register(s, "Ana", NIGHT);
    const b = register(s, "Beto", NIGHT);
    madrinaAction(s, { action: "capitulo", id: "processo", valor: true }, NIGHT);
    expect(s.vote.status).toBe("aperta");
    expect(s.active).toBe("processo");
    castVote(s, a.token, b.guest.id);
    madrinaAction(s, { action: "capitulo", id: "processo", valor: false }, NIGHT);
    expect(s.vote.status).toBe("chiusa");
    expect(s.chapters.processo).toBe(false);
    expect(a.guest.vote).toBeUndefined();
    expect(s.scores[a.guest.famiglia]).toBe(0);
  });
});

describe("rate limit", () => {
  it("permite 5 intentos por minuto y luego bloquea", () => {
    let t: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = rateCheck(t, 1000 + i, 5, 60_000);
      expect(r.ok).toBe(true);
      t = r.next;
    }
    const blocked = rateCheck(t, 2000, 5, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(50);
    expect(rateCheck(t, 1000 + 61_000, 5, 60_000).ok).toBe(true);
  });
  it("se aplica por invitado y acertijo en el juego", () => {
    const s = open();
    const a = register(s, "Ana", NIGHT);
    for (let i = 0; i < 5; i++) answer(s, a.token, "prezzo", "no", NIGHT + i);
    expect(() => answer(s, a.token, "prezzo", "cinema paradiso", NIGHT + 10)).toThrow(/Espera/);
    expect(answer(s, a.token, "cifra", "rosso", NIGHT + 10).correct).toBe(true);
    expect(answer(s, a.token, "prezzo", "cinema paradiso", NIGHT + 61_000).correct).toBe(true);
  });
});

describe("auth de la Madrina", () => {
  it("compara en tiempo constante y exige Bearer con la clave exacta", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(madrinaAuthorized("Bearer clave-larga-123", "clave-larga-123")).toBe(true);
    expect(madrinaAuthorized("Bearer clave-larga-12", "clave-larga-123")).toBe(false);
    expect(madrinaAuthorized("clave-larga-123", "clave-larga-123")).toBe(false);
    expect(madrinaAuthorized("Bearer x", undefined)).toBe(false);
    expect(madrinaAuthorized("Bearer corta", "corta")).toBe(false);
  });
  it("roles y misiones solo con token", () => {
    const s = open();
    const a = register(s, "Ana", NIGHT);
    register(s, "Beto", NIGHT);
    madrinaAction(s, { action: "traditore", id: a.guest.id, valor: true });
    const pub = JSON.stringify(publicView(s));
    expect(pub).not.toMatch(/traitor|Falso Indizio|luna|vino/);
    expect(guestView(s, a.guest).missioni.length).toBeGreaterThanOrEqual(4);
  });
});

describe("almacenamiento", () => {
  it("las escrituras concurrentes no se pisan", async () => {
    const dir = mkdtempSync(join(tmpdir(), "stanza-"));
    const store = _fileStoreForTests(join(dir, "s.json"));
    await Promise.all(
      FAMIGLIA_IDS.flatMap((f) => Array.from({ length: 4 }, () => updateState(store, (s) => madrinaAction(s, { action: "lire", famiglia: f, delta: 1 })))),
    );
    const { state } = await store.read();
    expect(Object.values(state.scores)).toEqual([4, 4, 4, 4, 4]);
  });
});

describe("CSP", () => {
  it("netlify.toml autoriza el script en línea de index.html por hash", () => {
    const html = readFileSync(new URL("../invitacion/index.html", import.meta.url), "utf8");
    const inline = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    const hash = createHash("sha256").update(inline).digest("base64");
    const toml = readFileSync(new URL("../netlify.toml", import.meta.url), "utf8");
    expect(toml).toContain(`'sha256-${hash}'`);
    expect(toml).toContain("frame-src https://open.spotify.com");
    expect(toml).toContain("frame-ancestors 'none'");
  });
});

describe("escritura condicional", () => {
  it("rechaza una escritura con ETag viejo", async () => {
    const dir = mkdtempSync(join(tmpdir(), "stanza-"));
    const store = _fileStoreForTests(join(dir, "s.json"));
    const a = await store.read();
    expect(await store.write(a.state, a.etag)).toBe(true);
    const b = await store.read();
    b.state.scores.lupo = 3;
    expect(await store.write(b.state, b.etag)).toBe(true);
    expect(await store.write(b.state, a.etag === b.etag ? "otro" : b.etag === null ? "x" : a.etag ?? "x")).toBe(false);
  });
});
