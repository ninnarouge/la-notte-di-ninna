/**
 * Il Sigillo Rubato. Contenido del juego que vive solo en el servidor.
 * Las respuestas aceptadas están aquí en su forma normalizada (ver normalize.ts) para poder
 * aceptar errores de tipeo. Este archivo nunca se envía al navegador: solo lo importan
 * netlify/lib y scripts/ (un test lo verifica).
 */
import type { FamigliaId } from "../../shared/famiglie";

/** La frase que se reparte en seis piezas, escritas en espejo. Editable desde el panel (si cambia, hay que reimprimir). */
export const DEFAULT_FINAL_MESSAGE = "El sello duerme bajo la pantalla, en el despacho de la Donna";

/** Si la frase es la de siempre, también vale la idea esencial: una palabra de cada grupo. */
export const MESSAGE_KEYWORDS: string[][] = [
  ["pantalla", "monitor", "computador", "computadora"],
  ["despacho", "oficina", "escritorio"],
];

/** Minutos que espera la pista automática desde que se abre un capítulo. */
export const HINT_AFTER_MS = 10 * 60_000;

export const PROLOGO = {
  titulo: "Una carta de Donna Ninna",
  cuerpo: [
    "Anoche alguien robó el sello de la casa.",
    "Esa persona viene a mi fiesta. Va a brindar contigo y a sonreír.",
    "A las 21:00 se abre La Stanza. Ahí cada uno recibe una famiglia.",
    "Juntos tienen que encontrar el sello. Y cuidado con quien tienen al lado.",
  ],
  firma: "— Donna Ninna",
};

export const PASSWORDS: Record<FamigliaId, [string, string]> = {
  lupo: ["luna", "nera"],
  vipera: ["vino", "dolce"],
  "rosa-nera": ["rosa", "rossa"],
  falco: ["oro", "vivo"],
  scorpione: ["fuoco", "lento"],
};

/** Los tres escondites, en orden. Cada uno lo revela un capítulo. */
export const ESCONDITI = [
  { n: "I", lugar: "el mueble de la biblioteca", capitolo: "codice" },
  { n: "II", lugar: "los juegos de mesa", capitolo: "prezzo" },
  { n: "III", lugar: "las suculentas del patio", capitolo: "cifra" },
] as const;

export const STRIP_NUMBERS = "18 · 15 · 19 · 19 · 15";

export type ChapterId = "giuramento" | "codice" | "prezzo" | "cifra" | "chiave" | "messaggio" | "brindisi" | "processo";

export type RiddleKind = "none" | "answer" | "password" | "message";

export type Chapter = {
  id: ChapterId;
  numero: string;
  titolo: string;
  testo: string;
  kind: RiddleKind;
  /** Respuestas aceptadas (solo servidor). Se comparan normalizadas y con tolerancia a errores. */
  answers?: string[];
  points?: number[];
  rivela?: string;
  /** Pista que aparece sola si nadie lo resuelve en HINT_AFTER_MS. */
  pista?: string;
  /** Muestra el abecedario con números en la página. */
  alfabeto?: boolean;
};

