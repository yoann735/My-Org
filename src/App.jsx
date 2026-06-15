/* ============================================================
   MealWeek — app shell
   Router (no URL routing needed for a single-window personal app),
   theme, and all persistent state live here and flow down via `ctx`.
   ============================================================ */
import { useEffect } from 'react';
import { Sidebar, BottomNav } from './components/Navigation.jsx';
import { RecipeDetail } from './components/RecipeDetail.jsx';
import { Dashboard } from './screens/Dashboard.jsx';
import { Planning } from './screens/Planning.jsx';
import { Shopping } from './screens/Shopping.jsx';
import { Library } from './screens/Library.jsx';
import { Settings } from './screens/Settings.jsx';
import { usePersistentState } from './hooks/usePersistentState.js';
import { useState } from 'react';
import { ACCENTS } from './lib/constants.js';
import {
  WEEK_KEYS, BUDGET_TARGET, nextWeekKey, prevWeekKey,
  recipeById, defaultPerso, weekShopping,
} from './data/dataLayer.js';

const SCREENS = { dashboard: Dashboard, planning: Planning, shopping: Shopping, library: Library, settings: Settings };

export default function App() {
  /* ---- ephemeral UI state ---- */
  const [screen, setScreen] = useState('dashboard');
  const [openId, setOpenId] = useState(null);

  /* ---- persistent state (localStorage) ---- */
  const [dark, setDark] = usePersistentState('mw.dark', false);
  const [accent, setAccent] = usePersistentState('mw.accent', ACCENTS[0].v);
  const [weekKey, setWeekKey] = usePersistentState('mw.week', WEEK_KEYS[0]);
  const [weeklyBudget, setWeeklyBudget] = usePersistentState('mw.budget', BUDGET_TARGET);
  const [portions, setPortions] = usePersistentState('mw.portions', 2);
  const [store, setStore] = usePersistentState('mw.store', 'Chronodrive');
  const [includeWeekend, setIncludeWeekend] = usePersistentState('mw.weekend', true);
  const [sidebarOpen, setSidebarOpen] = usePersistentState('mw.sidebar', false);
  const [shoppingChecked, setShoppingChecked] = usePersistentState('mw.shopChecked', {});
  const [perso, setPerso] = usePersistentState('mw.perso', defaultPerso);
  const [favorites, setFavorites] = usePersistentState('mw.fav', {});
  const [banned, setBanned] = usePersistentState('mw.banned', {});
  const [cookSteps, setCookSteps] = usePersistentState('mw.cookSteps', {});

  const theme = dark ? 'dark' : 'light';

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  useEffect(() => { document.documentElement.style.setProperty('--accent', accent); }, [accent]);

  /* ---- derived ---- */
  const shoppingBadge = weekShopping(weekKey, includeWeekend)
    .filter((r) => !shoppingChecked[`${weekKey}::${r.name}`]).length;

  /* ---- actions ---- */
  const resetAll = () => {
    if (!window.confirm('Réinitialiser toutes vos données locales (coches, favoris, réglages) ?')) return;
    try { localStorage.clear(); } catch (e) { /* ignore */ }
    setDark(false); setAccent(ACCENTS[0].v); setWeekKey(WEEK_KEYS[0]);
    setWeeklyBudget(BUDGET_TARGET); setPortions(2); setStore('Chronodrive');
    setIncludeWeekend(true); setShoppingChecked({}); setPerso(defaultPerso());
    setFavorites({}); setBanned({}); setCookSteps({});
    setScreen('dashboard');
  };

  const ctx = {
    // navigation
    go: setScreen,
    openRecipe: (id) => setOpenId(id),
    // theme / appearance
    theme,
    toggleTheme: () => setDark((d) => !d),
    accent, setAccent,
    // week cycle (S1..S6 with rotation)
    weekKey,
    prevWeek: () => setWeekKey((w) => prevWeekKey(w)),
    nextWeek: () => setWeekKey((w) => nextWeekKey(w)),
    // settings
    weeklyBudget, setWeeklyBudget,
    portions, setPortions,
    store, setStore,
    includeWeekend, setIncludeWeekend,
    // shopping
    shoppingChecked,
    toggleShopItem: (key) => setShoppingChecked((m) => ({ ...m, [key]: !m[key] })),
    perso,
    togglePerso: (id) => setPerso((arr) => arr.map((p) => (p.id === id ? { ...p, checked: !p.checked } : p))),
    addPerso: (item) => setPerso((arr) => [...arr, { id: 'perso-' + Date.now(), checked: false, fixe: false, ...item }]),
    delPerso: (id) => setPerso((arr) => arr.filter((p) => p.id !== id)),
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
      />
      <div className="main">
        <Current ctx={ctx} key={screen} />
      </div>

      {openRecipe && <RecipeDetail recipe={openRecipe} onClose={() => setOpenId(null)} ctx={ctx} />}

      <BottomNav current={screen} onNav={setScreen} shoppingBadge={shoppingBadge} />
    </div>
  );
}
