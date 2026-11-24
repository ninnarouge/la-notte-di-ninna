import { randomInt } from "node:crypto";
import { FAMIGLIA_IDS, FAMIGLIE, NAME_MAX, LETTERA_AT, STANZA_AT, famiglia, type FamigliaId } from "../../shared/famiglie";
import { hashToken, newId, newToken } from "./auth";
import {
  CHAPTERS,
  DEFAULT_FINAL_MESSAGE,
  HINT_AFTER_MS,
  MESSAGE_KEYWORDS,
  MISSIONS,
  PASSWORDS,
  POINTS,
  PROLOGO,
  RATE,
  chapter,
  type ChapterId,
  type MissionId,
} from "./historia";
import { compactAnswer, fuzzyMatch, lettersOnly, messageMatches } from "./normalize";
import { rateCheck } from "./ratelimit";

export class GameError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export type Guest = {
  id: string;
  tokenHash: string;
  name: string;
  famiglia: FamigliaId;
  half: 0 | 1;
  traitor: boolean;
  lire: number;
  missions: MissionId[];
  wrong: number;
  vote?: string;
  joinedAt: number;
};

export type VoteResult = {
  famiglie: { famiglia: FamigliaId; accusato: string | null; acierto: boolean; votos: number }[];
  scoperti: string[];
  fuggiti: string[];
};

export type GameState = {
  v: 1;
  createdAt: number;
  manual: { lettera: boolean; stanza: boolean };
  guests: Guest[];
  scores: Record<FamigliaId, number>;
  chapters: Partial<Record<ChapterId, boolean>>;
  active: ChapterId | null;
  solves: Partial<Record<ChapterId, FamigliaId[]>>;
  /** Cuándo se abrió cada capítulo por primera vez (para la pista automática). */
  openedAt?: Partial<Record<ChapterId, number>>;
  /** Cuándo lo resolvió la primera famiglia. */
  firstSolveAt?: Partial<Record<ChapterId, number>>;
  /** Pistas que la Madrina mostró antes de tiempo. */
  hintsForced?: Partial<Record<ChapterId, boolean>>;
  attempts: Record<string, number[]>;
  vote: { status: "chiusa" | "aperta" | "risolta"; result?: VoteResult };
  revealed: boolean;
  finalMessage: string;
  log: { t: number; m: string }[];
};

export type Rng = (maxExclusive: number) => number;
export const cryptoRng: Rng = (max) => randomInt(max);

export function initialState(now = Date.now()): GameState {
  return {
    v: 1,
    createdAt: now,
    manual: { lettera: false, stanza: false },
    guests: [],
    scores: Object.fromEntries(FAMIGLIA_IDS.map((id) => [id, 0])) as Record<FamigliaId, number>,
    chapters: {},
    active: null,
    solves: {},
    openedAt: {},
    firstSolveAt: {},
    hintsForced: {},
    attempts: {},
    vote: { status: "chiusa" },
    revealed: false,
    finalMessage: DEFAULT_FINAL_MESSAGE,
    log: [],
  };
}

function log(s: GameState, m: string, now = Date.now()) {
  s.log.push({ t: now, m });
  if (s.log.length > 150) s.log.splice(0, s.log.length - 150);
}

/* ---------- puertas (hora del servidor) ---------- */

export function doors(s: GameState, now = Date.now()) {
  const manual = s?.manual ?? { lettera: false, stanza: false };
  return {
    lettera: !!manual.lettera || now >= Date.parse(LETTERA_AT),
    stanza: !!manual.stanza || now >= Date.parse(STANZA_AT),
    letteraAt: LETTERA_AT,
    stanzaAt: STANZA_AT,
  };
}

/** El capítulo que la mesa está jugando. Si el guardado apunta a uno que ya no existe, usa el último que sigue abierto. */
function currentChapter(s: GameState): ChapterId | null {
  const chapters = s.chapters ?? {};
  if (s.active && chapter(s.active) && chapters[s.active]) return s.active;
  return [...CHAPTERS].reverse().find((c) => chapters[c.id])?.id ?? null;
}

function openProcesso(s: GameState, now: number) {
  if (s.vote.status === "risolta") throw new GameError(400, "Il Processo ya se resolvió. Para votar de nuevo hay que reiniciar el juego.");
  if (s.vote.status !== "aperta") {
    for (const g of s.guests) delete g.vote;
    s.vote = { status: "aperta" };
  }
  s.chapters.processo = true;
  s.active = "processo";
  (s.openedAt ??= {})["processo"] ??= now;
}

