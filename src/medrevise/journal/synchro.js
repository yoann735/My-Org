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
import { getMeta, setMeta, getOne, put, getReglagesFC, putBackup } from '../lib/storage.js';
import { integrerEntrees, journalDeCarte, idsEnAttente, compteJournal, surChangementJournal, fileEnvoiLecture, lireEntrees, retirerDeLaFile, noterTentatives, remettreEnFile, idsJournalLocal } from './journal.js';
import { classerContreServeur, RAISONS } from '../lib/confirmationServeur.js';
import { versLigne, depuisLigne, memeBloc, trierJournal } from './fusion.js';
import { reconstruire } from '../scheduler/fsrs.js';
import { configPlanificateur, planificateurActif } from '../scheduler/config.js';

export const TABLE_JOURNAL = 'medrevise_review_log';
const CLE_CURSEUR = 'journal.curseur';
const CLE_DERNIERE = 'journal.derniereSynchro';
const LOT = 200;
const MARGE_MS = 5 * 60 * 1000;

/* (19/11) refus par une contrainte de la table (rating NOT NULL / CHECK 1..4 tant que
   supabase/migrations/20261024_review_log_evenements.sql n'est pas appliqué) et doublon de clé */
const estContrainte = (err) => !!err && (['23514', '23502'].includes(String(err.code)) || /violates (check|not-null) constraint/i.test(err.message || ''));
const estDoublon = (err) => !!err && (String(err.code) === '23505' || /duplicate key/i.test(err.message || ''));
const estTableAbsente = (err) => !!err && (err.code === 'PGRST205' || err.code === '42P01' || /does not exist|schema cache|Could not find the table/i.test(err.message || ''));

