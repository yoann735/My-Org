// gestes communs aux scénarios v1.2
import { writeFileSync, mkdirSync } from 'node:fs';
export const DOSSIER_CAPTURES = process.env.CAPTURES || '/tmp/captures-v12';
export async function capture(X, nom) {
  mkdirSync(DOSSIER_CAPTURES, { recursive: true });
  const r = await X.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${DOSSIER_CAPTURES}/${nom}.png`, Buffer.from(r.data, 'base64'));
}
/** écran avec l'encart « Aujourd'hui » : Réviser (ordinateur) / accueil (téléphone) */
export async function versEncart(X) {
  if (await X.ev(`!!document.querySelector('.sfa')`)) return;
  if (await X.ev(`!!document.querySelector('.sfc')`)) { await X.ev(`document.querySelector('.sfc-quitter').click(), true`); await X.dormir(800); }
  if (await X.ev(`!!document.querySelector('.sfa')`)) return;
  await X.ev(`(() => { const el = [...document.querySelectorAll('.sb-item, button, a')].find((b) => /^Réviser/.test((b.getAttribute('title') || b.textContent || '').trim())); if (el) el.click(); return !!el; })()`);
  await X.attendre(`!!document.querySelector('.sfa')`);
}
/** lecture de l'encart : { texte, rev, app } (nombres des boutons « Révisions (n) · Apprentissage (n) ») */
export async function encart(X) {
  return X.ev(`(() => { const s = document.querySelector('.sfa'); if (!s) return null; const t = s.textContent.replace(/\\s+/g,' ').trim();
    const n = (re) => { const m = re.exec(t); return m ? +m[1] : 0; };
    return { texte: t, rev: n(/Révisions \\((\\d+)\\)/), app: n(/Apprentissage \\((\\d+)\\)/) }; })()`);
}
/** un pas de séance : présentation → « Compris » ; test → réponse puis « Su » ; révision → « Facile » */
export async function pas(X, { su = true } = {}) {
  if (await X.clic('Commencer l’apprentissage') || await X.clic("Commencer l'apprentissage")) { await X.dormir(400); return 'transition'; }
  if (await X.clic('Compris, suivante')) { await X.dormir(350); return 'presentee'; }
  if (await X.clic('Voir la réponse')) await X.dormir(250);
  if (await X.clic('Facile')) { await X.dormir(350); return 'revision'; }
  if (await X.clic(su ? 'Su' : 'Pas su', '.sfc-notes button')) { await X.dormir(350); return su ? 'su' : 'pas su'; }
  return null;
}
export const carteVue = (X) => X.ev(`(() => { const c = document.querySelector('.sfc-carte'); return c ? { id: c.dataset.carte, serie: +c.dataset.serie } : null; })()`);
export const progression = (X) => X.ev(`(document.querySelector('.sfc-prog') || {}).textContent || ''`);
/** crée n flashcards (même enregistrement que saveQuestion : put('questions'), départ aujourd'hui) */
export async function creerCartes(X, prefixe, n, fiches = ['fA', 'fB']) {
  return X.ev(`(async () => { const st = ${X.mod('storage.js')}; const sm2 = ${X.mod('sm2.js')}; const t = sm2.todayISO(); const ids = [];
    for (let i = 1; i <= ${n}; i++) { const id = '${prefixe}' + i; ids.push(id); await st.put('questions', { id, type: 'flashcard', ficheId: ${JSON.stringify(fiches)}[i % ${fiches.length}], recto: 'Créée ${prefixe} ' + i, verso: 'v', ...sm2.startAdaptive(t), historique: [] }); }
    return ids; })()`);
}
export const sansDoublon = (l) => new Set(l).size === l.length;
