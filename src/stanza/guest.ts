import "../styles.css";
import "./stanza.css";
import { api, h, poll, replace, type ApiError } from "./dom";
import type { Capitolo, GuestState, Yo } from "./types";
import { famiglia, isFamigliaId } from "../../shared/famiglie";
import { crest, die, ledger, lire, roman, sello, wantedPoster, waxSeal } from "./ui";
import { RICERCATI, fotoDe } from "./ricercati";

const TOKEN_KEY = "la-stanza.token";
const app = document.querySelector<HTMLElement>("#app")!;

let token = localStorage.getItem(TOKEN_KEY);
let state: GuestState | null = null;
let clockOffset = 0;
let lastScores = new Map<string, number>();
let lastSig = "";
const drafts = new Map<string, string>();
const messages = new Map<string, { text: string; ok: boolean }>();
let secretOpen = false;
let guideOpen = false;
let chosenSuspect = "";
let countdownTimer = 0;
let openIds = "";
let sawReveal = false;

const headers = () => (token ? { "x-stanza-token": token } : undefined);
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const scrollBehavior = (): ScrollBehavior => (reduceMotion() ? "auto" : "smooth");

function toast(text: string) {
  const t = h("div", { class: "st-toast", role: "status" }, text);
  document.body.append(t);
  window.setTimeout(() => t.remove(), 3400);
}

let refreshGen = 0;

async function refresh() {
  const gen = ++refreshGen;
  try {
    const s = await api<GuestState>("estado", { headers: headers() });
    if (gen !== refreshGen) return;
    if (!s?.doors) throw new Error("La casa no responde.");
    clockOffset = s.now - Date.now();
    if (s.tokenInvalido) {
      localStorage.removeItem(TOKEN_KEY);
      token = null;
    }
    state = s;
    render();
  } catch {
    if (gen !== refreshGen) return;
    if (!state) replace(app, closedCard("Sin conexión con la casa. Revisa tu internet; la página vuelve a intentar sola."));
  }
}

function stopCountdown() {
  window.clearInterval(countdownTimer);
  countdownTimer = 0;
}

const kicker = (text: string, lang?: string) => h("p", { class: "st-kicker", lang }, text);

function chapterHead(numero: string, titolo: string, mark: Node | null) {
  return [
    h("p", { class: "st-num" }, h("span", { class: "sr-only" }, "Capítulo "), numero),
    h("h2", { class: "st-title", lang: "it" }, titolo),
    mark ? h("p", { class: "st-mark" }, mark) : null,
  ];
}

