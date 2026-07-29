/* ============================================================
   MedRevise — MIGRATION des données stockées vers le schéma v1.0.
   Unique, versionnée, NON DESTRUCTIVE :
   - sauvegarde des questions d'origine dans le store `backups` ;
   - conversion de chaque question legacy en item "superset" (v1.0 + champs
     legacy conservés → l'app continue de fonctionner jusqu'à l'Étape 2) ;
   - marqueur en base pour ne JAMAIS rejouer une migration déjà appliquée.
   ============================================================ */
import { getAll, putMany, getMeta, setMeta, putBackup, remove } from './storage.js';
import { toInternalItem } from './adapter.js';
import { pullAllRecords, pushTombstonesNow } from '../data/sync.js';

const MIGRATIONS_KEY = 'migrations';
const MIG_V1 = 'items-v1.0';
const MIG_DOCS = 'documents-v2';
const MIG_ANAT_IMG = 'anat-images-v1';
const MIG_ORPHANS = 'orphan-cleanup-v1';
const MIG_DEMO_ZOMBIES = 'demo-zombies-cleanup-v1';

// IDs fixes du seed de démo (lib/storage.js:194-203) — voir docs/audit-sync-mobile.md §3.1 :
// une course de réensemencement historique (déjà corrigée via canSeed) a pu faire gagner
// ces enregistrements en LWW contre une suppression antérieure, corrompant durablement le
// cloud. En dur, jamais dynamique : garantit qu'on ne touche QUE ces ID précis.
const DEMO_SOURCE_ID = 'fac';
const DEMO_MATIERE_IDS = ['physio', 'anat'];
const DEMO_FICHE_IDS = ['f-resp', 'f-ab', 'f-ms'];

/** liste des migrations déjà appliquées */
async function appliedList() {
  const list = await getMeta(MIGRATIONS_KEY);
  return Array.isArray(list) ? list : [];
}

/**
 * Migration items → v1.0. Idempotente (garde-fou via marqueur + par item).
 * @returns {{ran:boolean, migrated?:number, total?:number}}
 */
export async function migrateItemsToV1() {
  const applied = await appliedList();
  if (applied.includes(MIG_V1)) return { ran: false };

  const questions = await getAll('questions');
  // sauvegarde intégrale avant toute écriture (restaurable)
  await putBackup('questions-pre-' + MIG_V1, questions || []);

  // seuls les items EFFECTIVEMENT convertis sont réécrits : putMany re-timestampe
  // (updatedAt) et pousse au cloud chaque enregistrement qu'on lui donne — repousser
  // en masse des items déjà v1.0 sans changement réel n'a aucun intérêt et, pire,
  // peut ressusciter côté cloud une suppression faite entre-temps sur un autre
  // appareil (le nouveau timestamp gagnerait la comparaison LWW face à un tombstone
  // plus ancien). Voir l'audit de synchro pour le détail de ce risque.
  const changed = [];
  const out = (questions || []).map((q) => {
    if (!q || q._schema === '1.0') return q;           // déjà au format interne v1.0
    const internal = toInternalItem(q);                // legacy OU v1.0 → superset
    if (!internal) return q;                            // item illisible : laissé intact (non destructif)
    changed.push(internal);
    return internal;
  });
  const migrated = changed.length;
  if (changed.length) await putMany('questions', changed);

  await setMeta(MIGRATIONS_KEY, [...applied, MIG_V1]);
  return { ran: true, migrated, total: out.length };
}

/**
 * Refonte « Documents » (onglet unifié Fiche/Schéma/Transcript).
 * NON DESTRUCTIVE : aucun champ n'est déplacé ni supprimé — les PDF, surlignages,
 * blocs de texte édités et schémas d'anatomie existants restent lus tels quels par
 * la nouvelle architecture. On se contente de SAUVEGARDER l'état avant bascule
 * (filet de sécurité restaurable) et de poser un marqueur. Idempotente.
 */
