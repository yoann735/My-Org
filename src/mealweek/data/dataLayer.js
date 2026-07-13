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

export const WEEKS = RAW.weeks;                      // standard : { S1…S6 }
export const WEEKS_ECO = RAW.weeks_eco || {};        // éco : { E1, E2 }
export const WEEK_KEYS = Object.keys(RAW.weeks);     // ['S1', … 'S6']
export const WEEK_KEYS_ECO = Object.keys(WEEKS_ECO); // ['E1', 'E2']
/* lookup that works for both sets (keys are distinct: S* vs E*) so the
   eco switch is just "which weekKey is current". */
const ALL_WEEKS = { ...RAW.weeks, ...WEEKS_ECO };
export const weekRaw = (key) => ALL_WEEKS[key] || null;
export const weekKeysFor = (eco) => (eco ? WEEK_KEYS_ECO : WEEK_KEYS);
export const isEcoKey = (key) => WEEK_KEYS_ECO.includes(key);

/* ---------- days ---------- */
export const DAY_KEYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export const DAY_FULL = {
  Lun: 'Lundi', Mar: 'Mardi', Mer: 'Mercredi', Jeu: 'Jeudi',
  Ven: 'Vendredi', Sam: 'Samedi', Dim: 'Dimanche',
};
export const WEEKEND_DAYS = ['Sam', 'Dim'];

/* ---------- meal slots ----------
   Each day has two slots: midi (leftover lunch) + soir (dinner).
   A slot is identified globally by "<dayKey>-<meal>" (e.g. "Sam-soir"),
   so activation is a recurring weekly pattern shared across S1..S6.
   `slotsOff` is a map { slotKey: true } — absent/false means active.
   This generalizes (and replaces) the old "hide the weekend" lever:
   the weekend is just the four slots below. */
export const MEALS = ['midi', 'soir'];
export const slotKey = (dayKey, meal) => `${dayKey}-${meal}`;
export const WEEKEND_SLOTS = ['Sam-midi', 'Sam-soir', 'Dim-midi', 'Dim-soir'];
export const isSlotOff = (slotsOff, dayKey, meal) => !!(slotsOff && slotsOff[slotKey(dayKey, meal)]);

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
  '🥚 Frais',
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
export { fmtNum };

/* ============================================================
   FORMULE UNIQUE DE QUANTITÉ (LOT 2)
   besoin = qty_1portion × portions. AUCUN facteur ×2 caché : le
   doublement "dîner du soir + déjeuner du lendemain" est représenté
   UNIQUEMENT par le fait que le slider Portions vaut 2 par défaut.
   Cette fonction est la SEULE source de vérité pour les quantités —
   l'affichage recette (scaleQty), la demande de l'onglet Courses, le
   choix du format multi-format et le total du popover d'usage l'appellent.
   Accepte soit une chaîne "65 g" / "½ pièce(s)", soit une valeur numérique
   déjà parsée (utile pour sommer plusieurs recettes). Renvoie un NOMBRE
   (dans l'unité de la quantité), ou null si non chiffrable ("selon le goût").
   ============================================================ */
export function besoinIngredient(qty1portion, portions = 1) {
  const value = typeof qty1portion === 'number' ? qty1portion : parseQty(qty1portion).value;
  if (value == null) return null;
  return value * portions;
}

/** scale a "1 portion" quantity string by `portions` (affichage recette) —
    passe par besoinIngredient pour garantir une formule unique. */
