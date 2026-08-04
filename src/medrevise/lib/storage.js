/* ============================================================
   MedRevise — stockage IndexedDB (via idb-keyval).
   Données + blobs (images d'anatomie, PDF sources) — bien trop gros
   pour localStorage. Chaque "table" = un petit store clé→enregistrement.
   Hiérarchie : SOURCE(cours) → MATIÈRE → FICHE → QUESTIONS / STRUCTURES.
   ============================================================ */
import { get, set, del, values, setMany, createStore } from 'idb-keyval';
import { isoDate, startAdaptive, dueDateForJalon } from './sm2.js';
import { queuePush, pullAllRecords, pushBlob, pullBlob, flushOutbox } from '../data/sync.js';
import { SYNC_ENABLED } from '../data/supabaseClient.js';

const store = (name) => createStore('medrevise-' + name, 'v1');
const S = {
  sources: store('sources'),
  matieres: store('matieres'),
  fiches: store('fiches'),
  questions: store('questions'),
  structures: store('structures'),
  highlights: store('highlights'),
  annotations: store('annotations'),
  blobs: store('blobs'),
  stats: store('stats'),
  meta: store('meta'),       // marqueurs de migration (schéma v1.0)
  backups: store('backups'), // sauvegardes non destructives avant migration
  exos: store('exos'),       // bloc-notes (brouillon) persisté par exercice
  docs: store('docs'),       // contenu TipTap des transcripts (clé = ficheId)
  anatstruct: store('anatstruct'), // fiches de structure anatomique (théorie, champs typés)
  sessionsLog: store('sessionsLog'), // un point par série QCM/flashcard terminée (écran de fin, graphique d'évolution)
  prompts: store('prompts'), // surcharges des 4 prompts "Voir les prompts" (vue cours), voir lib/coursePrompts.js
};

// A — SYNCHRO CLOUD : stores dont les enregistrements suivent l'utilisateur d'un
// appareil à l'autre (voir data/sync.js). `meta`/`backups` restent locaux (détails
// d'implémentation d'un appareil donné) ; `blobs` a son propre canal (Storage, pas la
// table `medrevise_records` — trop gros pour du JSONB), voir putBlob/getBlob plus bas.
// `sessionsLog` est syncable pour la même raison que `questions`/`stats` : la
// tendance affichée en fin de série doit refléter l'activité desktop ET mobile,
// pas seulement cet appareil.
const SYNCABLE = ['sources', 'matieres', 'fiches', 'questions', 'structures', 'highlights', 'annotations', 'stats', 'exos', 'docs', 'anatstruct', 'sessionsLog', 'prompts'];

export function genId(prefix = 'x') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ---- generic CRUD (horodate + met en file la synchro cloud pour les stores
   SYNCABLE ; IndexedDB reste écrit en premier et fait foi en local même hors-ligne) ---- */
export const getAll = (name) => values(S[name]);
export const getOne = (name, id) => get(id, S[name]);
export async function put(name, rec) {
  const stamped = SYNCABLE.includes(name) ? { ...rec, updatedAt: new Date().toISOString() } : rec;
  await set(stamped.id, stamped, S[name]);
  if (SYNCABLE.includes(name)) queuePush(name, stamped.id, stamped, stamped.updatedAt);
  return stamped;
}
export async function putMany(name, recs) {
  const syncable = SYNCABLE.includes(name);
  const stamped = syncable ? recs.map((r) => ({ ...r, updatedAt: new Date().toISOString() })) : recs;
  await setMany(stamped.map((r) => [r.id, r]), S[name]);
  if (syncable) stamped.forEach((r) => queuePush(name, r.id, r, r.updatedAt));
  return stamped;
}
export async function remove(name, id) {
  await del(id, S[name]);
  if (SYNCABLE.includes(name)) queuePush(name, id, {}, new Date().toISOString(), true); // tombstone (data vide, deleted=true)
}

/* ---- blobs (images recadrées, PDF) — Storage cloud (pas la table de records :
   trop gros pour du JSONB). Upload best-effort en tâche de fond (n'attend pas le
   réseau) ; téléchargement paresseux à la première lecture manquante localement
   (évite de re-télécharger toutes les images à chaque réconciliation). ---- */
