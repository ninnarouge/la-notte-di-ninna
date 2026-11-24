import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as wait } from "node:timers/promises";

const PORT = 9334;
const BASE = "http://127.0.0.1:47231/";
const OUT = "/opt/cursor/artifacts";
mkdirSync(OUT, { recursive: true });

const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--user-data-dir=/tmp/chrome-notte-capture",
    `--remote-debugging-port=${PORT}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

async function waitDebug() {
  for (let i = 0; i < 50; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (response.ok) return;
    } catch {
      /* retry */
    }
    await wait(200);
  }
  throw new Error("Chrome no abrió el puerto de depuración");
}

await waitDebug();

const created = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE)}`, {
  method: "PUT",
});
let target;
if (created.ok) {
  target = await created.json();
} else {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  target = list.find((item) => item.type === "page");
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

let seq = 0;
const pending = new Map();
const listeners = [];
ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const job = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) job.reject(new Error(JSON.stringify(message.error)));
    else job.resolve(message.result);
  } else if (message.method) {
    for (const listener of listeners) listener(message);
  }
});

function send(method, params = {}) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function waitLoad() {
  return new Promise((resolve) => {
    const listener = (message) => {
      if (message.method !== "Page.loadEventFired") return;
      listeners.splice(listeners.indexOf(listener), 1);
      resolve();
    };
    listeners.push(listener);
  });
}

await send("Page.enable");
await send("Runtime.enable");

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails));
  }
  return result.result.value;
}

async function go(width, height, mobile, scale) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: scale,
    mobile,
  });
  const loaded = waitLoad();
  await send("Page.navigate", { url: BASE });
  await loaded;
  await evaluate("document.fonts.ready");
  await wait(250);
}

async function shot(file, extra = {}) {
  const result = await send("Page.captureScreenshot", { format: "png", ...extra });
  writeFileSync(file, Buffer.from(result.data, "base64"));
  console.log("wrote", file);
}

const failures = [];

async function revealAll() {
  const height = await evaluate("document.documentElement.scrollHeight");
  for (let y = 0; y <= height; y += 650) {
    await evaluate(`window.scrollTo(0, ${y})`);
    await wait(160);
  }
  await evaluate(`Promise.all([...document.images].filter((img) => img.src).map((img) => img.decode().catch(() => {})))`);
  await evaluate("window.scrollTo(0, 0)");
  await wait(300);
}

await go(390, 844, true, 2);
await evaluate("document.querySelector('#abrir').click()");
await wait(900);
await revealAll();
const mobile = await evaluate(
  `({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, open: document.querySelector('#apertura').classList.contains('is-open'), title: document.querySelector('#titulo').innerText})`,
);
console.log("mobile", mobile);
if (mobile.sw > mobile.cw + 1) failures.push(`overflow móvil ${mobile.sw}>${mobile.cw}`);
if (!mobile.open) failures.push("el sello no se abrió");
await shot(`${OUT}/mobile-apertura.png`);

const finalBox = await evaluate(`(() => {
  const el = document.querySelector('#escena-final');
  const r = el.getBoundingClientRect();
  return { y: r.top + window.scrollY, h: r.height, w: r.width };
})()`);
console.log("final", finalBox);
await shot(`${OUT}/mobile-escena-final.png`, {
  captureBeyondViewport: true,
  clip: { x: 0, y: finalBox.y, width: 390, height: Math.ceil(finalBox.h), scale: 2 },
});

const rsvp = await evaluate(`(() => {
  const before = location.href;
  document.querySelector('#rsvp').click();
  const notice = document.getElementById('rsvp-notice');
  return {
    stayed: location.href === before,
    focused: document.activeElement === notice,
    text: notice.textContent.replace(/\\s+/g, ' ').trim(),
  };
})()`);
console.log("rsvp", rsvp);
if (!rsvp.stayed) failures.push("el RSVP navegó");
if (!rsvp.text.includes("no está configurado")) failures.push("falta el aviso");

await go(1440, 900, false, 1);
await evaluate(`document.querySelector('#abrir').click()`);
await wait(500);
await revealAll();
const desk = await evaluate(
  `({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, h: document.documentElement.scrollHeight})`,
);
console.log("desktop", desk);
if (desk.sw > desk.cw + 1) failures.push(`overflow escritorio ${desk.sw}>${desk.cw}`);
await shot(`${OUT}/desktop-full.png`, {
  captureBeyondViewport: true,
  clip: { x: 0, y: 0, width: 1440, height: Math.ceil(desk.h), scale: 1 },
});

await evaluate(`document.querySelector('#transicion').scrollIntoView({block:'center'})`);
await wait(4500);
const video = await evaluate(`(() => {
  const v = document.querySelector('#escena-video');
  const stage = document.querySelector('#escenario');
  return {
    muted: v.muted,
    volume: v.volume,
    loop: v.loop,
    controls: v.controls,
    hasSrc: v.currentSrc.length > 0,
    t: Number(v.currentTime.toFixed(2)),
    dissolved: stage.classList.contains('is-dissolved'),
  };
})()`);
console.log("video", video);
if (!video.muted || video.volume !== 0 || video.loop || video.controls) {
  failures.push(`video inseguro ${JSON.stringify(video)}`);
}
if (!video.dissolved) failures.push("el plano no se disolvió en la foto");

ws.close();
chrome.kill("SIGKILL");
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("captura ok");
