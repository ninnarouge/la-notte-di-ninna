import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();

/** Compara en tiempo constante (se comparan los SHA-256, así el largo no filtra). */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

export function madrinaAuthorized(header: string | null, key: string | undefined): boolean {
  if (!key || key.length < 8 || !header) return false;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) return false;
  return safeEqual(m[1], key);
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update("token|" + token).digest("hex");
}

export function newId(): string {
  return randomBytes(6).toString("base64url");
}
