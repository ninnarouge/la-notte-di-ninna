import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rmdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getStore } from "@netlify/blobs";
import { GameError, initialState, type GameState } from "./game";

/**
 * Almacenamiento del estado del juego.
 * Producción: Netlify Blobs, consistencia fuerte y escritura condicional por ETag.
 * Desarrollo sin Blobs: un archivo local (.stanza-data/state.json).
 */
export interface StateStore {
  kind: "blobs" | "file";
  read(): Promise<{ state: GameState; etag: string | null }>;
  /** Escribe solo si el ETag sigue siendo el mismo. Devuelve false si alguien escribió antes. */
  write(state: GameState, etag: string | null): Promise<boolean>;
}

const KEY = "estado";
const NO_ETAG = "__sin-etag__";

/** Un cliente nuevo en cada lectura o escritura. El token de Blobs caduca; si se guarda el cliente, la partida deja de responder. */
function blobsClient() {
  return getStore({ name: "la-stanza", consistency: "strong" });
}

async function readBlobs(): Promise<{ state: GameState; etag: string | null }> {
  const store = blobsClient();
  const r = await store.getWithMetadata(KEY, { type: "json" });
  if (!r) return { state: initialState(), etag: null };
  if (r.etag) return { state: r.data as GameState, etag: r.etag };
  // El servidor local de `netlify dev` no entrega ETag al leer, pero sí al listar.
  // Se lista primero y se lee después: si alguien escribe entre medio, el ETag queda viejo
  // y la escritura condicional falla y se reintenta (nunca se pisa un cambio).
  const listed = await store.list({ prefix: KEY });
  const etag = listed.blobs.find((b) => b.key === KEY)?.etag;
  const data = (await store.get(KEY, { type: "json" })) as GameState | null;
  if (!data) return { state: initialState(), etag: null };
  return { state: data, etag: etag ?? NO_ETAG };
}

async function writeBlobs(state: GameState, etag: string | null): Promise<boolean> {
  const store = blobsClient();
  if (etag === NO_ETAG) return (await store.setJSON(KEY, state)).modified;
  const res = etag
    ? await store.setJSON(KEY, state, { onlyIfMatch: etag })
    : await store.setJSON(KEY, state, { onlyIfNew: true });
  return res.modified;
}

const tokenExpired = (err: unknown) => err instanceof Error && /token expired/i.test(err.message);

function blobsStore(): StateStore {
  return {
    kind: "blobs",
    async read() {
      try {
        return await readBlobs();
      } catch (err) {
        if (!tokenExpired(err)) throw err;
        return readBlobs();
      }
    },
    async write(state, etag) {
      try {
        return await writeBlobs(state, etag);
      } catch (err) {
        if (!tokenExpired(err)) throw err;
        return writeBlobs(state, etag);
      }
    },
  };
}

/** Candado entre procesos: mkdir es atómico. Se considera abandonado después de 10 s. */
async function withDirLock<T>(lockDir: string, fn: () => Promise<T>): Promise<T> {
  await mkdir(dirname(lockDir), { recursive: true });
  for (let i = 0; ; i++) {
    try {
      await mkdir(lockDir);
      break;
    } catch {
      try {
        const st = await stat(lockDir);
        if (Date.now() - st.mtimeMs > 10_000) await rmdir(lockDir).catch(() => undefined);
      } catch {
        /* ya no existe */
      }
      if (i > 400) throw new GameError(503, "La casa está muy concurrida. Intenta de nuevo.");
      await new Promise((r) => setTimeout(r, 5 + Math.random() * 20));
    }
  }
  try {
    return await fn();
  } finally {
    await rmdir(lockDir).catch(() => undefined);
  }
}

function fileStore(path: string): StateStore {
  const tag = (txt: string) => createHash("sha1").update(txt).digest("hex");
  const load = async () => {
    try {
      const txt = await readFile(path, "utf8");
      return { state: JSON.parse(txt) as GameState, etag: tag(txt) };
    } catch {
      return { state: initialState(), etag: null };
    }
  };
  return {
    kind: "file",
    read: load,
    write(state, etag) {
      return withDirLock(path + ".lock", async () => {
        const cur = await load();
        if (cur.etag !== etag) return false;
        const tmp = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
        await writeFile(tmp, JSON.stringify(state));
        await rename(tmp, path);
        return true;
      });
    },
  };
}

let cached: StateStore | null = null;

export async function openStore(): Promise<StateStore> {
  if (cached) return cached;
  const filePath = join(process.cwd(), ".stanza-data", "state.json");
  // En `netlify dev` se usa el archivo local: el simulador de Blobs no da ETag confiable para escrituras concurrentes.
  const dev = process.env.NETLIFY_DEV === "true" && process.env.STANZA_STORAGE !== "blobs";
  if (process.env.STANZA_STORAGE === "file" || dev) return (cached = fileStore(filePath));
  try {
    const s = blobsStore();
    await s.read();
    return (cached = s);
  } catch (err) {
    const prod = process.env.CONTEXT === "production" || process.env.STANZA_STORAGE === "blobs";
    if (prod) throw err;
    console.warn("[la-stanza] Netlify Blobs no está disponible; uso archivo local.", (err as Error).message);
    return (cached = fileStore(filePath));
  }
}

let queue: Promise<unknown> = Promise.resolve();

/** Lee, aplica `fn` y escribe con control de concurrencia. Serializa dentro de la instancia y reintenta si otra instancia escribió antes. */
export function updateState<T>(store: StateStore, fn: (s: GameState) => T): Promise<T> {
  const run = queue.then(() => updateOnce(store, fn));
  queue = run.catch(() => undefined);
  return run;
}

async function updateOnce<T>(store: StateStore, fn: (s: GameState) => T): Promise<T> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const { state, etag } = await store.read();
    const before = JSON.stringify(state);
    const result = fn(state);
    if (JSON.stringify(state) === before) return result;
    if (await store.write(state, etag)) return result;
    await new Promise((r) => setTimeout(r, 30 + Math.random() * 120 * (attempt + 1)));
  }
  throw new GameError(503, "La casa está muy concurrida. Intenta de nuevo.");
}

export { fileStore as _fileStoreForTests };
