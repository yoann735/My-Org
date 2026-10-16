// Fichiers de test du chantier « fichiers d'un cours » : cours-v2.pdf = cours.pdf sans la page 5, page 10 déplacée à la fin.
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
const fx = process.argv[2];
const src = await PDFDocument.load(fs.readFileSync(`${fx}/cours.pdf`));
const n = src.getPageCount();
const ordre = [...Array(n).keys()].filter((i) => i !== 4 && i !== 9).concat([9]);
const out = await PDFDocument.create();
for (const p of await out.copyPages(src, ordre)) out.addPage(p);
fs.writeFileSync(`${fx}/cours-v2.pdf`, await out.save());
console.log(`cours-v2.pdf : ${ordre.length} pages (sur ${n}) — ordre`, ordre.map((i) => i + 1).join(','));
