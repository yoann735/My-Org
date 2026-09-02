/* ============================================================
   MealWeek — app shell (V2)
   Router (pas de routing d'URL pour une app perso mono-fenêtre),
   thème, et tout l'état persistant, qui descend via `ctx`.

   V2 : l'utilisateur parcourt 8 semaines-types indépendantes (S1-S8).
   Celle sur laquelle il s'arrête est RETENUE et persistée, avec les
   recettes qu'il en a retirées. Tout l'état vit dans un unique objet
   `userState` (voir data/useUserState.js) : localStorage immédiat +
   synchronisation multi-appareils via Supabase.

   ROTATION AUTOMATIQUE (réglable) : quand elle est active, la semaine
   affichée n'est plus `state.week` mais celle que déduit l'ancrage
   (voir lib/rotation.js) — elle avance seule chaque dimanche. La
   sélection manuelle reste possible : elle ouvre alors un choix entre
   « juste regarder » (aperçu éphémère, la rotation continue) et
   « désactiver la rotation » (retour au mode manuel, sur la semaine
   qu'on vient d'ouvrir).
   ============================================================ */
import { useEffect, useState } from 'react';
import { Sidebar, BottomNav } from './components/Navigation.jsx';
import { RecipeDetail } from './components/RecipeDetail.jsx';
import { Dashboard } from './screens/Dashboard.jsx';
import { Shopping } from './screens/Shopping.jsx';
import { Library } from './screens/Library.jsx';
import { Settings } from './screens/Settings.jsx';
import { useUserState } from './data/useUserState.js';
import { DEFAULT_WEEK, WEEK_KEYS, nextWeekKey, prevWeekKey, recipeById, weekShopping } from './data/dataLayer.js';
import { creerAncre, indexAuto, prochainBasculement } from './lib/rotation.js';
import { RotationDialog } from './components/RotationDialog.jsx';

const SCREENS = { dashboard: Dashboard, shopping: Shopping, library: Library, settings: Settings };