export async function putBlob(blob) {
  const id = genId('b');
  await set(id, blob, S.blobs);
  pushBlob(id, blob); // fire-and-forget
  return id;
}
// écrase le contenu d'un blob EXISTANT, MÊME id (contrairement à putBlob) — sert
// l'auto-save du HTML de cours (PdfReader) : écrire "en place" pendant une session
// d'édition évite de faire changer fiche.htmlId à chaque tick de debounce (ce qui
// rechargerait l'iframe et perdrait l'édition en cours). Un seul putBlob (nouvel id)
// est fait au DÉBUT de la session d'édition (voir PdfReader) ; tous les autosaves
// suivants de cette même session passent par putBlobAt sur ce même id.
export async function putBlobAt(id, blob) {
  await set(id, blob, S.blobs);
  pushBlob(id, blob); // fire-and-forget
  return id;
}
export async function getBlob(id) {
  const local = await get(id, S.blobs);
  if (local) return local;
  const remote = await pullBlob(id);
  if (remote) await set(id, remote, S.blobs);
  return remote || undefined;
}
export async function blobURL(id) {
  if (!id) return null;
  const b = await getBlob(id);
  return b ? URL.createObjectURL(b) : null;
}

/* ---- surlignages PDF (Partie B) ---- */
export function newHighlight({ ficheId, page, texte, couleur, rects }) {
  return { id: genId('h'), ficheId, page, texte, couleur: couleur || 'jaune', rects: rects || [], createdAt: new Date().toISOString() };
}

/* ---- édition de texte PDF (Chantier 1) : couche superposée qui masque un bloc de
   texte d'origine (rectangle opaque) et affiche à la place un contenu riche
   (TipTap) éditable, pré-rempli avec le texte réel extrait de ce bloc.
   x,y,width,height normalisés [0,1] par rapport à la page. Le PDF d'origine
   n'est jamais modifié — couche superposée uniquement, réinitialisable. ---- */
export function newTextEdit({ ficheId, page, x, y, width, height, originalText, fontSize, fontFamily, content }) {
  return {
    id: genId('an'), ficheId, page, x, y, width, height,
    originalText, fontSize: fontSize || null, fontFamily: fontFamily || null,
    content: content || { type: 'doc', content: [{ type: 'paragraph', content: originalText ? [{ type: 'text', text: originalText }] : [] }] },
    createdAt: new Date().toISOString(),
  };
}

/* ---- meta (migrations) + backups (sauvegardes pré-migration) ---- */
export const getMeta = (key) => get(key, S.meta);
export const setMeta = (key, val) => set(key, val, S.meta);
export const putBackup = (key, val) => set(key, { key, when: new Date().toISOString(), data: val }, S.backups);
export const getBackup = (key) => get(key, S.backups);

/* ---- bloc-notes d'exercice (brouillon persisté par item) ---- */
export const getExoNote = (id) => get(id, S.exos);
export async function setExoNote(id, note) {
  const when = new Date().toISOString();
  const rec = { id, note, when, updatedAt: when };
  await set(id, rec, S.exos);
  queuePush('exos', id, rec, when);
}

/* ---- contenu riche d'un transcript (document TipTap, clé = ficheId) ---- */
export const getDoc = (ficheId) => get(ficheId, S.docs);
export async function setDoc(ficheId, content) {
  const updatedAt = new Date().toISOString();
  const rec = { id: ficheId, content, updatedAt };
  await set(ficheId, rec, S.docs);
  queuePush('docs', ficheId, rec, updatedAt);
}
export async function removeDoc(ficheId) {
  await del(ficheId, S.docs);
  queuePush('docs', ficheId, {}, new Date().toISOString(), true);
}

/* ---- stats (carte unique) ---- */
const DEFAULT_STATS = { streak: 0, dernierJourRevise: null, jokerUtilise: false, best: 0, activityDays: [], serieCollapsed: false };
export async function getStats() { return (await get('stats', S.stats)) || { ...DEFAULT_STATS }; }
export async function setStats(s) {
  const updatedAt = new Date().toISOString();
  const rec = { ...s, id: 'stats', updatedAt };
  await set('stats', rec, S.stats);
  queuePush('stats', 'stats', rec, updatedAt);
  return rec;
}

/* ---- surcharges des 4 prompts "Voir les prompts" (carte unique, même mécanique que
   stats) : seules les matières EFFECTIVEMENT éditées par l'utilisateur sont stockées
   ici (clé = id de matière, ex. "physique") — DEFAULT_PROMPTS (lib/coursePrompts.js)
   sert de secours pour les autres/à l'état initial. "Réinitialiser" = retirer la clé. */
