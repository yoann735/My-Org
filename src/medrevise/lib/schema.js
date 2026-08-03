/* ============================================================
   MedRevise — SCHÉMA UNIFIÉ v1.0 (source de vérité interne).
   Définitions + validateurs/normaliseurs PURS (aucun IO, aucun réseau).

   Un item porte TOUJOURS : id, type, theme, difficulte (1|2|3), tags[].
   INVARIANTS (à ne pas recoder autrement ailleurs) :
   - "id"                 = clé primaire IndexedDB.
   - "type"               = SEUL champ de tri/filtrage.
   - "sous_type"          = SEUL discriminant du mode de correction (exercices).
   - "reponses_correctes" et "indices" sont TOUJOURS des tableaux.

   v1.1 (AJOUTS purement additifs, aucun champ v1.0 renommé/retiré) :
   - flashcard.cloze (array de strings, optionnel) — carte à trou, voir lib/cloze.js.
   - feynman.synthese_globale (bool, défaut false) — Feynman "tout le cours".
   - fiche.meta.qcm_conseille (entier|null) — passe déjà tel quel via
     parsePastedJson (meta = objet libre stocké sur la fiche), pas de champ
     d'item à valider ici ; lu par lib/planning.js (qcmConseilleFor).
   - fiche.meta.difficulte_chapitre — même mécanisme (passe-plat via meta),
     pas encore consommé (méthode des J des exercices, étape B).
   - exercice.jalon / exercice.difficulte_exo (validés ci-dessous,
     EXO_JALONS/EXO_DIFFICULTES) — méthode des J des exercices (étape A) :
     jalon LOGIQUE traduit en date absolue à l'import (storage.js newItem,
     lib/sm2.js dueDateForJalon), indépendante de la cadence théorie.
   ============================================================ */

export const SCHEMA_VERSION = '1.0';

/** matières de rattrapage (partie pratique = exercices) */
export const MATIERES = ['Biologie', 'Chimie', 'Physique', 'Mathematiques'];

/** lettres d'options QCM (id d'option = a, b, c, …) */
export const OPTION_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

/** méthode des J des EXERCICES (Étape A, indépendante de la cadence théorie
   ci-dessus — voir lib/sm2.js EXO_LABELS/dueDateForJalon) : jalon LOGIQUE
   assigné par le prompt de génération, valeur libre sinon (self-contained,
   pas d'import croisé avec sm2.js pour une simple liste de validation). */
const EXO_JALONS = new Set(['J0', 'J+2', 'J+7', 'J+15', 'J+30', 'J+45']);
const EXO_DIFFICULTES = new Set(['F', 'M', 'D']);

/* ---------- petits helpers purs ---------- */
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const str = (v) => (v == null ? '' : String(v));
export const asArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

/** id de repli si un item n'en fournit pas (les imports reçoivent un id neuf en base) */
function fallbackId(prefix = 'it') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** difficulte "facile|intermediaire|difficile" (ou nombre) → 1|2|3 (défaut 2) */
export function normDifficulte(d) {
  if (typeof d === 'number' && d >= 1 && d <= 3) return Math.round(d);
  const s = str(d).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
  if (['facile', 'facile', '1', 'easy', 'simple'].includes(s)) return 1;
  if (['difficile', '3', 'hard', 'expert'].includes(s)) return 3;
  if (['intermediaire', 'moyen', '2', 'medium'].includes(s)) return 2;
  return 2;
}

/** grille d'auto-évaluation → [{id, critere, essentiel}] (critere obligatoire) */
export function normGrille(raw) {
  return asArray(raw)
    .map((c, i) => (c && isStr(c.critere)
      ? { id: str(c.id) || 'c' + (i + 1), critere: c.critere.trim(), essentiel: !!c.essentiel }
      : null))
    .filter(Boolean);
}