export function prologue(s: GameState, now = Date.now()) {
  return doors(s, now).lettera ? PROLOGO : null;
}

/* ---------- nombres ---------- */

export function cleanName(raw: unknown): string {
  if (typeof raw !== "string") throw new GameError(400, "Escribe tu nombre.");
  if (raw.length > 200) throw new GameError(400, `Tu nombre puede tener hasta ${NAME_MAX} caracteres.`);
  const name = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (name.length < 2) throw new GameError(400, "Escribe tu nombre (al menos 2 letras).");
  if ([...name].length > NAME_MAX) throw new GameError(400, `Tu nombre puede tener hasta ${NAME_MAX} caracteres.`);
  if (!/^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u.test(name))
    throw new GameError(400, "Usa solo letras, espacios, puntos, apóstrofos o guiones.");
  return name;
}

const nameKey = (n: string) => compactAnswer(n);

/* ---------- inscripción ---------- */

export function memberCounts(s: GameState): Record<FamigliaId, number> {
  const c = Object.fromEntries(FAMIGLIA_IDS.map((id) => [id, 0])) as Record<FamigliaId, number>;
  for (const g of s.guests) c[g.famiglia]++;
  return c;
}

/** Al azar entre las famiglie con menos miembros. */
export function pickBalanced(s: GameState, rng: Rng = cryptoRng): FamigliaId {
  const counts = memberCounts(s);
  const min = Math.min(...FAMIGLIA_IDS.map((id) => counts[id]));
  const candidates = FAMIGLIA_IDS.filter((id) => counts[id] === min);
  return candidates[rng(candidates.length)];
}

function nextHalf(s: GameState, fam: FamigliaId, except?: string): 0 | 1 {
  const members = s.guests.filter((g) => g.famiglia === fam && g.id !== except);
  const zeros = members.filter((g) => g.half === 0).length;
  return zeros <= members.length - zeros ? 0 : 1;
}

export function register(s: GameState, rawName: unknown, now = Date.now(), rng: Rng = cryptoRng) {
  if (!doors(s, now).stanza) throw new GameError(423, "La Stanza sigue cerrada.");
  const name = cleanName(rawName);
  if (s.guests.some((g) => nameKey(g.name) === nameKey(name)))
    throw new GameError(409, "Ese nombre ya juró. Agrega tu apellido o un apodo.");
  if (s.guests.length >= 120) throw new GameError(423, "La mesa está completa.");
  const fam = pickBalanced(s, rng);
  const token = newToken();
  const guest: Guest = {
    id: newId(),
    tokenHash: hashToken(token),
    name,
    famiglia: fam,
    half: nextHalf(s, fam),
    traitor: false,
    lire: 0,
    missions: [],
    wrong: 0,
    joinedAt: now,
  };
  s.guests.push(guest);
  log(s, `${name} juró por la famiglia ${famiglia(fam).nome}.`, now);
  return { token, guest };
}

export function guestByToken(s: GameState, token: unknown): Guest | undefined {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return undefined;
  const h = hashToken(token);
  return s.guests.find((g) => g.tokenHash === h);
}

/* ---------- acertijos ---------- */

function isCorrect(s: GameState, id: ChapterId, g: Guest, answer: string): boolean {
  const ch = chapter(id)!;
  if (ch.kind === "answer") return fuzzyMatch(answer, ch.answers ?? []);
  if (ch.kind === "password") {
    const [a, b] = PASSWORDS[g.famiglia];
    return fuzzyMatch(answer, [`${a} ${b}`, `${b} ${a}`]);
  }
  if (ch.kind === "message") {
    const keywords = compactAnswer(s.finalMessage) === compactAnswer(DEFAULT_FINAL_MESSAGE) ? MESSAGE_KEYWORDS : [];
    return messageMatches(answer, s.finalMessage, keywords);
  }
  return false;
}

/* ---------- pistas automáticas ---------- */

/**
 * La pista aparece sola HINT_AFTER_MS después de abrir el capítulo, si para entonces
 * ninguna famiglia lo había resuelto. La Madrina puede mostrarla antes.
 */