function closedCard(extra?: string) {
  const at = state ? Date.parse(state.doors.stanzaAt) : NaN;
  const cd = h("p", { class: "st-count", id: "cuenta", "aria-live": "off" });
  const tick = () => {
    const ms = at - (Date.now() + clockOffset);
    if (!Number.isFinite(ms) || ms <= 0) return void (cd.textContent = "");
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, "0");
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    cd.textContent = d > 0 ? `${d} d · ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
  };
  tick();
  stopCountdown();
  countdownTimer = window.setInterval(tick, 1000);
  return h(
    "section",
    { class: "st-section" },
    kicker("Le porte", "it"),
    die(),
    h("h2", { class: "st-title" }, "La Stanza abre a las 21:00"),
    h("p", { class: "st-lede" }, "Sábado 21 de noviembre. Vuelve a esta página a esa hora: aquí recibirás tu famiglia, tu media contraseña y las pistas de la noche."),
    cd,
    cd.textContent ? h("p", { class: "st-caption" }, "para que se abran las puertas") : null,
    extra ? h("p", { class: "st-sealed" }, extra) : null,
  );
}

function guideSteps() {
  const steps: [string, string][] = [
    ["Encuentra a tu famiglia", "Recibes media contraseña. La otra mitad la tiene alguien de tu famiglia. Búsquense en voz baja."],
    ["Resuelvan los capítulos", "Donna Ninna los abre durante la noche. Respondan aquí, en el teléfono. La primera famiglia gana 5 lire; las demás, 1."],
    ["Busquen los sobres", "Algunos aciertos dicen dónde hay un sobre con su escudo. Tomen solo el suyo."],
    ["¿Atascados?", "Si nadie acierta en 10 minutos, aparece una pista sola."],
    ["Descubran al traidor", "Alguien robó el sello. Al final, en Il Processo, cada uno vota por una sola persona."],
  ];
  return h(
    "ol",
    { class: "st-steps" },
    ...steps.map(([t, d], i) => h("li", {}, h("span", { class: "st-step-n", "aria-hidden": "true" }, roman(i + 1)), h("div", {}, h("b", {}, t), h("p", {}, d)))),
  );
}

function guideCard() {
  const d = h(
    "details",
    { class: "st-guide", id: "guia", open: guideOpen },
    h("summary", {}, h("span", {}, "Cómo se juega"), h("span", { class: "st-guide-hint", "aria-hidden": "true" }, guideOpen ? "Cerrar" : "Ver")),
    guideSteps(),
    h("p", { class: "st-caption" }, "La página se actualiza sola. No necesitas recargar."),
  );
  d.addEventListener("toggle", () => {
    guideOpen = d.open;
    const hint = d.querySelector(".st-guide-hint");
    if (hint) hint.textContent = d.open ? "Cerrar" : "Ver";
  });
  return h("section", { class: "st-section st-section-guide" }, d);
}

function registerCard() {
  const OTRO = "__otro__";
  let chosen = "";
  const portrait = h("img", { class: "st-mug", alt: "", hidden: true });
  const label = h("span", {}, "Selecciona tu nombre");
  const btn = h(
    "button",
    { type: "button", class: "st-menu-btn", "aria-haspopup": "listbox", "aria-expanded": "false", "aria-controls": "ricercati" },
    label,
  );
  const options = [
    ...RICERCATI.map((r) => ({ value: r.nome, text: r.nome, other: false })),
    { value: OTRO, text: "Mi nombre no está en los carteles", other: true },
  ];
  const items = options.map((o) =>
    h("li", { role: "option", tabindex: "-1", "data-value": o.value, "aria-selected": "false", class: o.other ? "is-other" : "" }, o.text),
  );
  const list = h("ul", { class: "st-menu-list", id: "ricercati", role: "listbox", "aria-label": "Criminales buscados" }, ...items);
  const panel = h("div", { class: "st-menu-panel", hidden: true }, list);
  const menu = h("div", { class: "st-menu" }, btn, panel);
  const apply = (value: string) => {
    chosen = value;
    const hit = RICERCATI.find((x) => x.nome === value);
    label.textContent = hit?.nome ?? (value === OTRO ? "Mi nombre no está en los carteles" : "Selecciona tu nombre");
    btn.classList.toggle("is-set", Boolean(value));
    for (const li of items) li.setAttribute("aria-selected", li.dataset.value === value ? "true" : "false");
    if (hit) {
      portrait.src = hit.foto;
      portrait.alt = `Retrato de ${hit.nome}`;
      portrait.hidden = false;
      custom.hidden = true;
      input.required = false;
      return;
    }
    portrait.hidden = true;
    portrait.removeAttribute("src");
    const otro = value === OTRO;
    custom.hidden = !otro;
    input.required = otro;
    if (otro) input.focus();
  };
  const setOpen = (open: boolean, focusValue?: string) => {
    panel.hidden = !open;
    menu.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", String(open));
    if (!open) return;
    const current = items.find((li) => li.dataset.value === (focusValue ?? chosen)) ?? items[0];
    current?.focus();
    current?.scrollIntoView({ block: "nearest" });
  };
  btn.addEventListener("click", () => setOpen(panel.hidden));
  btn.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  });
  list.addEventListener("keydown", (e: KeyboardEvent) => {
    const i = items.indexOf(document.activeElement as HTMLLIElement);
    const go = (n: number) => {
      e.preventDefault();
      items[n]?.focus();
    };
    if (e.key === "ArrowDown") go(Math.min(items.length - 1, i + 1));
    else if (e.key === "ArrowUp") go(Math.max(0, i - 1));
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      btn.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (i >= 0) apply(options[i].value);
      setOpen(false);
    }
  });
  items.forEach((li, i) => li.addEventListener("click", () => {
    apply(options[i].value);
    setOpen(false);
  }));
  const onAway = (e: Event) => {
    if (!menu.isConnected) {
      document.removeEventListener("pointerdown", onAway);
      return;
    }
    if (!menu.contains(e.target as Node)) setOpen(false);
  };
  document.addEventListener("pointerdown", onAway);
  const input = h("input", {
    class: "st-field",
    type: "text",
    name: "nome",
    autocomplete: "given-name",
    maxlength: "24",
    placeholder: "Tu nombre",
    "aria-label": "Tu nombre",
  });
  const custom = h("div", { class: "st-custom", hidden: true }, input);
  const msg = h("p", { class: "st-msg", role: "alert" });
  const submit = h("button", { type: "submit", class: "btn btn-solid" }, "Jurar lealtad");
  return h(
    "section",
    { class: "st-section" },
    kicker("Il Giuramento", "it"),
    h("h2", { class: "st-title" }, "Antes de entrar, jura lealtad"),
    h("p", { class: "st-lede" }, "Anoche robaron el sello de la casa, y quien lo tiene cena hoy con nosotros. Elige tu nombre de los carteles: la casa te asignará una famiglia."),
    h(
      "form",
      {
        class: "st-form",
        onsubmit: async (e: Event) => {
          e.preventDefault();
          const nome = chosen === OTRO ? input.value : chosen;
          if (!nome) {
            msg.className = "st-msg is-err";
            msg.textContent = "Elige tu nombre en los carteles.";
            return;
          }
          submit.disabled = true;
          msg.textContent = "";
          try {
            const r = await api<{ token: string }>("giuramento", { body: { nome } });
            token = r.token;
            localStorage.setItem(TOKEN_KEY, r.token);
            lastSig = "";
            await refresh();
            window.scrollTo({ top: 0, behavior: scrollBehavior() });
          } catch (err) {
            msg.className = "st-msg is-err";
            msg.textContent = (err as Error).message;
            submit.disabled = false;
          }
        },
      },
      h("p", { class: "st-label" }, "Criminal buscado"),
      menu,
      portrait,
      custom,
      submit,
      msg,
    ),
    h("p", { class: "st-caption" }, "Usa siempre este mismo teléfono. Un teléfono por persona."),
    h("div", { class: "st-howto" }, h("p", { class: "st-label" }, "Cómo se juega"), guideSteps()),
  );
}

function nextStep(s: GuestState, yo: Yo) {
  const famName = s.famiglie.find((f) => f.id === yo.famiglia)!.nome;
  const c = s.capitoli.find((x) => x.id === s.active && x.open);
  if (!c) {
    return h(
      "div",
      { class: "st-wait" },
      die(),
      h("p", { class: "st-next" }, h("span", { class: "st-label" }, "Ahora"), "Esperen a que Donna Ninna abra el próximo capítulo."),
    );
  }
  const done = c.risolto.includes(famName);
  const link = h(
    "a",
    {
      class: "st-next-link",
      href: `#cap-${c.id}`,
      onclick: (e: Event) => {
        e.preventDefault();
        document.getElementById(`cap-${c.id}`)?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
      },
    },
    h("span", { class: "st-next-num" }, c.numero),
    h("span", { lang: "it" }, c.titolo),
    h("span", { class: "st-next-arrow", "aria-hidden": "true" }, "↓"),
  );
  return h(
    "div",
    { class: "st-next" },
    h("p", { class: "st-label" }, done ? "Ya lo resolvieron" : c.id === "processo" ? "Ahora · vota" : "Ahora · capítulo en curso"),
    link,
  );
}

