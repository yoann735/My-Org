/* ============================================================
   MedRevise — flashcards à trou (cloze, v1.1). 100 % LOCAL, AUCUNE IA.
   Parse le recto "texte {{mot}} texte" en segments texte/trou. La
   correction du mode actif RÉUTILISE matchAnat (lib/anatMatch.js, quiz
   d'anatomie) — même normalisation + tolérance Levenshtein, pas de
   logique dupliquée.
   ============================================================ */
import { matchAnat } from './anatMatch.js';

/** un item flashcard porte-t-il un cloze exploitable ? */
export function isCloze(item) {
  return !!(item && item.type === 'flashcard' && Array.isArray(item.cloze) && item.cloze.length > 0);
}

/**
 * Segmente le recto en texte/trous, dans l'ordre d'apparition des "{{...}}".
 * L'attendu de chaque trou = cloze[i] (le tableau fait foi) ; à défaut
 * (recto qui contiendrait plus de trous que le tableau), on retombe sur le
 * contenu de l'accolade elle-même.
 * @returns {Array<{type:'text',value:string}|{type:'blank',index:number,expected:string}>}
 */
export function parseCloze(recto, cloze) {
  const src = recto || '';
  const clozeArr = Array.isArray(cloze) ? cloze : [];
  const re = /\{\{([^{}]+)\}\}/g;
  const segments = [];
  let last = 0, m, i = 0;
  while ((m = re.exec(src))) {
    if (m.index > last) segments.push({ type: 'text', value: src.slice(last, m.index) });
    const expected = (clozeArr[i] && String(clozeArr[i]).trim()) || m[1].trim();
    segments.push({ type: 'blank', index: i, expected });
    last = re.lastIndex;
    i++;
  }
  if (last < src.length) segments.push({ type: 'text', value: src.slice(last) });
  return segments;
}

/** trous seuls (index + attendu), dans l'ordre — pratique pour les champs de saisie. */
export function clozeBlanks(recto, cloze) {
  return parseCloze(recto, cloze).filter((s) => s.type === 'blank');
}

/**
 * Corrige une saisie contre le mot attendu d'un trou — RÉUTILISE matchAnat
 * (normalisation + Levenshtein), mais avec un seuil différent de l'anatomie :
 * là où le quiz de schéma traite "near" comme un simple indice ("presque",
 * override manuel requis), le cloze doit compter une faute de frappe (1-2
 * caractères sur la forme normalisée) comme JUSTE automatiquement.
 * `typo` distingue une réponse tolérée (orthographe proche) d'une réponse
 * exacte, sans changer le verdict "juste". Le bouton « Compter comme juste »
 * reste le filet pour les cas hors tolérance (synonyme non reconnu, etc.).
 * @returns {{ok:boolean, typo:boolean}}
 */
export function matchClozeBlank(input, expected) {
  const m = matchAnat(input, { texte: expected });
  return { ok: m.ok || m.near, typo: !m.ok && m.near };
}

/**
 * Mode « Retourner » : verso complet, mots précédemment masqués mis en évidence.
 * @returns {Array<{text:string, hl:boolean}>}
 */
export function highlightClozeWords(text, words) {
  const src = text || '';
  const terms = [...new Set((words || []).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!src || !terms.length) return [{ text: src, hl: false }];
  const pattern = terms.map((w) => String(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(pattern, 'gi');
  const parts = [];
  let last = 0, m;
  while ((m = re.exec(src))) {
    if (m.index > last) parts.push({ text: src.slice(last, m.index), hl: false });
    parts.push({ text: m[0], hl: true });
    last = m.index + m[0].length;
  }
  if (last < src.length) parts.push({ text: src.slice(last), hl: false });
  return parts.length ? parts : [{ text: src, hl: false }];
}
