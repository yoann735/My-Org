/* ============================================================
   MedRevise — MIGRATION des données stockées vers le schéma v1.0.
   Unique, versionnée, NON DESTRUCTIVE :
   - sauvegarde des questions d'origine dans le store `backups` ;
   - conversion de chaque question legacy en item "superset" (v1.0 + champs
     legacy conservés → l'app continue de fonctionner jusqu'à l'Étape 2) ;
   - marqueur en base pour ne JAMAIS rejouer une migration déjà appliquée.
   ============================================================ */
import { getAll, putMany, getMeta, setMeta, putBackup } from './storage.js';
import { toInternalItem, isLegacyItem } from './adapter.js';

const MIGRATIONS_KEY = 'migrations';
const MIG_V1 = 'items-v1.0';
const MIG_DOCS = 'documents-v2';
const MIG_ANAT_IMG = 'anat-images-v1';

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

  let migrated = 0;
  const out = (questions || []).map((q) => {
    if (!q || q._schema === '1.0') return q;           // déjà au format interne v1.0
    const internal = toInternalItem(q);                // legacy OU v1.0 → superset
    if (!internal) return q;                            // item illisible : laissé intact (non destructif)
    if (isLegacyItem(q) || !q._schema) migrated++;
    return internal;
  });
  if (out.length) await putMany('questions', out);

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

/** point d'entrée bootstrap : applique toutes les migrations en attente */
export async function runMigrations() {
  const items = await migrateItemsToV1();
  const documents = await migrateDocumentsV2();
  const anatImages = await migrateAnatImagesV1();
  return { items, documents, anatImages };
}