export function scaleQty(raw, portions = 1) {
  const { value, unit } = parseQty(raw);
  if (value == null) return String(raw ?? ''); // e.g. "selon le goût"
  return fmtNum(besoinIngredient(value, portions)) + (unit ? ' ' + unit : '');
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
  const list = isEcoKey(key) ? WEEK_KEYS_ECO : WEEK_KEYS;
  const i = list.indexOf(key);
  return list[(i + 1) % list.length];
}
export function prevWeekKey(key) {
  const list = isEcoKey(key) ? WEEK_KEYS_ECO : WEEK_KEYS;
  const i = list.indexOf(key);
  return list[(i - 1 + list.length) % list.length];
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
  const wk = weekRaw(weekKey);
  if (!wk) return null;
  const prevWk = weekRaw(prevWeekKey(weekKey));
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

/* Dinners actually cooked (and therefore bought), honoring per-slot
   activation. By the cuisson_x2 rule a dinner feeds two slots: its own
   `soir` slot and the NEXT day's `midi` (the leftover). So the dinner is
   needed as long as at least one of those two slots is still active —
   disabling a leftover lunch alone never drops it while the dinner is
   still eaten, and vice-versa. (Sunday's leftover feeds next week's
   Monday lunch, i.e. the same global "Lun-midi" slot.) */
export function cookedDays(weekKey, slotsOff = {}) {
  const wk = weekRaw(weekKey);
  if (!wk) return [];
  return DAY_KEYS
    .filter((dk, i) => {
      const nextDay = DAY_KEYS[(i + 1) % DAY_KEYS.length];
      return !isSlotOff(slotsOff, dk, 'soir') || !isSlotOff(slotsOff, nextDay, 'midi');
    })
    .map((dk) => ({ dk, recipe: recipeById(wk.days[dk].diner), weekend: wk.days[dk].weekend }))
    .filter((d) => d.recipe);
}

/* All meal slots currently active (midi + soir per day), with their
   recipe — drives meal counts and the nutrition recap. */
export function activeSlots(weekKey, slotsOff = {}) {
  const plan = weekPlan(weekKey);
  if (!plan) return [];
  const out = [];
  plan.days.forEach((d) => {
    if (d.midi && !isSlotOff(slotsOff, d.key, 'midi')) out.push({ dayKey: d.key, meal: 'midi', recipeId: d.midi });
    if (d.soir && !isSlotOff(slotsOff, d.key, 'soir')) out.push({ dayKey: d.key, meal: 'soir', recipeId: d.soir });
  });
  return out;
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
/* ============================================================
   FORMATS D'ACHAT & QUANTITÉS (LOT 2 — v6)
   Le besoin d'une semaine peut dépasser un paquet → on achète autant de
   paquets que nécessaire. Pour un ingrédient multi-format, on choisit le
   format qui MINIMISE le coût total (à égalité de coût : le moins de
   gaspillage). Les formats viennent de `ingredients_ref`.
   ============================================================ */

/** extrait les grammes d'un libellé de format : "250g"→250, "1kg"→1000,
    "2 x 125g"→250 ; null si l'unité n'est pas en poids (ex. "1 pièce"). */
export function formatGrammes(str) {
  if (str == null) return null;
  const s = String(str).toLowerCase();
  let m = s.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g)\b/);
  if (m) {
    const c = parseFloat(m[1].replace(',', '.'));
    const q = parseFloat(m[2].replace(',', '.'));
    return c * q * (m[3] === 'kg' ? 1000 : 1);
  }
  m = s.match(/(\d+(?:[.,]\d+)?)\s*(kg|g)\b/);
  if (m) return parseFloat(m[1].replace(',', '.')) * (m[2] === 'kg' ? 1000 : 1);
  return null;
}

/** volume d'un libellé de format, en cl : "20cl"→20, "3x20cl"→60, "1l"→100. null sinon. */
function formatVolumeCl(str) {
  const s = String(str || '').toLowerCase();
  const toCl = (v, u) => (u === 'cl' ? v : u === 'ml' ? v / 10 : v * 100); // l → 100 cl, ml → 0.1 cl
  let m = s.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(cl|ml|l)\b/);
  if (m) return parseFloat(m[1].replace(',', '.')) * toCl(parseFloat(m[2].replace(',', '.')), m[3]);
  m = s.match(/(\d+(?:[.,]\d+)?)\s*(cl|ml|l)\b/);
  if (m) return toCl(parseFloat(m[1].replace(',', '.')), m[2]);
  return null;
}

/** nombre d'unités de comptage d'un format, pour les mots donnés :
    "1 pièce"→1, "6 pièces"→6, "2 x 4 sachets"→8. null si le mot ne matche pas
    (ex. "1 tête" avec unité "pièce" → null → on achètera 1 paquet). */
function formatCount(str, words) {
  const s = String(str || '').toLowerCase();
  const w = '(?:' + words.join('|') + ')';
  let m = s.match(new RegExp('(\\d+(?:[.,]\\d+)?)\\s*[x×]\\s*(\\d+(?:[.,]\\d+)?)\\s*' + w));
  if (m) return parseFloat(m[1].replace(',', '.')) * parseFloat(m[2].replace(',', '.'));
  m = s.match(new RegExp('(\\d+(?:[.,]\\d+)?)\\s*' + w));
  if (m) return parseFloat(m[1].replace(',', '.'));
  return null;
}