export async function migrateDocumentsV2() {
  const applied = await appliedList();
  if (applied.includes(MIG_DOCS)) return { ran: false };

  const [fiches, highlights, annotations, structures] = await Promise.all([
    getAll('fiches'), getAll('highlights'), getAll('annotations'), getAll('structures'),
  ]);
  await putBackup('pre-' + MIG_DOCS, { fiches, highlights, annotations, structures });

  await setMeta(MIGRATIONS_KEY, [...applied, MIG_DOCS]);
  return { ran: true, fiches: (fiches || []).length, highlights: (highlights || []).length };
}

/**
 * Schémas d'anatomie MULTI-VUES (anat-images-v1). NON DESTRUCTIVE : chaque fiche
 * `anat_schema` sans `images[]` reçoit une vue unique « Non précisée » construite à
 * partir de ses champs simples (imageId/imageW/imageH/coches), qui RESTENT en place
 * (miroir de la 1re vue). Sauvegarde préalable + marqueur idempotent.
 */
export async function migrateAnatImagesV1() {
  const applied = await appliedList();
  if (applied.includes(MIG_ANAT_IMG)) return { ran: false };

  const fiches = await getAll('fiches');
  const schemas = (fiches || []).filter((f) => f && f.type === 'anat_schema' && !Array.isArray(f.images));
  await putBackup('pre-' + MIG_ANAT_IMG, schemas);

  const out = schemas.map((f) => ({
    ...f,
    images: [{
      id: 'img-' + f.id, imageId: f.imageId || null,
      imageW: f.imageW || null, imageH: f.imageH || null,
      vue: 'non_precisee', coches: f.coches || [],
    }],
  }));
  if (out.length) await putMany('fiches', out);

  await setMeta(MIGRATIONS_KEY, [...applied, MIG_ANAT_IMG]);
  return { ran: true, migrated: out.length };
}

/**
 * Nettoyage des enregistrements ORPHELINS (questions/highlights/annotations/
 * docs/notes d'exercice dont la fiche — ou la question, pour les notes — a
 * disparu). NON DESTRUCTIF : sauvegarde intégrale avant purge (restaurable
 * depuis `backups`). Le hard-delete via remove() pousse un tombstone cloud,
 * donc ce nettoyage se propage à tous les appareils. Idempotente : tourne à
 * vide dès la 2e fois (rien à trouver une fois les vrais orphelins purgés).
 */
export async function migrateOrphanCleanupV1() {
  const applied = await appliedList();
  if (applied.includes(MIG_ORPHANS)) return { ran: false };

  const [fiches, questions, highlights, annotations, docs, exos] = await Promise.all([
    getAll('fiches'), getAll('questions'), getAll('highlights'), getAll('annotations'), getAll('docs'), getAll('exos'),
  ]);
  const ficheIds = new Set((fiches || []).map((f) => f.id));
  const questionIds = new Set((questions || []).map((q) => q.id));

  const orphanQuestions = (questions || []).filter((q) => q && q.ficheId && !ficheIds.has(q.ficheId));
  const orphanHighlights = (highlights || []).filter((h) => h && h.ficheId && !ficheIds.has(h.ficheId));
  const orphanAnnotations = (annotations || []).filter((a) => a && a.ficheId && !ficheIds.has(a.ficheId));
  const orphanDocs = (docs || []).filter((d) => d && d.id && !ficheIds.has(d.id));
  const orphanExos = (exos || []).filter((e) => e && e.id && !questionIds.has(e.id));

  const purged = orphanQuestions.length + orphanHighlights.length + orphanAnnotations.length + orphanDocs.length + orphanExos.length;
  if (purged) {
    await putBackup('pre-' + MIG_ORPHANS, { orphanQuestions, orphanHighlights, orphanAnnotations, orphanDocs, orphanExos });
    await Promise.all([
      ...orphanQuestions.map((q) => remove('questions', q.id)),
      ...orphanHighlights.map((h) => remove('highlights', h.id)),
      ...orphanAnnotations.map((a) => remove('annotations', a.id)),
      ...orphanDocs.map((d) => remove('docs', d.id)),
      ...orphanExos.map((e) => remove('exos', e.id)),
    ]);
  }

  await setMeta(MIGRATIONS_KEY, [...applied, MIG_ORPHANS]);
  return { ran: true, purged };
}

