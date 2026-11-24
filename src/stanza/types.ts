export type Famiglia = { id: string; nome: string; colore: string; accento: string; lire: number; membri: number };
export type Capitolo = { id: string; numero: string; titolo: string; open: boolean; testo: string | null; risposta: boolean; alfabeto: boolean; pista: string | null; pistaAt: number | null; risolto: string[] };
export type Traditore = { name: string; famiglia: string; colore: string; lire: number; scoperto: boolean };
export type Doors = { lettera: boolean; stanza: boolean; letteraAt: string; stanzaAt: string };
export type PublicState = {
  now: number;
  doors: Doors;
  famiglie: Famiglia[];
  invitati: number;
  capitoli: Capitolo[];
  active: string | null;
  vote: { status: "chiusa" | "aperta" | "risolta"; votanti: number; result: null | { famiglie: { famiglia: string; accusato: string | null; acierto: boolean }[] } };
  traditori: Traditore[] | null;
};
export type Yo = {
  id: string;
  name: string;
  famiglia: string;
  mezza: string;
  mezzaPos: "inizio" | "fine";
  traditore: boolean;
  lire?: number;
  missioni: { id: string; titolo: string; testo: string; fatta: boolean }[];
  rivelazioni: { id: string; titolo: string; testo: string }[];
  voto: string | null;
  candidati: { id: string; name: string }[];
};
export type GuestState = PublicState & { yo: Yo | null; tokenInvalido: boolean };
