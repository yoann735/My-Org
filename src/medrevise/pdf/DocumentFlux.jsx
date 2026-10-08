/* ============================================================
   MedRevise — LE TEXTE D'UN DOCUMENT : UN SEUL FLUX (08/10,
   docs/compte-rendu-document-engine.md).

   Avant : un éditeur PAR PAGE, et du texte qu'on faisait « déborder » d'un éditeur à
   l'autre (les pages étaient des conteneurs). Maintenant : UN éditeur ProseMirror pour tout
   le document, posé sur les pages du lecteur ; les pages sont CALCULÉES à partir du flux
   (documents/lib/paginationExt.js + pagination.js) et le texte n'est jamais découpé entre
   conteneurs — seuls des espaceurs le poussent d'une page à la suivante.

   Repère : le flux est mis en page à l'échelle 1 (unités de page : 595 de large pour l'A4),
   puis agrandi par `transform` — mêmes retours à la ligne à tous les zooms, à l'écran
   comme à l'impression. Le haut du flux = le haut de la page 1 ; la page k commence à
   k × (hauteur de page + écart). Marges : 56 unités (≈ 20 mm) de chaque côté.

   Couches (de bas en haut) : fond des pages → CE TEXTE → annotations de chaque page
   (crayon, formes, boîtes : un calque par page, en coordonnées de page, hors du flux).
   ============================================================ */