export default function MealWeekApp({ themeApi, goHub }) {
  /* ---- theme comes from the shared "univers" theme ---- */
  const { theme, themeMode, setThemeMode, toggleTheme, accent, setAccent, resetTheme } = themeApi;

  /* ---- ephemeral UI state ---- */
  const [screen, setScreen] = useState('dashboard');
  const [openId, setOpenId] = useState(null);

  /* ---- persistent state : un seul objet, synchronisé ---- */
  const [state, setField, resetState] = useUserState();
  const {
    week: manualWeek, autoRotate, autoAnchor, budget: weeklyBudget, portions, store,
    removed, sidebar: sidebarOpen, shopChecked: shoppingChecked, cart,
    perso, favorites, banned, cookSteps,
  } = state;

  /* ---- rotation automatique ----
     `preview` est ÉPHÉMÈRE (jamais persisté) : regarder une autre semaine
     ne doit ni déplacer l'ancrage, ni couper la rotation. */
  const [preview, setPreview] = useState(null);
  const [previewAccepte, setPreviewAccepte] = useState(false); // « juste regarder » retenu pour la session
  const [demande, setDemande] = useState(null);                // semaine visée, en attente du choix
  const [, tick] = useState(0);                                // re-rendu au basculement de minuit

  const autoWeek = WEEK_KEYS[indexAuto(autoAnchor, WEEK_KEYS.length)] || DEFAULT_WEEK;
  const weekKey = autoRotate ? (preview || autoWeek) : manualWeek;
  const enApercu = autoRotate && !!preview && preview !== autoWeek;
  const prochainChangement = prochainBasculement();

  /* l'app peut rester ouverte au passage du dimanche : on programme un
     re-rendu juste après la bascule pour que la semaine suive. */
  useEffect(() => {
    if (!autoRotate) return undefined;
    const delai = Math.max(1000, Math.min(prochainChangement.getTime() - Date.now() + 1000, 2147483647));
    const id = setTimeout(() => tick((n) => n + 1), delai);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRotate, autoWeek]);

  /* recettes retirées de la semaine COURANTE : { [recipeId]: true } */
  const removedInWeek = (removed && removed[weekKey]) || {};

  /* Navigation entre semaines. En manuel, elle déplace la semaine retenue.
     En auto, elle demande d'abord ce qu'on veut faire — puis le choix
     « juste regarder » est mémorisé pour ne plus interrompre. */
  const allerVers = (cible) => {
    if (!autoRotate) { setField('week', cible); return; }
    if (previewAccepte) { setPreview(cible); return; }
    setDemande(cible);
  };

  const desactiverRotation = (semaineChoisie) => {
    setField('week', semaineChoisie || weekKey);
    setField('autoRotate', false);
    setPreview(null);
    setPreviewAccepte(false);
    setDemande(null);
  };

  /* ---- derived ---- */
  const shoppingBadge = weekShopping(weekKey, removedInWeek)
    .filter((r) => !shoppingChecked[`${weekKey}::${r.name}`]).length;

  /* ---- actions ---- */
  const resetAll = () => {
    if (!window.confirm('Réinitialiser toutes vos données locales (semaine retenue, coches, favoris, réglages) ?')) return;
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
    goHub,

    // semaine-type affichée : la dernière parcourue en manuel, celle que
    // dicte l'ancrage en rotation automatique
    weekKey,
    prevWeek: () => allerVers(prevWeekKey(weekKey)),
    nextWeek: () => allerVers(nextWeekKey(weekKey)),

    // rotation automatique
    autoRotate: !!autoRotate,
    autoWeek,
    enApercu,
    prochainChangement,
    exitApercu: () => setPreview(null),
    toggleAutoRotate: () => {
      if (autoRotate) {
        // retour au manuel : on garde la semaine sous les yeux
        desactiverRotation(weekKey);
      } else {
        // on ancre sur la semaine affichée : aujourd'hui ne change rien,
        // la bascule aura lieu au prochain dimanche
        setField('autoAnchor', creerAncre(Math.max(0, WEEK_KEYS.indexOf(manualWeek))));
        setField('autoRotate', true);
        setPreview(null);
        setPreviewAccepte(false);
      }
    },

    // recettes retirées de la semaine courante
    removedInWeek,
    removedCount: Object.values(removedInWeek).filter(Boolean).length,
    toggleRecipeRemoved: (recipeId) => setField('removed', (m) => {
      const cur = { ...((m && m[weekKey]) || {}) };
      if (cur[recipeId]) delete cur[recipeId]; else cur[recipeId] = true;
      const next = { ...(m || {}) };
      if (Object.keys(cur).length) next[weekKey] = cur; else delete next[weekKey];
      return next;
    }),
    resetRemoved: () => setField('removed', (m) => {
      const next = { ...(m || {}) };
      delete next[weekKey];
      return next;
    }),

    // settings
    weeklyBudget, setWeeklyBudget: (v) => setField('budget', v),
    portions, setPortions: (v) => setField('portions', v),
    store, setStore: (v) => setField('store', v),

    // shopping — "déjà en stock"
    shoppingChecked,
    toggleShopItem: (key) => setField('shopChecked', (m) => ({ ...m, [key]: !m[key] })),
    // shopping — "ajouté au panier" (indépendant de "déjà en stock")
    cart,
    toggleCartItem: (key) => setField('cart', (m) => ({ ...(m || {}), [key]: !(m && m[key]) })),

    // articles perso
    perso,
    togglePerso: (id) => setField('perso', (arr) => arr.map((p) => (p.id === id ? { ...p, checked: !p.checked } : p))),
    addPerso: (item) => setField('perso', (arr) => [...arr, { id: 'perso-' + Date.now(), checked: false, mult: 1, ...item }]),
    delPerso: (id) => setField('perso', (arr) => arr.filter((p) => p.id !== id)),
    updatePerso: (id, patch) => setField('perso', (arr) => arr.map((p) => {
      if (p.id !== id) return p;
      const curMult = p.mult ?? 1;
      const curUnit = p.unitPrice != null ? p.unitPrice : (curMult ? (p.total ?? 0) / curMult : (p.total ?? 0));
      const next = { ...p, mult: curMult, unitPrice: curUnit, ...patch };
      next.mult = Math.max(1, Math.round(next.mult || 1));
      next.unitPrice = Math.max(0, Number(next.unitPrice) || 0);
      next.total = Math.round(next.mult * next.unitPrice * 100) / 100;
      return next;
    })),

    // bibliothèque
    favorites,
    toggleFavorite: (id) => setField('favorites', (m) => ({ ...m, [id]: !m[id] })),
    banned,
    toggleBanned: (id) => setField('banned', (m) => ({ ...m, [id]: !m[id] })),

    // étapes de cuisine
    cookSteps,
    toggleStep: (rid, idx) => setField('cookSteps', (m) => ({ ...m, [rid]: { ...(m[rid] || {}), [idx]: !(m[rid] && m[rid][idx]) } })),

    // données
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

      {demande && (
        <RotationDialog
          cible={demande}
          onApercu={() => { setPreviewAccepte(true); setPreview(demande); setDemande(null); }}
          onDesactiver={() => desactiverRotation(demande)}
          onClose={() => setDemande(null)}
        />
      )}

      <BottomNav current={screen} onNav={setScreen} shoppingBadge={shoppingBadge} />
    </div>
  );
}
