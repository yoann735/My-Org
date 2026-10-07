/* ============================================================
   MedRevise — DOCUMENT DE NOTES : enregistrement (07/10).

   Store `notes_doc` (lib/storage.js, SYNCABLE) : UN enregistrement par cours,
   { id: ficheId, ficheId, content: JSON ProseMirror (images = blobId seulement), updatedAt }.
   Type ADDITIONNEL : rien d'existant n'est réécrit. Un cours PDF n'a d'enregistrement
   qu'à partir du moment où l'on écrit dans son onglet « Notes ».
   ============================================================ */
import { getOne, put } from '../../lib/storage.js';

export const lireNotesDoc = (ficheId) => (ficheId ? getOne('notes_doc', ficheId) : Promise.resolve(null));

export function ecrireNotesDoc(ficheId, content) {
  if (!ficheId) return Promise.resolve();
  return put('notes_doc', { id: ficheId, ficheId, content });
}

/** Le document a-t-il du contenu (autre qu'un paragraphe vide) ? */
export function docNonVide(content) {
  const c = content && content.content;
  if (!c || !c.length) return false;
  if (c.length > 1) return true;
  const p = c[0];
  return !(p.type === 'paragraph' && !(p.content && p.content.length));
}
