/* ============================================================
   MedRevise — workflow d'import (handoff §9).
   Standard : texte/PDF-texte → IA (ou mock) → fiche + questions
   initialisées à nextReview = aujourd'hui (entrent dans le cycle des J).
   Anatomie : structures (image + texte) → flashcards reconnaissance
   MÉCANIQUES (sans IA) + QCM raisonnement depuis le texte (IA).
   ============================================================ */
import { genId, put, putMany, getOne, getAll, newQuestion, newItem } from './storage.js';
import { generateStandard, generateAnatomie } from './api.js';
import { toInternalItem } from './adapter.js';
import { todayISO } from './sm2.js';

function normalizeQ(q) {
  if (q.type === 'flashcard' || q.type === 'flash') return { type: 'flashcard', concept: q.concept, recto: q.recto || q.front, verso: q.verso || q.back };
  if (q.type === 'feynman') return { type: 'feynman', concept: q.concept };
  return { type: 'qcm', concept: q.concept, question: q.question || q.q, choix: q.choix || q.choices || [], bonneReponse: q.bonneReponse ?? q.correct ?? 0, explication: q.explication || q.expl || '' };
}

export async function importStandard({ matiereId, titre, contenu, pdfId, pdfName }) {
  const gen = await generateStandard(contenu, titre);
  const res = await createFicheFromQuestions({
    matiereId, titre: titre || gen.titre, questions: gen.questions,
    synthese: gen.synthese, pdfId, pdfName, mock: gen._mock,
  });
  return { ...res, debug: gen.debug };
}

/**
 * Crée une fiche standard + ses questions dans IndexedDB à partir d'un tableau
 * de questions DÉJÀ parsé. Point d'entrée commun aux deux flux :
 *   - flux API (importStandard) : questions issues de generateStandard()
 *   - flux « coller le JSON » (Dashboard) : JSON collé puis parsé localement
 * La synthèse est stockée sur la fiche (affichée sur l'onglet Feynman).
 * Les prompts produisent déjà les bons champs + des extras (categorie_question,
 * difficulte, categorie_carte, explication_simple…) → newQuestion les préserve.
 */
export async function createFicheFromQuestions({ matiereId, titre, items, questions, synthese, meta, pdfId, pdfName, mock }) {
  const ficheId = genId('f');
  const fiche = {
    id: ficheId, matiereId,
    titre: (titre || 'Fiche importée').trim(),
    sousTitre: mock ? 'Importée · démo hors-ligne (à valider)' : 'Importée',
    type: 'standard', coef: null, pdfId: pdfId || null, pdfName: (pdfId && pdfName) || null, dateImport: todayISO(),
    synthese: (synthese && synthese.trim()) || null,
    // méta v1.0 (informatif : notions_cles, prerequis, matiere annoncée…)
    meta: meta && typeof meta === 'object' ? meta : null,
  };
  await put('fiches', fiche);
  // Source unifiée : items v1.0 (flux « coller le JSON ») ou questions legacy
  // (flux API/mock). Dans les deux cas, toInternalItem → item "superset" v1.0.
  const source = items && items.length ? items : (questions || []);
  const qs = source
    .map((raw) => toInternalItem(raw, (it) => newItem(ficheId, it, 0)))
    .filter(Boolean);
  await putMany('questions', qs);
  return { fiche, count: qs.length, mock: !!mock, synthese: fiche.synthese };
}

/**
 * AJOUTE des items v1.0 à une fiche EXISTANTE (mode Rattrapage : coller la
 * Pratique dans la même fiche que la Théorie). Append pur (jamais d'écrasement).
 * Dédoublonnage sur item.id : un item dont l'id v1.0 figure déjà (via srcId)
 * parmi les items de la fiche est ignoré et compté.
 * @returns {{fiche, count, duplicates}} | {ok:false}
 */
