// Trois PDF de formats différents (22/10) pour la taille de texte uniforme : A4 portrait, diapo 16:9, capture d'écran
// de téléphone (390 × 844). Écrits dans le dossier FX du banc.   Usage : node gen-formats.mjs
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'node:fs';
const FX = process.env.FX;
const FORMATS = [['format-a4.pdf', 595, 842, 'A4 portrait'], ['format-169.pdf', 960, 540, 'Diapo 16:9'], ['format-capture.pdf', 390, 844, 'Capture d’écran']];
for (const [nom, W, H, titre] of FORMATS) {
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica);
  for (let p = 0; p < 2; p++) {
    const page = doc.addPage([W, H]);
    page.drawText(`${titre} — page ${p + 1}`, { x: W * 0.06, y: H * 0.9, size: W * 0.04, font: f, color: rgb(0.1, 0.1, 0.2) });
    for (let i = 0; i < 6; i++) page.drawText('Le néphron filtre le plasma et réabsorbe.', { x: W * 0.06, y: H * (0.78 - i * 0.07), size: W * 0.025, font: f, color: rgb(0.2, 0.2, 0.3) });
  }
  fs.writeFileSync(`${FX}/${nom}`, await doc.save());
  console.log(nom, W, H);
}