function famigliaCard(s: GuestState, yo: Yo) {
  const f = s.famiglie.find((x) => x.id === yo.famiglia)!;
  const motto = isFamigliaId(yo.famiglia) ? famiglia(yo.famiglia).motto : "";
  const first = yo.mezzaPos === "inizio";
  const famName = f.nome;
  const pactDone = s.capitoli.find((c) => c.id === "giuramento")?.risolto.includes(famName);
  return h(
    "section",
    { class: "st-section st-famiglia", id: "famiglia" },
    kicker(`${yo.name}, perteneces a`),
    fotoDe(yo.name) ? h("img", { class: "st-mug", src: fotoDe(yo.name)!, alt: `Retrato de ${yo.name}` }) : null,
    crest(f.id, f.colore, 150, true),
    h("h2", { class: "st-fam" }, h("small", { lang: "it" }, "Famiglia"), f.nome),
    motto ? h("p", { class: "st-motto", lang: "it" }, `«${motto}»`) : null,
    h(
      "div",
      { class: "st-half" },
      h("p", { class: "st-label" }, "Tu media contraseña"),
      h(
        "p",
        { class: "st-half-word" },
        first ? h("span", {}, yo.mezza) : h("span", { class: "ghost", "aria-label": "falta" }, "· · ·"),
        h("span", { class: "st-half-sep", "aria-hidden": "true" }),
        first ? h("span", { class: "ghost", "aria-label": "falta" }, "· · ·") : h("span", {}, yo.mezza),
      ),
      h(
        "p",
        { class: "st-caption" },
        pactDone
          ? "Tu famiglia ya selló el juramento."
          : `Tu palabra va ${first ? "primero" : "al final"}. Busca a quien tenga la otra, sin decir en voz alta el nombre de tu famiglia.`,
      ),
    ),
    nextStep(s, yo),
  );
}

