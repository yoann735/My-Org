// Banc « Tableau : choisir ce qui est masqué » (31/10, docs/compte-rendu-flashcards.md). Même banc que
// tests-par-cours-elements : Vite :5302 SANS Supabase + Chrome headless isolés C (9337, ordinateur) / D (9338, téléphone),
// profils neufs : jamais le vrai cloud. Jeu : tests-par-cours-elements/seed.mjs, plus une carte Tableau d'AVANT (témoin).
import { banc as bancTE, COURS } from '../tests-topographie-echap/commun.mjs';
export { COURS };
export const TITRE = 'Muscles de la fesse — masque choisi';
export const COLS = ['Muscle', 'Origine', 'Insertion', 'Action', 'Innervation'];
export const LIGNES = [['Grand glutéal', 'Ilium, sacrum', 'Tubérosité glutéale', 'Extension de hanche', 'Nerf glutéal inférieur'],
  ['Moyen glutéal', 'Face glutéale de l’ilium', 'Grand trochanter', 'Abduction', 'Nerf glutéal supérieur'],
  ['Petit glutéal', 'Ilium (sous le moyen)', 'Grand trochanter (avant)', 'Abduction, rotation médiale', 'Nerf glutéal supérieur'],
  ['Piriforme', 'Face pelvienne du sacrum', 'Bord sup. du grand trochanter', 'Rotation latérale', 'Nerf du piriforme']];
// le masque visé : colonne « Insertion » (2), ligne 2 (1), 3 cases isolées (0:4, 2:0, 3:3), la case 3:2 rendue visible, nom « Origine » masqué
export const MASQUE = (() => {
  const c = LIGNES.map((l) => l.map(() => false));
  for (let r = 0; r < 4; r++) c[r][2] = true;
  c[1] = [true, true, true, true, true];
  c[0][4] = true; c[2][0] = true; c[3][3] = true;
  c[3][2] = false;
  return { cellules: c, noms: [false, true, false, false, false] };
})();
export const NB_CACHEES = MASQUE.cellules.flat().filter(Boolean).length; // 10 cases
export const TEMOIN = { id: 'temoin-tableau', type: 'flashcard', ficheId: 'f5', theme: 'Témoin', recto: 'Ancien tableau : segments du néphron',
  verso: 'Segment : Tubule proximal · Rôle : Réabsorption\nSegment : Anse de Henle · Rôle : Concentration', historique: [{ date: '2026-10-19', qualite: 3 }], nouvelle: false,
  learnState: 'review', intervalDays: 30, dueDate: '2026-11-20', j0Date: '2026-09-21',
  tableau: { v: 1, colonnes: ['Segment', 'Rôle'], lignes: [['Tubule proximal', 'Réabsorption'], ['Anse de Henle', 'Concentration']] } };
export async function banc(tel = false, W, H) {
  const b = await bancTE(tel, W, H);
  b.temoins = () => b.S(`const q=(await S.getAll('questions')).filter(x=>x.id.startsWith('temoin-')).sort((a,c)=>a.id<c.id?-1:1);const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(q)));return q.length+':'+[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,16)`);
  b.semerTemoin = () => b.S(`await S.put('questions', ${JSON.stringify(TEMOIN)}); return 1`);
  // état d'une révision de tableau dans un conteneur : cases cachées, noms cachés, valeurs visibles, « Tout révéler »
  b.rev = (racine) => b.ev(`(()=>{const d=${racine};if(!d)return null;const t=d.querySelector('[data-tableau]');if(!t)return null;
    return {cachees:[...t.querySelectorAll('td.cachee')].map(x=>x.dataset.cellule),noms:[...t.querySelectorAll('th.cachee')].map(x=>x.dataset.nom),
      visibles:[...t.querySelectorAll('td[data-cellule]:not(.cachee)')].map(x=>x.dataset.cellule+'='+x.textContent),
      entetes:[...t.querySelectorAll('thead th[data-nom]')].map(x=>x.textContent),lignesBtn:t.querySelectorAll('.tb-ligne-btn').length,
      tout:(t.querySelector('.tb-tout-btn')||{}).textContent||''}})()`);
  return b;
}
