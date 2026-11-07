// Jeu de test du banc « vues + zoom » (07/11). Écrit sur l'ORDINATEUR (profil neuf, faux Supabase) puis laisse la synchro
// l'envoyer ; les deux autres appareils le reçoivent (node seed.mjs puis node t-*.mjs).
//   - 4 cours × 10 cartes (jeu tests-selection-passages) + cours « Images » : texte+image au recto, au verso, aux deux faces,
//     image à masques (2 masques), Muscle avec image générale au recto ;
//   - journal : vues voulues par carte (0, 1, 2, 3, 5, 6, 10, 11, 14) + événements « Passer en révision » (rating null,
//     ne comptent pas) + répétitions de séance (relearn, comptent : ce sont des notations aux 4 boutons) ;
//   - `gros` (argument « gros ») : + 1 500 cartes dans 30 cours et 9 000 entrées de journal, pour la mesure de vitesse.
import { dispositif } from './commun.mjs';
import { COURS } from '../tests-selection-passages/commun.mjs';
const GROS = process.argv.includes('gros');
const A = await dispositif('ordi');
await A.recharger();
const r = await A.S(`
  const sm2 = await import('/src/medrevise/lib/sm2.js');
  const J = await import('/src/medrevise/journal/journal.js');
  const today = sm2.todayISO();
  const j = (n) => { const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('fr-CA'); };
  await S.putMany('sources', [{ id: 's1', nom: 'Section 1', rappelsJ: true }, { id: 's2', nom: 'Section 2', rappelsJ: true }]);
  await S.putMany('matieres', [{ id: 'mA', sourceId: 's1', nom: 'Néphro-cardio', ordre: 0 }, { id: 'mB', sourceId: 's1', nom: 'Pneumo', ordre: 1 }, { id: 'mC', sourceId: 's2', nom: 'Hépato', ordre: 0 }, { id: 'mI', sourceId: 's2', nom: 'Anatomie', ordre: 1 }]);
  const C = ${JSON.stringify(COURS)};
  await S.putMany('fiches', [{ id: 'f4', matiereId: 'mC', titre: C[3], type: 'standard', ordre: 0 }, { id: 'f2', matiereId: 'mA', titre: C[1], type: 'standard', ordre: 1 },
    { id: 'f1', matiereId: 'mA', titre: C[0], type: 'standard', ordre: 0 }, { id: 'f3', matiereId: 'mB', titre: C[2], type: 'standard', ordre: 0 }, { id: 'f6', matiereId: 'mI', titre: 'Cours Images', type: 'standard', ordre: 0 }]);
  const H = [{ date: j(-12), qualite: 3 }];
  const cartes = [];
  for (const k of [1, 2, 3, 4]) {
    const fc = (id, o) => ({ id, type: 'flashcard', ficheId: 'f' + k, theme: 'C' + k, recto: 'Cours ' + k + ' · ' + id, verso: 'Réponse ' + id, ...o });
    [1, 2, 3].forEach((n) => cartes.push(fc('c' + k + '-retard' + n, { historique: H, nouvelle: false, intervalDays: 3, dueDate: j(-n - k), j0Date: j(-20) })));
    [1, 2, 3, 4].forEach((n) => cartes.push(fc('c' + k + '-rev' + n, { historique: H, nouvelle: false, intervalDays: 4, dueDate: today, j0Date: j(-20) })));
    [1, 2, 3].forEach((n) => cartes.push(fc('c' + k + '-nouv' + n, { historique: [], nouvelle: true, dueDate: j(-n), j0Date: j(-n) })));
  }
  // images : une mire (quadrillage + texte) — le zoom s'y voit
  const mire = async (titre, couleur, w = 800, h = 560) => {
    const cv = new OffscreenCanvas(w, h); const g = cv.getContext('2d');
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c9c2b3'; g.lineWidth = 1; for (let x = 0; x <= w; x += 20) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y <= h; y += 20) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.fillStyle = couleur; g.beginPath(); g.arc(w * 0.3, h * 0.5, h * 0.28, 0, 7); g.fill();
    g.fillStyle = '#1b1b2b'; g.font = 'bold 44px sans-serif'; g.fillText(titre, 40, 70); g.font = '13px sans-serif'; g.fillText('petit texte lisible seulement agrandi — ' + titre, w * 0.55, h * 0.85);
    return S.putBlob(new File([await cv.convertToBlob({ type: 'image/png' })], titre + '.png', { type: 'image/png' }));
  };
  const iR = await mire('Recto', '#2bb3a3'), iV = await mire('Verso', '#e08a3c'), iD = await mire('Deux faces', '#8b6fe8'), iO = await mire('Masques', '#d64f6a'), iM = await mire('Biceps', '#4f7fd6');
  const im = (id, o) => ({ id, type: 'flashcard', ficheId: 'f6', theme: 'Images', historique: H, nouvelle: false, intervalDays: 4, dueDate: today, j0Date: j(-20), ...o });
  cartes.push(im('img-recto', { recto: 'Quelle structure ? (image au recto)', verso: 'Le cercle teal.', imageId: iR, imagePlace: 'recto' }));
  cartes.push(im('img-verso', { recto: 'Image au verso : laquelle ?', verso: 'Le cercle orange.', imageId: iV, imagePlace: 'verso' }));
  cartes.push(im('img-deux', { recto: 'Image aux deux faces', verso: 'Le cercle violet.', imageId: iD, imagePlace: 'deux' }));
  cartes.push(im('img-occ', { recto: 'Que cachent les masques ?', verso: '', versoAuto: true, occlusion: { imageId: iO, imageW: 800, imageH: 560, coches: [
    { id: 'z1', kind: 'zone', texte: 'Cercle', zone: { type: 'rect', rect: { x: 0.12, y: 0.25, w: 0.36, h: 0.5 } } },
    { id: 'z2', kind: 'zone', texte: 'Légende', zone: { type: 'rect', rect: { x: 0.55, y: 0.78, w: 0.4, h: 0.1 } } }] } }));
  cartes.push(im('img-muscle', { recto: 'Biceps brachial', verso: '', muscle: { lignes: { origine: 'Coracoïde', trajet: 'Vertical', insertion: 'Tubérosité radiale', innervation: 'Musculo-cutané', vascularisation: 'A. brachiale', action: 'Flexion du coude' }, imageGenerale: { imageId: iM, auRecto: true } } }));
  await S.putMany('questions', cartes);
  const ls = (await S.getOne('learning_set', 'learning_set')) || { id: 'learning_set', cardIds: [] };
  await S.put('learning_set', { ...ls, passages: { 'c1-rev1': 2 } }); // ×2 du mode Apprentissage : ne doit RIEN changer au compteur de vues
  // vues voulues (notations aux 4 boutons) ; c3-rev1 : 2 notées + 1 répétition (relearn) = 3 ; c3-rev2 : 0 note + 2 « Passer en révision »
  const VUES = { 'c1-retard1': 1, 'c1-retard2': 2, 'c1-retard3': 3, 'c1-rev1': 5, 'c1-rev2': 6, 'c1-rev3': 10, 'c1-rev4': 11, 'c2-retard1': 14, 'c2-rev1': 2, 'img-recto': 4 };
  let n = 0;
  const entree = (carte, rating, extra = {}) => ({ id: 'seed-' + (n++), card_id: carte, rating, reviewed_at: new Date(Date.now() - (100000 - n) * 60000).toISOString(), jour: j(-1), device: 'banc', scheduler_version: 'banc', planificateur: 'maison', state_before: null, state_after: null, details: {}, ...extra });
  const lot = [];
  for (const [carte, v] of Object.entries(VUES)) for (let i = 0; i < v; i++) lot.push(entree(carte, 1 + (i % 4)));
  lot.push(entree('c3-rev1', 3), entree('c3-rev1', 1), entree('c3-rev1', 3, { details: { relearn: true } }));
  lot.push(entree('c3-rev2', null, { details: { evenement: 'passage_revision' } }), entree('c3-rev2', null, { details: { evenement: 'passage_revision' } }));
  for (const e of lot) await J.ajouterAuJournal(e);
  return { today, cartes: cartes.length, journal: lot.length };
`);
console.log('seed', JSON.stringify(r));
if (GROS) {
  const g = await A.S(`
    const J = await import('/src/medrevise/journal/journal.js');
    const sm2 = await import('/src/medrevise/lib/sm2.js'); const today = sm2.todayISO();
    const fiches = []; for (let k = 0; k < 30; k++) fiches.push({ id: 'g' + k, matiereId: 'mB', titre: 'Gros cours ' + (k + 1), type: 'standard', ordre: 10 + k });
    await S.putMany('fiches', fiches);
    const cartes = []; for (let i = 0; i < 1500; i++) cartes.push({ id: 'g-' + i, type: 'flashcard', ficheId: 'g' + (i % 30), theme: 'G', recto: 'Question volumineuse numéro ' + i + ' — anatomie, physiologie et pathologie du système', verso: 'Réponse ' + i + ' avec un peu de texte pour la vignette, sur deux lignes au moins pour ressembler aux vraies cartes.', historique: [{ date: today, qualite: 3 }], nouvelle: false, intervalDays: 40, dueDate: '2099-01-01', j0Date: today });
    await S.putMany('questions', cartes);
    // 9 000 entrées en une fois (même stockage que le journal ; pas une par une : trop lent pour un banc)
    const idb = await import('/node_modules/.vite/deps/idb-keyval.js').catch(() => import('idb-keyval'));
    const store = idb.createStore('medrevise-review_log', 'v1');
    const l = []; for (let i = 0; i < 9000; i++) l.push(['gros-' + i, { id: 'gros-' + i, card_id: 'g-' + ((i * 7) % 1500), rating: 1 + (i % 4), reviewed_at: new Date(Date.now() - i * 60000).toISOString(), jour: today, device: 'banc', scheduler_version: 'banc', planificateur: 'maison', state_before: null, state_after: null, details: {} }]);
    await idb.setMany(l, store);
    return { cartes: cartes.length, journal: l.length };
  `);
  console.log('gros', JSON.stringify(g));
}
await A.ev(`(window.dispatchEvent(new Event('online')), 1)`); await A.attendrePhase(['ajour'], 90000); await A.dormir(3000);
console.log('synchro', await A.phase(), A.erreurs.join(' | ').slice(0, 300));
process.exit(0);
