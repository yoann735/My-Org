/* ============================================================
   MedRevise — MIGRATION FSRS et BASCULE (étape 2). Fonctions PURES : la même code sert
   au bouton Réglages → FSRS → « Appliquer la migration », à la répétition à blanc sur une copie de
   la sauvegarde (scripts/fsrs/migration-a-blanc.mjs) et aux tests.

   MIGRATION : initialise le bloc `fsrs` de chaque flashcard (fsrs.js initialiser : historique
   rejoué, estimation, ou nouvelle ; difficulté de départ 7) avec `due` = `dueDate` ACTUELLE.
   Une carte qui a déjà un bloc « ombre » (réponses données depuis l'installation) garde son état
   mémoire (stabilité, difficulté…) et reçoit seulement `due` = `dueDate`. Seul le champ `fsrs`
   est écrit ; `dueDate` et tout le reste sont intacts (vérifié par le rapport, 0 écart toléré).
   Idempotente : une carte déjà migrée (`fsrs.migre`) est sautée.

   BASCULE (interrupteur ON) : `dueDate` = due FSRS, qui vaut l'ancienne date au moment de la
   bascule (re-alignement `fsrs.due = dueDate`) → aucune date ne change. Filet : si la bascule
   mettait plus de 80 cartes dues le même jour (en en ajoutant), l'excédent est étalé sur 7 jours.
   ============================================================ */
import { initialiser } from './fsrs.js';
import { configPlanificateur } from './config.js';
import { ajouterJours, ecartJours } from './jours.js';

export const SEUIL_FILET = 80;
export const JOURS_ETALEMENT = 7;

/** empreinte FNV-1a 32 bits d'une chaîne (comparaison avant/après dans le navigateur, synchrone) */
export function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
const tri = (v) => (Array.isArray(v) ? v.map(tri) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, tri(v[k])])) : v);
/** contenu d'une carte hors planification FSRS (tout sauf `fsrs` et `updatedAt`), canonique */
export function contenuCanonique(c) { const { fsrs, updatedAt, ...reste } = c || {}; return JSON.stringify(tri(reste)); } // eslint-disable-line no-unused-vars

/** charge par jour (nombre de cartes dont `dateDe(c)` = jour) sur `n` jours à partir de `jour` (+ retard) */
export function chargeParJour(cartes, dateDe, jour, n = 30) {
  const lignes = [];
  let retard = 0, sansDate = 0, apres = 0;
  const fin = ajouterJours(jour, n);
  const parJour = new Map();
  for (const c of cartes) {
    const d = dateDe(c);
    if (!d) { sansDate++; continue; }
    if (d < jour) retard++;
    else if (d >= fin) apres++;
    else parJour.set(d, (parJour.get(d) || 0) + 1);
  }
  for (let i = 0; i < n; i++) { const d = ajouterJours(jour, i); lignes.push({ jour: d, n: parJour.get(d) || 0 }); }
  return { retard, lignes, apres, sansDate };
}

export function migrerVersFSRS(questions, jour, reglages = null) {
  const config = configPlanificateur(reglages);
  const fc = (questions || []).filter((q) => q && q.type === 'flashcard');
  const rapport = {
    jour, flashcards: fc.length, dejaMigrees: 0, migrees: 0,
    parSource: { historique: 0, estimation: 0, nouvelle: 0, ombreConservee: 0 },
    ecartsDueDate: 0, ecartsContenu: 0, exemplesEcarts: [],
  };
  const maj = [];
  for (const c of fc) {
    if (c.fsrs && c.fsrs.migre) { rapport.dejaMigrees++; continue; }
    let bloc;
    if (c.fsrs && c.fsrs.base) {
      bloc = { ...c.fsrs, due: c.dueDate || null };
      if (bloc.derniere && bloc.due) bloc.intervalle = ecartJours(bloc.derniere, bloc.due);
      rapport.parSource.ombreConservee++;
    } else {
      bloc = initialiser(c, jour, config);
      rapport.parSource[bloc.source] = (rapport.parSource[bloc.source] || 0) + 1;
    }
    bloc = { ...bloc, migre: jour };
    const apres = { ...c, fsrs: bloc };
    if ((apres.dueDate || null) !== (c.dueDate || null) || bloc.due !== (c.dueDate || null)) {
      rapport.ecartsDueDate++; if (rapport.exemplesEcarts.length < 10) rapport.exemplesEcarts.push({ id: c.id, avant: c.dueDate, fsrs: bloc.due });
    }
    if (contenuCanonique(apres) !== contenuCanonique(c)) rapport.ecartsContenu++;
    maj.push(apres);
    rapport.migrees++;
  }
  return { maj, rapport };
}

/** FILET : jours où des cartes AJOUTÉES par un changement de dates dépassent `SEUIL_FILET` → l'excédent
   (parmi les cartes déplacées) est étalé sur les `JOURS_ETALEMENT` jours suivants. Renvoie les cartes
   corrigées et la liste des déplacements. Les cartes déjà dues ce jour-là avant le changement ne bougent pas. */
export function filetEtalement(avant, apres, estPlanifiee = () => true) {
  const dateAvant = new Map(avant.map((c) => [c.id, c.dueDate || null]));
  const compte = (liste) => { const m = new Map(); liste.forEach((c) => { if (c.dueDate && estPlanifiee(c)) m.set(c.dueDate, (m.get(c.dueDate) || 0) + 1); }); return m; };
  const nAvant = compte(avant);
  const parId = new Map(avant.map((c) => [c.id, c]));
  apres.forEach((c) => parId.set(c.id, c));
  const nApres = compte([...parId.values()]);
  const etalement = [];
  const corrigees = new Map(apres.map((c) => [c.id, c]));
  for (const [d, n] of nApres) {
    const limite = Math.max(SEUIL_FILET, nAvant.get(d) || 0);
    if (n <= limite) continue;
    const deplacees = apres.filter((c) => c.dueDate === d && dateAvant.get(c.id) !== d && estPlanifiee(c)).slice(0, n - limite);
    deplacees.forEach((c, i) => {
      const nd = ajouterJours(d, 1 + (i % JOURS_ETALEMENT));
      etalement.push({ id: c.id, de: d, vers: nd });
      corrigees.set(c.id, { ...c, dueDate: nd, fsrs: c.fsrs ? { ...c.fsrs, due: nd } : c.fsrs });
    });
  }
  return { maj: apres.map((c) => corrigees.get(c.id)), etalement };
}

/** bascule ON : re-aligne `fsrs.due` sur `dueDate` (aucune date ne change) + filet d'étalement */
export function basculerVersFSRS(questions, jour, reglages = null, estPlanifiee = () => true) {
  const config = configPlanificateur(reglages);
  const fc = (questions || []).filter((q) => q && q.type === 'flashcard');
  const realignees = fc.map((c) => {
    const base = c.fsrs || initialiser(c, jour, config);
    const due = c.dueDate || null; // due FSRS = ancienne date au moment de la bascule
    if (c.fsrs && base.due === due) return null;
    return { ...c, fsrs: { ...base, due, intervalle: base.derniere && due ? ecartJours(base.derniere, due) : base.intervalle } };
  }).filter(Boolean);
  const { maj, etalement } = filetEtalement(fc, realignees, estPlanifiee);
  const avant = new Map(fc.map((c) => [c.id, c.dueDate || null]));
  const datesModifiees = maj.filter((c) => (c.dueDate || null) !== avant.get(c.id)).length;
  return { maj, rapport: { jour, flashcards: fc.length, realignees: maj.length, datesModifiees, etalement } };
}