export async function getCoursePrompts() { return (await get('prompts', S.prompts)) || {}; }
export async function setCoursePrompts(overrides) {
  const updatedAt = new Date().toISOString();
  const rec = { ...overrides, id: 'prompts', updatedAt };
  await set('prompts', rec, S.prompts);
  queuePush('prompts', 'prompts', rec, updatedAt);
  return rec;
}
/* ---- surcharges des 4 prompts PRATIQUE (exercices), même mécanique que
   ci-dessus — MÊME store `S.prompts` (déjà SYNCABLE), clé DISTINCTE
   ('exoPrompts' vs 'prompts') : deux enregistrements indépendants dans la
   même collection outbox, comme deux ids différents dans 'questions'. */
export async function getExoPrompts() { return (await get('exoPrompts', S.prompts)) || {}; }
export async function setExoPrompts(overrides) {
  const updatedAt = new Date().toISOString();
  const rec = { ...overrides, id: 'exoPrompts', updatedAt };
  await set('exoPrompts', rec, S.prompts);
  queuePush('prompts', 'exoPrompts', rec, updatedAt);
  return rec;
}

/* Item v1.0 (schéma unifié) → enregistrement planifiable en base. `item` est
   déjà un item "superset" (v1.0 + champs legacy) produit par toInternalItem().
   On lui donne une clé primaire neuve + son état initial méthode des J.
   `startDate` (YYYY-MM-DD, défaut aujourd'hui) : date de départ (J0) choisie
   à l'import (voir lib/import.js) — PEUT être dans le passé (cours déjà
   commencé dans la vraie vie) : startAdaptive (lib/sm2.js) pose alors
   directement `dueDate = startDate`, immédiatement "en retard" si passée
   (aucune position à calculer, contrairement à l'ancienne chronologie fixe).
   Seuls les types SCHEDULED (qcm/flashcard, voir planning.js SCHEDULED_TYPES)
   reçoivent `intervalDays`/`dueDate`/`capped`/`termine` — feynman est HORS
   méthode des J, il n'a ni dates ni intervalle à porter.
   Exercice : méthode des J PROPRE (Étape A, sm2.js dueDateForJalon) — UNE
   seule échéance (`dueDate`), traduite depuis le "jalon" fourni par le
   prompt de génération + CE MÊME `startDate` (même J0 que la théorie de la
   fiche, y compris passé). `item.jalon` absent/invalide → pas de `dueDate`,
   comportement legacy inchangé (toujours librement accessible). */
export function newItem(ficheId, item, startDate = isoDate()) {
  const scheduled = item.type === 'qcm' || item.type === 'flashcard';
  const dueDate = item.type === 'exercice' ? dueDateForJalon(item.jalon, startDate) : null;
  return {
    ...item,
    // clé primaire neuve (évite les collisions entre fiches) ; srcId conserve
    // l'id v1.0 d'origine du JSON → sert au dédoublonnage lors d'un ajout à une
    // fiche existante (mode Rattrapage).
    id: genId('q'), srcId: item.id || null, ficheId, type: item.type,
    // j0Date : "vrai" départ de la carte, posé UNE FOIS ici (ou à un "Décaler
    // le départ" explicite, voir MedReviseApp.jsx shiftSourceStart/
    // shiftFicheStart) — jamais retouché par advanceQuestion ensuite. Sert au
    // "vrai J+N depuis le début" du calendrier (sm2.js trueDaysSinceJ0),
    // distinct de intervalDays (délai jusqu'à la PROCHAINE échéance).
    ...(scheduled ? { ...startAdaptive(startDate), j0Date: startDate } : {}),
    ...(dueDate ? { dueDate } : {}),
    historique: [], missed: 0,
  };
}

/* carnet d'erreurs v2 (étape 2) : une V2 ("flashcard d'erreur") — type DISTINCT
   `flashcard_erreur`, jamais 'flashcard', pour rester exclue par construction
   de tout ce qui est indexé sur SCHEDULED_TYPES (planning.js) et du `scheduled`
   ci-dessus (newItem) : aucun `plan`/`cursor`, jamais dans le calendrier ni les
   compteurs du jour — même mécanisme que EXERCICE_TYPE, pas un cas particulier
   à ajouter dans les filtres existants. `ficheId: null` (ne vit dans aucun
   cours) ; `sourceErrorId` relie la V2 à sa V1 (flashcard normale, carnetAt
   non-null — voir Session.jsx/MobileSession.jsx étape 1). Pas d'historique/
   missed : aucun cycle, rien à cumuler. `statut` : 'a_revoir' (défaut) |
   'resolu' | 'pause'. `cloze`/`indice`/`a_retenir` : MÊME représentation que
   les flashcards v1.0 (schema.js normFlashcard) — voir lib/cloze.js#isCloze,
   étendu pour reconnaître aussi 'flashcard_erreur'. `angle` (optionnel,
   "coeur"|"piege"|"transfert" côté prompt externe) : purement informatif,
   affiché dans le tableau de bord, aucune valeur imposée ici. */
