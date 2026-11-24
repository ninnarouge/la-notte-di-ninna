import "../styles.css";
import "./stanza.css";
import "./admin.css";
import { api, h, poll, replace } from "./dom";
import type { PublicState } from "./types";
import { brandLogo, corners, crest, sello, waxSeal } from "./ui";

type MGuest = { id: string; name: string; famiglia: string; mezza: string; traitor: boolean; lire: number; missions: string[]; wrong: number; voto: string | null };
type MState = PublicState & {
  revealed: boolean;
  manual: { lettera: boolean; stanza: boolean };
  finalMessage: string;
  guests: MGuest[];
  missions: { id: string; titolo: string; testo: string }[];
  passwords: Record<string, [string, string]>;
  log: { t: number; m: string }[];
  storage: string;
  pezzi: string[];
  pistas: { id: string; testo: string; forzada: boolean; visible: boolean; at: number | null }[];
  voteResult: null | { famiglie: { famiglia: string; accusato: string | null; acierto: boolean; votos: number }[]; scoperti: string[]; fuggiti: string[] };
};

const KEY = "la-stanza.madrina";
const app = document.querySelector<HTMLElement>("#app")!;
let key = sessionStorage.getItem(KEY) ?? "";
let state: MState | null = null;
let sig = "";
let flash = "";

const auth = () => ({ authorization: `Bearer ${key}` });

let refreshGen = 0;

async function act(body: Record<string, unknown>, okText?: string) {
  refreshGen++;
  try {
    await api("madrina", { headers: auth(), body });
    flash = okText ?? "";
  } catch (err) {
    flash = `⚠ ${(err as Error).message}`;
  }
  sig = "";
  await refresh(true);
}

function login(error = "") {
  const input = h("input", {
    class: "st-field",
    type: "password",
    autocomplete: "current-password",
    placeholder: "Clave de la Madrina",
    "aria-label": "Clave de la Madrina",
    required: true,
  });
  const form = h(
    "form",
    {
      class: "st-panel st-login",
      onsubmit: async (e: Event) => {
        e.preventDefault();
        key = input.value;
        sessionStorage.setItem(KEY, key);
        await refresh(true);
      },
    },
    corners("st-login-corners"),
    waxSeal(58, "N"),
    h("p", { class: "st-kicker" }, "La Stanza"),
    h("h2", {}, "Panel de la Madrina"),
    h("p", { class: "hairline" }),
    h("p", { class: "st-caption" }, "Escribe tu clave para entrar. Solo queda guardada en esta pestaña mientras la tengas abierta."),
    input,
    h("button", { class: "btn btn-solid", type: "submit" }, "Entrar"),
    error ? h("p", { class: "st-msg is-err", role: "alert" }, error) : null,
  );
  replace(app, form);
  window.scrollTo(0, 0);
  input.focus();
}

const time = (t: number) =>
  new Date(t).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Santiago" });
const btn = (label: string, onclick: () => void, cls = "") => h("button", { type: "button", class: `btn ${cls}`.trim(), onclick }, label);

/** Estado de la pista de un capítulo y botón para mostrarla antes de tiempo. */
function hintRow(s: MState, id: string) {
  const p = s.pistas.find((x) => x.id === id);
  if (!p) return null;
  const status = p.visible ? (p.forzada ? "Pista visible (la mostraste tú)" : "Pista visible (automática)") : p.at ? `Pista automática a las ${time(p.at)}` : "Pista: se activa 10 min después de abrir, si nadie acierta";
  return h(
    "div",
    { class: "cmd-hint" },
    h("p", { class: "door-meta" }, status),
    h("p", { class: "desk-note" }, `«${p.testo}»`),
    btn(p.forzada ? "Ocultar pista" : "Dar pista ya", () => act({ action: "pista", id, valor: !p.forzada })),
  );
}

