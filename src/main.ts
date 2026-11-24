import "./styles.css";
import { siteConfig, rsvpHrefFor } from "./config";

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const apertura = document.querySelector<HTMLElement>("#apertura");
const openBtn = document.querySelector<HTMLButtonElement>("#abrir");
const titulo = document.querySelector<HTMLElement>("#titulo");

const stage = document.querySelector<HTMLElement>("#escenario");
const video = document.querySelector<HTMLVideoElement>("#escena-video");
const playBtn = document.querySelector<HTMLButtonElement>("#reproducir-escena");
const skipBtn = document.querySelector<HTMLButtonElement>("#saltar-escena");
const replayBtn = document.querySelector<HTMLButtonElement>("#repetir-escena");
const againBtn = document.querySelector<HTMLButtonElement>("#volver-escena");
const desliza = document.querySelector<HTMLAnchorElement>(".desliza");
const status = document.querySelector<HTMLElement>("#estado-escena");
const bar = document.querySelector<HTMLElement>("#progreso");
const music = document.querySelector<HTMLAudioElement>("#musica");
const audioBar = document.querySelector<HTMLElement>("#audio-bar");
const audioToggle = document.querySelector<HTMLButtonElement>("#audio-toggle");
const audioLine = document.querySelector<HTMLElement>("#audio-line");
const audioProgress = document.querySelector<HTMLElement>("#audio-progress");

let armed = false;
let dissolved = false;
let advanceTimer = 0;
let userPaused = false;

function arm() {
  if (!video || armed) return;
  armed = true;
  video.preload = "auto";
  video.muted = true;
  video.defaultMuted = true;
  video.volume = 0;
  video.loop = false;
  video.controls = false;
  video.playsInline = true;
  video.src = siteConfig.media.video;
}

function openInvite() {
  if (!apertura || apertura.classList.contains("is-open")) return;
  apertura.classList.add("is-open");
  document.documentElement.classList.add("is-open");
  openBtn?.setAttribute("aria-expanded", "true");
  apertura.inert = true;
  window.setTimeout(() => {
    if (dissolved || document.documentElement.classList.contains("is-advanced")) return;
    if (!reduce) playOnce();
  }, reduce ? 0 : 1100);
  window.setTimeout(() => {
    if (!document.documentElement.classList.contains("is-advanced")) {
      titulo?.focus({ preventScroll: true });
    }
  }, reduce ? 0 : 420);
  if (!import.meta.env.DEV && music?.paused && !userPaused) void startMusic();
}

function showStill() {
  if (!stage || dissolved) return;
  dissolved = true;
  stage.classList.remove("is-playing");
  video?.pause();
  if (replayBtn) replayBtn.hidden = false;
  if (playBtn) playBtn.hidden = true;
  stage.classList.add("is-dissolved");
  if (status) status.textContent = "La escena terminó.";
  window.clearTimeout(advanceTimer);
  advanceTimer = window.setTimeout(advanceNarrative, reduce ? 200 : 3800);
}

function advanceNarrative() {
  if (document.documentElement.classList.contains("is-advanced")) return;
  window.scrollTo(0, 0);
  document.documentElement.classList.add("is-advanced");
}

function playOnce() {
  if (!video) return;
  window.clearTimeout(advanceTimer);
  arm();
  dissolved = false;
  stage?.classList.remove("is-dissolved");
  video.muted = true;
  video.volume = 0;
  video.loop = false;

  const start = () => {
    if (!video || dissolved) return;
    try {
      video.currentTime = 0;
    } catch {
      /* El navegador aún no tiene la duración. */
    }
    const pending = video.play();
    if (status) status.textContent = "La escena avanza.";
    pending
      ?.then(() => {
        if (playBtn && !reduce) playBtn.hidden = true;
      })
      .catch((error: unknown) => {
        const name = error instanceof DOMException ? error.name : "";
        if (name === "AbortError") return;
        if (playBtn) playBtn.hidden = false;
      });
  };

  if (video.readyState >= 1) start();
  else video.addEventListener("loadedmetadata", start, { once: true });
}

function replayFromStart() {
  window.clearTimeout(advanceTimer);
  document.documentElement.classList.remove("is-advanced");
  if (apertura && !apertura.classList.contains("is-open")) {
    apertura.classList.add("is-open");
    document.documentElement.classList.add("is-open");
    openBtn?.setAttribute("aria-expanded", "true");
    apertura.inert = true;
  }
  window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  playOnce();
}