import { memo, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import { TextSelection, NodeSelection } from '@tiptap/pm/state';
import { Icon } from '../../shared/Icon.jsx';
import { putBlob, genId } from '../lib/storage.js';
import { NOTES_EXTENSIONS, EMPTY_DOC, hydrateDoc, dehydrateDoc } from '../documents/lib/richtext.js';
import { insererImageBloc, limiteSous } from '../documents/lib/imageVue.js';
import { PaginationDocument, SautDePage } from '../documents/lib/paginationExt.js';
import { surlignerRecherche } from './PageTexte.jsx';

export const MARGE_DOC = 56; // ≈ 20 mm sur l'A4 (595 × 842)
const DELAI_SAUVEGARDE = 600;

export const DocumentFlux = memo(forwardRef(function DocumentFlux({
  initial, largeurPage, hauteurPage, ecart, echelle, hauteurTotale, outil, couleurSurligneur, fondNoir = false,
  onSauver, onActiver, onNotion, onFlashcard, onJournal = null, onPagination = null,
}, ref) {
  const urls = useRef([]);
  const charge = useRef(false);
  const minuteur = useRef(null);
  const enAttente = useRef(null);
  const editorRef = useRef(null);
  const dernierJSON = useRef(null);
  const derniereFrappe = useRef(0);
  const outilRef = useRef(outil); outilRef.current = outil;
  const rappels = useRef({}); rappels.current = { onSauver, onActiver, onNotion, onFlashcard, onJournal, onPagination, couleurSurligneur };
  const [bulle, setBulle] = useState(null);
  const zone = hauteurPage - 2 * MARGE_DOC;
  // géométrie des pages, dans le repère du flux (unités de page) — lue par la pagination
  const geo = useMemo(() => ({ haut: (k) => k * (hauteurPage + ecart) + MARGE_DOC, zone }), [hauteurPage, ecart, zone]);

  const vider = () => {
    if (minuteur.current) { clearTimeout(minuteur.current); minuteur.current = null; }
    if (enAttente.current) { const j = enAttente.current; enAttente.current = null; rappels.current.onSauver(dehydrateDoc(j)); }
  };
  const insererImage = async (ed, f, pos = null) => {
    if (!f || !/^image\//.test(f.type)) return false;
    const blobId = await putBlob(f);
    const url = URL.createObjectURL(f); urls.current.push(url);
    return insererImageBloc(ed, { src: url, blobId }, pos);
  };

  const editor = useEditor({
    extensions: [...NOTES_EXTENSIONS, SautDePage, PaginationDocument.configure({ geo, onResultat: (r) => rappels.current.onPagination && rappels.current.onPagination(r) })],
    content: EMPTY_DOC,
    editable: false,
    editorProps: {
      attributes: { class: 'pt-prose pt-flux', spellcheck: 'true', 'data-zone': String(zone) },
      handleDOMEvents: {
        // copie du TEXTE D'UNE IMAGE (Texte en direct) : celle du navigateur
        copy: () => { const sel = window.getSelection(); const n = sel && sel.anchorNode; const el = n && (n.nodeType === 1 ? n : n.parentElement); return !!(el && el.closest && el.closest('.pti-texte')); },
      },
      handlePaste: (view, event) => {
        const f = [...((event.clipboardData && event.clipboardData.files) || [])].find((x) => /^image\//.test(x.type));
        if (!f || !editorRef.current) return false;
        event.preventDefault();
        insererImage(editorRef.current, f);
        return true;
      },
      handleDrop: (view, event, slice, moved) => {
        if (moved) return false;
        const f = [...((event.dataTransfer && event.dataTransfer.files) || [])].find((x) => /^image\//.test(x.type));
        if (!f || !editorRef.current) return false;
        event.preventDefault();
        // dépôt : entre deux blocs, à la limite la plus proche — la pagination place le reste
        insererImage(editorRef.current, f, limiteSous(editorRef.current, event.clientX, event.clientY).pos);
        return true;
      },
      handleKeyDown: (view, event) => {
        const ed = editorRef.current;
        if (!ed) return false;
        if ((event.metaKey || event.ctrlKey) && event.shiftKey && (event.key === '9' || event.code === 'Digit9')) {
          event.preventDefault(); ed.chain().focus().toggleTaskList().run(); return true;
        }
        // ⌘Entrée : saut de page (comme dans un traitement de texte)
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault(); ed.chain().focus().insertContent({ type: 'sautDePage' }).run(); return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (!charge.current) return;
      derniereFrappe.current = Date.now();
      enAttente.current = ed.getJSON();
      clearTimeout(minuteur.current);
      minuteur.current = setTimeout(vider, DELAI_SAUVEGARDE);
    },
    onFocus: ({ editor: ed }) => { rappels.current.onActiver(ed); },
    onSelectionUpdate: ({ editor: ed }) => majBulle(ed),
    onBlur: () => setTimeout(() => { const ed = editorRef.current; if (ed && !ed.isFocused) setBulle(null); }, 120),
  });
  editorRef.current = editor;

  function majBulle(ed) {
    const { from, to, empty } = ed.state.selection;
    if (empty || !ed.isFocused || outilRef.current !== 'main' || ed.state.selection instanceof NodeSelection) { setBulle(null); return; }
    try {
      const a = ed.view.coordsAtPos(from), b = ed.view.coordsAtPos(to);
      setBulle({ x: (a.left + b.right) / 2, y: Math.min(a.top, b.top), notion: ed.isActive('notion') });
    } catch (e) { setBulle(null); }
  }

  // chargement (une fois) : le flux du document
  useEffect(() => {
    if (!editor) return undefined;
    let vivant = true;
    charge.current = false;
    (async () => {
      const { doc, urls: u } = await hydrateDoc(initial || EMPTY_DOC);
      if (!vivant || editor.isDestroyed) { u.forEach((x) => URL.revokeObjectURL(x)); return; }
      urls.current.push(...u);
      editor.commands.setContent(doc, { emitUpdate: false });
      editor.setEditable(true);
      dernierJSON.current = editor.getJSON();
      charge.current = true;
    })();
    return () => { vivant = false; };
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  // journal ANNULER / RÉTABLIR (lib/journalAnnuler.js) : une entrée « flux » par action
  useEffect(() => {
    if (!editor) return undefined;
    const surTr = ({ transaction: tr }) => {
      if (!tr.docChanged) return;
      const avant = dernierJSON.current;
      const apres = editor.getJSON();
      dernierJSON.current = apres;
      if (!charge.current || !avant || !rappels.current.onJournal || tr.getMeta('journalIgnorer')) return;
      const saisie = !tr.getMeta('uiEvent') && tr.steps.every((st) => {
        const j = st.toJSON();
        if (j.stepType !== 'replace') return false;
        return ((j.slice && j.slice.content) || []).every((n) => n.type === 'text');
      });
      rappels.current.onJournal('flux', avant, apres, { systeme: tr.getMeta('addToHistory') === false, saisie, groupe: tr.getMeta('groupeJournal') || null });
    };
    editor.on('transaction', surTr);
    return () => editor.off('transaction', surTr);
  }, [editor]);

  // « Flashcard » depuis le texte d'une image (bulle de imageVue.js)
  const cadreRef = useRef(null);
  useEffect(() => {
    const z = cadreRef.current;
    if (!z) return undefined;
    const f = (e) => { if (e.detail && e.detail.texte) rappels.current.onFlashcard(e.detail.texte); };
    z.addEventListener('pti-flashcard', f);
    return () => z.removeEventListener('pti-flashcard', f);
  }, []);

  useEffect(() => {
    const cache = () => { if (document.visibilityState === 'hidden') vider(); };
    document.addEventListener('visibilitychange', cache);
    window.addEventListener('pagehide', vider);
    return () => {
      document.removeEventListener('visibilitychange', cache);
      window.removeEventListener('pagehide', vider);
      vider();
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      urls.current = [];
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const remplacerContenu = async (json, { journal = false } = {}) => {
    if (!editor || editor.isDestroyed) return;
    const { doc, urls: u } = await hydrateDoc(dehydrateDoc(json || EMPTY_DOC));
    urls.current.push(...u);
    if (editor.isDestroyed) return;
    const from = editor.state.selection.from;
    editor.commands.setContent(doc, { emitUpdate: true });
    try { editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(Math.min(from, editor.state.doc.content.size)))).setMeta('addToHistory', false)); } catch (e) { /* ignore */ }
    if (!journal) dernierJSON.current = editor.getJSON();
    enAttente.current = editor.getJSON(); vider();
  };

  useImperativeHandle(ref, () => ({
    editor,
    vider,
    /** journal (annuler / rétablir) : le flux reprend cet état, puis est enregistré */
    remplacer: (json) => remplacerContenu(json),
    /** synchro : version plus récente venue d'un AUTRE appareil — seulement si l'on n'écrit pas */
    inactifDepuis: () => Date.now() - derniereFrappe.current,
    remplacerDistant: (json) => { const j = editor && editor.getJSON(); return remplacerContenu(json).then(() => j); },
    /** recherche : la n-ième occurrence de `q` dans le texte affiché (texte des images compris) */
    montrerOccurrence(q, rang) {
      const dom = editor && editor.view && editor.view.dom;
      const cible = (q || '').toLowerCase();
      if (!dom || !cible) return null;
      const marcheur = document.createTreeWalker(dom, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement && n.parentElement.closest('.pt-saut-page') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
      let n = 0, noeud;
      while ((noeud = marcheur.nextNode())) {
        const t = noeud.nodeValue.toLowerCase();
        let i = t.indexOf(cible);
        while (i !== -1) {
          if (n === rang) {
            const r = document.createRange();
            r.setStart(noeud, i); r.setEnd(noeud, i + cible.length);
            surlignerRecherche(r);
            return r.getBoundingClientRect();
          }
          n++; i = t.indexOf(cible, i + 1);
        }
      }
      return null;
    },
    allerANotion(id) {
      const el = editor && editor.view && editor.view.dom.querySelector(`[data-notion="${CSS.escape(id)}"]`);
      if (!el) return null;
      el.classList.add('cible'); setTimeout(() => el.classList.remove('cible'), 1600);
      return el;
    },
    /** saut(s) de page pour « Insérer une page ici » : une page blanche avant le bloc en `pos` */
    insererPageAvant(pos) {
      if (!editor) return;
      const { state } = editor;
      const S = state.schema.nodes;
      const p = Math.max(0, Math.min(pos == null ? state.doc.content.size : pos, state.doc.content.size));
      const nodes = [S.sautDePage.create(), S.paragraph.create()];
      if (p < state.doc.content.size) nodes.push(S.sautDePage.create());
      const tr = state.tr.insert(p, nodes);
      tr.setSelection(TextSelection.near(tr.doc.resolve(p + 2)));
      editor.view.dispatch(tr);
      editor.view.focus();
    },
    /** retire les blocs qui commencent sur une page (« Retirer la page ») */
    retirerBlocs(de, a) {
      if (!editor || de >= a) return;
      const tr = editor.state.tr.delete(de, a);
      if (!tr.doc.childCount) tr.insert(0, editor.state.schema.nodes.paragraph.create());
      editor.view.dispatch(tr);
    },
  }), [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  /* SURLIGNEUR (comme sur un PDF) : la sélection devient une NOTION de la couleur choisie ;
     repasser sur une notion de la même couleur la retire, d'une autre la recolore */
  const marquerNotion = (couleur) => {
    const ed = editorRef.current;
    if (!ed) return;
    const { from, to } = ed.state.selection;
    if (from === to) return;
    const texte = ed.state.doc.textBetween(from, to, ' ').trim();
    if (!texte) return;
    const id = genId('nd');
    ed.chain().focus().setMark('notion', { id, couleur: couleur || 'jaune' }).setTextSelection(to).run();
    rappels.current.onNotion({ id, texte, couleur: couleur || 'jaune' });
    setBulle(null);
  };
  const retirerNotion = () => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.chain().focus().extendMarkRange('notion').unsetMark('notion').run();
    setBulle(null);
  };
  const versFlashcard = () => {
    const ed = editorRef.current;
    if (!ed) return;
    const { from, to } = ed.state.selection;
    const texte = ed.state.doc.textBetween(from, to, ' ').trim();
    if (texte) rappels.current.onFlashcard(texte);
    setBulle(null);
  };
  const surRelache = () => {
    if (outilRef.current !== 'surligneur') return;
    const ed = editorRef.current;
    if (!ed || ed.state.selection.empty) return;
    const couleur = rappels.current.couleurSurligneur || 'jaune';
    const { from, to } = ed.state.selection;
    const ids = new Map();
    let libre = false;
    ed.state.doc.nodesBetween(from, to, (n, pos) => {
      if (!n.isText) return;
      const a = Math.max(from, pos), b = Math.min(to, pos + n.nodeSize);
      if (b <= a) return;
      const m = n.marks.find((x) => x.type.name === 'notion' && x.attrs && x.attrs.id);
      if (m) ids.set(m.attrs.id, m.attrs.couleur || 'jaune');
      else if (/[\p{L}\p{N}]/u.test(n.text.slice(a - pos, b - pos))) libre = true;
    });
    if (!ids.size || libre) { marquerNotion(couleur); return; }
    const retirer = [...ids.values()].every((c) => c === couleur);
    const type = ed.schema.marks.notion;
    const tr = ed.state.tr;
    ed.state.doc.descendants((n, pos) => {
      if (!n.isText) return;
      const m = n.marks.find((x) => x.type === type && ids.has(x.attrs.id));
      if (!m) return;
      tr.removeMark(pos, pos + n.nodeSize, type);
      if (!retirer) tr.addMark(pos, pos + n.nodeSize, type.create({ ...m.attrs, couleur }));
    });
    tr.setSelection(TextSelection.create(tr.doc, to));
    ed.view.dispatch(tr);
    setBulle(null);
  };

  const actifTexte = outil === 'main' || outil === 'surligneur';
  return (
    <div ref={cadreRef} className={'pt-flux-cadre outil-' + outil + (fondNoir ? ' fond-noir' : '') + (actifTexte ? '' : ' inerte')}
      style={{ width: largeurPage * echelle, height: hauteurTotale, '--pt-inv': 1 / (echelle || 1) }}
      onMouseUp={surRelache}>
      {/* jusqu'au bas de la zone d'écriture de la DERNIÈRE page : son espace libre appartient
          au document (clic = curseur à la fin, dépôt d'image = à la fin) */}
      <div className="pt-flux-echelle" style={{ width: largeurPage, minHeight: Math.max(0, hauteurTotale / (echelle || 1) - MARGE_DOC), transform: `scale(${echelle})`, padding: `${MARGE_DOC}px ${MARGE_DOC}px 0` }}
        onMouseDown={(e) => {
          const ed = editorRef.current;
          if (!ed || e.target !== e.currentTarget || e.button !== 0) return;
          if (e.clientY > ed.view.dom.getBoundingClientRect().bottom) { e.preventDefault(); ed.chain().focus('end').run(); }
        }}>
        <EditorContent editor={editor} />
      </div>
      {bulle && createPortal(
        <div className="nd-bulle pt-bulle" style={{ left: bulle.x, top: bulle.y - 8 }} onMouseDown={(e) => e.preventDefault()}>
          {bulle.notion
            ? <button type="button" className="nd-bt nd-bt-txt" onClick={retirerNotion} title="Ce passage n’est plus une notion"><Icon name="x" size={13} /> Retirer la notion</button>
            : <button type="button" className="nd-bt nd-bt-txt" onClick={() => marquerNotion('jaune')} title="Faire de ce passage une notion (mode Notions du panneau)"><Icon name="edit" size={13} /> Notion</button>}
          <button type="button" className="nd-bt nd-bt-txt" onClick={versFlashcard} title="Créer une flashcard à partir de ce passage"><Icon name="cards" size={13} /> Flashcard</button>
        </div>,
        document.body,
      )}
    </div>
  );
}));