/**
 * Nettoyage PONCTUEL des fiches de démo à ID fixe (fac/physio/anat/f-resp/f-ab/f-ms,
 * voir docs/audit-sync-mobile.md §3.1/Risque 1). Pose de VRAIS tombstones
 * (deleted=true, remove() — storage.js:57-60), jamais un simple archive:true qui peut
 * se faire réécraser par LWW. Fonctionne que ces ID soient présents ou non EN LOCAL sur
 * cet appareil : remove() gère l'absence (no-op + tombstone quand même) ; les questions
 * liées, potentiellement connues UNIQUEMENT du cloud sur cet appareil (cas rapporté :
 * fiche déjà absente du local desktop), sont retrouvées via pullAllRecords, pas via un
 * simple scan local. NON DESTRUCTIF : sauvegarde intégrale avant purge (locale + ce
 * qu'on a vu côté cloud). Garde-fou : ne supprime le cours/les matières de démo QUE si
 * rien d'AUTRE ne s'y rattache (sinon on orphelinerait du vrai contenu dans l'arbre) —
 * les fiches de démo elles-mêmes sont nettoyées dans tous les cas.
 * Marque la migration appliquée SEULEMENT si le tombstone a RÉELLEMENT été poussé
 * (pushTombstonesNow, awaited) — sinon nouvel essai complet au prochain lancement
 * (idempotent : rejouer remove()/re-pousser un tombstone déjà posé ne casse rien).
 */
