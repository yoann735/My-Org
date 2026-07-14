/* ============================================================
   MedRevise — SCHÉMA UNIFIÉ v1.0 (source de vérité interne).
   Définitions + validateurs/normaliseurs PURS (aucun IO, aucun réseau).

   Un item porte TOUJOURS : id, type, theme, difficulte (1|2|3), tags[].
   INVARIANTS (à ne pas recoder autrement ailleurs) :
   - "id"                 = clé primaire IndexedDB.
   - "type"               = SEUL champ de tri/filtrage.
   - "sous_type"          = SEUL discriminant du mode de correction (exercices).
   - "reponses_correctes" et "indices" sont TOUJOURS des tableaux.
   ============================================================ */

export const SCHEMA_VERSION = '1.0';

/** matières de rattrapage (partie pratique = exercices) */
export const MATIERES = ['Biologie', 'Chimie', 'Physique', 'Mathematiques'];

/** lettres d'options QCM (id d'option = a, b, c, …) */
export const OPTION_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

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

function normQcm(raw, c) {
  if (!isStr(raw.enonce)) return null;
  // options : {id,texte} — id manquant → lettre par position ; ids rendus uniques
  const seen = new Set();
  const options = asArray(raw.options).map((o, i) => {
    let id = str(o && o.id).trim() || OPTION_LETTERS[i] || 'o' + i;
    while (seen.has(id)) id += '_';
    seen.add(id);
    const texte = str(o && (o.texte != null ? o.texte : o.text)).trim();
    return { id, texte };
  }).filter((o) => o.texte);
  if (options.length < 2) return null;
  const ids = new Set(options.map((o) => o.id));
  // reponses_correctes : TOUJOURS un tableau d'ids. Accepte des index legacy
  // (entiers) qu'on convertit vers l'id d'option correspondant.
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
  if (!reponses_correctes.length) return null;
  const multiple = raw.multiple != null ? !!raw.multiple : reponses_correctes.length > 1;
  const explication_distracteurs = asArray(raw.explication_distracteurs)
    .map((e) => (e && (e.option_id != null)
      ? { option_id: str(e.option_id), pourquoi_faux: str(e.pourquoi_faux) }
      : null))
    .filter(Boolean);
  return {
    ...c, type: 'qcm',
    enonce: raw.enonce.trim(), multiple, options, reponses_correctes,
    explication: str(raw.explication).trim(),
    explication_distracteurs,
    source_cours: isStr(raw.source_cours) ? raw.source_cours.trim() : null,
  };
}

function normFlashcard(raw, c) {
  if (!isStr(raw.recto) || !isStr(raw.verso)) return null;
  return {
    ...c, type: 'flashcard',
    recto: raw.recto.trim(), verso: raw.verso.trim(),
    indice: isStr(raw.indice) ? raw.indice.trim() : null,
    a_retenir: str(raw.a_retenir).trim(),
  };
}

function normFeynman(raw, c) {
  const consigne = str(raw.consigne).trim();
  const reponse_modele = str(raw.reponse_modele).trim();
  if (!consigne || !reponse_modele) return null;
  return {
    ...c, type: 'feynman',
    consigne, reponse_modele,
    points_cles_attendus: asArray(raw.points_cles_attendus).map(str).filter(Boolean),
    analogie_suggeree: isStr(raw.analogie_suggeree) ? raw.analogie_suggeree.trim() : null,
    erreurs_frequentes: asArray(raw.erreurs_frequentes).map(str).filter(Boolean),
    grille_autoevaluation: normGrille(raw.grille_autoevaluation),
    regle_reussite: str(raw.regle_reussite).trim() || 'tous_essentiels',
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
  if (!isStr(raw.enonce)) return null;
  const sous_type = str(raw.sous_type).trim();
  if (sous_type !== 'numerique' && sous_type !== 'ouvert') return null;
  const common = {
    ...c, type: 'exercice', sous_type,
    enonce: raw.enonce.trim(),
    necessite_calculatrice: !!raw.necessite_calculatrice,
    donnees: normDonnees(raw.donnees),
    formules: normFormules(raw.formules),
    indices: normIndices(raw.indices),
    pieges: asArray(raw.pieges).map(str).filter(Boolean),
    correction: normCorrection(raw.correction),
  };
  if (sous_type === 'numerique') {
    const reponse = normReponseNumerique(raw.reponse);
    if (!reponse) return null; // bornes valeur_min/valeur_max requises
    return { ...common, reponse };
  }
  // ouvert : pas de correction auto → grille + règle obligatoires
  const grille = normGrille(raw.grille_autoevaluation);
  if (!grille.length) return null;
  return {
    ...common, reponse: null,
    grille_autoevaluation: grille,
    regle_reussite: str(raw.regle_reussite).trim() || 'tous_essentiels',
  };
}

const NORMALIZERS = { qcm: normQcm, flashcard: normFlashcard, feynman: normFeynman, exercice: normExercice };

/**
 * Normalise/valide un item DÉJÀ au vocabulaire v1.0 (noms de champs v1.0).
 * @returns {{ok:true, item}|{ok:false}}
 */
export function normalizeV1Item(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false };
  const fn = NORMALIZERS[raw.type];
  if (!fn) return { ok: false };
  const item = fn(raw, commonFields(raw));
  return item ? { ok: true, item } : { ok: false };
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
