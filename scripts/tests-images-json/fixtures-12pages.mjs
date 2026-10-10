import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';
const d = await PDFDocument.create();
const f = await d.embedFont(StandardFonts.Helvetica);
const png = await d.embedPng(fs.readFileSync('photo.png'));
for (let p = 0; p < 12; p++) {
  const pg = d.addPage([595, 842]);
  pg.drawText(`Cours de biochimie - page ${p + 1}`, { x: 60, y: 780, size: 18, font: f });
  ['Le cycle de Krebs se deroule dans la matrice mitochondriale.', 'Il oxyde l acetyl coenzyme A en dioxyde de carbone.', 'Chaque tour produit trois NADH, un FADH2 et un GTP.']
    .forEach((l, i) => pg.drawText(l, { x: 60, y: 740 - i * 24, size: 12, font: f }));
  // « image du cours » : un schéma au centre de la page (x 150..450, y 300..450 en points PDF)
  pg.drawImage(png, { x: 150, y: 300, width: 300, height: 150 });
  pg.drawRectangle({ x: 150, y: 300, width: 300, height: 150, borderColor: rgb(0.3, 0.3, 0.3), borderWidth: 1 });
}
fs.writeFileSync('cours12.pdf', await d.save());
console.log('ok');
