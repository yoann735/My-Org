/* ============================================================
   MedRevise — SUIVI AUTOMATIQUE DES DIAPOS : les pages du PDF du cours, préparées UNE fois
   (24/11/2026, docs/compte-rendu-suivi-auto-diapos.md).

   Pour chaque page : un petit rendu (480 px de large) et sa signature d'image, faits DANS le Web Worker
   (pdf.js de l'app sur OffscreenCanvas : rien n'est dessiné sur le fil principal), et le texte de la page (couche texte du PDF + mots reconnus par l'OCR de
   l'app s'il est passé). Le résultat est gardé dans le store LOCAL `meta`
   (clé `diapos.pages:<pdfId>:v<version>`) : une seconde session sur le même PDF ne refait rien.
   Rien n'est écrit au cloud, rien d'existant n'est modifié.

   Mesure par page gardée (§ 5 du compte rendu).
   ============================================================ */
import { getOne, getBlob, getMeta, setMeta, getAll } from '../../lib/storage.js';
import { coucheDuPdf } from '../../ocr/service.js';
import { VERSION_SIGNATURE } from './moteur.js';

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
 * @param {(pdf: ArrayBuffer) => Promise<{ sigs, textes, aspects, mesure }>} rendre rendu + signatures + texte, DANS le worker
 * @returns {Promise<{ pdfId, sigs: object[], textes: string[], aspects: number[] }>}
 */
export async function preparerPages(courseId, rendre, { pdfId = null } = {}) {
  const id = pdfId || await pdfDuCours(courseId);
  if (!id) return { pdfId: null, sigs: [], textes: [], aspects: [] };
  const memo = await getMeta(cle(id)).catch(() => null);
  if (memo && memo.sigs && memo.sigs.length) { mesuresPreparation.depuisCache = true; return { pdfId: id, ...memo }; }
  const blob = await getBlob(id);
  if (!blob) return { pdfId: id, sigs: [], textes: [], aspects: [] };
  const r = await rendre(await blob.arrayBuffer());
  if (r.erreur) throw new Error(r.erreur);
  Object.assign(mesuresPreparation, { pages: r.mesure.pages, maxMs: r.mesure.maxMs, totalMs: r.mesure.totalMs, dansLeWorker: true });
  // texte des pages : couche texte du PDF (worker) + mots reconnus par l'OCR de l'app s'il est passé
  let couche = null;
  try { couche = await coucheDuPdf(id); } catch (e) { /* pas d'OCR : texte natif seul */ }
  const textes = r.textes.map((t, i) => { const pc = couche && couche.pages && couche.pages[i]; return pc && pc.words && pc.words.length ? t + ' ' + pc.words.map((w) => w.t).join(' ') : t; });
  const res = { sigs: r.sigs, textes, aspects: r.aspects };
  await setMeta(cle(id), res).catch(() => {});
  return { pdfId: id, ...res };
}
