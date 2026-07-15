/* ============================================================
   MedRevise — correction TOLÉRANTE du quiz de schéma anatomique.
   100 % LOCAL, AUCUNE IA, AUCUN RÉSEAU (règle absolue).

   Trois couches (voir spec) :
   1. Normalisation appliquée AU LIBELLÉ STOCKÉ ET À LA SAISIE avant comparaison :
      minuscules, sans accents (NFD), sans ponctuation, ordinaux unifiés
      (5ème/5e/5eme/cinquième/5 → « 5 »), ordre des mots ignoré (tokens triés),
      mots vides retirés.
   2. Réponses acceptées multiples : la coche peut porter `reponses_acceptees`
      (synonymes que la normalisation ne devine pas : « nerf cubital » ↔ « nerf
      ulnaire »). La saisie est juste si elle égale le libellé principal OU l'un
      de ces synonymes (tous normalisés).
   3. Filet : distance de Levenshtein sur les formes normalisées → état « presque »
      (faute de frappe) distinct du faux franc, pour aider l'auto-correction manuelle.
   ============================================================ */

// mots vides courants (fr) — comparés APRÈS suppression des accents
const STOPWORDS = new Set(['la', 'le', 'les', 'de', 'du', 'des', 'l', 'd', 'un', 'une', 'et', 'a', 'au', 'aux']);

// ordinaux en toutes lettres 1er → 12e (sans accents), mappés vers leur chiffre
const WORD_ORDINALS = {
  premier: 1, premiere: 1, unieme: 1,
  deuxieme: 2, second: 2, seconde: 2,
  troisieme: 3, quatrieme: 4, cinquieme: 5, sixieme: 6, septieme: 7,
  huitieme: 8, neuvieme: 9, dixieme: 10, onzieme: 11, douzieme: 12,
};

/** minuscules + suppression des accents (NFD + diacritiques). */
function stripAccentsLower(s) {
  return (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** ordinal → chiffre : « 5eme », « 5e », « 1er », « 2nd », « cinquieme » → « 5 »/« 1 »/« 2 ». */
function toOrdinalDigit(tok) {
  if (WORD_ORDINALS[tok] != null) return String(WORD_ORDINALS[tok]);
  // chiffre suivi d'un suffixe ordinal (er, re, e, eme, ere, nd, nde, d, ieme…)
  const m = tok.match(/^(\d+)(?:er|re|ere|eme|ieme|iem|nd|nde|e|d)?$/);
  if (m) return m[1];
  return tok;
}

/**
 * Forme normalisée d'une réponse d'anatomie : chaîne canonique (tokens triés)
 * comparable des deux côtés. « 5ème côte », « Cote 5 », « la 5e cote » → « 5 cote ».
 */
export function normalizeAnat(s) {
  let t = stripAccentsLower(s);
  t = t.replace(/[^\p{L}\p{N}\s]+/gu, ' '); // ponctuation → espace
  t = t.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const tokens = t.split(' ')
    .map(toOrdinalDigit)
    .filter((tok) => tok && !STOPWORDS.has(tok));
  tokens.sort();
  return tokens.join(' ');
}

/** ensemble des formes normalisées acceptées pour une coche (principal + synonymes). */
export function acceptedNormForms(coche) {
  const raw = [coche && coche.texte, ...((coche && coche.reponses_acceptees) || [])];
  const set = new Set();
  raw.forEach((r) => { const n = normalizeAnat(r); if (n) set.add(n); });
  return set;
}

/** distance de Levenshtein (itérative, O(n·m)) — sur des formes courtes normalisées. */
export function levenshtein(a, b) {
  a = a || ''; b = b || '';
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

// tolérance « presque » : 1 caractère pour les libellés courts, 2 au-delà.
function nearThreshold(n) { return n.length <= 6 ? 1 : 2; }

/**
 * Corrige une saisie contre une coche.
 * @returns {{ ok: boolean, near: boolean }}
 *   ok   : forme normalisée == libellé principal OU une réponse acceptée.
 *   near : pas juste, mais à ≤ 1–2 caractères d'une forme acceptée (faute de frappe).
 */
export function matchAnat(input, coche) {
  const n = normalizeAnat(input);
  if (!n) return { ok: false, near: false };
  const forms = acceptedNormForms(coche);
  if (forms.has(n)) return { ok: true, near: false };
  let best = Infinity;
  forms.forEach((f) => { best = Math.min(best, levenshtein(n, f)); });
  return { ok: false, near: best > 0 && best <= nearThreshold(n) };
}
