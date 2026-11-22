// Rend la fiche tibia/fibula (hors dépôt, dossier $TRAVAIL) et la fait lire par l'OCR de l'app (ocr/ocrImage.js).
//   node rendu.mjs → $TRAVAIL/fiche.png, verite.json (couche texte du PDF = étiquettes exactes), ocr.json
import fs from 'node:fs';
import path from 'node:path';
import { appareil, rendrePage, TRAVAIL, BASE, dormir } from './commun.mjs';

const b = await appareil('ordi');
await b.send('Page.navigate', { url: BASE + '/' }); await b.attendre(`document.readyState === 'complete'`, 30000); await dormir(1500);
const r = await rendrePage(b, Number(process.env.ECHELLE || 2));
fs.writeFileSync(path.join(TRAVAIL, 'fiche.png'), r.png);
fs.writeFileSync(path.join(TRAVAIL, 'verite.json'), JSON.stringify({ W: r.W, H: r.H, items: r.items }, null, 1));
const t0 = Date.now();
const ocr = await b.ev(`(async () => { const { ocrImage } = await import('/src/medrevise/ocr/ocrImage.js');
  const bin = atob(${JSON.stringify(r.png.toString('base64'))}); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([a], { type: 'image/png' })); return ocrImage({ src: url }); })()`);
fs.writeFileSync(path.join(TRAVAIL, 'ocr.json'), JSON.stringify(ocr));
console.log('image', r.W, 'x', r.H, '· items texte', r.items.length, '· mots OCR', ocr && ocr.mots.length, '· conf', ocr && ocr.conf, '·', Math.round((Date.now() - t0) / 1000), 's');
console.log('erreurs', b.erreurs.slice(0, 5));
b.fermerWs();
