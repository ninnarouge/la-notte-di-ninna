import "../styles.css";
import "./stanza.css";
import "./admin.css";
import { api, h, poll, replace } from "./dom";
import type { PublicState } from "./types";
import { crest, lire, roman, wantedPoster, brandLogo } from "./ui";

const app = document.querySelector<HTMLElement>("#app")!;
let last = new Map<string, number>();
let sig = "";
let arrived = false;

async function refresh() {
  let s: PublicState;
  try {
    s = await api<PublicState>("estado");
  } catch {
    const note = app.querySelector(".screen-boot-text");
    if (note) note.textContent = "La casa no responde. Reintentando…";
    return;
  }
  const now = JSON.stringify({ ...s, now: 0 });
  if (now === sig) return;
  sig = now;
  const sorted = [...s.famiglie].sort((a, b) => b.lire - a.lire || a.nome.localeCompare(b.nome, "es"));
  const max = Math.max(10, ...sorted.map((f) => f.lire));
  const active = s.capitoli.find((c) => c.id === s.active);
  const head = h(
    "header",
    { class: "screen-mast" },
    brandLogo(),
    h("h1", { lang: "it" }, s.traditori?.length ? "Il Processo" : "Il Sigillo Rubato"),
    h("p", { class: "script" }, active ? `En curso · ${active.numero} · ${active.titolo}` : "Le famiglie attendono"),
    h("img", { class: "screen-rule", src: "/ornaments/rule-diamond.svg", alt: "" }),
  );
  const leader = sorted[0];
  const live = h("p", { class: "sr-only", "aria-live": "polite" }, leader ? `${leader.nome}, ${lire(leader.lire)}` : "");
  const top = leader?.lire ?? 0;
  let middle: Node;
  if (s.traditori?.length) {
    middle = h(
      "section",
      { class: "reveal-stage" },
      h("p", { class: "status" }, s.traditori.length > 1 ? "I traditori sono stati smascherati." : "Il traditore è stato smascherato."),
      h(
        "div",
        { class: "wanted-row" },
        ...s.traditori.map((t, i) => {
          const poster = wantedPoster(t);
          poster.style.setProperty("--i", String(i));
          return poster;
        }),
      ),
      h(
        "ol",
        { class: "podium" },
        ...sorted.slice(0, 3).map((f, i) =>
          h(
            "li",
            { class: i === 0 ? "lead" : "", style: `--i:${i}` },
            h("span", { class: "pos" }, roman(i + 1)),
            crest(f.id, f.colore, 44, true),
            h("span", { class: "nm" }, f.nome),
            h("span", { class: "lr" }, lire(f.lire)),
          ),
        ),
      ),
    );
  } else {
    middle = h(
      "ol",
      { class: "race", "aria-label": "Lire por famiglia" },
      ...sorted.map((f, i) => {
        const bump = last.has(f.id) && last.get(f.id) !== f.lire;
        const lead = f.lire === top && top > 0;
        return h(
          "li",
          {
            class: [lead ? "lead" : "", bump ? "bump" : ""].filter(Boolean).join(" "),
            style: `--i:${i};--w:${Math.max(0, f.lire) / max}`,
          },
          h("span", { class: "pos" }, roman(i + 1)),
          h(
            "div",
            { class: "lift" },
            crest(f.id, f.colore, 140, true),
            h("span", { class: "fill", "aria-hidden": "true" }),
          ),
          h("span", { class: "nm" }, f.nome),
          h("span", { class: "lr" }, h("b", {}, String(f.lire)), h("small", {}, f.lire === 1 ? "lira" : "lire")),
        );
      }),
    );
  }
  last = new Map(s.famiglie.map((f) => [f.id, f.lire]));
  const status =
    s.vote.status === "aperta"
      ? `Il Processo está abierto · ${s.vote.votanti} de ${s.invitati} votos · vota desde tu teléfono`
      : `${s.invitati} ${s.invitati === 1 ? "persona ha jurado" : "personas han jurado"} · juega desde tu teléfono${location.hostname === "localhost" || location.hostname === "127.0.0.1" ? "" : ` · ${location.host}`}`;
  const first = !arrived;
  arrived = true;
  replace(
    app,
    h(
      "div",
      { class: ["screen", s.traditori?.length ? "reveal-screen" : "", first ? "arrive" : ""].filter(Boolean).join(" ") },
      head,
      middle,
      live,
      h("p", { class: "status" }, s.traditori?.length ? "Donna Ninna recupera su sello." : status),
    ),
  );
}

poll(refresh, 4000);