/** magnitude d'un format DANS l'unité du besoin (g, cl, pièce, sachet…). */
function formatMagnitude(formatStr, grammes, unite) {
  const u = (unite || '').toLowerCase();
  if (isWeightUnit(unite)) return grammes != null ? grammes : formatGrammes(formatStr);
  if (u === 'cl' || u === 'ml' || u === 'l' || u.startsWith('litre')) return formatVolumeCl(formatStr);
  if (u.startsWith('pièce') || u.startsWith('piece')) return formatCount(formatStr, ['pièce', 'piece', 'pcs', 'pc']);
  if (u.startsWith('sachet')) return formatCount(formatStr, ['sachet']);
  return formatCount(formatStr, [u].filter(Boolean));
}

/** enlève le préfixe "R02: " d'une quantité d'usage → valeur numérique (1 portion). */
function parseUsageQty(qStr) {
  if (qStr == null) return null;
  return parseQty(String(qStr).replace(/^[^:]*:\s*/, '')).value;
}

/** formats candidats d'un ingrédient (depuis ingredients_ref) : tableau
    `formats` si multi_format, sinon format unique {format_achat, prix}.
    `fallback` = {format, prix} issu de la recette si l'ingrédient est absent du ref. */
export function candidateFormats(name, fallback = null) {
  const ref = ingRef(name);
  if (ref && ref.multi_format && Array.isArray(ref.formats) && ref.formats.length) {
    return ref.formats.map((f) => ({
      format: f.format,
      grammes: f.grammes != null ? f.grammes : formatGrammes(f.format),
      prix: f.prix,
    }));
  }
  if (ref && (ref.format_achat || ref.prix != null)) {
    return [{
      format: ref.format_achat || (fallback && fallback.format) || '',
      grammes: formatGrammes(ref.format_achat),
      prix: ref.prix != null ? ref.prix : (fallback && fallback.prix) || 0,
    }];
  }
  if (fallback) return [{ format: fallback.format || '', grammes: formatGrammes(fallback.format), prix: fallback.prix || 0 }];
  return [{ format: '', grammes: null, prix: 0 }];
}

/** true si l'unité est un poids (g / kg) — sinon on compte en pièces/cl/sachet. */
function isWeightUnit(unite) {
  const u = (unite || '').toLowerCase();
  return u === 'g' || u === 'kg' || u.startsWith('gramme');
}

/** nombre de paquets d'un format (de magnitude `mag` dans l'unité du besoin). */
function packsFor(besoin, mag) {
  if (besoin == null) return 1;
  if (mag && mag > 0) return Math.max(1, Math.ceil(besoin / mag));
  return 1; // magnitude du format inconnue dans cette unité → 1 paquet couvre
}

/** choisit le format qui minimise le COÛT total (égalité → moins de gaspillage). */
export function chooseFormat(besoin, unite, formats) {
  let best = null;
  for (const f of formats) {
    const mag = formatMagnitude(f.format, f.grammes, unite);
    const nb = packsFor(besoin, mag);
    const cost = Math.round(nb * (f.prix || 0) * 100) / 100;
    const waste = mag ? nb * mag - (besoin || 0) : 0;
    const cand = { format: f.format, grammes: f.grammes, magnitude: mag, prix: f.prix || 0, nb, cost, waste };
    if (!best || cand.cost < best.cost - 1e-9 || (Math.abs(cand.cost - best.cost) < 1e-9 && cand.waste < best.waste)) best = cand;
  }
  return best || { format: '', grammes: null, prix: 0, nb: 1, cost: 0, waste: 0 };
}

/* ============================================================
   NB PAQUETS — règles d'achat par ingrédient (LOT 2). Ordre :
   a) AIL : les recettes comptent en GOUSSES → 1 tête ≈ gousses_par_tete.
      nb_têtes = ceil(gousses / gousses_par_tete). (6 gousses → 1 tête, pas 6.)
   b) ŒUFS : vendus par boîte → nb_boîtes = ceil(œufs / oeufs_par_boite).
   c) ÉPICES / HERBES SÉCHÉES (unite == "sachet") : 1 POT ENTIER, JAMAIS plus
      d'un, quel que soit le nombre de recettes (l'utilisateur gère le dosage).
   d) TOUT LE RESTE : chooseFormat (multi-format, coût minimisé, multipacks).
   Renvoie toujours { nb, format, prix, cost }. cost = total de la ligne.
   ============================================================ */
