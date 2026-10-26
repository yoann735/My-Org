// Jeu de test sur l'ordinateur A (profil NEUF, faux Supabase) : 1 source, 1 matière, 2 cours.
//  - « Flashcards test (200) » : 200 flashcards de TOUTES les sortes (texte, trous, image, Muscle, Tableau, Molécule),
//    avec des champs de planification variés (dues, à venir, notées, nouvelles, bloc FSRS) ;
//  - « Petit cours test » : 3 cartes.
// Ids uniques par passage (suffixe) : une 2ᵉ passe ne réécrit pas les mêmes cartes. node seed.mjs
import { banc, COURS } from './commun.mjs';
process.env.CDP_PORT = '9335';
const A = await banc();
await A.send('Page.navigate', { url: 'http://localhost:5300/' }); await A.dormir(4000);
await A.ouvrirApp({ recharger: false });
const r = await A.S(`
  const sm2 = await import('/src/medrevise/lib/sm2.js');
  const { PDFDocument, StandardFonts } = await import('/node_modules/.vite/deps/pdf-lib.js');
  const pdf = async (titre) => { const d = await PDFDocument.create(); for (let k = 0; k < 2; k++) { const p = d.addPage([595, 842]); const f = await d.embedFont(StandardFonts.Helvetica); p.drawText(titre + ' — page ' + (k + 1), { x: 60, y: 760, size: 20, font: f }); } return S.putBlob(new Blob([await d.save()], { type: 'application/pdf' })); };
  const png = async (txt, coul) => { const c = document.createElement('canvas'); c.width = 480; c.height = 300; const g = c.getContext('2d'); g.fillStyle = coul; g.fillRect(0, 0, 480, 300); g.fillStyle = '#fff'; g.font = 'bold 34px sans-serif'; g.fillText(txt, 30, 160); const b = await new Promise((ok) => c.toBlob(ok, 'image/png')); return S.putBlob(b); };
  const today = sm2.todayISO();
  const j = (n) => { const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('fr-CA'); };
  await S.put('sources', { id: 'sAA', nom: 'Section test À apprendre', rappelsJ: true });
  await S.put('matieres', { id: 'mAA', sourceId: 'sAA', nom: 'Matière test', couleur: 'blue' });
  await S.putMany('fiches', [
    { id: 'fAA', matiereId: 'mAA', titre: ${JSON.stringify(COURS)}, type: 'standard', pdfId: await pdf('Flashcards test'), dateImport: j(-30) },
    { id: 'fAB', matiereId: 'mAA', titre: 'Petit cours test', type: 'standard', pdfId: await pdf('Petit cours'), dateImport: j(-30) },
  ]);
  const img = [await png('Image A', '#7c5cff'), await png('Image B', '#2f9e6e')];
  const fsrs = (s, d) => ({ v: 1, state: 2, stability: s, difficulty: d, reps: 3, lapses: 0, derniere: j(-4), due: j(3), intervalle: 7 });
  const H = [{ date: j(-11), qualite: 2 }, { date: j(-4), qualite: 3 }];
  const plan = (k) => k % 5 === 0 ? { nouvelle: true, historique: [] }
    : { learnState: 'review', intervalDays: 1 + (k % 9), dueDate: j((k % 7) - 3), j0Date: j(-20), historique: H, nouvelle: false, ...(k % 3 === 0 ? { fsrs: fsrs(3 + k % 11, 4 + (k % 4)) } : {}) };
  const cartes = [];
  for (let k = 0; k < 200; k++) {
    const base = { id: 'aa' + String(k).padStart(3, '0'), type: 'flashcard', ficheId: 'fAA', theme: 'Thème ' + (1 + (k % 6)), ...plan(k) };
    const sorte = k % 6;
    if (sorte === 0) cartes.push({ ...base, recto: 'Question texte n° ' + k + ' : quel est le rôle du néphron ?', verso: 'Réponse ' + k + ' : filtrer le sang et former l’urine.' });
    else if (sorte === 1) cartes.push({ ...base, recto: 'Le débit de filtration glomérulaire vaut environ {{120 mL/min}} (carte ' + k + ').', verso: 'Le débit de filtration glomérulaire vaut environ 120 mL/min.', cloze: ['120 mL/min'] });
    else if (sorte === 2) cartes.push({ ...base, recto: 'Que montre cette image ? (' + k + ')', verso: 'Une image de test ' + (k % 2 ? 'B' : 'A') + '.', imageId: img[k % 2], imagePlace: 'recto' });
    else if (sorte === 3) cartes.push({ ...base, recto: 'Biceps brachial ' + k, verso: '', muscle: { v: 1, lignes: { origine: 'Tubercule supra-glénoïdal (chef long)', trajet: 'Loge antérieure du bras', insertion: 'Tubérosité radiale', action: 'Flexion du coude, supination', innervation: 'Nerf musculo-cutané' } } });
    else if (sorte === 4) cartes.push({ ...base, recto: 'Tableau des diurétiques ' + k, verso: '', tableau: { v: 1, colonnes: ['Classe', 'Site', 'Effet'], lignes: [['Thiazidiques', 'Tube contourné distal', 'Hypokaliémie'], ['De l’anse', 'Anse de Henlé', 'Natriurèse forte']] } });
    else cartes.push({ ...base, recto: 'Éthanol ' + k, verso: '', molecule: { v: 1, nom: 'Éthanol ' + k, smiles: 'CCO', molfile: '', formule: 'C2H6O', sens: 'nom-molecule', comparaison: 'constitution', biblio: null } });
  }
  cartes.push({ id: 'ab1', type: 'flashcard', ficheId: 'fAB', theme: 'Petit', recto: 'Petit recto 1', verso: 'Petit verso 1', nouvelle: true, historique: [] });
  cartes.push({ id: 'ab2', type: 'flashcard', ficheId: 'fAB', theme: 'Petit', recto: 'Petit recto 2', verso: 'Petit verso 2', ...plan(2) });
  cartes.push({ id: 'ab3', type: 'flashcard', ficheId: 'fAB', theme: 'Petit', recto: 'Petit recto 3', verso: 'Petit verso 3', ...plan(4) });
  await S.putMany('questions', cartes);
  return { today, n: (await S.getAll('questions')).length };
`);
console.log('seed', JSON.stringify(r), 'erreurs', A.erreurs);
await A.send('Page.reload'); await A.dormir(5000);
await A.ev(`window.dispatchEvent(new Event('online'));1`); await A.dormir(6000);
const etat = await (await fetch('http://localhost:54399/__etat')).json();
console.log('faux cloud : questions', etat.rows.filter((x) => x.store === 'questions').length, 'blobs', etat.blobs.length);
process.exit(0);
