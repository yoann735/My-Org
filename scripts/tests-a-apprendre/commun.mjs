// Banc « Flashcards : liste, Agrandir, À apprendre » (26/10, docs/compte-rendu-flashcards.md).
// Faux Supabase local (scripts/faux-supabase.mjs, :54399) + Vite :5300 (VITE_SUPABASE_URL=http://localhost:54399)
// + Chrome headless isolés A (9335, ordinateur) et B (9336, téléphone) aux profils neufs : jamais le vrai cloud.
import { banc as bancV2 } from '../tests-apprentissage-v2/commun.mjs';
export const COURS = 'Flashcards test (200)';
export async function banc(W = 1440, H = 900, opts = {}) {
  process.env.CDP_FILTRE = process.env.CDP_FILTRE || '5300';
  const b = await bancV2(W, H, opts);
  // ouvrir un cours depuis la Bibliothèque (vrai clic) — même logique que tests-fiche-jumelle/commun.mjs
  b.ouvrirCours = async (titre = COURS, { recharger = false } = {}) => {
    if (recharger) { await b.send('Page.reload', { ignoreCache: true }); await b.dormir(4500); }
    if (await b.ev(`document.body.innerText.includes('Choisis ton espace')`)) { await b.ev(`[...document.querySelectorAll('.hub-card')].find(x=>/^\\s*MedRevise/i.test(x.innerText))?.click();1`); await b.dormir(1500); }
    await b.ev(`(()=>{const x=[...document.querySelectorAll('.sb-item, .sidebar [role=button], .sidebar button, .sidebar a')].find(e=>/Biblioth/.test(e.innerText||e.title||''));x&&x.click();return 1})()`); await b.dormir(1200);
    await b.ev(`(()=>{const r=[...document.querySelectorAll('button')].find(x=>(x.title||'')==='Revenir à la liste'||x.getAttribute('aria-label')==='Retour');r&&r.click();return 1})()`); await b.dormir(800);
    const pos = await b.ev(`(()=>{const l=[...document.querySelectorAll('.lt-fiche')].find(e=>e.innerText.trim().startsWith(${JSON.stringify(titre)}));if(!l)return null;l.scrollIntoView({block:'center'});const r=l.getBoundingClientRect();return [r.x+Math.min(60,r.width/3),r.y+r.height/2]})()`);
    if (pos) for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type, x: pos[0], y: pos[1], button: 'left', clickCount: 1 });
    await b.dormir(2500);
    return !!(await b.ev(`!!document.querySelector('.pdfr-scroll')`));
  };
  // panneau : mode Exercices › Flashcards
  b.ongletFlashcards = async () => {
    await b.ev(`(()=>{const m=[...document.querySelectorAll('.pm-seg-btn')].find(x=>/Exercices/.test(x.title));m&&m.click();return 1})()`); await b.dormir(700);
    await b.ev(`(()=>{const t=[...document.querySelectorAll('.pm-sous-btn')].find(x=>/Flashcards/.test(x.textContent));t&&t.click();return 1})()`); await b.dormir(700);
  };
  b.carteListe = (id) => `document.querySelector('.pis-item[data-item="${id}"]')`;
  // survol (les actions d'une carte de la liste n'apparaissent qu'au survol à la souris)
  b.survol = async (js) => { await b.ev(`(()=>{const e=${js};e&&e.scrollIntoView({block:'center'});return 1})()`); await b.dormir(150); const r = await b.rect(js); await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.cx, y: r.cy }); await b.dormir(200); return r; };
  b.carteBase = (id) => b.S(`return await S.getOne('questions', ${JSON.stringify(id)})`);
  b.toast = () => b.ev(`(document.querySelector('[data-toast="aap"]')||{}).textContent||''`);
  return b;
}
