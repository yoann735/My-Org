/* ============================================================
   MedRevise — COMPTEUR DE VUES PAR CARTE (07/11, docs/compte-rendu-compteur-vues-et-zoom-image.md).
   UNE « vue » = UNE notation de la carte en séance avec l'un des 4 boutons (À revoir / Difficile / Correct / Facile),
   telle qu'enregistrée dans le journal des révisions (journal/journal.js, store `medrevise-review_log`) :
   une entrée dont `rating` vaut 1, 2, 3 ou 4. Les répétitions de séance (relearn) sont des notations aux 4 boutons :
   elles comptent. NE comptent PAS : « Passer en révision » (rating null), « Garder en nouvelle » (rien n'est journalisé),
   le mode Apprentissage (il n'écrit jamais le journal ; son badge « ×N » est un autre compteur), les aperçus.

   CALCULÉ, JAMAIS STOCKÉ : une passe sur le journal local au premier besoin, puis mise à jour INCRÉMENTALE à chaque
   entrée nouvelle (notation locale ou entrée reçue du cloud, journal.js prévient ses abonnés avec ces entrées). Un id
   d'entrée n'est compté qu'une fois. LECTURE SEULE : ce module n'écrit rien, ni carte, ni journal, ni Supabase.
   SEUL calcul du compteur : tout affichage, tri ou filtre passe par vuesDe / useVues.
   ============================================================ */
import { useSyncExternalStore } from 'react';
import { toutLeJournal, surChangementJournal } from '../journal/journal.js';

/** une entrée du journal est-elle une vue ? */
export const estVue = (e) => !!e && typeof e.card_id === 'string' && Number.isInteger(e.rating) && e.rating >= 1 && e.rating <= 4;

/** compte (pur) : Map(cardId → n) à partir d'une liste d'entrées */
export function compterVues(entrees, comptes = new Map(), dejaVus = new Set()) {
  for (const e of entrees || []) {
    if (!estVue(e) || dejaVus.has(e.id)) continue;
    dejaVus.add(e.id);
    comptes.set(e.card_id, (comptes.get(e.card_id) || 0) + 1);
  }
  return comptes;
}

/** nombre de vues d'une carte (0 si jamais notée) */
export const vuesDe = (comptes, id) => (comptes && comptes.get(id)) || 0;

/* ---- tranches du filtre (sélection multiple) ---- */
export const TRANCHES_VUES = [
  { cle: '0', libelle: '0', min: 0, max: 0 },
  { cle: '1-2', libelle: '1–2', min: 1, max: 2 },
  { cle: '3-5', libelle: '3–5', min: 3, max: 5 },
  { cle: '6-10', libelle: '6–10', min: 6, max: 10 },
  { cle: '10+', libelle: '>10', min: 11, max: Infinity },
];
export const trancheDe = (n) => (TRANCHES_VUES.find((t) => n >= t.min && n <= t.max) || TRANCHES_VUES[0]).cle;
/** la carte passe-t-elle le filtre de tranches ? (aucune tranche choisie = toutes) */
export const dansTranches = (comptes, id, tranches) => !tranches || !tranches.length || tranches.includes(trancheDe(vuesDe(comptes, id)));

/* ---- la mémoire partagée (un seul calcul pour toute l'app) ---- */
let comptes = new Map();
const dejaVus = new Set();
let pret = false;
let instantane = { comptes, pret, version: 0 };
let chargement = null;
const abonnes = new Set();
const publier = () => { instantane = { comptes, pret, version: instantane.version + 1 }; abonnes.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } }); };

// écoute posée une fois : les entrées nouvelles s'ajoutent sans relire le journal (avant la première passe, elles sont
// aussi comptées : la passe ignorera leurs ids, déjà vus)
let ecoute = false;
function ecouter() {
  if (ecoute) return; ecoute = true;
  surChangementJournal((neuves) => {
    if (!Array.isArray(neuves) || !neuves.length) return;
    const avant = dejaVus.size;
    compterVues(neuves, comptes, dejaVus);
    if (dejaVus.size !== avant) { comptes = new Map(comptes); publier(); }
  });
}

/** première passe sur le journal (une seule fois, mémorisée) */
export function chargerVues() {
  ecouter();
  if (!chargement) {
    chargement = toutLeJournal().then((tout) => {
      compterVues(tout, comptes, dejaVus);
      comptes = new Map(comptes); pret = true; publier();
      return comptes;
    }).catch(() => { pret = true; publier(); return comptes; });
  }
  return chargement;
}

function abonner(fn) { abonnes.add(fn); chargerVues(); return () => abonnes.delete(fn); }
const lireInstantane = () => instantane;

/** hook : { comptes: Map(cardId → n), pret } — se met à jour à chaque notation, sans recharger */
export function useVues() { return useSyncExternalStore(abonner, lireInstantane, lireInstantane); }

/** libellé de l'infobulle */
export const libelleVues = (n) => (n === 0 ? 'Jamais révisée en séance' : `Révisée ${n} fois en séance`);
