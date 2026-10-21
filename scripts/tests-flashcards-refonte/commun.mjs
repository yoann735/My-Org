// Banc de la refonte de l'onglet Flashcards (22/10, docs/compte-rendu-tableau-flashcards.md §6) — Vite :5199 SANS
// Supabase + Chrome headless 9333, base LOCALE seulement. Cours « Rein v3 » (f-v3-rein).
export { banc } from '../tests-pdfreader-v3/commun.mjs';
export const COURS = 'f-v3-rein';
const base = { ficheId: COURS, type: 'flashcard', difficulte: 'intermediaire', createdAt: '2026-10-20T10:00:00.000Z', updatedAt: '2026-10-20T10:00:00.000Z', interval: 0, palier: 0, historique: [] };
/** une carte de chaque sorte (ids « fa- ») */
export const CARTES = [
  { ...base, id: 'fa-texte', theme: 'Néphron', concept: 'Néphron', recto: 'Définis : le néphron', verso: 'Unité fonctionnelle du rein', indice: 'Unité…', a_retenir: '1 million par rein' },
  { ...base, id: 'fa-trou', theme: 'Néphron', concept: 'Néphron', recto: 'Le {{glomérule}} filtre le plasma', verso: 'glomérule', cloze: ['glomérule'] },
  { ...base, id: 'fa-muscle', theme: 'Muscles', concept: 'Muscles', recto: 'Grand fessier', verso: 'Tableau muscle', muscle: { v: 1, nom: 'Grand fessier', lignes: { origine: 'Ilium, sacrum, coccyx', trajet: 'Oblique en bas et en dehors', insertion: 'Tubérosité glutéale', action: 'Extension de hanche', innervation: 'Nerf glutéal inférieur' } } },
  { ...base, id: 'fa-tableau', theme: 'Tubule', concept: 'Tubule', recto: 'Segments du tubule', verso: 'Tableau', tableau: { v: 1, colonnes: ['Segment', 'Rôle'], lignes: [['TCP', 'Réabsorption'], ['Anse de Henle', 'Concentration']] } },
  { ...base, id: 'fa-molecule', theme: 'Chimie', concept: 'Chimie', recto: 'Glucose', verso: 'C6H12O6', molecule: { v: 1, nom: 'Glucose', smiles: 'OCC1OC(O)C(O)C(O)C1O', formule: 'C6H12O6', sens: 'nom-molecule', comparaison: 'constitution', biblio: null } },
];
export async function semer(b, { avecImage = true } = {}) {
  const img = avecImage ? await b.S(`const c=document.createElement('canvas');c.width=320;c.height=180;const x=c.getContext('2d');x.fillStyle='#2563eb';x.fillRect(0,0,320,180);x.fillStyle='#fff';x.font='bold 36px sans-serif';x.fillText('Rein',110,100);const bl=await new Promise(o=>c.toBlob(o,'image/png'));return await S.putBlob(bl)`) : null;
  const cartes = [...CARTES, ...(img ? [{ ...base, id: 'fa-image', theme: 'Néphron', concept: 'Néphron', recto: 'Que montre l’image ?', verso: 'Le rein', imageId: img, imagePlace: 'recto' }] : [])];
  await b.S(`for(const q of await S.getAll('questions'))if(q.ficheId===${JSON.stringify(COURS)})await S.remove('questions',q.id);for(const q of ${JSON.stringify(cartes)})await S.put('questions',q);return 1`);
  return cartes;
}
/** ouvre le cours, le panneau sur Exercices › Flashcards */
export async function ouvrirFlashcards(b, { appareil = 'ordinateur' } = {}) {
  await b.biblio({ recharger: true });
  await b.ouvrir('Rein v3'); await b.dormir(1500);
  if (appareil === 'ipad') { await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1366, deviceScaleFactor: 2, mobile: true }); await b.dormir(1800); }
  if (appareil === 'mobile') { await b.c.send('Emulation.setDeviceMetricsOverride', { width: 768, height: 1024, deviceScaleFactor: 2, mobile: true }); await b.dormir(1800); }
  const tape = (p) => (appareil === 'ordinateur' ? b.clic(p, { att: 600 }) : b.tape(p));
  await tape(await b.pos(`[...document.querySelectorAll('.pm-seg-btn')].find(x=>x.innerText.trim().startsWith('Exercices'))`, false));
  await tape(await b.pos(`[...document.querySelectorAll('.pm-sous-btn')].find(x=>x.innerText.trim().startsWith('Flashcards'))`, false));
  await b.dormir(600);
  return tape;
}
/** rectangle du panneau (capture) */
export const panneau = (b, h = null) => b.ev(`(()=>{const r=document.querySelector('.pis-body').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(${h ? `Math.min(r.height,${h})` : 'r.height'})}})()`);