export function hintState(s: GameState, id: ChapterId, now = Date.now()): { visible: boolean; at: number | null } {
  const ch = chapter(id);
  if (!ch?.pista || !s.chapters[id]) return { visible: false, at: null };
  if (s.hintsForced?.[id]) return { visible: true, at: null };
  const opened = s.openedAt?.[id];
  if (opened === undefined) return { visible: false, at: null };
  const at = opened + HINT_AFTER_MS;
  const first = s.firstSolveAt?.[id];
  if (first !== undefined && first < at) return { visible: false, at: null };
  return now >= at ? { visible: true, at: null } : { visible: false, at };
}

export function answer(s: GameState, token: unknown, rawId: unknown, rawAnswer: unknown, now = Date.now()) {
  const g = guestByToken(s, token);
  if (!g) throw new GameError(401, "No reconozco este teléfono. Vuelve a jurar.");
  const ch = typeof rawId === "string" ? chapter(rawId) : undefined;
  if (!ch || ch.kind === "none") throw new GameError(404, "Ese acertijo no existe.");
  if (!s.chapters[ch.id]) throw new GameError(423, "Ese capítulo todavía no se abre.");
  if (typeof rawAnswer !== "string" || !rawAnswer.trim()) throw new GameError(400, "Escribe una respuesta.");
  if (rawAnswer.length > 300) throw new GameError(400, "La respuesta es demasiado larga.");
  const solvers = (s.solves[ch.id] ??= []);
  if (solvers.includes(g.famiglia)) return { correct: true, already: true, points: 0, place: solvers.indexOf(g.famiglia) + 1 };

  const key = `${g.id}:${ch.id}`;
  const rl = rateCheck(s.attempts[key], now, RATE.limit, RATE.windowMs);
  if (!rl.ok)
    throw new GameError(429, `Demasiados intentos. Espera ${rl.retryAfterSec} segundos.`, { retryAfter: rl.retryAfterSec });
  s.attempts[key] = rl.next;

  if (!isCorrect(s, ch.id, g, rawAnswer)) {
    g.wrong++;
    return { correct: false, already: false, points: 0, place: 0, left: RATE.limit - rl.next.length };
  }
  solvers.push(g.famiglia);
  const place = solvers.length;
  if (place === 1) (s.firstSolveAt ??= {})[ch.id] = now;
  const points = ch.points?.[place - 1] ?? 0;
  s.scores[g.famiglia] += points;
  log(s, `${famiglia(g.famiglia).nome} resolvió «${ch.titolo}» (${place}º, +${points} lire) por mano de ${g.name}.`, now);
  return { correct: true, already: false, points, place };
}

/* ---------- votación ---------- */

export function castVote(s: GameState, token: unknown, target: unknown) {
  const g = guestByToken(s, token);
  if (!g) throw new GameError(401, "No reconozco este teléfono. Vuelve a jurar.");
  if (s.vote.status !== "aperta") throw new GameError(423, "Il Processo no está abierto.");
  if (g.vote) throw new GameError(409, "Tu acusación ya quedó sellada.");
  const t = s.guests.find((x) => x.id === target);
  if (!t) throw new GameError(404, "Esa persona no está en la mesa.");
  if (t.id === g.id) throw new GameError(400, "No puedes acusarte a ti.");
  g.vote = t.id;
  return { ok: true };
}

export function settleVote(s: GameState, now = Date.now()): VoteResult {
  const result: VoteResult = { famiglie: [], scoperti: [], fuggiti: [] };
  const traitors = new Set(s.guests.filter((g) => g.traitor).map((g) => g.id));
  for (const fam of FAMIGLIA_IDS) {
    const tally = new Map<string, number>();
    for (const g of s.guests) if (g.famiglia === fam && g.vote) tally.set(g.vote, (tally.get(g.vote) ?? 0) + 1);
    let best: string | null = null;
    let top = 0;
    let tie = false;
    for (const [id, n] of tally) {
      if (n > top) [best, top, tie] = [id, n, false];
      else if (n === top) tie = true;
    }
    const accusato = tie ? null : best;
    const acierto = !!accusato && traitors.has(accusato);
    if (acierto) {
      s.scores[fam] += POINTS.accusa;
      if (!result.scoperti.includes(accusato!)) result.scoperti.push(accusato!);
    }
    if (tally.size) result.famiglie.push({ famiglia: fam, accusato, acierto, votos: top });
  }
  for (const id of traitors) {
    if (!result.scoperti.includes(id)) {
      result.fuggiti.push(id);
      const t = s.guests.find((g) => g.id === id)!;
      t.lire += POINTS.fuga;
    }
  }
  s.vote = { status: "risolta", result };
  log(s, `Il Processo se cerró. Descubiertos: ${result.scoperti.length}. Fugados: ${result.fuggiti.length}.`, now);
  return result;
}