export const CHAPTERS: Chapter[] = [
  {
    id: "giuramento",
    numero: "I",
    titolo: "Il Giuramento",
    testo:
      "Tu teléfono te dio media contraseña. La otra mitad la tiene alguien de tu famiglia. Búsquense por la casa, en voz baja. Cuando se encuentren, escriban las dos palabras aquí abajo.",
    kind: "password",
    points: [5, 1],
    pista: "Pregunten «¿cuál es tu palabra?». Si suena italiano y combina con la tuya, es de tu famiglia.",
    rivela: "Juramento sellado. Desde ahora juegan juntos.",
  },
  {
    id: "codice",
    numero: "II",
    titolo: "Il Codice del Traditore",
    testo:
      "En la caja vacía del sello había una palabra rayada: WUDLGRU. El ladrón corrió cada letra 3 lugares hacia adelante. Usen el abecedario de abajo y retrocedan 3 letras. Escriban la palabra aquí abajo.",
    kind: "answer",
    answers: ["traidor", "traditore", "traidora"],
    points: [5, 1],
    alfabeto: true,
    pista: "Retrocedan 3 letras: W es T, U es R, D es A. Sigan con las demás.",
    rivela:
      "Era TRAIDOR. El mensaje que dice dónde está el sello se rompió en 6 piezas. Están en 3 escondites de la casa, en sobres con el escudo de cada famiglia. Ninguna famiglia tiene las 6: tendrán que cambiar piezas con las otras. Primer escondite: el mueble de la biblioteca. Tomen solo el sobre de su famiglia.",
  },
  {
    id: "prezzo",
    numero: "III",
    titolo: "Il Prezzo della Fedeltà",
    testo:
      "Donna Ninna tiene una película favorita. Es italiana y pasa en un pueblo de Sicilia: un niño, un proyeccionista y un cine. ¿Cómo se llama? Escriban el título aquí abajo.",
    kind: "answer",
    answers: ["cinema paradiso", "paradiso", "nuovo cinema paradiso", "cinema paraiso", "nuevo cinema paraiso"],
    points: [5, 1],
    pista: "Es italiana, ganó el Oscar y trata de un niño y un proyeccionista. El título termina en «Paradiso».",
    rivela:
      "¡Felicidades! Encontraron la película favorita de Donna Ninna: Cinema Paradiso. Segundo escondite: entre los juegos de mesa. Su sobre trae otra pieza y una fila de números. Guárdenla: la van a necesitar.",
  },
  {
    id: "cifra",
    numero: "IV",
    titolo: "La Cifra di Sangue",
    testo:
      "En el sobre de los juegos de mesa hay 5 números: 18 · 15 · 19 · 19 · 15. Cada número es una letra: A es 1, B es 2, C es 3. Usen el abecedario del sobre. Sale el color de la casa, en italiano. Escríbanlo aquí abajo.",
    kind: "answer",
    answers: ["rosso", "rojo", "roso", "roja"],
    points: [5, 1],
    alfabeto: true,
    pista: "18 es R y 15 es O. Ya tienen R, O… sigan.",
    rivela: "Tercer escondite: entre las suculentas del patio. Ahí está su última pieza.",
  },
  {
    id: "chiave",
    numero: "V",
    titolo: "La Chiave",
    testo:
      "Para leer las piezas falta un secreto. La casa se lo da a quien sepa qué banda suena en casa de Donna Ninna. Es rock duro y viene de Plasencia, España. Escriban el nombre aquí abajo.",
    kind: "answer",
    answers: ["extremoduro", "extremo duro", "extremo"],
    points: [5, 1],
    pista: "El nombre empieza con «Extremo».",
    rivela:
      "¡Felicidades! Encontraron la banda favorita de Donna Ninna: Extremoduro. Y ahora, el secreto: las piezas están escritas al revés, como en un espejo. Pónganlas frente a un espejo o mírenlas con la cámara frontal del teléfono. El número de cada pieza es su orden: de la 1 a la 6.",
  },
  {
    id: "messaggio",
    numero: "VI",
    titolo: "Il Messaggio",
    testo:
      "Junten las 6 piezas. Si les falta alguna, cámbienla con otra famiglia. Ordénenlas de la 1 a la 6 y léanlas en un espejo. Escriban la frase completa aquí abajo. Un error chico no importa.",
    kind: "message",
    points: [5, 1],
    pista: "La frase empieza con «El sello duerme…» y dice en qué parte de la casa está.",
  },
  {
    id: "brindisi",
    numero: "VII",
    titolo: "L'Ultimo Brindisi",
    testo:
      "Última pregunta de la noche. Donna Ninna tiene una canción favorita de Extremoduro. ¿Cuál es? Escriban el nombre aquí abajo. Solo la primera famiglia gana.",
    kind: "answer",
    answers: ["segundo movimiento", "segundo", "2 movimiento", "2do movimiento", "segundo movimiento lo de dentro"],
    points: [5, 0],
    pista: "El nombre empieza con «Segundo…».",
    rivela: "¡Felicidades! Encontraron la canción favorita de Donna Ninna: Segundo movimiento, de Extremoduro. Brindis concedido: Donna Ninna levanta su copa por ustedes.",
  },
  {
    id: "processo",
    numero: "Epílogo",
    titolo: "Il Processo",
    testo:
      "¿Quién robó el sello? Cada uno vota en secreto por una sola persona, aquí abajo. Si la mayoría de tu famiglia acierta, tu famiglia gana 5 lire. Si nadie descubre al traidor, el traidor gana 10.",
    kind: "none",
  },
];

export function chapter(id: string): Chapter | undefined {
  return CHAPTERS.find((c) => c.id === id);
}

export const MISSIONS = [
  {
    id: "falso",
    titolo: "Il Falso Indizio",
    testo: "Deja un sobre falso en un escondite sin que te vean. Después avísale a Donna Ninna.",
  },
  {
    id: "voce",
    titolo: "La Voce Sbagliata",
    testo: "Haz que tu famiglia envíe una respuesta equivocada en La Stanza.",
  },
  {
    id: "brindisi",
    titolo: "Il Brindisi Mancino",
    testo: "Brinda con 3 personas de otras famiglie usando la mano izquierda. No les digas por qué.",
  },
  {
    id: "sussurro",
    titolo: "Il Sussurro",
    testo: "Consigue que alguien de otra famiglia te diga su media contraseña. Después díselo a Donna Ninna al oído.",
  },
  {
    id: "sospetto",
    titolo: "Il Sospetto",
    testo: "Haz que alguien acuse en voz alta a otra persona de ser el traidor.",
  },
] as const;

export type MissionId = (typeof MISSIONS)[number]["id"];

export const POINTS = {
  /** Lire para la famiglia cuya mayoría acusa a un traidor. */
  accusa: 5,
  /** Lire para cada traidor que nadie descubre. */
  fuga: 10,
  /** Lire para el traidor por misión cumplida. */
  missione: 3,
};

export const RATE = { limit: 5, windowMs: 60_000 };
