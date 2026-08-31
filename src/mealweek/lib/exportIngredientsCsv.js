/* ============================================================
   MealWeek — export CSV exhaustif de la base ingrédients
   Une ligne par COUPLE (ingrédient, format d'achat) : les 140
   entrées de `ingredients_ref` (y compris les 3 pizzas fraîches
   Sodebo Crust), un ingrédient multi-format (Champignons de Paris,
   Gnocchi, Viande hachée…) donnant autant de lignes qu'il a de
   formats — soit 151 lignes au total.

   Aucune valeur n'est inventée ni approximée. Prix, formats,
   grammages, DLC, substituts et notes sortent tels quels de
   `ingredients_ref`. Les deux SEULES valeurs dérivées le sont
   par les parseurs de l'app elle-même (dataLayer), jamais par une
   estimation « à vue » :
     - la contenance, via `candidateFormats` / `formatGrammes` /
       `formatVolumeCl` (les mêmes qui choisissent les formats de la
       liste de courses) ;
     - le prix au kg/L, division exacte prix ÷ contenance, laissé
       VIDE dès que le format ne donne ni poids ni volume
       ("1 pièce", "1 tête", "1 botte", "—"…).
   ============================================================ */
import {
  ING_REF, RECIPES, candidateFormats, formatGrammes, formatVolumeCl, parseQty,
} from '../data/dataLayer.js';
import { num, serializeCsv, csvFilenameFor, remettreCsv } from './csvFile.js';

export const CSV_HEADERS = [
  'Nom',
  'Nom Chronodrive',
  'Catégorie',
  "Format d'achat",
  'Quantité/contenu en grammes (ou équivalent)',
  'Prix (€)',
  'Prix au kg ou au litre (€)',
  'Multi-format',
  'Disponible Chronodrive',
  'DLC (jours)',
  'Substitut éventuel',
  'Note',
];

/* ---------- normalisation des valeurs ---------- */

const round2 = (x) => Math.round(x * 100) / 100;

/** `dispo_chronodrive` est stocké avec son emoji : "✅ Oui", "❌ Non", mais
    aussi "⚠️ Parfois", "✅ Oui (saison)" et "?" pour les cas non tranchés.
    On retire l'emoji et on garde le texte — "Oui" ou "Non" pour 129 des 140
    entrées ; forcer les autres à Oui ou Non inventerait une certitude que la
    base n'a pas, et "?" ressort donc vide. */
function dispo(raw) {
  return String(raw || '').replace(/[^\p{L}\p{N}\s()]/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** Contenance du format, avec son unité, quand le libellé la donne :
    "600g"→"600 g", "2 x 150g"→"300 g", "3x20cl"→"60 cl". Vide sinon
    ("1 tête", "1 pièce", "1 botte", "—") : on ne devine pas un poids. */
function contenance(grammes, formatStr) {
  const g = grammes != null ? grammes : formatGrammes(formatStr);
  if (g != null) return `${num(round2(g))} g`;
  const cl = formatVolumeCl(formatStr);
  return cl != null ? `${num(round2(cl))} cl` : '';
}

/** Prix au kilo (format en poids) ou au litre (format en volume).
    Vide si la contenance est inconnue ou le prix absent — jamais estimé. */
function prixUnitaire(prix, grammes, formatStr) {
  if (prix == null || prix === '' || Number.isNaN(Number(prix))) return '';
  const g = grammes != null ? grammes : formatGrammes(formatStr);
  if (g != null && g > 0) return num(round2(Number(prix) / (g / 1000)));
  const cl = formatVolumeCl(formatStr);
  if (cl != null && cl > 0) return num(round2(Number(prix) / (cl / 100)));
  return '';
}

/* ---------- règles d'achat spéciales ---------- */

/* Les ingrédients dont les recettes expriment la quantité en « sachet » :
   pour ceux-là, la règle d'achat de l'app (dataLayer.computePurchase, cas c)
   est d'acheter UN pot entier, jamais plus. Cette règle n'est pas écrite dans
   `ingredients_ref` — elle se lit sur l'unité employée par les recettes, donc
   on la retrouve ici à la même source, sans la présumer. */
const EN_POT_ENTIER = (() => {
  const set = new Set();
  RECIPES.forEach((r) => {
    (r.ingredients_livres || []).forEach((i) => {
      if (parseQty(i.qty_1portion).unit.toLowerCase().startsWith('sachet')) set.add(i.nom);
    });
  });
  return set;
})();

/** La note du JSON telle quelle. Les règles ail (gousses → tête) et œufs
    (boîte de 6) y sont DÉJÀ écrites ; seule celle du pot entier n'a pas de
    note qui la porte, on la complète alors sans jamais écraser le texte
    existant. */
function note(name, ref) {
  const brute = String(ref.note || '').trim();
  if (brute) return brute;
  return EN_POT_ENTIER.has(name)
    ? "Épice / herbe séchée : achetée par POT ENTIER, jamais plus d'un pot."
    : '';
}

/* ---------- construction des lignes ---------- */

/**
 * Toutes les lignes du fichier, en-tête comprise : une par couple
 * (ingrédient, format d'achat).
 * @returns {string[][]}
 */
export function buildIngredientsRows(refs = ING_REF) {
  const rows = [CSV_HEADERS];
  Object.keys(refs).forEach((name) => {
    const ref = refs[name] || {};
    // même énumération de formats que la liste de courses : le tableau
    // `formats` si multi-format, sinon l'unique `format_achat` + `prix`.
    const formats = candidateFormats(name);
    const multi = ref.multi_format ? 'Oui' : 'Non'; // le drapeau du JSON, pas une déduction

    formats.forEach((f) => {
      rows.push([
        name,
        ref.nom_chronodrive || '',
        ref.categorie || '',
        f.format || '',
        contenance(f.grammes, f.format),
        num(f.prix),
        prixUnitaire(f.prix, f.grammes, f.format),
        multi,
        dispo(ref.dispo_chronodrive),
        num(ref.dlc_jours),
        ref.substitut || '',
        note(name, ref),
      ]);
    });
  });
  return rows;
}

/** Le fichier complet, en une passe. */
export function buildIngredientsCsv(refs = ING_REF) {
  return serializeCsv(buildIngredientsRows(refs));
}

/** mealweek_ingredients_complet_2026-08-31.csv */
export function csvFilename(date = new Date()) {
  return csvFilenameFor('ingredients', date);
}

/**
 * Génère le CSV et le remet à l'utilisateur : feuille de partage iOS si on y
 * est, sinon téléchargement natif. Ne lève pas.
 * @returns {Promise<{ok:boolean, statut:'partage'|'telechargement'|'annule'|'erreur',
 *                    message:string, nom:string, lignes:number, ingredients:number}>}
 */
export async function exportIngredientsCsv(refs = ING_REF) {
  const nom = csvFilename();
  const ingredients = Object.keys(refs).length;
  try {
    const rows = buildIngredientsRows(refs);
    const lignes = rows.length - 1; // hors en-tête
    const statut = await remettreCsv(serializeCsv(rows), nom);

    if (statut === 'annule') {
      return { ok: false, statut, nom, lignes, ingredients, message: 'Export annulé.' };
    }
    const verbe = statut === 'partage' ? 'partagées' : 'exportées';
    return { ok: true, statut, nom, lignes, ingredients,
      message: `${ingredients} ingrédients · ${lignes} lignes ${verbe}.` };
  } catch (e) {
    return { ok: false, statut: 'erreur', nom, lignes: 0, ingredients: 0,
      message: "L'export a échoué : " + (e && e.message ? e.message : 'erreur inconnue') };
  }
}
