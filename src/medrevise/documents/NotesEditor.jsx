/* ============================================================
   MedRevise — DOCUMENT DE NOTES (07/10, docs/compte-rendu-position-document-tablette.md).

   Éditeur riche « façon document » — LE moteur unique de l'app (documents/lib/richtext.js,
   NOTES_EXTENSIONS : TipTap/ProseMirror) :
   - titres H1–H3, gras / italique / souligné / barré / surlignage, listes à puces,
     numérotées, cases à cocher, tableaux simples, citations, séparateurs, liens, images
     collées (⌘V) ou glissées — stockées en blobs IndexedDB, jamais en base64 dans le JSON ;
   - raccourcis standards (⌘B, ⌘I, ⌘U, ⌘⇧7 / ⌘⇧8 / ⌘⇧9 listes) et saisie Markdown
     (« # », « ## », « - », « 1. », « [] », « > », « --- ») ;
   - barre FIXE compacte + barre FLOTTANTE à la sélection (gras, italique, souligné,
     surligner, lien, → Notion, → Flashcard).
   Contenu : JSON ProseMirror, sauvegarde continue (800 ms) dans le store `notes_doc`
   (synchronisé). Utilisé en plein écran (cours sans PDF) et comme mode « Notes » du panneau
   d'un cours PDF (`compact`).
   ============================================================ */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Icon } from '../../shared/Icon.jsx';
import { putBlob, genId, getBlob, getOne } from '../lib/storage.js';
import { insererImageBloc, limiteSous } from './lib/imageVue.js';
import { NOTES_EXTENSIONS, EMPTY_DOC, hydrateDoc, dehydrateDoc } from './lib/richtext.js';
import { lireNotesDoc, ecrireNotesDoc } from './lib/notesDoc.js';
import '../../styles/notes-doc.css';

const DELAI_SAUVEGARDE = 800;

