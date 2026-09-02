/* ============================================================
   MealWeek — export CSV de la bibliothèque de recettes

   Vidage générique de la base recettes : une ligne par recette, les
   colonnes étant dérivées des données présentes (voir exportCommon).
   Les colonnes figées de l'ancienne base (protéine, coût estimé,
   allergènes, nutrition, ingrédients livrés / non inclus…) ont été
   supprimées avec le contenu. Base vierge → fichier réduit à son
   en-tête, sans erreur.

   L'échappement, la sérialisation et la remise du fichier restent
   dans csvFile.js, partagés avec l'export ingrédients.
   ============================================================ */
import { RECIPES } from '../data/dataLayer.js';
import { serializeCsv, csvFilenameFor, remettreCsv } from './csvFile.js';
import { buildRows } from './exportCommon.js';

export { serializeCsv };

/** @returns {string[][]} toutes les lignes du fichier, en-tête comprise */
export function buildRecipesRows(recipes = RECIPES) {
  return buildRows(recipes);
}

export function buildRecipesCsv(recipes = RECIPES) {
  return serializeCsv(buildRecipesRows(recipes));
}

/** mealweek_recettes_complet_AAAA-MM-JJ.csv */
export function csvFilename(date = new Date()) {
  return csvFilenameFor('recettes', date);
}

/**
 * Génère le CSV et le remet à l'utilisateur : feuille de partage iOS si on y
 * est, sinon téléchargement natif. Ne lève pas.
 */
export async function exportRecipesCsv(recipes = RECIPES) {
  const nom = csvFilename();
  try {
    const rows = buildRecipesRows(recipes);
    const lignes = Math.max(0, rows.length - 1);
    if (!recipes.length) {
      return { ok: false, statut: 'vide', nom, lignes: 0, recettes: 0,
        message: 'Aucune recette à exporter : la bibliothèque est vide.' };
    }
    const statut = await remettreCsv(serializeCsv(rows), nom);
    if (statut === 'annule') {
      return { ok: false, statut, nom, lignes, recettes: recipes.length, message: 'Export annulé.' };
    }
    const verbe = statut === 'partage' ? 'partagées' : 'exportées';
    return { ok: true, statut, nom, lignes, recettes: recipes.length,
      message: `${recipes.length} recettes · ${lignes} lignes ${verbe}.` };
  } catch (e) {
    return { ok: false, statut: 'erreur', nom, lignes: 0, recettes: 0,
      message: "L'export a échoué : " + (e && e.message ? e.message : 'erreur inconnue') };
  }
}
