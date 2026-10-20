// (20/10) PDF de test « lourd » pour le chantier zoom (docs/compte-rendu-pdfreader-v3.md) : 6 pages paysage,
// les pages 1, 3 et 5 sont une diapositive IMAGE 4K (PNG 3840 × 2160), les autres reprennent des diapos texte
// de cours.pdf (gen-pdf.mjs de tests-fiche-jumelle).
// node gen-lourd.mjs <diapo.png> <cours.pdf> <sortie.pdf>
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
const [png, cours, sortie] = process.argv.slice(2);
const doc = await PDFDocument.create();
const img = await doc.embedPng(fs.readFileSync(png));
const src = await PDFDocument.load(fs.readFileSync(cours));
const [W, H] = [960, 540];
for (let i = 0; i < 6; i++) {
  if (i % 2 === 0) { const p = doc.addPage([W, H]); p.drawImage(img, { x: 0, y: 0, width: W, height: H }); }
  else { const [p] = await doc.copyPages(src, [i]); doc.addPage(p); }
}
fs.writeFileSync(sortie, await doc.save());
console.log('pdf lourd →', sortie, (fs.statSync(sortie).size / 1e6).toFixed(1), 'Mo');
