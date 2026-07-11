/* ============================================================
   MealWeek — état utilisateur centralisé + sync multi-appareils (LOT 5).

   TOUT l'état modifiable par l'utilisateur (coches "déjà en stock",
   "ajouté au panier", courses cochées, repas désactivés du planning,
   slider Portions, mode éco, semaine courante, favoris, bannis, étapes
   de cuisine, sidebar…) vit dans UN seul objet `data`.

   Persistance :
   - localStorage IMMÉDIATE (offline + instantané) sous une clé unique.
   - Sync cloud Supabase (débounce ~800 ms, last-write-wins) via la table
     `mealweek_state` (id / data jsonb / updated_at). Ligne unique 'default'.
   - Au démarrage : si la ligne cloud est plus récente que le local, on
     adopte le cloud ; sinon on garde (et on pousse) le local.
   - Hors-ligne / Supabase non configuré : aucun plantage, fallback local.

   Migration : au premier lancement de cette version, l'état est reconstruit
   à partir des anciennes clés localStorage dispersées (mw.eco, mw.week, …)
   pour ne rien perdre.
   ============================================================ */
import { useCallback, useEffect, useRef, useState } from 'react';
import { SYNC_ENABLED, supabase, STATE_TABLE, STATE_ROW_ID } from './supabaseClient.js';
import { WEEK_KEYS, BUDGET_TARGET, defaultPerso } from './dataLayer.js';

const LOCAL_KEY = 'mw.state.v1';
const EPOCH = new Date(0).toISOString();

/* anciennes clés éparses → champ centralisé (pour la migration) */
const OLD_KEYS = {
  eco: 'mw.eco',
  week: 'mw.week',
  budget: 'mw.budget',
  portions: 'mw.portions',
  store: 'mw.store',
  slotsOff: 'mw.slotsOff',
  sidebar: 'mw.sidebar',
  shopChecked: 'mw.shopChecked',
  perso: 'mw.perso',
  favorites: 'mw.fav',
  banned: 'mw.banned',
  cookSteps: 'mw.cookSteps',
};

function buildDefaults() {
  return {
    eco: false,
    week: WEEK_KEYS[0],
    budget: BUDGET_TARGET,
    portions: 2,
    store: 'Chronodrive',
    slotsOff: {},
    sidebar: false,
    shopChecked: {},
    cart: {}, // LOT 4 — "ajouté au panier"
    perso: defaultPerso(),
    favorites: {},
    banned: {},
    cookSteps: {},
  };
}

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw != null ? JSON.parse(raw) : undefined;
  } catch (e) {
    return undefined;
  }
}

/** état initial : clé unique si présente, sinon migration des anciennes clés. */
function loadInitial() {
  const wrap = readJSON(LOCAL_KEY);
  if (wrap && wrap.data) {
    return { data: { ...buildDefaults(), ...wrap.data }, updated_at: wrap.updated_at || EPOCH };
  }
  const data = buildDefaults();
  let migrated = false;
  for (const [field, oldKey] of Object.entries(OLD_KEYS)) {
    const v = readJSON(oldKey);
    if (v !== undefined) { data[field] = v; migrated = true; }
  }
  // legacy : ancien booléen "masquer le week-end" → slots Sam/Dim off
  try {
    if (localStorage.getItem('mw.slotsOff') == null && localStorage.getItem('mw.weekend') === 'false') {
      data.slotsOff = { 'Sam-midi': true, 'Sam-soir': true, 'Dim-midi': true, 'Dim-soir': true };
      migrated = true;
    }
  } catch (e) { /* ignore */ }
  // migré → updated_at = maintenant (le local a de la valeur) ; sinon epoch
  // (nouvel appareil vierge → le cloud, s'il existe, gagne au 1er sync).
  return { data, updated_at: migrated ? new Date().toISOString() : EPOCH };
}

export function useUserState() {
  const [wrap, setWrap] = useState(loadInitial);
  const wrapRef = useRef(wrap);
  wrapRef.current = wrap;
  const bootstrapped = useRef(false);

  /* persistance locale immédiate à chaque changement */
  useEffect(() => {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(wrap)); } catch (e) { /* storage plein/désactivé */ }
  }, [wrap]);

  /* mise à jour d'un champ (valeur ou updater), horodatée */
  const setField = useCallback((key, updater) => {
    setWrap((prev) => {
      const nextVal = typeof updater === 'function' ? updater(prev.data[key]) : updater;
      if (Object.is(nextVal, prev.data[key])) return prev;
      return { data: { ...prev.data, [key]: nextVal }, updated_at: new Date().toISOString() };
    });
  }, []);

  /* remise à zéro complète (réglages → réinitialiser) */
  const resetState = useCallback(() => {
    setWrap({ data: buildDefaults(), updated_at: new Date().toISOString() });
  }, []);

  /* écriture cloud (last-write-wins) — silencieuse si hors-ligne */
  const pushCloud = useCallback(async (w) => {
    if (!SYNC_ENABLED) return;
    try {
      await supabase.from(STATE_TABLE).upsert({ id: STATE_ROW_ID, data: w.data, updated_at: w.updated_at });
    } catch (e) { /* offline : le localStorage a déjà la donnée */ }
  }, []);

  /* démarrage : réconcilier local ↔ cloud une seule fois */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (SYNC_ENABLED) {
        try {
          const { data: row, error } = await supabase
            .from(STATE_TABLE)
            .select('data,updated_at')
            .eq('id', STATE_ROW_ID)
            .maybeSingle();
          if (!cancelled && !error && row && row.updated_at) {
            const localTs = new Date(wrapRef.current.updated_at).getTime();
            const cloudTs = new Date(row.updated_at).getTime();
            if (cloudTs > localTs) {
              // cloud plus récent → on l'adopte
              setWrap({ data: { ...buildDefaults(), ...row.data }, updated_at: row.updated_at });
              bootstrapped.current = true;
              return;
            }
          }
        } catch (e) { /* offline → on garde le local */ }
        // local plus récent (ou cloud vide/injoignable) → on pousse le local
        bootstrapped.current = true;
        pushCloud(wrapRef.current);
      } else {
        bootstrapped.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, [pushCloud]);

  /* push cloud débouncé (~800 ms) à chaque changement, après le bootstrap */
  useEffect(() => {
    if (!SYNC_ENABLED || !bootstrapped.current) return undefined;
    const id = setTimeout(() => pushCloud(wrap), 800);
    return () => clearTimeout(id);
  }, [wrap, pushCloud]);

  return [wrap.data, setField, resetState];
}
