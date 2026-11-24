/** Construcción de DOM sin innerHTML: todo texto entra como nodo de texto. */
type Child = Node | string | number | null | undefined | false;
type Props = Record<string, string | number | boolean | EventListener | undefined | null>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[] | Child[][]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v as EventListener);
    else if (k === "class") el.className = String(v);
    else if (k === "style") el.setAttribute("style", String(v));
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  append(el, children.flat() as Child[]);
  return el;
}

export function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
}

export function replace(el: Element, ...children: Child[]) {
  el.replaceChildren();
  append(el, children);
}

export type ApiError = Error & { status?: number; data?: Record<string, unknown> };

export async function api<T>(path: string, opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: { ...(opts.body ? { "content-type": "application/json" } : {}), ...(opts.headers ?? {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
    credentials: "same-origin",
    signal: AbortSignal.timeout(8000),
  });
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* respuesta vacía */
  }
  if (!res.ok) {
    const err = new Error(typeof data.error === "string" ? data.error : "No hubo respuesta de la casa.") as ApiError;
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

/** Repite `fn` cada `ms` mientras la pestaña esté visible. */
export function poll(fn: () => Promise<void>, ms: number) {
  let timer = 0;
  let running = false;
  const tick = async () => {
    window.clearTimeout(timer);
    if (document.hidden) return;
    if (!running) {
      running = true;
      try {
        await fn();
      } finally {
        running = false;
      }
    }
    timer = window.setTimeout(tick, ms);
  };
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void tick();
  });
  void tick();
  return () => void tick();
}

export const candelabro = () => {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 48 56");
  svg.setAttribute("class", "candelabro");
  svg.setAttribute("aria-hidden", "true");
  for (const [d, cls] of [
    ["M8 48h32M13 48v3.2h22V48M18 44h12", ""],
    ["M24 44V16", ""],
    ["M24 30H13v8M24 30h11v8", ""],
    ["M13 38V31M24 16V9M35 38V31", ""],
    ["M13 31c1.3-3.4 2.1-4.5 0-7-2.1 2.5-1.3 3.6 0 7z", "flame"],
    ["M24 9c1.3-3.4 2.1-4.5 0-7-2.1 2.5-1.3 3.6 0 7z", "flame"],
    ["M35 31c1.3-3.4 2.1-4.5 0-7-2.1 2.5-1.3 3.6 0 7z", "flame"],
  ]) {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", d);
    if (cls) p.setAttribute("class", cls);
    svg.appendChild(p);
  }
  return svg;
};

export const corners = () =>
  h("div", { class: "corners", "aria-hidden": "true" }, ...["tr", "tl", "br", "bl"].map((c) => h("img", { class: `c ${c}`, src: "/ornaments/corner.svg", alt: "" })));
