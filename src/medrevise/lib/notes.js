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
import { genId, put, remove, getAll, getOne } from './storage.js';

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

/* ============================================================
   RANGER UN DOCUMENT DANS LA BIBLIOTHÈQUE — UNE SEULE FICHE, MÊME ID.

   Ranger ne COPIE rien : le document DEVIENT la fiche de la Bibliothèque.
   L'enregistrement passe du store `notes` au store `fiches` AVEC LE MÊME `id`,
   le même `pdfId` (même fichier, jamais dupliqué) et donc les MÊMES annotations
   (surlignages/boîtes/traits sont indexés par `ficheId = id`, voir en tête).
   Prise de notes affiche ensuite cette fiche (marquée `priseDeNotes`) au même
   titre que ses documents : un seul objet, montré à deux endroits (trois avec
   Réviser) — toute modification est la même partout.

   Ordre des écritures = zéro perte : la fiche est écrite AVANT que
   l'enregistrement `notes` ne soit retiré. Interrompu entre les deux, il reste
   une fiche et un document de même id : `notesVisibles` masque alors le
   document, et le prochain rangement le retire. Le PDF (blob) n'est jamais
   touché. Rangée une deuxième fois (« Modifier le rangement »), la fiche est
   simplement DÉPLACÉE (`ctx.moveFicheTo`), jamais recréée.
   ============================================================ */

/** Les documents de Prise de notes sont-ils déjà une fiche ? (fiche de même id) */
export const estRangee = (fiche) => !!(fiche && fiche.priseDeNotes);

/** Ce que la page Prise de notes affiche : les documents non rangés + les fiches
    issues de Prise de notes (non supprimées). Un document dont l'id existe déjà
    comme fiche est masqué — c'est la même chose, on ne l'affiche qu'une fois. */
export function elementsPriseDeNotes(db) {
  const fiches = (db.fiches || []).filter((f) => estRangee(f) && !f.archive);
  const idsFiches = new Set((db.fiches || []).map((f) => f.id));
  const docs = (db.notes || []).filter((n) => !idsFiches.has(n.id));
  return [
    ...docs.map((n) => ({ id: n.id, titre: n.titre, pdfName: n.pdfName, origine: n.origine, createdAt: n.createdAt, note: n, fiche: null })),
    ...fiches.map((f) => ({ id: f.id, titre: f.titre, pdfName: f.pdfName, origine: f.priseDeNotes.origine, createdAt: f.priseDeNotes.createdAt || f.dateImport, note: null, fiche: f })),
  ].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/** Range (ou déplace) un document de Prise de notes dans la Bibliothèque.
    @param ctx  contexte de l'app (db, moveFicheTo, reload)
    @param id   id du document (= id de la fiche, c'est le même)
    @returns la fiche */
export async function rangerDansBibliotheque(ctx, id, { matiereId, dossierId = null }) {
  if (!id || !matiereId) throw new Error('Choisis une matière.');
  const [fiche, note] = await Promise.all([getOne('fiches', id), getOne('notes', id)]);
  if (fiche) {
    // déjà une fiche : on la DÉPLACE (même geste que le glisser-déposer)
    await ctx.moveFicheTo(id, matiereId, null, dossierId || null);
    if (note) await remove('notes', id); // reste d'un rangement interrompu
    await ctx.reload();
    return getOne('fiches', id);
  }
  if (!note) throw new Error('Document introuvable.');
  const freres = (ctx.db.fiches || []).filter((f) => f.matiereId === matiereId && (f.dossierId || null) === (dossierId || null) && !f.archive);
  const now = new Date().toISOString();
  const nouvelle = {
    id: note.id,                       // MÊME id : c'est le même objet
    matiereId, dossierId: dossierId || null,
    ordre: freres.length,
    titre: note.titre,
    sousTitre: 'Prise de notes',
    type: 'standard',
    pdfId: note.pdfId || null, pdfName: note.pdfName || null,   // MÊME fichier
    htmlId: null, htmlName: null,
    dateImport: (note.createdAt || now).slice(0, 10),
    synthese: null, meta: null,
    priseDeNotes: { origine: note.origine || 'pdf', createdAt: note.createdAt || now, rangeeLe: now },
  };
  await put('fiches', nouvelle);      // 1) la fiche existe…
  await remove('notes', note.id);     // 2) …puis seulement l'ancien enregistrement part
  await ctx.reload();
  return nouvelle;
}