/* ---------- champs communs ---------- */
function commonFields(raw) {
  return {
    id: str(raw.id) || fallbackId(),
    theme: str(raw.theme || raw.concept || '').trim(),
    difficulte: normDifficulte(raw.difficulte),
    tags: asArray(raw.tags).map(str).filter(Boolean),
  };
}

/* ============================================================
   NORMALISEURS PAR TYPE — renvoient l'item v1.0 canonique, ou null si invalide.
   La validation est volontairement tolérante sur les champs annexes,
   stricte sur ce qui rend l'item exploitable (énoncé, réponses…).
   ============================================================ */

// QCM — 2 formats d'options/réponses acceptés EN ENTRÉE, un seul en interne :
// - interne   : options = [{id,texte}],       reponses_correctes = [id, ...]
// - "prompt"  : options = ["texte", ...],      reponses_correctes = [index, ...] (0-based)
// Les deux sont détectés champ par champ (pas un flag global) et convertis vers
// le format interne ci-dessus — jamais stockés autrement que {id,texte}/[id].
function normQcm(raw, c) {
  if (!isStr(raw.enonce)) return { ok: false, reason: 'énoncé manquant' };
  const seen = new Set();
  const options = asArray(raw.options).map((o, i) => {
    // id : fourni seulement si `o` est un objet {id,...} (format interne) —
    // une simple chaîne (format "prompt") n'a pas d'id, on lui en attribue un.
    const providedId = (o && typeof o === 'object' && o.id != null) ? str(o.id).trim() : '';
    let id = providedId || OPTION_LETTERS[i] || 'o' + i;
    while (seen.has(id)) id += '_';
    seen.add(id);
    const texte = typeof o === 'string' ? o.trim() : str(o && (o.texte != null ? o.texte : o.text)).trim();
    return { id, texte };
  }).filter((o) => o.texte);
  if (options.length < 2) return { ok: false, reason: `moins de 2 options avec un texte non vide (${options.length} trouvée${options.length > 1 ? 's' : ''})` };
  const ids = new Set(options.map((o) => o.id));
  // reponses_correctes : TOUJOURS un tableau d'ids en sortie. Accepte des index
  // numériques 0-based (format "prompt") OU des ids déjà internes.
  const reponses = asArray(raw.reponses_correctes)
    .map((r) => {
      if (typeof r === 'number' && options[r]) return options[r].id;
      const s = str(r).trim();
      if (ids.has(s)) return s;
      const n = Number(s);
      if (Number.isInteger(n) && options[n]) return options[n].id;
      return null;
    })
    .filter(Boolean);
  const reponses_correctes = [...new Set(reponses)];
  if (!reponses_correctes.length) return { ok: false, reason: 'aucune réponse correcte reconnue (reponses_correctes vide ou index hors des options)' };
  const multiple = raw.multiple != null ? !!raw.multiple : reponses_correctes.length > 1;
  // explication_distracteurs : format interne [{option_id, pourquoi_faux}], OU
  // format "prompt" (tableau de chaînes, dans l'ordre des mauvaises options) —
  // rattachées alors POSITIONNELLEMENT aux options hors reponses_correctes.
  const rawDistracteurs = asArray(raw.explication_distracteurs);
  const explication_distracteurs = rawDistracteurs.length && rawDistracteurs.every((e) => typeof e === 'string')
    ? (() => {
        const wrongOptions = options.filter((o) => !reponses_correctes.includes(o.id));
        return rawDistracteurs
          .map((txt, i) => (wrongOptions[i] ? { option_id: wrongOptions[i].id, pourquoi_faux: str(txt).trim() } : null))
          .filter(Boolean);
      })()
    : rawDistracteurs
      .map((e) => (e && e.option_id != null ? { option_id: str(e.option_id), pourquoi_faux: str(e.pourquoi_faux) } : null))
      .filter(Boolean);
  return {
    ok: true,
    item: {
      ...c, type: 'qcm',
      enonce: raw.enonce.trim(), multiple, options, reponses_correctes,
      explication: str(raw.explication).trim(),
      explication_distracteurs,
      source_cours: isStr(raw.source_cours) ? raw.source_cours.trim() : null,
    },
  };
}

