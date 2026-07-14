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

/** point d'entrée bootstrap : applique toutes les migrations en attente */
export async function runMigrations() {
  const res = await migrateItemsToV1();
  return { items: res };
}
