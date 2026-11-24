/**
 * Configuración central de La Notte di Ninna.
 *
 * Año 2026. Zona America/Santiago.
 * El sábado 21 de noviembre de 2026, a las 21:00, Chile está en horario
 * de verano (CLST, UTC−3).
 *
 * La confirmación abre WhatsApp hacia el número de la casa, con el
 * mensaje ya escrito. Quien confirma agrega su nombre y lo envía.
 *
 * Recursos en el computador de Nina:
 * C:\Users\Admin\Desktop\La Notte di Ninna\Recursos
 */

export type SiteConfig = {
  year: number;
  timeZone: "America/Santiago";
  startsAt: string;
  venue: null | { name: string; address: string; mapsUrl?: string };
  rsvp: { href: null | string; label: string };
  media: {
    video: string;
    poster: string;
    fadeAt: number;
    trimSeconds: number;
  };
};

/** Número de Nina, con código de país, sin signos. */
export const rsvpPhone = "56982751090";

export const houseAddress = "Aldebarán 0847, Puente Alto";

/**
 * Texto que queda escrito en WhatsApp.
 * La persona invitada completa la última línea y envía el mensaje.
 * Sin el enlace corto wa.me: ese enlace cambia los emojis por un cuadrado.
 */
export const rsvpMessage = [
  "🥃 LA NOTTE DI NINNA",
  "XXXVIII · Cosa Nostra",
  "",
  "Por orden de la famiglia, confirmo mi asistencia.",
  "",
  "🕯️ Sábado 21 de noviembre",
  "🕘 21:00 hrs.",
  "",
  `📍 Apunte de la casa: ${houseAddress}.`,
  "",
  "Tu lugar está reservado.",
  "La famiglia ti aspetta.",
  "",
  "Mi nombre:",
].join("\n");

/** En el teléfono abre la app. En el computador abre el chat, donde el emoji se ve. */
export function rsvpHrefFor(userAgent: string) {
  const text = encodeURIComponent(rsvpMessage);
  const phone = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
  const base = phone
    ? `https://api.whatsapp.com/send?phone=${rsvpPhone}&text=`
    : `https://web.whatsapp.com/send?phone=${rsvpPhone}&text=`;
  return base + text;
}

export const siteConfig: SiteConfig = {
  year: 2026,
  timeZone: "America/Santiago",
  startsAt: "2026-11-21T21:00:00-03:00",
  venue: {
    name: "La casa",
    address: houseAddress,
  },
  rsvp: {
    href: rsvpHrefFor("Mobile"),
    label: "CONFIRMAR ASISTENCIA",
  },
  media: {
    video: "/media/escena.mp4",
    poster: "/media/escena-poster.webp",
    /**
     * Queda por debajo de la duración real. El corte visual no usa este
     * número: el clip se mira entero y después entra la foto final.
     */
    fadeAt: 2.5,
    /** Duración del archivo publicado, el clip completo y sin audio. */
    trimSeconds: 7.85,
  },
};
