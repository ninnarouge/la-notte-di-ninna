/** Piezas visuales de La Stanza, con el sistema de la invitación. */
import { h } from "./dom";
import { FAMIGLIE } from "../../shared/famiglie";
import { fotoDe } from "./ricercati";

const NS = "http://www.w3.org/2000/svg";
let uid = 0;

function svg(tag: string, attrs: Record<string, string | number>, ...kids: Node[]) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const k of kids) el.appendChild(k);
  return el;
}

let brandShown = false;

/** El brillo de carga corre solo la primera vez. Las actualizaciones no lo repiten. */
export function brandLogo() {
  const mark = h(
    "span",
    { class: brandShown ? "brand-mark is-set" : "brand-mark" },
    h("img", { class: "brand-logo", src: "/logo-la-notte-di-ninna.svg", alt: "La Notte di Ninna", width: "595", height: "187" }),
  );
  brandShown = true;
  return mark;
}

const CREST_SRC: Record<string, string> = {
  lupo: "/crests/lupo.png",
  vipera: "/crests/vipera.png",
  "rosa-nera": "/crests/rosa-nera.png",
  falco: "/crests/falco.png",
  scorpione: "/crests/scorpione.png",
};

/** Blasón de la famiglia, sin fondo. El dibujo vive en public/crests. */
export function crest(id: string, _colore: string, size = 132, decorative = false) {
  const nome = FAMIGLIE.find((f) => f.id === id)?.nome ?? "";
  const src = CREST_SRC[id];
  if (!src) {
    const empty = document.createElement("span");
    empty.className = "crest";
    return empty;
  }
  const img = document.createElement("img");
  img.className = "crest";
  img.src = src;
  img.width = size;
  img.alt = decorative || !nome ? "" : `Escudo de la famiglia ${nome}`;
  img.decoding = "async";
  if (decorative) img.setAttribute("aria-hidden", "true");
  return img;
}

/** Lacre de cera burdeos. */
export function waxSeal(size = 64, letter = "N") {
  const g = `wax-${++uid}`;
  const pts: string[] = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 46 : 49.5;
    pts.push(`${(50 + Math.cos(a) * r).toFixed(2)},${(50 + Math.sin(a) * r).toFixed(2)}`);
  }
  const t = svg("text", { x: 50, y: 62, "text-anchor": "middle", class: "wax-mono", "font-size": 32 });
  t.textContent = letter;
  return svg(
    "svg",
    { viewBox: "0 0 100 100", width: size, height: size, class: "wax", "aria-hidden": "true" },
    svg(
      "defs",
      {},
      svg(
        "radialGradient",
        { id: g, cx: "36%", cy: "30%", r: "75%" },
        svg("stop", { offset: "0", "stop-color": "#c45058" }),
        svg("stop", { offset: ".5", "stop-color": "#7e1f28" }),
        svg("stop", { offset: "1", "stop-color": "#3d0c12" }),
      ),
    ),
    svg("polygon", { points: pts.join(" "), fill: `url(#${g})` }),
    svg("circle", { cx: 50, cy: 50, r: 34, fill: "none", stroke: "#f0c2b8", "stroke-opacity": "0.35", "stroke-width": "0.8" }),
    svg("circle", { cx: 50, cy: 50, r: 29, fill: "none", stroke: "#2a090c", "stroke-opacity": "0.45", "stroke-width": "0.9" }),
    t,
  );
}

/** Estado en oro, lacre o pergamino. Nada de píldora verde. */
export function sello(kind: "oro" | "lacre" | "pergamino", label: string) {
  return h("span", { class: `sello sello-${kind}` }, label);
}

export const divider = () =>
  h("div", { class: "divider st-divider", "aria-hidden": "true" }, h("img", { src: "/ornaments/diamante-anidado.svg", alt: "", width: "1735", height: "270" }));

