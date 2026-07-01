/* ============================================================
   MedRevise — workflow d'import (handoff §9).
   Standard : texte/PDF-texte → IA (ou mock) → fiche + questions
   initialisées à nextReview = aujourd'hui (entrent dans le cycle des J).
   Anatomie : structures (image + texte) → flashcards reconnaissance
   MÉCANIQUES (sans IA) + QCM raisonnement depuis le texte (IA).
   ============================================================ */
import { genId, put, putMany, newQuestion } from './storage.js';
import { generateStandard, generateAnatomie } from './api.js';
import { todayISO } from './sm2.js';

function normalizeQ(q) {
  if (q.type === 'flashcard' || q.type === 'flash') return { type: 'flashcard', concept: q.concept, recto: q.recto || q.front, verso: q.verso || q.back };
  if (q.type === 'feynman') return { type: 'feynman', concept: q.concept };
  return { type: 'qcm', concept: q.concept, question: q.question || q.q, choix: q.choix || q.choices || [], bonneReponse: q.bonneReponse ?? q.correct ?? 0, explication: q.explication || q.expl || '' };
}

export async function importStandard({ matiereId, titre, contenu, pdfId }) {
  const gen = await generateStandard(contenu, titre);
  const ficheId = genId('f');
  const fiche = {
    id: ficheId, matiereId,
    titre: (titre || gen.titre || 'Fiche importée').trim(),
    sousTitre: gen._mock ? 'Importée · démo hors-ligne (à valider)' : 'Importée',
    type: 'standard', coef: null, pdfId: pdfId || null, dateImport: todayISO(),
  };
  await put('fiches', fiche);
  // les nouveaux prompts produisent déjà les bons champs + des extras
  // (categorie_question, difficulte, categorie_carte, explication_simple…)
  // → on les conserve tels quels (newQuestion préserve les champs supplémentaires).
  const qs = (gen.questions || []).map((q) => newQuestion(ficheId, q, 0));
  await putMany('questions', qs);
  return { fiche, count: qs.length, mock: !!gen._mock, debug: gen.debug, synthese: gen.synthese };
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

  await putMany('questions', [...flashes, ...qcms]);
  return { fiche, count: flashes.length + qcms.length, structures: structRecs.length, mock: !!gen._mock, debug: gen.debug };
}
