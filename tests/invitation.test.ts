import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { requiredPhrases } from "../src/copy";
import { houseAddress, rsvpHrefFor, rsvpMessage, rsvpPhone, siteConfig } from "../src/config";

const html = readFileSync(new URL("../invitacion/index.html", import.meta.url), "utf8");
const text = html
  .replace(/<script[\s\S]*?<\/script>/g, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

describe("texto original", () => {
  for (const phrase of requiredPhrases) {
    it(`incluye «${phrase.slice(0, 42)}»`, () => {
      expect(text).toContain(phrase);
    });
  }
});

describe("confirmacion", () => {
  it("guarda la fecha de la noche", () => {
    expect(siteConfig.year).toBe(2026);
    expect(siteConfig.timeZone).toBe("America/Santiago");
    expect(siteConfig.startsAt).toBe("2026-11-21T21:00:00-03:00");
  });

  it("abre WhatsApp de la casa con el mensaje escrito", () => {
    expect(siteConfig.venue?.address).toBe(houseAddress);
    expect(siteConfig.rsvp.href).toBe(rsvpHrefFor("Mobile"));
    expect(rsvpPhone).toBe("56982751090");
    expect(rsvpMessage).toContain("LA NOTTE DI NINNA");
    expect(rsvpMessage).toContain("XXXVIII · Cosa Nostra");
    expect(rsvpMessage).toContain("Por orden de la famiglia, confirmo mi asistencia.");
    expect(rsvpMessage).toContain("Sábado 21 de noviembre");
    expect(rsvpMessage).toContain("21:00 hrs.");
    expect(rsvpMessage).not.toContain("Italian Mafia Style");
    expect(rsvpMessage).not.toContain("Dress code");
    expect(rsvpMessage).toContain(`Apunte de la casa: ${houseAddress}.`);
    expect(rsvpMessage).toContain("La famiglia ti aspetta.");
    expect(rsvpMessage).toContain("Mi nombre:");
    expect(rsvpMessage).toContain("🥃");
    expect(rsvpMessage).toContain("🕯️");
    expect(rsvpMessage).toContain("🕘");
    expect(rsvpMessage).toContain("📍");
    expect(rsvpMessage).not.toContain("\uFFFD");

    const phone = rsvpHrefFor("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
    const desktop = rsvpHrefFor("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    expect(phone.startsWith(`https://api.whatsapp.com/send?phone=${rsvpPhone}&text=`)).toBe(true);
    expect(desktop.startsWith(`https://web.whatsapp.com/send?phone=${rsvpPhone}&text=`)).toBe(true);
    expect(phone).not.toContain("wa.me");
    expect(desktop).not.toContain("wa.me");
    for (const href of [phone, desktop]) {
      const text = decodeURIComponent(href.slice(href.indexOf("text=") + 5));
      expect(text).toBe(rsvpMessage);
      expect(text).not.toContain("\uFFFD");
      expect([...text].some((char) => (char.codePointAt(0) ?? 0) > 0xffff)).toBe(true);
    }
  });

  it("el aviso del sello dice que se abre WhatsApp", () => {
    expect(text).toContain("Se abre WhatsApp con el mensaje de la casa");
    expect(text).toContain("Aldebarán 0847");
    expect(text).toContain("Puente Alto");
    expect(html).not.toMatch(/mailto:|maps\.google|instagram\.com|tel:/i);
  });
});

describe("narrativa visual", () => {
  it("la mesa de la rosa entra despues del video y antes de los pasos", () => {
    const video = html.indexOf('id="transicion"');
    const photo = html.indexOf("mesa-rosa-1600");
    const step = html.indexOf('id="seleccion"');
    expect(video).toBeGreaterThan(0);
    expect(photo).toBeGreaterThan(video);
    expect(step).toBeGreaterThan(photo);
    expect(html).toContain("mesa-rosa-900");
  });

  it("la foto final no aparece antes de la transicion", () => {
    const cut = html.indexOf('id="transicion"');
    expect(cut).toBeGreaterThan(0);
    expect(html.slice(0, cut)).not.toMatch(/media\/cierre-/);
    expect(html.slice(cut)).toContain("media/cierre-1600");
    expect(html.slice(cut)).toContain("media/cierre-900");
  });

  it("el retrato entra una sola vez y la mesa enmarcada no se repite", () => {
    expect(html.match(/jefa-900/g)).toHaveLength(1);
    expect(html).not.toMatch(/reunion-1400/);
    expect(html.match(/id="mesa"/g)).toBeNull();
  });

  it("el video va mudo, sin loop y sin controles de sonido", () => {
    const tag = html.match(/<video\b[^>]*>/)?.[0] ?? "";
    expect(tag).toContain("muted");
    expect(tag).not.toMatch(/\bloop\b/);
    expect(tag).not.toContain("controls");
    expect(tag).not.toContain("src=");
    expect(siteConfig.media.fadeAt).toBeLessThan(siteConfig.media.trimSeconds);
    expect(siteConfig.media.trimSeconds).toBeGreaterThan(7);
    expect(siteConfig.media.trimSeconds).toBeLessThanOrEqual(8);
  });
});

describe("la stanza", () => {
  it("anuncia una puerta cerrada, sin acceso todavía", () => {
    expect(text).toContain("Acceso a «La Stanza»");
    expect(text).toContain("La Stanza está cerrada.");
    expect(text).toContain(
      "Las puertas se abren el sábado 21 de noviembre a las 21:00. Ni un minuto antes.",
    );
    expect(text).toContain("Capito.");
    expect(html).toContain('id="stanza"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toMatch(/contraseña|iniciar sesión|portal familiar/i);
  });
});

describe("archivo de video", () => {
  it("esta recortado y sin pista de audio", () => {
    const probe = execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type",
        "-of",
        "json",
        fileURLToPath(new URL("../public/media/escena.mp4", import.meta.url)),
      ],
      { encoding: "utf8" },
    );
    const data = JSON.parse(probe) as {
      streams: { codec_type: string }[];
      format: { duration: string };
    };
    expect(data.streams.some((stream) => stream.codec_type === "audio")).toBe(false);
    expect(Number(data.format.duration)).toBeGreaterThan(7);
    expect(Number(data.format.duration)).toBeLessThanOrEqual(8.05);
  });
});