const SVG_NS = "http://www.w3.org/2000/svg";
/** Trazo fino en oro. El texto del título ya dice el nombre; el ícono dice para qué es. */
function ico(kind: string) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "panel-ico");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const add = (tag: string, attrs: Record<string, string>, filled = false) => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.setAttribute("fill", filled ? "currentColor" : "none");
    el.setAttribute("stroke", filled ? "none" : "currentColor");
    if (!filled) {
      el.setAttribute("stroke-width", "1.6");
      el.setAttribute("stroke-linecap", "round");
      el.setAttribute("stroke-linejoin", "round");
    }
    svg.appendChild(el);
  };
  const path = (d: string) => add("path", { d });
  const circle = (cx: string, cy: string, r: string, filled = false) => add("circle", { cx, cy, r }, filled);
  if (kind === "lire") {
    circle("12", "12", "8");
    path("M12 8.2 14.3 12 12 15.8 9.7 12Z");
  } else if (kind === "door") {
    path("M6 21V5.5A1.5 1.5 0 0 1 7.5 4h9A1.5 1.5 0 0 1 18 5.5V21");
    path("M6 21h12");
    circle("15", "12.5", "0.9", true);
  } else if (kind === "letter") {
    path("M4 7.2h16v11H4Z");
    path("m4 8 8 6 8-6");
  } else if (kind === "house") {
    path("M4 11.5 12 4l8 7.5");
    path("M7 10.5V20h10v-9.5");
  } else if (kind === "book") {
    path("M12 6.2C10 4.8 7.6 4.4 4.5 5v12.6c3.1-.6 5.5-.2 7.5 1.2 2-1.4 4.4-1.8 7.5-1.2V5c-3.1-.6-5.5-.2-7.5 1.2Z");
    path("M12 6.2v12.6");
  } else if (kind === "scale") {
    path("M12 3.5V20");
    path("M8 20h8");
    path("M4.5 8h15");
    path("M7 8c0 2.3 1.15 3.6 2.6 3.6S12.2 10.3 12.2 8");
    path("M11.8 8c0 2.3 1.15 3.6 2.6 3.6S17 10.3 17 8");
  } else if (kind === "mask") {
    path("M3 12c1.7-4.2 4.8-6.6 9-6.6s7.3 2.4 9 6.6c-1.7 4.2-4.8 6.6-9 6.6s-7.3-2.4-9-6.6Z");
    circle("9", "12", "1.15", true);
    circle("15", "12", "1.15", true);
  } else if (kind === "people") {
    circle("12", "8", "3.1");
    path("M5.2 19.4c.7-3.1 3-4.7 6.8-4.7s6.1 1.6 6.8 4.7");
  } else if (kind === "key") {
    circle("8", "15", "3.2");
    path("M10.7 13.2 19.6 4.6");
    path("M16.4 7.4 18.8 9.8");
  } else if (kind === "clock") {
    circle("12", "12", "8");
    path("M12 8v4.4l2.7 1.7");
  } else if (kind === "reset") {
    path("M20 12a8 8 0 1 1-2.3-5.6");
    path("M20 4.2V9h-4.8");
  }
  return svg;
}

const sectionMark: Record<string, string> = {
  "Bóveda de lire": "lire",
  Puertas: "door",
  Capítulos: "book",
  Traidores: "mask",
  "Il Processo": "scale",
  "Mensaje final": "letter",
  Invitados: "people",
  Contraseñas: "key",
  Registro: "clock",
  "Reiniciar el juego": "reset",
};

const section = (title: string, tone: string, ...kids: (Node | null)[]) =>
  h(
    "section",
    { class: `st-panel${tone ? ` ${tone}` : ""}` },
    h("header", { class: "panel-head" }, h("h2", {}, sectionMark[title] ? ico(sectionMark[title]) : null, title)),
    h("p", { class: "hairline" }),
    ...kids,
  );
const metric = (value: string, label: string, kind: string) => h("li", {}, h("b", {}, value), h("span", {}, ico(kind), label));

