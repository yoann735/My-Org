/* ============================================================
   MealWeek — app shell
   Router (no URL routing needed for a single-window personal app),
   theme, and all persistent state live here and flow down via `ctx`.

   Tout l'état utilisateur est centralisé dans un unique objet `userState`
   (voir data/useUserState.js) : persistance localStorage immédiate +
   synchronisation multi-appareils via Supabase (LOT 5).
   ============================================================ */
import { useEffect, useState } from 'react';
import { Sidebar, BottomNav } from './components/Navigation.jsx';
import { RecipeDetail } from './components/RecipeDetail.jsx';
import { Dashboard } from './screens/Dashboard.jsx';
import { Planning } from './screens/Planning.jsx';
import { Shopping } from './screens/Shopping.jsx';
import { Library } from './screens/Library.jsx';
import { Settings } from './screens/Settings.jsx';
import { useUserState } from './data/useUserState.js';
import {
  WEEK_KEYS, WEEK_KEYS_ECO, isEcoKey, nextWeekKey, prevWeekKey,
  recipeById, weekShopping, WEEKEND_SLOTS,
} from './data/dataLayer.js';

const SCREENS = { dashboard: Dashboard, planning: Planning, shopping: Shopping, library: Library, settings: Settings };

export default function MealWeekApp({ themeApi, goHub }) {
  /* ---- theme comes from the shared "univers" theme ---- */
  const { theme, themeMode, setThemeMode, toggleTheme, accent, setAccent, resetTheme } = themeApi;

  /* ---- ephemeral UI state ---- */
  const [screen, setScreen] = useState('dashboard');
  const [openId, setOpenId] = useState(null);

  /* ---- persistent state : un seul objet, synchronisé (localStorage + Supabase) ---- */
  const [state, setField, resetState] = useUserState();
  const {
    eco: ecoMode, week: weekKey, budget: weeklyBudget, portions, store,
    slotsOff, sidebar: sidebarOpen, shopChecked: shoppingChecked, cart,
    perso, favorites, banned, cookSteps,
  } = state;

  // keep the current weekKey consistent with the eco mode (S* vs E*)
  useEffect(() => {
    if (ecoMode && !isEcoKey(weekKey)) setField('week', WEEK_KEYS_ECO[0]);
    if (!ecoMode && isEcoKey(weekKey)) setField('week', WEEK_KEYS[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ecoMode]);

  /* ---- derived ---- */
  const shoppingBadge = weekShopping(weekKey, slotsOff, portions)
    .filter((r) => !shoppingChecked[`${weekKey}::${r.name}`]).length;

  /* ---- actions ---- */
  const resetAll = () => {
    if (!window.confirm('Réinitialiser toutes vos données locales (coches, favoris, réglages) ?')) return;
    // ne touche QUE les clés MealWeek (préfixe mw.) — l'autre app reste intacte
    try {
      Object.keys(localStorage).filter((k) => k.startsWith('mw.')).forEach((k) => localStorage.removeItem(k));
    } catch (e) { /* ignore */ }
    resetTheme();
    resetState();
    setScreen('dashboard');
  };

  const ctx = {
    // navigation
    go: setScreen,
    openRecipe: (id) => setOpenId(id),
    // theme / appearance (from the shared theme)
    theme,
    themeMode, setThemeMode,
    toggleTheme,
    accent, setAccent,
    // back to the app selector
    goHub,
    // week cycle (S1..S6, or E1..E2 in eco mode — rotation within the set)
    weekKey,
    prevWeek: () => setField('week', (w) => prevWeekKey(w)),
    nextWeek: () => setField('week', (w) => nextWeekKey(w)),
    // mode éco (semaines moins chères E1/E2)
    ecoMode,
    toggleEco: () => {
      const next = !ecoMode;
      setField('eco', next);
      setField('week', next ? WEEK_KEYS_ECO[0] : WEEK_KEYS[0]);
    },
    // settings
    weeklyBudget, setWeeklyBudget: (v) => setField('budget', v),
    portions, setPortions: (v) => setField('portions', v),
    store, setStore: (v) => setField('store', v),
    // meal-slot activation (generalizes the weekend toggle)
    slotsOff,
    toggleSlot: (dayKey, meal) => setField('slotsOff', (m) => {
      const k = `${dayKey}-${meal}`;
      const next = { ...m };
      if (next[k]) delete next[k]; else next[k] = true;
      return next;
    }),
    disabledCount: Object.values(slotsOff).filter(Boolean).length,
    resetSlots: () => setField('slotsOff', {}),
    weekendOff: WEEKEND_SLOTS.every((k) => slotsOff[k]),
    toggleWeekend: () => setField('slotsOff', (m) => {
      const allOff = WEEKEND_SLOTS.every((k) => m[k]);
      const next = { ...m };
      WEEKEND_SLOTS.forEach((k) => { if (allOff) delete next[k]; else next[k] = true; });
      return next;
    }),
    // shopping — "déjà en stock"
    shoppingChecked,
    toggleShopItem: (key) => setField('shopChecked', (m) => ({ ...m, [key]: !m[key] })),
    // shopping — "ajouté au panier" (LOT 4, indépendant de "déjà en stock")
    cart,
    toggleCartItem: (key) => setField('cart', (m) => ({ ...(m || {}), [key]: !(m && m[key]) })),
    perso,
    togglePerso: (id) => setField('perso', (arr) => arr.map((p) => (p.id === id ? { ...p, checked: !p.checked } : p))),
    addPerso: (item) => setField('perso', (arr) => [...arr, { id: 'perso-' + Date.now(), checked: false, fixe: false, mult: 1, ...item }]),
    delPerso: (id) => setField('perso', (arr) => arr.filter((p) => p.id !== id)),
    // edit a perso article (quantity multiplier / unit price). Normalises
    // legacy items {qty,total} into {mult,unitPrice,total} on first edit.
    updatePerso: (id, patch) => setField('perso', (arr) => arr.map((p) => {
      if (p.id !== id) return p;
      const curMult = p.mult ?? p.qty ?? 1;
      const curUnit = p.unitPrice != null ? p.unitPrice : (curMult ? (p.total ?? 0) / curMult : (p.total ?? 0));
      const next = { ...p, mult: curMult, unitPrice: curUnit, ...patch };
      next.mult = Math.max(1, Math.round(next.mult || 1));
      next.unitPrice = Math.max(0, Number(next.unitPrice) || 0);
      next.total = Math.round(next.mult * next.unitPrice * 100) / 100;
      return next;
    })),
    // library
    favorites,
    toggleFavorite: (id) => setField('favorites', (m) => ({ ...m, [id]: !m[id] })),
    banned,
    toggleBanned: (id) => setField('banned', (m) => ({ ...m, [id]: !m[id] })),
    // cook steps
    cookSteps,
    toggleStep: (rid, idx) => setField('cookSteps', (m) => ({ ...m, [rid]: { ...(m[rid] || {}), [idx]: !(m[rid] && m[rid][idx]) } })),
    // data
    resetAll,
  };

  const Current = SCREENS[screen] || Dashboard;
  const openRecipe = openId ? recipeById(openId) : null;

  return (
    <div className="app">
      <Sidebar
        current={screen}
        onNav={setScreen}
        expanded={sidebarOpen}
        onToggle={() => setField('sidebar', (v) => !v)}
        shoppingBadge={shoppingBadge}
        onHub={goHub}
      />
      <div className="main">
        <Current ctx={ctx} key={screen} />
      </div>

      {openRecipe && <RecipeDetail recipe={openRecipe} onClose={() => setOpenId(null)} ctx={ctx} />}

      <BottomNav current={screen} onNav={setScreen} shoppingBadge={shoppingBadge} />
    </div>
  );
}