function secretCard(yo: Yo) {
  const body = h(
    "div",
    { class: "letter", hidden: !secretOpen },
    h("p", { class: "letter-k" }, "Solo para tus ojos"),
    h("p", { class: "letter-lead" }, "Tú robaste el sello. Juega con tu famiglia como si nada. Siembra dudas y cumple estas misiones."),
    h(
      "ol",
      {},
      ...yo.missioni.map((m, i) =>
        h(
          "li",
          { class: m.fatta ? "is-done" : "" },
          h("span", {}, roman(i + 1)),
          h("div", {}, h("b", { lang: "it" }, m.titolo), h("p", {}, m.testo)),
        ),
      ),
    ),
    h(
      "p",
      { class: "letter-foot" },
      `Cada misión que Donna Ninna confirme te da 3 lire. Si nadie te descubre en Il Processo, ganas 10 más. Llevas ${lire(yo.lire ?? 0)}.`,
    ),
  );
  const label = h("span", {}, secretOpen ? "Cerrar la carta" : "Abrir la carta");
  const btn = h(
    "button",
    {
      type: "button",
      class: "wax-btn",
      "aria-expanded": String(secretOpen),
      onclick: () => {
        secretOpen = !secretOpen;
        body.hidden = !secretOpen;
        label.textContent = secretOpen ? "Cerrar la carta" : "Abrir la carta";
        btn.setAttribute("aria-expanded", String(secretOpen));
      },
    },
    waxSeal(72, "N"),
    label,
  );
  return h(
    "section",
    { class: "st-section st-secret" },
    kicker("Una carta lacrada"),
    h("h2", { class: "st-title", lang: "it" }, "Il Traditore"),
    h("p", { class: "st-lede" }, "Esta carta es solo para ti. Ábrela cuando nadie mire tu pantalla."),
    btn,
    body,
  );
}

function vaultBlock(s: GuestState, mine?: string) {
  const node = h(
    "section",
    { class: "st-section st-ledger", id: "boveda" },
    kicker("La bóveda"),
    h("h2", { class: "st-title" }, "Lire por famiglia"),
    ledger(s.famiglie, { mine, previous: lastScores }),
    h("p", { class: "st-caption" }, `${s.invitati} ${s.invitati === 1 ? "persona ha jurado" : "personas han jurado"} esta noche.`),
  );
  lastScores = new Map(s.famiglie.map((f) => [f.id, f.lire]));
  return node;
}

