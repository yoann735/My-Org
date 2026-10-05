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

/* ---- mots-clés du cours ----
   Enregistrement 'kt:' + courseId : { terms (liste envoyée), manuels, decoches, connus }
   (v1.1, voir keyterms.js#selectionner). Un enregistrement v1 n'a que `terms` :
   ces termes, choisis à la main, deviennent les « manuels ». */
export async function lireMotsClesMemo(courseId) {
  const r = await getOne(STORE, 'kt:' + courseId);
  if (!r) return { manuels: [], decoches: [], connus: [], terms: [] };
  if (!Array.isArray(r.manuels)) return { manuels: r.terms || [], decoches: [], connus: [], terms: r.terms || [] };
  return { manuels: r.manuels, decoches: r.decoches || [], connus: r.connus || [], terms: r.terms || [] };
}
export async function lireMotsCles(courseId) {
  return (await lireMotsClesMemo(courseId)).terms;
}
/** @param {{terms, manuels, decoches, connus}} memo */
export async function ecrireMotsCles(courseId, memo) {
  const r = await put(STORE, {
    id: 'kt:' + courseId, kind: 'keyterms', courseId,
    terms: memo.terms || [], manuels: memo.manuels || [], decoches: memo.decoches || [], connus: memo.connus || [],
    updatedAt: new Date().toISOString(),
  });
  pousser(r.id).catch(() => {});
  return r;
}
/** Modification EN SESSION (liste complète envoyée) : un terme ajouté devient manuel,
 *  un terme retiré quitte les manuels ou passe dans les décochés. */
export async function ecrireMotsClesSession(courseId, termes) {
  const memo = await lireMotsClesMemo(courseId);
  const k = (t) => String(t).replace(/\s+/g, ' ').trim().toLocaleLowerCase('fr');
  const avant = new Set(memo.terms.map(k)), apres = new Set(termes.map(k));
  const manuels = [...memo.manuels.filter((t) => apres.has(k(t))), ...termes.filter((t) => !avant.has(k(t)) && !memo.manuels.some((m) => k(m) === k(t)))];
  const decoches = [...new Set([...memo.decoches.map(k), ...memo.terms.filter((t) => !apres.has(k(t))).map(k)])].filter((x) => !apres.has(x));
  return ecrireMotsCles(courseId, { ...memo, terms: termes, manuels, decoches });
}
