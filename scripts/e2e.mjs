// Recorrido de punta a punta contra `netlify dev` (por defecto http://localhost:8888).
// Uso: MADRINA_KEY=... node scripts/e2e.mjs [baseUrl]
const BASE = process.argv[2] ?? "http://localhost:8888";
const KEY = process.env.MADRINA_KEY;
if (!KEY) throw new Error("Falta MADRINA_KEY");
let fails = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "✔" : "✘"} ${msg}`);
  if (!cond) fails++;
};
async function call(path, { method, body, token, key } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers["x-stanza-token"] = token;
  if (key) headers.authorization = `Bearer ${key}`;
  const r = await fetch(BASE + "/api/" + path, { method: method ?? (body ? "POST" : "GET"), headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})), headers: r.headers };
}
const madrina = (body) => call("madrina", { body, key: KEY });

await madrina({ action: "reset", conferma: "REINICIAR" });
await madrina({ action: "puerta", puerta: "stanza", valor: false });
await madrina({ action: "puerta", puerta: "lettera", valor: false });

let r = await call("porta");
ok(r.status === 200 && r.data.stanza === false && r.data.lettera === null, "antes de la hora: puertas cerradas y carta sin texto");
r = await call("giuramento", { body: { nome: "Temprano" } });
ok(r.status === 423, "no se puede jurar con La Stanza cerrada");
r = await call("madrina", { key: "clave-equivocada" });
ok(r.status === 401, "clave equivocada de la Madrina → 401");
r = await call("madrina");
ok(r.status === 401, "sin clave → 401");

await madrina({ action: "puerta", puerta: "lettera", valor: true });
await madrina({ action: "puerta", puerta: "stanza", valor: true });
r = await call("porta");
ok(r.data.stanza === true && r.data.lettera?.cuerpo?.[0]?.startsWith("Anoche alguien robó"), "apertura manual: carta y Stanza abiertas");

const names = ["Kiran", "Skarlett", "Ari", "Barrolas", "Valentina", "Tomás", "Josefa", "Matías", "Camila", "Ignacio", "Fernanda"];
const guests = [];
await Promise.all(
  names.map(async (n) => {
    const res = await call("giuramento", { body: { nome: n } });
    guests.push({ name: n, token: res.data.token, ...res.data.yo, status: res.status });
  }),
);
ok(guests.every((g) => g.status === 201 && g.token), `${names.length} invitados juraron en paralelo`);
r = await call("estado");
const counts = r.data.famiglie.map((f) => f.membri);
ok(Math.max(...counts) - Math.min(...counts) <= 1 && counts.reduce((a, b) => a + b) === names.length, `famiglie balanceadas: ${counts.join(", ")}`);
r = await call("giuramento", { body: { nome: "kiran" } });
ok(r.status === 409, "nombre repetido rechazado");
r = await call("giuramento", { body: { nome: "<script>alert(1)</script>" } });
ok(r.status === 400, "nombre con HTML rechazado");
r = await call("giuramento", { body: { nome: "A".repeat(40) } });
ok(r.status === 400, "nombre largo rechazado");

const pub = JSON.stringify((await call("estado")).data);
ok(!/tokenHash|mezza|traitor|luna|biblioteca/.test(pub), "el estado público no expone tokens, mitades ni escondites");

for (const id of ["giuramento", "codice", "prezzo", "cifra", "chiave", "messaggio"]) await madrina({ action: "capitulo", id, valor: true });
{
  const e = (await call("estado")).data.capitoli.find((c) => c.id === "chiave");
  ok(e.pista === null && typeof e.pistaAt === "number", "la pista de La Chiave espera 10 minutos");
}

const byFam = Object.groupBy(guests, (g) => g.famiglia);
const fams = Object.keys(byFam);
const A = byFam[fams[0]][0];
const B = byFam[fams[1]][0];
r = await call("risposta", { token: A.token, body: { capitolo: "codice", risposta: "  el TRAIDÓR " } });
ok(r.data.correct && r.data.points === 5, "primera famiglia en «Il Codice» gana 5 lire");
r = await call("risposta", { token: B.token, body: { capitolo: "codice", risposta: "traidor" } });
ok(r.data.correct && r.data.points === 1, "segunda famiglia gana 1 lira");
r = await call("estado", { token: A.token });
ok(r.data.yo.rivelazioni.some((x) => /biblioteca/.test(x.testo)), "la famiglia que acertó ve el escondite 1");
r = await call("estado", { token: byFam[fams[2]][0].token });
ok(!r.data.yo.rivelazioni.length, "otra famiglia no ve el escondite");

const md = (await call("madrina", { key: KEY })).data;
const pw = md.passwords[A.famiglia].join(" ");
r = await call("risposta", { token: A.token, body: { capitolo: "giuramento", risposta: pw.toUpperCase() } });
ok(r.data.correct, "contraseña completa de la famiglia aceptada");
r = await call("risposta", { token: B.token, body: { capitolo: "prezzo", risposta: "cinema paradizo" } });
ok(r.data.correct, "«Il Prezzo della Fedeltà» acepta un error de tipeo");
r = await call("risposta", { token: B.token, body: { capitolo: "cifra", risposta: "rojo" } });
ok(r.data.correct, "«La Cifra di Sangue» acepta rojo");
r = await call("risposta", { token: B.token, body: { capitolo: "chiave", risposta: "Extremo Duro" } });
ok(r.data.correct, "«La Chiave» acepta Extremo Duro");
r = await call("risposta", { token: B.token, body: { capitolo: "messaggio", risposta: md.pezzi.join(" ") } });
ok(r.data.correct, "«Il Messaggio» acepta la frase de las seis piezas");
r = await call("risposta", { token: A.token, body: { capitolo: "messaggio", risposta: "bajo la pantaya de la oficina" } });
ok(r.data.correct, "«Il Messaggio» acepta la idea esencial con errores");
r = await call("risposta", { token: B.token, body: { capitolo: "brindisi", risposta: "segundo movimiento" } });
ok(r.status === 423, "capítulo sellado (VII) no se puede responder");

await madrina({ action: "pista", id: "chiave", valor: true });
r = await call("estado");
ok(/Extremo/.test(r.data.capitoli.find((c) => c.id === "chiave").pista ?? ""), "la Madrina puede dar la pista antes");
ok(r.data.capitoli.find((c) => c.id === "codice").alfabeto === true, "Il Codice muestra el abecedario");

const C = byFam[fams[2]][0];
let statuses = [];
for (let i = 0; i < 6; i++) statuses.push((await call("risposta", { token: C.token, body: { capitolo: "prezzo", risposta: "titanic" } })).status);
ok(statuses.slice(0, 5).every((s) => s === 200) && statuses[5] === 429, `rate limit: 5 intentos y luego 429 (${statuses.join(",")})`);
r = await call("risposta", { token: "inventado-".repeat(4), body: { capitolo: "codice", risposta: "traidor" } });
ok(r.status === 401, "token inventado rechazado");

await madrina({ action: "lire", famiglia: fams[3], delta: 6, motivo: "billetes" });
r = await call("estado");
ok(r.data.famiglie.find((f) => f.id === fams[3]).lire === 6, "la Madrina carga billetes (+6 lire)");

r = await madrina({ action: "traditori_azar", n: 1 });
ok(r.status === 200, "traidor sorteado");
const md2 = (await call("madrina", { key: KEY })).data;
const traitor = md2.guests.find((g) => g.traitor);
const T = guests.find((g) => g.id === traitor.id);
r = await call("estado", { token: T.token });
ok(r.data.yo.traditore && r.data.yo.missioni.length === 5, "el traidor ve sus 5 misiones solo con su token");
const other = guests.find((g) => g.id !== traitor.id);
r = await call("estado", { token: other.token });
ok(!r.data.yo.traditore && !r.data.yo.missioni.length && !JSON.stringify(r.data).includes("Falso Indizio"), "los demás no ven misiones");
await madrina({ action: "missione", id: traitor.id, missione: "falso", valor: true });

await madrina({ action: "votacion", valor: "aperta" });
const traitorFam = traitor.famiglia;
const accuserFam = fams.find((f) => f !== traitorFam);
const decoy = guests.find((g) => g.id !== traitor.id && g.famiglia !== accuserFam);
for (const g of guests) {
  const target = g.famiglia === accuserFam ? traitor.id : g.id === decoy.id ? traitor.id : decoy.id;
  await call("voto", { token: g.token, body: { accusato: target } });
}
r = await call("voto", { token: guests[0].token, body: { accusato: traitor.id } });
ok(r.status === 409 || r.status === 400, "un solo voto por invitado");
const before = (await call("estado")).data.famiglie.find((f) => f.id === accuserFam).lire;
await madrina({ action: "votacion", valor: "chiusa" });
const after = (await call("estado")).data.famiglie.find((f) => f.id === accuserFam).lire;
ok(after === before + 5, "la famiglia cuya mayoría acusó al traidor gana 5 lire");
r = await call("estado");
ok(r.data.traditori === null, "antes de revelar, el traidor sigue oculto");
await madrina({ action: "rivela", valor: true });
r = await call("estado");
ok(r.data.traditori?.[0]?.name === traitor.name, `revelación pública: ${traitor.name}`);

const page = await fetch(BASE + "/");
ok((page.headers.get("content-security-policy") ?? "").includes("frame-src https://open.spotify.com"), "CSP presente en /");
ok(page.headers.get("x-content-type-options") === "nosniff" && !!page.headers.get("referrer-policy"), "nosniff y Referrer-Policy presentes");
for (const p of ["/", "/invitacion/", "/stanza/", "/stanza/madrina/", "/stanza/pantalla/"]) ok((await fetch(BASE + p)).status === 200, `${p} responde 200`);

console.log(fails ? `\n${fails} fallas` : "\nTodo el recorrido pasó.");
process.exit(fails ? 1 : 0);
