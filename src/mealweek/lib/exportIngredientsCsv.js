/* ============================================================
   MealWeek — export CSV de la base ingrédients

   Vidage générique : une ligne par ingrédient, colonnes dérivées des
   données présentes (voir exportCommon). Le dépliage par format
   d'achat, les prix au kg/L et les autres calculs de l'ancienne
   version ont été supprimés avec le contenu. Base vierge → fichier
   réduit à son en-tête, sans erreur.
   ============================================================ */
import { ING_REF } from '../data/dataLayer.js';
import { serializeCsv, csvFilenameFor, remettreCsv } from './csvFile.js';
import { buildRows } from './exportCommon.js';

/** @returns {string[][]} toutes les lignes du fichier, en-tête comprise */
export function buildIngredientsRows(ingRefMap = ING_REF) {
  const cles = Object.keys(ingRefMap || {});
  return buildRows(cles.map((k) => ingRefMap[k]), 'Ingrédient', cles);
}

export function buildIngredientsCsv(ingRefMap = ING_REF) {
  return serializeCsv(buildIngredientsRows(ingRefMap));
}

/** mealweek_ingredients_complet_AAAA-MM-JJ.csv */
export function csvFilename(date = new Date()) {
  return csvFilenameFor('ingredients', date);
}

export async function exportIngredientsCsv(ingRefMap = ING_REF) {
  const nom = csvFilename();
  const total = Object.keys(ingRefMap || {}).length;
  try {
    if (!total) {
      return { ok: false, statut: 'vide', nom, lignes: 0, ingredients: 0,
        message: 'Aucun ingrédient à exporter : la base est vide.' };
    }
    const rows = buildIngredientsRows(ingRefMap);
    const lignes = Math.max(0, rows.length - 1);
    const statut = await remettreCsv(serializeCsv(rows), nom);
    if (statut === 'annule') {
      return { ok: false, statut, nom, lignes, ingredients: total, message: 'Export annulé.' };
    }
    const verbe = statut === 'partage' ? 'partagés' : 'exportés';
    return { ok: true, statut, nom, lignes, ingredients: total,
      message: `${total} ingrédients · ${lignes} lignes ${verbe}.` };
  } catch (e) {
    return { ok: false, statut: 'erreur', nom, lignes: 0, ingredients: 0,
      message: "L'export a échoué : " + (e && e.message ? e.message : 'erreur inconnue') };
  }
}