export const NotesEditor = forwardRef(function NotesEditor({
  ficheId, compact = false, placeholder = 'Commence à écrire… « # » titre, « - » liste, « [] » case à cocher',
  onCreerNotion = null, onCreerFlashcard = null, onChange = null, onPret = null, conteneurRef = null,
}, ref) {
  const [pret, setPret] = useState(false);
  const urls = useRef([]);
  const minuteur = useRef(null);
  const enAttente = useRef(null);
  const chargeRef = useRef(false);
  const ficheRef = useRef(ficheId); ficheRef.current = ficheId;
  const [lienOuvert, setLienOuvert] = useState(null); // { href }
  const [etat, setEtat] = useState('enregistré'); // enregistré | modifié

  const sauver = (json) => {
    if (!chargeRef.current) return; // jamais avant le chargement initial
    const contenu = dehydrateDoc(json);
    ecrireNotesDoc(ficheRef.current, contenu).then(() => setEtat('enregistré')).catch(() => {});
    if (onChange) onChange(contenu);
  };
  const vider = () => {
    if (minuteur.current) { clearTimeout(minuteur.current); minuteur.current = null; }
    if (enAttente.current) { const j = enAttente.current; enAttente.current = null; sauver(j); }
  };

  /* images : collées ou glissées → blob IndexedDB (id dans le nœud), src = URL transitoire */
  /* (10/10) toujours un BLOC du flux, comme dans un document (documents/lib/imageVue.js) :
     au curseur, ou à la limite de bloc la plus proche du point de dépôt */
  const insererImage = async (editeur, fichier, pos = null, blobIdExistant = null) => {
    if (!fichier || !/^image\//.test(fichier.type || 'image/png')) return false;
    const blobId = blobIdExistant || await putBlob(fichier);
    const url = URL.createObjectURL(fichier); urls.current.push(url);
    return insererImageBloc(editeur, { src: url, blobId }, pos);
  };
  // un DESSIN du téléphone glissé depuis « Dessins » (pdf/OngletDessins.jsx) : son blob, réutilisé
  const deposerDessin = async (editeur, id, pos) => {
    const d = await getOne('dessins', id);
    const blob = d && d.blobId ? await getBlob(d.blobId) : null;
    if (!blob) return false;
    return insererImage(editeur, blob.type ? blob : new Blob([blob], { type: 'image/png' }), pos, d.blobId);
  };
  const editorRef = useRef(null);

  const editor = useEditor({
    extensions: NOTES_EXTENSIONS,
    content: EMPTY_DOC,
    editable: false,
    editorProps: {
      attributes: { class: 'nd-prose' + (compact ? ' compact' : ''), 'data-placeholder': placeholder, spellcheck: 'true' },
      handlePaste: (view, event) => {
        const f = [...((event.clipboardData && event.clipboardData.files) || [])].find((x) => /^image\//.test(x.type));
        if (!f || !editorRef.current) return false;
        event.preventDefault();
        insererImage(editorRef.current, f);
        return true;
      },
      handleDrop: (view, event, slice, moved) => {
        if (moved || !editorRef.current) return false;
        const idDessin = event.dataTransfer && event.dataTransfer.getData('application/x-medrevise-dessin');
        if (idDessin) {
          event.preventDefault();
          deposerDessin(editorRef.current, idDessin, limiteSous(editorRef.current, event.clientX, event.clientY).pos);
          return true;
        }
        const f = [...((event.dataTransfer && event.dataTransfer.files) || [])].find((x) => /^image\//.test(x.type));
        if (!f) return false;
        event.preventDefault();
        insererImage(editorRef.current, f, limiteSous(editorRef.current, event.clientX, event.clientY).pos);
        return true;
      },
      handleKeyDown: (view, event) => {
        // ⌘⇧9 : liste de cases à cocher (⌘⇧7 / ⌘⇧8 sont fournis par les listes)
        if ((event.metaKey || event.ctrlKey) && event.shiftKey && (event.key === '9' || event.code === 'Digit9') && editorRef.current) {
          event.preventDefault(); editorRef.current.chain().focus().toggleTaskList().run(); return true;
        }
        if ((event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'K') && editorRef.current) {
          event.preventDefault(); setLienOuvert({ href: editorRef.current.getAttributes('link').href || '' }); return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (!chargeRef.current) return;
      setEtat('modifié');
      enAttente.current = ed.getJSON();
      clearTimeout(minuteur.current);
      minuteur.current = setTimeout(vider, DELAI_SAUVEGARDE);
    },
  });
  editorRef.current = editor;

  // chargement (et rechargement si le document change d'id)
  useEffect(() => {
    if (!editor) return undefined;
    let vivant = true;
    chargeRef.current = false;
    (async () => {
      const rec = await lireNotesDoc(ficheId);
      const { doc, urls: u } = await hydrateDoc(rec && rec.content ? rec.content : EMPTY_DOC);
      if (!vivant) { u.forEach((x) => URL.revokeObjectURL(x)); return; }
      urls.current.push(...u);
      editor.commands.setContent(doc, { emitUpdate: false });
      editor.setEditable(true);
      chargeRef.current = true;
      setPret(true);
      if (onPret) onPret(editor);
    })();
    return () => { vivant = false; vider(); };
  }, [editor, ficheId]); // eslint-disable-line react-hooks/exhaustive-deps

  // sortie de page / onglet caché : rien ne doit attendre les 800 ms
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

  /* API pour le lecteur : marquer la sélection comme notion, retrouver une notion */
  useImperativeHandle(ref, () => ({
    editor,
    vider,
    allerANotion(id) {
      const racine = editor && editor.view && editor.view.dom;
      const el = racine && racine.querySelector(`mark[data-notion="${CSS.escape(id)}"]`);
      if (!el) return false;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('cible'); setTimeout(() => el.classList.remove('cible'), 1600);
      return true;
    },
  }), [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  const actif = (nom, attrs) => !!(editor && editor.isActive(nom, attrs));
  const run = (f) => { if (editor) f(editor.chain().focus()).run(); };
  const Bt = ({ titre, on, onClick, children, disabled = false }) => (
    <button type="button" className={'nd-bt' + (on ? ' actif' : '')} title={titre} aria-label={titre} aria-pressed={on || undefined} disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} onClick={onClick}>{children}</button>
  );
  const ajouterImage = () => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
    i.onchange = () => { const f = i.files && i.files[0]; if (f && editor) insererImage(editor, f); };
    i.click();
  };
  const marquerNotion = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const texte = editor.state.doc.textBetween(from, to, ' ').trim();
    if (!texte) return;
    const id = genId('nd');
    editor.chain().focus().setMark('notion', { id, couleur: 'ambre' }).run();
    if (onCreerNotion) onCreerNotion({ id, texte });
  };
  const versFlashcard = () => {
    if (!editor || !onCreerFlashcard) return;
    const { from, to } = editor.state.selection;
    const texte = editor.state.doc.textBetween(from, to, ' ').trim();
    if (texte) onCreerFlashcard(texte);
  };

  return (
    <div className={'nd' + (compact ? ' compact' : '')}>
      <div className="nd-barre" role="toolbar" aria-label="Mise en forme">
        <Bt titre="Titre 1" on={actif('heading', { level: 1 })} onClick={() => run((c) => c.toggleHeading({ level: 1 }))}><b>H1</b></Bt>
        <Bt titre="Titre 2" on={actif('heading', { level: 2 })} onClick={() => run((c) => c.toggleHeading({ level: 2 }))}><b>H2</b></Bt>
        <Bt titre="Titre 3" on={actif('heading', { level: 3 })} onClick={() => run((c) => c.toggleHeading({ level: 3 }))}><b>H3</b></Bt>
        <span className="nd-sep" />
        <Bt titre="Gras (⌘B)" on={actif('bold')} onClick={() => run((c) => c.toggleBold())}><b>B</b></Bt>
        <Bt titre="Italique (⌘I)" on={actif('italic')} onClick={() => run((c) => c.toggleItalic())}><i>I</i></Bt>
        <Bt titre="Souligné (⌘U)" on={actif('underline')} onClick={() => run((c) => c.toggleUnderline())}><u>U</u></Bt>
        <Bt titre="Surligner" on={actif('highlight')} onClick={() => run((c) => c.toggleHighlight({ color: '#FFE066' }))}><span className="nd-hl">A</span></Bt>
        <span className="nd-sep" />
        <Bt titre="Liste à puces (⌘⇧8)" on={actif('bulletList')} onClick={() => run((c) => c.toggleBulletList())}><Icon name="list" size={15} /></Bt>
        <Bt titre="Liste numérotée (⌘⇧7)" on={actif('orderedList')} onClick={() => run((c) => c.toggleOrderedList())}><span className="nd-txt">1.</span></Bt>
        <Bt titre="Cases à cocher (⌘⇧9)" on={actif('taskList')} onClick={() => run((c) => c.toggleTaskList())}><Icon name="check" size={15} /></Bt>
        <span className="nd-sep" />
        <Bt titre="Citation" on={actif('blockquote')} onClick={() => run((c) => c.toggleBlockquote())}><span className="nd-txt">❝</span></Bt>
        <Bt titre="Séparateur" onClick={() => run((c) => c.setHorizontalRule())}><span className="nd-txt">—</span></Bt>
        <Bt titre="Tableau (3 × 3)" on={actif('table')} onClick={() => run((c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }))}><Icon name="grid" size={15} /></Bt>
        <Bt titre="Image (ou colle / glisse-la)" onClick={ajouterImage}><Icon name="image" size={15} /></Bt>
        <Bt titre="Lien (⌘K)" on={actif('link')} onClick={() => setLienOuvert({ href: (editor && editor.getAttributes('link').href) || '' })}><Icon name="ext" size={15} /></Bt>
        {actif('table') && (<>
          <span className="nd-sep" />
          <Bt titre="Ajouter une ligne" onClick={() => run((c) => c.addRowAfter())}><span className="nd-txt">+L</span></Bt>
          <Bt titre="Ajouter une colonne" onClick={() => run((c) => c.addColumnAfter())}><span className="nd-txt">+C</span></Bt>
          <Bt titre="Supprimer le tableau" onClick={() => run((c) => c.deleteTable())}><Icon name="trash" size={14} /></Bt>
        </>)}
        <span style={{ flex: 1 }} />
        <span className={'nd-etat' + (etat === 'modifié' ? ' modifie' : '')} aria-live="polite">{pret ? (etat === 'modifié' ? 'Modifications…' : 'Enregistré') : 'Chargement…'}</span>
      </div>
      {lienOuvert && (
        <div className="nd-lien">
          <input autoFocus value={lienOuvert.href} placeholder="https://…" onChange={(e) => setLienOuvert({ href: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); const h = lienOuvert.href.trim(); run((c) => (h ? c.extendMarkRange('link').setLink({ href: /^[a-z]+:/i.test(h) ? h : 'https://' + h }) : c.extendMarkRange('link').unsetLink())); setLienOuvert(null); }
              if (e.key === 'Escape') setLienOuvert(null);
            }} />
          <button type="button" className="btn sm" onClick={() => setLienOuvert(null)}>Fermer</button>
        </div>
      )}
      <div className="nd-defile" ref={conteneurRef}>
        {editor && (
          <BubbleMenu editor={editor} className="nd-bulle" options={{ placement: 'top', offset: 8 }}
            shouldShow={({ editor: ed, state }) => ed.isEditable && !state.selection.empty && !ed.isActive('image')}>
            <button type="button" className={'nd-bt' + (actif('bold') ? ' actif' : '')} title="Gras" onMouseDown={(e) => e.preventDefault()} onClick={() => run((c) => c.toggleBold())}><b>B</b></button>
            <button type="button" className={'nd-bt' + (actif('italic') ? ' actif' : '')} title="Italique" onMouseDown={(e) => e.preventDefault()} onClick={() => run((c) => c.toggleItalic())}><i>I</i></button>
            <button type="button" className={'nd-bt' + (actif('underline') ? ' actif' : '')} title="Souligné" onMouseDown={(e) => e.preventDefault()} onClick={() => run((c) => c.toggleUnderline())}><u>U</u></button>
            <button type="button" className={'nd-bt' + (actif('highlight') ? ' actif' : '')} title="Surligner" onMouseDown={(e) => e.preventDefault()} onClick={() => run((c) => c.toggleHighlight({ color: '#FFE066' }))}><span className="nd-hl">A</span></button>
            <button type="button" className="nd-bt" title="Lien" onMouseDown={(e) => e.preventDefault()} onClick={() => setLienOuvert({ href: (editor && editor.getAttributes('link').href) || '' })}><Icon name="ext" size={14} /></button>
            {onCreerNotion && <button type="button" className="nd-bt nd-bt-txt" title="Faire de ce passage une notion (mode Notions du panneau)" onMouseDown={(e) => e.preventDefault()} onClick={marquerNotion}><Icon name="edit" size={13} /> Notion</button>}
            {onCreerFlashcard && <button type="button" className="nd-bt nd-bt-txt" title="Créer une flashcard à partir de ce passage" onMouseDown={(e) => e.preventDefault()} onClick={versFlashcard}><Icon name="cards" size={13} /> Flashcard</button>}
          </BubbleMenu>
        )}
        <EditorContent editor={editor} className="nd-page" />
      </div>
    </div>
  );
});
