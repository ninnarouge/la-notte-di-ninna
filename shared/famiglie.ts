/** Datos públicos de las cinco famiglie de los afiches «Se busca». */
export const FAMIGLIE = [
  { id: "lupo", nome: "Lupo", colore: "#3a2a22", accento: "#b89a7c", motto: "Il branco non dimentica." },
  { id: "vipera", nome: "Vipera", colore: "#2f5e40", accento: "#7fb08a", motto: "Il veleno è pazienza." },
  { id: "rosa-nera", nome: "Rosa Nera", colore: "#6d2b31", accento: "#c9737b", motto: "Ogni spina ha un nome." },
  { id: "falco", nome: "Falco", colore: "#9c7a3f", accento: "#e0c792", motto: "Vediamo tutto dall'alto." },
  { id: "scorpione", nome: "Scorpione", colore: "#9e2b25", accento: "#e2675d", motto: "La coda arriva sempre." },
] as const;

export type FamigliaId = (typeof FAMIGLIE)[number]["id"];

export const FAMIGLIA_IDS: FamigliaId[] = FAMIGLIE.map((f) => f.id);

export function isFamigliaId(v: unknown): v is FamigliaId {
  return typeof v === "string" && (FAMIGLIA_IDS as string[]).includes(v);
}

export function famiglia(id: FamigliaId) {
  return FAMIGLIE.find((f) => f.id === id)!;
}

/** Horas de apertura, resueltas en el servidor. America/Santiago, UTC−3. */
export const LETTERA_AT = "2026-11-21T12:00:00-03:00";
export const STANZA_AT = "2026-11-21T21:00:00-03:00";

export const NAME_MAX = 24;
