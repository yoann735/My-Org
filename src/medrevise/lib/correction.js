/* ============================================================
   MedRevise — correction d'exercice NUMÉRIQUE, sans IA ni réseau.
   Les bornes sont DÉJÀ calculées dans le JSON (valeur_min / valeur_max) :
   on ne recalcule AUCUNE tolérance côté client. On normalise la saisie,
   on teste valeur_min <= saisie <= valeur_max, et on valide l'unité si elle
   est fournie et figure dans unites_acceptees.
   ============================================================ */

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
  s = s.replace(/[\s  ]/g, '');
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

const normU = (u) => String(u || '').toLowerCase().replace(/[\s ]/g, '');

/**
 * Corrige une saisie contre reponse{valeur_min, valeur_max, unites_acceptees, unite}.
 * @returns {{ok:boolean, value:number|null, inRange:boolean, unitProvided:boolean,
 *            unitOk:boolean, empty:boolean}}
 */
export function checkNumerique(input, reponse) {
  const r = reponse || {};
  const { value, unit } = parseNumericInput(input);
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