export function newErrorCard({ recto, verso, sourceErrorId, cloze, indice, a_retenir, angle }) {
  return {
    id: genId('q'), type: 'flashcard_erreur', ficheId: null,
    sourceErrorId, recto, verso,
    ...(cloze && cloze.length ? { cloze } : {}),
    indice: indice || null, a_retenir: a_retenir || '',
    ...(angle ? { angle } : {}),
    statut: 'a_revoir', createdAt: new Date().toISOString(),
  };
}

/* tout effacer (réglages → reset) — pousse aussi les suppressions en tombstones
   cloud (SYNCABLE) pour qu'un reset local ne se fasse pas silencieusement
   "annuler" par la réconciliation suivante (qui rapatrierait sinon les données
   encore présentes côté cloud). */
export async function wipeAll() {
  for (const name of Object.keys(S)) {
    const all = await getAll(name);
    const syncable = SYNCABLE.includes(name);
    await Promise.all((all || []).map((r) => {
      if (!r || !r.id) return null;
      if (syncable) queuePush(name, r.id, {}, new Date().toISOString(), true);
      return del(r.id, S[name]);
    }));
  }
  await del('stats', S.stats);
  queuePush('stats', 'stats', {}, new Date().toISOString(), true);
}

/* ============================================================
   PURGE DÉFINITIVE (corbeille → "Vider la corbeille" / suppression unitaire,
   Réglages). Contrairement à l'archivage (soft-delete restaurable, simple
   champ `archive`), ceci est un VRAI hard-delete : tombstone poussé au cloud
   (remove()) pour chaque enregistrement + toute sa descendance, afin de ne
   jamais laisser d'orphelins et de ne jamais pouvoir "revenir" via un autre
   appareil pas encore synchronisé. Irréversible — l'appelant est responsable
   de la confirmation utilisateur.
   ============================================================ */
export async function purgeFiche(ficheId) {
  const [questions, highlights, annotations] = await Promise.all([getAll('questions'), getAll('highlights'), getAll('annotations')]);
  await Promise.all([
    ...(questions || []).filter((q) => q.ficheId === ficheId).map((q) => Promise.all([remove('questions', q.id), remove('exos', q.id)])),
    ...(highlights || []).filter((h) => h.ficheId === ficheId).map((h) => remove('highlights', h.id)),
    ...(annotations || []).filter((a) => a.ficheId === ficheId).map((a) => remove('annotations', a.id)),
    removeDoc(ficheId),
  ]);
  await remove('fiches', ficheId);
}

export async function purgeMatiere(matiereId) {
  const [fiches, anatstruct] = await Promise.all([getAll('fiches'), getAll('anatstruct')]);
  await Promise.all([
    ...(fiches || []).filter((f) => f.matiereId === matiereId).map((f) => purgeFiche(f.id)),
    ...(anatstruct || []).filter((s) => s.matiereId === matiereId).map((s) => remove('anatstruct', s.id)),
  ]);
  await remove('matieres', matiereId);
}

export async function purgeSource(sourceId) {
  const matieres = await getAll('matieres');
  await Promise.all((matieres || []).filter((m) => m.sourceId === sourceId).map((m) => purgeMatiere(m.id)));
  await remove('sources', sourceId);
}

/* ============================================================
   A — RÉCONCILIATION CLOUD (LWW par enregistrement). Appelée au démarrage,
   à la reconnexion réseau et quand l'onglet redevient visible (voir
   MedReviseApp.jsx). Dataset personnel ≈ petit → un fetch complet de la
   table à chaque passage suffit (comme MealWeek), pas de curseur incrémental.
   Sans réseau / non configuré (pullAllRecords → null) : no-op, IndexedDB
   reste seul juge — jamais de plantage, jamais de perte locale.
   ============================================================ */