export async function migrateDemoZombiesCleanup() {
  const applied = await appliedList();
  if (applied.includes(MIG_DEMO_ZOMBIES)) return { ran: false };

  const [fiches, matieres, sources, questions, cloudRows] = await Promise.all([
    getAll('fiches'), getAll('matieres'), getAll('sources'), getAll('questions'), pullAllRecords(),
  ]);
  const cloud = cloudRows || []; // pullAllRecords() → null si hors-ligne/non configuré

  const otherMatieresUnderFac = (matieres || []).filter((m) => m.sourceId === DEMO_SOURCE_ID && !DEMO_MATIERE_IDS.includes(m.id));
  const otherFichesUnderDemoMat = (fiches || []).filter((f) => DEMO_MATIERE_IDS.includes(f.matiereId) && !DEMO_FICHE_IDS.includes(f.id));
  const safeToRemoveContainers = otherMatieresUnderFac.length === 0 && otherFichesUnderDemoMat.length === 0;

  const existsLocallyOrCloud = (store, id) => (
    (store === 'sources' ? (sources || []) : store === 'matieres' ? (matieres || []) : (fiches || [])).some((r) => r.id === id)
    || cloud.some((r) => r.store === store && r.record_id === id && !r.deleted)
  );
  const targetFicheIds = DEMO_FICHE_IDS.filter((id) => existsLocallyOrCloud('fiches', id));
  const targetContainerIds = safeToRemoveContainers
    ? [
      ...(existsLocallyOrCloud('sources', DEMO_SOURCE_ID) ? [DEMO_SOURCE_ID] : []),
      ...DEMO_MATIERE_IDS.filter((id) => existsLocallyOrCloud('matieres', id)),
    ]
    : [];

  // questions liées : union LOCAL + CLOUD (l'ID peut n'exister QUE côté cloud ici).
  const localDemoQuestions = (questions || []).filter((q) => DEMO_FICHE_IDS.includes(q.ficheId));
  const cloudDemoQuestionRows = cloud.filter((r) => r.store === 'questions' && !r.deleted && r.data && DEMO_FICHE_IDS.includes(r.data.ficheId));
  const questionIds = [...new Set([...localDemoQuestions.map((q) => q.id), ...cloudDemoQuestionRows.map((r) => r.record_id)])];

  if (!targetFicheIds.length && !targetContainerIds.length && !questionIds.length) {
    // rien à faire nulle part (déjà propre, ou jamais corrompu sur ce compte) — marque
    // quand même appliqué pour ne pas rescanner à chaque lancement.
    await setMeta(MIGRATIONS_KEY, [...applied, MIG_DEMO_ZOMBIES]);
    return { ran: true, applied: true, purgedFiches: 0, purgedQuestions: 0, purgedContainers: 0 };
  }

  await putBackup('pre-' + MIG_DEMO_ZOMBIES, {
    sources: (sources || []).filter((s) => s.id === DEMO_SOURCE_ID),
    matieres: (matieres || []).filter((m) => DEMO_MATIERE_IDS.includes(m.id)),
    fiches: (fiches || []).filter((f) => DEMO_FICHE_IDS.includes(f.id)),
    cloudOnlyFicheData: DEMO_FICHE_IDS
      .filter((id) => !(fiches || []).some((f) => f.id === id))
      .map((id) => cloud.find((r) => r.store === 'fiches' && r.record_id === id))
      .filter(Boolean),
    questions: [...localDemoQuestions, ...cloudDemoQuestionRows.map((r) => r.data)],
    safeToRemoveContainers,
  });

  // 1) suppression locale (no-op si absent) + mise en file du push habituel — chemin
  //    identique à toute autre suppression de l'app (remove(), storage.js:57-60).
  await Promise.all([
    ...(targetContainerIds.includes(DEMO_SOURCE_ID) ? [remove('sources', DEMO_SOURCE_ID)] : []),
    ...targetContainerIds.filter((id) => DEMO_MATIERE_IDS.includes(id)).map((id) => remove('matieres', id)),
    ...targetFicheIds.map((id) => remove('fiches', id)),
    ...questionIds.map((id) => remove('questions', id)),
  ]);

  // 2) filet de fiabilité : mêmes tombstones repoussés en un lot IMMÉDIAT et AWAITÉ, en
  //    plus du debounce habituel — on ne marque la migration appliquée que si ce push
  //    a réellement abouti (voir pushTombstonesNow, data/sync.js).
  const now = new Date().toISOString();
  const tombstoneRow = (store, id) => ({ store, record_id: id, data: {}, updated_at: now, deleted: true });
  const rows = [
    ...(targetContainerIds.includes(DEMO_SOURCE_ID) ? [tombstoneRow('sources', DEMO_SOURCE_ID)] : []),
    ...targetContainerIds.filter((id) => DEMO_MATIERE_IDS.includes(id)).map((id) => tombstoneRow('matieres', id)),
    ...targetFicheIds.map((id) => tombstoneRow('fiches', id)),
    ...questionIds.map((id) => tombstoneRow('questions', id)),
  ];
  const pushed = await pushTombstonesNow(rows);
  if (!pushed) return { ran: true, applied: false, retry: true };

  await setMeta(MIGRATIONS_KEY, [...applied, MIG_DEMO_ZOMBIES]);
  return {
    ran: true, applied: true,
    purgedFiches: targetFicheIds.length, purgedQuestions: questionIds.length,
    purgedContainers: targetContainerIds.length, containersSkipped: !safeToRemoveContainers,
  };
}

/** point d'entrée bootstrap : applique toutes les migrations en attente */
export async function runMigrations() {
  const items = await migrateItemsToV1();
  const documents = await migrateDocumentsV2();
  const anatImages = await migrateAnatImagesV1();
  const orphans = await migrateOrphanCleanupV1();
  const demoZombies = await migrateDemoZombiesCleanup();
  return { items, documents, anatImages, orphans, demoZombies };
}
