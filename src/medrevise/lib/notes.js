/* ============================================================
   MedRevise — PRISE DE NOTES : données d'un document de notes.

   Un DOCUMENT DE NOTES = un PDF (ou une image convertie en PDF) qui n'appartient
   à AUCUNE fiche. Espace de lecture/annotation pur : aucune question, aucune
   méthode des J, aucune statistique. Store `notes` à part (voir lib/storage.js),
   sur le même principe que `apprentissage` — planning, stats, carnet, recherche
   et exports ne lisent que `questions`/`fiches`, ces documents en restent donc
   absents PAR CONSTRUCTION.

   Enregistrement :
     { id, titre,
       pdfId, pdfName,        // le fichier (blob synchronisé par l'outbox des blobs)
       origine: 'pdf'|'image',// informatif : d'où vient le PDF (affiché dans la liste)
       createdAt, updatedAt }

   LES ANNOTATIONS NE SONT PAS ICI. Surlignages et boîtes de texte restent dans
   les stores `highlights` / `annotations` existants, avec `ficheId = note.id` —
   ce champ est une CLÉ DE NAMESPACE, pas une clé étrangère (même usage que
   `cleSurlignages`, lib/apprentissage.js). Conséquence : le surligneur du lecteur
   fonctionne sur un document de notes sans une ligne de code en plus, et rien
   de nouveau ne transite par la synchro.
   ============================================================ */
import { genId, put, remove, getAll } from './storage.js';

/** clé de namespace des annotations d'un document (voir PdfReader, prop ficheId). */
export const cleAnnotations = (note) => (note && note.id) || null;

export async function createNote({ titre, pdfId, pdfName = null, origine = 'pdf' }) {
  const now = new Date().toISOString();
  return put('notes', {
    id: genId('n'),
    titre: (titre || '').trim() || 'Document sans titre',
    pdfId, pdfName,
    origine: origine === 'image' ? 'image' : 'pdf',
    createdAt: now,
  });
}

export async function renameNote(note, titre) {
  const t = (titre || '').trim();
  if (!note || !t || t === note.titre) return note;
  return put('notes', { ...note, titre: t });
}

/** Supprime le document ET ses annotations (surlignages + boîtes de texte).
    Le PDF (blob) n'est JAMAIS supprimé : même règle que storage.js#mergeBlobs et
    apprentissage.js#deleteUnite — un blob orphelin est inoffensif, un blob
    supprimé est irrécupérable. */
export async function deleteNote(note) {
  if (!note) return;
  const [hs, ans] = await Promise.all([getAll('highlights'), getAll('annotations')]);
  await Promise.all([
    ...(hs || []).filter((h) => h.ficheId === note.id).map((h) => remove('highlights', h.id)),
    ...(ans || []).filter((a) => a.ficheId === note.id).map((a) => remove('annotations', a.id)),
  ]);
  await remove('notes', note.id);
}

/** Nombre d'annotations (surlignages + boîtes de texte) par document, en UNE
    lecture des deux stores — la liste en affiche le compte sans charger les PDF.
    Lecture pure : n'écrit rien, ne met rien en file de synchro. */
export async function comptesAnnotations() {
  const [hs, ans] = await Promise.all([getAll('highlights'), getAll('annotations')]);
  const map = {};
  for (const r of [...(hs || []), ...(ans || [])]) {
    if (!r || !r.ficheId) continue;
    map[r.ficheId] = (map[r.ficheId] || 0) + 1;
  }
  return map;
}
