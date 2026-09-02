/* ============================================================
   MealWeek — construction générique des lignes d'un export CSV

   L'ancienne version connaissait par cœur le schéma du contenu
   (colonnes recettes, formats d'achat, prix au kg…). Ce schéma a été
   supprimé avec le contenu : cette version est volontairement
   agnostique — elle dérive les colonnes des données présentes.
   Elle fonctionnera donc telle quelle sur la future base, quel que
   soit son schéma, et produit un fichier avec la seule en-tête tant
   que la base est vide.
   ============================================================ */

/** valeur de cellule : scalaire tel quel, structure sérialisée en JSON */
function valeur(v) {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** union ordonnée des clés de premier niveau des enregistrements */
export function colonnes(records) {
  const cols = [];
  records.forEach((r) => {
    if (!r || typeof r !== 'object') return;
    Object.keys(r).forEach((k) => { if (!cols.includes(k)) cols.push(k); });
  });
  return cols;
}

/**
 * Lignes du fichier, en-tête comprise.
 * @param {object[]} records enregistrements à exporter
 * @param {string} cleLabel intitulé de la colonne de clé (si les
 *   enregistrements viennent d'un objet indexé), sinon null
 * @param {string[]} cles clés d'index alignées sur `records`
 */
export function buildRows(records, cleLabel = null, cles = []) {
  const cols = colonnes(records);
  const entete = cleLabel ? [cleLabel, ...cols] : cols;
  const rows = [entete.length ? entete : ['(base vide)']];
  records.forEach((r, i) => {
    const ligne = cols.map((c) => valeur(r ? r[c] : null));
    rows.push(cleLabel ? [cles[i] ?? '', ...ligne] : ligne);
  });
  return rows;
}
