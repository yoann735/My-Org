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
import { Mark, Extension, generateHTML } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';
import { TextAlign } from '@tiptap/extension-text-align';
import { Highlight } from '@tiptap/extension-highlight';
import { Image } from '@tiptap/extension-image';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
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

/* ============================================================
   DOCUMENT DE NOTES (07/10, docs/compte-rendu-position-document-tablette.md) — MÊME
   moteur, étendu : cases à cocher, tableaux simples, et la mark « notion » (un passage
   du document devenu notion : il apparaît dans le mode Notions du panneau, un clic y
   ramène). Rien ne change pour les autres usages de RICH_EXTENSIONS.
   ============================================================ */
export const NotionMark = Mark.create({
  name: 'notion',
  inclusive: false,
  excludes: '',
  addAttributes() {
    return {
      id: { default: null, parseHTML: (el) => el.getAttribute('data-notion'), renderHTML: (a) => (a.id ? { 'data-notion': a.id } : {}) },
      couleur: { default: 'jaune', parseHTML: (el) => el.getAttribute('data-couleur') || 'jaune', renderHTML: (a) => ({ 'data-couleur': a.couleur || 'jaune' }) },
    };
  },
  parseHTML() { return [{ tag: 'mark[data-notion]' }]; },
  // 08/10 : la couleur du surligneur (4 couleurs « cours » ou hex libre) — variable CSS --nc
  renderHTML({ HTMLAttributes }) {
    const c = HTMLAttributes['data-couleur'];
    const hex = /^#[0-9a-f]{6}$/i.test(c || '') ? c : (COULEURS_NOTION[c] || COULEURS_NOTION.jaune);
    return ['mark', { ...HTMLAttributes, class: 'rt-notion', style: `--nc: ${hex}` }, 0];
  },
});
// mêmes teintes que COLORS (pdf/pdfShared.js), sans importer pdf.js ici
const COULEURS_NOTION = { jaune: '#FFD84D', vert: '#8BE38B', bleu: '#7EC8FF', rose: '#FF9FD1' };
/* Entrée sur une ligne VIDE d'une citation : on en sort (comme Notion, Docs) — sans ça,
   tout ce qu'on tape ensuite restait dans la citation. */
const SortieCitation = Extension.create({
  name: 'sortieCitation',
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty || $from.parent.type.name !== 'paragraph' || $from.parent.content.size !== 0) return false;
        for (let d = $from.depth - 1; d > 0; d--) {
          const n = $from.node(d).type.name;
          if (n === 'blockquote') return editor.commands.lift('blockquote');
          if (n === 'listItem' || n === 'taskItem' || n === 'tableCell' || n === 'tableHeader') return false;
        }
        return false;
      },
    };
  },
});
export const NOTES_EXTENSIONS = [
  StarterKit.configure({ link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: 'https' } }),
  TextStyleKit,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Highlight.configure({ multicolor: true }),
  BlobImage.configure({ inline: false, allowBase64: false }),
  StudentQuestion,
  TaskList,
  TaskItem.configure({ nested: true }),
  TableKit.configure({ table: { resizable: false } }),
  NotionMark,
  SortieCitation,
];
export const notesToHTML = (doc) => {
  try { return doc ? generateHTML(doc, NOTES_EXTENSIONS) : ''; } catch (e) { return ''; }
};

/** Les notions d'un document : [{ id, texte, couleur }] dans l'ordre du document. */
export function collectNotions(doc) {
  const par = new Map();
  const w = (n) => {
    if (!n) return;
    if (n.type === 'text' && n.marks) {
      const m = n.marks.find((x) => x.type === 'notion' && x.attrs && x.attrs.id);
      if (m) { const r = par.get(m.attrs.id) || { id: m.attrs.id, texte: '', couleur: m.attrs.couleur || 'jaune' }; r.texte += n.text || ''; par.set(m.attrs.id, r); }
    }
    (n.content || []).forEach(w);
  };
  w(doc);
  return [...par.values()].map((r) => ({ ...r, texte: r.texte.trim() })).filter((r) => r.texte);
}

/* ---------- export Markdown (titres, listes, cases, tableaux, citations, liens, images) ---------- */
export function docToMarkdown(doc, { titre = '', images = null } = {}) {
  const srcImage = (a) => { const id = a && a.blobId; return id ? ((images && images.get(id)) || 'image-' + id) : ((a && a.src) || ''); };
  const marques = (n) => {
    let t = (n.text || '').replace(/([*_`\\])/g, '\\$1');
    const ms = n.marks || [];
    if (ms.some((m) => m.type === 'code')) t = '`' + (n.text || '') + '`';
    if (ms.some((m) => m.type === 'bold')) t = '**' + t + '**';
    if (ms.some((m) => m.type === 'italic')) t = '*' + t + '*';
    if (ms.some((m) => m.type === 'strike')) t = '~~' + t + '~~';
    if (ms.some((m) => m.type === 'underline')) t = '<u>' + t + '</u>';
    if (ms.some((m) => m.type === 'highlight' || m.type === 'notion')) t = '==' + t + '==';
    const lien = ms.find((m) => m.type === 'link');
    if (lien) t = '[' + t + '](' + lien.attrs.href + ')';
    return t;
  };
  const inline = (n) => (n.content || []).map((c) => (c.type === 'text' ? marques(c) : c.type === 'hardBreak' ? '  \n' : c.type === 'image' ? `![image](${srcImage(c.attrs)})` : inline(c))).join('');
  const bloc = (n, ind = '') => {
    switch (n.type) {
      case 'heading': return '#'.repeat((n.attrs && n.attrs.level) || 1) + ' ' + inline(n);
      case 'paragraph': return ind + inline(n);
      case 'blockquote': return (n.content || []).map((c) => bloc(c)).join('\n\n').split('\n').map((l) => '> ' + l).join('\n');
      case 'horizontalRule': return '---';
      case 'codeBlock': return '```\n' + (n.content || []).map((c) => c.text || '').join('') + '\n```';
      case 'image': return `![image](${srcImage(n.attrs)})`;
      case 'bulletList': case 'orderedList': case 'taskList':
        return (n.content || []).map((li, i) => {
          const puce = n.type === 'orderedList' ? `${((n.attrs && n.attrs.start) || 1) + i}. ` : n.type === 'taskList' ? `- [${li.attrs && li.attrs.checked ? 'x' : ' '}] ` : '- ';
          const [premier, ...reste] = li.content || [];
          const tete = ind + puce + (premier ? inline(premier) : '');
          const suite = reste.map((c) => bloc(c, ind + '  ')).join('\n');
          return suite ? tete + '\n' + suite : tete;
        }).join('\n');
      case 'table': {
        const lignes = (n.content || []).map((tr) => (tr.content || []).map((td) => (td.content || []).map((p) => inline(p)).join(' ').replace(/\|/g, '\\|')));
        if (!lignes.length) return '';
        const larg = Math.max(...lignes.map((l) => l.length));
        const ligne = (l) => '| ' + Array.from({ length: larg }, (_, i) => l[i] || '').join(' | ') + ' |';
        return [ligne(lignes[0]), '| ' + Array.from({ length: larg }, () => '---').join(' | ') + ' |', ...lignes.slice(1).map(ligne)].join('\n');
      }
      default: return (n.content || []).map((c) => bloc(c, ind)).join('\n');
    }
  };
  const corps = ((doc && doc.content) || []).map((n) => bloc(n)).filter((x) => x !== undefined).join('\n\n');
  return (titre ? '# ' + titre + '\n\n' : '') + corps.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

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
