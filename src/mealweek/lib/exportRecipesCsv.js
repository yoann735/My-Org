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
   ============================================================ */
import { RECIPES, ingRef } from '../data/dataLayer.js';

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

/** nombre → texte à point décimal (le séparateur du CSV est la virgule). */
function num(v) {
  return v == null || v === '' || Number.isNaN(Number(v)) ? '' : String(v);
}

/** échappement CSV : guillemets si virgule, guillemet, saut de ligne ou
    espaces de bord — les guillemets internes sont doublés. */
function cell(v) {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) || s !== s.trim() ? '"' + s.replace(/"/g, '""') + '"' : s;
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

/** Sérialise les lignes. BOM en tête pour qu'Excel lise l'UTF-8 sans réglage. */
export function serializeCsv(rows) {
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** Le fichier complet, en une passe. */
export function buildRecipesCsv(recipes = RECIPES) {
  return serializeCsv(buildRecipesRows(recipes));
}

/** mealweek_recettes_complet_2026-08-31.csv */
export function csvFilename(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const jour = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  return `mealweek_recettes_complet_${jour}.csv`;
}

/* iOS / iPadOS uniquement : là-bas les vieux Safari OUVRENT le fichier d'un
   `<a download>` dans un onglet au lieu de l'enregistrer, la feuille de
   partage est le geste fiable. Ailleurs (Chrome, Safari desktop) `share` +
   `canShare({files})` répondent « oui » aussi : s'y fier détournerait un
   simple téléchargement vers une feuille de partage inattendue. */
function preferePartage() {
  if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Génère le CSV et le remet à l'utilisateur : feuille de partage iOS si on y
 * est, sinon téléchargement natif. Le repli va toujours du partage vers le
 * téléchargement — jamais l'utilisateur sans fichier. Ne lève pas.
 * @returns {Promise<{ok:boolean, statut:'partage'|'telechargement'|'annule'|'erreur',
 *                    message:string, nom:string, lignes:number, recettes:number}>}
 */
export async function exportRecipesCsv(recipes = RECIPES) {
  const nom = csvFilename();
  try {
    const rows = buildRecipesRows(recipes);
    const texte = serializeCsv(rows);
    const lignes = rows.length - 1; // hors en-tête
    const blob = new Blob([texte], { type: 'text/csv;charset=utf-8' });

    if (preferePartage()) {
      try {
        const file = new File([blob], nom, { type: 'text/csv' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: nom });
          return { ok: true, statut: 'partage', nom, lignes, recettes: recipes.length,
            message: `${recipes.length} recettes · ${lignes} lignes partagées.` };
        }
      } catch (e) {
        if (e && e.name === 'AbortError') {
          return { ok: false, statut: 'annule', nom, lignes, recettes: recipes.length, message: 'Export annulé.' };
        }
        // NotAllowedError / partage de fichiers refusé : on télécharge.
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nom;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // révocation différée : Safari lit l'URL APRÈS le retour du click().
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { ok: true, statut: 'telechargement', nom, lignes, recettes: recipes.length,
      message: `${recipes.length} recettes · ${lignes} lignes exportées.` };
  } catch (e) {
    return { ok: false, statut: 'erreur', nom, lignes: 0, recettes: 0,
      message: "L'export a échoué : " + (e && e.message ? e.message : 'erreur inconnue') };
  }
}
