/* ============================================================
   MealWeek — data layer (single source of truth)
   Adapts the frozen mealweek_data.json into the shapes the UI
   consumes. No network, no generation: everything is derived
   deterministically from the JSON at build time.

   Key facts about the raw data:
   - recipes / ingredients_ref / weeks are OBJECTS keyed by id/name.
   - ingredient quantities (qty_1portion) are STRINGS for ONE portion,
     often with unicode fractions ("½ sachet(s)", "3 pièce(s)", "150 g").
   - prices live in ingredients_ref (Chronodrive), keyed by ingredient name.
   - business rules live in meta.regles.
   ============================================================ */
import RAW from './mealweek_data.json';

/* ---------- top-level slices ---------- */
export const META = RAW.meta;
export const RULES = RAW.meta.regles;
export const BUDGET_TARGET = RAW.meta.regles.budget_cible; // 60 €
export const PERSO_FIXES = RAW.meta.courses_perso_fixes;   // skyr ×2 + bananes
export const STOCK_PERMANENT = RAW.meta.stock_permanent;   // huile, sel, …
export const PROTEIN_STRATEGY = RAW.protein_strategy;

export const RECIPES_BY_ID = RAW.recipes;
export const RECIPES = Object.values(RAW.recipes);
export const recipeById = (id) => RAW.recipes[id] || null;

export const ING_REF = RAW.ingredients_ref; // keyed by ingredient name
export const ingRef = (name) => RAW.ingredients_ref[name] || null;

export const WEEKS = RAW.weeks;                 // { S1: {...}, … S6 }
export const WEEK_KEYS = Object.keys(RAW.weeks); // ['S1', … 'S6']

/* ---------- days ---------- */
export const DAY_KEYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export const DAY_FULL = {
  Lun: 'Lundi', Mar: 'Mardi', Mer: 'Mercredi', Jeu: 'Jeudi',
  Ven: 'Vendredi', Sam: 'Samedi', Dim: 'Dimanche',
};
export const WEEKEND_DAYS = ['Sam', 'Dim'];

/* ============================================================
   PROTEINS — map the 9 messy raw labels onto 5 color classes.
   Order matters (first match wins).
   ============================================================ */
export const PROT = {
  beef: { label: 'Bœuf', cls: 'beef' },
  poultry: { label: 'Volaille', cls: 'poultry' },
  pork: { label: 'Porc', cls: 'pork' },
  fish: { label: 'Poisson', cls: 'fish' },
  veggie: { label: 'Végé', cls: 'veggie' },
};

export function proteinClass(proteine) {
  const s = (proteine || '').toLowerCase();
  if (/(bœuf|boeuf|merguez|agneau|steak|haché)/.test(s)) return 'beef';
  if (/(poulet|dinde|canard|volaille)/.test(s)) return 'poultry';
  if (/(porc|charcuterie|chorizo|jambon|lard|saucisse|prosciutto|poitrine|effiloché)/.test(s)) return 'pork';
  if (/(poisson|fruits de mer|saumon|cabillaud|crevette|thon|colin|truite)/.test(s)) return 'fish';
  return 'veggie';
}

/** protein color class + short label for a recipe */
export function recipeProtein(recipe) {
  const cls = proteinClass(recipe.proteine);
  return { cls, label: PROT[cls].label, raw: recipe.proteine };
}

/* ============================================================
   COMPLEXITY / COST mapping (raw → pill variant)
   ============================================================ */
export const COMPLEXITY_VARIANT = { 'Facile': 'ok', 'Intermédiaire': 'warn', 'Difficile': 'crit' };

/* ============================================================
   CHRONODRIVE CATEGORIES — display order. The raw category strings
   already carry an emoji prefix ("🥦 Légumes frais").
   ============================================================ */
