/* ============================================================
   MedRevise — JOURNAL DES RÉVISIONS : synchro cloud (étape 2 FSRS).
   Table Supabase `medrevise_review_log` (supabase/migrations/20261011_medrevise_review_log.sql,
   À APPLIQUER PAR YOANN) — AJOUT SEUL :
   - envoi : upsert `ignoreDuplicates` sur l'id (= insert … on conflict do nothing) → renvoyer
     la même ligne deux fois n'a aucun effet (idempotent) ; la file d'envoi locale survit hors ligne ;
   - réception : incrémentale, par `inserted_at` (heure du SERVEUR, pas de l'appareil) avec une
     marge de recouvrement, les doublons étant ignorés par id ;
   - après réception, l'état FSRS des cartes concernées est recalculé à partir du journal trié
     (scheduler/fsrs.js reconstruire) : deux appareils convergent quel que soit l'ordre.
   Indépendant de la synchro générale (lib/storage.js syncNow), qui n'est pas modifiée.
   Table absente (SQL pas encore appliqué) : rien ne casse, les entrées restent en file.
   ============================================================ */
import { supabase as clientParDefaut, SYNC_ENABLED } from '../data/supabaseClient.js';
import { getMeta, setMeta, getOne, put, getReglagesFC } from '../lib/storage.js';
import { entreesEnAttente, marquerEnvoyees, integrerEntrees, journalDeCarte, idsEnAttente, compteJournal, surChangementJournal } from './journal.js';
import { versLigne, depuisLigne, memeBloc, trierJournal } from './fusion.js';
import { reconstruire } from '../scheduler/fsrs.js';
import { configPlanificateur, planificateurActif } from '../scheduler/config.js';

export const TABLE_JOURNAL = 'medrevise_review_log';
const CLE_CURSEUR = 'journal.curseur';
const CLE_DERNIERE = 'journal.derniereSynchro';
const LOT = 200;
const MARGE_MS = 5 * 60 * 1000;

const estTableAbsente = (err) => !!err && (err.code === 'PGRST205' || err.code === '42P01' || /does not exist|schema cache|Could not find the table/i.test(err.message || ''));

/** envoie des entrées (lots de 200) — renvoie les ids acceptés (insérés OU déjà présents) */
export async function envoyerEntrees(client, entrees) {
  const envoyees = [];
  for (let i = 0; i < entrees.length; i += LOT) {
    const lot = entrees.slice(i, i + LOT);
    const { error } = await client.from(TABLE_JOURNAL).upsert(lot.map(versLigne), { onConflict: 'id', ignoreDuplicates: true });
    if (error) return { envoyees, erreur: error.message || String(error), tableAbsente: estTableAbsente(error) };
    envoyees.push(...lot.map((e) => e.id));
  }
  return { envoyees, erreur: null, tableAbsente: false };
}

/** reçoit les lignes insérées au cloud depuis `curseur` (ISO, heure serveur) */
export async function recevoirEntrees(client, curseur) {
  const depuis = curseur ? new Date(Date.parse(curseur) - MARGE_MS).toISOString() : '1970-01-01T00:00:00Z';
  const lignes = []; let max = curseur || null;
  for (let p = 0; p < 500; p++) {
    const { data, error } = await client.from(TABLE_JOURNAL).select('*').gt('inserted_at', depuis)
      .order('inserted_at', { ascending: true }).order('id', { ascending: true }).range(p * 1000, p * 1000 + 999);
    if (error) return { lignes, curseur: max, erreur: error.message || String(error), tableAbsente: estTableAbsente(error) };
    for (const l of data || []) { lignes.push(l); if (!max || l.inserted_at > max) max = l.inserted_at; }
    if (!data || data.length < 1000) break;
  }
  return { lignes, curseur: max, erreur: null, tableAbsente: false };
}

