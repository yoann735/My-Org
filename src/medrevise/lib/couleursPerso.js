/* ============================================================
   MedRevise — COULEURS PERSONNELLES du surligneur et du crayon (02/10).

   Les 4 couleurs « cours » (prioritaire, vert, bleu, cloze) restent toujours
   là ; l'utilisateur y AJOUTE les siennes (roue chromatique) et les retrouve
   à chaque ouverture.

   SYNCHRONISÉES entre appareils depuis le 03/10 (demande explicite) : un petit
   enregistrement 'couleursPerso' du store `prompts`, déjà synchronisé (voir
   storage.js#setCouleursPersoSync) — aucune nouvelle table, même canal, même
   last-write-wins. Le localStorage sert de cache immédiat (affichage sans attendre
   IndexedDB) ; la version synchronisée fait foi et est relue au montage, après
   chaque rechargement des données (événement 'medrevise:recharge', émis par
   MedReviseApp après une synchro) et au retour sur l'onglet.
   Toute lecture/écriture est protégée : navigation privée ou stockage bloqué
   = liste vide, jamais d'erreur.
   ============================================================ */
import { useEffect, useState } from 'react';
import { getCouleursPersoSync, setCouleursPersoSync } from './storage.js';

const CLE = 'medrevise.couleursPerso';
const MAX = 12;
const EVENEMENT = 'medrevise:couleursPerso'; // synchronise les sélecteurs d'un même onglet

const estHex = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

export function lireCouleursPerso() {
  try {
    const v = JSON.parse(localStorage.getItem(CLE) || '[]');
    return Array.isArray(v) ? v.filter(estHex).map((c) => c.toLowerCase()).slice(0, MAX) : [];
  } catch (e) { return []; }
}

function ecrireLocal(liste) {
  try { localStorage.setItem(CLE, JSON.stringify(liste)); } catch (e) { /* stockage indisponible : la couleur reste utilisable, juste pas mémorisée */ }
  try { window.dispatchEvent(new CustomEvent(EVENEMENT, { detail: liste })); } catch (e) { /* ignore */ }
}
function ecrire(liste) {
  ecrireLocal(liste);
  setCouleursPersoSync(liste).catch(() => { /* hors ligne : l'outbox de la synchro s'en charge */ });
}
const normaliser = (v) => (Array.isArray(v) ? v.filter(estHex).map((c) => c.toLowerCase()).slice(0, MAX) : []);
/** relit la version SYNCHRONISÉE ; la première fois, y verse les couleurs qui
    n'existaient encore que sur cet appareil (avant la synchro du 03/10). */
let migrationFaite = false;
async function relireSync() {
  try {
    const rec = await getCouleursPersoSync();
    if (rec && Array.isArray(rec.couleurs)) {
      const v = normaliser(rec.couleurs);
      if (JSON.stringify(v) !== JSON.stringify(lireCouleursPerso())) ecrireLocal(v);
      return;
    }
    const locales = lireCouleursPerso();
    if (!migrationFaite && locales.length) { migrationFaite = true; await setCouleursPersoSync(locales); }
  } catch (e) { /* IndexedDB indisponible : on garde le cache local */ }
}

/** [liste, ajouter(hex), retirer(hex)] — partagé par tous les sélecteurs ouverts. */
export function useCouleursPerso() {
  const [liste, setListe] = useState(lireCouleursPerso);
  useEffect(() => {
    const maj = () => setListe(lireCouleursPerso());
    const relire = () => { relireSync(); };
    const visible = () => { if (document.visibilityState === 'visible') relireSync(); };
    window.addEventListener(EVENEMENT, maj);
    window.addEventListener('storage', maj); // autre onglet
    window.addEventListener('medrevise:recharge', relire); // après une synchro
    document.addEventListener('visibilitychange', visible);
    relireSync();
    return () => {
      window.removeEventListener(EVENEMENT, maj); window.removeEventListener('storage', maj);
      window.removeEventListener('medrevise:recharge', relire); document.removeEventListener('visibilitychange', visible);
    };
  }, []);
  const ajouter = (hex) => {
    if (!estHex(hex)) return;
    const h = hex.toLowerCase();
    ecrire([h, ...lireCouleursPerso().filter((c) => c !== h)].slice(0, MAX));
  };
  const retirer = (hex) => ecrire(lireCouleursPerso().filter((c) => c !== String(hex).toLowerCase()));
  return [liste, ajouter, retirer];
}

/* ---- conversions HSV ↔ hex (roue chromatique) ---- */
export function hsvVersHex(h, s, v) {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  const hx = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${hx(f(5))}${hx(f(3))}${hx(f(1))}`;
}
export function hexVersHsv(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16) || 0;
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s: max ? d / max : 0, v: max };
}
