// jeu de test v1.2 sur l'appareil A : 1 cours, 1 matière, 2 fiches ; 4 révisions échues aujourd'hui,
// 8 cartes neuves (date de départ aujourd'hui, sans learnState — comme une carte créée par l'app)
import { appareil, faux } from './banc.mjs';
const A = await appareil(9335);
const r = await A.ev(`(async () => {
  const st = ${A.mod('storage.js')}; const sm2 = ${A.mod('sm2.js')};
  const today = sm2.todayISO();
  await st.put('sources', { id: 'sTest', nom: 'Cours test v1.2', rappelsJ: true });
  await st.put('matieres', { id: 'mTest', sourceId: 'sTest', nom: 'Physiologie test', couleur: 'blue' });
  await st.putMany('fiches', [{ id: 'fA', matiereId: 'mTest', titre: 'Fiche A', type: 'standard' }, { id: 'fB', matiereId: 'mTest', titre: 'Fiche B', type: 'standard' }]);
  const q = [];
  for (let i = 1; i <= 4; i++) q.push({ id: 'qRev' + i, type: 'flashcard', ficheId: i % 2 ? 'fA' : 'fB', recto: 'Révision ' + i, verso: 'R' + i, learnState: 'review', intervalDays: 3, dueDate: today, capped: false, termine: false, historique: [{ date: '2026-10-07', qualite: 2 }] });
  for (let i = 1; i <= 8; i++) q.push({ id: 'qNew' + i, type: 'flashcard', ficheId: i % 2 ? 'fA' : 'fB', recto: 'Nouvelle ' + i, verso: 'N' + i, ...sm2.startAdaptive(today), historique: [] });
  await st.putMany('questions', q);
  return today;
})()`);
await A.synchro(); await A.dormir(4000);
const e = await faux();
console.log('jour', r, '· cloud (faux) : questions', e.rows.filter((x) => x.store === 'questions').length, '· fiches', e.rows.filter((x) => x.store === 'fiches').length, '· erreurs A', A.erreurs);
A.fermer();
const B = await appareil(9336);
await B.synchro(); await B.dormir(4000);
console.log('B reçoit :', (await B.cartes()).length, 'cartes ·', (await B.texte('.sfa')).slice(0, 120), '· erreurs B', B.erreurs);
B.fermer();
