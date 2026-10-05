/* ============================================================
   MedRevise — TRANSCRIPTION EN DIRECT : pont React vers le moteur (engine.js).
   ============================================================ */
import { useSyncExternalStore } from 'react';
import { abonner, lireEtat, abonnerNiveau, lireNiveau } from './engine.js';

export function useTranscription() {
  return useSyncExternalStore(abonner, lireEtat);
}

/* Niveau audio : on ne renvoie qu'une valeur ARRONDIE (20 crans) pour que React
   ne re-rende pas le VU-mètre à chaque bloc de 100 ms si rien ne bouge à l'œil. */
let cache = { niveau: 0, silencieux: false };
function instantane() {
  const n = lireNiveau();
  const niveau = Math.round(n.niveau * 20) / 20;
  if (niveau !== cache.niveau || n.silencieux !== cache.silencieux) cache = { niveau, silencieux: n.silencieux };
  return cache;
}
export function useNiveauAudio() {
  return useSyncExternalStore(abonnerNiveau, instantane);
}
