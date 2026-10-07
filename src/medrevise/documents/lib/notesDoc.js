/* ============================================================
   MedRevise — DOCUMENT DE NOTES : enregistrement (07/10).

   Store `notes_doc` (lib/storage.js, SYNCABLE) : UN enregistrement par cours,
   { id: ficheId, ficheId,
     content: JSON ProseMirror de l'onglet « Notes » d'un cours PDF,
     pages:   { [id de page]: JSON ProseMirror } — le texte écrit SUR chaque page d'un
              document (08/10 : le document s'ouvre dans le lecteur, comme un PDF),
     fond:    'blanc' | 'noir' — fond des pages du document,
     updatedAt }
   (images = blobId seulement). Type ADDITIONNEL : rien d'existant n'est réécrit.

   Les écritures sont EN FILE (une à la fois, lecture → fusion → écriture) : plusieurs
   pages s'enregistrent indépendamment sans jamais écraser le champ d'une autre.
   ============================================================ */
import { getOne, put } from '../../lib/storage.js';

export const lireNotesDoc = (ficheId) => (ficheId ? getOne('notes_doc', ficheId) : Promise.resolve(null));

let file = Promise.resolve();
const enFile = (f) => { const p = file.then(f, f); file = p.catch(() => {}); return p; };
/** se résout quand toutes les écritures déjà demandées sont faites */
export const attendreNotesDoc = () => file;

/** fusion d'un champ dans l'enregistrement du cours (lecture → fusion → écriture, en file) */
export function majNotesDoc(ficheId, maj) {
  if (!ficheId) return Promise.resolve();
  return enFile(async () => {
    const r = (await getOne('notes_doc', ficheId)) || {};
    const patch = typeof maj === 'function' ? maj(r) : maj;
    if (!patch) return r;
    const n = { ...r, ...patch, id: ficheId, ficheId };
    await put('notes_doc', n);
    return n;
  });
}

export const ecrireNotesDoc = (ficheId, content) => majNotesDoc(ficheId, { content });

/** texte d'UNE page du document */
export const ecrirePageDoc = (ficheId, pageId, json) =>
  majNotesDoc(ficheId, (r) => ({ pages: { ...(r.pages || {}), [pageId]: json } }));

/** Tout le texte du cours en un seul document : onglet « Notes » puis pages (dans `ordre`
 *  si on le connaît, sinon dans l'ordre d'enregistrement). Sert aux notions et aux exports. */
export function contenuGlobal(rec, ordre = null) {
  const blocs = [];
  if (rec && rec.content && rec.content.content) blocs.push(...rec.content.content);
  const pages = (rec && rec.pages) || {};
  const ids = ordre ? ordre.filter((id) => pages[id]) : Object.keys(pages);
  for (const id of ids) if (pages[id] && pages[id].content) blocs.push(...pages[id].content);
  return { type: 'doc', content: blocs };
}

/** Le document a-t-il du contenu (autre qu'un paragraphe vide) ? */
export function docNonVide(content) {
  const c = content && content.content;
  if (!c || !c.length) return false;
  if (c.length > 1) return true;
  const p = c[0];
  return !(p.type === 'paragraph' && !(p.content && p.content.length));
}
