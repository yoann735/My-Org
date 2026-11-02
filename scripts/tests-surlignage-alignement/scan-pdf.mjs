// PDF « scanné » (image seule) pour le cas OCR : node scan-pdf.mjs <image.png> <sortie.pdf> — page A4, image pleine page
import { PDFDocument } from 'pdf-lib';
import fs from 'node:fs';
const [png, sortie] = process.argv.slice(2);
const doc = await PDFDocument.create();
const img = await doc.embedPng(fs.readFileSync(png));
const page = doc.addPage([595.28, 841.89]);
page.drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
fs.writeFileSync(sortie, await doc.save());
