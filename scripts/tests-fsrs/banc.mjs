// Banc FSRS étape 2 — client CDP minimal (repris du banc v1.2), deux appareils : A = ordinateur (port 9335,
// 1440×900), B = téléphone (port 9336, 390×844). Faux Supabase local (scripts/faux-supabase.mjs),
// jamais le vrai cloud. Voir docs/compte-rendu-apprentissage-flashcards.md § v1.2.
export async function appareil(port) {
  const liste = await (await fetch(`http://localhost:${port}/json`)).json();
  const t = liste.find((x) => x.type === 'page' && x.url.includes(process.env.CDP_FILTRE || '5199'));
  await fetch(`http://localhost:${port}/json/activate/${t.id}`);
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const att = new Map(); const erreurs = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && att.has(m.id)) { const { ok, ko } = att.get(m.id); att.delete(m.id); m.error ? ko(new Error(JSON.stringify(m.error))) : ok(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') erreurs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') erreurs.push(m.params.args.map((a) => a.value || a.description).join(' '));
  });
  const send = (method, params = {}) => new Promise((ok, ko) => { const i = ++id; att.set(i, { ok, ko }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
    return r.result.value;
  };
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const attendre = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await dormir(150); } throw new Error('délai : ' + expr); };
  // clic sur le bouton (ou élément) visible dont le texte contient `texte`
  const clic = (texte, sel = 'button') => ev(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((b) => b.offsetParent !== null && !b.disabled && b.textContent.replace(/\\s+/g,' ').includes(${JSON.stringify(texte)})); if (!el) return false; el.click(); return true; })()`);
  const texte = (sel) => ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].map((e) => e.textContent.replace(/\\s+/g,' ').trim()).join(' | ')`);
  // modules de l'app : MÊME instance que l'app (URL prise dans les ressources chargées, voir mémoire « ?t= »)
  const mod = (nom) => `(await import(performance.getEntriesByType('resource').map((r) => r.name).find((n) => n.includes(${JSON.stringify(nom)})) || ${JSON.stringify('/src/medrevise/lib/' + nom)}))`;
  const seance = () => ev(`(async () => (await ${mod('storage.js')}.getMeta('seanceFC')) || null)()`);
  const cartes = () => ev(`(async () => (await ${mod('storage.js')}.getAll('questions')).map((q) => ({ id: q.id, recto: q.recto, learnState: q.learnState, learningStreak: q.learningStreak, learningPresented: q.learningPresented, learningIntroducedOn: q.learningIntroducedOn, dueDate: q.dueDate, intervalDays: q.intervalDays, historique: (q.historique||[]).length, updatedAt: q.updatedAt })))()`);
  const synchro = () => ev(`(window.dispatchEvent(new Event('online')), true)`);
  return { ws, send, ev, dormir, attendre, clic, texte, mod, seance, cartes, synchro, erreurs, fermer: () => ws.close() };
}
export const faux = async () => (await fetch('http://localhost:54399/__etat')).json();