export async function reconcileAll() {
  const cloudRows = await pullAllRecords();
  if (cloudRows === null) return { ok: false, cloudEmpty: false };

  const byStore = new Map();
  for (const row of cloudRows) {
    if (!byStore.has(row.store)) byStore.set(row.store, new Map());
    byStore.get(row.store).set(row.record_id, row);
  }

  for (const name of SYNCABLE) {
    const cloudMap = byStore.get(name) || new Map();
    const localRecs = (await values(S[name])) || [];
    const localIds = new Set();

    for (const rec of localRecs) {
      if (!rec || !rec.id) continue;
      localIds.add(rec.id);
      const localTs = rec.updatedAt ? Date.parse(rec.updatedAt) : 0;
      const cloud = cloudMap.get(rec.id);
      if (!cloud) {
        // absent du cloud (première synchro de cet appareil, ou nouveau) → pousser.
        queuePush(name, rec.id, rec, rec.updatedAt || new Date().toISOString());
        continue;
      }
      const cloudTs = cloud.updated_at ? Date.parse(cloud.updated_at) : 0;
      if (cloud.deleted) {
        if (cloudTs >= localTs) await del(rec.id, S[name]); // tombstone plus récent → supprimer localement
        else queuePush(name, rec.id, rec, rec.updatedAt || new Date().toISOString()); // local plus récent → réhabiliter
      } else if (cloudTs > localTs) {
        await set(rec.id, cloud.data, S[name]); // cloud plus récent → adopter
      } else if (localTs > cloudTs) {
        queuePush(name, rec.id, rec, rec.updatedAt || new Date().toISOString()); // local plus récent → pousser
      }
    }

    // enregistrements présents côté cloud mais absents localement (nouveaux sur cet appareil).
    for (const [id, cloud] of cloudMap) {
      if (localIds.has(id) || cloud.deleted) continue;
      await set(id, cloud.data, S[name]);
    }
  }
  return { ok: true, cloudEmpty: cloudRows.length === 0 };
}

/* ============================================================
   B — RATTRAPAGE INCONDITIONNEL (filet de sécurité, indépendant de la
   comparaison ci-dessus). reconcileAll() ne remet en file un enregistrement
   local que s'il a pu comparer avec le cloud (pull réussi) ET a détecté un
   écart — un pull raté, ou un écart non détecté pour quelque raison que ce
   soit, laisse alors des écritures locales orphelines indéfiniment.
   queueAllLocalForPush() ne compare RIEN : il remet TOUT le local syncable
   dans l'outbox, sans condition. Idempotent et sans risque — un upsert
   identique ne change rien côté cloud — et le dataset personnel reste petit
   (comme MealWeek). Appelé par syncNow() (boot + bouton "Forcer la sync"),
   toujours APRÈS reconcileAll() : l'état local est alors déjà à jour avec le
   cloud, donc ce qu'on remet en file est forcément ce qu'il faut pousser
   (jamais une version qu'on vient tout juste d'écraser par plus récent).
   ============================================================ */
export async function queueAllLocalForPush() {
  for (const name of SYNCABLE) {
    const recs = (await values(S[name])) || [];
    for (const rec of recs) {
      if (!rec || !rec.id) continue;
      queuePush(name, rec.id, rec, rec.updatedAt || new Date().toISOString());
    }
  }
}

/* ============================================================
   C — SYNCHRO COMPLÈTE, POINT D'ENTRÉE UNIQUE. Rejoue l'outbox → réconcilie
   (pull + merge) → rattrape inconditionnellement tout le local → repousse
   immédiatement (sans attendre le debounce). Utilisée au boot ET par le
   bouton "Forcer la synchro" (Réglages desktop, accueil mobile) : mêmes
   garanties partout, jamais deux chemins différents à maintenir.
   Retourne un statut exploitable par l'UI plutôt qu'un booléen :
   'disabled' (sync non configurée — rien à faire, jamais une erreur),
   'offline' (pull cloud impossible cette fois — état local intact, retry
   au prochain déclencheur), 'ok' (pull + merge réussis).
   ============================================================ */
export async function syncNow() {
  if (!SYNC_ENABLED) return { status: 'disabled' };
  await flushOutbox();
  const rec = await reconcileAll();
  await queueAllLocalForPush();
  await flushOutbox();
  return { status: rec.ok ? 'ok' : 'offline', cloudEmpty: rec.cloudEmpty };
}
