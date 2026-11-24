/* ============================================================
   MedRevise — SUIVI AUTOMATIQUE DES DIAPOS : les pages du PDF du cours, préparées UNE fois
   (24/11/2026, docs/compte-rendu-suivi-auto-diapos.md).

   Pour chaque page : un petit rendu (160 px de large, pdf.js de l'app) dont le worker tire la
   signature d'image, et le texte de la page (couche texte du PDF + mots reconnus par l'OCR de
   l'app s'il est passé). Le résultat est gardé dans le store LOCAL `meta`
   (clé `diapos.pages:<pdfId>:v<version>`) : une seconde session sur le même PDF ne refait rien.
   Rien n'est écrit au cloud, rien d'existant n'est modifié.

   Le rendu se fait sur le fil principal (pdf.js dessine dans un canvas), une page à la fois,
   avec une pause entre deux pages : la mesure par page est gardée (§ 5 du compte rendu).
   ============================================================ */
import { getOne, getBlob, getMeta, setMeta, getAll } from '../../lib/storage.js';
import { openPdf } from '../../pdf/pdfjsSetup.js';
import { coucheDuPdf } from '../../ocr/service.js';
import { VERSION_SIGNATURE } from './moteur.js';

const LARGEUR = 160;
const cle = (pdfId) => `diapos.pages:${pdfId}:v${VERSION_SIGNATURE}`;
export const mesuresPreparation = { pages: 0, maxMs: 0, totalMs: 0, depuisCache: false };

/** PDF du cours (document original) : id du fichier, ou null (document créé dans l'app, sans PDF) */
export async function pdfDuCours(courseId) {
  const f = await getOne('fiches', courseId).catch(() => null);
  return (f && f.pdfId) || null;
}

/** n° de la page dans le lecteur pour la page `n` du PDF (pages ajoutées dans l'app intercalées) */
export async function numerotation(courseId) {
  const ann = ((await getAll('annotations').catch(() => [])) || []).filter((a) => a && a.ficheId === courseId && a.kind === 'page' && !a.supprime);
  const apres = ann.map((a) => Math.floor(Number(a.apres) || 0));
  return (n) => n + apres.filter((k) => k < n).length;
}

/**
 * @param {string} courseId
 * @param {(rgba, w, h) => Promise<object>} signer signature d'un rendu (worker)
 * @returns {Promise<{ pdfId, sigs: object[], textes: string[], aspects: number[] }>}
 */
export async function preparerPages(courseId, signer, { pdfId = null } = {}) {
  const id = pdfId || await pdfDuCours(courseId);
  if (!id) return { pdfId: null, sigs: [], textes: [], aspects: [] };
  const memo = await getMeta(cle(id)).catch(() => null);
  if (memo && memo.sigs && memo.sigs.length) { mesuresPreparation.depuisCache = true; return { pdfId: id, ...memo }; }
  const blob = await getBlob(id);
  if (!blob) return { pdfId: id, sigs: [], textes: [], aspects: [] };
  const doc = await openPdf(new Uint8Array(await blob.arrayBuffer()));
  let couche = null;
  try { couche = await coucheDuPdf(id); } catch (e) { /* pas d'OCR : texte natif seul */ }
  const sigs = [], textes = [], ratios = [];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const v1 = page.getViewport({ scale: 1 });
      ratios.push(v1.width / v1.height);
      const vp = page.getViewport({ scale: LARGEUR / v1.width });
      canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
      const t0 = performance.now();
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const d = performance.now() - t0;
      mesuresPreparation.pages += 1; mesuresPreparation.totalMs += d; mesuresPreparation.maxMs = Math.max(mesuresPreparation.maxMs, d);
      sigs.push(await signer(rgba, canvas.width, canvas.height));
      let texte = '';
      try { texte = (await page.getTextContent()).items.map((i) => i.str).join(' '); } catch (e) { /* page sans texte */ }
      const pc = couche && couche.pages && couche.pages[n - 1];
      if (pc && pc.words && pc.words.length) texte += ' ' + pc.words.map((w) => w.t).join(' ');
      textes.push(texte);
      page.cleanup();
      await new Promise((r) => setTimeout(r, 8)); // la main au navigateur entre deux pages
    }
  } finally { try { doc.destroy(); } catch (e) { /* déjà détruit */ } }
  const aspects = [...new Set(ratios.map((r) => Math.round(r * 100) / 100))].slice(0, 3);
  const res = { sigs, textes, aspects };
  await setMeta(cle(id), res).catch(() => {});
  return { pdfId: id, ...res };
}
