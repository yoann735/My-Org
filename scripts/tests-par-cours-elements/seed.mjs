// Jeu de test (C ou D selon l'argument « tel ») : 2 sections, 3 matières, 4 cours de 10 cartes (3 Retard, 4 Révisions,
// 3 Nouvelles), CRÉÉS dans le désordre (4, 2, 1, 3) — l'ordre de la Bibliothèque est 1, 2, 3, 4. Plus un cours « témoin »
// (cartes Texte et Muscle à venir, hors séance). Réécrit les mêmes ids : rejouable (remet la planification d'origine).
import { banc, COURS } from './commun.mjs';
const tel = process.argv[2] === 'tel';
const b = await banc(tel);
const url = await b.ev('location.href');
if (!url.includes('5302')) { await b.send('Page.navigate', { url: 'http://localhost:5302/' }); await b.dormir(3000); }
await b.ouvrirApp({ recharger: true });
const r = await b.S(`
  const sm2 = await import('/src/medrevise/lib/sm2.js');
  const { PDFDocument, StandardFonts } = await import('/node_modules/.vite/deps/pdf-lib.js');
  const pdf = async (t) => { const d = await PDFDocument.create(); const p = d.addPage([595, 842]); const f = await d.embedFont(StandardFonts.Helvetica); p.drawText(t, { x: 60, y: 760, size: 20, font: f }); return S.putBlob(new Blob([await d.save()], { type: 'application/pdf' })); };
  const today = sm2.todayISO();
  const j = (n) => { const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('fr-CA'); };
  // nettoyage d'une passe précédente (cartes créées par les tests dans ces cours)
  for (const q of await S.getAll('questions')) if (/^f[1-5]$/.test(q.ficheId)) await S.remove('questions', q.id);
  await S.putMany('sources', [{ id: 's1', nom: 'Section 1', rappelsJ: true }, { id: 's2', nom: 'Section 2', rappelsJ: true }]);
  await S.putMany('matieres', [{ id: 'mA', sourceId: 's1', nom: 'Néphro-cardio', ordre: 0 }, { id: 'mB', sourceId: 's1', nom: 'Pneumo', ordre: 1 }, { id: 'mC', sourceId: 's2', nom: 'Hépato', ordre: 0 }]);
  const C = ${JSON.stringify(COURS)};
  const fiche = async (id, mat, titre, ordre) => ({ id, matiereId: mat, titre, type: 'standard', ordre, pdfId: await pdf(titre), dateImport: j(-30) });
  await S.putMany('fiches', [await fiche('f4', 'mC', C[3], 0), await fiche('f2', 'mA', C[1], 1), await fiche('f1', 'mA', C[0], 0), await fiche('f3', 'mB', C[2], 0), await fiche('f5', 'mC', 'Cours témoin', 1)]);
  const H = [{ date: j(-12), qualite: 3 }];
  const cartes = [];
  for (const [f, k] of [['f4', 4], ['f2', 2], ['f1', 1], ['f3', 3]]) {
    const fc = (id, o) => ({ id, type: 'flashcard', ficheId: f, theme: 'C' + k, recto: 'Cours ' + k + ' · ' + id, verso: 'Réponse ' + id, ...o });
    [1, 2, 3].forEach((n) => cartes.push(fc('c' + k + '-retard' + n, { historique: H, nouvelle: false, learnState: 'review', intervalDays: 3, dueDate: j(-[2, 9, 5][n - 1] - k), j0Date: j(-20) })));
    [1, 2, 3, 4].forEach((n) => cartes.push(fc('c' + k + '-rev' + n, { historique: H, nouvelle: false, learnState: 'review', intervalDays: 4, dueDate: today, j0Date: j(-20) })));
    [1, 2, 3].forEach((n) => cartes.push(fc('c' + k + '-nouv' + n, { historique: [], nouvelle: true, dueDate: j(-n), j0Date: j(-n) })));
  }
  cartes.push({ id: 'temoin-texte', type: 'flashcard', ficheId: 'f5', theme: 'Témoin', recto: 'Ancienne carte texte : quel est le rôle du néphron ?', verso: 'Filtrer le sang et former l’urine.', historique: H, nouvelle: false, learnState: 'review', intervalDays: 30, dueDate: j(20), j0Date: j(-40), a_retenir: 'Unité fonctionnelle du rein' });
  cartes.push({ id: 'temoin-muscle', type: 'flashcard', ficheId: 'f5', theme: 'Témoin', recto: 'Biceps brachial', verso: '', historique: H, nouvelle: false, learnState: 'review', intervalDays: 30, dueDate: j(20), j0Date: j(-40), muscle: { v: 1, lignes: { origine: 'Tubercule supra-glénoïdal', trajet: 'Loge antérieure', insertion: 'Tubérosité radiale', action: 'Flexion du coude', innervation: 'Nerf musculo-cutané' } } });
  await S.putMany('questions', cartes);
  await S.setMeta('seanceFC', null);
  await S.setMeta('seanceFC.choix', null);
  return { today, n: cartes.length };
`);
console.log((tel ? 'D' : 'C') + ' seed', JSON.stringify(r), b.erreurs);
process.exit(0);