/* ---------- acciones de la Madrina ---------- */

type Body = Record<string, unknown>;
const guestOf = (s: GameState, id: unknown) => {
  const g = s.guests.find((x) => x.id === id);
  if (!g) throw new GameError(404, "Invitado no encontrado.");
  return g;
};
const int = (v: unknown, min: number, max: number) => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new GameError(400, `Debe ser un entero entre ${min} y ${max}.`);
  return n;
};

export function madrinaAction(s: GameState, body: Body, now = Date.now(), rng: Rng = cryptoRng) {
  switch (body.action) {
    case "puerta": {
      const which = body.puerta === "lettera" ? "lettera" : body.puerta === "stanza" ? "stanza" : null;
      if (!which) throw new GameError(400, "Puerta desconocida.");
      s.manual[which] = body.valor === true;
      log(s, `${which === "lettera" ? "La Lettera" : "La Stanza"}: apertura manual ${s.manual[which] ? "activada" : "desactivada"}.`, now);
      return;
    }
    case "capitulo": {
      const ch = typeof body.id === "string" ? chapter(body.id) : undefined;
      if (!ch) throw new GameError(404, "Capítulo desconocido.");
      if (ch.id === "processo") {
        if (body.valor === true) {
          openProcesso(s, now);
          log(s, "Il Processo se abrió.", now);
          return;
        }
        if (s.vote.status === "aperta") {
          s.vote = { status: "chiusa" };
          for (const g of s.guests) delete g.vote;
        }
        s.chapters.processo = false;
        if (s.active === "processo") s.active = [...CHAPTERS].reverse().find((c) => c.id !== "processo" && s.chapters[c.id])?.id ?? null;
        log(s, "Capítulo «Il Processo» cerrado.", now);
        return;
      }
      s.chapters[ch.id] = body.valor === true;
      if (s.chapters[ch.id]) {
        s.active = ch.id;
        (s.openedAt ??= {})[ch.id] ??= now;
      }
      else if (s.active === ch.id) s.active = [...CHAPTERS].reverse().find((c) => s.chapters[c.id])?.id ?? null;
      log(s, `Capítulo «${ch.titolo}» ${s.chapters[ch.id] ? "abierto" : "cerrado"}.`, now);
      return;
    }
    case "pista": {
      const ch = typeof body.id === "string" ? chapter(body.id) : undefined;
      if (!ch?.pista) throw new GameError(404, "Ese capítulo no tiene pista.");
      (s.hintsForced ??= {})[ch.id] = body.valor === true;
      log(s, `Pista de «${ch.titolo}» ${body.valor === true ? "mostrada" : "oculta"} por la Madrina.`, now);
      return;
    }
    case "lire": {
      const fam = body.famiglia;
      if (!FAMIGLIA_IDS.includes(fam as FamigliaId)) throw new GameError(400, "Famiglia desconocida.");
      const delta = int(body.delta, -500, 500);
      s.scores[fam as FamigliaId] += delta;
      const motivo = typeof body.motivo === "string" ? body.motivo.slice(0, 60) : "";
      log(s, `${famiglia(fam as FamigliaId).nome}: ${delta > 0 ? "+" : ""}${delta} lire${motivo ? ` (${motivo})` : ""}.`, now);
      return;
    }
    case "lire_invitado": {
      const g = guestOf(s, body.id);
      const delta = int(body.delta, -500, 500);
      g.lire += delta;
      log(s, `${g.name}: ${delta > 0 ? "+" : ""}${delta} lire personales.`, now);
      return;
    }
    case "traditori_azar": {
      const n = int(body.n, 1, 2);
      if (s.guests.length < n + 1) throw new GameError(400, "Faltan invitados en la mesa.");
      for (const g of s.guests) g.traitor = false;
      let pool = [...s.guests];
      const chosen: Guest[] = [];
      while (chosen.length < n) {
        const [g] = pool.splice(rng(pool.length), 1);
        chosen.push(g);
        const others = pool.filter((p) => p.famiglia !== g.famiglia);
        if (others.length) pool = others;
      }
      for (const g of chosen) g.traitor = true;
      log(s, `Traidores asignados al azar: ${n}.`, now);
      return;
    }
    case "traditore": {
      const g = guestOf(s, body.id);
      const val = body.valor === true;
      if (val && !g.traitor && s.guests.filter((x) => x.traitor).length >= 2)
        throw new GameError(400, "Ya hay dos traidores. Quita uno primero.");
      g.traitor = val;
      if (!val) g.missions = [];
      log(s, `${g.name} ${val ? "ahora es traidor" : "ya no es traidor"}.`, now);
      return;
    }
    case "famiglia": {
      const g = guestOf(s, body.id);
      if (!FAMIGLIA_IDS.includes(body.famiglia as FamigliaId)) throw new GameError(400, "Famiglia desconocida.");
      const fam = body.famiglia as FamigliaId;
      if (fam === g.famiglia) return;
      g.half = nextHalf(s, fam, g.id);
      g.famiglia = fam;
      log(s, `${g.name} pasó a la famiglia ${famiglia(fam).nome}.`, now);
      return;
    }
    case "missione": {
      const g = guestOf(s, body.id);
      if (!g.traitor) throw new GameError(400, "Solo un traidor tiene misiones.");
      const m = MISSIONS.find((x) => x.id === body.missione);
      if (!m) throw new GameError(404, "Misión desconocida.");
      const done = g.missions.includes(m.id);
      if (body.valor === true && !done) {
        g.missions.push(m.id);
        g.lire += POINTS.missione;
      } else if (body.valor !== true && done) {
        g.missions = g.missions.filter((x) => x !== m.id);
        g.lire -= POINTS.missione;
      } else return;
      log(s, `Misión «${m.titolo}» de ${g.name}: ${body.valor === true ? "cumplida" : "desmarcada"}.`, now);
      return;
    }
    case "votacion": {
      if (body.valor === "aperta") {
        openProcesso(s, now);
        log(s, "Il Proceso se abrió.", now);
      } else if (body.valor === "chiusa") {
        if (s.vote.status !== "aperta") throw new GameError(400, "Il Processo no está abierto.");
        if (!s.guests.some((g) => g.traitor)) throw new GameError(400, "No hay traidor asignado.");
        settleVote(s, now);
      } else if (body.valor === "reset") {
        if (s.vote.status === "risolta") throw new GameError(400, "Los puntos ya se repartieron; no se puede deshacer.");
        s.vote = { status: "chiusa" };
        for (const g of s.guests) delete g.vote;
        log(s, "Votos borrados.", now);
      } else throw new GameError(400, "Acción de votación desconocida.");
      return;
    }
    case "rivela": {
      s.revealed = body.valor === true;
      log(s, s.revealed ? "El traidor fue revelado." : "Revelación oculta.", now);
      return;
    }
    case "messaggio": {
      if (typeof body.testo !== "string") throw new GameError(400, "Escribe el mensaje.");
      const t = body.testo.replace(/\s+/g, " ").trim();
      if (lettersOnly(t).length < 12 || t.length > 160) throw new GameError(400, "El mensaje debe tener entre 12 letras y 160 caracteres.");
      s.finalMessage = t;
      log(s, "Mensaje final actualizado.", now);
      return;
    }
    case "rimuovi": {
      const g = guestOf(s, body.id);
      if (typeof body.conferma !== "string" || body.conferma.trim() !== g.name) throw new GameError(400, "Confirma escribiendo el nombre exacto.");
      s.guests = s.guests.filter((x) => x.id !== g.id);
      for (const x of s.guests) if (x.vote === g.id) delete x.vote;
      log(s, `${g.name} salió de la mesa.`, now);
      return;
    }
    case "reset": {
      const word = typeof body.conferma === "string" ? body.conferma.trim().toLocaleUpperCase("es") : "";
      if (word !== "REINICIAR") throw new GameError(400, "Escribe REINICIAR para confirmar.");
      const keepMsg = s.finalMessage;
      const fresh = initialState(now);
      fresh.finalMessage = typeof keepMsg === "string" && keepMsg.trim() ? keepMsg : fresh.finalMessage;
      for (const key of Object.keys(s)) delete (s as Record<string, unknown>)[key];
      Object.assign(s, fresh);
      log(s, "Juego reiniciado.", now);
      return;
    }
    default:
      throw new GameError(400, "Acción desconocida.");
  }
}

