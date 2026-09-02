/* ============================================================
   MealWeek — data layer (V2, 2026-09-02)

   Adapte mealweek_data.json (V2 : 22 recettes, 8 semaines-types
   indépendantes S1-S8, 84 produits Chronodrive) aux formes que
   consomme l'UI.

   PRINCIPE : les données V2 sont utilisées TELLES QUELLES. Aucune
   quantité, aucun format d'achat, aucun prix n'est recalculé ici —
   la liste de courses d'une semaine, ses formats et ses totaux
   viennent du fichier. Ce module ne fait qu'assembler et filtrer.

   La seule dérivation est le RATTACHEMENT produit → recette
   (voir « ATTRIBUTION » plus bas) : le fichier ne porte pas ce lien
   et il est nécessaire pour retirer les ingrédients d'une recette
   écartée. Il est volontairement PRUDENT : en cas de doute, la ligne
   de courses est conservée.
   ============================================================ */
import RAW from './mealweek_data.json';

/* ---------- tranches de premier niveau ---------- */
export const META = RAW.meta || {};
export const RULES = META.regles || {};
export const BUDGET_TARGET = 55; // budget cible annoncé par meta.modele

export const RECIPES_BY_ID = RAW.recipes || {};
export const RECIPES = Object.values(RECIPES_BY_ID).sort((a, b) => (a.num || 0) - (b.num || 0));
export const recipeById = (id) => RECIPES_BY_ID[id] || null;

export const ING_REF = RAW.ingredients_ref || {};
export const ingRef = (name) => ING_REF[name] || null;

export const WEEKS = RAW.weeks || {};
export const WEEK_KEYS = Object.keys(WEEKS);            // ['S1' … 'S8']
export const weekRaw = (key) => WEEKS[key] || null;
export const DEFAULT_WEEK = WEEK_KEYS[0] || '';

export function nextWeekKey(key) {
  if (!WEEK_KEYS.length) return key;
  const i = WEEK_KEYS.indexOf(key);
  return WEEK_KEYS[(i + 1 + WEEK_KEYS.length) % WEEK_KEYS.length];
}
export function prevWeekKey(key) {
  if (!WEEK_KEYS.length) return key;
  const i = WEEK_KEYS.indexOf(key);
  return WEEK_KEYS[(i - 1 + WEEK_KEYS.length) % WEEK_KEYS.length];
}

/** liste des recettes d'une semaine (objets), dans l'ordre du fichier */
export function weekRecipes(weekKey) {
  const wk = weekRaw(weekKey);
  return ((wk && wk.recettes_semaine) || []).map(recipeById).filter(Boolean);
}

/* ---------- helpers de formatage (purs) ---------- */
export function fmtNum(v) {
  if (v == null || Number.isNaN(Number(v))) return '';
  const r = Math.round(Number(v) * 100) / 100;
  return Number.isInteger(r) ? String(r) : String(r).replace('.', ',');
}
export const money = (n) => (Math.round((n || 0) * 100) / 100).toFixed(2).replace('.', ',') + '€';
export const money0 = (n) => Math.round(n || 0) + '€';

/** "25 min (10 + 15)" -> 25 ; null si non chiffrable */
export function tempsMinutes(recipe) {
  const m = String((recipe && recipe.temps) || '').match(/(\d+)\s*min/);
  return m ? parseInt(m[1], 10) : null;
}

/** teinte douce dérivée de l'id d'une recette (purement décoratif) */
export function recipeTint(id) {
  const n = parseInt(String(id).replace(/\D/g, ''), 10) || 0;
  const hue = (n * 47) % 360;
  return {
    bg: `hsla(${hue}, 68%, 55%, 0.09)`,
    border: `hsla(${hue}, 60%, 50%, 0.45)`,
    solid: `hsl(${hue}, 58%, 52%)`,
  };
}

/* ---------- rayons ----------
   Le fichier porte le rayon sur chaque ligne. On n'impose pas d'ordre :
   les groupes sortent dans leur ordre d'apparition dans les données.
   L'emoji n'est qu'une décoration d'en-tête de groupe. */
const RAYON_EMOJI = {
  'Charcuterie': '🥓',
  'Crèmerie': '🧀',
  'Frais': '🥚',
  'Fruits & légumes': '🥦',
  'Viande': '🥩',
  'Épicerie': '🥫',
  'Surgelé (week-end)': '❄️',
  'Placard': '🏠',
};
export function splitCategory(rayon) {
  if (!rayon) return { emoji: '🛒', label: 'Autres' };
  return { emoji: RAYON_EMOJI[rayon] || '🛒', label: rayon };
}

