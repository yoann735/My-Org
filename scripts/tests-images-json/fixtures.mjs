import { PDFDocument, StandardFonts } from 'pdf-lib';
import fs from 'fs';
const d = await PDFDocument.create();
const f = await d.embedFont(StandardFonts.Helvetica);
const lignes = [
  'Le cycle de Krebs se deroule dans la matrice mitochondriale des cellules.',
  'Il oxyde l acetyl coenzyme A en dioxyde de carbone et produit du NADH.',
  'La citrate synthase catalyse la premiere reaction du cycle de Krebs.',
  'Chaque tour du cycle produit trois NADH, un FADH2 et une molecule de GTP.',
  'La phosphorylation oxydative utilise ensuite ces coenzymes reduits.',
];
for (let p = 0; p < 2; p++) {
  const pg = d.addPage([595, 842]);
  pg.drawText(`Page ${p + 1} - Biochimie`, { x: 60, y: 780, size: 18, font: f });
  lignes.forEach((l, i) => pg.drawText(l, { x: 60, y: 730 - i * 28, size: 12, font: f }));
}
fs.writeFileSync('texte.pdf', await d.save());
const d2 = await PDFDocument.create();
const png = await d2.embedPng(fs.readFileSync('page.png'));
const pg = d2.addPage([595, 842]); pg.drawImage(png, { x: 0, y: 0, width: 595, height: 842 });
fs.writeFileSync('image.pdf', await d2.save());
console.log('ok');
