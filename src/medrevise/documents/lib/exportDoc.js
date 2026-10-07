/* ============================================================
   MedRevise — EXPORT D'UN DOCUMENT en Markdown (07/10, repris le 08/10 quand le document
   est passé dans le lecteur : documents/DocumentCours.jsx n'existe plus).
   Images incluses (data URL), titre du cours en tête.
   ============================================================ */
import { getBlob } from '../../lib/storage.js';
import { docToMarkdown, EMPTY_DOC } from './richtext.js';

export const nomFichier = (titre, ext) => ((titre || 'document').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'document') + '.' + ext;
export const telecharger = (blob, nom) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nom;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
const versDataUrl = (blob) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ok(null); r.readAsDataURL(blob); });

/** `doc` : JSON ProseMirror (images = blobId). Télécharge le .md et le renvoie. */
export async function exporterMarkdownDoc(doc, titre) {
  const d = doc || EMPTY_DOC;
  const images = new Map();
  const ids = [];
  const w = (n) => { if (!n) return; if (n.type === 'image' && n.attrs && n.attrs.blobId) ids.push(n.attrs.blobId); (n.content || []).forEach(w); };
  w(d);
  for (const id of ids) { const b = await getBlob(id); if (b) { const u = await versDataUrl(b); if (u) images.set(id, u); } }
  const md = docToMarkdown(d, { titre, images });
  telecharger(new Blob([md], { type: 'text/markdown;charset=utf-8' }), nomFichier(titre, 'md'));
  return md;
}