/* ---------- vistas ---------- */

function chapterPublic(s: GameState, id: ChapterId, now: number) {
  const c = chapter(id)!;
  const open = !!s.chapters[id];
  const hint = hintState(s, id, now);
  return {
    id: c.id,
    numero: c.numero,
    titolo: c.titolo,
    open,
    testo: open ? c.testo : null,
    risposta: c.kind !== "none",
    alfabeto: open && !!c.alfabeto,
    pista: hint.visible ? c.pista! : null,
    pistaAt: hint.at,
    risolto: (s.solves[id] ?? []).map((f) => famiglia(f).nome),
  };
}

export function publicView(s: GameState, now = Date.now()) {
  const counts = memberCounts(s);
  const d = doors(s, now);
  return {
    now,
    doors: d,
    famiglie: FAMIGLIE.map((f) => ({ id: f.id, nome: f.nome, colore: f.colore, accento: f.accento, lire: s.scores[f.id], membri: counts[f.id] })),
    invitati: s.guests.length,
    capitoli: CHAPTERS.map((c) => chapterPublic(s, c.id, now)),
    active: currentChapter(s),
    vote: {
      status: s.vote.status,
      votanti: s.guests.filter((g) => g.vote).length,
      result:
        s.revealed && s.vote.result
          ? {
              famiglie: s.vote.result.famiglie.map((r) => ({
                famiglia: famiglia(r.famiglia).nome,
                accusato: s.guests.find((g) => g.id === r.accusato)?.name ?? null,
                acierto: r.acierto,
              })),
            }
          : null,
    },
    traditori: s.revealed
      ? s.guests
          .filter((g) => g.traitor)
          .map((g) => ({
            name: g.name,
            famiglia: famiglia(g.famiglia).nome,
            colore: famiglia(g.famiglia).colore,
            lire: g.lire,
            scoperto: s.vote.result?.scoperti.includes(g.id) ?? false,
          }))
      : null,
  };
}

