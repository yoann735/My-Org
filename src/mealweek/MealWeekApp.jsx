/* ============================================================
   MealWeek — app shell
   Router (no URL routing needed for a single-window personal app),
   theme, and all persistent state live here and flow down via `ctx`.
   ============================================================ */
import { useEffect, useState } from 'react';
import { Sidebar, BottomNav } from './components/Navigation.jsx';
import { RecipeDetail } from './components/RecipeDetail.jsx';
import { Dashboard } from './screens/Dashboard.jsx';
import { Planning } from './screens/Planning.jsx';
import { Shopping } from './screens/Shopping.jsx';
import { Library } from './screens/Library.jsx';
import { Settings } from './screens/Settings.jsx';
import { usePersistentState } from '../shared/hooks/usePersistentState.js';
import {
  WEEK_KEYS, BUDGET_TARGET, nextWeekKey, prevWeekKey,
  recipeById, defaultPerso, weekShopping, WEEKEND_SLOTS,
} from './data/dataLayer.js';

const SCREENS = { dashboard: Dashboard, planning: Planning, shopping: Shopping, library: Library, settings: Settings };

export default function MealWeekApp({ themeApi, goHub }) {
  /* ---- theme comes from the shared "univers" theme ---- */
  const { theme, themeMode, setThemeMode, toggleTheme, accent, setAccent, resetTheme } = themeApi;

  /* ---- ephemeral UI state ---- */
  const [screen, setScreen] = useState('dashboard');
  const [openId, setOpenId] = useState(null);

  /* ---- persistent state (localStorage) ---- */
  const [weekKey, setWeekKey] = usePersistentState('mw.week', WEEK_KEYS[0]);
  const [weeklyBudget, setWeeklyBudget] = usePersistentState('mw.budget', BUDGET_TARGET);
  const [portions, setPortions] = usePersistentState('mw.portions', 2);
  const [store, setStore] = usePersistentState('mw.store', 'Chronodrive');
  // per-meal-slot activation (generalizes the old weekend toggle).
  // map { "Sam-soir": true, ... } — absent means the slot is active.
  const [slotsOff, setSlotsOff] = usePersistentState('mw.slotsOff', {});
  const [sidebarOpen, setSidebarOpen] = usePersistentState('mw.sidebar', false);
  const [shoppingChecked, setShoppingChecked] = usePersistentState('mw.shopChecked', {});
  const [perso, setPerso] = usePersistentState('mw.perso', defaultPerso);
  const [favorites, setFavorites] = usePersistentState('mw.fav', {});
  const [banned, setBanned] = usePersistentState('mw.banned', {});
  const [cookSteps, setCookSteps] = usePersistentState('mw.cookSteps', {});

  // migrate the old "hide weekend" boolean to the new per-slot model
  useEffect(() => {
    try {
      if (localStorage.getItem('mw.slotsOff') == null && localStorage.getItem('mw.weekend') === 'false') {
        setSlotsOff(Object.fromEntries(WEEKEND_SLOTS.map((k) => [k, true])));
      }
      localStorage.removeItem('mw.weekend');
    } catch (e) { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- derived ---- */
  const shoppingBadge = weekShopping(weekKey, slotsOff)
    .filter((r) => !shoppingChecked[`${weekKey}::${r.name}`]).length;

  /* ---- actions ---- */
  const resetAll = () => {
    if (!window.confirm('Réinitialiser toutes vos données locales (coches, favoris, réglages) ?')) return;
    try { localStorage.clear(); } catch (e) { /* ignore */ }
    resetTheme(); setWeekKey(WEEK_KEYS[0]);
    setWeeklyBudget(BUDGET_TARGET); setPortions(2); setStore('Chronodrive');
    setSlotsOff({}); setShoppingChecked({}); setPerso(defaultPerso());
    setFavorites({}); setBanned({}); setCookSteps({});
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
    // week cycle (S1..S6 with rotation)
    weekKey,
    prevWeek: () => setWeekKey((w) => prevWeekKey(w)),
    nextWeek: () => setWeekKey((w) => nextWeekKey(w)),
    // settings
    weeklyBudget, setWeeklyBudget,
    portions, setPortions,
    store, setStore,
    // meal-slot activation (generalizes the weekend toggle)
    slotsOff,
    toggleSlot: (dayKey, meal) => setSlotsOff((m) => {
      const k = `${dayKey}-${meal}`;
      const next = { ...m };
      if (next[k]) delete next[k]; else next[k] = true;
      return next;
    }),
    disabledCount: Object.values(slotsOff).filter(Boolean).length,
    resetSlots: () => setSlotsOff({}),
    weekendOff: WEEKEND_SLOTS.every((k) => slotsOff[k]),
    toggleWeekend: () => setSlotsOff((m) => {
      const allOff = WEEKEND_SLOTS.every((k) => m[k]);
      const next = { ...m };
      WEEKEND_SLOTS.forEach((k) => { if (allOff) delete next[k]; else next[k] = true; });
      return next;
    }),
    // shopping
    shoppingChecked,
    toggleShopItem: (key) => setShoppingChecked((m) => ({ ...m, [key]: !m[key] })),
    perso,
    togglePerso: (id) => setPerso((arr) => arr.map((p) => (p.id === id ? { ...p, checked: !p.checked } : p))),
    addPerso: (item) => setPerso((arr) => [...arr, { id: 'perso-' + Date.now(), checked: false, fixe: false, mult: 1, ...item }]),
    delPerso: (id) => setPerso((arr) => arr.filter((p) => p.id !== id)),
    // edit a perso article (quantity multiplier / unit price). Normalises
    // legacy items {qty,total} into {mult,unitPrice,total} on first edit.
    updatePerso: (id, patch) => setPerso((arr) => arr.map((p) => {
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
    toggleFavorite: (id) => setFavorites((m) => ({ ...m, [id]: !m[id] })),
    banned,
    toggleBanned: (id) => setBanned((m) => ({ ...m, [id]: !m[id] })),
    // cook steps
    cookSteps,
    toggleStep: (rid, idx) => setCookSteps((m) => ({ ...m, [rid]: { ...(m[rid] || {}), [idx]: !(m[rid] && m[rid][idx]) } })),
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
        onToggle={() => setSidebarOpen((v) => !v)}
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