function answerForm(c: Capitolo) {
  const m = messages.get(c.id);
  const input = h("input", {
    class: "st-field",
    type: "text",
    autocomplete: "off",
    autocapitalize: "characters",
    spellcheck: "false",
    maxlength: "300",
    "aria-label": `Respuesta para ${c.titolo}`,
    placeholder: c.id === "messaggio" ? "El mensaje completo" : c.id === "giuramento" ? "Las dos palabras" : "Tu respuesta",
  });
  input.value = drafts.get(c.id) ?? "";
  input.addEventListener("input", () => drafts.set(c.id, input.value));
  const msg = h("p", { class: m ? `st-msg${m.ok ? "" : " is-err"}` : "st-msg", role: "alert" }, m?.text ?? "");
  const btn = h("button", { type: "submit", class: "btn btn-solid" }, "Enviar respuesta");
  return h(
    "form",
    {
      class: "st-form",
      onsubmit: async (e: Event) => {
        e.preventDefault();
        btn.disabled = true;
        try {
          const r = await api<{ correct: boolean; points: number; place: number; left?: number }>("risposta", {
            headers: headers(),
            body: { capitolo: c.id, risposta: input.value },
          });
          if (r.correct) {
            drafts.delete(c.id);
            messages.delete(c.id);
            toast(r.points > 0 ? `¡Correcto! +${lire(r.points)} para tu famiglia.` : "¡Correcto!");
            lastSig = "";
            await refresh();
            return;
          }
          const left = r.left ?? 0;
          messages.set(c.id, {
            text: left > 0 ? `No es eso. Te ${left === 1 ? "queda 1 intento" : `quedan ${left} intentos`} este minuto.` : "No es eso. Espera un minuto para volver a intentar.",
            ok: false,
          });
        } catch (err) {
          messages.set(c.id, { text: (err as ApiError).message, ok: false });
        }
        lastSig = "";
        render();
      },
    },
    input,
    btn,
    msg,
  );
}

/** Abecedario con números (A = 1 … Z = 26, sin ñ) para los capítulos de cifras. */
function alphabetStrip() {
  const letters = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
  return h(
    "div",
    { class: "st-abc", role: "group", "aria-label": "Abecedario con números" },
    ...letters.map((l, i) => h("span", { class: "st-abc-cell" }, h("b", {}, l), h("small", {}, String(i + 1)))),
  );
}

const hhmm = (t: number) =>
  new Date(t).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Santiago" });

function hintBlock(c: Capitolo, solvedByMe: boolean) {
  if (solvedByMe) return null;
  if (c.pista) return h("div", { class: "st-hint" }, h("p", { class: "st-label" }, "Pista de la casa"), h("p", {}, c.pista));
  if (c.pistaAt) return h("p", { class: "st-caption st-hint-wait" }, `Si nadie lo resuelve, la casa dará una pista a las ${hhmm(c.pistaAt)}.`);
  return null;
}

function chapterCard(c: Capitolo, s: GuestState, yo: Yo) {
  const famName = s.famiglie.find((f) => f.id === yo.famiglia)!.nome;
  const solvedByMe = c.risolto.includes(famName);
  const reveal = yo.rivelazioni.find((r) => r.id === c.id);
  const active = s.active === c.id;
  const mark = solvedByMe ? sello("pergamino", "Resuelto por tu famiglia") : active ? sello("oro", "En curso") : null;
  return h(
    "section",
    { class: `st-section st-chapter${active ? " is-active" : ""}${solvedByMe ? " is-solved" : ""}`, id: `cap-${c.id}` },
    ...chapterHead(c.numero, c.titolo, mark),
    h("p", { class: "st-lede" }, c.testo ?? ""),
    c.alfabeto && !solvedByMe ? alphabetStrip() : null,
    hintBlock(c, solvedByMe),
    c.risposta && !solvedByMe && c.id !== "processo" ? answerForm(c) : null,
    reveal
      ? h("div", { class: "note-slip" }, waxSeal(48, "N"), h("p", { class: "note-k" }, "Solo para tu famiglia"), h("p", {}, reveal.testo))
      : null,
    c.risolto.length ? h("p", { class: "st-solvers" }, h("span", {}, "Resuelto por"), c.risolto.join(" · ")) : null,
  );
}

