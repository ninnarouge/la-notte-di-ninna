/** Reparte las palabras del mensaje en `n` piezas lo más parejas posible (en mayúsculas, sin signos). */
export function splitPieces(message: string, n = 6): string[] {
  const words = message
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const pieces: string[] = [];
  let start = 0;
  for (let p = 0; p < n; p++) {
    const take = Math.round(((p + 1) * words.length) / n) - start;
    pieces.push(words.slice(start, start + take).join(" "));
    start += take;
  }
  return pieces;
}
