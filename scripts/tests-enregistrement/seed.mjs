// Jeu de test du banc « enregistrement » : écrit sur l'ORDINATEUR (profil neuf, faux Supabase), envoyé par la synchro.
//   - cours « Glandes (test) » : PDF de 40 pages, 30 boîtes réparties, 6 surlignages, 4 traits ;
//   - cours « Fiche jumelle (test) » : PDF de 6 pages + une fiche jumelle de 4 pages ;
//   - 6 flashcards (non-régression des séances) ;
//   puis une copie quotidienne sur le FAUX GitHub (« backup AAAA-MM-JJ »).
import { appareil, pdfDeTest, gh, sb, dormir } from './commun.mjs';
const A = await appareil('ordi');
await A.ouvrirApp();
const pdf40 = await pdfDeTest(40, 'Glandes'); const pdf6 = await pdfDeTest(6, 'Jumelle'); const pdfF = await pdfDeTest(4, 'Fiche résumée');
const r = await A.S(`
  if (await S.getOne('fiches', 'f-enr')) return 'déjà semé';
  const blob = (b64) => { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new Blob([u], { type: 'application/pdf' }); };
  await S.put('sources', { id: 'src-enr', nom: 'Section test' });
  await S.put('matieres', { id: 'mat-enr', nom: 'Histologie (test)', sourceId: 'src-enr' });
  const p40 = await S.putBlob(blob(${JSON.stringify(pdf40)})), p6 = await S.putBlob(blob(${JSON.stringify(pdf6)})), pF = await S.putBlob(blob(${JSON.stringify(pdfF)}));
  await S.put('fiches', { id: 'f-enr', matiereId: 'mat-enr', dossierId: null, titre: 'Glandes (test)', type: 'standard', pdfId: p40, pdfName: 'glandes.pdf', dateImport: '2026-11-10', ordre: 0 });
  await S.put('fiches', { id: 'f-jum', matiereId: 'mat-enr', dossierId: null, titre: 'Fiche jumelle (test)', type: 'standard', pdfId: p6, pdfName: 'jumelle.pdf', dateImport: '2026-11-10', ordre: 1 });
  await S.put('companion_pdf', { id: 'cp:f-jum', courseId: 'f-jum', fileId: pF, fileName: 'fiche-resumee.pdf', version: 1, nsAnnot: 'f-jum::fiche:1', nbPagesOrig: 6, nbPagesFiche: 4, versions: [], nonReplacees: [], importeLe: new Date().toISOString(),
    pageMap: { versOrig: [1, 2, 3, 4], versFiche: [1, 2, 3, 4, null, null] } });
  const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
  const boites = [];
  for (let i = 0; i < 30; i++) { const b = S.newNoteBox({ ficheId: 'f-enr', page: 1 + (i % 10), x: 0.55, y: 0.08 + 0.08 * Math.floor(i / 10), width: 0.3, height: 0.05 }); boites.push({ ...b, id: 'an-seed-' + i, content: doc('Boîte de test ' + i + ' : glande exocrine, acinus, canal excréteur') }); }
  await S.putMany('annotations', boites);
  for (let i = 0; i < 6; i++) await S.put('highlights', { ...S.newHighlight({ ficheId: 'f-enr', page: 1 + i, texte: 'Ligne 3', couleur: 'jaune', rects: [{ x: 0.08, y: 0.16, width: 0.4, height: 0.015 }] }), id: 'h-seed-' + i });
  for (let i = 0; i < 4; i++) await S.put('annotations', { ...S.newTrait({ ficheId: 'f-enr', page: 2, points: [[0.1, 0.5 + i * 0.03], [0.4, 0.52 + i * 0.03]] }), id: 'an-trait-' + i });
  const sm2 = await __imp('/src/medrevise/lib/sm2.js'); const t = sm2.todayISO();
  const fc = []; for (let i = 0; i < 6; i++) fc.push({ id: 'fc-enr-' + i, type: 'flashcard', ficheId: 'f-enr', theme: 'Glandes', recto: 'Question ' + i + ' ?', verso: 'Réponse ' + i, historique: [{ date: t, qualite: 3 }], nouvelle: false, intervalDays: 2, dueDate: t, j0Date: t });
  await S.putMany('questions', fc);
  return (await S.getAll('annotations')).length;`);
console.log('annotations semées', r);
// la synchro part (outbox + fichiers)
await A.send('Page.reload'); await dormir(4000);
await A.attendreSynchro(40000);
await dormir(4000);
const etat = await (await fetch('http://localhost:54399/__etat')).json();
console.log('faux cloud : lignes', etat.rows.length, 'fichiers', etat.blobs.length);
const copie = await gh('/__preparer?derniere=' + encodeURIComponent(new Date(Date.now() - 3600e3).toISOString()));
console.log('copie GitHub (faux)', JSON.stringify(copie).slice(0, 200));
A.fermerWs();
