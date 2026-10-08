/* ============================================================
   MedRevise — OCR D'UNE IMAGE DE DOCUMENT, façon « Texte en direct » (08/10,
   docs/compte-rendu-undo-ocr-export.md).

   Même moteur que les PDF (ocr/moteur.js : Tesseract.js fra+eng dans son Web Worker, tout
   auto-hébergé) et même filtrage des mots (pipeline.js#motUtile). Résultat :
     { v: 1, conf, mots: [{ t, x, y, w, h, line }] }   — x, y, w, h RELATIFS à l'image (0–1),
   donc valables à toute taille d'affichage (l'image redimensionnée garde ses boîtes).
   Il est rangé SUR le nœud image du document (attribut `ocr`, synchronisé avec le document)
   et mis en cache localement par blob : une image déjà traitée — rouverte, copiée, déplacée,
   ou dont le document a été rechargé — ne repasse jamais par l'OCR.
   ============================================================ */
import { moteurOcr } from './moteur.js';
import { motUtile } from './pipeline.js';
import { getBlob, getMeta, setMeta } from '../lib/storage.js';

const VERSION = 1;
const PIXELS_MAX = 12e6;
const enCours = new Map(); // clé → promesse (deux vues de la même image : un seul OCR)
const cleCache = (blobId) => 'ocrImage:' + blobId;

export async function preparer(blob) {
  const src = await createImageBitmap(blob);
  const W = src.width, H = src.height;
  // ~2 400 px sur le grand côté (petites captures agrandies, grandes réduites), ≤ 12 Mpx
  let k = Math.min(3, Math.max(1, 2400 / Math.max(W, H)));
  if (W * H * k * k > PIXELS_MAX) k = Math.sqrt(PIXELS_MAX / (W * H));
  const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  const oc = new OffscreenCanvas(w, h);
  const ctx = oc.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); // transparence → blanc
  ctx.filter = 'grayscale(1) contrast(1.3)'; // même préparation que les pages PDF
  ctx.drawImage(src, 0, 0, w, h);
  src.close();
  return { bitmap: oc.transferToImageBitmap(), w, h };
}

/** OCR d'une image (blob du document, ou à défaut son adresse) → résultat relatif. */
export function ocrImage({ blobId = null, src = null }) {
  const cle = blobId || src;
  if (!cle) return Promise.resolve(null);
  if (enCours.has(cle)) return enCours.get(cle);
  const p = (async () => {
    if (blobId) { const c = await getMeta(cleCache(blobId)).catch(() => null); if (c && c.v === VERSION) return c; }
    const blob = blobId ? await getBlob(blobId) : await (await fetch(src)).blob();
    if (!blob) return null;
    let res = null;
    for (let essai = 0; essai < 2 && !res; essai++) { // le moteur partagé a pu être libéré entre-temps
      try {
        const { bitmap, w, h } = await preparer(blob);
        const r = await moteurOcr().recognizePage(bitmap);
        const q = (v) => Math.round(v * 10000) / 10000;
        res = { v: VERSION, conf: r.confidence, mots: r.mots.filter(motUtile).map((m) => ({ t: m.t.trim(), x: q(m.x / w), y: q(m.y / h), w: q(m.w / w), h: q(m.h / h), line: m.line })) };
      } catch (e) { if (essai) throw e; }
    }
    if (blobId) await setMeta(cleCache(blobId), res).catch(() => {});
    return res;
  })();
  enCours.set(cle, p);
  p.finally(() => enCours.delete(cle)).catch(() => {});
  return p;
}

/** texte reconnu d'un résultat, ligne par ligne */
export function texteOcr(ocr) {
  if (!ocr || !ocr.mots) return '';
  const lignes = new Map();
  ocr.mots.forEach((m) => { if (!lignes.has(m.line)) lignes.set(m.line, []); lignes.get(m.line).push(m); });
  return [...lignes.values()].map((l) => l.sort((a, b) => a.x - b.x).map((m) => m.t).join(' ')).join('\n');
}