openBtn?.addEventListener("click", () => openInvite());

apertura?.addEventListener(
  "wheel",
  (event) => {
    if (event.deltaY > 6) openInvite();
  },
  { passive: true },
);

apertura?.addEventListener("touchmove", () => openInvite(), { passive: true });

video?.addEventListener("play", () => stage?.classList.add("is-playing"));
video?.addEventListener("pause", () => stage?.classList.remove("is-playing"));

video?.addEventListener("ended", () => {
  if (!video) return;
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration < 0.4) return;
  if (video.currentTime < duration - 0.35) return;
  showStill();
});

function leaveScene() {
  window.clearTimeout(advanceTimer);
  if (!dissolved) {
    dissolved = true;
    video?.pause();
    stage?.classList.remove("is-playing");
    if (replayBtn) replayBtn.hidden = false;
    if (playBtn) playBtn.hidden = true;
  }
  advanceNarrative();
}

skipBtn?.addEventListener("click", () => leaveScene());
desliza?.addEventListener("click", () => leaveScene());

replayBtn?.addEventListener("click", () => replayFromStart());
againBtn?.addEventListener("click", () => replayFromStart());
playBtn?.addEventListener("click", () => playOnce());

if (reduce && playBtn) playBtn.hidden = false;

window.addEventListener(
  "scroll",
  () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const progress = max > 0 ? Math.min(1, window.scrollY / max) : 0;
    if (bar) bar.style.transform = `scaleX(${progress})`;
  },
  { passive: true },
);

const reveals = document.querySelectorAll<HTMLElement>(".reveal");

function showReveals() {
  reveals.forEach((node) => node.classList.add("is-in"));
}

function watchReveals() {
  if (reduce || !("IntersectionObserver" in window)) {
    showReveals();
    return;
  }
  let batch: HTMLElement[] = [];
  let flush = 0;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        batch.push(entry.target as HTMLElement);
        observer.unobserve(entry.target);
      }
      window.clearTimeout(flush);
      flush = window.setTimeout(() => {
        let wait = 0;
        batch.forEach((node) => {
          node.style.setProperty("--d", `${wait}ms`);
          node.classList.add("is-in");
          const pace = node.classList.contains("panel-step")
            ? 260
            : node.classList.contains("divider")
              ? 160
              : 90;
          wait += pace;
        });
        batch = [];
      }, 40);
    },
    { threshold: 0.18, rootMargin: "0px 0px -6% 0px" },
  );
  const arm = () => {
    window.setTimeout(() => {
      reveals.forEach((node) => observer.observe(node));
    }, 420);
  };
  if (document.documentElement.classList.contains("is-advanced")) arm();
  else {
    const changes = new MutationObserver(() => {
      if (!document.documentElement.classList.contains("is-advanced")) return;
      changes.disconnect();
      arm();
    });
    changes.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  }
}

watchReveals();

arm();

function setMusicUi(playing: boolean) {
  audioBar?.classList.toggle("is-playing", playing);
  audioBar?.classList.toggle("is-paused", !playing);
  audioToggle?.setAttribute("aria-pressed", playing ? "true" : "false");
  audioToggle?.setAttribute("aria-label", playing ? "Pausar la música" : "Reproducir la música");
}

function paintMusic() {
  if (!music || !audioProgress || !audioLine) return;
  const duration = Number.isFinite(music.duration) ? music.duration : 0;
  const ratio = duration > 0 ? music.currentTime / duration : 0;
  audioProgress.style.transform = `scaleX(${ratio})`;
  audioLine.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
}

function startMusic() {
  if (!music) return;
  music.volume = 0.7;
  const pending = music.play();
  pending
    ?.then(() => {
      userPaused = false;
      setMusicUi(true);
    })
    .catch((error: unknown) => {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "AbortError") return;
      setMusicUi(false);
    });
}

let compactHold = false;
let compactTimer = 0;

function setCompact(compact: boolean) {
  audioBar?.classList.toggle("is-compact", compact);
  audioBar?.setAttribute("aria-expanded", compact ? "false" : "true");
}

