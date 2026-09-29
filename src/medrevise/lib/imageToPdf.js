/* ============================================================
   MedRevise — IMAGE(S) → PDF, 100 % dans le navigateur, sans réseau.

   Sert à la Prise de notes : une photo de cours ou un scan devient un vrai PDF,
   donc lisible, cherchable en position, surlignable et annotable par le lecteur
   EXISTANT (pdf/PdfReader.jsx) — aucune deuxième visionneuse à écrire.

   Même brique que l'export PNG→PDF déjà en place dans pages/ImportAnatomieVisuel.jsx
   (pdf-lib, embedPng) ; cet écran-là n'est PAS modifié, il garde son code.

   TROIS CHOIX, et leurs raisons :

   1. FORMAT DE PAGE = A4, orientation déduite de l'image, image « contain »
      et centrée. Une page à la taille brute des pixels (ce que fait l'export
      d'anatomie) donnerait, pour une photo de 4000×3000, une page de 55×41
      pouces : lisible à l'écran, absurde à l'impression et incohérente entre
      deux images de tailles différentes. A4 rend un document homogène.
      Les annotations, elles, sont stockées en coordonnées normalisées [0,1] :
      le choix de format n'a aucune incidence sur elles.

   2. PNG ET JPEG SONT INCORPORÉS TELS QUELS (embedPng/embedJpg), sans
      ré-encodage : pas de perte de qualité, pas de gonflement du fichier.

   3. TOUT LE RESTE (WebP, GIF, BMP…) PASSE PAR UN CANVAS, parce que pdf-lib ne
      sait incorporer que du PNG et du JPEG. On décode avec createImageBitmap —
      ce que le navigateur sait décoder passe, le reste échoue proprement avec
      un message qui NOMME le fichier. Cas connu : le HEIC des iPhone, que
      Chrome ne décode pas (Safari, si). On ne fait pas semblant : on le dit.
      Le ré-encodage est plafonné à MAX_COTE px — une image plus grande n'ajoute
      aucune lisibilité à l'écran et alourdit inutilement le PDF (et la synchro).
   ============================================================ */
import { PDFDocument } from 'pdf-lib';

const A4 = { w: 595.28, h: 841.89 };
const MAX_COTE = 3000; // plafond du ré-encodage canvas (les PNG/JPEG d'origine ne sont pas touchés)

export const estImage = (f) => !!f && (/^image\//.test(f.type || '') || /\.(png|jpe?g|webp|gif|bmp|heic|heif|avif|tiff?)$/i.test(f.name || ''));
const estPng = (f) => f.type === 'image/png' || /\.png$/i.test(f.name || '');
const estJpeg = (f) => f.type === 'image/jpeg' || /\.jpe?g$/i.test(f.name || '');

/** ordre des pages = ordre ALPHANUMÉRIQUE des noms de fichiers (numeric: true →
    « page2 » avant « page10 »), et non l'ordre arbitraire dans lequel le système
    remplit un FileList lors d'une sélection multiple. */
export function ordonnerImages(files) {
  return [...files].sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr', { numeric: true, sensitivity: 'base' }));
}

/** décode n'importe quelle image lisible par le navigateur et la ré-encode en PNG.
    Lève une erreur nommant le fichier si le navigateur ne sait pas la décoder. */
async function versPngParCanvas(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (e) {
    throw new Error(`« ${file.name} » n'est pas lisible par ce navigateur (le HEIC des iPhone, par exemple, ne l'est pas sous Chrome). Convertis-la en JPEG ou en PNG, puis réessaie.`);
  }
  const ratio = Math.min(1, MAX_COTE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * ratio));
  const h = Math.max(1, Math.round(bitmap.height * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close && bitmap.close();
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error(`« ${file.name} » n'a pas pu être convertie.`);
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Construit un PDF d'UNE PAGE PAR IMAGE, dans l'ordre reçu.
 * @param {File[]} files images (déjà ordonnées, voir ordonnerImages)
 * @returns {Promise<Blob>} le PDF
 */
export async function imagesToPdf(files) {
  const liste = (files || []).filter(Boolean);
  if (!liste.length) throw new Error('Aucune image à convertir.');
  const pdf = await PDFDocument.create();

  for (const file of liste) {
    let img;
    if (estJpeg(file)) img = await pdf.embedJpg(new Uint8Array(await file.arrayBuffer()));
    else if (estPng(file)) img = await pdf.embedPng(new Uint8Array(await file.arrayBuffer()));
    else img = await pdf.embedPng(await versPngParCanvas(file));

    // A4 dans l'orientation de l'image, puis « contain » centré : l'image touche
    // deux bords de la page et garde son rapport d'aspect exact.
    const paysage = img.width > img.height;
    const pageW = paysage ? A4.h : A4.w;
    const pageH = paysage ? A4.w : A4.h;
    const page = pdf.addPage([pageW, pageH]);
    const k = Math.min(pageW / img.width, pageH / img.height);
    const w = img.width * k;
    const h = img.height * k;
    page.drawImage(img, { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h });
  }

  const out = await pdf.save();
  return new Blob([out], { type: 'application/pdf' });
}