export async function appendItemsToFiche({ ficheId, items }) {
  const fiche = await getOne('fiches', ficheId);
  if (!fiche) return { ok: false };
  const all = await getAll('questions');
  const existingSrc = new Set(all.filter((q) => q.ficheId === ficheId).map((q) => q.srcId).filter(Boolean));

  let duplicates = 0;
  const fresh = [];
  for (const raw of (items || [])) {
    const srcId = raw && raw.id;
    if (srcId && existingSrc.has(srcId)) { duplicates++; continue; }
    const rec = toInternalItem(raw, (it) => newItem(ficheId, it, 0));
    if (!rec) continue;
    fresh.push(rec);
    if (srcId) existingSrc.add(srcId); // évite les doublons intra-collage
  }
  if (fresh.length) await putMany('questions', fresh);
  return { fiche, count: fresh.length, duplicates };
}

/**
 * Anatomie : structures = [{ nom, imageId, infos:{origine,insertion,action,innervation,vascularisation} }]
 * → 1 flashcard reconnaissance (image→nom) par structure (mécanique)
 *   + QCM de raisonnement générés depuis le TEXTE (IA, jamais l'image).
 */
export async function importAnatomie({ matiereId, titre, sousCategorie, structures }) {
  const ficheId = genId('f');
  const fiche = {
    id: ficheId, matiereId, titre: (titre || 'Fiche anatomie').trim(),
    sousTitre: sousCategorie ? `Anatomie · ${sousCategorie}` : 'Anatomie',
    type: 'anatomie', sousCategorie: sousCategorie || null, coef: null, dateImport: todayISO(),
  };
  await put('fiches', fiche);

  // structures persistées
  const structRecs = structures.map((s) => ({ id: genId('st'), ficheId, nom: s.nom, imageId: s.imageId || null, infos: s.infos || {} }));
  await putMany('structures', structRecs);

  // flashcards reconnaissance (mécaniques, sans IA)
  const flashes = structRecs.map((s) => {
    const q = newQuestion(ficheId, { type: 'flashcard', concept: s.nom, recto: 'Identifie cette structure', verso: s.nom }, 0);
    q.imageId = s.imageId || null;
    q.kind = 'anatomie';
    return q;
  });

  // QCM raisonnement (IA depuis le texte)
  const gen = await generateAnatomie(structures);
  const qcms = (gen.questions || []).map((q) => newQuestion(ficheId, normalizeQ(q), 0));

  // superset v1.0 (préserve imageId/kind via le spread de toInternalItem)
  const recs = [...flashes, ...qcms].map((q) => toInternalItem(q) || q);
  await putMany('questions', recs);
  return { fiche, count: flashes.length + qcms.length, structures: structRecs.length, mock: !!gen._mock, debug: gen.debug };
}

/**
 * Anatomie VISUELLE (Étape B) : enregistre (crée ou met à jour) une fiche de type
 * "anat_schema" = une image + un tableau de COCHES (annotations structurées).
 *
 * Chaque coche : { id, ancre:{x,y}, boite:{x,y}, texte, couleur, numero } — toutes
 * les positions en coordonnées RELATIVES (0..1) pour survivre au zoom/redimension.
 * Les annotations ne sont JAMAIS aplaties dans l'image : c'est ce qui rend le quiz
 * possible (masquer le texte d'une coche = cacher un champ de données).
 *
 * La fiche est aussi UN item planifiable SM-2 (comme les autres fiches) : elle porte
 * directement interval/repetition/efactor/nextReview (utilisés à l'étape C — le quiz).
 * "maj" : si `ficheId` est fourni, on met à jour la fiche existante en conservant
 * son état SM-2 ; sinon on en crée une neuve initialisée à nextReview = aujourd'hui.
 */
/* ---- normalisation d'UNE annotation (coche « point » OU zone). Coords 0..1.
   kind absent = 'point' (rétro-compat total). Une ZONE porte en plus sa géométrie
   de région { shape:'rect'|'poly', … , opacity }. Tous les autres champs (texte,
   réponses acceptées, type, champs de théorie) sont IDENTIQUES à une coche → le
   quiz, la correction et la génération de théorie traitent zones et points
   uniformément. ---- */
const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
const clampPt = (p) => ({ x: clamp01(p && p.x), y: clamp01(p && p.y) });
const clampOpacity = (o) => Math.max(0.05, Math.min(0.6, Number.isFinite(o) ? o : 0.25));