/* ---------- nutrition ---------- */
export const NUTRITION_FIELDS = [
  { key: 'kcal', label: 'Calories', unit: 'kcal', max: 1100, rda: 2000 },
  { key: 'proteines_g', label: 'Protéines', unit: 'g', max: 60, rda: 50 },
  { key: 'glucides_g', label: 'Glucides', unit: 'g', max: 110, rda: 260 },
  { key: 'lipides_g', label: 'Lipides', unit: 'g', max: 70, rda: 70 },
];

export function scaledNutrition(recipe, portions = 1) {
  const n = (recipe && recipe.nutrition_1portion) || {};
  const out = {};
  Object.keys(n).forEach((k) => {
    out[k] = typeof n[k] === 'number' ? Math.round(n[k] * portions * 100) / 100 : n[k];
  });
  return out;
}

/** met à l'échelle une quantité "1 portion" du fichier ("130 g", "0.5 g").
    Utilise qty_valeur + unite quand ils sont là — pas de reparsing hasardeux. */
export function scaleIngredientQty(ing, portions = 1) {
  if (!ing) return '';
  if (typeof ing.qty_valeur === 'number') {
    return fmtNum(ing.qty_valeur * portions) + (ing.unite ? ' ' + ing.unite : '');
  }
  return String(ing.qty_1portion ?? '');
}

/* ============================================================
   PLANNING D'UNE SEMAINE
   Le fichier donne `planning` : 8 lignes, du dimanche de retrait au
   dimanche midi suivant, chacune avec son midi, son soir, l'id de la
   recette cuisinée le soir, les kcal, la note et les macros.
   On les rend telles quelles. Le midi d'un jour est la 2e portion du
   dîner de la VEILLE : on en déduit l'id de recette du midi à partir
   de la ligne précédente, ce que le fichier exprime déjà en texte
   (« Portion 2 de : … »).
   ============================================================ */
export function weekPlan(weekKey, removed = {}) {
  const wk = weekRaw(weekKey);
  const rows = (wk && wk.planning) || [];
  const off = (id) => !!(id && removed[id]);

  return {
    key: weekKey || '',
    titre: (wk && wk.titre) || '',
    total: (wk && wk.total_eur) || 0,
    raw: wk,
    days: rows.map((row, i) => {
      const soirId = row.recette_id || null;
      const prev = i > 0 ? rows[i - 1] : null;
      const midiId = prev && prev.recette_id && /portion\s*2/i.test(String(row.midi || ''))
        ? prev.recette_id
        : null;
      return {
        key: row.jour,
        full: row.jour,
        weekend: /samedi|dimanche/i.test(String(row.jour || '')),
        midi: row.midi || '',
        midiRecipeId: midiId,
        midiOff: off(midiId),
        soir: row.soir || '',
        soirRecipeId: soirId,
        soirOff: off(soirId),
        kcal: row.kcal_portion,
        aCuisiner: row.a_cuisiner || '',
        note: row.note || '',
        macros: row.macros || '',
      };
    }),
  };
}

/* ============================================================
   ATTRIBUTION produit de courses → recettes de la semaine

   Le fichier V2 nomme les produits différemment des deux côtés :
   les recettes utilisent un libellé générique (« Filets de poulet »,
   « Oignons jaunes ») et les courses le nom Chronodrive exact
   (« Auchan filets de poulet blanc 260 g », « Oignon jaune 1 kg »).
   Il n'existe aucun champ de liaison.

   On rattache donc par confinement de tokens, et UNIQUEMENT quand
   TOUS les tokens significatifs du libellé recette se retrouvent dans
   le nom du produit — pas de correspondance partielle, pas de table de
   synonymes. Ce qui ne se rattache pas reste « non rattaché ».

   Conséquence voulue (choix : rattachement prudent) : une ligne de
   courses n'est retirée que si elle est rattachée avec certitude à des
   recettes toutes retirées. Une ligne non rattachée, ou partagée avec
   une recette encore au planning, est TOUJOURS conservée. On ne fait
   donc jamais disparaître un ingrédient encore nécessaire ; au pire il
   reste une ligne en trop, signalée dans l'écran Courses.
   ============================================================ */
const STOP = new Set([
  'auchan', 'essentiel', 'tavola', 'terroir', 'bonduelle', 'herta', 'casa', 'azzurra',
  'marie', 'ristorante', 'duc', 'ducros', 'boulangere', 'conquete', 'saveur', 'recette',
  'les', 'des', 'aux', 'egoutte', 'piece', 'tranche', 'boite', 'sachet', 'pour', 'par',
]);