function armCompact(event: Event) {
  event.stopPropagation();
  compactHold = false;
  window.clearTimeout(compactTimer);
  compactTimer = window.setTimeout(() => {
    compactHold = true;
    setCompact(!audioBar?.classList.contains("is-compact"));
  }, 460);
}

function clearCompactHold() {
  window.clearTimeout(compactTimer);
}

audioBar?.addEventListener("pointerdown", armCompact);
audioBar?.addEventListener("pointerup", clearCompactHold);
audioBar?.addEventListener("pointercancel", clearCompactHold);

audioToggle?.addEventListener("click", () => {
  if (compactHold) {
    compactHold = false;
    return;
  }
  if (!music) return;
  if (music.paused) startMusic();
  else {
    userPaused = true;
    music.pause();
    setMusicUi(false);
  }
});

audioLine?.addEventListener("click", (event) => {
  if (compactHold) {
    compactHold = false;
    return;
  }
  if (!music || !Number.isFinite(music.duration)) return;
  const rect = audioLine.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  music.currentTime = ratio * music.duration;
  paintMusic();
});

audioLine?.addEventListener("keydown", (event) => {
  if (!music || !Number.isFinite(music.duration)) return;
  if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
  event.preventDefault();
  const step = event.key === "ArrowRight" ? 5 : -5;
  music.currentTime = Math.min(music.duration, Math.max(0, music.currentTime + step));
  paintMusic();
});

music?.addEventListener("timeupdate", () => paintMusic());
music?.addEventListener("ended", () => {
  userPaused = true;
  setMusicUi(false);
});

function unlockMusic() {
  if (!music || userPaused || !music.paused) return;
  startMusic();
}

if (!import.meta.env.DEV) {
  window.addEventListener("pointerdown", unlockMusic);
  if (music) startMusic();
}

const rsvp = document.querySelector<HTMLButtonElement>("#rsvp");
const notice = document.querySelector<HTMLElement>("#rsvp-notice");

if (siteConfig.rsvp.href && rsvp) {
  const link = document.createElement("a");
  link.href = rsvpHrefFor(navigator.userAgent);
  link.className = rsvp.className;
  link.id = "rsvp";
  link.textContent = siteConfig.rsvp.label;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("aria-describedby", "rsvp-notice");
  rsvp.replaceWith(link);
} else {
  rsvp?.addEventListener("click", () => {
    notice?.focus();
  });
}

const stanzaOpen = document.querySelector<HTMLButtonElement>("#stanza-abrir");
const stanza = document.querySelector<HTMLDialogElement>("#stanza");
const stanzaClose = document.querySelector<HTMLButtonElement>("#stanza-cerrar");
let stanzaRestore: HTMLElement | null = null;

function openStanza(from?: HTMLElement | null) {
  if (!stanza || stanza.open) return;
  const current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  stanzaRestore = from ?? current ?? stanzaOpen;
  stanza.showModal();
  document.documentElement.classList.add("stanza-open");
  stanzaClose?.focus();
}

function closeStanza() {
  if (!stanza?.open) return;
  stanza.close();
}

stanzaOpen?.addEventListener("click", () => openStanza(stanzaOpen));
stanzaClose?.addEventListener("click", () => closeStanza());

stanza?.addEventListener("click", (event) => {
  if (event.target === stanza) closeStanza();
});

stanza?.addEventListener("close", () => {
  document.documentElement.classList.remove("stanza-open");
  const back = stanzaRestore;
  stanzaRestore = null;
  back?.focus();
});

/* ---------- Puertas: La Lettera y La Stanza (la hora la decide el servidor) ---------- */

type PortaResp = {
  now: number;
  lettera: { titulo: string; cuerpo: string[]; firma: string } | null;
  stanza: boolean;
};

const letteraOpen = document.querySelector<HTMLButtonElement>("#lettera-abrir");
const letteraState = document.querySelector<HTMLElement>("#lettera-estado");
const lettera = document.querySelector<HTMLDialogElement>("#lettera");
const letteraTitle = document.querySelector<HTMLElement>("#lettera-titulo");
const letteraBody = document.querySelector<HTMLElement>("#lettera-cuerpo");
const letteraFirma = document.querySelector<HTMLElement>("#lettera-firma");
const letteraClose = document.querySelector<HTMLButtonElement>("#lettera-cerrar");
const stanzaEnter = document.querySelector<HTMLAnchorElement>("#stanza-entrar");
const stanzaTitle = document.querySelector<HTMLElement>("#stanza-titulo");
const stanzaBody = document.querySelector<HTMLElement>("#stanza .stanza-body");
const stanzaState = document.querySelector<HTMLElement>("#stanza-estado");
let letteraRestore: HTMLElement | null = null;

