/**
 * Nombres de los carteles «Se busca» y su retrato.
 * La lista real de invitados y sus fotos no se publican en este repositorio.
 * Para jugar, agrega entradas así: { nome: "Nombre", foto: "/ricercati/nombre.jpg" }
 * y deja las imágenes en public/ricercati/.
 */
export const RICERCATI: { nome: string; foto: string }[] = [
];

const clave = (n: string) => n.normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase("es");

export function fotoDe(nome: string): string | undefined {
  const k = clave(nome);
  return RICERCATI.find((r) => clave(r.nome) === k)?.foto;
}