/** envoie des entrées (lots de 200) — renvoie les ids acceptés (insérés OU déjà présents) */
export async function envoyerEntrees(client, entrees) {
  const envoyees = [];
  for (let i = 0; i < entrees.length; i += LOT) {
    const lot = entrees.slice(i, i + LOT);
    const { error } = await client.from(TABLE_JOURNAL).upsert(lot.map(versLigne), { onConflict: 'id', ignoreDuplicates: true });
    // (19/11) « déjà existant » = le serveur a déjà cet id : envoi idempotent, la relecture tranchera (pas une erreur)
    if (error && !estDoublon(error)) return { envoyees, erreur: error.message || String(error), tableAbsente: estTableAbsente(error), contrainte: estContrainte(error) };
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

/* (29/10, synchro incrémentale) VÉRIFICATION LÉGÈRE : une requête minimale — l'inserted_at le plus récent du journal
   au cloud. Égal au curseur local et file vide → rien à envoyer ni à recevoir, la passe est inutile.
   → true (une passe est nécessaire), false (rien à faire), null (illisible : réseau / serveur). */
const inst = (v) => { const t = Date.parse(v || ''); return Number.isNaN(t) ? null : t; };
export async function journalAChange(client = clientParDefaut) {
  if (!SYNC_ENABLED || !client) return false;
  if ((await idsEnAttente()).length) return true;
  try {
    const { data, error } = await client.from(TABLE_JOURNAL).select('inserted_at').order('inserted_at', { ascending: false }).limit(1);
    if (error) return estTableAbsente(error) ? evenementsCloudOntChange(client) : null; // table pas encore créée
    const max = data && data[0] ? data[0].inserted_at : null;
    if (inst(max) !== inst(await getMeta(CLE_CURSEUR))) return true;
    return await evenementsCloudOntChange(client); // (19/11) canal de repli des événements
  } catch (e) { return null; }
}

/* ============================================================
   (19/11/2026, docs/compte-rendu-74-en-attente.md) LE DÉFAUT CORRIGÉ : « 74 en attente » sur le téléphone.
   Les événements sans note (« Passer en révision », rating null) partaient à part ; la table les REFUSE tant que
   la migration 20261024 n'est pas appliquée (contrainte rating NOT NULL) ; le refus était ignoré (la passe disait
   « ok »), l'événement restait en file À VIE, +1 à chaque « Passer en révision », et l'empreinte ne couvrait pas
   le journal : « À jour » + « 74 en attente ». Désormais :
   1. RÉCONCILIATION d'abord : les ids en file sont RELUS au serveur (par paquets) ; ce qu'il a déjà à l'identique
      sort de la file (putBackup avant), le reste part ; une autre version sous le même id est signalée, jamais écrasée.
   2. ENVOI idempotent (doublon = succès) ; un événement refusé par la contrainte part par le CANAL DE REPLI :
      un enregistrement `review_log_evenement` de medrevise_records (table générique, aucune migration requise),
      même contenu que la ligne du journal (versLigne). Migration appliquée → il ira dans la table, comme une note.
   3. PREUVE : relecture des ids envoyés ; seuls les identiques sortent. Ce qui reste porte un compteur de
      tentatives et sa raison en une ligne, et la passe est un ÉCHEC (plus jamais de « ok » avec un refus avalé).
   4. RÉCEPTION : table (incrémentale) + canal de repli (par ids).
   ============================================================ */
export const STORE_EVENEMENTS = 'review_log_evenement';
const PAQUET = 100;
const ligneEvenement = (e) => ({ store: STORE_EVENEMENTS, record_id: e.id, data: versLigne(e), updated_at: new Date(e.reviewed_at).toISOString(), deleted: false });
const depuisEnregistrement = (r) => (r && r.data ? { ...r.data, id: r.record_id } : null);

/** RELIT au serveur les entrées d'ids donnés (table du journal + canal de repli), par paquets. Lecture seule.
 *  → { lignes: [{ id, card_id, rating, reviewed_at }], erreur, tableAbsente } */
export async function lireAuServeur(client, ids) {
  const lignes = []; let tableAbsente = false;
  try {
    for (let i = 0; i < ids.length; i += PAQUET) {
      const paquet = ids.slice(i, i + PAQUET);
      if (!tableAbsente) {
        const t = await client.from(TABLE_JOURNAL).select('id,card_id,rating,reviewed_at').in('id', paquet);
        if (t.error) { if (estTableAbsente(t.error)) tableAbsente = true; else return { lignes, erreur: t.error.message || String(t.error), tableAbsente }; }
        else lignes.push(...(t.data || []).filter((l) => paquet.includes(l.id)));
      }
      const r = await client.from('medrevise_records').select('record_id,data,updated_at,deleted').eq('store', STORE_EVENEMENTS).in('record_id', paquet);
      if (r.error) return { lignes, erreur: r.error.message || String(r.error), tableAbsente };
      lignes.push(...(r.data || []).filter((x) => !x.deleted && paquet.includes(x.record_id)).map(depuisEnregistrement).filter(Boolean));
    }
    return { lignes, erreur: null, tableAbsente };
  } catch (e) { return { lignes, erreur: String((e && e.message) || e), tableAbsente }; }
}

/** envoie des entrées : notes → table ; événements → table, puis canal de repli si la contrainte les refuse */
async function envoyer(client, entrees) {
  const notes = entrees.filter((e) => e.rating != null);
  const evenements = entrees.filter((e) => e.rating == null);
  let erreur = null, tableAbsente = false;
  if (notes.length) { const r = await envoyerEntrees(client, notes); if (r.erreur) { erreur = r.erreur; tableAbsente = r.tableAbsente; } }
  for (let i = 0; i < evenements.length; i += LOT) {
    const lot = evenements.slice(i, i + LOT);
    const r = await envoyerEntrees(client, lot);
    if (!r.erreur) continue;
    if (!(r.contrainte || r.tableAbsente)) { erreur = erreur || r.erreur; continue; }
    const { error } = await client.rpc('medrevise_push', { records: lot.map(ligneEvenement) }); // canal de repli
    if (error) erreur = erreur || 'canal de repli des événements : ' + (error.message || String(error));
  }
  return { erreur, tableAbsente };
}

/* ---- réconciliation complète par ids (garde-fou) : ce qui manque d'un côté ou de l'autre ---- */
/** TOUS les ids (+ reviewed_at) du journal au serveur : table + canal de repli. null si illisible. */
export async function journalCloudComplet(client = clientParDefaut) {
  if (!SYNC_ENABLED || !client) return null;
  const out = new Map();
  try {
    for (let p = 0; p < 500; p++) {
      const { data, error } = await client.from(TABLE_JOURNAL).select('id,reviewed_at').order('id', { ascending: true }).range(p * 1000, p * 1000 + 999);
      if (error) { if (estTableAbsente(error)) break; return null; }
      for (const l of data || []) out.set(l.id, l.reviewed_at);
      if (!data || data.length < 1000) break;
    }
    for (let p = 0; p < 500; p++) {
      const { data, error } = await client.from('medrevise_records').select('record_id,updated_at,deleted').eq('store', STORE_EVENEMENTS).order('record_id', { ascending: true }).range(p * 1000, p * 1000 + 999);
      if (error) return null;
      for (const r of data || []) if (!r.deleted && !out.has(r.record_id)) out.set(r.record_id, r.updated_at);
      if (!data || data.length < 1000) break;
    }
    return out;
  } catch (e) { return null; }
}

/** entrées complètes d'ids présents au serveur (table + repli) */
async function lireCompletes(client, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += PAQUET) {
    const paquet = ids.slice(i, i + PAQUET);
    const t = await client.from(TABLE_JOURNAL).select('*').in('id', paquet);
    if (t.error && !estTableAbsente(t.error)) return null;
    out.push(...((t.data || []).filter((l) => paquet.includes(l.id)).map(depuisLigne)));
    const r = await client.from('medrevise_records').select('record_id,data,updated_at,deleted').eq('store', STORE_EVENEMENTS).in('record_id', paquet);
    if (r.error) return null;
    for (const x of r.data || []) if (!x.deleted && paquet.includes(x.record_id) && !out.some((e) => e.id === x.record_id)) out.push(depuisLigne(depuisEnregistrement(x)));
  }
  return out;
}

/** compare les ids des deux côtés : reçoit ce qui manque ici, remet en file ce qui manque au serveur */
export async function reconcilierJournal(client = clientParDefaut) {
  const cloud = await journalCloudComplet(client);
  if (!cloud) return { ok: false };
  const locaux = new Set(await idsJournalLocal());
  const manquantsIci = [...cloud.keys()].filter((id) => !locaux.has(id));
  const manquantsServeur = [...locaux].filter((id) => !cloud.has(id));
  let recues = [];
  if (manquantsIci.length) {
    const e = await lireCompletes(client, manquantsIci);
    if (e) recues = await integrerEntrees(e);
  }
  const remis = await remettreEnFile(manquantsServeur);
  return { ok: true, recues, remis, nCloud: cloud.size };
}

let enVol = null;
/** une passe complète : réconciliation + envoi prouvé de la file, réception, recalcul des cartes touchées */
export function synchroniserJournal(client = clientParDefaut, { complete = false } = {}) {
  if (!SYNC_ENABLED || !client) return Promise.resolve({ ok: false, raison: 'désactivée' });
  if (!enVol) enVol = passe(client, complete).finally(() => { enVol = null; });
  return enVol;
}

/** confirme par le serveur une liste d'entrées locales ; sort de la file les identiques (putBackup avant) */
async function confirmer(client, entrees) {
  const lu = await lireAuServeur(client, entrees.map((e) => e.id));
  if (lu.erreur) return { erreur: lu.erreur };
  const c = classerContreServeur('journal', entrees, lu.lignes, (x) => x.id);
  if (c.identique.length) {
    await putBackup('pre-confirmation-journal-' + Date.now(), c.identique.map((e) => ({ id: e.id, card_id: e.card_id, rating: e.rating, reviewed_at: e.reviewed_at })));
    await retirerDeLaFile(c.identique.map((e) => e.id));
  }
  if (c.different.length) await noterTentatives(c.different.map((e) => e.id), RAISONS.different);
  return { ...c, tableAbsente: lu.tableAbsente };
}

async function passe(client, complete) {
  poser({ enCours: true });
  try {
    // 0. (passe complète) garde-fou par ids AVANT l'envoi : ce qui manque au serveur est remis en file et part tout de suite
    let recuesRepli = [];
    if (complete) {
      const r = await reconcilierJournal(client);
      if (r.ok) { recuesRepli = r.recues; await setMeta(CLE_N_EVENEMENTS, await compterEvenementsCloud(client)); }
    }
    const file = await fileEnvoiLecture();
    // entrée de file sans entrée de journal (orpheline) : il n'y a RIEN à envoyer ; sauvegardée puis retirée
    const orphelines = file.filter((f) => f.orpheline).map((f) => f.id);
    if (orphelines.length) { await putBackup('pre-orphelines-journal-' + Date.now(), orphelines); await retirerDeLaFile(orphelines); }
    const entrees = await lireEntrees(file.filter((f) => !f.orpheline).map((f) => f.id));
    let envoyees = 0, erreurEnvoi = null, tableAbsente = false;
    if (entrees.length) {
      // 1. réconciliation : ce que le serveur a déjà
      const c1 = await confirmer(client, entrees);
      if (c1.erreur) { poser({ enCours: false, erreur: c1.erreur }); return { ok: false, erreur: c1.erreur }; }
      tableAbsente = c1.tableAbsente;
      envoyees += c1.identique.length;
      if (c1.absent.length) {
        // 2. envoi, 3. preuve par relecture
        const env = await envoyer(client, c1.absent);
        tableAbsente = tableAbsente || env.tableAbsente;
        const c2 = await confirmer(client, c1.absent);
        if (c2.erreur) erreurEnvoi = env.erreur || c2.erreur;
        else {
          envoyees += c2.identique.length;
          if (c2.absent.length) {
            const raison = env.erreur ? 'refusée par le serveur : ' + env.erreur : 'envoyée mais absente du serveur à la relecture';
            await noterTentatives(c2.absent.map((e) => e.id), raison);
            erreurEnvoi = raison;
          }
        }
      }
    }
    if (erreurEnvoi && !tableAbsente) { poser({ enCours: false, erreur: erreurEnvoi }); return { ok: false, erreur: erreurEnvoi, envoyees }; }
    // 4. réception : table (incrémentale par inserted_at) + canal de repli et garde-fou (complète, par ids)
    const rec = await recevoirEntrees(client, await getMeta(CLE_CURSEUR));
    if (rec.erreur) { poser({ enCours: false, erreur: rec.erreur, tableAbsente: rec.tableAbsente }); return { ok: false, ...rec }; }
    const neuves = await integrerEntrees(rec.lignes.map(depuisLigne));
    if (rec.curseur) await setMeta(CLE_CURSEUR, rec.curseur);
    if (!complete && await evenementsCloudOntChange(client)) {
      const r = await reconcilierJournal(client);
      if (r.ok) { recuesRepli = r.recues; await setMeta(CLE_N_EVENEMENTS, await compterEvenementsCloud(client)); }
    }
    const toutes = [...neuves, ...recuesRepli];
    const cartesMaj = toutes.length ? await appliquerJournalAuxCartes(toutes.map((e) => e.card_id)) : 0;
    const derniere = new Date().toISOString();
    await setMeta(CLE_DERNIERE, derniere);
    poser({ enCours: false, derniere, erreur: null, tableAbsente, envoyees, recues: toutes.length });
    return { ok: true, envoyees, recues: toutes.length, cartesMaj, tableAbsente };
  } catch (e) {
    poser({ enCours: false, erreur: String((e && e.message) || e) });
    return { ok: false, erreur: String(e) };
  }
}

/* nombre d'événements du canal de repli au serveur (lecture légère), pour savoir s'il faut relire par ids */
const CLE_N_EVENEMENTS = 'journal.nEvenementsCloud';
async function compterEvenementsCloud(client) {
  try {
    const { count, error } = await client.from('medrevise_records').select('record_id', { count: 'exact', head: true }).eq('store', STORE_EVENEMENTS);
    return error ? null : (count ?? null);
  } catch (e) { return null; }
}
async function evenementsCloudOntChange(client) {
  const n = await compterEvenementsCloud(client);
  return n === null ? true : n !== (await getMeta(CLE_N_EVENEMENTS));
}

// envoi automatique peu après chaque réponse (hors ligne : la file attend la prochaine passe)
let minuteur = null;
if (typeof window !== 'undefined') {
  surChangementJournal(() => {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => { if (typeof navigator === 'undefined' || navigator.onLine !== false) synchroniserJournal(); }, 3000);
  });
}
