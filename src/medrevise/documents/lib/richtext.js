/* ============================================================
   MedRevise — LE moteur d'édition riche UNIQUE de l'app (TipTap).
   Interdiction d'un second éditeur : le mode Fiche (blocs de texte du PDF),
   le mode Transcript et les libellés de Schéma passent tous par CE jeu
   d'extensions. Ce module expose aussi les *walkers* purs sur le document
   ProseMirror (JSON) qui alimentent :
     - le bloc « notions prioritaires » (chantier A), depuis les marks highlight ;
     - la liste « mes questions » (mark maison studentQuestion) avec contexte ;
     - l'export texte brut.
   ============================================================ */
import { Mark, generateHTML } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';
import { TextAlign } from '@tiptap/extension-text-align';
import { Highlight } from '@tiptap/extension-highlight';
import { Image } from '@tiptap/extension-image';
import { getBlob } from '../../lib/storage.js';

/* Mark maison « mes questions » : l'étudiant sélectionne sa question (souvent notée
   entre parenthèses) à l'endroit exact du cours. Rendu inline distinct + data-attr,
   donc REPÉRABLE (surbrillance + entrée panneau) et EXPORTABLE avec son contexte. */
export const StudentQuestion = Mark.create({
  name: 'studentQuestion',
  inclusive: false,
  parseHTML() { return [{ tag: 'span[data-question]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ['span', { ...HTMLAttributes, 'data-question': 'true', class: 'rt-question' }, 0];
  },
  addCommands() {
    return {
      toggleStudentQuestion: () => ({ commands }) => commands.toggleMark(this.name),
    };
  },
});

/* Image « blob » : les octets vivent dans IndexedDB (store blobs), le nœud ne
   garde que blobId (+ largeur pour le redimensionnement) ; src est une object-URL
   transitoire, réhydratée au chargement (voir hydrateDoc/dehydrateDoc). */
const BlobImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent(),
      blobId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-blob') || null,
        renderHTML: (attrs) => (attrs.blobId ? { 'data-blob': attrs.blobId } : {}),
      },
      width: {
        default: null,
        renderHTML: (attrs) => (attrs.width ? { width: attrs.width } : {}),
      },
    };
  },
});

/* StarterKit v3 inclut déjà Underline + Link (ne pas les redéclarer).
   TextStyleKit apporte fontSize/fontFamily/color/backgroundColor. */
export const RICH_EXTENSIONS = [
  StarterKit,
  TextStyleKit,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Highlight.configure({ multicolor: true }),
  BlobImage.configure({ inline: false, allowBase64: true }),
  StudentQuestion,
];

/* ---------- images : blob IndexedDB <-> object-URL transitoire ---------- */
function walkImages(doc, fn) {
  const w = (n) => { if (!n) return; if (n.type === 'image') fn(n); (n.content || []).forEach(w); };
  (doc && doc.content || []).forEach(w);
}
/** réhydrate les src des images depuis leur blob → { doc, urls } (urls à révoquer). */
export async function hydrateDoc(doc) {
  if (!doc) return { doc: EMPTY_DOC, urls: [] };
  const clone = JSON.parse(JSON.stringify(doc));
  const urls = [];
  const imgs = []; walkImages(clone, (n) => imgs.push(n));
  for (const n of imgs) {
    const bid = n.attrs && n.attrs.blobId;
    if (bid) {
      const b = await getBlob(bid);
      if (b) { const u = URL.createObjectURL(b); urls.push(u); n.attrs = { ...n.attrs, src: u }; }
    }
  }
  return { doc: clone, urls };
}
/** avant persistance : retire les src transitoires (on ne garde que blobId). */
export function dehydrateDoc(doc) {
  const clone = JSON.parse(JSON.stringify(doc || EMPTY_DOC));
  walkImages(clone, (n) => { if (n.attrs && n.attrs.blobId) n.attrs = { ...n.attrs, src: null }; });
  return clone;
}

export const richToHTML = (doc) => {
  try { return doc ? generateHTML(doc, RICH_EXTENSIONS) : ''; } catch (e) { return ''; }
};

export const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

/* ---------- walkers purs sur le JSON ProseMirror ---------- */
const isBlock = (t) => t === 'paragraph' || t === 'heading';
function blockText(node) {
  let s = '';
  (node.content || []).forEach((ch) => { if (ch.type === 'text') s += ch.text || ''; });
  return s.trim();
}

/* runs contigus de texte portant `markName`, chacun avec le texte plein de son bloc
   comme contexte (utile pour « mes questions »). */
function collectMarkedRuns(doc, markName) {
  const runs = [];
  const visit = (block) => {
    const ctx = blockText(block);
    let cur = null;
    (block.content || []).forEach((ch) => {
      if (ch.type !== 'text') { if (cur != null) { runs.push({ texte: cur.trim(), context: ctx }); cur = null; } return; }
      const marked = (ch.marks || []).some((m) => m.type === markName);
      if (marked) cur = (cur || '') + (ch.text || '');
      else if (cur != null) { runs.push({ texte: cur.trim(), context: ctx }); cur = null; }
    });
    if (cur != null) runs.push({ texte: cur.trim(), context: ctx });
  };
  const walk = (node) => {
    if (!node) return;
    if (isBlock(node.type)) { visit(node); return; }
    (node.content || []).forEach(walk);
  };
  (doc && doc.content || []).forEach(walk);
  return runs.filter((r) => r.texte);
}

/* surlignages du transcript → { texte } (pas de pagination : page omise en aval). */
export const collectHighlights = (doc) => collectMarkedRuns(doc, 'highlight').map((r) => ({ texte: r.texte }));
/* questions de l'étudiant → { texte, context } */
export const collectQuestions = (doc) => collectMarkedRuns(doc, 'studentQuestion');

/* texte brut du document (blocs séparés par des sauts de ligne). */
export function docToPlainText(doc) {
  const out = [];
  const walk = (node) => {
    if (!node) return;
    if (isBlock(node.type)) { out.push(blockText(node)); return; }
    (node.content || []).forEach(walk);
  };
  (doc && doc.content || []).forEach(walk);
  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ---------- format unique des « notions prioritaires » (chantier A) ---------- */
/* items: [{ texte, page? }] — page omise (source sans pagination : transcript). */
export function formatPriority(items) {
  const lines = (items || [])
    .map((it, i) => `${i + 1}. "${it.texte}"${it.page != null ? ` (p.${it.page})` : ''}`)
    .join('\n');
  return `NOTIONS SOULIGNÉES / PRIORITAIRES :\n${lines}`;
}