export function guestView(s: GameState, g: Guest) {
  const pw = PASSWORDS[g.famiglia];
  const solved = CHAPTERS.filter((c) => (s.solves[c.id] ?? []).includes(g.famiglia));
  return {
    id: g.id,
    name: g.name,
    famiglia: g.famiglia,
    mezza: pw[g.half],
    mezzaPos: g.half === 0 ? "inizio" : "fine",
    traditore: g.traitor,
    lire: g.traitor ? g.lire : undefined,
    missioni: g.traitor ? MISSIONS.map((m) => ({ ...m, fatta: g.missions.includes(m.id) })) : [],
    rivelazioni: solved.map((c) => ({
      id: c.id,
      titolo: c.titolo,
      testo: c.kind === "message" ? `Es auténtico: «${s.finalMessage}». Vayan a buscar el sello y llévenselo a Donna Ninna.` : (c.rivela ?? ""),
    })),
    voto: g.vote ? (s.guests.find((x) => x.id === g.vote)?.name ?? null) : null,
    candidati: s.vote.status === "aperta" && !g.vote ? s.guests.filter((x) => x.id !== g.id).map((x) => ({ id: x.id, name: x.name })) : [],
  };
}

export function madrinaView(s: GameState, now = Date.now()) {
  return {
    ...publicView(s, now),
    revealed: s.revealed,
    manual: s.manual,
    finalMessage: s.finalMessage,
    voteResult: s.vote.result
      ? {
          ...s.vote.result,
          famiglie: s.vote.result.famiglie.map((r) => ({ ...r, accusato: s.guests.find((g) => g.id === r.accusato)?.name ?? null })),
          scoperti: s.vote.result.scoperti.map((id) => s.guests.find((g) => g.id === id)?.name ?? "?"),
          fuggiti: s.vote.result.fuggiti.map((id) => s.guests.find((g) => g.id === id)?.name ?? "?"),
        }
      : null,
    guests: s.guests.map((g) => ({
      id: g.id,
      name: g.name,
      famiglia: g.famiglia,
      mezza: PASSWORDS[g.famiglia][g.half],
      traitor: g.traitor,
      lire: g.lire,
      missions: g.missions,
      wrong: g.wrong,
      voto: g.vote ? (s.guests.find((x) => x.id === g.vote)?.name ?? null) : null,
      joinedAt: g.joinedAt,
    })),
    missions: MISSIONS,
    passwords: PASSWORDS,
    pistas: CHAPTERS.filter((c) => c.pista).map((c) => ({ id: c.id, testo: c.pista!, forzada: !!s.hintsForced?.[c.id], ...hintState(s, c.id, now) })),
    log: s.log.slice(-60).reverse(),
  };
}
