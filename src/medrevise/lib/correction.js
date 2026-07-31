/* ============================================================
   MedRevise — correction d'exercice NUMÉRIQUE, sans IA ni réseau.
   Les bornes sont DÉJÀ calculées dans le JSON (valeur_min / valeur_max) :
   on ne recalcule AUCUNE tolérance côté client. On normalise la saisie,
   on teste valeur_min <= saisie <= valeur_max, et on valide l'unité si elle
   est fournie et figure dans unites_acceptees.
   ============================================================ */
import { evalExpr } from './calc.js';

/**
 * Sépare une saisie « 1 234,5 m/s » en nombre + unité et normalise le nombre.
 * Gère : virgule décimale, espaces (+ insécables), séparateurs de milliers,
 * notation scientifique (1.2e-3).
 * @returns {{value:number|null, unit:string, raw:string}}
 */
export function parseNumericInput(raw) {
  let s = String(raw == null ? '' : raw).trim();
  if (!s) return { value: null, unit: '', raw: s };
  // retire espaces (normaux + insécables) = séparateurs de milliers éventuels
  s = s.replace(/[\s  ]/g, '');
  // sépare la partie numérique (début) de l'unité (reste)
  const m = s.match(/^([+-]?[\d.,]+(?:[eE][+-]?\d+)?)(.*)$/);
  if (!m) return { value: null, unit: s, raw };
  let num = m[1];
  const unit = (m[2] || '').trim();
  // milliers "." + décimale "," (fr) → retire les points, virgule → point
  if (num.includes(',') && num.includes('.')) num = num.replace(/\./g, '').replace(',', '.');
  else if (num.includes(',')) num = num.replace(',', '.');
  const value = parseFloat(num);
  return { value: Number.isFinite(value) ? value : null, unit, raw };
}

const normU = (u) => String(u || '').toLowerCase().replace(/[\s ]/g, '');

/**
 * Convertit une saisie du champ "Valeur" en nombre reel. Reutilise le meme
 * evaluateur que la calculatrice integree (evalExpr, lib/calc.js) : accepte
 * donc un nombre simple ("0.003") ou une expression scientifique tapee via
 * le clavier scientifique ("3*10^-3", "sqrt(9)", "pi/2"...). Une saisie
 * ambigue ou syntaxiquement invalide (parenthese non fermee, caractere
 * inconnu...) leve dans evalExpr -> renvoie null ici, JAMAIS une valeur
 * devinee : le champ est alors traite comme vide/faux par checkNumerique.
 * @returns {number|null}
 */
export function parseScientificValue(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return null;
  try {
    const v = evalExpr(s);
    return Number.isFinite(v) ? v : null;
  } catch (e) {
    return null;
  }
}

/**
 * Corrige une saisie contre reponse{valeur_min, valeur_max, unites_acceptees, unite}.
 * valRaw/unitRaw : champs Valeur/Unite deja separes cote UI (NumericAnswer) —
 * pas de re-decoupage d'une chaine combinee, la valeur passe par parseScientificValue.
 * @returns {{ok:boolean, value:number|null, inRange:boolean, unitProvided:boolean,
 *            unitOk:boolean, empty:boolean}}
 */
export function checkNumerique(valRaw, unitRaw, reponse) {
  const r = reponse || {};
  const value = parseScientificValue(valRaw);
  const unit = String(unitRaw || '').trim();
  const empty = value == null;
  const min = Number(r.valeur_min);
  const max = Number(r.valeur_max);
  const inRange = value != null && Number.isFinite(min) && Number.isFinite(max)
    && value >= min && value <= max;

  const accepted = [r.unite, ...(r.unites_acceptees || [])].filter(Boolean).map(normU);
  const unitProvided = !!unit;
  // unité facultative : si fournie, elle doit figurer dans les unités acceptées
  const unitOk = !unitProvided || accepted.length === 0 || accepted.includes(normU(unit));

  return { ok: inRange && unitOk, value, inRange, unitProvided, unitOk, empty };
}
