/* ============================================================
   MealWeek — client Supabase (sync multi-appareils, LOT 5).
   URL + clé anon lues UNIQUEMENT depuis les variables d'env Vite
   (jamais de secret en dur). Si elles sont absentes (dev local sans
   .env), SYNC_ENABLED = false et l'app fonctionne 100 % en local
   (localStorage) sans jamais planter.
   ============================================================ */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const SYNC_ENABLED = !!(url && anonKey);

export const supabase = SYNC_ENABLED
  ? createClient(url, anonKey, { auth: { persistSession: false } })
  : null;

// Table unique, mono-utilisateur : une seule ligne id = 'default'.
export const STATE_TABLE = 'mealweek_state';
export const STATE_ROW_ID = 'default';
