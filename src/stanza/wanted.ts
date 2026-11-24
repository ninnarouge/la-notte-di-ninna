import { h } from "./dom";

export function wantedPoster(t: { name: string; famiglia: string; scoperto: boolean }) {
  return h(
    "article",
    { class: "wanted" },
    h("p", { class: "t" }, "RICERCATO · SE BUSCA"),
    h("p", { class: "who" }, t.name),
    h("p", { class: "fam" }, `Famiglia ${t.famiglia} · traición a la famiglia`),
    h("p", { class: "reward" }, "5 LIRE", h("small", {}, "RECOMPENSA")),
    h("p", { class: "foot" }, t.scoperto ? "Descubierto en Il Processo." : "Nadie lo descubrió. Se llevó el botín."),
  );
}

