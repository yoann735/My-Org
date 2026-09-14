/* ============================================================
   MedRevise — MODE APPRENTISSAGE : données et import.

   Une UNITÉ D'APPRENTISSAGE = un lot d'exos pédagogiques (qcm + exercice, JSON v1.1
   habituel) + le PDF du cours. Espace de COMPRÉHENSION : aucune méthode des J, aucun
   statut, aucune statistique. Stockée dans son propre store `apprentissage` (voir
   lib/storage.js) — jamais dans `questions`, que lisent planning, stats, carnet,
   recherche et exports : ces exos en restent absents par construction.

   Enregistrement :
     { id, titre, matiereId|null,
       pdfId, pdfName,          // le PDF (blob synchronisé par l'outbox des blobs)
       ficheId|null,            // PDF repris d'une fiche existante : ses surlignages sont communs
       items: [...],            // qcm/exercice normalisés, DANS L'ORDRE DU JSON (= ordre d'apprentissage)
       meta, createdAt, updatedAt }
   ============================================================ */
import { parsePastedJson } from './parsePastedJson.js';
import { normIndices, normCorrection } from './schema.js';
import { genId, put, remove, getAll } from './storage.js';

export const TYPES_APPRENTISSAGE = new Set(['qcm', 'exercice']);

/** QCM : indices + correction.etapes (générés par le prompt d'apprentissage) sont
    conservés ICI SEULEMENT — l'import classique des QCM ne les garde pas et reste
    inchangé. Mêmes normaliseurs que ceux des exercices (schema.js). */
function enrichirQcm(raw, item) {
  if (item.type !== 'qcm' || !raw || typeof raw !== 'object') return item;
  const indices = normIndices(raw.indices);
  const correction = raw.correction ? normCorrection(raw.correction) : null;
  return {
    ...item,
    ...(indices.length ? { indices } : {}),
    ...(correction && (correction.etapes.length || correction.conclusion) ? { correction } : {}),
  };
}

/**
 * Lit le JSON collé pour une unité. Même validateur tolérant que l'import classique
 * (parsePastedJson) ; flashcards et Feynman sont écartés et SIGNALÉS (pas de place
 * pour eux dans ce mode), jamais avalés en silence.
 * @returns {{ok:false, error:string} | {ok:true, items, meta, counts, errors}}
 */
export function parseApprentissageJson(text) {
  const res = parsePastedJson(text, { enrichItem: enrichirQcm });
  if (!res.ok) return res;
  const items = [];
  const errors = [...res.errors];
  const counts = { ...res.counts };
  res.items.forEach((it, i) => {
    if (TYPES_APPRENTISSAGE.has(it.type)) { items.push(it); return; }
    counts[it.type]--; counts.ignored++;
    errors.push({ index: i + 1, type: it.type, reason: 'type non utilisé en mode Apprentissage (seulement qcm et exercice)' });
  });
  if (!items.length) return { ok: false, error: 'Aucun QCM ni exercice valide trouvé — vérifie que tu as collé la réponse du prompt d’apprentissage.' };
  return { ok: true, items, meta: res.meta || {}, counts, errors };
}

/** item normalisé → item d'unité : clé propre (brouillon du bloc-notes, clés React)
    + `srcId` = id d'origine du JSON (dédoublonnage d'un futur ajout au lot). */
const versItemUnite = (it) => ({ ...it, id: genId('ax'), srcId: it.id || null });

export async function createUnite({ titre, matiereId = null, pdfId, pdfName = null, ficheId = null, items, meta = {} }) {
  const now = new Date().toISOString();
  const unite = {
    id: genId('ap'),
    titre: (titre || '').trim() || 'Unité d’apprentissage',
    matiereId: matiereId || null,
    pdfId, pdfName, ficheId: ficheId || null,
    items: (items || []).map(versItemUnite),
    meta: meta && typeof meta === 'object' ? meta : {},
    createdAt: now,
  };
  return put('apprentissage', unite);
}

/** exos d'un collage déjà présents dans l'unité (même id d'origine `srcId`). */
export function doublonsDansUnite(unite, items) {
  const deja = new Set(((unite && unite.items) || []).map((i) => i.srcId).filter(Boolean));
  return (items || []).filter((it) => it.id && deja.has(it.id)).length;
}

/** AJOUTE des exos À LA FIN d'une unité existante (l'ordre d'apprentissage du lot
    déjà là est conservé). Un exo dont l'id d'origine y figure déjà est ignoré et compté.
    @returns {{unite, ajoutes:number, doublons:number}} */
export async function appendExosToUnite(unite, items) {
  const deja = new Set((unite.items || []).map((i) => i.srcId).filter(Boolean));
  const nouveaux = (items || []).filter((it) => !(it.id && deja.has(it.id)));
  const maj = await put('apprentissage', { ...unite, items: [...(unite.items || []), ...nouveaux.map(versItemUnite)] });
  return { unite: maj, ajoutes: nouveaux.length, doublons: (items || []).length - nouveaux.length };
}

/** Supprime l'unité et SES surlignages. Le PDF (blob) n'est jamais supprimé : il peut
    appartenir à une fiche, et un blob orphelin est inoffensif (même règle que
    storage.js#mergeBlobs). Les surlignages d'une fiche dont on a repris le PDF
    (clé = ficheId) restent à la fiche. */
export async function deleteUnite(unite) {
  if (!unite) return;
  if (!unite.ficheId) {
    const hs = (await getAll('highlights')) || [];
    await Promise.all(hs.filter((h) => h.ficheId === unite.id).map((h) => remove('highlights', h.id)));
  }
  await Promise.all((unite.items || []).map((it) => remove('exos', it.id))); // brouillons du bloc-notes
  await remove('apprentissage', unite.id);
}

/** clé des surlignages du PDF de l'unité (voir PdfReader, prop ficheId). */
export const cleSurlignages = (unite) => (unite && (unite.ficheId || unite.id)) || null;

/** répartition affichée d'une unité */
export function compteUnite(unite) {
  const items = (unite && unite.items) || [];
  return { qcm: items.filter((i) => i.type === 'qcm').length, exercice: items.filter((i) => i.type === 'exercice').length };
}