function normFlashcard(raw, c) {
  const okRecto = isStr(raw.recto), okVerso = isStr(raw.verso);
  if (!okRecto || !okVerso) {
    return { ok: false, reason: !okRecto && !okVerso ? 'recto et verso manquants' : !okRecto ? 'recto manquant' : 'verso manquant' };
  }
  // v1.1 : "cloze" (optionnel) = mots/expressions masqués dans le recto (voir
  // lib/cloze.js pour le parsing "{{mot}}" + rendu). Absent/vide → flashcard
  // recto/verso classique inchangée (rétro-compatible).
  const cloze = asArray(raw.cloze).map(str).map((s) => s.trim()).filter(Boolean);
  return {
    ok: true,
    item: {
      ...c, type: 'flashcard',
      recto: raw.recto.trim(), verso: raw.verso.trim(),
      indice: isStr(raw.indice) ? raw.indice.trim() : null,
      a_retenir: str(raw.a_retenir).trim(),
      ...(cloze.length ? { cloze } : {}),
    },
  };
}

function normFeynman(raw, c) {
  const consigne = str(raw.consigne).trim();
  const reponse_modele = str(raw.reponse_modele).trim();
  if (!consigne || !reponse_modele) {
    return { ok: false, reason: !consigne && !reponse_modele ? 'consigne et réponse modèle manquantes' : !consigne ? 'consigne manquante' : 'réponse modèle manquante' };
  }
  return {
    ok: true,
    item: {
      ...c, type: 'feynman',
      consigne, reponse_modele,
      points_cles_attendus: asArray(raw.points_cles_attendus).map(str).filter(Boolean),
      analogie_suggeree: isStr(raw.analogie_suggeree) ? raw.analogie_suggeree.trim() : null,
      erreurs_frequentes: asArray(raw.erreurs_frequentes).map(str).filter(Boolean),
      grille_autoevaluation: normGrille(raw.grille_autoevaluation),
      regle_reussite: str(raw.regle_reussite).trim() || 'tous_essentiels',
      // v1.1 : true = Feynman de SYNTHÈSE GLOBALE (explique tout le cours), les
      // points_cles_attendus font office de checklist. Défaut false (Feynman ponctuel).
      synthese_globale: !!raw.synthese_globale,
    },
  };
}

