import type { Config, Context } from "@netlify/functions";
import { madrinaAuthorized } from "../lib/auth";
import {
  GameError,
  answer,
  castVote,
  doors,
  guestByToken,
  guestView,
  madrinaAction,
  madrinaView,
  prologue,
  publicView,
  register,
} from "../lib/game";
import { CHAPTERS } from "../lib/historia";
import { rateCheck } from "../lib/ratelimit";
import { openStore, updateState } from "../lib/storage";
import { splitPieces } from "../lib/pezzi";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extra } });

/** Intentos fallidos de clave de la Madrina por IP (por instancia; la clave larga es la defensa principal). */
const madrinaFails = new Map<string, number[]>();

async function body(req: Request): Promise<Record<string, unknown>> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) throw new GameError(415, "Se esperaba JSON.");
  const text = await req.text();
  if (text.length > 4000) throw new GameError(413, "Mensaje demasiado largo.");
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error();
    return v as Record<string, unknown>;
  } catch {
    throw new GameError(400, "JSON inválido.");
  }
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

const bearerToken = (req: Request) => {
  const h = req.headers.get("x-stanza-token");
  return h && h.length <= 100 ? h : null;
};

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  const method = req.method.toUpperCase();
  try {
    if (method === "POST" && !sameOrigin(req)) throw new GameError(423, "Origen no permitido.");
    const store = await openStore();

    if (route === "porta" && method === "GET") {
      const { state } = await store.read();
      const now = Date.now();
      return json({ now, ...doors(state, now), lettera: prologue(state, now) });
    }

    if (route === "estado" && method === "GET") {
      const { state } = await store.read();
      const token = bearerToken(req);
      const g = token ? guestByToken(state, token) : undefined;
      return json({ ...publicView(state), yo: g ? guestView(state, g) : null, tokenInvalido: !!token && !g });
    }

    if (route === "giuramento" && method === "POST") {
      const b = await body(req);
      const r = await updateState(store, (s) => {
        const { token, guest } = register(s, b.nome);
        return { token, yo: guestView(s, guest) };
      });
      return json(r, 201);
    }

    if (route === "risposta" && method === "POST") {
      const b = await body(req);
      const token = bearerToken(req);
      const r = await updateState(store, (s) => answer(s, token, b.capitolo, b.risposta));
      return json(r);
    }

    if (route === "voto" && method === "POST") {
      const b = await body(req);
      const token = bearerToken(req);
      return json(await updateState(store, (s) => castVote(s, token, b.accusato)));
    }

    if (route.startsWith("madrina")) {
      const ip = context.ip || "?";
      const now = Date.now();
      const rl = rateCheck(madrinaFails.get(ip), now, 8, 10 * 60_000);
      if (!rl.ok) throw new GameError(429, `Demasiados intentos. Espera ${rl.retryAfterSec} segundos.`);
      const key = process.env.MADRINA_KEY;
      if (!key || key.length < 8) throw new GameError(503, "Falta configurar MADRINA_KEY en Netlify.");
      if (!madrinaAuthorized(req.headers.get("authorization"), key)) {
        madrinaFails.set(ip, rl.next);
        throw new GameError(401, "Clave incorrecta.");
      }
      if (route === "madrina" && method === "GET") {
        const { state } = await store.read();
        return json({
          ...madrinaView(state),
          storage: store.kind,
          pezzi: splitPieces(state.finalMessage, 6),
          capitoliAll: CHAPTERS.map((c) => ({ id: c.id, numero: c.numero, titolo: c.titolo })),
        });
      }
      if (route === "madrina" && method === "POST") {
        const b = await body(req);
        await updateState(store, (s) => madrinaAction(s, b));
        return json({ ok: true });
      }
    }

    return json({ error: "No encontrado." }, 404);
  } catch (err) {
    if (err instanceof GameError) {
      const extra: Record<string, string> = err.status === 429 && err.extra.retryAfter ? { "retry-after": String(err.extra.retryAfter) } : {};
      return json({ error: err.message, ...err.extra }, err.status, extra);
    }
    console.error("[la-stanza]", err);
    return json({ error: "Algo falló en la casa. Intenta de nuevo." }, 500);
  }
};

export const config: Config = { path: "/api/*" };
