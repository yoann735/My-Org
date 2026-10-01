/* ============================================================
   MedRevise — COULEURS PERSONNELLES du surligneur et du crayon (02/10).

   Les 4 couleurs « cours » (prioritaire, vert, bleu, cloze) restent toujours
   là ; l'utilisateur y AJOUTE les siennes (roue chromatique) et les retrouve
   à chaque ouverture.

   Rangées dans le localStorage de CET appareil, et c'est voulu : c'est une
   préférence d'affichage, pas une donnée de cours. Rien ne part au cloud
   (aucune nouvelle table, aucun nouvel enregistrement synchronisé). Les
   annotations, elles, gardent leur couleur exacte (hex) partout.
   Toute lecture/écriture est protégée : navigation privée ou stockage bloqué
   = liste vide, jamais d'erreur.
   ============================================================ */
import { useEffect, useState } from 'react';

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

function ecrire(liste) {
  try { localStorage.setItem(CLE, JSON.stringify(liste)); } catch (e) { /* stockage indisponible : la couleur reste utilisable, juste pas mémorisée */ }
  try { window.dispatchEvent(new CustomEvent(EVENEMENT, { detail: liste })); } catch (e) { /* ignore */ }
}

/** [liste, ajouter(hex), retirer(hex)] — partagé par tous les sélecteurs ouverts. */
export function useCouleursPerso() {
  const [liste, setListe] = useState(lireCouleursPerso);
  useEffect(() => {
    const maj = () => setListe(lireCouleursPerso());
    window.addEventListener(EVENEMENT, maj);
    window.addEventListener('storage', maj); // autre onglet
    return () => { window.removeEventListener(EVENEMENT, maj); window.removeEventListener('storage', maj); };
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