/* ---- exercices (structure complète — support UI arrive à l'Étape 3) ---- */
function normDonnees(raw) {
  return asArray(raw).map((d) => ({
    symbole: str(d && d.symbole), libelle: str(d && d.libelle),
    valeur: d && d.valeur != null ? d.valeur : '', unite: str(d && d.unite),
    source: str(d && d.source),
  }));
}
function normFormules(raw) {
  return asArray(raw).map((f) => ({ nom: str(f && f.nom), expression: str(f && f.expression), usage: str(f && f.usage) }));
}
function normIndices(raw) {
  return asArray(raw)
    .map((ind, i) => ({ niveau: Number(ind && ind.niveau) || i + 1, texte: str(ind && ind.texte).trim() }))
    .filter((ind) => ind.texte)
    .sort((a, b) => a.niveau - b.niveau);
}
function normCorrection(raw) {
  const r = raw || {};
  return {
    etapes: asArray(r.etapes).map((e, i) => ({
      n: Number(e && e.n) || i + 1, titre: str(e && e.titre),
      detail: str(e && e.detail), calcul: str(e && e.calcul),
    })),
    conclusion: str(r.conclusion).trim(),
  };
}
function normReponseNumerique(raw) {
  const r = raw || {};
  const min = Number(r.valeur_min);
  const max = Number(r.valeur_max);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null; // bornes obligatoires (déjà calculées côté JSON)
  const tol = r.tolerance || {};
  return {
    valeur: r.valeur != null ? r.valeur : null,
    unite: str(r.unite),
    unites_acceptees: asArray(r.unites_acceptees).map(str).filter(Boolean),
    tolerance: { type: str(tol.type), valeur: tol.valeur != null ? Number(tol.valeur) : null },
    valeur_min: min, valeur_max: max,
    chiffres_significatifs: r.chiffres_significatifs != null ? Number(r.chiffres_significatifs) : null,
    affichage_attendu: str(r.affichage_attendu),
  };
}
function normExercice(raw, c) {
  if (!isStr(raw.enonce)) return { ok: false, reason: 'énoncé manquant' };
  const sous_type = str(raw.sous_type).trim();
  if (sous_type !== 'numerique' && sous_type !== 'ouvert') {
    return { ok: false, reason: `sous_type invalide ("${sous_type || 'absent'}", attendu "numerique" ou "ouvert")` };
  }
  // méthode des J des exercices (Étape A) : "jalon" LOGIQUE (pas une date —
  // traduit en date absolue à l'import, voir storage.js newItem/sm2.js
  // dueDateForJalon) + "difficulte_exo", posés par le prompt de génération.
  // Absent/invalide → null, comportement legacy inchangé (exo toujours
  // librement accessible, jamais dans "Exercices du jour").
  const jalonRaw = str(raw.jalon).trim();
  const difficulteExoRaw = str(raw.difficulte_exo).trim();
  const common = {
    ...c, type: 'exercice', sous_type,
    enonce: raw.enonce.trim(),
    necessite_calculatrice: !!raw.necessite_calculatrice,
    donnees: normDonnees(raw.donnees),
    formules: normFormules(raw.formules),
    indices: normIndices(raw.indices),
    pieges: asArray(raw.pieges).map(str).filter(Boolean),
    correction: normCorrection(raw.correction),
    jalon: EXO_JALONS.has(jalonRaw) ? jalonRaw : null,
    difficulte_exo: EXO_DIFFICULTES.has(difficulteExoRaw) ? difficulteExoRaw : null,
  };
  if (sous_type === 'numerique') {
    const reponse = normReponseNumerique(raw.reponse);
    if (!reponse) return { ok: false, reason: 'réponse numérique invalide (valeur_min/valeur_max requis)' };
    return { ok: true, item: { ...common, reponse } };
  }
  // ouvert : pas de correction auto → grille + règle obligatoires
  const grille = normGrille(raw.grille_autoevaluation);
  if (!grille.length) return { ok: false, reason: 'grille d’auto-évaluation manquante (exercice "ouvert")' };
  return {
    ok: true,
    item: {
      ...common, reponse: null,
      grille_autoevaluation: grille,
      regle_reussite: str(raw.regle_reussite).trim() || 'tous_essentiels',
    },
  };
}

const NORMALIZERS = { qcm: normQcm, flashcard: normFlashcard, feynman: normFeynman, exercice: normExercice };

/**
 * Normalise/valide un item DÉJÀ au vocabulaire v1.0 (noms de champs v1.0).
 * `reason` (si ok:false) explique PRÉCISÉMENT pourquoi, pour l'afficher à
 * l'utilisateur (voir parsePastedJson.js) plutôt qu'un compteur muet.
 * @returns {{ok:true, item}|{ok:false, reason:string}}
 */
export function normalizeV1Item(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'item invalide (pas un objet)' };
  const fn = NORMALIZERS[raw.type];
  if (!fn) return { ok: false, reason: `type inconnu ("${raw.type}")` };
  return fn(raw, commonFields(raw));
}

/** compteurs vides pour l'aperçu d'import */
export function emptyCounts() {
  return { qcm: 0, flashcard: 0, feynman: 0, exercice: 0, ignored: 0 };
}

/** répartition {qcm,flashcard,feynman,exercice} d'une liste d'items v1.0 */
export function repartitionOf(items) {
  const r = { qcm: 0, flashcard: 0, feynman: 0, exercice: 0 };
  (items || []).forEach((it) => { if (r[it.type] != null) r[it.type]++; });
  return r;
}