export const CATEGORIES_ORDER = [
  '🥦 Légumes frais',
  '🥩 Viandes & protéines',
  '🍚 Féculents & céréales',
  '🧀 Produits laitiers',
  '🥫 Conserves & bocaux',
  '🫙 Sauces & condiments',
  '🌿 Épices & aromates',
  '🌱 Herbes fraîches',
  '🍞 Pains & boulangerie',
  '🏠 Ingrédients maison',
];

/** split "🥦 Légumes frais" -> { emoji:'🥦', label:'Légumes frais' } */
export function splitCategory(cat) {
  if (!cat) return { emoji: '🛒', label: 'Autres' };
  const sp = cat.indexOf(' ');
  if (sp === -1) return { emoji: '🛒', label: cat };
  return { emoji: cat.slice(0, sp), label: cat.slice(sp + 1) };
}

function categoryRank(cat) {
  const i = CATEGORIES_ORDER.indexOf(cat);
  return i === -1 ? 999 : i;
}

/* ============================================================
   QUANTITY PARSING & SCALING
   Base quantity = 1 portion. Slider 1-6 multiplies.
   ============================================================ */
const FRACTIONS = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };

/** parse "½ sachet(s)" -> { value:0.5, unit:'sachet(s)' }; non-numeric -> {value:null} */
export function parseQty(raw) {
  if (raw == null) return { value: null, unit: '' };
  const s = String(raw).trim();
  const m = s.match(/^(\d+(?:[.,]\d+)?)?\s*([¼½¾⅓⅔⅛⅜⅝⅞])?\s*(.*)$/u);
  if (!m) return { value: null, unit: s };
  let value = 0, has = false;
  if (m[1]) { value += parseFloat(m[1].replace(',', '.')); has = true; }
  if (m[2]) { value += FRACTIONS[m[2]] || 0; has = true; }
  return { value: has ? value : null, unit: (m[3] || '').trim() };
}

function fmtNum(v) {
  const r = Math.round(v * 100) / 100;
  if (Number.isInteger(r)) return String(r);
  return String(r).replace('.', ',');
}

/** scale a "1 portion" quantity string by `portions` */
export function scaleQty(raw, portions = 1) {
  const { value, unit } = parseQty(raw);
  if (value == null) return String(raw ?? ''); // e.g. "selon le goût"
  const v = value * portions;
  return fmtNum(v) + (unit ? ' ' + unit : '');
}

/* ============================================================
   NUTRITION — scale per-portion values by `portions`
   ============================================================ */
export const NUTRITION_FIELDS = [
  { key: 'kcal', label: 'Calories', unit: 'kcal', max: 1100, rda: 2000 },
  { key: 'proteines_g', label: 'Protéines', unit: 'g', max: 60, rda: 50 },
  { key: 'glucides_g', label: 'Glucides', unit: 'g', max: 110, rda: 260 },
  { key: 'lipides_g', label: 'Lipides', unit: 'g', max: 70, rda: 70 },
  { key: 'satures_g', label: 'dont saturés', unit: 'g', max: 30, rda: 20 },
  { key: 'sucres_g', label: 'dont sucres', unit: 'g', max: 40, rda: 90 },
  { key: 'fibres_g', label: 'Fibres', unit: 'g', max: 25, rda: 30 },
  { key: 'sel_g', label: 'Sel', unit: 'g', max: 6, rda: 6 },
];

export function scaledNutrition(recipe, portions = 1) {
  const n = recipe.nutrition_1portion || {};
  const out = {};
  Object.keys(n).forEach((k) => {
    out[k] = typeof n[k] === 'number' ? Math.round(n[k] * portions * 100) / 100 : n[k];
  });
  return out;
}

/* ============================================================
   WEEK CYCLE — S1..S6, rotation after S6 (rule: meta.regles.cycle).
   No calendar dates exist in the data, so weeks are referenced by
   their key + theme, and days by weekday name (matches congelation
   freeze_day / use_day which use "Lun".."Dim").
   ============================================================ */