const stanzaDie = document.querySelector<HTMLElement>("#stanza .die");
const closedStanza = {
  state: stanzaState?.textContent ?? "",
  title: stanzaTitle?.textContent ?? "",
  body: stanzaBody?.textContent ?? "",
};
const closedLettera = {
  state: letteraState?.textContent ?? "",
  title: letteraTitle?.textContent ?? "",
  body: letteraBody?.textContent?.trim() ?? "",
};

function applyPorta(p: PortaResp) {
  if (p.lettera && letteraBody && letteraTitle) {
    letteraOpen?.classList.remove("is-sealed");
    letteraOpen?.classList.add("is-unsealed");
    if (letteraState) letteraState.textContent = "El lacre está roto. Léela.";
    letteraTitle.textContent = p.lettera.titulo;
    letteraBody.replaceChildren(
      ...p.lettera.cuerpo.map((line) => {
        const el = document.createElement("p");
        el.textContent = line;
        return el;
      }),
    );
    if (letteraFirma) {
      letteraFirma.textContent = p.lettera.firma;
      letteraFirma.hidden = false;
    }
  } else if (letteraBody && letteraTitle) {
    letteraOpen?.classList.add("is-sealed");
    letteraOpen?.classList.remove("is-unsealed");
    if (letteraState) letteraState.textContent = closedLettera.state;
    letteraTitle.textContent = closedLettera.title;
    const line = document.createElement("p");
    line.textContent = closedLettera.body;
    letteraBody.replaceChildren(line);
    if (letteraFirma) {
      letteraFirma.textContent = "";
      letteraFirma.hidden = true;
    }
  }
  if (p.stanza && stanzaEnter && stanzaClose) {
    stanzaOpen?.classList.add("is-open");
    if (stanzaState) stanzaState.textContent = "Las puertas están abiertas.";
    if (stanzaTitle) stanzaTitle.textContent = "La Stanza está abierta.";
    if (stanzaBody) stanzaBody.textContent = "Las puertas se abrieron. Entra, jura lealtad y la casa te dirá cuál es tu famiglia.";
    stanzaEnter.hidden = false;
    stanzaClose.textContent = "Todavía no";
    stanzaClose.classList.remove("btn-solid");
    stanzaClose.classList.add("btn-text");
    if (stanzaDie) stanzaDie.hidden = true;
  } else if (stanzaEnter && stanzaClose) {
    stanzaOpen?.classList.remove("is-open");
    if (stanzaState) stanzaState.textContent = closedStanza.state;
    if (stanzaTitle) stanzaTitle.textContent = closedStanza.title;
    if (stanzaBody) stanzaBody.textContent = closedStanza.body;
    stanzaEnter.hidden = true;
    stanzaClose.textContent = "Capito.";
    stanzaClose.classList.add("btn-solid");
    stanzaClose.classList.remove("btn-text");
    if (stanzaDie) stanzaDie.hidden = false;
  }
}

async function checkPorta() {
  try {
    const res = await fetch("/api/porta", { cache: "no-store" });
    if (!res.ok) return;
    applyPorta((await res.json()) as PortaResp);
  } catch {
    /* sin servidor: las puertas siguen como están en el HTML */
  }
}

void checkPorta();
window.setInterval(() => {
  if (!document.hidden) void checkPorta();
}, 60_000);

letteraOpen?.addEventListener("click", () => {
  if (!lettera || lettera.open) return;
  letteraRestore = letteraOpen;
  void checkPorta();
  lettera.showModal();
  document.documentElement.classList.add("stanza-open");
  letteraClose?.focus();
});
letteraClose?.addEventListener("click", () => lettera?.close());
lettera?.addEventListener("click", (event) => {
  if (event.target === lettera) lettera.close();
});
lettera?.addEventListener("close", () => {
  document.documentElement.classList.remove("stanza-open");
  letteraRestore?.focus();
  letteraRestore = null;
});

