/* ============================================================
   MealWeek — export CSV exhaustif de la bibliothèque de recettes
   Une ligne par COUPLE (recette, ingrédient) : les 43 recettes
   (R01-R40 + les 3 pizzas fraîches PZ1-PZ3), avec pour chacune
   ses ingrédients livrés ET ses ingrédients « non inclus ».

   Aucune valeur n'est recalculée ni approximée : tout vient de
   dataLayer (donc du JSON figé chargé par l'app). La seule
   dérivation est la catégorie des lignes « non inclus », que le
   JSON ne porte pas sur l'ingrédient lui-même — on va la lire
   dans ingredients_ref, la même source que le reste de l'app.

   L'échappement, la sérialisation et la remise du fichier sont
   dans csvFile.js, partagés avec l'export ingrédients.
   ============================================================ */
import { RECIPES, ingRef } from '../data/dataLayer.js';
import { num, serializeCsv, csvFilenameFor, remettreCsv } from './csvFile.js';

export { serializeCsv };

/* les deux natures de ligne, libellées pour être lisibles dans le tableur */
const LIVRE = 'Ingrédient livré';
const NON_INCLUS = 'Non inclus / à prévoir';

export const CSV_HEADERS = [
  'ID recette',
  'Nom recette',
  'Protéine',
  'Temps (min)',
  'Complexité',
  'Coût',
  'Coût estimé ×2 portions (€)',
  'Four',
  'Pizza',
  'Allergènes',
  'Kcal / portion',
  'Protéines (g) / portion',
  'Glucides (g) / portion',
  'Lipides (g) / portion',
  'Ingrédient',
  'Quantité pour 1 portion',
  'Catégorie ingrédient',
  "Type de ligne",
];

/* ---------- normalisation des valeurs ---------- */

const oui = (v) => (v ? 'Oui' : 'Non');

/** `allergenes` est tantôt une chaîne « a, b, c » (R01-R40), tantôt un
    tableau (PZ1-PZ3) : dans les deux cas on ressort « a; b; c ». */
function allergenes(raw) {
  const list = Array.isArray(raw)
    ? raw
    : String(raw || '').split(',');
  return list.map((s) => String(s).trim()).filter(Boolean).join('; ');
}

/* ---------- construction des lignes ---------- */

/** Les 18 champs communs à toutes les lignes d'une même recette. */
function recipeCells(r) {
  const n = r.nutrition_1portion || {};
  return [
    r.id,
    r.nom,
    r.proteine,
    num(r.temps_min),
    r.complexite,
    r.cout,
    num(r.cout_estime_x2),
    oui(r.four),
    oui(r.pizza),
    allergenes(r.allergenes),
    num(n.kcal),
    num(n.proteines_g),
    num(n.glucides_g),
    num(n.lipides_g),
  ];
}

/**
 * Toutes les lignes du fichier, en-tête comprise.
 * @returns {string[][]}
 */
export function buildRecipesRows(recipes = RECIPES) {
  const rows = [CSV_HEADERS];
  recipes.forEach((r) => {
    const base = recipeCells(r);
    const livres = r.ingredients_livres || [];
    const nonInclus = r.non_inclus || [];

    livres.forEach((i) => {
      rows.push([...base, i.nom, i.qty_1portion, i.categorie || '', LIVRE]);
    });
    nonInclus.forEach((i) => {
      // le JSON ne porte pas la catégorie sur ces lignes : on la reprend
      // de ingredients_ref (même source que la liste de courses).
      rows.push([...base, i.nom, i.qty, (ingRef(i.nom) || {}).categorie || '', NON_INCLUS]);
    });
    // une recette sans aucun ingrédient reste présente dans l'export
    if (!livres.length && !nonInclus.length) rows.push([...base, '', '', '', '']);
  });
  return rows;
}

/** Le fichier complet, en une passe. */
export function buildRecipesCsv(recipes = RECIPES) {
  return serializeCsv(buildRecipesRows(recipes));
}

/** mealweek_recettes_complet_2026-08-31.csv */
export function csvFilename(date = new Date()) {
  return csvFilenameFor('recettes', date);
}

/**
 * Génère le CSV et le remet à l'utilisateur : feuille de partage iOS si on y
 * est, sinon téléchargement natif. Ne lève pas.
 * @returns {Promise<{ok:boolean, statut:'partage'|'telechargement'|'annule'|'erreur',
 *                    message:string, nom:string, lignes:number, recettes:number}>}
 */
export async function exportRecipesCsv(recipes = RECIPES) {
  const nom = csvFilename();
  try {
    const rows = buildRecipesRows(recipes);
    const lignes = rows.length - 1; // hors en-tête
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