export function nextWeekKey(key) {
  const i = WEEK_KEYS.indexOf(key);
  return WEEK_KEYS[(i + 1) % WEEK_KEYS.length];
}
export function prevWeekKey(key) {
  const i = WEEK_KEYS.indexOf(key);
  return WEEK_KEYS[(i - 1 + WEEK_KEYS.length) % WEEK_KEYS.length];
}

/* ============================================================
   WEEK PLAN — build midi/soir slots per day.
   Rule cuisson_x2: every dinner is cooked double → the leftover is
   the NEXT day's lunch. So:
     soir[day] = day.diner
     midi[day] = previous day's dinner (leftover)
     midi[Lun] = previous week's Sunday dinner (cycle continues)
   ============================================================ */
export function weekPlan(weekKey) {
  const wk = WEEKS[weekKey];
  if (!wk) return null;
  const prevWk = WEEKS[prevWeekKey(weekKey)];
  const days = DAY_KEYS.map((dk, i) => {
    const day = wk.days[dk];
    const soirId = day.diner;
    const midiId = i > 0 ? wk.days[DAY_KEYS[i - 1]].diner : (prevWk ? prevWk.days.Dim.diner : null);
    return {
      key: dk,
      full: DAY_FULL[dk],
      weekend: !!day.weekend,
      soir: soirId,
      midi: midiId,
      midiLeftover: true, // by the cuisson_x2 rule, lunch is always leftovers
      midiText: day.midi_lendemain,
    };
  });
  return { key: weekKey, theme: wk.theme, raw: wk, days };
}

/* days actually cooked (dinners), honoring the weekend toggle */
export function cookedDays(weekKey, includeWeekend = true) {
  const wk = WEEKS[weekKey];
  return DAY_KEYS
    .filter((dk) => includeWeekend || !wk.days[dk].weekend)
    .map((dk) => ({ dk, recipe: recipeById(wk.days[dk].diner), weekend: wk.days[dk].weekend }))
    .filter((d) => d.recipe);
}

/* ============================================================
   SHOPPING LIST — aggregate the fresh (delivered, non home-stock)
   ingredients of the week's cooked dinners, deduped by name, priced
   from ingredients_ref. Responds live to the weekend toggle.

   NOTE (assumption, documented in README): we buy one purchase
   format per unique ingredient. The raw data also ships per-week
   `budget_*_estime` figures and per-ingredient `ingredients_status`
   verdicts (Consommé / Reste); those are surfaced as info, but the
   live total is computed here so the weekend lever actually moves it.
   ============================================================ */
export function weekShopping(weekKey, includeWeekend = true) {
  const wk = WEEKS[weekKey];
  const status = wk.ingredients_status || {};
  const map = new Map();

  cookedDays(weekKey, includeWeekend).forEach(({ recipe }) => {
    (recipe.ingredients_livres || []).forEach((ing) => {
      if (ing.stock_perm) return; // home stock, not bought
      const name = ing.nom;
      if (!map.has(name)) {
        const ref = ingRef(name);
        map.set(name, {
          name,
          categorie: ing.categorie || (ref && ref.categorie) || '🥫 Conserves & bocaux',
          nomChronodrive: (ref && ref.nom_chronodrive) || name,
          lien: (ref && ref.lien_chronodrive) || '',
          format: (ref && ref.format_achat) || '',
          price: (ref && typeof ref.prix === 'number') ? ref.prix : 0,
          substitut: (ref && ref.substitut) || '',
          dlc: ref && ref.dlc_jours,
          dispo: ref && ref.dispo_chronodrive,
          verdict: status[name] ? status[name].verdict : null,
          verdictDetail: status[name] ? status[name].detail : null,
          recipes: [],
        });
      }
      const row = map.get(name);
      if (!row.recipes.includes(recipe.nom)) row.recipes.push(recipe.nom);
    });
  });

  return [...map.values()].sort((a, b) => {
    const ra = categoryRank(a.categorie), rb = categoryRank(b.categorie);
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name, 'fr');
  });
}

