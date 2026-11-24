export type RateResult = { ok: boolean; retryAfterSec: number; next: number[] };

/** Ventana deslizante: como máximo `limit` intentos en `windowMs`. */
export function rateCheck(previous: number[] | undefined, now: number, limit: number, windowMs: number): RateResult {
  const recent = (previous ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    const oldest = Math.min(...recent);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)), next: recent };
  }
  return { ok: true, retryAfterSec: 0, next: [...recent, now] };
}
