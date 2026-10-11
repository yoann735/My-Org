// Export IA en PDF (11/10) : cours de test de N pages (texte + schéma coloré). node fixtures-ia-pdf.mjs <dossier> <N> <nom.pdf>
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';
const dossier = process.argv[2], nb = +process.argv[3], nom = process.argv[4];
// « schéma » : dégradé coloré + formes (une vraie image, pour un poids JPEG réaliste)
const W = 600, H = 300, px = new Uint8Array(W * H * 3);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = (y * W + x) * 3; px[k] = (x * 255 / W) | 0; px[k + 1] = (y * 255 / H) | 0; px[k + 2] = ((x + y) % 64) * 4; }
const d = await PDFDocument.create();
const f = await d.embedFont(StandardFonts.Helvetica);
for (let p = 0; p < nb; p++) {
  const pg = d.addPage([595, 842]);
  pg.drawText(`Cours de biochimie - page ${p + 1}`, { x: 60, y: 780, size: 18, font: f });
  ['Le cycle de Krebs se deroule dans la matrice mitochondriale.', 'Il oxyde l acetyl coenzyme A en dioxyde de carbone.', 'Chaque tour produit trois NADH, un FADH2 et un GTP.']
    .forEach((l, i) => pg.drawText(l, { x: 60, y: 740 - i * 24, size: 12, font: f }));
  for (let i = 0; i < 30; i++) pg.drawRectangle({ x: 150 + (i % 10) * 30, y: 300 + Math.floor(i / 10) * 50, width: 28, height: 48, color: rgb((i * 37 % 255) / 255, (i * 91 % 255) / 255, (i * 53 % 255) / 255) });
  pg.drawRectangle({ x: 150, y: 300, width: 300, height: 150, borderColor: rgb(0.3, 0.3, 0.3), borderWidth: 1 });
  for (let l = 0; l < 10; l++) pg.drawText('Texte du cours, ligne ' + (l + 1) + ' : la citrate synthase condense l acetyl-CoA et l oxaloacetate.', { x: 60, y: 260 - l * 18, size: 10, font: f });
}
fs.writeFileSync(`${dossier}/${nom}`, await d.save());
console.log(nom, nb, 'pages');
