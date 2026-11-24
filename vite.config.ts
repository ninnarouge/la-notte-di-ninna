import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { defineConfig, loadEnv, type ViteDevServer } from "vite";

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolveBody(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** En `npm run dev` atiende /api con el mismo handler de Netlify y el archivo local. */
function stanzaDevApi() {
  return {
    name: "stanza-dev-api",
    configureServer(server: ViteDevServer) {
      const env = loadEnv(server.config.mode, server.config.root, "");
      if (!process.env.MADRINA_KEY && env.MADRINA_KEY) process.env.MADRINA_KEY = env.MADRINA_KEY;
      process.env.STANZA_STORAGE ??= "file";
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
        const url = req.url ?? "";
        if (!url.startsWith("/api/")) return next();
        try {
          const mod = (await server.ssrLoadModule("/netlify/functions/api.ts")) as {
            default: (request: Request, ctx: { ip: string }) => Promise<Response>;
          };
          const host = req.headers.host ?? "127.0.0.1:47231";
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (value == null || key === "content-length") continue;
            if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
            else headers.set(key, value);
          }
          const method = (req.method ?? "GET").toUpperCase();
          const hasBody = method !== "GET" && method !== "HEAD";
          const request = new Request(`http://${host}${url}`, {
            method,
            headers,
            body: hasBody ? new Uint8Array(await readBody(req)) : undefined,
          });
          const response = await mod.default(request, { ip: req.socket.remoteAddress ?? "127.0.0.1" });
          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            if (key === "content-encoding") return;
            res.setHeader(key, value);
          });
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          server.config.logger.error(`[la-stanza] ${err instanceof Error ? err.message : String(err)}`);
          if (!res.headersSent) res.statusCode = 500;
          res.end(JSON.stringify({ error: "Algo falló en la casa. Intenta de nuevo." }));
        }
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [stanzaDevApi()],
  server: { host: "127.0.0.1", port: 47231, strictPort: true },
  preview: { host: "127.0.0.1", port: 47231, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        invitacion: resolve(__dirname, "invitacion/index.html"),
        stanza: resolve(__dirname, "stanza/index.html"),
        madrina: resolve(__dirname, "stanza/madrina/index.html"),
        pantalla: resolve(__dirname, "stanza/pantalla/index.html"),
      },
    },
  },
});