/** recalcule le bloc FSRS des cartes touchées par des entrées reçues (et la date si FSRS est ON) */
export async function appliquerJournalAuxCartes(cardIds) {
  const reglages = await getReglagesFC();
  const config = configPlanificateur(reglages);
  const actif = planificateurActif(reglages);
  let maj = 0;
  for (const id of new Set(cardIds)) {
    const carte = await getOne('questions', id);
    if (!carte || carte.type !== 'flashcard') continue;
    const journal = await journalDeCarte(id);
    if (!journal.length) continue;
    const bloc = reconstruire(carte, journal, config);
    const derniere = trierJournal(journal).filter((e) => !(e.details && e.details.relearn)).pop();
    let suivante = carte;
    if (!memeBloc(bloc, carte.fsrs)) suivante = { ...suivante, fsrs: { ...bloc, majLe: new Date().toISOString() } };
    // FSRS ON : la date suit la dernière réponse décidée par FSRS (quel que soit l'appareil)
    if (actif === 'fsrs' && derniere && derniere.planificateur === 'fsrs' && derniere.state_after && derniere.state_after.dueDate
      && derniere.state_after.dueDate !== carte.dueDate && derniere.reviewed_at >= ((carte.fsrs && carte.fsrs.majLe) || '')) {
      suivante = { ...suivante, dueDate: derniere.state_after.dueDate, termine: false, capped: false };
    }
    if (suivante !== carte) { await put('questions', suivante); maj++; }
  }
  return maj;
}

/* ---- état exposé à l'indicateur (Réglages → Synchronisation) ---- */
let etat = { enCours: false, derniere: null, erreur: null, tableAbsente: false, envoyees: 0, recues: 0 };
const abonnes = new Set();
export function etatSynchroJournal() { return etat; }
export function surEtatSynchroJournal(fn) { abonnes.add(fn); return () => abonnes.delete(fn); }
function poser(p) { etat = { ...etat, ...p }; abonnes.forEach((fn) => { try { fn(etat); } catch (e) { /* ignore */ } }); }

export async function resumeJournal() {
  const [enAttente, total, derniere] = await Promise.all([idsEnAttente(), compteJournal(), getMeta(CLE_DERNIERE)]);
  return { enAttente: enAttente.length, total, derniere: derniere || etat.derniere };
}

let enVol = null;
/** une passe complète : envoi de la file, réception, recalcul des cartes touchées */
export function synchroniserJournal(client = clientParDefaut) {
  if (!SYNC_ENABLED || !client) return Promise.resolve({ ok: false, raison: 'désactivée' });
  if (!enVol) enVol = passe(client).finally(() => { enVol = null; });
  return enVol;
}
async function passe(client) {
  poser({ enCours: true });
  try {
    const aEnvoyer = await entreesEnAttente();
    const env = await envoyerEntrees(client, aEnvoyer);
    if (env.envoyees.length) await marquerEnvoyees(env.envoyees);
    if (env.erreur) { poser({ enCours: false, erreur: env.erreur, tableAbsente: env.tableAbsente }); return { ok: false, ...env }; }
    const rec = await recevoirEntrees(client, await getMeta(CLE_CURSEUR));
    if (rec.erreur) { poser({ enCours: false, erreur: rec.erreur, tableAbsente: rec.tableAbsente }); return { ok: false, ...rec }; }
    const neuves = await integrerEntrees(rec.lignes.map(depuisLigne));
    if (rec.curseur) await setMeta(CLE_CURSEUR, rec.curseur);
    const cartesMaj = neuves.length ? await appliquerJournalAuxCartes(neuves.map((e) => e.card_id)) : 0;
    const derniere = new Date().toISOString();
    await setMeta(CLE_DERNIERE, derniere);
    poser({ enCours: false, derniere, erreur: null, tableAbsente: false, envoyees: env.envoyees.length, recues: neuves.length });
    return { ok: true, envoyees: env.envoyees.length, recues: neuves.length, cartesMaj };
  } catch (e) {
    poser({ enCours: false, erreur: String((e && e.message) || e) });
    return { ok: false, erreur: String(e) };
  }
}

// envoi automatique peu après chaque réponse (hors ligne : la file attend la prochaine passe)
let minuteur = null;
if (typeof window !== 'undefined') {
  surChangementJournal(() => {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => { if (typeof navigator === 'undefined' || navigator.onLine !== false) synchroniserJournal(); }, 3000);
  });
}
