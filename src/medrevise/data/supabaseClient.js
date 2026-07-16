/* ============================================================
   MedRevise — client Supabase (sync multi-appareils). Réutilise le MÊME
   projet Supabase que MealWeek (mêmes variables d'env Vite, jamais de
   secret en dur) mais un client dédié : aucun fichier MealWeek n'est
   touché, aucune donnée mélangée (tables/bucket séparés, voir sync.js).
   Absentes → SYNC_ENABLED = false, l'app reste 100 % locale (IndexedDB)
   sans jamais planter — comme MealWeek sans ses variables.
   ============================================================ */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const SYNC_ENABLED = !!(url && anonKey);

export const supabase = SYNC_ENABLED
  ? createClient(url, anonKey, { auth: { persistSession: false } })
  : null;

// espace MedRevise, séparé de `mealweek_state` : une table générique (une ligne par
// enregistrement, tous stores confondus) + un bucket Storage pour les blobs (images/PDF).
export const RECORDS_TABLE = 'medrevise_records';
export const BLOBS_BUCKET = 'medrevise-blobs';
