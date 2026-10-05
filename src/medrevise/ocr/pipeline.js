/* ============================================================
   MedRevise — OCR : traitement d'UNE page (05/10, docs/compte-rendu-ocr.md).

   1. TEXTE NATIF D'ABORD : getTextContent ; si la page porte un texte substantiel
      (≥ 30 caractères visibles), on le garde — pas d'OCR (PDF mixtes gérés page par page).
   2. RENDU : pdf.js à ~300 dpi (300/72 ≈ 4,17×), au moins 2×, plafonné à 12 Mpx
      (la mémoire d'un onglet n'est pas infinie : une diapo 16:9 ou un A4 tiennent
      à ~9 Mpx). Canvas rendu PUIS recopié avec filtre « niveaux de gris + contraste
      +30 % » → ImageBitmap ; les canvas sont vidés aussitôt.
   3. RECONNAISSANCE : moteur.recognizePage(bitmap) (interface moteur.js) ; le
      bitmap est fermé dès que le moteur l'a encodé.
   4. CONVERSION : pixels → UNITÉS PDF de la page (viewport à l'échelle 1, origine en
      haut à gauche — le repère où `largeur × fraction` donne les coordonnées
      normalisées des annotations). Arrondi au dixième de point.
   5. FILTRAGE LÉGER : écarte les « mots » de confiance très basse, ceux faits de
      symboles seuls, et les lettres isolées typiques des formules et schémas
      (H, O, C…) — garde tout le reste, même imparfait.
   ============================================================ */
import { openPdf } from '../pdf/pdfjsSetup.js';

export const SEUIL_NATIF = 30;          // caractères visibles pour garder le texte natif
const ECHELLE_CIBLE = 300 / 72;          // ≈ 300 dpi
const ECHELLE_MIN = 2;
const PIXELS_MAX = 12e6;

/** La page a-t-elle déjà une vraie couche texte ? */
export async function aTexteNatif(page) {
  const tc = await page.getTextContent();
  let n = 0;
  for (const it of tc.items) { if (it.str) n += it.str.replace(/\s/g, '').length; if (n >= SEUIL_NATIF) return true; }
  return false;
}

/** Échelle de rendu : ~300 dpi, ≥ 2×, ≤ 12 Mpx. */
export function echelleOcr(w, h) {
  const plafond = Math.sqrt(PIXELS_MAX / (w * h));
  return Math.min(Math.max(ECHELLE_MIN, Math.min(ECHELLE_CIBLE, plafond)), plafond);
}

async function rendreEnBitmap(page) {
  const v1 = page.getViewport({ scale: 1 });
  const echelle = echelleOcr(v1.width, v1.height);
  const vp = page.getViewport({ scale: echelle });
  const c = document.createElement('canvas');
  c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
  const ctx = c.getContext('2d', { alpha: false });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise;
  // niveaux de gris + léger renforcement du contraste (le texte gris clair des diapos)
  const oc = new OffscreenCanvas(c.width, c.height);
  const octx = oc.getContext('2d');
  octx.filter = 'grayscale(1) contrast(1.3)';
  octx.drawImage(c, 0, 0);
  c.width = 1; c.height = 1; // libère la mémoire du premier rendu tout de suite
  const bitmap = oc.transferToImageBitmap();
  oc.width = 1; oc.height = 1;
  return { bitmap, echelle, largeur: v1.width, hauteur: v1.height };
}

const LETTRES_SEULES_OK = new Set(['à', 'a', 'y', 'ô', 'A', 'À']);
/** Garder ce mot ? (filtrage léger, voir l'en-tête) */
export function motUtile(m) {
  const t = (m.t || '').trim();
  if (!t) return false;
  if (m.c < 30) return false;                                   // confiance très basse
  if (!/[\p{L}\p{N}]/u.test(t)) return false;                   // symboles seuls (·, |, —, =…)
  if (t.length === 1 && /\p{L}/u.test(t) && !LETTRES_SEULES_OK.has(t)) return false; // H, O, C isolés
  if (t.length <= 2 && m.c < 50 && !/^\p{N}+$/u.test(t)) return false; // bribes douteuses (« lI », « ~a »)
  return true;
}

/**
 * Traite une page : texte natif → { natif: true } ; sinon OCR.
 * @returns {Promise<{ pageIndex, width, height, natif?, confidence?, words?, ms }>}
 */
export async function traiterPage(pdfDoc, pageIndex, moteur) {
  const t0 = performance.now();
  const page = await pdfDoc.getPage(pageIndex + 1);
  const v1 = page.getViewport({ scale: 1 });
  const base = { pageIndex, width: Math.round(v1.width * 10) / 10, height: Math.round(v1.height * 10) / 10 };
  try {
    if (await aTexteNatif(page)) return { ...base, natif: true, ms: Math.round(performance.now() - t0) };
    const { bitmap, echelle } = await rendreEnBitmap(page);
    let res;
    try { res = await moteur.recognizePage(bitmap); } finally { try { bitmap.close(); } catch (e) { /* déjà transféré */ } }
    const r1 = (v) => Math.round((v / echelle) * 10) / 10;
    const words = res.mots.filter(motUtile).map((m) => ({ t: m.t.trim(), x: r1(m.x), y: r1(m.y), w: r1(m.w), h: r1(m.h), c: m.c, line: m.line, para: m.para }));
    const conf = words.length ? Math.round(words.reduce((s, m) => s + m.c, 0) / words.length) : 0;
    return { ...base, confidence: conf, words, ms: Math.round(performance.now() - t0) };
  } finally {
    page.cleanup();
  }
}

/** Ouvre un PDF (Blob) pour l'OCR — document à part de celui du lecteur. */
export async function ouvrirPdfOcr(blob) {
  const data = new Uint8Array(await blob.arrayBuffer());
  return openPdf(data);
}
