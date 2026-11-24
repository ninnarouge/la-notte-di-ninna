const ARTICLES = /^(?:(?:el|la|los|las|il|lo|un|una)\s+)+/;

/** Minúsculas, sin tildes, sin signos, espacios simples y sin artículo inicial. */
export function normalizeAnswer(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(ARTICLES, "")
    .trim();
}

/** Forma compacta: la normalizada, sin espacios. */
export function compactAnswer(input: string): string {
  return normalizeAnswer(input).replace(/\s+/g, "");
}

/** Solo letras A–Z, para comparar mensajes descifrados. */
export function lettersOnly(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toUpperCase()
    .replace(/[^A-Z]+/g, "");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Errores permitidos según el largo de la respuesta correcta (sin espacios). */
export function tolerance(len: number): number {
  if (len <= 4) return 0;
  if (len <= 7) return 1;
  return 2;
}

/** ¿Se parece la respuesta a alguna variante aceptada? Ignora tildes, mayúsculas, signos, espacios y artículos. */
export function fuzzyMatch(input: string, variants: readonly string[]): boolean {
  const got = compactAnswer(input);
  if (!got) return false;
  return variants.some((v) => {
    const want = compactAnswer(v);
    return got === want || (Math.abs(got.length - want.length) <= 2 && levenshtein(got, want) <= tolerance(want.length));
  });
}

/**
 * Mensaje final: vale si las letras calzan con pocos errores (hasta el 10 %, mínimo 3),
 * o si contiene la idea esencial: una palabra de cada grupo de `keywords` (con tolerancia).
 */
export function messageMatches(input: string, message: string, keywords: string[][] = []): boolean {
  const want = lettersOnly(message);
  const got = lettersOnly(input);
  if (!want || !got) return false;
  if (Math.abs(got.length - want.length) <= Math.max(3, Math.ceil(want.length * 0.1)) && levenshtein(got, want) <= Math.max(3, Math.ceil(want.length * 0.1)))
    return true;
  if (!keywords.length) return false;
  const words = normalizeAnswer(input).split(" ").filter(Boolean);
  return keywords.every((group) => group.some((k) => words.some((w) => fuzzyMatch(w, [k]))));
}