function processCard(s: GuestState, yo: Yo) {
  const c = s.capitoli.find((x) => x.id === "processo")!;
  const parts: (Node | null)[] = [
    ...chapterHead(c.numero, c.titolo, s.active === "processo" ? sello("oro", "En curso") : null),
    h("p", { class: "st-lede" }, c.testo ?? ""),
  ];
  if (s.vote.status === "aperta" && !yo.voto) {
    const msg = h("p", { class: "st-msg", role: "alert" });
    const list = h(
      "fieldset",
      { class: "suspects" },
      h("legend", { class: "st-label" }, "¿Quién robó el sello?"),
      ...yo.candidati.map((p) => {
        const r = h("input", { type: "radio", name: "accusato", value: p.id, checked: chosenSuspect === p.id });
        r.addEventListener("change", () => (chosenSuspect = p.id));
        return h("label", {}, r, h("span", {}, p.name));
      }),
    );
    const btn = h("button", { type: "submit", class: "btn btn-solid" }, "Acusar");
    parts.push(
      h(
        "form",
        {
          class: "st-form",
          onsubmit: async (e: Event) => {
            e.preventDefault();
            const who = yo.candidati.find((p) => p.id === chosenSuspect);
            if (!who) return void (msg.textContent = "Primero elige a quién acusas.");
            if (!window.confirm(`¿Acusas a ${who.name}? Tu voto es secreto y no se puede cambiar.`)) return;
            btn.disabled = true;
            try {
              await api("voto", { headers: headers(), body: { accusato: who.id } });
              toast("Tu acusación quedó sellada.");
              lastSig = "";
              await refresh();
            } catch (err) {
              msg.textContent = (err as Error).message;
              btn.disabled = false;
            }
          },
        },
        list,
        btn,
        h("p", { class: "st-caption" }, "Tu voto es secreto y no se puede cambiar."),
        msg,
      ),
    );
  } else if (yo.voto) {
    parts.push(h("div", { class: "note-slip" }, waxSeal(48, "N"), h("p", { class: "note-k" }, "Tu voto"), h("p", {}, `Acusaste a ${yo.voto}. Tu voto quedó sellado.`)));
  } else if (s.vote.status === "risolta") {
    parts.push(h("p", { class: "st-sealed" }, "La votación terminó. Donna Ninna revelará al traidor."));
  } else {
    parts.push(h("p", { class: "st-sealed" }, "La votación todavía no abre. Donna Ninna avisará."));
  }
  return h("section", { class: `st-section st-chapter${s.active === "processo" ? " is-active" : ""}`, id: "cap-processo" }, ...parts);
}

function navBar(s: GuestState) {
  const go = (id: string, after?: () => void) => (e: Event) => {
    e.preventDefault();
    after?.();
    document.getElementById(id)?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  };
  const active = s.capitoli.find((c) => c.id === s.active && c.open);
  const link = (id: string, label: string, after?: () => void) => h("a", { href: `#${id}`, onclick: go(id, after) }, label);
  return h(
    "nav",
    { class: "st-nav", "aria-label": "Secciones de La Stanza" },
    link("famiglia", "Famiglia"),
    active ? link(`cap-${active.id}`, "Ahora") : null,
    link("boveda", "Bóveda"),
    link("guia", "Reglas", () => {
      const d = document.getElementById("guia") as HTMLDetailsElement | null;
      if (d && !d.open) d.open = true;
    }),
  );
}