export function cleanCoche(c, i = 0) {
  const kind = c.kind === 'zone' ? 'zone' : 'point';
  const base = {
    id: c.id || genId('c'),
    kind,
    ancre: clampPt(c.ancre),
    boite: clampPt(c.boite),
    texte: (c.texte || '').trim(),
    // réponses acceptées supplémentaires (synonymes) — normalisées à la correction,
    // conservées ici telles que saisies. Nettoyées (trim + non vides + dédoublonnées).
    reponses_acceptees: [...new Set((c.reponses_acceptees || []).map((r) => (r || '').trim()).filter(Boolean))],
    // THÉORIE INTRINSÈQUE : la coche porte son type + ses champs extraits (refonte).
    // Absents = coche sans volet théorie (rétro-compatible).
    type: c.type || null,
    champs: (c.champs && typeof c.champs === 'object') ? c.champs : {},
    couleur: c.couleur || null,
    numero: c.numero ?? i + 1,
  };
  if (kind === 'zone') {
    const z = c.zone || {};
    base.zone = z.shape === 'poly'
      ? { shape: 'poly', points: (z.points || []).map(clampPt), opacity: clampOpacity(z.opacity) }
      : { shape: 'rect', rect: cleanRect(z.rect), opacity: clampOpacity(z.opacity) };
  }
  return base;
}
function cleanRect(r) {
  const x = clamp01(r && r.x), y = clamp01(r && r.y);
  return { x, y, w: clamp01((r && r.w) || 0), h: clamp01((r && r.h) || 0) };
}

/**
 * MULTI-VUES : `images` = [{ id?, imageId, imageW, imageH, vue, coches[] }].
 * Rétro-compat : si `images` est absent, on reconstruit une vue unique depuis les
 * champs simples (imageId/imageW/imageH/coches). En sortie, la fiche porte TOUJOURS
 * `images[]` ET un miroir legacy = 1re vue (imageId/imageW/imageH/coches) pour les
 * consommateurs non migrés (badges, etc.).
 */
export async function saveAnatSchema({ ficheId, matiereId, titre, sousCategorie, images, imageId, imageW, imageH, coches }) {
  const sousTitre = sousCategorie ? `Schéma annoté · ${sousCategorie}` : 'Schéma annoté';

  const rawImages = (Array.isArray(images) && images.length)
    ? images
    : [{ imageId: imageId || null, imageW: imageW || null, imageH: imageH || null, vue: 'non_precisee', coches: coches || [] }];
  const cleanImages = rawImages.map((im) => ({
    id: im.id || genId('img'),
    imageId: im.imageId || null,
    imageW: im.imageW || null,
    imageH: im.imageH || null,
    vue: im.vue || 'non_precisee',
    coches: (im.coches || []).map((c, i) => cleanCoche(c, i)),
  }));
  const first = cleanImages[0] || { imageId: null, imageW: null, imageH: null, coches: [] };
  const count = cleanImages.reduce((n, im) => n + im.coches.length, 0);

  const existing = ficheId ? await getOne('fiches', ficheId) : null;
  let fiche;
  if (existing) {
    fiche = {
      ...existing, matiereId, titre: (titre || existing.titre || 'Schéma anatomique').trim(),
      sousTitre, type: 'anat_schema', sousCategorie: sousCategorie || null,
      images: cleanImages,
      // miroir legacy (1re vue) — jamais la source de vérité
      imageId: first.imageId, imageW: first.imageW, imageH: first.imageH, coches: first.coches,
    };
  } else {
    fiche = {
      id: genId('f'), matiereId, titre: (titre || 'Schéma anatomique').trim(),
      sousTitre, type: 'anat_schema', sousCategorie: sousCategorie || null, coef: null,
      dateImport: todayISO(),
      images: cleanImages,
      imageId: first.imageId, imageW: first.imageW, imageH: first.imageH, coches: first.coches,
      // item planifiable SM-2 (étape C)
      interval: 0, repetition: 0, efactor: 2.5, nextReview: todayISO(), historique: [], missed: 0,
    };
  }
  await put('fiches', fiche);
  return { fiche, count };
}
