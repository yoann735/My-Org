/* ============================================================
   MedRevise — modele « document » unifie pour l'onglet Documents.
   Un document = une fiche dont le type se resout en 3 MODES :
     - fiche       : PDF de cours (fiche.pdfId)
     - schema      : image d'anatomie annotee (type 'anat_schema')
     - transcript  : document texte riche (type 'transcript', contenu TipTap)
   Ne casse rien : reutilise les fiches existantes, ajoute seulement le type
   'transcript' et un store `docs` (contenu TipTap).
   ============================================================ */
import { genId, put, remove, removeDoc, setDoc } from '../../lib/storage.js';
import { todayISO } from '../../lib/sm2.js';

/** derive le MODE d'affichage d'une fiche (null = pas un document ouvrable).
    'fiche' couvre PDF ET/OU HTML — PdfReader choisit la bonne vue en interne. */
export function docKind(fiche) {
  if (!fiche) return null;
  if (fiche.type === 'anat_schema') return 'schema';
  if (fiche.type === 'transcript') return 'transcript';
  if (fiche.pdfId || fiche.htmlId) return 'fiche';
  // 07/10 : cours « document » sans PDF (documents/DocumentCours.jsx). Une fois un PDF
  // importé, il redevient une 'fiche' (le document devient son onglet « Notes »).
  if (fiche.docNotes) return 'document';
  return null;
}

export const DOC_META = {
  fiche: { label: 'Fiche', icon: 'filePdf' },
  schema: { label: 'Schema', icon: 'image' },
  transcript: { label: 'Transcript', icon: 'edit' },
  document: { label: 'Document', icon: 'edit' },
};

/** crée un cours « document » (07/10) : une fiche standard sans PDF, marquée docNotes ;
 *  son contenu vit dans le store `notes_doc` (créé à la première frappe). */
export async function createDocumentNotes({ matiereId, titre }) {
  const fiche = {
    id: genId('f'), matiereId, dossierId: null, titre: (titre || 'Nouveau document').trim(),
    sousTitre: 'Document', type: 'standard', docNotes: true, dateImport: todayISO(),
  };
  await put('fiches', fiche);
  return fiche;
}

/** liste des fiches ouvrables comme documents (tous modes), non archivees. */
export function listDocuments(db) {
  return (db.fiches || []).filter((f) => !f.archive && docKind(f));
}

/** cree un transcript (fiche type 'transcript' + contenu TipTap + original brut). */
export async function createTranscript({ matiereId, titre, originalText, doc }) {
  const id = genId('f');
  const fiche = {
    id, matiereId, titre: (titre || 'Transcript').trim(),
    sousTitre: 'Transcript', type: 'transcript', dateImport: todayISO(),
    originalText: originalText || '',
  };
  await put('fiches', fiche);
  await setDoc(id, doc);
  return fiche;
}

/** supprime un transcript (fiche + contenu). Les autres types passent par l'archivage. */
export async function deleteTranscript(ficheId) {
  await remove('fiches', ficheId);
  await removeDoc(ficheId);
}