function render() {
  const s = state;
  if (!s) return;
  const sig = JSON.stringify([{ ...s, now: 0 }, token, secretOpen]);
  if (sig === lastSig) return;

  const ids = s.capitoli.filter((c) => c.open).map((c) => c.id).join(",");
  const added = openIds ? s.capitoli.find((c) => c.open && !openIds.split(",").includes(c.id)) : undefined;
  openIds = ids;
  const revealNow = Boolean(s.traditori?.length);
  const justRevealed = revealNow && !sawReveal;
  sawReveal = revealNow;

  const typing =
    app.contains(document.activeElement) &&
    document.activeElement instanceof HTMLInputElement &&
    document.activeElement.type === "text";
  if (typing && !added && !justRevealed) {
    const v = app.querySelector(".st-ledger");
    if (v && s.yo) v.replaceWith(vaultBlock(s, s.yo.famiglia));
    else if (v) v.replaceWith(vaultBlock(s));
    return;
  }

  lastSig = sig;
  stopCountdown();
  if (!s.doors.stanza) return replace(app, closedCard());
  if (!s.yo) return replace(app, registerCard(), vaultBlock(s));

  const yo = s.yo;
  const nodes: Node[] = [navBar(s)];
  if (s.traditori?.length) {
    nodes.push(
      h(
        "section",
        { class: "st-section" },
        kicker("Il Processo", "it"),
        h("h2", { class: "st-title", lang: "it" }, s.traditori.length > 1 ? "I traditori" : "Il traditore"),
        ...s.traditori.map(wantedPoster),
      ),
    );
  }
  nodes.push(famigliaCard(s, yo));
  if (yo.traditore) nodes.push(secretCard(yo));

  const open = s.capitoli.filter((c) => c.open && c.id !== "processo");
  const ordered = [...open].sort((a, b) => (a.id === s.active ? -1 : b.id === s.active ? 1 : s.capitoli.indexOf(b) - s.capitoli.indexOf(a)));
  const processOpen = Boolean(s.capitoli.find((c) => c.id === "processo")?.open);
  if (processOpen && s.active === "processo") nodes.push(processCard(s, yo));
  for (const c of ordered) nodes.push(chapterCard(c, s, yo));
  if (processOpen && s.active !== "processo") nodes.push(processCard(s, yo));
  const sealed = s.capitoli.filter((c) => !c.open).length;
  if (sealed)
    nodes.push(
      h(
        "p",
        { class: "st-sealed" },
        sealed === 1 ? "Queda un capítulo por abrir." : `Quedan ${sealed} capítulos por abrir.`,
        h("br"),
        "Donna Ninna los abrirá durante la noche.",
      ),
    );
  nodes.push(vaultBlock(s, yo.famiglia));
  nodes.push(guideCard());

  const y = window.scrollY;
  replace(app, ...nodes);
  if (added) {
    document.getElementById(`cap-${added.id}`)?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    toast(`Se abrió el capítulo ${added.numero} · ${added.titolo}`);
  } else if (justRevealed) {
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  } else {
    window.scrollTo(0, y);
  }
}

const LETTER_SEEN = "la-lettera.vista";

type PortaLetter = { titulo: string; cuerpo: string[]; firma: string };

/** Primera pantalla: un solo panel oscuro. La mesa va diluida detrás del texto. */
function mountLetter() {
  if (sessionStorage.getItem(LETTER_SEEN) === "1" || document.querySelector(".lt-gate")) return;
  const title = h("h2", { class: "lt-title", id: "lt-titulo" }, "La Lettera");
  const body = h("div", { class: "lt-body", "aria-live": "polite" }, h("p", {}, "La casa está abriendo el lacre…"));
  const firma = h("p", { class: "lt-firma", hidden: true });
  const enter = h("button", { class: "btn btn-solid", type: "button" }, "Entrar a La Stanza");
  const gate = h(
    "div",
    { class: "lt-gate", role: "dialog", "aria-modal": "true", "aria-labelledby": "lt-titulo" },
    h(
      "div",
      { class: "lt-card" },
      h("div", { class: "lt-wash", "aria-hidden": "true" }),
      h(
        "div",
        { class: "lt-copy" },
        h("p", { class: "lt-kicker", lang: "it" }, "La Lettera"),
        title,
        h("span", { class: "lt-rule", "aria-hidden": "true" }),
        body,
        firma,
        enter,
      ),
    ),
  );
  const behind = [...document.body.children];
  const close = () => {
    sessionStorage.setItem(LETTER_SEEN, "1");
    for (const el of behind) el.removeAttribute("inert");
    document.documentElement.classList.remove("lt-open");
    gate.remove();
  };
  enter.addEventListener("click", close);
  gate.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
  for (const el of behind) el.setAttribute("inert", "");
  document.documentElement.classList.add("lt-open");
  gate.tabIndex = -1;
  document.body.append(gate);
  gate.focus();
  void api<{ lettera: PortaLetter | null }>("porta")
    .then((p) => {
      if (p.lettera) {
        title.textContent = p.lettera.titulo;
        body.replaceChildren(
          ...p.lettera.cuerpo.map((line) => h("p", {}, line)),
        );
        firma.textContent = p.lettera.firma;
        firma.hidden = false;
      } else {
        title.textContent = "La carta sigue lacrada.";
        body.replaceChildren(h("p", {}, "El lacre cede el sábado 21 de noviembre a las 12:00."));
      }
    })
    .catch(() => {
      title.textContent = "La Lettera";
      body.replaceChildren(h("p", {}, "La carta no cargó. Puedes entrar igual."));
    });
}

mountLetter();
poll(refresh, 4000);
