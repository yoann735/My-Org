/* ============================================================
   MedRevise — TRANSCRIPTION EN DIRECT : enregistrements IndexedDB.

   Store `transcript_session` (lib/storage.js), deux sortes d'enregistrements :
   - SESSION  { id, kind:'session', courseId, startedAt, endedAt, source,
                keyterms[], segments[{id,t0,t1,text,status}], notes[{id,t,text}],
                fontSize, durationS, createdAt, updatedAt }
       status d'un segment : 'final' (validé par Deepgram) | 'uncertain'
       (texte provisoire figé au moment d'une coupure). `endedAt: null` = session
       en cours — ou interrompue (onglet rechargé, plantage) : proposée en reprise.
   - MOTS-CLÉS { id:'kt:'+courseId, kind:'keyterms', courseId, terms[], updatedAt }

   Écriture : `ecrireSession` est appelée à CHAQUE segment validé. Les appels
   sont sérialisés et fusionnés (au plus une écriture en vol + une en attente,
   qui prend toujours le dernier état) : jamais deux écritures concurrentes qui
   se doubleraient dans le désordre, et jamais de retard qui s'accumule.
   ============================================================ */
import { genId, getAll, getOne, put, remove, putBackup } from '../lib/storage.js';
import { pousser } from './synchro.js';

const STORE = 'transcript_session';

export const nouvelId = () => genId('ts');
export const nouvelIdSegment = () => genId('sg');
export const nouvelIdNote = () => genId('nt');

export function nouvelleSession({ courseId, source, keyterms, fontSize }) {
  const maintenant = new Date().toISOString();
  return {
    id: nouvelId(), kind: 'session', courseId, startedAt: maintenant, endedAt: null,
    source: source || 'micro', keyterms: keyterms || [], segments: [], notes: [],
    fontSize: fontSize || 'm', durationS: 0, createdAt: maintenant, updatedAt: maintenant,
  };
}

/* ---- écriture sérialisée et fusionnée ---- */
let enVol = null;
let enAttente = null;
async function ecrireMaintenant(rec) {
  const stamped = { ...rec, updatedAt: new Date().toISOString() };
  await put(STORE, stamped);
  return stamped;
}
export function ecrireSession(rec) {
  if (enVol) { enAttente = rec; return enVol; }
  enVol = (async () => {
    try {
      let r = await ecrireMaintenant(rec);
      while (enAttente) { const suivant = enAttente; enAttente = null; r = await ecrireMaintenant(suivant); }
      return r;
    } finally { enVol = null; }
  })();
  return enVol;
}
/** Attend que toutes les écritures en cours soient faites. */
export async function viderEcritures() {
  while (enVol) { try { await enVol; } catch (e) { /* l'erreur a déjà été vue */ } }
}

export async function sessionsDuCours(courseId) {
  const tout = (await getAll(STORE)) || [];
  return tout.filter((r) => r && r.kind === 'session' && r.courseId === courseId)
    .sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
}
export const lireSession = (id) => getOne(STORE, id);

/** Session restée ouverte pour ce cours (onglet rechargé/fermé, plantage). */
export async function sessionInterrompue(courseId) {
  return (await sessionsDuCours(courseId)).find((s) => !s.endedAt) || null;
}

/** Clôture une session interrompue sans la reprendre. */
export async function cloreSession(rec) {
  await viderEcritures();
  const fin = rec.endedAt || dateFinEstimee(rec);
  const r = await ecrireMaintenant({ ...rec, endedAt: fin });
  pousser(r.id).catch(() => {});
  return r;
}
function dateFinEstimee(rec) {
  const debut = Date.parse(rec.startedAt || rec.createdAt || '') || Date.now();
  const d = Math.max(rec.durationS || 0, ...(rec.segments || []).map((s) => s.t1 || 0));
  return new Date(Math.max(debut + d * 1000, Date.parse(rec.updatedAt || '') || 0)).toISOString();
}

/** Suppression : sauvegarde locale (putBackup) PUIS suppression. */
export async function supprimerSession(rec) {
  await putBackup(`pre-delete-transcript-${rec.id}-${Date.now()}`, rec);
  await remove(STORE, rec.id);
  pousser(rec.id, { supprime: true }).catch(() => {}); // tombstone : ne ressuscite pas via un autre appareil
}

/* ---- mots-clés du cours ---- */
export async function lireMotsCles(courseId) {
  const r = await getOne(STORE, 'kt:' + courseId);
  return (r && Array.isArray(r.terms)) ? r.terms : [];
}
export async function ecrireMotsCles(courseId, terms) {
  const r = await put(STORE, { id: 'kt:' + courseId, kind: 'keyterms', courseId, terms: terms || [], updatedAt: new Date().toISOString() });
  pousser(r.id).catch(() => {});
  return r;
}