export const corners = (cls = "") =>
  h(
    "div",
    { class: `corners ${cls}`.trim(), "aria-hidden": "true" },
    ...["tr", "tl", "br", "bl"].map((c) => h("img", { class: `c ${c}`, src: "/ornaments/corner.svg", alt: "" })),
  );

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
export const roman = (n: number) => ROMAN[n - 1] ?? String(n);

export const lire = (n: number) => `${n} ${Math.abs(n) === 1 ? "lira" : "lire"}`;

export type LedgerFam = { id: string; nome: string; colore: string; accento: string; lire: number };

/** Libro contable: puesto, nombre, guía punteada y monto. */
export function ledger(famiglie: LedgerFam[], opts: { mine?: string; previous?: Map<string, number> } = {}) {
  const sorted = [...famiglie].sort((a, b) => b.lire - a.lire || a.nome.localeCompare(b.nome, "es"));
  const max = Math.max(10, ...sorted.map((f) => f.lire));
  return h(
    "ol",
    { class: "ledger", "aria-label": "Lire por famiglia" },
    ...sorted.map((f, i) => {
      const bump = opts.previous?.has(f.id) && opts.previous.get(f.id) !== f.lire;
      return h(
        "li",
        { class: ["ledger-row", f.id === opts.mine ? "is-mine" : "", i === 0 && f.lire > 0 ? "is-lead" : "", bump ? "is-bump" : ""].filter(Boolean).join(" ") },
        h("span", { class: "ledger-pos" }, roman(i + 1)),
        crest(f.id, f.colore, 46, true),
        h("span", { class: "ledger-name" }, f.nome, f.id === opts.mine ? h("span", { class: "ledger-mine" }, "tu famiglia") : null),
        h("span", { class: "ledger-leader", "aria-hidden": "true" }),
        h("span", { class: "ledger-amt" }, String(f.lire), h("span", { class: "ledger-unit" }, Math.abs(f.lire) === 1 ? "lira" : "lire")),
        h("span", { class: "ledger-bar", "aria-hidden": "true" }, h("i", { style: `--w:${Math.max(0, f.lire) / max}` })),
      );
    }),
  );
}

/** El mismo dado del acceso cerrado. Gira mientras la casa todavía no abre. */
export function die() {
  const cube = h(
    "div",
    { class: "die", "aria-hidden": "true" },
    h(
      "div",
      { class: "die-spin" },
      h(
        "div",
        { class: "die-cube" },
        ...["p1", "p2", "p3", "p4", "p5", "p6"].map((p) => h("span", { class: `face ${p}` })),
      ),
    ),
  );
  return h("div", { class: "die-slot" }, cube);
}

export function wantedPoster(t: { name: string; famiglia: string; scoperto: boolean }) {
  const fam = FAMIGLIE.find((f) => f.nome === t.famiglia);
  return h(
    "article",
    { class: "wanted" },
    corners("wanted-corners"),
    waxSeal(54, "N"),
    h("p", { class: "wanted-t" }, "Ricercato · Se busca"),
    h("img", { class: "wanted-rule", src: "/ornaments/rule-diamond.svg", alt: "" }),
    fotoDe(t.name)
      ? h("img", { class: "wanted-mug", src: fotoDe(t.name)!, alt: `Retrato de ${t.name}` })
      : fam
        ? crest(fam.id, fam.colore, 84, true)
        : null,
    h("p", { class: "wanted-who" }, t.name),
    h("p", { class: "wanted-fam" }, h("i", {}, "Famiglia "), t.famiglia),
    h("p", { class: "wanted-crime" }, "Robó el sello de la casa"),
    h(
      "p",
      { class: "wanted-reward" },
      h("span", { class: "wanted-five", "aria-hidden": "true" }, h("span", {}, t.scoperto ? "5" : "10")),
      h("span", {}, t.scoperto ? "5 lire" : "10 lire", h("small", {}, t.scoperto ? "Para la famiglia que lo acusó" : "Botín del traidor")),
    ),
    h("p", { class: "wanted-foot" }, t.scoperto ? "Descubierto en Il Processo." : "Nadie lo descubrió. Se llevó el botín."),
  );
}
