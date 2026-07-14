/* ============================================================
   MedRevise — ADAPTATEUR RÉTROCOMPATIBLE (ancien format → v1.0).
   SEUL endroit du code autorisé à connaître l'ancien format
   ({questions:[...], synthese} avec choix/bonneReponse index,
   difficulte texte, categorie_*, explication_simple…).

   Deux directions, une seule cible : le format v1.0 (schema.js).
   - legacy → v1.0  : renommage des champs puis normalisation.
   - v1.0 → interne : "superset" = item v1.0 + champs legacy d'affichage
     rétro-remplis, pour que les lecteurs actuels (Session/Feynman)
     continuent de fonctionner jusqu'à ce que l'Étape 2 les bascule sur v1.0.
   Tout est PUR (aucun IO) sauf usage optionnel de genId à l'appel.
   ============================================================ */
import { OPTION_LETTERS, SCHEMA_VERSION, normalizeV1Item, asArray, repartitionOf } from './schema.js';

const str = (v) => (v == null ? '' : String(v));

/* ---------- détection ---------- */

/** un objet JSON complet est-il à l'ANCIEN format ? (pas de schema_version, mais un tableau "questions") */
export function isLegacyDoc(data) {
  return !!data && typeof data === 'object' && !data.schema_version
    && !Array.isArray(data.items) && Array.isArray(data.questions);
}

/** un ITEM est-il à l'ancien format ? (présence d'un marqueur exclusivement legacy) */
export function isLegacyItem(q) {
  if (!q || typeof q !== 'object') return false;
  if (q._schema === SCHEMA_VERSION) return false; // déjà migré en interne
  return (
    'choix' in q || 'bonneReponse' in q || 'categorie_question' in q ||
    'categorie_carte' in q || 'explication_simple' in q ||
    'question_verification' in q || 'pieges_frequents' in q
  );
}

/* ---------- legacy → vocabulaire v1.0 ---------- */

function legacyQcmToV1(q) {
  const choix = asArray(q.choix);
  return {
    type: 'qcm', id: q.id, theme: q.concept, difficulte: q.difficulte, tags: q.tags,
    enonce: str(q.question),
    multiple: false,
    options: choix.map((t, i) => ({ id: OPTION_LETTERS[i] || 'o' + i, texte: str(t) })),
    reponses_correctes: [OPTION_LETTERS[q.bonneReponse ?? 0] || 'a'],
    explication: str(q.explication),
    explication_distracteurs: [],
    source_cours: q.source_cours || null,
  };
}
function legacyFlashToV1(q) {
  return {
    type: 'flashcard', id: q.id, theme: q.concept, difficulte: q.difficulte, tags: q.tags,
    recto: str(q.recto), verso: str(q.verso),
    indice: q.indice != null ? q.indice : null,
    a_retenir: str(q.a_retenir),
  };
}
function legacyFeynmanToV1(q) {
  return {
    type: 'feynman', id: q.id, theme: q.concept, difficulte: q.difficulte, tags: q.tags,
    consigne: str(q.question_verification) || `Explique « ${str(q.concept) || 'ce concept'} »`,
    reponse_modele: str(q.explication_simple),
    points_cles_attendus: [],
    analogie_suggeree: null,
    erreurs_frequentes: asArray(q.pieges_frequents).map(str).filter(Boolean),
    grille_autoevaluation: [],
    regle_reussite: 'tous_essentiels',
    // conservé pour référence (contexte d'évaluation Feynman)
    lien_avec_le_cours: str(q.lien_avec_le_cours),
  };
}

/** renomme les champs d'un item legacy vers le vocabulaire v1.0 (sans valider) */
function legacyToV1Fields(q) {
  if (q.type === 'flashcard' || q.type === 'flash') return legacyFlashToV1(q);
  if (q.type === 'feynman') return legacyFeynmanToV1(q);
  return legacyQcmToV1(q); // défaut : qcm
}

/* ---------- rétro-remplissage "superset" (v1.0 → champs legacy d'affichage) ---------- */

/** champs legacy que les lecteurs actuels lisent encore, dérivés de l'item v1.0 */
function legacyBackfill(item, raw) {
  const base = { concept: item.theme || (raw && raw.concept) || '' };
  if (item.type === 'qcm') {
    const idx = item.options.findIndex((o) => o.id === item.reponses_correctes[0]);
    return {
      ...base,
      question: item.enonce,
      choix: item.options.map((o) => o.texte),
      bonneReponse: idx < 0 ? 0 : idx,
      explication: item.explication,
    };
  }
  if (item.type === 'feynman') {
    return {
      ...base,
      explication_simple: item.reponse_modele,
      question_verification: item.consigne,
      pieges_frequents: item.erreurs_frequentes,
      lien_avec_le_cours: item.lien_avec_le_cours || (raw && raw.lien_avec_le_cours) || '',
    };
  }
  // flashcard/exercice : recto/verso déjà partagés ; concept suffit
  return base;
}

/**
 * ITEM (legacy OU v1.0) → item INTERNE "superset" : item v1.0 canonique
 * + champs legacy rétro-remplis + champs d'origine préservés (SM-2, imageId…).
 * Idempotent. Renvoie null si l'item est invalide.
 * @param {object} raw
 * @param {(item:object)=>object} [decorate] — hook pour ajouter des champs (ex: id neuf)
 */
export function toInternalItem(raw, decorate) {
  if (!raw || typeof raw !== 'object') return null;
  const v1source = isLegacyItem(raw) ? legacyToV1Fields(raw) : raw;
  const res = normalizeV1Item(v1source);
  if (!res.ok) return null;
  const item = res.item;
  const merged = {
    ...raw,                       // préserve extras (interval/repetition/nextReview/historique/missed/ficheId/imageId…)
    ...item,                      // impose le canon v1.0
    ...legacyBackfill(item, raw), // rétro-remplit l'affichage legacy
    id: raw.id || item.id,        // garde la clé primaire existante
    _schema: SCHEMA_VERSION,
  };
  return decorate ? decorate(merged) : merged;
}

/**
 * DOCUMENT ancien format {questions, synthese} → document v1.0 {schema_version, meta, items}.
 * (Sert au flux d'import « coller le JSON » quand l'utilisateur colle l'ancien format.)
 */
export function legacyDocToV1(data) {
  const items = asArray(data.questions)
    .map((q) => normalizeV1Item(legacyToV1Fields(q)))
    .filter((r) => r.ok)
    .map((r) => r.item);
  return {
    schema_version: SCHEMA_VERSION,
    meta: {
      matiere: null, titre: '', resume: str(data.synthese),
      notions_cles: [], prerequis: [],
      nb_items: items.length, repartition: repartitionOf(items),
    },
    items,
    _legacySynthese: str(data.synthese),
  };
}
