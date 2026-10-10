// Données réelles pour les tests : COPIE en mémoire de la sauvegarde pre-fsrs-2026-10-10 (lecture seule,
// hors dépôt). Chemin surchargeable par FSRS_SAUVEGARDE. Absente → les tests qui en dépendent sont sautés.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const SAUVEGARDE = process.env.FSRS_SAUVEGARDE || resolve(process.cwd(), '..', 'backups', 'pre-fsrs-2026-10-10');
export const sauvegardePresente = existsSync(join(SAUVEGARDE, 'idb', 'index.json'));

export function lireStore(db) {
  const ix = JSON.parse(readFileSync(join(SAUVEGARDE, 'idb', 'index.json'), 'utf8'));
  const b = ix.bases.find((x) => x.db === db);
  if (!b) return [];
  return b.stores[0].fichiers.flatMap((f) => JSON.parse(readFileSync(join(SAUVEGARDE, f.fichier), 'utf8')).entries.map((e) => e[1]));
}

/** copie profonde indépendante (aucune écriture possible sur les fichiers) */
export function chargerDb() {
  const db = {
    sources: lireStore('medrevise-sources'), matieres: lireStore('medrevise-matieres'),
    fiches: lireStore('medrevise-fiches'), questions: lireStore('medrevise-questions'), dossiers: lireStore('medrevise-dossiers'),
  };
  return JSON.parse(JSON.stringify(db));
}