function render(s: MState) {
  const famName = (id: string) => s.famiglie.find((f) => f.id === id)?.nome ?? id;
  const traitors = s.guests.filter((g) => g.traitor);
  const topLire = s.famiglie.reduce((m, f) => Math.max(m, f.lire), 0);
  const soleLead = topLire > 0 && s.famiglie.filter((f) => f.lire === topLire).length === 1;
  const doorCard = (kind: string, title: string, open: boolean, when: string, manual: boolean, puerta: "lettera" | "stanza", closed: string) =>
    h(
      "article",
      { class: "door-card" },
      h("div", { class: "door-copy" }, h("h3", {}, ico(kind), title), h("p", { class: "door-meta" }, sello(open ? "oro" : "lacre", open ? "abierta" : closed), h("span", { class: "door-when" }, when))),
      btn(manual ? "Quitar apertura manual" : "Abrir ahora", () => act({ action: "puerta", puerta, valor: !manual })),
    );

  const doors = section(
    "Puertas",
    "",
    h(
      "div",
      { class: "door-grid" },
      doorCard("letter", "La Lettera", s.doors.lettera, "sola a las 12:00 del sábado", s.manual.lettera, "lettera", "sellada"),
      doorCard("house", "La Stanza", s.doors.stanza, "sola a las 21:00 del sábado", s.manual.stanza, "stanza", "cerrada"),
    ),
    h("p", { class: "desk-note" }, `Hora del servidor: ${time(s.now)} (hora de Chile). Almacenamiento: ${s.storage === "blobs" ? "Netlify Blobs" : "archivo local (solo pruebas)"}.`),
  );

  const chapters = section(
    "Capítulos",
    "",
    h(
      "div",
      { class: "ch-grid" },
      ...s.capitoli.map((c) =>
        h(
          "div",
          { class: "cmd" },
          h(
            "div",
            { class: "cmd-id" },
            h("span", { class: "ch-num" }, c.numero),
            h("div", {}, h("span", { class: "ch-title", lang: "it" }, c.titolo), h("p", { class: "door-meta" }, sello(c.open ? "oro" : "lacre", c.open ? "abierto" : "sellado"), c.risolto.length ? h("span", { class: "ch-solved" }, c.risolto.join(" → ")) : null)),
          ),
          h(
            "div",
            { class: "cmd-act" },
            btn(c.open ? "Cerrar" : "Abrir", () => {
              if (c.id === "processo" && c.open && !window.confirm("¿Cerrar Il Processo? Si la votación sigue abierta, se borran los votos.")) return;
              void act({ action: "capitulo", id: c.id, valor: !c.open });
            }),
          ),
          hintRow(s, c.id),
        ),
      ),
    ),
    h("p", { class: "desk-note" }, "Abrir Il Processo también abre la votación. Cerrarlo borra los votos que todavía no se repartieron."),
  );

  const scores = section(
    "Bóveda de lire",
    "panel-vault",
    h("p", { class: "desk-note" }, "Para cargar billetes físicos: +1 por cada billete de 1 lira y +5 por cada billete de 5 lire."),
    h(
      "div",
      { class: "vault" },
      ...s.famiglie.map((f) => {
        const custom = h("input", { type: "number", inputmode: "numeric", step: "1", min: "-500", max: "500", placeholder: "±", "aria-label": `Lire para ${f.nome}` });
        const load = (e: Event) => {
          e.preventDefault();
          const n = Number(custom.value);
          if (Number.isInteger(n) && n !== 0) void act({ action: "lire", famiglia: f.id, delta: n, motivo: "billetes" });
        };
        return h(
          "article",
          { class: `vault-card${soleLead && f.lire === topLire ? " is-lead" : ""}`, style: `--acc:${f.accento}` },
          h("div", { class: "vault-top" }, crest(f.id, f.colore, 52, true), h("div", { class: "vault-id" }, h("b", {}, f.nome), h("span", { class: "ledger-mine" }, `${f.membri} ${f.membri === 1 ? "miembro" : "miembros"}`))),
          h("p", { class: "vault-lire" }, h("span", {}, String(f.lire)), h("small", {}, Math.abs(f.lire) === 1 ? "lira" : "lire")),
          h(
            "div",
            { class: "vault-tools" },
            h("div", { class: "stepper" }, ...[-5, -1, 1, 5].map((d) => btn(d > 0 ? `+${d}` : `−${Math.abs(d)}`, () => act({ action: "lire", famiglia: f.id, delta: d, motivo: "panel" })))),
            h("form", { class: "vault-load", onsubmit: load }, custom, h("button", { class: "btn", type: "submit" }, "Cargar")),
          ),
        );
      }),
    ),
  );

  const traitorSec = section(
    "Traidores",
    "",
    h(
      "div",
      { class: "draw" },
      btn("1 traidor al azar", () => window.confirm("¿Sortear 1 traidor? Reemplaza a los actuales.") && act({ action: "traditori_azar", n: 1 })),
      btn("2 traidores al azar", () => window.confirm("¿Sortear 2 traidores (de famiglie distintas si se puede)? Reemplaza a los actuales.") && act({ action: "traditori_azar", n: 2 })),
    ),
    traitors.length ? null : h("p", { class: "pend" }, "Todavía no hay traidor. Sortéalo cuando la mesa esté completa, o márcalo en la lista de invitados."),
    ...traitors.map((t) =>
      h(
        "div",
        { class: "dossier" },
        h("b", {}, t.name),
        h("p", { class: "door-when" }, `${famName(t.famiglia)} · ${t.lire} ${Math.abs(t.lire) === 1 ? "lira personal" : "lire personales"}`),
        h(
          "div",
          { class: "mlist" },
          ...s.missions.map((m) => {
            const cb = h("input", { type: "checkbox", checked: t.missions.includes(m.id) });
            cb.addEventListener("change", () => act({ action: "missione", id: t.id, missione: m.id, valor: cb.checked }));
            const wrong = s.guests.filter((g) => g.famiglia === t.famiglia).reduce((a, g) => a + g.wrong, 0);
            return h("label", { title: m.testo }, cb, `${m.titolo}: ${m.testo}`, m.id === "voce" ? ` (respuestas erradas de su famiglia: ${wrong})` : "");
          }),
        ),
        h("div", { class: "row" }, btn("−1 lira", () => act({ action: "lire_invitado", id: t.id, delta: -1 })), btn("+1 lira", () => act({ action: "lire_invitado", id: t.id, delta: 1 }))),
      ),
    ),
  );

  const vr = s.voteResult;
  const voteLabel = s.vote.status === "aperta" ? "abierta" : s.vote.status === "risolta" ? "resuelta" : "cerrada";
  const processo = section(
    "Il Processo",
    "panel-stage",
    h(
      "div",
      { class: "stage-status" },
      h(
        "div",
        {},
        h("p", { class: "stage-k" }, "Votación"),
        h("p", { class: "stage-count" }, h("b", {}, String(s.vote.votanti)), h("span", {}, ` / ${s.invitati}`)),
        h("p", { class: "door-when" }, "votos emitidos"),
      ),
      sello(s.vote.status === "aperta" ? "oro" : s.vote.status === "risolta" ? "pergamino" : "lacre", voteLabel),
    ),
    h(
      "div",
      { class: "stage-actions" },
      s.vote.status === "chiusa" ? btn("Abrir votación", () => act({ action: "votacion", valor: "aperta" }), "btn-solid") : null,
      s.vote.status === "aperta"
        ? btn("Cerrar y repartir lire", () => window.confirm("¿Cerrar Il Processo? Se reparten las lire y no se puede deshacer.") && act({ action: "votacion", valor: "chiusa" }), "btn-danger")
        : null,
      s.vote.status === "aperta" ? btn("Borrar votos", () => window.confirm("¿Borrar todos los votos?") && act({ action: "votacion", valor: "reset" })) : null,
      btn(
        s.revealed ? "Ocultar revelación" : "Revelar al traidor",
        () => (s.revealed || window.confirm("¿Revelar al traidor en todas las pantallas?")) && act({ action: "rivela", valor: !s.revealed }),
        s.revealed ? "" : "btn-solid",
      ),
      h("a", { class: "btn", href: "../pantalla/", target: "_blank", rel: "noopener" }, "Abrir pantalla grande"),
    ),
    vr
      ? h(
          "div",
          { class: "stage-result" },
          h("p", { class: "stage-k" }, "Resultado"),
          h("ul", { class: "pw-list" }, ...vr.famiglie.map((r) => h("li", {}, `${famName(r.famiglia)} acusó a ${r.accusato ?? "nadie (empate)"} ${r.acierto ? "· +5 lire" : ""}`))),
          h("p", { class: "desk-note" }, `Descubiertos: ${vr.scoperti.join(", ") || "ninguno"}. Fugados (+10 lire): ${vr.fuggiti.join(", ") || "ninguno"}.`),
        )
      : null,
  );

  const ta = h("textarea", { rows: "3", maxlength: "160", "aria-label": "Mensaje final" });
  ta.value = s.finalMessage;
  const message = section(
    "Mensaje final",
    "",
    h("p", { class: "desk-note" }, "Es la frase de las 6 piezas en espejo. Las famiglie la escriben en «Il Messaggio» y dice dónde está el sello. Si la cambias, vuelve a generar e imprimir los sobres (npm run qr)."),
    ta,
    h(
      "div",
      { class: "row" },
      btn("Guardar mensaje", () => window.confirm("¿Cambiar el mensaje? Las tarjetas impresas dejarán de calzar.") && act({ action: "messaggio", testo: ta.value }, "Mensaje guardado.")),
    ),
    h("ol", { class: "pieces" }, ...s.pezzi.map((p, i) => h("li", {}, h("span", { class: "piece-n" }, String(i + 1).padStart(2, "0")), h("span", { class: "mono" }, p)))),
  );

  const table = h(
    "table",
    { class: "table" },
    h("thead", {}, h("tr", {}, ...["Invitado", "Famiglia", "Mitad", "Rol", "Errores", "Voto", ""].map((x) => h("th", {}, x)))),
    h(
      "tbody",
      {},
      ...s.guests.map((g) => {
        const sel = h("select", { "aria-label": `Famiglia de ${g.name}` }, ...s.famiglie.map((f) => h("option", { value: f.id, selected: f.id === g.famiglia }, f.nome)));
        sel.addEventListener("change", () => act({ action: "famiglia", id: g.id, famiglia: sel.value }));
        return h(
          "tr",
          { class: g.traitor ? "is-traitor" : "" },
          h("td", { class: "guest-name", "data-label": "Invitado" }, g.name),
          h("td", { "data-label": "Famiglia" }, sel),
          h("td", { "data-label": "Mitad" }, g.mezza),
          h("td", { class: "td-role", "data-label": "Rol" }, btn(g.traitor ? "Traidor" : "Hacer traidor", () => act({ action: "traditore", id: g.id, valor: !g.traitor }), g.traitor ? "btn-danger" : "")),
          h("td", { class: "td-num", "data-label": "Errores" }, String(g.wrong)),
          h("td", { "data-label": "Voto" }, g.voto ?? "—"),
          h("td", { class: "td-act", "data-label": "Mesa" }, btn("Quitar", () => {
            const c = window.prompt(`Para sacar a ${g.name} de la mesa, escribe su nombre exacto:`)?.trim();
            if (c) void act({ action: "rimuovi", id: g.id, conferma: c });
          })),
        );
      }),
    ),
  );
  const guests = section("Invitados", "", s.guests.length ? h("div", { class: "table-wrap" }, table) : h("p", { class: "desk-note" }, "Nadie ha jurado todavía."));

  const pw = section(
    "Contraseñas",
    "",
    h(
      "ul",
      { class: "pw-book" },
      ...s.famiglie.map((f) => h("li", {}, crest(f.id, f.colore, 36, true), h("span", { class: "pw-copy" }, h("b", {}, f.nome), h("span", {}, s.passwords[f.id].join("  ·  "))))),
    ),
  );
  const log = section(
    "Registro",
    "",
    h("ul", { class: "log" }, ...s.log.map((l) => h("li", {}, h("time", { dateTime: new Date(l.t).toISOString() }, time(l.t)), h("span", {}, l.m)))),
  );
  const reset = section(
    "Reiniciar el juego",
    "panel-danger",
    h("p", { class: "desk-note" }, "Borra invitados, lire, capítulos y votos. El mensaje final se conserva."),
    h(
      "div",
      { class: "row" },
      btn(
        "Reiniciar todo",
        () => {
          if (!window.confirm("¿Seguro? Esto borra invitados, lire, capítulos y votos. El mensaje final se conserva.")) return;
          const c = window.prompt("Escribe REINICIAR para confirmar:")?.trim().toLocaleUpperCase("es") ?? "";
          if (!c) return;
          if (c !== "REINICIAR") {
            flash = "⚠ Para borrar la partida tienes que escribir REINICIAR.";
            if (state) render(state);
            return;
          }
          void act({ action: "reset", conferma: c }, "Juego reiniciado. La mesa quedó vacía.");
        },
        "btn-danger",
      ),
    ),
  );

  const y = window.scrollY;
  replace(
    app,
    h(
      "div",
      { class: "admin" },
      h(
        "header",
        { class: "st-mast desk-mast" },
        h("img", { class: "medallion", src: "/ornaments/medallion.svg", alt: "", width: "72", height: "142" }),
        brandLogo(),
        h("h1", { class: "final-title" }, "Madrina"),
        h("img", { class: "desk-rule", src: "/ornaments/rule-diamond.svg", alt: "" }),
        h(
          "ul",
          { class: "desk-metrics", "aria-label": "Estado de la noche" },
          metric(String(s.invitati), s.invitati === 1 ? "invitado" : "invitados", "people"),
          metric(String(traitors.length), traitors.length === 1 ? "traidor" : "traidores", "mask"),
          metric(time(s.now), "hora de Chile", "clock"),
        ),
      ),
      flash ? h("p", { class: `desk-flash st-msg${flash.startsWith("⚠") ? " is-err" : ""}`, role: flash.startsWith("⚠") ? "alert" : "status" }, flash) : null,
      h("div", { class: "desk" }, scores, doors, chapters, h("div", { class: "desk-split" }, processo, traitorSec), guests, message, h("div", { class: "desk-split" }, pw, log), reset),
      h(
        "p",
        { class: "admin-exit" },
        btn("Salir", () => {
          sessionStorage.removeItem(KEY);
          key = "";
          login();
        }, "btn-text"),
      ),
    ),
  );
  window.scrollTo(0, y);
}

async function refresh(force = false) {
  if (!key) {
    if (!app.querySelector('input[type="password"]')) login();
    return;
  }
  if (!force && app.contains(document.activeElement) && document.activeElement?.matches("input, textarea, select")) return;
  const gen = ++refreshGen;
  try {
    const s = await api<MState>("madrina", { headers: auth() });
    if (gen !== refreshGen) return;
    state = s;
    const next = JSON.stringify({ ...s, now: 0 }) + flash;
    if (!force && next === sig) return;
    sig = next;
    render(s);
  } catch (err) {
    if (gen !== refreshGen) return;
    const e = err as Error & { status?: number };
    if (e.status === 401 || e.status === 503 || e.status === 429) {
      sessionStorage.removeItem(KEY);
      key = "";
      login(e.message);
      return;
    }
    flash = `⚠ ${e.message}`;
    if (state) render(state);
    else login(e.message);
  }
}

poll(() => refresh(), 4000);
void state;
