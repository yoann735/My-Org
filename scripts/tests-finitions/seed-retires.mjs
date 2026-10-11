// Finitions (11/10) — données des fonctionnalités RETIRÉES, au format qu'elles avaient (profil de TEST A) :
// un document de Prise de notes non rangé (store `notes`) avec un surlignage et une boîte, un document
// déjà rangé (fiche `priseDeNotes`), une unité d'« Apprentissage (exos) » (store `apprentissage`).
import { appareil } from '../tests-collage/outils.mjs';
const A = await appareil(9335);
const r = await A.ev(`(async () => {
  const st = ${A.st};
  const myo = await st.getOne('fiches', 'fMyo');
  const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
  await st.put('notes', { id: 'nArch', titre: 'Notes — plexus brachial', pdfId: myo.pdfId, pdfName: 'plexus-brachial.pdf', origine: 'pdf', createdAt: '2026-10-02T09:00:00.000Z' });
  await st.put('highlights', { id: 'hArch', ficheId: 'nArch', page: 1, texte: 'Le plexus brachial naît des racines C5 à T1', couleur: 'ambre', rects: [{ x: 0.1, y: 0.1, width: 0.5, height: 0.02 }], createdAt: '2026-10-02T09:01:00.000Z' });
  await st.put('annotations', { ...st.newNoteBox({ ficheId: 'nArch', page: 1, x: 0.1, y: 0.2, width: 0.3, height: 0.08, content: doc('Tronc supérieur : C5–C6') }), id: 'aArch' });
  await st.put('fiches', { id: 'nRangee', matiereId: 'mAL', dossierId: null, titre: 'Notes rangées — épaule', sousTitre: 'Prise de notes', type: 'standard', pdfId: myo.pdfId, pdfName: 'epaule.pdf', dateImport: '2026-10-03', priseDeNotes: { origine: 'pdf', createdAt: '2026-10-03T09:00:00.000Z', rangeeLe: '2026-10-04T09:00:00.000Z' } });
  await st.put('apprentissage', { id: 'uExo', titre: 'Unité exos — bras', matiereId: 'mAL', pdfId: myo.pdfId, pdfName: 'bras.pdf', items: [{ id: 'x1', type: 'qcm', enonce: 'Le biceps est innervé par ?', options: [{ id: 'a', texte: 'musculo-cutané' }], reponses_correctes: ['a'] }], createdAt: '2026-10-01T09:00:00.000Z' });
  return 'ok';
})()`);
console.log('seed retirés', r, A.erreurs);
A.fermer();
