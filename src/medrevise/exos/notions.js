/* ============================================================
   MedRevise — SECTION « EXOS » : les NOTIONS (25/11/2026, docs/compte-rendu-section-exos.md).

   Une notion = UN enregistrement du store synchronisé `exo_notion` (ajout seul, aucun autre store réécrit) :
     { id: 'en…', nom, coursId: <id d'une fiche de cours> | null,
       fiche: { id: 'ef…', fileId, nom, type: 'pdf' } | null,          ← la fiche PDF (0 ou 1)
       exercices: [{ id: 'ef…', fileId, nom, type: 'pdf' | 'html' }],   ← 0 à N, dans l'ordre affiché
       fichiersRetires: [{ …fichier, retireLe, raison }],                ← retirés / remplacés : récupérables
       creeLe, updatedAt (posé par put) }
   Les FICHIERS passent par le canal des blobs existant (putBlob → envoi au cloud, copie locale, audit, sauvegarde).
   Les ANNOTATIONS d'un PDF vivent dans `highlights` / `annotations` avec ficheId = nsFichier(fichier) = 'exo:<id>'
   — clé d'espace de noms, comme les documents de notes. Un fichier remplacé reçoit un NOUVEL id : l'ancien garde
   son espace (ses annotations ne sont jamais effacées) et passe dans `fichiersRetires`, d'où on peut le remettre.
   Suppression d'une notion : putBackup (notion + annotations de ses fichiers) puis tombstone de la notion seule.
   ============================================================ */
import { getAll, getOne, put, remove, putBlob, putBackup, genId } from '../lib/storage.js';
import { garderVersion } from '../lib/historiqueDoc.js';

export const STORE = 'exo_notion';
export const nsFichier = (f) => 'exo:' + f.id;

export const estHtml = (file) => /html?$/i.test((file && file.name) || '') || /text\/html/i.test((file && file.type) || '');
export const estPdf = (file) => /\.pdf$/i.test((file && file.name) || '') || (file && file.type) === 'application/pdf';
/** « Exercices-chap-3_v2.html » → « Exercices chap 3 v2 » (tirets et soulignés → espaces) */
export function nomLisible(nom) {
  const s = String(nom || '').replace(/\.(pdf|html?)$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Fichier';
}

export const lireNotions = async () => ((await getAll(STORE)) || []).filter((n) => n && n.id && !n.deleted);
export const lireNotion = (id) => getOne(STORE, id);

/** fichier importé → entrée de notion (le blob part dans le canal des fichiers) */
export async function importerFichier(file) {
  const type = estHtml(file) ? 'html' : estPdf(file) ? 'pdf' : null;
  if (!type) throw new Error('Format non pris en charge : ' + (file && file.name));
  const fileId = await putBlob(file);
  return { id: genId('ef'), fileId, nom: nomLisible(file.name), nomFichier: file.name, type, ajouteLe: new Date().toISOString() };
}

export const fichiersDe = (n) => [...(n && n.fiche ? [n.fiche] : []), ...((n && n.exercices) || [])];

/** nombre d'annotations (surlignages + objets) posées sur un fichier */
export async function compterAnnotations(fichier) {
  if (!fichier || fichier.type !== 'pdf') return 0;
  const ns = nsFichier(fichier);
  const [h, a] = await Promise.all([getAll('highlights'), getAll('annotations')]);
  return (h || []).filter((x) => x.ficheId === ns && !x.deleted).length + (a || []).filter((x) => x.ficheId === ns && !x.deleted).length;
}
async function annotationsDe(fichiers) {
  const ns = new Set(fichiers.filter((f) => f.type === 'pdf').map(nsFichier));
  if (!ns.size) return { highlights: [], annotations: [] };
  const [h, a] = await Promise.all([getAll('highlights'), getAll('annotations')]);
  return { highlights: (h || []).filter((x) => ns.has(x.ficheId)), annotations: (a || []).filter((x) => ns.has(x.ficheId)) };
}

export async function creerNotion({ nom, coursId = null, fiche = null, exercices = [] }) {
  const n = { id: genId('en'), nom: String(nom).trim(), coursId: coursId || null, fiche: fiche || null, exercices: exercices || [], fichiersRetires: [], creeLe: new Date().toISOString() };
  return put(STORE, n);
}

/**
 * Enregistre une notion modifiée. Tout fichier présent avant et absent après (retiré ou remplacé) passe dans
 * `fichiersRetires` ; s'il portait des annotations : putBackup (fichier + annotations) et une version dans
 * l'Historique de son document AVANT l'écriture. Les annotations elles-mêmes ne sont jamais supprimées.
 */
export async function enregistrerNotion(avant, apres) {
  const restants = new Set(fichiersDe(apres).map((f) => f.id));
  const partis = fichiersDe(avant).filter((f) => !restants.has(f.id));
  const remplaceParId = new Map();
  if (avant.fiche && apres.fiche && avant.fiche.id !== apres.fiche.id) remplaceParId.set(avant.fiche.id, true);
  if (partis.length) {
    const ann = await annotationsDe(partis);
    await putBackup(`pre-retrait-exos-${avant.id}-${Date.now()}`, { notion: avant, fichiers: partis, ...ann });
    for (const f of partis) if (f.type === 'pdf') await garderVersion(nsFichier(f), 'Fichier retiré de la notion « ' + avant.nom + ' »', { force: true }).catch(() => {});
  }
  const maintenant = new Date().toISOString();
  const dejaRetires = (apres.fichiersRetires || avant.fichiersRetires || []).filter((r) => !restants.has(r.id));
  const rec = {
    ...apres,
    nom: String(apres.nom).trim(),
    fichiersRetires: [...dejaRetires, ...partis.filter((f) => !dejaRetires.some((r) => r.id === f.id)).map((f) => ({ ...f, retireLe: maintenant, raison: remplaceParId.has(f.id) ? 'remplacé' : 'retiré', role: avant.fiche && avant.fiche.id === f.id ? 'fiche' : 'exercice' }))],
  };
  return put(STORE, rec);
}

/** supprime une notion (après confirmation côté écran) : putBackup complet, puis tombstone de la notion */
export async function supprimerNotion(notion) {
  const tous = [...fichiersDe(notion), ...(notion.fichiersRetires || [])];
  const ann = await annotationsDe(tous);
  await putBackup(`pre-delete-notion-exos-${notion.id}-${Date.now()}`, { notion, ...ann });
  for (const f of tous) if (f.type === 'pdf') await garderVersion(nsFichier(f), 'Notion « ' + notion.nom + ' » supprimée', { force: true }).catch(() => {});
  await remove(STORE, notion.id);
}

/** date de modification affichée : la plus récente de la notion */
export const dateModif = (n) => n.updatedAt || n.creeLe || null;
