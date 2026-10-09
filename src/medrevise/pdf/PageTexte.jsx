/* ============================================================
   MedRevise — TEXTE D'UNE PAGE DE DOCUMENT (08/10, docs/compte-rendu-nettoyage-document.md).

   Un document s'ouvre dans le LECTEUR, comme un PDF : des pages A4 blanches sur lesquelles
   on écrit (ce composant) ET on annote avec tous les outils du PDF (couches de PdfPage,
   au-dessus). Le texte de chaque page est un éditeur du moteur unique de l'app
   (documents/lib/richtext.js, NOTES_EXTENSIONS) mis en page à l'échelle 1 (unités de page,
   595 × 842 pour l'A4) puis agrandi par `transform` : mêmes retours à la ligne à tous les
   zooms, à l'écran comme à l'impression.

   DÉBORDEMENT : quand le texte dépasse le bas de la zone d'écriture, les derniers blocs
   partent en tête de la page suivante (créée au besoin), curseur compris — on écrit sans
   s'arrêter, comme dans un traitement de texte. Retour arrière au tout début d'une page :
   son premier bloc remonte à la fin de la page précédente.
   ============================================================ */
import { memo, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import { Fragment } from '@tiptap/pm/model';
import { TextSelection, NodeSelection } from '@tiptap/pm/state';
import { Icon } from '../../shared/Icon.jsx';
import { COULEUR_DEFAUT } from '../lib/palette.js';
import { putBlob, genId } from '../lib/storage.js';
import { NOTES_EXTENSIONS, EMPTY_DOC, hydrateDoc, dehydrateDoc } from '../documents/lib/richtext.js';
import { insererImageBloc, limiteSous } from '../documents/lib/imageVue.js';

export const PAGE_A4 = { width: 595, height: 842 };

/* occurrence de la recherche, surlignée sans toucher au texte ni au focus (CSS Custom
   Highlight API, ::highlight(recherche-doc) dans notes-doc.css) */
export function surlignerRecherche(range) {
  try { if (window.CSS && CSS.highlights && window.Highlight) CSS.highlights.set('recherche-doc', new window.Highlight(range)); } catch (e) { /* navigateur ancien : pas de surlignage */ }
}
export function effacerSurlignageRecherche() {
  try { if (window.CSS && CSS.highlights) CSS.highlights.delete('recherche-doc'); } catch (e) { /* ignore */ }
}
export const MARGE_PAGE = 56; // marges d'écriture, en unités de page (≈ 2 cm)
const DELAI_SAUVEGARDE = 600;

const estVide = (doc) => doc.childCount === 1 && doc.firstChild.isTextblock && doc.firstChild.content.size === 0;

export const PageTexte = memo(forwardRef(function PageTexte({
  pageId, initial, largeur, hauteur, echelle, outil, couleurSurligneur, focusDemande = null,
  onSauver, onDebordement, onRemonter, onActiver, onNotion, onFlashcard, onPret, onJournal = null,
}, ref) {
  const urls = useRef([]);
  const charge = useRef(false);
  const minuteur = useRef(null);
  const enAttente = useRef(null);
  const editorRef = useRef(null);
  const zoneRef = useRef(null);
  const outilRef = useRef(outil); outilRef.current = outil;
  const rappels = useRef({}); rappels.current = { onSauver, onDebordement, onRemonter, onActiver, onNotion, onFlashcard, couleurSurligneur, onJournal };
  const dernierJSON = useRef(null); // état de la page après la dernière transaction (journal annuler / rétablir)
  const [bulle, setBulle] = useState(null); // { x, y, notion }
  /* RELAIS : le curseur vient de partir sur une page qui s'affiche à peine. Pendant ce court
     instant, ce qui est tapé ici est mis de côté (jamais écrit sur CETTE page), puis rejoué
     sur la nouvelle page dès qu'elle a le curseur — aucune frappe perdue, aucun désordre. */
  const relais = useRef(null); // null | [{ texte } | { touche }]
  const hUtile = hauteur - 2 * MARGE_PAGE;

  const vider = () => {
    if (minuteur.current) { clearTimeout(minuteur.current); minuteur.current = null; }
    if (enAttente.current) { const j = enAttente.current; enAttente.current = null; rappels.current.onSauver(pageId, dehydrateDoc(j)); }
  };

  const insererImage = async (ed, f, pos = null) => {
    if (!f || !/^image\//.test(f.type)) return false;
    const blobId = await putBlob(f);
    const url = URL.createObjectURL(f); urls.current.push(url);
    // (08/10) un BLOC entre deux paragraphes : ne coupe jamais le texte (documents/lib/imageVue.js)
    return insererImageBloc(ed, { src: url, blobId }, pos);
  };

  /* le texte dépasse le bas de la zone d'écriture : les blocs qui débordent partent sur la
     page suivante (hors historique d'annulation : ils ne sont pas perdus, ils ont bougé) */
  const verifierDebordement = () => {
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed || !charge.current) return;
    const dom = ed.view.dom;
    if (dom.scrollHeight <= hUtile + 0.5) return;
    const doc = ed.state.doc;
    if (doc.childCount < 2) return; // un seul bloc plus haut que la page : il reste (rogné)
    let coupe = null;
    doc.forEach((node, offset, i) => {
      if (coupe != null || i === 0) return;
      const el = ed.view.nodeDOM(offset);
      if (el && el.offsetTop + el.offsetHeight > hUtile) coupe = offset;
    });
    if (coupe == null) { let der = 0; doc.forEach((n, o) => { der = o; }); coupe = der; }
    const fin = doc.content.size;
    // (08/10) jamais un paragraphe VIDE final tout seul : l'éditeur en remet toujours un en fin de
    // page (TrailingNode) — le déplacer relancerait le débordement sans fin
    const reste = doc.slice(coupe, fin).content;
    if (reste.childCount === 1 && reste.firstChild.isTextblock && reste.firstChild.content.size === 0) return;
    const nodes = doc.slice(coupe, fin).content.toJSON();
    const { from } = ed.state.selection;
    const decal = ed.isFocused && from >= coupe ? from - coupe : null;
    const tr = ed.state.tr.delete(coupe, fin);
    tr.setMeta('addToHistory', false);
    ed.view.dispatch(tr);
    // le curseur part avec le texte : tant que la page suivante n'a pas pris la main, la frappe
    // est mise en relais (voir plus haut)
    if (decal != null) {
      relais.current = [];
      // filet : si la page suivante ne prend pas la main, la frappe revient ici, au bout
      setTimeout(() => {
        const r = relais.current;
        if (!r) return;
        relais.current = null;
        const e2 = editorRef.current;
        if (e2 && !e2.isDestroyed) { e2.commands.focus('end'); r.forEach((it) => (it.texte != null ? e2.commands.insertContent(it.texte) : it.touche === 'Enter' ? e2.commands.enter() : null)); }
      }, 2500);
    }
    rappels.current.onDebordement(pageId, nodes, decal);
  };

  const editor = useEditor({
    extensions: NOTES_EXTENSIONS,
    content: EMPTY_DOC,
    editable: false,
    editorProps: {
      attributes: { class: 'pt-prose', spellcheck: 'true' },
      // copie / coupe du TEXTE D'UNE IMAGE (Texte en direct) : celle du navigateur, pas celle de l'éditeur
      handleDOMEvents: {
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
        // dépôt : à la limite de bloc la plus proche du pointeur (jamais au milieu d'une ligne)
        insererImage(editorRef.current, f, limiteSous(editorRef.current, event.clientX, event.clientY).pos);
        return true;
      },
      handleTextInput: (view, from, to, texte) => {
        if (!relais.current) return false;
        relais.current.push({ texte });
        return true;
      },
      handleKeyDown: (view, event) => {
        const ed = editorRef.current;
        if (!ed) return false;
        if (relais.current && ['Enter', 'Backspace', 'Tab'].includes(event.key) && !event.metaKey && !event.ctrlKey) {
          event.preventDefault(); relais.current.push({ touche: event.key, shift: event.shiftKey }); return true;
        }
        if ((event.metaKey || event.ctrlKey) && event.shiftKey && (event.key === '9' || event.code === 'Digit9')) {
          event.preventDefault(); ed.chain().focus().toggleTaskList().run(); return true;
        }
        // retour arrière tout au début de la page : le premier bloc remonte sur la précédente
        if (event.key === 'Backspace' && !event.metaKey && !event.altKey) {
          const { selection, doc } = view.state;
          if (selection.empty && selection.from <= 1 && doc.firstChild && doc.firstChild.isTextblock) {
            const premier = doc.firstChild.toJSON();
            const tr = view.state.tr.delete(0, doc.firstChild.nodeSize);
            if (!tr.doc.childCount) tr.insert(0, view.state.schema.nodes.paragraph.create());
            if (rappels.current.onRemonter(pageId, premier)) {
              event.preventDefault();
              tr.setMeta('addToHistory', false);
              tr.setMeta('journalAction', true); // geste de l'utilisateur (la page précédente suit, en « système »)
              view.dispatch(tr);
              return true;
            }
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (!charge.current) return;
      enAttente.current = ed.getJSON();
      clearTimeout(minuteur.current);
      minuteur.current = setTimeout(vider, DELAI_SAUVEGARDE);
      requestAnimationFrame(verifierDebordement);
    },
    onFocus: ({ editor: ed }) => { rappels.current.onActiver(pageId, ed); },
    onSelectionUpdate: ({ editor: ed }) => { majBulle(ed); if (ed.isFocused) rappels.current.onActiver(pageId, ed); },
    onBlur: () => setTimeout(() => { const ed = editorRef.current; if (ed && !ed.isFocused) setBulle(null); }, 120),
  });
  editorRef.current = editor;

  // bulle de sélection (Notion, Flashcard) — rendue dans <body> : la page est agrandie par transform
  function majBulle(ed) {
    const { from, to, empty } = ed.state.selection;
    // une IMAGE sélectionnée a sa propre barre (imageVue.js) : pas de « Notion / Flashcard »
    if (empty || !ed.isFocused || outilRef.current !== 'main' || ed.state.selection instanceof NodeSelection) { setBulle(null); return; }
    try {
      const a = ed.view.coordsAtPos(from), b = ed.view.coordsAtPos(to);
      setBulle({ x: (a.left + b.right) / 2, y: Math.min(a.top, b.top), notion: ed.isActive('notion') });
    } catch (e) { setBulle(null); }
  }

  // chargement
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
      if (focusDemande != null) {
        const pos = Math.max(0, Math.min(Number(focusDemande) || 0, editor.state.doc.content.size));
        editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(pos))));
        editor.view.focus();
      }
      requestAnimationFrame(verifierDebordement);
      if (onPret) onPret(pageId);
    })();
    return () => { vivant = false; };
  }, [editor, pageId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* JOURNAL ANNULER / RÉTABLIR (08/10, lib/journalAnnuler.js) : chaque transaction qui change
     la page est signalée avec l'état d'AVANT et d'APRÈS. Frappe simple = « saisie » (regroupée) ;
     débordement / remontée automatiques (addToHistory: false) = « système », joints à l'action
     qui les a causés ; `groupeJournal` = une même action sur deux pages (image déplacée). */
  useEffect(() => {
    if (!editor) return undefined;
    const surTr = ({ transaction: tr }) => {
      if (!tr.docChanged) return;
      const avant = dernierJSON.current;
      const apres = editor.getJSON();
      dernierJSON.current = apres;
      if (!charge.current || !avant || !rappels.current.onJournal || tr.getMeta('journalIgnorer')) return;
      const systeme = tr.getMeta('addToHistory') === false && !tr.getMeta('journalAction');
      const saisie = !tr.getMeta('uiEvent') && tr.steps.every((st) => {
        const j = st.toJSON();
        if (j.stepType !== 'replace') return false;
        const c = (j.slice && j.slice.content) || [];
        return c.every((n) => n.type === 'text');
      });
      rappels.current.onJournal(pageId, avant, apres, { systeme, saisie, groupe: tr.getMeta('groupeJournal') || null });
    };
    editor.on('transaction', surTr);
    return () => editor.off('transaction', surTr);
  }, [editor, pageId]); // eslint-disable-line react-hooks/exhaustive-deps

  // « Flashcard » depuis le texte d'une image (bulle de imageVue.js)
  useEffect(() => {
    const z = zoneRef.current;
    if (!z) return undefined;
    const f = (e) => { if (e.detail && e.detail.texte) rappels.current.onFlashcard(e.detail.texte); };
    z.addEventListener('pti-flashcard', f);
    return () => z.removeEventListener('pti-flashcard', f);
  }, []);

  /* (08/10) la hauteur du texte change SANS transaction (image qui finit de se charger,
     redimensionnée, police chargée) : on revérifie le débordement — une image qui ne tient
     plus part sur la page suivante, jamais coupée en bas de page. */
  useEffect(() => {
    if (!editor) return undefined;
    const dom = editor.view.dom;
    let raf = null;
    const plan = () => { if (!raf) raf = requestAnimationFrame(() => { raf = null; verifierDebordement(); }); };
    dom.addEventListener('pti-taille', plan);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(plan) : null;
    if (ro) ro.observe(dom);
    return () => { dom.removeEventListener('pti-taille', plan); if (ro) ro.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

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

  useImperativeHandle(ref, () => ({
    editor,
    vider,
    /** journal (annuler / rétablir) : la page reprend cet état, curseur au plus près, puis enregistrée */
    async remplacer(json) {
      if (!editor || editor.isDestroyed) return;
      // images : l'instantané peut porter une adresse d'image déjà libérée (page démontée entre-temps)
      // → on repart du document « sec » (blobId) et on réhydrate
      const { doc, urls: u } = await hydrateDoc(dehydrateDoc(json || EMPTY_DOC));
      urls.current.push(...u);
      if (editor.isDestroyed) return;
      const from = editor.state.selection.from;
      editor.commands.setContent(doc, { emitUpdate: true });
      try { editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(Math.min(from, editor.state.doc.content.size)))).setMeta('addToHistory', false)); } catch (e) { /* ignore */ }
      enAttente.current = editor.getJSON(); vider();
      requestAnimationFrame(verifierDebordement);
    },
    /** fin du relais : rend ce qui a été tapé pendant le passage, et lâche le curseur */
    prendreRelais() {
      const r = relais.current || [];
      relais.current = null;
      if (editor && !editor.isDestroyed) editor.view.dom.blur();
      return r;
    },
    /** rejoue, au curseur, ce qui a été tapé sur la page précédente pendant le passage */
    rejouer(items) {
      if (!editor || editor.isDestroyed || !items.length) return;
      for (const it of items) {
        if (it.texte != null) editor.commands.insertContent(it.texte);
        else if (it.touche === 'Enter') editor.commands.enter();
        else if (it.touche === 'Backspace') editor.commands.deleteSelection() || editor.commands.joinBackward() || editor.commands.command(({ tr, state }) => { const p = state.selection.from; if (p > 1) tr.delete(p - 1, p); return true; });
        else if (it.touche === 'Tab') editor.commands.sinkListItem('listItem') || editor.commands.sinkListItem('taskItem');
      }
    },
    /** blocs arrivés de la page précédente (débordement) : en tête de cette page */
    prefixer(nodes, decal) {
      if (!editor || editor.isDestroyed) return;
      const frag = Fragment.fromJSON(editor.schema, nodes);
      const doc = editor.state.doc;
      const tr = editor.state.tr;
      if (estVide(doc)) tr.replaceWith(0, doc.content.size, frag); else tr.insert(0, frag);
      tr.setMeta('addToHistory', false);
      if (decal != null) tr.setSelection(TextSelection.near(tr.doc.resolve(Math.max(0, Math.min(decal, tr.doc.content.size)))));
      editor.view.dispatch(tr);
      if (decal != null) editor.view.focus();
    },
    /** bloc remonté de la page suivante (retour arrière) : à la fin, collé au dernier bloc */
    suffixer(node) {
      if (!editor || editor.isDestroyed) return;
      const n = editor.schema.nodeFromJSON(node);
      const doc = editor.state.doc;
      const tr = editor.state.tr;
      let curseur;
      if (estVide(doc)) { tr.replaceWith(0, doc.content.size, n); curseur = 1; }
      else {
        const fin = doc.content.size;
        tr.insert(fin, n);
        const der = doc.lastChild;
        if (der && der.isTextblock && n.isTextblock) { tr.join(fin); curseur = fin - 1; } else curseur = fin + 1;
      }
      tr.setMeta('addToHistory', false);
      tr.setSelection(TextSelection.near(tr.doc.resolve(Math.max(0, Math.min(curseur, tr.doc.content.size)))));
      editor.view.dispatch(tr);
      editor.view.focus();
    },
    /** recherche du lecteur : surligne la n-ième occurrence de `q` (dans un même nœud texte,
        comme le JSON l'a comptée) et la centre — sans prendre le focus du champ de recherche */
    montrerOccurrence(q, rang) {
      const dom = editor && editor.view && editor.view.dom;
      const cible = (q || '').toLowerCase();
      if (!dom || !cible) return false;
      const marcheur = document.createTreeWalker(dom, NodeFilter.SHOW_TEXT);
      let n = 0, noeud;
      while ((noeud = marcheur.nextNode())) {
        const t = noeud.nodeValue.toLowerCase();
        let i = t.indexOf(cible);
        while (i !== -1) {
          if (n === rang) {
            const r = document.createRange();
            r.setStart(noeud, i); r.setEnd(noeud, i + cible.length);
            surlignerRecherche(r);
            const el = noeud.parentElement;
            if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
            return true;
          }
          n++; i = t.indexOf(cible, i + 1);
        }
      }
      return false;
    },
    allerANotion(id) {
      const el = editor && editor.view && editor.view.dom.querySelector(`mark[data-notion="${CSS.escape(id)}"]`);
      if (!el) return false;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('cible'); setTimeout(() => el.classList.remove('cible'), 1600);
      return true;
    },
  }), [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  /* SURLIGNEUR (comme sur un PDF) : la sélection devient une NOTION de la couleur choisie */
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

  // clic dans la marge basse : le curseur va à la fin du texte de la page
  const surAppui = (e) => {
    if (e.target !== zoneRef.current || !editor || outil !== 'main') return;
    e.preventDefault();
    editor.chain().focus('end').run();
  };
  /* (08/10) même règle que sur le PDF : repasser le surligneur sur des notions DÉJÀ de
     cette couleur (et rien d'autre) les retire ; d'une autre couleur, les recolore (même
     id : la notion reste la même). Du texte libre dans la sélection → nouvelle notion. */
  const surRelache = () => {
    if (outilRef.current !== 'surligneur') return;
    { const sel = window.getSelection(); const n = sel && sel.anchorNode; const el = n && (n.nodeType === 1 ? n : n.parentElement); if (el && el.closest && el.closest('.pti-texte')) return; }
    const ed = editorRef.current;
    if (!ed || ed.state.selection.empty) return;
    const couleur = rappels.current.couleurSurligneur || 'jaune';
    const { from, to } = ed.state.selection;
    const ids = new Map(); // id → couleur
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

  return (
    <div ref={zoneRef} className={'pt-zone outil-' + outil} data-outil={outil} data-couleur-surligneur={couleurSurligneur || undefined}
      style={{ width: largeur, height: hauteur, transform: `scale(${echelle})`, padding: MARGE_PAGE, '--pt-inv': 1 / (echelle || 1) }}
      onMouseDown={surAppui} onMouseUp={surRelache}
      onPointerDown={() => { const ed = editorRef.current; if (ed && outilRef.current === 'main') rappels.current.onActiver(pageId, ed); }}>
      <EditorContent editor={editor} className="pt-corps" style={{ height: hUtile }} />
      {bulle && createPortal(
        <div className="nd-bulle pt-bulle" style={{ left: bulle.x, top: bulle.y - 8 }} onMouseDown={(e) => e.preventDefault()}>
          {bulle.notion
            ? <button type="button" className="nd-bt nd-bt-txt" onClick={retirerNotion} title="Ce passage n’est plus une notion"><Icon name="x" size={13} /> Retirer la notion</button>
            : <button type="button" className="nd-bt nd-bt-txt" onClick={() => marquerNotion(COULEUR_DEFAUT)} title="Faire de ce passage une notion (mode Notions du panneau)"><Icon name="edit" size={13} /> Notion</button>}
          <button type="button" className="nd-bt nd-bt-txt" onClick={versFlashcard} title="Créer une flashcard à partir de ce passage"><Icon name="cards" size={13} /> Flashcard</button>
        </div>,
        document.body,
      )}
    </div>
  );
}));

/* Réglages propres au TEXTE D'UNE PAGE, glissés dans la barre de mise en forme du lecteur
   (EditToolbar, la même que pour les boîtes de texte) : titres, cases à cocher, citation,
   tableau, séparateur, lien, image. Mêmes boutons `.et-btn` que le reste de la barre. */
export function OutilsTexteDocument({ editor }) {
  const [, force] = useState(0);
  const [lien, setLien] = useState(null);
  useEffect(() => {
    if (!editor) return undefined;
    const maj = () => force((v) => v + 1);
    editor.on('transaction', maj);
    return () => editor.off('transaction', maj);
  }, [editor]);
  if (!editor || editor.isDestroyed) return null;
  const actif = (n, a) => editor.isActive(n, a);
  const run = (f) => f(editor.chain().focus()).run();
  const Bt = ({ titre, on, onClick, children }) => (
    <button type="button" className={'et-btn' + (on ? ' active' : '')} title={titre} aria-label={titre} aria-pressed={on || undefined} onClick={onClick}>{children}</button>
  );
  const image = () => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
    i.onchange = async () => {
      const f = i.files && i.files[0];
      if (!f) return;
      const blobId = await putBlob(f);
      insererImageBloc(editor, { src: URL.createObjectURL(f), blobId });
    };
    i.click();
  };
  const validerLien = () => {
    const h = (lien || '').trim();
    run((c) => (h ? c.extendMarkRange('link').setLink({ href: /^[a-z]+:/i.test(h) ? h : 'https://' + h }) : c.extendMarkRange('link').unsetLink()));
    setLien(null);
  };
  return (
    <>
      <Bt titre="Titre 1" on={actif('heading', { level: 1 })} onClick={() => run((c) => c.toggleHeading({ level: 1 }))}><b>H1</b></Bt>
      <Bt titre="Titre 2" on={actif('heading', { level: 2 })} onClick={() => run((c) => c.toggleHeading({ level: 2 }))}><b>H2</b></Bt>
      <Bt titre="Titre 3" on={actif('heading', { level: 3 })} onClick={() => run((c) => c.toggleHeading({ level: 3 }))}><b>H3</b></Bt>
      <Bt titre="Cases à cocher (⌘⇧9)" on={actif('taskList')} onClick={() => run((c) => c.toggleTaskList())}><Icon name="check" size={13} /></Bt>
      <Bt titre="Citation" on={actif('blockquote')} onClick={() => run((c) => c.toggleBlockquote())}>❝</Bt>
      <Bt titre="Tableau (3 × 3)" on={actif('table')} onClick={() => run((c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }))}><Icon name="grid" size={13} /></Bt>
      {actif('table') && (<>
        <Bt titre="Ajouter une ligne" onClick={() => run((c) => c.addRowAfter())}>+L</Bt>
        <Bt titre="Ajouter une colonne" onClick={() => run((c) => c.addColumnAfter())}>+C</Bt>
        <Bt titre="Supprimer le tableau" onClick={() => run((c) => c.deleteTable())}><Icon name="trash" size={13} /></Bt>
      </>)}
      <Bt titre="Séparateur" onClick={() => run((c) => c.setHorizontalRule())}>—</Bt>
      <Bt titre="Image (ou colle / glisse-la dans le texte)" onClick={image}><Icon name="image" size={13} /></Bt>
      {lien == null
        ? <Bt titre="Lien" on={actif('link')} onClick={() => setLien(editor.getAttributes('link').href || '')}><Icon name="ext" size={13} /></Bt>
        : <input className="et-lien" autoFocus value={lien} placeholder="https://…" onChange={(e) => setLien(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); validerLien(); } if (e.key === 'Escape') { e.stopPropagation(); setLien(null); } }}
            onBlur={() => setLien(null)} />}
    </>
  );
}
