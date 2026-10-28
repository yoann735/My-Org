// Banc « Apprentissage : sélection libre + compteur de passages » (28/10, docs/compte-rendu-apprentissage-v2-recherche-tags.md).
// Faux Supabase local (scripts/faux-supabase.mjs, :54399, JOURNAL=1) + Vite :5300 (VITE_SUPABASE_URL=http://localhost:54399)
// + Chrome headless isolés A (9335, ordinateur 1440×900) et B (9336, téléphone 390×844, tactile), profils NEUFS : jamais le vrai cloud.
import { banc as bancAA } from '../tests-a-apprendre/commun.mjs';
export const COURS = ['Cours 1 — Rein', 'Cours 2 — Cœur', 'Cours 3 — Poumon', 'Cours 4 — Foie'];
export async function appareil(tel = false) {
  process.env.CDP_FILTRE = '5300';
  process.env.CDP_PORT = tel ? '9336' : '9335';
  const b = await bancAA(tel ? 390 : 1440, tel ? 844 : 900, { tactile: tel });
  b.tel = tel;
  b.echecs = 0;
  b.v = (c, m, d = '') => { if (!b.ok(c, m, d)) b.echecs++; return c; };
  b.fin = () => { const errs = b.erreurs.filter((e) => !/validateDOMNesting|Failed to load resource/.test(e)); b.v(errs.length === 0, 'aucune erreur console', errs.join(' | ').slice(0, 300)); console.log(b.echecs ? `❌ ${b.echecs} échec(s)` : '✅ tout est vert'); process.exit(0); };
  b.synchro = async (ms = 5000) => { await b.ev(`window.dispatchEvent(new Event('online'));1`); await b.dormir(ms); };
  b.selection = () => b.ev(`(() => { const x = document.querySelector('.alib2-selbarre'); return x ? { n: +x.dataset.selection, hors: +x.dataset.horsFiltre, texte: x.innerText.replace(/\\s+/g, ' ').trim() } : null; })()`);
  b.cocherCarte = (id) => b.toucher(`document.querySelector('.alib2-carte[data-carte="${id}"] .alib2-case input')`, 350);
  b.etatCours = (fid) => b.ev(`(() => { const c = document.querySelector('.alib2-cours[data-cours="${fid}"] [data-case-groupe] input'); return c ? (c.indeterminate ? 'partiel' : c.checked ? 'tout' : 'aucun') : null; })()`);
  b.etatMatiere = (mid) => b.ev(`(() => { const c = document.querySelector('.alib2-matiere[data-matiere="${mid}"] > .alib2-gtete [data-case-groupe] input'); return c ? (c.indeterminate ? 'partiel' : c.checked ? 'tout' : 'aucun') : null; })()`);
  // filtre Matière (ordinateur : puce ; téléphone : feuille du bas) — `noms` = matières à laisser cochées
  b.filtreMatieres = async (noms) => {
    if (tel) { if (!(await b.ev(`!!document.querySelector('.alib2-feuille')`))) await b.toucher(`document.querySelector('[data-puce="filtres"]')`, 600); }
    else if (!(await b.ev(`!!document.querySelector('.alib2-pop [data-choix="matieres"]')`))) await b.toucher(`document.querySelector('[data-puce="matieres"]')`, 400);
    const opts = await b.ev(`[...document.querySelectorAll('[data-choix="matieres"] .alib2-option')].map((e) => [e.querySelector('.alib2-onom').textContent, e.querySelector('input').checked])`);
    for (let i = 0; i < opts.length; i++) if (opts[i][1] !== noms.includes(opts[i][0])) await b.toucher(`[...document.querySelectorAll('[data-choix="matieres"] .alib2-option input')][${i}]`, 300);
    if (tel) await b.toucher(`document.querySelector('.alib2-fpied .btn')`, 500);
    else { await b.ev(`(window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})), 1)`); await b.dormir(300); }
  };
  b.puce = (cle) => tel
    ? (async () => { await b.toucher(`document.querySelector('[data-puce="filtres"]')`, 600); await b.toucher(`document.querySelector('.alib2-feuille [data-puce="${cle}"]')`, 400); await b.toucher(`document.querySelector('.alib2-fpied .btn')`, 500); })()
    : b.toucher(`document.querySelector('[data-puce="${cle}"]')`, 400);
  b.deplier = () => b.ev(`(() => { let n = 0; for (const t of document.querySelectorAll('.alib2-stete[aria-expanded="false"], .alib2-mtete[aria-expanded="false"], .alib2-ctete[aria-expanded="false"]')) { t.click(); n++; } return n; })()`);
  b.passagesBase = () => b.S(`const r = await S.getOne('learning_set', 'learning_set'); return (r && r.passages) || {};`);
  b.badges = () => b.ev(`Object.fromEntries([...document.querySelectorAll('.alib2-carte')].filter((c) => c.querySelector('[data-passages]')).map((c) => [c.dataset.carte, +c.querySelector('[data-passages]').dataset.passages]))`);
  b.reinitApprentissage = async () => {
    await b.ev(`['filtres','vue','selection','tri'].forEach((k) => localStorage.removeItem('medrevise.apprentissage.' + k)); 1`);
    await b.ouvrirApp(); await b.apprentissage(); await b.deplier(); await b.dormir(300);
  };
  return b;
}