export function computePurchase(name, besoin, unite, fallback = null) {
  const ref = ingRef(name);
  const round2 = (x) => Math.round(x * 100) / 100;

  // a) AIL (gousses → têtes)
  if (ref && ref.gousses_par_tete) {
    const per = ref.gousses_par_tete;
    const prix = ref.prix != null ? ref.prix : 0;
    const nb = besoin == null ? 1 : Math.max(1, Math.ceil(besoin / per));
    return { nb, format: ref.format_achat || `1 tête (≈${per} gousses)`, prix, cost: round2(nb * prix) };
  }
  // b) ŒUFS (boîte de N)
  if (ref && ref.oeufs_par_boite) {
    const per = ref.oeufs_par_boite;
    const prix = ref.prix != null ? ref.prix : 0;
    const nb = besoin == null ? 1 : Math.max(1, Math.ceil(besoin / per));
    return { nb, format: ref.format_achat || `Boîte de ${per}`, prix, cost: round2(nb * prix) };
  }
  // c) ÉPICES / HERBES SÉCHÉES (sachet) → 1 pot, jamais plus
  if ((unite || '').toLowerCase().startsWith('sachet')) {
    const prix = ref && ref.prix != null ? ref.prix : (fallback && fallback.prix) || 0;
    return { nb: 1, format: (ref && ref.format_achat) || (fallback && fallback.format) || '1 pot', prix, cost: round2(prix) };
  }
  // d) tout le reste
  const chosen = chooseFormat(besoin, unite, candidateFormats(name, fallback));
  return { nb: chosen.nb, format: chosen.format, prix: chosen.prix, cost: chosen.cost };
}

