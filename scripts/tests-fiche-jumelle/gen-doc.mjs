// Jeu de test « fiche jumelle sur DOCUMENT » (15/10 soir) : un document de l'app de 6 pages (6 sections
// séparées par des sauts de page, flux ProseMirror) et sa fiche PDF de 8 pages (6 résumées + 2 ajoutées).
// node gen-doc.mjs <dossier fx> → doc-flux.json, fiche-doc.pdf, verite-doc.json
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
const sortie = process.argv[2];
const SECTIONS = [
  ['Le muscle squelettique', ['Le sarcomère est l’unité contractile, limité par deux stries Z.', 'Les filaments d’actine glissent le long de la myosine pendant la contraction.', 'La titine assure l’élasticité passive du sarcomère.', 'La fibre musculaire est plurinucléée et entourée du sarcolemme.']],
  ['Le couplage excitation-contraction', ['Le potentiel d’action descend dans les tubules transverses.', 'Le récepteur à la dihydropyridine active le récepteur à la ryanodine.', 'Le calcium libéré par le réticulum sarcoplasmique se fixe à la troponine C.', 'La tropomyosine se déplace et libère les sites de liaison de l’actine.']],
  ['L’énergétique musculaire', ['La phosphocréatine régénère l’ATP en quelques secondes.', 'La glycolyse anaérobie produit du lactate lors d’un effort intense.', 'La phosphorylation oxydative domine lors d’un effort prolongé.', 'La dette en oxygène se rembourse pendant la récupération.']],
  ['Les types de fibres', ['Les fibres de type I sont lentes, oxydatives et riches en myoglobine.', 'Les fibres de type IIa sont rapides et oxydo-glycolytiques.', 'Les fibres de type IIx sont rapides, glycolytiques et fatigables.', 'L’entraînement en endurance favorise la capillarisation.']],
  ['Le muscle lisse', ['Le muscle lisse ne possède pas de sarcomères organisés.', 'La calmoduline active la kinase de la chaîne légère de myosine.', 'Le mécanisme du verrou maintient un tonus à faible coût énergétique.', 'Les cellules sont reliées par des jonctions communicantes.']],
  ['Le muscle cardiaque', ['Les cardiomyocytes sont reliés par des disques intercalaires.', 'Le calcium extracellulaire déclenche la libération de calcium.', 'La loi de Frank-Starling relie précharge et force de contraction.', 'La période réfractaire longue empêche la tétanisation.']],
];
const para = (t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
const contenu = [];
SECTIONS.forEach(([titre, phrases], i) => {
  if (i) contenu.push({ type: 'sautDePage' });
  contenu.push({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: titre }] });
  phrases.forEach((p) => { contenu.push(para(p)); contenu.push(para('Commentaire du cours : ' + p.toLowerCase())); });
});
fs.writeFileSync(path.join(sortie, 'doc-flux.json'), JSON.stringify({ type: 'doc', content: contenu }));
const AJOUTS = { A: ['Synthèse intermédiaire', ['• Relire avant la suite', '• Schéma à refaire de mémoire', 'Page ajoutée dans la fiche.']], B: ['QCM d’entraînement', ['1. Question de cours', '2. Autre question', 'Page ajoutée dans la fiche.']] };
const seq = [1, 2, 'A', 3, 4, 5, 'B', 6];
const doc = await PDFDocument.create();
const f = await doc.embedFont(StandardFonts.Helvetica), g = await doc.embedFont(StandardFonts.HelveticaBold);
const san = (t) => t.replace(/’/g, "'");
for (const e of seq) {
  const [titre, lignes] = typeof e === 'string' ? AJOUTS[e] : [`Fiche · ${SECTIONS[e - 1][0]}`, SECTIONS[e - 1][1].slice(0, 3).map((p) => '• ' + p.split(' ').slice(0, 8).join(' '))];
  const p = doc.addPage([595, 842]);
  p.drawRectangle({ x: 0, y: 772, width: 595, height: 70, color: rgb(0.94, 0.92, 0.99) });
  p.drawText(san(titre), { x: 40, y: 796, size: 20, font: g, color: rgb(0.25, 0.2, 0.5) });
  lignes.forEach((l, i) => p.drawText(san(l), { x: 50, y: 712 - i * 36, size: 13, font: f }));
}
fs.writeFileSync(path.join(sortie, 'fiche-doc.pdf'), Buffer.from(await doc.save()));
fs.writeFileSync(path.join(sortie, 'verite-doc.json'), JSON.stringify(seq.map((e) => (typeof e === 'string' ? [] : [e]))));
console.log('document 6 sections, fiche', seq.length, 'p.');