function tokens(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9/ ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && t.length > 2 && !/^\d/.test(t))
    .map((t) => t.replace(/(s|x)$/, ''))
    .filter((t) => t.length > 2 && !STOP.has(t));
}

/** true si tous les tokens de `libelle` sont présents dans `produit` */
function contenuDans(libelle, produit) {
  const a = tokens(libelle);
  if (!a.length) return false;
  const b = new Set(tokens(produit));
  return a.every((t) => b.has(t));
}

/** ids des recettes de la semaine auxquelles ce produit se rattache
    avec certitude (tableau vide = non rattaché) */
function attribuer(produit, recipes) {
  const out = [];
  recipes.forEach((r) => {
    const hit = (r.ingredients_livres || []).some((ing) =>
      String(ing.produit_chronodrive || '')
        .split('/')
        .some((alt) => contenuDans(alt, produit)));
    if (hit) out.push(r.id);
  });
  return out;
}

/* ============================================================
   LISTE DE COURSES D'UNE SEMAINE
   = les lignes `courses` + `weekend` (surgelé, pizza) + `placard`
   de la semaine, telles que fournies. Prix, formats et quantités
   sortent du fichier sans retouche.
   ============================================================ */
/* `contenu_achete` du fichier est le contenu TOTAL acheté (tous paquets
   confondus), et le format unitaire est déjà dans le nom du produit
   (« … 20 cl », « … 250 g »). On l'affiche donc sans le diviser :
   1 paquet  -> « 1 × 400 g »
   n paquets -> « 2 paquets · 400 ml » (400 ml au total) */
function libellePaquets(qte, contenu, unite) {
  if (contenu == null) return qte != null ? String(qte) : '';
  const total = `${fmtNum(contenu)} ${unite || ''}`.trim();
  if (qte == null || qte <= 1) return `1 × ${total}`;
  return `${qte} paquets · ${total}`;
}

function ligneCourse(c, recipes) {
  const recettes = attribuer(c.produit, recipes);
  const reste = c.reste || 0;
  return {
    name: c.produit,
    nomChronodrive: c.produit,
    categorie: c.rayon,
    kind: 'course',
    besoinValue: c.besoin_semaine,
    besoinUnit: c.unite || '',
    formatLabel: c.contenu_achete != null ? `${fmtNum(c.contenu_achete)} ${c.unite || ''}`.trim() : '',
    nbPaquets: c.qte_acheter,
    packDisplay: libellePaquets(c.qte_acheter, c.contenu_achete, c.unite),
    price: c.total || 0,
    reste,
    // réutilise la pastille « Reste » de l'écran Courses
    verdict: reste > 0 ? `Reste ${fmtNum(reste)} ${c.unite || ''}`.trim() : null,
    recettes,
    attribue: recettes.length > 0,
  };
}

function ligneSimple(x, kind) {
  const qte = x.qte != null ? x.qte : 1;
  const contenu = x.contenu_format;
  return {
    name: x.produit,
    nomChronodrive: x.produit,
    categorie: x.rayon,
    kind,
    besoinValue: x.qte_utilisee != null ? x.qte_utilisee : null,
    besoinUnit: x.unite || '',
    formatLabel: contenu != null ? `${fmtNum(contenu)} ${x.unite || ''}`.trim() : '',
    nbPaquets: qte,
    packDisplay: libellePaquets(qte, contenu, x.unite),
    price: x.total || 0,
    reste: 0,
    verdict: null,
    recettes: [],       // ni la pizza, ni le surgelé, ni le placard ne dépendent d'une recette
    attribue: false,
  };
}

/**
 * @param {string} weekKey
 * @param {Object} removed  { [recipeId]: true } recettes retirées de CETTE semaine
 */
export function weekShopping(weekKey, removed = {}) {
  const wk = weekRaw(weekKey);
  if (!wk) return [];
  const recipes = weekRecipes(weekKey);
  const estRetiree = (id) => !!removed[id];

  const rows = [
    ...(wk.courses || []).map((c) => ligneCourse(c, recipes)),
    ...(wk.weekend || []).map((x) => ligneSimple(x, 'weekend')),
    ...(wk.placard || []).map((x) => ligneSimple(x, 'placard')),
  ];

  return rows
    // retrait UNIQUEMENT si toutes les recettes rattachées sont retirées
    .filter((r) => !(r.attribue && r.recettes.every(estRetiree)))
    .map((r) => {
      const restantes = r.recettes.filter((id) => !estRetiree(id));
      // « à vérifier » : ligne d'ingrédient non rattachée, alors qu'au moins
      // une recette a été retirée — elle est peut-être devenue inutile.
      const aVerifier = r.kind === 'course' && !r.attribue && Object.keys(removed).some(estRetiree);
      return {
        ...r,
        aVerifier,
        count: restantes.length,
        uses: restantes.map((id) => {
          const rec = recipeById(id);
          const ing = ((rec && rec.ingredients_livres) || []).find((x) =>
            String(x.produit_chronodrive || '').split('/').some((alt) => contenuDans(alt, r.name)));
          return { id, nom: (rec && rec.nom) || id, rep: 1, qty: ing ? ing.qty_1portion : '—' };
        }),
      };
    });
}