export function weekShopping(weekKey, slotsOff = {}, portions = 2) {
  const wk = weekRaw(weekKey);
  const status = (wk && wk.ingredients_status) || {};
  const usageAll = (wk && wk.ingredients_usage) || {};
  // LOT 3 — semaines "super_eco" : une recette peut être cuisinée plusieurs fois.
  // total_base_1p TIENT DÉJÀ compte des répétitions ; on reconstitue donc le besoin
  // en multipliant la contribution PAR RECETTE par son nombre de répétitions
  // (rep = 1 par défaut → semaines normales inchangées). On ne multiplie JAMAIS
  // une seconde fois ensuite.
  const reps = (wk && wk.repetitions) || {};
  const repOf = (rid) => reps[rid] || 1;
  const cooked = cookedDays(weekKey, slotsOff);
  const activeIds = new Set(cooked.map((d) => d.recipe.id)); // respecte les repas désactivés
  const map = new Map();

  cooked.forEach(({ recipe }) => {
    (recipe.ingredients_livres || []).forEach((ing) => {
      const name = ing.nom;
      if (!map.has(name)) {
        const ref = ingRef(name);
        map.set(name, {
          name,
          categorie: ing.categorie || (ref && ref.categorie) || '🥫 Conserves & bocaux',
          nomChronodrive: (ref && ref.nom_chronodrive) || ing.nom,
          lien: ing.lien_chronodrive || (ref && ref.lien_chronodrive) || '',
          substitut: (ref && ref.substitut) || '',
          dlc: ing.dlc_jours != null ? ing.dlc_jours : (ref && ref.dlc_jours),
          dispo: ref && ref.dispo_chronodrive,
          verdict: status[name] ? status[name].verdict : null,
          verdictDetail: status[name] ? status[name].detail : null,
          multiFormat: !!(ref && ref.multi_format),
          _fallback: { format: ing.format_achat, prix: ing.prix_chronodrive },
          uses: [],
        });
      }
      map.get(name).uses.push({ id: recipe.id, nom: recipe.nom, qty: ing.qty_1portion });
    });
  });

  map.forEach((row) => {
    const usage = usageAll[row.name];
    let base1p = null;   // besoin cumulé pour 1 portion (recettes ACTIVES)
    let unite = '';
    let perRecipe = [];

    // 1) source enrichie : ingredients_usage (total_base_1p par recette), restreinte
    //    aux recettes réellement cuisinées → respecte les slots désactivés.
    if (usage && usage.sommable !== false && Array.isArray(usage.recettes)) {
      unite = usage.unite || '';
      let sum = 0;
      let any = false;
      usage.recettes.forEach((rid, i) => {
        if (!activeIds.has(rid)) return;
        const val = parseUsageQty(usage.quantites ? usage.quantites[i] : null);
        const rep = repOf(rid);
        perRecipe.push({ id: rid, nom: (recipeById(rid) || {}).nom || rid, val, rep });
        if (val != null) { sum += val * rep; any = true; } // rep=1 hors semaines super_eco
      });
      if (any) base1p = sum; // = usage.total_base_1p quand toutes les recettes sont actives
      else if (perRecipe.length) base1p = 0;
    }

    // 2) repli : somme "live" des quantités des recettes cuisinées (× répétitions)
    if (base1p == null) {
      const parsed = row.uses.map((u) => ({ ...parseQty(u.qty), id: u.id, rep: repOf(u.id) }));
      const s = parsed.reduce((a, p) => a + ((p.value || 0) * p.rep), 0);
      base1p = parsed.some((p) => p.value != null) ? s : null;
      unite = unite || (parsed.find((p) => p.value != null) || {}).unit || '';
      perRecipe = row.uses.map((u) => ({ id: u.id, nom: u.nom, val: parseQty(u.qty).value, rep: repOf(u.id) }));
    }

    const besoin = base1p == null ? null : besoinIngredient(base1p, portions);
    row.besoinPerPortion = base1p;
    row.besoinUnit = unite;
    row.besoinValue = besoin;
    row.count = perRecipe.length;
    row.perRecipe = perRecipe;
    // quantité PAR PORTION par recette (pour le popover d'usage) — avec le
    // nombre de répétitions dans la semaine (rep>1 en mode super_eco).
    row.uses = perRecipe.map((p) => ({ id: p.id, nom: p.nom, rep: p.rep || 1, qty: p.val == null ? '—' : fmtNum(p.val) + (unite ? ' ' + unite : '') }));

    // format & nombre de paquets (règles AIL / ŒUFS / sachet, sinon coût minimisé)
    const chosen = computePurchase(row.name, besoin, unite, row._fallback);
    row.nbPaquets = chosen.nb;
    row.formatLabel = chosen.format;
    row.formatPrix = chosen.prix;
    row.price = chosen.cost; // coût total de la ligne (nb paquets × prix)
    row.packDisplay = chosen.format ? `${chosen.nb} × ${chosen.format}` : String(chosen.nb);
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

/** Single source of truth for the weekly budget (NET — after deducting
   what the user already has in stock: unchecked shopping rows + unchecked
   perso). Used by BOTH the Dashboard and Shopping so they always agree. */
export function weekBudget(weekKey, slotsOff = {}, shoppingChecked = {}, perso = [], portions = 2) {
  const rows = weekShopping(weekKey, slotsOff, portions);
  const recipesTotal = rows
    .filter((r) => !shoppingChecked[`${weekKey}::${r.name}`])
    .reduce((a, r) => a + r.price, 0);
  const persoNet = perso
    .filter((p) => !p.checked)
    .reduce((a, p) => a + (p.total || 0), 0);
  return { recipesTotal, persoTotal: persoNet, total: recipesTotal + persoNet };
}

/** default perso list seeded from meta.courses_perso_fixes */
export function defaultPerso() {
  return PERSO_FIXES.map((p, i) => {
    const mult = p.qty || 1;
    const unitPrice = p.prix_unitaire != null ? p.prix_unitaire : (mult ? (p.total || 0) / mult : (p.total || 0));
    return {
      id: 'perso-' + i,
      nom: p.nom,
      qty: p.qty,
      mult,
      unitPrice,
      total: p.total,
      fixe: true,
      checked: false,
    };
  });
}

/* ============================================================
   WEEK KPIs — for the dashboard.
   ============================================================ */
export function weekKpis(weekKey, slotsOff = {}) {
  const cooked = cookedDays(weekKey, slotsOff);
  const slots = activeSlots(weekKey, slotsOff);

  // calories: average per active day, summing that day's active meals
  const kcalByDay = {};
  slots.forEach((s) => {
    const r = recipeById(s.recipeId);
    kcalByDay[s.dayKey] = (kcalByDay[s.dayKey] || 0) + (r?.nutrition_1portion?.kcal || 0);
  });
  const activeDays = Object.keys(kcalByDay).length;
  const totalKcal = Object.values(kcalByDay).reduce((a, b) => a + b, 0);
  const avgKcalDay = activeDays ? Math.round(totalKcal / activeDays) : 0;

  // time: average over cooked dinners
  const avgTime = cooked.length
    ? Math.round(cooked.reduce((a, c) => a + (c.recipe.temps_min || 0), 0) / cooked.length)
    : 0;

  const ovenCount = cooked.filter((c) => c.recipe.four).length;
  const mealsPlanned = slots.length; // active midi/soir slots, out of 14

  return { avgKcalDay, avgTime, ovenCount, mealsPlanned, cookedCount: cooked.length };
}

/** average nutrition per active meal slot for the week */
export function weekNutrition(weekKey, slotsOff = {}) {
  const slots = activeSlots(weekKey, slotsOff);
  const acc = { kcal: 0, proteines_g: 0, glucides_g: 0, lipides_g: 0 };
  let count = 0;
  slots.forEach((s) => {
    const r = recipeById(s.recipeId);
    if (!r) return;
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
