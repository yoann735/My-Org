/* ============================================================
   MealWeek — état utilisateur centralisé + sync multi-appareils.

   TOUT l'état modifiable par l'utilisateur vit dans UN seul objet :
   - `week`        : la semaine-type RETENUE (la dernière parcourue) ;
   - `autoRotate`  : rotation automatique des semaines chaque dimanche ;
   - `autoAnchor`  : l'ancrage de cette rotation ({semaine, index}), posé à
                     l'activation — il transite par la sync pour que tous
                     les appareils tombent sur la même semaine ;
   - `removed`     : les recettes retirées, par semaine
                     ({ S1: { R09: true } }) ;
   - `shopChecked` / `cart` : les cases « déjà en stock » / « ajouté au
                     panier » de l'écran Courses ;
   - les préférences (budget, portions, magasin, sidebar), les favoris,
     les recettes bannies et les étapes de cuisine cochées.

   Persistance :
   - localStorage IMMÉDIATE (offline + instantané) sous une clé unique ;
   - sync cloud Supabase (débounce ~800 ms, last-write-wins) via la table
     `mealweek_state` (id / data jsonb / updated_at), ligne unique ;
   - au démarrage : si la ligne cloud est plus récente que le local, on
     adopte le cloud, sinon on garde (et on pousse) le local ;
   - hors-ligne / Supabase non configuré : aucun plantage, repli local.
   ============================================================ */
import { useCallback, useEffect, useRef, useState } from 'react';
import { SYNC_ENABLED, supabase, STATE_TABLE, STATE_ROW_ID } from './supabaseClient.js';
import { WEEK_KEYS, DEFAULT_WEEK, BUDGET_TARGET, defaultPerso } from './dataLayer.js';

const LOCAL_KEY = 'mw.state.v1';
const EPOCH = new Date(0).toISOString();

/* Bascule de purge unique. L'état sauvegardé avant la V2 référence des
   semaines et des recettes qui n'existent plus (S1-S6/E1-E2, anciens ids,
   créneaux `slotsOff`). Changer cette valeur rejoue la purge partout —
   sur chaque appareil comme dans le cloud, via la sync habituelle. */
const CONTENT_RESET = 'v2-2026-09-02';

function buildDefaults() {
  return {
    week: DEFAULT_WEEK,
    autoRotate: false,
    autoAnchor: null,
    removed: {},
    budget: BUDGET_TARGET,
    portions: 2,
    store: 'Chronodrive',
    sidebar: false,
    shopChecked: {},
    cart: {},
    perso: defaultPerso(),
    favorites: {},
    banned: {},
    cookSteps: {},
    contentReset: CONTENT_RESET,
  };
}

/* Champs hérités des versions précédentes, sans équivalent en V2 :
   ils sont abandonnés à la purge plutôt que traînés indéfiniment. */
const CHAMPS_OBSOLETES = ['eco', 'slotsOff'];

function purgeAncienContenu(data) {
  const d = { ...data };
  CHAMPS_OBSOLETES.forEach((k) => { delete d[k]; });
  // tout ce qui est indexé par semaine ou par recette pointe vers l'ancien contenu
  d.removed = {};
  d.shopChecked = {};
  d.cart = {};
  d.favorites = {};
  d.banned = {};
  d.cookSteps = {};
  d.perso = (Array.isArray(d.perso) ? d.perso : []).filter((p) => !p.fixe);
  d.week = DEFAULT_WEEK;
  d.autoRotate = false;
  d.autoAnchor = null;
  d.contentReset = CONTENT_RESET;
  return d;
}

/** état issu du disque ou du cloud, remis d'aplomb : valeurs par défaut
    complétées, semaine inconnue ramenée sur la première, purge unique. */
function normaliser(raw) {
  // le drapeau doit être lu sur l'état STOCKÉ : buildDefaults() le porte déjà,
  // donc le tester après fusion ne déclencherait jamais la purge.
  const aPurger = !raw || raw.contentReset !== CONTENT_RESET;
  let d = { ...buildDefaults(), ...(raw || {}) };
  if (aPurger) d = purgeAncienContenu(d);
  if (!WEEK_KEYS.includes(d.week)) d.week = DEFAULT_WEEK;
  if (!d.removed || typeof d.removed !== 'object') d.removed = {};
  return d;
}

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw != null ? JSON.parse(raw) : undefined;
  } catch (e) {
    return undefined;
  }
}

function loadInitial() {
  const wrap = readJSON(LOCAL_KEY);
  if (wrap && wrap.data) {
    return { data: normaliser(wrap.data), updated_at: wrap.updated_at || EPOCH };
  }
  return { data: buildDefaults(), updated_at: EPOCH };
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
              // cloud plus récent → on l'adopte (normalisé : purge + semaine valide)
              setWrap({ data: normaliser(row.data), updated_at: row.updated_at });
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
