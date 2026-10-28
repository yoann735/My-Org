// Banc « synchro complète avant affichage » (28/10, docs/compte-rendu-synchro-avant-affichage.md). Même installation que
// scripts/tests-selection-passages : faux Supabase local (:54399, JOURNAL=1), Vite :5300 (VITE_SUPABASE_URL=http://localhost:54399),
// Chrome headless A (9335, ordinateur) et B (9336, téléphone tactile), profils NEUFS — jamais le vrai cloud.
// Jeu : ../tests-selection-passages/seed.mjs (4 cours × 10 cartes : 3 Retard, 4 Révisions, 3 Nouvelles).
import { appareil as app } from '../tests-selection-passages/commun.mjs';
export const faux = async () => (await fetch('http://localhost:54399/__etat')).json();
// ENREGISTREUR posé AVANT le chargement de la page : chaque état affiché (Retard, Révisions, Nouvelles, chiffre de l'accueil
// téléphone, bandeau) est noté à chaque mutation du DOM — on prouve ainsi qu'aucune valeur intermédiaire n'a été montrée.
export const ENREGISTREUR = `(() => {
  window.__vus = []; let dernier = '';
  const cat = (c) => { const e = document.querySelector('[data-sfa="lanceur"] [data-cat="' + c + '"]'); if (!e) return null;
    if (e.querySelector('[data-chiffre="attente"]')) return 'attente'; const n = e.querySelector('.sfa-cat-n[data-n]'); return n ? +n.dataset.n : null; };
  const hero = () => { const h = document.querySelector('[data-hero="n"]'); return h ? (h.querySelector('[data-chiffre="attente"]') ? 'attente' : +h.textContent) : null; };
  const lire = () => { const b = document.querySelector('[data-bandeau-synchro]');
    const d = document.querySelector('[data-sfa="demarrer"]');
    return JSON.stringify({ retard: cat('retard'), revisions: cat('revisions'), nouvelles: cat('nouvelles'), hero: hero(), bandeau: b ? b.dataset.bandeauSynchro : null, texte: b ? b.innerText : null, demarrer: d ? (d.disabled ? 'off' : 'on') : null }); };
  const noter = () => { const v = lire(); if (v !== dernier) { dernier = v; window.__vus.push([Math.round(performance.now()), JSON.parse(v)]); } };
  new MutationObserver(noter).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
})();`;
export async function appareil(tel) {
  const b = await app(tel);
  b.bandeau = () => b.ev(`(() => { const x = document.querySelector('[data-bandeau-synchro]'); return x ? { phase: x.dataset.bandeauSynchro, texte: x.innerText } : null; })()`);
  b.phase = () => b.ev(`document.documentElement.getAttribute('data-mr-synchro')`);
  b.attendrePhase = async (ph, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const p = await b.phase(); if (ph.includes(p)) return p; await b.dormir(100); } return await b.phase(); };
  b.vus = () => b.ev(`JSON.stringify(window.__vus || [])`).then(JSON.parse);
  b.chiffres = () => b.ev(`(() => { const n = (c) => { const e = document.querySelector('[data-sfa="lanceur"] [data-cat="' + c + '"] .sfa-cat-n[data-n]'); return e ? +e.dataset.n : null; }; return { retard: n('retard'), revisions: n('revisions'), nouvelles: n('nouvelles') }; })()`);
  // plan du jour calculé sur la base LOCALE (mêmes modules que l'écran) — sert à connaître la valeur « périmée »
  b.planLocal = () => b.ev(`(async () => { const S = ${b.mod('storage.js')}; const C = await import('/src/medrevise/lib/categoriesFC.js'); const P = await import('/src/medrevise/lib/planning.js'); const A = await import('/src/medrevise/lib/apprentissageFC.js'); const sm2 = await import('/src/medrevise/lib/sm2.js');
    const db = { sources: await S.getAll('sources'), matieres: await S.getAll('matieres'), fiches: await S.getAll('fiches'), questions: await S.getAll('questions') };
    const ix = P.index(db); const cartes = db.questions.filter((q) => A.estFlashcardJ(q) && P.isFicheScheduled(db, ix.fById[q.ficheId], ix));
    const c = C.categoriser(cartes, sm2.todayISO(), P.nextDate); return { retard: c.retard.length, revisions: c.revisions.length, nouvelles: c.nouvelles.length }; })()`);
  // séance « Révisions J » (Retard + Révisions, tout) : `n` réponses « Correct » (ordinateur ou téléphone)
  b.repondre = async (n) => {
    await b.attendre(`!!document.querySelector('[data-sfa="demarrer"]:not(:disabled)')`, 30000);
    await b.toucher(`document.querySelector('[data-raccourci="revisionsJ"]')`, 300);
    await b.maximum('retard', 'tout'); await b.maximum('revisions', 'tout');
    await b.toucher(`document.querySelector('[data-sfa="demarrer"]')`, 1200);
    await b.attendre(`!!document.querySelector('.sfc-carte')`, 15000);
    let k = 0;
    for (; k < n; k++) {
      if (!(await b.ev(`!!document.querySelector('.sfc-carte')`))) break;
      // retourner (un toucher peut tomber pendant un rendu : on retouche, 3 fois au plus)
      for (let essai = 0; essai < 3 && !(await b.ev(`!!document.querySelector('.sfc-bas [data-note="3"]')`)); essai++) {
        await b.toucher(`document.querySelector('.sfc-carte')`, 350);
        for (let i = 0; i < 12 && !(await b.ev(`!!document.querySelector('.sfc-bas [data-note="3"]')`)); i++) await b.dormir(150);
      }
      await b.attendre(`!!document.querySelector('.sfc-bas [data-note="3"]')`, 3000);
      await b.toucher(`document.querySelector('.sfc-bas [data-note="3"]')`, 450);
    }
    await b.ev(`(() => { const q = document.querySelector('.sfc-quitter'); q && q.click(); return 1; })()`); await b.dormir(800);
    return k;
  };
  return b;
}
