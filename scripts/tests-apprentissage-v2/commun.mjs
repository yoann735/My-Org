// Banc « Apprentissage v2 / recherche / tags / boîtes » (25/10, docs/compte-rendu-apprentissage-v2-recherche-tags.md).
// Vite :5199 SANS Supabase + Chrome headless isolé (CDP_PORT, défaut 9341) dont le profil est une COPIE restaurée
// des vraies données (reset.sh du scratchpad) : jamais le vrai cloud.
import { banc as bancSC } from '../tests-seance-categories/commun.mjs';
export async function banc(W = 1440, H = 900, opts = {}) {
  const b = await bancSC(W, H, opts);
  // empreinte de TOUT ce que la méthode des J / FSRS / le journal possèdent (cartes entières, journal, séance du jour)
  b.empreinte = () => b.ev(`(async () => {
    const S = ${b.mod('storage.js')}; const J = ${b.mod('journal.js').replace("'/src/medrevise/lib/journal.js'", "'/src/medrevise/journal/journal.js'")};
    const q = (await S.getAll('questions')).sort((a, b) => a.id < b.id ? -1 : 1);
    const j = (await J.toutLeJournal()).sort((a, b) => String(a.id) < String(b.id) ? -1 : 1);
    const seance = await S.getMeta('seanceFC');
    const h = async (x) => { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(x))); return [...new Uint8Array(d)].slice(0, 8).map((v) => v.toString(16).padStart(2, '0')).join(''); };
    const fc = q.filter((x) => x.type === 'flashcard');
    return { cartes: q.length, flashcards: fc.length, journal: j.length,
      hCartes: await h(q), hPlanif: await h(fc.map((x) => [x.id, x.dueDate, x.j0Date, x.intervalDays, x.fsrs, x.historique, x.nouvelle, x.updatedAt])), hJournal: await h(j), hSeance: await h(seance || null) };
  })()`);
  // cible amenée à l'écran avant le vrai toucher / clic (feuilles et listes qui défilent)
  const toucher0 = b.toucher;
  b.toucher = async (js, att) => { await b.ev(`(() => { const e = ${js}; e && e.scrollIntoView && e.scrollIntoView({ block: 'center' }); return 1; })()`); await b.dormir(120); return toucher0(js, att); };
  b.apprentissage = async () => {
    const ok = await b.ev(`(() => { const x = document.querySelector('.sb-item[data-onglet="apprlibre"]'); if (!x) return false; x.click(); return true; })()`);
    if (!ok) { // téléphone : l'entrée de l'accueil
      await b.ev(`(() => { const x = document.querySelector('.alib-entree'); x && x.click(); return 1; })()`);
    }
    await b.attendre(`!!document.querySelector('.alib2')`, 15000);
    await b.dormir(800);
  };
  b.compteur = () => b.ev(`+((document.querySelector('[data-compteur]') || {}).dataset || {}).compteur`);
  b.vignettes = () => b.ev(`document.querySelectorAll('.alib2-carte').length`);
  b.taper = async (sel, texte) => {
    await b.toucher(sel, 200);
    await b.ev(`(() => { const i = ${sel}; i.focus(); i.select && i.select(); return 1; })()`);
    await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 4, commands: ['selectAll'] });
    await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 4 });
    await b.send('Input.insertText', { text: texte });
    await b.dormir(500);
  };
  return b;
}
