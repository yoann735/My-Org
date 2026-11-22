// Non-régression OCR (22/11/2026) après « la libération du moteur attend les lectures en cours » (ocr/moteurTesseract.js) :
//   1. l'OCR automatique d'un PDF (service du lecteur) produit toujours sa couche de mots ;
//   2. une lecture d'image lancée PENDANT qu'on libère le moteur se termine (avant : en attente pour toujours) ;
//   3. le moteur est bien terminé ensuite, et un nouvel OCR repart sur un moteur neuf.
// PDF de test fabriqué par pdf-lib (texte connu). node t-ocr-pdf.mjs
import { PDFDocument } from 'pdf-lib';
import { appareil, ficheDemo, dormir } from './commun.mjs';

const b = await appareil('ordi');
await b.vider(); await b.ouvrir();
// PDF « scanné » : une page faite d'une seule image (la fiche de démonstration) — sans texte natif, donc passée à l'OCR
const demo = await ficheDemo(b);
const pdf = await PDFDocument.create();
const png = await pdf.embedPng(Buffer.from(demo.png64, 'base64'));
const p = pdf.addPage([595, 703]); p.drawImage(png, { x: 0, y: 0, width: 595, height: 703 });
const pdf64 = Buffer.from(await pdf.save()).toString('base64');
const pdfId = await b.ev(`(async () => { const S = await import('/src/medrevise/lib/storage.js');
  const bin = atob(${JSON.stringify(pdf64)}); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  await S.put('sources', { id: 'op-src', nom: 'Section test' }); await S.put('matieres', { id: 'op-mat', nom: 'M', sourceId: 'op-src' });
  const id = await S.putBlob(new Blob([a], { type: 'application/pdf' }));
  await S.put('fiches', { id: 'op-f', matiereId: 'op-mat', titre: 'OCR test', type: 'standard', pdfId: id, pdfName: 'ocr.pdf' }); return id; })()`);
const okCouche = await b.attendre(`(async () => { const s = await import('/src/medrevise/ocr/service.js'); const c = await s.coucheDuPdf(${JSON.stringify(pdfId)}); return !!(c && c.pages && c.pages[0] && c.pages[0].words && c.pages[0].words.length > 5); })()`, 120000, 1000);
const mots = await b.ev(`(async () => { const s = await import('/src/medrevise/ocr/service.js'); const c = await s.coucheDuPdf(${JSON.stringify(pdfId)}); return c && c.pages[0] && c.pages[0].words ? c.pages[0].words.map((w) => w.t).join(' ') : JSON.stringify(c && c.pages && c.pages[0]).slice(0, 200); })()`);
b.ok(okCouche && /Gerdy|Diaphyse|ligaments/i.test(mots), 'OCR automatique du PDF (service du lecteur) : couche de mots produite', mots.slice(0, 90));
const r = await b.ev(`(async () => {
  const { moteurOcr, libererMoteur } = await import('/src/medrevise/ocr/moteur.js'); const { ocrImage } = await import('/src/medrevise/ocr/ocrImage.js');
  const bin = atob(${JSON.stringify(demo.png64)}); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  const ancien = moteurOcr();
  const lecture = ocrImage({ src: URL.createObjectURL(new Blob([a], { type: 'image/png' })) });
  await new Promise((r) => setTimeout(r, 300)); // la reconnaissance a commencé
  await libererMoteur(); // ce que fait le service une minute après sa dernière page
  const t0 = Date.now();
  const res = await Promise.race([lecture, new Promise((r) => setTimeout(() => r('BLOQUÉE'), 60000))]);
  const neuf = moteurOcr();
  const res2 = await neuf.recognizePage(await createImageBitmap(new Blob([a], { type: 'image/png' })));
  return { fin: res === 'BLOQUÉE' ? res : (res && res.mots.length), ms: Date.now() - t0, neufDifferent: neuf !== ancien, mots2: res2.mots.length };
})()`);
b.ok(r.fin !== 'BLOQUÉE' && r.fin > 10, 'lecture d’image en cours pendant la libération du moteur : elle se termine', JSON.stringify(r));
b.ok(r.neufDifferent && r.mots2 > 10, 'après libération, un moteur neuf reprend l’OCR');
const code = b.fin(); b.fermerWs(); process.exit(code ? 1 : 0);
