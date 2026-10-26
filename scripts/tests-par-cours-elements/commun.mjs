// Banc « Regrouper par cours / éléments à révéler » (26/10, docs/compte-rendu-seance-categories.md et
// docs/compte-rendu-flashcards.md). Vite :5302 SANS Supabase (VITE_SUPABASE_URL vide) + Chrome headless isolés
// C (9337, ordinateur) et D (9338, téléphone), profils neufs : jamais le vrai cloud.
import { banc as bancAA } from '../tests-a-apprendre/commun.mjs';
export const COURS = ['Cours 1 — Rein', 'Cours 2 — Cœur', 'Cours 3 — Poumon', 'Cours 4 — Foie']; // ordre de la Bibliothèque
export async function banc(tel = false, W = tel ? 390 : 1440, H = tel ? 844 : 900) {
  process.env.CDP_FILTRE = '5302';
  process.env.CDP_PORT = tel ? '9338' : '9337';
  const b = await bancAA(W, H);
  b.seance = () => b.S(`return await S.getMeta('seanceFC')`);
  b.v = (c, m, d = '') => { if (!b.ok(c, m, d)) b.echecs = (b.echecs || 0) + 1; return c; };
  b.fin = () => { const errs = b.erreurs.filter((e) => !/validateDOMNesting/.test(e)); b.v(errs.length === 0, 'aucune erreur console', errs.join(' | ').slice(0, 300)); console.log(b.echecs ? `❌ ${b.echecs} échec(s)` : '✅ tout est vert'); process.exit(0); };
  b.lanceur = async () => {
    if (tel) { await b.ouvrirApp({ recharger: true }); await b.attendre(`!!document.querySelector('[data-sfa="lanceur"]')`, 20000); }
    else { await b.ouvrirApp({ recharger: true }); await b.reviser(); }
    await b.dormir(500);
  };
  b.parCours = (on) => b.ev(`(()=>{const s=document.querySelector('[data-sfa="par-cours"] .switch');if((s.getAttribute('aria-checked')==='true')!==${!!on})s.click();return s.getAttribute('aria-checked')})()`);
  b.tout = async () => { for (const c of ['nouvelles', 'revisions', 'retard']) { await b.cocher(c, true); await b.maximum(c, 'tout'); } await b.dormir(300); };
  return b;
}
