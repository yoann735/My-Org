/* ============================================================
   MedRevise — OCR : traitement d'UNE page (05/10, docs/compte-rendu-ocr.md).

   1. TEXTE NATIF D'ABORD, PAR ZONE (08/10, docs/compte-rendu-flashcards-molecules.md) :
      getTextContent. Page sans texte natif substantiel (< 30 caractères) → OCR complet.
      Page avec texte natif → on le garde ; et si ce texte couvre MOINS de 60 % de la page
      alors qu'une IMAGE y est peinte (diapo avec légende + schéma scanné), la page est
      « mixte » : OCR de la page, puis on ne garde que les mots HORS des zones de texte
      natif (les étiquettes du schéma). Avant, 30 caractères natifs (une légende, un pied
      de page « From Biologie… ») suffisaient à priver tout le schéma d'OCR.
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
import * as pdfjsLib from 'pdfjs-dist';
import { openPdf } from '../pdf/pdfjsSetup.js';

export const SEUIL_NATIF = 30;          // caractères visibles pour garder le texte natif
export const COUVERTURE_NATIVE = 0.6;   // au-delà, la page est « tout texte » (pas d'OCR des zones image)
export const PIPELINE = 2;              // version du traitement d'une page (2 = texte natif par zone)
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

/** Analyse du texte natif : caractères visibles, boîtes (unités PDF, origine en haut à
    gauche), part de la page couverte (union approchée sur une grille), image peinte ? */
export async function analyseNatif(page) {
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  let car = 0;
  const boites = [];
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue;
    car += it.str.replace(/\s/g, '').length;
    const [a, b, c, d, e, f] = it.transform;
    const h = Math.hypot(c, d) || Math.abs(d) || 1;
    const w = it.width || Math.hypot(a, b) * it.str.length * 0.5;
    // repère PDF (origine en bas) → repère page (origine en haut), via le viewport
    const [x0, y0] = vp.convertToViewportPoint(e, f);
    const [x1, y1] = vp.convertToViewportPoint(e + w, f + h);
    boites.push({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });
  }
  // couverture : union des boîtes sur une grille 96 × 54 (une diapo ≈ cellules de 10 pt)
  const G = 96, GH = Math.max(1, Math.round(G * vp.height / vp.width));
  const grille = new Uint8Array(G * GH);
  for (const b of boites) {
    const i0 = Math.max(0, Math.floor(b.x / vp.width * G)), i1 = Math.min(G - 1, Math.floor((b.x + b.w) / vp.width * G));
    const j0 = Math.max(0, Math.floor(b.y / vp.height * GH)), j1 = Math.min(GH - 1, Math.floor((b.y + b.h) / vp.height * GH));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) grille[j * G + i] = 1;
  }
  const couverture = grille.reduce((s, v) => s + v, 0) / grille.length;
  let image = false;
  try {
    const OPS = pdfjsLib.OPS;
    const imgOps = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintImageXObjectRepeat, OPS.paintInlineImageXObjectGroup].filter((x) => x != null));
    const ol = await page.getOperatorList();
    image = ol.fnArray.some((fn) => imgOps.has(fn));
  } catch (e) { image = true; /* dans le doute : on regarde */ }
  return { car, boites, couverture, image, largeur: vp.width, hauteur: vp.height };
}

/** Décision pour une page : 'natif' (rien à reconnaître), 'mixte' (texte natif + zones image), 'ocr'. */
export function decisionPage(a) {
  if (a.car < SEUIL_NATIF) return 'ocr';
  if (a.image && a.couverture < COUVERTURE_NATIVE) return 'mixte';
  return 'natif';
}

/** un mot OCR recouvre-t-il du texte natif (> 30 % de sa surface) ? */
export function surTexteNatif(m, boites) {
  const aire = Math.max(1e-6, m.w * m.h);
  for (const b of boites) {
    const ix = Math.max(0, Math.min(m.x + m.w, b.x + b.w) - Math.max(m.x, b.x));
    const iy = Math.max(0, Math.min(m.y + m.h, b.y + b.h) - Math.max(m.y, b.y));
    if (ix * iy > 0.3 * aire) return true;
  }
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
    const a = await analyseNatif(page);
    const decision = decisionPage(a);
    const mesure = { couverture: Math.round(a.couverture * 1000) / 1000, car: a.car };
    if (decision === 'natif') return { ...base, natif: true, pv: PIPELINE, ...mesure, ms: Math.round(performance.now() - t0) };
    const { bitmap, echelle } = await rendreEnBitmap(page);
    let res;
    try { res = await moteur.recognizePage(bitmap); } finally { try { bitmap.close(); } catch (e) { /* déjà transféré */ } }
    const r1 = (v) => Math.round((v / echelle) * 10) / 10;
    let words = res.mots.filter(motUtile).map((m) => ({ t: m.t.trim(), x: r1(m.x), y: r1(m.y), w: r1(m.w), h: r1(m.h), c: m.c, line: m.line, para: m.para }));
    // page mixte : seuls les mots des zones SANS texte natif (le texte natif reste celui du PDF)
    if (decision === 'mixte') words = words.filter((m) => !surTexteNatif(m, a.boites));
    const conf = words.length ? Math.round(words.reduce((s, m) => s + m.c, 0) / words.length) : 0;
    return { ...base, ...(decision === 'mixte' ? { natif: true, mixte: true } : {}), pv: PIPELINE, ...mesure, confidence: conf, words, ms: Math.round(performance.now() - t0) };
  } finally {
    page.cleanup();
  }
}

/** Ouvre un PDF (Blob) pour l'OCR — document à part de celui du lecteur. */
export async function ouvrirPdfOcr(blob) {
  const data = new Uint8Array(await blob.arrayBuffer());
  return openPdf(data);
}