/** regroupe les lignes par rayon, dans leur ordre d'apparition */
export function groupShoppingByCategory(rows = []) {
  const groups = new Map();
  rows.forEach((r) => {
    if (!groups.has(r.categorie)) groups.set(r.categorie, []);
    groups.get(r.categorie).push(r);
  });
  return [...groups.entries()].map(([categorie, items]) => ({
    categorie, ...splitCategory(categorie), items,
  }));
}

/** lien magasin — recherche Chronodrive sur le nom du produit */
export function chronodriveLink(row) {
  const q = encodeURIComponent((row && (row.nomChronodrive || row.name)) || '');
  return `https://www.chronodrive.com/courses/recherche?q=${q}`;
}

/* ============================================================
   BUDGET
   Total = somme des lignes de courses AFFICHÉES et non cochées
   « déjà en stock », + les articles perso saisis par l'utilisateur.
   Les prix viennent du fichier ; rien n'est recalculé.
   ============================================================ */
export function weekBudget(weekKey, removed = {}, shoppingChecked = {}, perso = []) {
  const rows = weekShopping(weekKey, removed);
  const recipesTotal = rows
    .filter((r) => !shoppingChecked[`${weekKey}::${r.name}`])
    .reduce((a, r) => a + (r.price || 0), 0);
  const persoNet = (perso || [])
    .filter((p) => !p.checked)
    .reduce((a, p) => a + (p.total || 0), 0);
  return {
    recipesTotal: Math.round(recipesTotal * 100) / 100,
    persoTotal: Math.round(persoNet * 100) / 100,
    total: Math.round((recipesTotal + persoNet) * 100) / 100,
  };
}

/** liste perso par défaut — le modèle V2 n'en fournit pas */
export function defaultPerso() {
  return [];
}

/* ============================================================
   KPIs & RÉCAP NUTRITIONNEL — sur la semaine retenue
   ============================================================ */
export function weekKpis(weekKey, removed = {}) {
  const plan = weekPlan(weekKey, removed);
  const actifs = plan.days.filter((d) => !d.soirOff && d.kcal != null);
  const totalKcal = actifs.reduce((a, d) => a + (d.kcal || 0), 0);
  const avgKcalDay = actifs.length ? Math.round(totalKcal / actifs.length) : 0;

  const restantes = weekRecipes(weekKey).filter((r) => !removed[r.id]);
  const temps = restantes.map(tempsMinutes).filter((t) => t != null);
  const avgTime = temps.length ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length) : 0;

  // repas planifiés = créneaux midi + soir encore servis
  const mealsPlanned = plan.days.reduce((a, d) =>
    a + (d.midi && !d.midiOff ? 1 : 0) + (d.soir && !d.soirOff ? 1 : 0), 0);
  const mealsTotal = plan.days.reduce((a, d) => a + (d.midi ? 1 : 0) + (d.soir ? 1 : 0), 0);

  return {
    avgKcalDay, avgTime, mealsPlanned, mealsTotal,
    recipeCount: restantes.length,
    cookedCount: restantes.length,
  };
}

/** moyenne des macros par portion sur les recettes encore au planning */
export function weekNutrition(weekKey, removed = {}) {
  const restantes = weekRecipes(weekKey).filter((r) => !removed[r.id]);
  const acc = { kcal: 0, proteines_g: 0, glucides_g: 0, lipides_g: 0 };
  let count = 0;
  restantes.forEach((r) => {
    const n = r.nutrition_1portion || {};
    acc.kcal += n.kcal || 0;
    acc.proteines_g += n.proteines_g || 0;
    acc.glucides_g += n.glucides_g || 0;
    acc.lipides_g += n.lipides_g || 0;
    count++;
  });
  if (!count) return { kcal: 0, proteines_g: 0, glucides_g: 0, lipides_g: 0, count: 0 };
  return {
    kcal: Math.round(acc.kcal / count),
    proteines_g: Math.round(acc.proteines_g / count),
    glucides_g: Math.round(acc.glucides_g / count),
    lipides_g: Math.round(acc.lipides_g / count),
    count,
  };
}