/** group shopping rows by category, in display order */
export function groupShoppingByCategory(rows) {
  const groups = new Map();
  rows.forEach((r) => {
    if (!groups.has(r.categorie)) groups.set(r.categorie, []);
    groups.get(r.categorie).push(r);
  });
  return [...groups.entries()]
    .sort((a, b) => categoryRank(a[0]) - categoryRank(b[0]))
    .map(([categorie, items]) => ({ categorie, ...splitCategory(categorie), items }));
}

/* ============================================================
   BUDGET — recipe (fresh) total + perso, vs 60 € target.
   ============================================================ */
export function persoTotal(persoItems) {
  return persoItems.filter((p) => !p.checked).reduce((a, p) => a + (p.total ?? p.prix_unitaire * p.qty ?? 0), 0);
}

/** default perso list seeded from meta.courses_perso_fixes */
export function defaultPerso() {
  return PERSO_FIXES.map((p, i) => ({
    id: 'perso-' + i,
    nom: p.nom,
    qty: p.qty,
    total: p.total,
    fixe: true,
    checked: false,
  }));
}

/* ============================================================
   WEEK KPIs — for the dashboard.
   ============================================================ */
export function weekKpis(weekKey, includeWeekend = true) {
  const cooked = cookedDays(weekKey, includeWeekend);
  const plan = weekPlan(weekKey);
  const slotDays = plan.days.filter((d) => includeWeekend || !d.weekend);

  // calories: average per day over midi + soir
  let totalKcal = 0;
  slotDays.forEach((d) => {
    const m = recipeById(d.midi), s = recipeById(d.soir);
    if (m) totalKcal += m.nutrition_1portion?.kcal || 0;
    if (s) totalKcal += s.nutrition_1portion?.kcal || 0;
  });
  const avgKcalDay = slotDays.length ? Math.round(totalKcal / slotDays.length) : 0;

  // time: average over cooked dinners
  const avgTime = cooked.length
    ? Math.round(cooked.reduce((a, c) => a + (c.recipe.temps_min || 0), 0) / cooked.length)
    : 0;

  const ovenCount = cooked.filter((c) => c.recipe.four).length;
  const mealsPlanned = slotDays.length * 2; // midi + soir

  return { avgKcalDay, avgTime, ovenCount, mealsPlanned, cookedCount: cooked.length };
}

/** average nutrition per planned meal (midi+soir) for the week */
export function weekNutrition(weekKey, includeWeekend = true) {
  const plan = weekPlan(weekKey);
  const slotDays = plan.days.filter((d) => includeWeekend || !d.weekend);
  const acc = { kcal: 0, proteines_g: 0, glucides_g: 0, lipides_g: 0 };
  let count = 0;
  slotDays.forEach((d) => {
    [d.midi, d.soir].forEach((id) => {
      const r = recipeById(id);
      if (!r) return;
      const n = r.nutrition_1portion || {};
      acc.kcal += n.kcal || 0;
      acc.proteines_g += n.proteines_g || 0;
      acc.glucides_g += n.glucides_g || 0;
      acc.lipides_g += n.lipides_g || 0;
      count++;
    });
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

/* ============================================================
   MISC helpers
   ============================================================ */
export const money = (n) => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',') + '€';
export const money0 = (n) => Math.round(n) + '€';

/* soft per-recipe tint — leftovers share their dinner's id, so they
   share the tint (visually links a dinner to next day's lunch). */
export function recipeTint(id) {
  const num = parseInt(String(id).replace(/\D/g, ''), 10) || 0;
  const hue = (num * 47) % 360;
  return {
    bg: `hsla(${hue}, 68%, 55%, 0.09)`,
    border: `hsla(${hue}, 60%, 50%, 0.45)`,
    solid: `hsl(${hue}, 58%, 52%)`,
  };
}

/** chronodrive link with a search fallback when no direct link exists */
export function chronodriveLink(row) {
  if (row && row.lien) return row.lien;
  const q = encodeURIComponent((row && (row.nomChronodrive || row.name)) || '');
  return `https://www.chronodrive.com/courses/recherche?q=${q}`;
}
