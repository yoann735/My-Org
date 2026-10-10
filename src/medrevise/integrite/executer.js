/* ============================================================
   MedRevise — CONTRÔLE D'INTÉGRITÉ À CHAQUE OUVERTURE (filet de sécurité, 11/10/2026).
   Lancé en tâche de fond APRÈS la synchro de démarrage (MedReviseApp.jsx) : lecture IndexedDB,
   contrôle pur (./controle.js, quelques ms sur 2 000 enregistrements), comparaison au cloud en
   lecture seule (lib/syncStatus.js comparerAuCloud), journal en attente (lecture).
   N'écrit QUE dans `meta` (local, jamais synchronisé) : l'instantané du jour (comptes + ids, pour
   détecter une baisse le lendemain) et le dernier résultat. Aucune donnée n'est corrigée ici.
   ============================================================ */
import { getAll, getMeta, setMeta } from '../lib/storage.js';
import { todayISO } from '../lib/sm2.js';
import { comparerAuCloud } from '../lib/syncStatus.js';
import { entreesEnAttente } from '../journal/journal.js';
import { controlerIntegrite } from './controle.js';

const CLE_INSTANTANES = 'integrite.instantanes';
const CLE_RESULTAT = 'integrite.resultat';

let resultat = null;
const abonnes = new Set();
export const resultatIntegrite = () => resultat;
export function surIntegrite(fn) { abonnes.add(fn); return () => abonnes.delete(fn); }
const publier = (r) => { resultat = r; abonnes.forEach((fn) => { try { fn(r); } catch (e) { /* ignore */ } }); };

let enCours = null;
export function lancerControle({ avecCloud = true } = {}) {
  if (!enCours) enCours = executer(avecCloud).finally(() => { enCours = null; });
  return enCours;
}

async function executer(avecCloud) {
  const jour = todayISO();
  const [sources, matieres, fiches, questions, inst] = await Promise.all([getAll('sources'), getAll('matieres'), getAll('fiches'), getAll('questions'), getMeta(CLE_INSTANTANES)]);
  const db = { sources: sources || [], matieres: matieres || [], fiches: fiches || [], questions: questions || [] };
  let { courant = null, precedent = null } = inst || {};
  if (courant && courant.jour < jour) precedent = courant;
  let cloud = null;
  if (avecCloud) {
    try {
      const c = await comparerAuCloud();
      cloud = { statut: c.statut === 'ajour' ? 'ok' : c.statut === 'offline' ? 'hors-ligne' : c.statut === 'disabled' ? 'desactive' : c.statut, empreinteLocale: c.hashLocal || null, empreinteCloud: c.hash || null };
    } catch (e) { cloud = null; }
  }
  let journalPlusAncien = null;
  try { journalPlusAncien = (await entreesEnAttente()).map((e) => e.reviewed_at).filter(Boolean).sort()[0] || null; } catch (e) { /* journal illisible : ignoré */ }
  const r = controlerIntegrite({ db, jour, precedent, cloud, journalPlusAncien });
  // instantané du jour (le dernier de la journée sert de référence le lendemain)
  await setMeta(CLE_INSTANTANES, { precedent, courant: r.instantane });
  const { instantane, ...resume } = r; // eslint-disable-line no-unused-vars
  await setMeta(CLE_RESULTAT, { ...resume, le: new Date().toISOString() });
  publier({ ...resume, le: new Date().toISOString() });
  return r;
}

/** dernier résultat enregistré (affichage avant que le contrôle du jour n'ait tourné) */
export async function dernierResultat() { return resultat || (await getMeta(CLE_RESULTAT)) || null; }
