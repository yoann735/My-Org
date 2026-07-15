/* ============================================================
   MedRevise — MODE TRANSCRIPT (onglet Documents). Document texte riche
   (TipTap, LE moteur unique de l'app) : titres/gras/italique/souligné/barré,
   taille, police, couleur, surligneur, listes, alignement, annuler/rétablir.
   - Images collées/importées, stockées en Blob (IndexedDB), redimensionnables.
   - Surlignage cohérent avec le mode Fiche → alimente « notions prioritaires ».
   - « Mes questions » : mark dédiée, repérable + exportable avec contexte.
   - Exports : PDF (texte + images) ET copie du texte (transcript + questions).
   Barre d'outils contextuelle + barre flottante sur la sélection (style Notion).
   Aucun réseau / IA.
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import { Icon } from '../../shared/Icon.jsx';
import { EdTop } from '../components/ui.jsx';
import { getDoc, setDoc, putBlob } from '../lib/storage.js';
import {
  RICH_EXTENSIONS, EMPTY_DOC, hydrateDoc, dehydrateDoc,
  collectHighlights, collectQuestions, docToPlainText, formatPriority,
} from './lib/richtext.js';
import { textToDoc } from './lib/transcript.js';
import { exportTranscriptPdf } from './lib/exportPdf.js';

const HL_COLORS = [
  { id: 'jaune', hex: '#FFE066' },
  { id: 'vert', hex: '#A6E3A1' },
  { id: 'bleu', hex: '#9BD3FF' },
  { id: 'rose', hex: '#F9A8D4' },
];
const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px'];
const FONT_FAMILIES = ['inherit', 'serif', 'sans-serif', 'monospace', 'Georgia', 'Arial'];

export function TranscriptEditor({ ctx }) {
  const { transcriptView, db } = ctx;
  const fiche = db.fiches.find((f) => f.id === (transcriptView && transcriptView.ficheId));

  const [mode, setMode] = useState('edit'); // read | edit
  const [panelOpen, setPanelOpen] = useState(true);
  const [snapshot, setSnapshot] = useState(EMPTY_DOC); // JSON courant (pour panneau + exports)
  const [loaded, setLoaded] = useState(false);
  const [float, setFloat] = useState(null); // barre flottante { x, y }
  const [hlOpen, setHlOpen] = useState(false); // sous-menu couleurs de surligneur (flottant)
  const [copiedCount, setCopiedCount] = useState(0);
  const [copiedText, setCopiedText] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);

  const objectUrls = useRef([]);
  const saveTimer = useRef(null);
  const insertRef = useRef(null);
  const pendingSave = useRef(null); // { ficheId, content } en attente de flush
  const loadedRef = useRef(false);  // ne jamais persister avant le chargement initial

  const doSave = (ed) => {
    if (!fiche || !loadedRef.current) return; // garde : pas de save tant que non chargé
    const json = ed.getJSON();
    setSnapshot(json);
    const content = dehydrateDoc(json);
    pendingSave.current = { ficheId: fiche.id, content };
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (pendingSave.current) { setDoc(pendingSave.current.ficheId, pendingSave.current.content); pendingSave.current = null; }
    }, 400);
  };

  // écrit immédiatement une sauvegarde en attente (sortie d'écran / démontage) — la
  // spec exige un save À LA SORTIE en plus du debounce, sinon les dernières frappes
  // (dans la fenêtre de debounce) sont perdues au « Retour ».
  const flushSave = () => {
    clearTimeout(saveTimer.current);
    if (pendingSave.current) { setDoc(pendingSave.current.ficheId, pendingSave.current.content); pendingSave.current = null; }
  };

  const editor = useEditor({
    extensions: RICH_EXTENSIONS,
    content: EMPTY_DOC,
    editable: mode === 'edit',
    onUpdate: ({ editor: ed }) => doSave(ed),
    onSelectionUpdate: ({ editor: ed }) => updateFloat(ed),
    editorProps: {
      handlePaste: (view, event) => {
        const items = (event.clipboardData && event.clipboardData.items) || [];
        for (const it of items) {
          if (it.type && it.type.startsWith('image/')) { const f = it.getAsFile(); if (f && insertRef.current) { insertRef.current(f); return true; } }
        }
        return false;
      },
      handleDrop: (view, event) => {
        const f = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
        if (f && f.type && f.type.startsWith('image/') && insertRef.current) { insertRef.current(f); return true; }
        return false;
      },
    },
  }, [fiche && fiche.id]);

  // insertion d'une image : octets en Blob (IndexedDB), object-URL transitoire pour l'affichage
  useEffect(() => {
    insertRef.current = async (file) => {
      if (!editor || !file || !file.type || !file.type.startsWith('image/')) return;
      const blobId = await putBlob(file);
      const url = URL.createObjectURL(file);
      objectUrls.current.push(url);
      editor.chain().focus().setImage({ src: url, blobId }).run();
    };
  }, [editor]);

  // chargement initial : hydrate le doc (src des images depuis les blobs) puis l'injecte
  useEffect(() => {
    let cancelled = false;
    setLoaded(false); loadedRef.current = false;
    if (!editor || !fiche) return;
    (async () => {
      const rec = await getDoc(fiche.id);
      const source = (rec && rec.content) || textToDoc(fiche.originalText || '');
      const { doc, urls } = await hydrateDoc(source);
      if (cancelled) return;
      objectUrls.current.push(...urls);
      editor.commands.setContent(doc, { emitUpdate: false }); // chargement : ne pas déclencher d'autosave
      setSnapshot(doc);
      setLoaded(true);
      loadedRef.current = true; // à partir d'ici seulement, les frappes sont persistées
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, fiche && fiche.id]);

  // sauvegarde garantie à la sortie de l'écran (démontage) : flush du save en attente.
  useEffect(() => () => flushSave(), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (editor) editor.setEditable(mode === 'edit'); }, [mode, editor]);

  // révoque les object-URL des images à la fermeture
  useEffect(() => () => { objectUrls.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } }); }, []);

  // barre flottante : positionnée sur la sélection réelle (rect DOM), jamais un span entier
  const updateFloat = (ed) => {
    if (!ed || !ed.isEditable) { setFloat(null); setHlOpen(false); return; }
    const sel = ed.state.selection;
    if (sel.empty) { setFloat(null); setHlOpen(false); return; }
    const dsel = window.getSelection();
    if (!dsel || !dsel.rangeCount) { setFloat(null); return; }
    const r = dsel.getRangeAt(0).getBoundingClientRect();
    if (!r.width && !r.height) { setFloat(null); return; }
    setFloat({ x: r.left + r.width / 2, y: r.top });
  };

  // raccourcis : Échap ferme la barre flottante (undo/redo gérés par TipTap)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { setFloat(null); setHlOpen(false); setConfirmRestore(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const highlights = useMemo(() => collectHighlights(snapshot), [snapshot]);
  const questions = useMemo(() => collectQuestions(snapshot), [snapshot]);

  const copyPriority = async () => {
    if (!highlights.length) return;
    try {
      await navigator.clipboard.writeText(formatPriority(highlights));
      setCopiedCount(highlights.length);
      setTimeout(() => setCopiedCount(0), 2200);
    } catch (e) { /* ignore */ }
  };
  const copyLabel = copiedCount
    ? `${copiedCount} notion${copiedCount > 1 ? 's' : ''} copiée${copiedCount > 1 ? 's' : ''}`
    : 'Copier les notions prioritaires';
  const copyTitle = highlights.length
    ? 'Copie le texte des passages surlignés, prêt à coller dans un chat'
    : 'Aucune notion surlignée — surligne du texte pour activer ce bouton';

  const copyFullText = async () => {
    const base = docToPlainText(snapshot);
    let text = base;
    if (questions.length) {
      text += '\n\nMES QUESTIONS :\n' + questions.map((q, i) => `${i + 1}. ${q.texte}${q.context ? `  (contexte : ${q.context})` : ''}`).join('\n');
    }
    try { await navigator.clipboard.writeText(text); setCopiedText(true); setTimeout(() => setCopiedText(false), 1800); } catch (e) { /* ignore */ }
  };

  const exportPdf = async () => {
    if (!fiche || exporting) return;
    setExporting(true);
    try {
      const blob = await exportTranscriptPdf(fiche, dehydrateDoc(snapshot));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${(fiche.titre || 'transcript').replace(/[\\/:*?"<>|]/g, '')}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } finally { setExporting(false); }
  };

  const restoreOriginal = async () => {
    if (!editor || !fiche) return;
    const { doc, urls } = await hydrateDoc(textToDoc(fiche.originalText || ''));
    objectUrls.current.push(...urls);
    editor.commands.setContent(doc, { emitUpdate: true }); // rétablir → déclenche la sauvegarde
    setSnapshot(doc);
    setConfirmRestore(false);
  };

  const pickImage = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = () => { if (input.files && input.files[0] && insertRef.current) insertRef.current(input.files[0]); };
    input.click();
  };

  const back = () => { flushSave(); ctx.closeTranscript(); };

  if (!fiche) {
    return (
      <div className="screen scroll fadein">
        <div className="hint">Document introuvable.</div>
        <button className="btn" style={{ marginTop: 12 }} onClick={back}><Icon name="chevL" size={14} /> Retour</button>
      </div>
    );
  }

  return (
    <div className="screen scroll fadein">
      <div className="topbar">
        <div>
          <h1 className="serif">{fiche.titre}</h1>
          <div className="sub">Transcript · document texte riche</div>
        </div>
        <EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} />
      </div>

      {/* barre d'outils CONTEXTUELLE (mode transcript uniquement) */}
      <div className="pdfr-toolbar">
        <button className="btn ghost sm" onClick={back}><Icon name="chevL" size={14} /> Retour</button>
        <div className="seg" style={{ marginLeft: 4 }}>
          <button type="button" className={'seg-btn' + (mode === 'read' ? ' active' : '')} onClick={() => setMode('read')}><Icon name="book" size={13} /> Lecture</button>
          <button type="button" className={'seg-btn' + (mode === 'edit' ? ' active' : '')} onClick={() => setMode('edit')}><Icon name="edit" size={13} /> Édition</button>
        </div>

        {mode === 'edit' && (
          <>
            <button className="icon-btn sm" title="Insérer une image" onClick={pickImage}><Icon name="image" size={15} /></button>
            <button className="icon-btn sm" title="Annuler (Ctrl/Cmd+Z)" onClick={() => editor && editor.chain().focus().undo().run()}><Icon name="refresh" size={14} style={{ transform: 'scaleX(-1)' }} /></button>
            <button className="icon-btn sm" title="Rétablir" onClick={() => editor && editor.chain().focus().redo().run()}><Icon name="refresh" size={14} /></button>
          </>
        )}

        <div style={{ flex: 1 }} />

        <button className="btn ghost sm" onClick={() => setPanelOpen((v) => !v)} title="Panneau">
          <Icon name={panelOpen ? 'chevR' : 'chevL'} size={13} /> Panneau
        </button>
        <span title={copyTitle} style={{ display: 'inline-flex' }}>
          <button className="btn sm" onClick={copyPriority} disabled={!highlights.length}><Icon name={copiedCount ? 'check' : 'copy'} size={13} /> {copyLabel}</button>
        </span>
        <button className="btn ghost sm" onClick={copyFullText}><Icon name={copiedText ? 'check' : 'copy'} size={13} /> {copiedText ? 'Texte copié' : 'Copier le texte'}</button>
        <button className="btn ghost sm" onClick={exportPdf} disabled={exporting}><Icon name="filePdf" size={13} /> {exporting ? 'Export…' : 'Exporter PDF'}</button>
      </div>

      {/* barre de mise en forme FIXE (édition) : surligner + souligner + le reste,
          visibles en permanence — même mécanique que le mode Fiche (barre non
          flottante), en plus de la barre flottante Notion sur la sélection. */}
      {mode === 'edit' && editor && <TranscriptFormatBar editor={editor} />}

      <div className="pdfr-body">
        <div className="pdfr-scroll" style={{ padding: '20px 0' }}>
          {!loaded && <div className="gen-spinner" style={{ width: 36, height: 36, margin: '40px auto' }} />}
          <div className="rt-page" style={{ opacity: loaded ? 1 : 0 }}>
            <EditorContent editor={editor} className={'rt-editor' + (mode === 'read' ? ' readonly' : '')} />
          </div>
        </div>

        {panelOpen && (
          <div className="pdfr-panel">
            <h3 className="serif">Notions surlignées</h3>
            <span title={copyTitle} style={{ display: 'block' }}>
              <button className="btn sm" onClick={copyPriority} disabled={!highlights.length} style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }}>
                <Icon name={copiedCount ? 'check' : 'copy'} size={13} /> {copyLabel}
              </button>
            </span>
            {highlights.length === 0 && <div className="hint">Surligne du texte pour le retrouver ici.</div>}
            {highlights.map((h, i) => (
              <div className="hl-entry" key={'h' + i}>
                <span className="hl-dot" style={{ background: HL_COLORS[0].hex }} />
                <div><div className="hl-entry-txt">« {h.texte.length > 140 ? h.texte.slice(0, 140) + '…' : h.texte} »</div></div>
              </div>
            ))}

            <h3 className="serif" style={{ marginTop: 18 }}>Mes questions</h3>
            {questions.length === 0 && <div className="hint">Sélectionne une question (souvent entre parenthèses) puis « ? » dans la barre flottante.</div>}
            {questions.map((q, i) => (
              <div className="hl-entry" key={'q' + i}>
                <span className="hl-dot" style={{ background: 'var(--accent)' }} />
                <div><div className="hl-entry-txt">{q.texte}</div>{q.context && q.context !== q.texte && <div className="hl-entry-page">{q.context.length > 90 ? q.context.slice(0, 90) + '…' : q.context}</div>}</div>
              </div>
            ))}

            <div style={{ marginTop: 18, borderTop: '1px solid var(--border-2)', paddingTop: 12 }}>
              {!confirmRestore ? (
                <button className="btn ghost sm" onClick={() => setConfirmRestore(true)} disabled={!fiche.originalText}><Icon name="refresh" size={13} /> Rétablir le texte d'origine</button>
              ) : (
                <div className="err-mini" style={{ marginBottom: 0 }}>
                  <div className="em-ic crit"><Icon name="alert" size={16} /></div>
                  <div className="em-body">
                    <div className="em-title" style={{ fontWeight: 500 }}>Remplacer par le transcript brut d'origine ?</div>
                    <div className="row" style={{ gap: 8, marginTop: 8 }}>
                      <button className="btn sm" onClick={restoreOriginal}>Oui, rétablir</button>
                      <button className="btn ghost sm" onClick={() => setConfirmRestore(false)}>Annuler</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {mode === 'edit' && float && editor && createPortal(
        <FloatingToolbar editor={editor} pos={float} hlOpen={hlOpen} setHlOpen={setHlOpen} />,
        document.body,
      )}
    </div>
  );
}

/* barre de mise en forme FIXE (mode édition) : rend le surlignage et le soulignement
   toujours accessibles (le mode Fiche a une barre fixe équivalente). Pilote la MÊME
   instance TipTap que l'éditeur et la barre flottante — aucun second éditeur. */
function TranscriptFormatBar({ editor }) {
  const [, force] = useState(0);
  const [hlOpen, setHlOpen] = useState(false);
  useEffect(() => {
    const rerender = () => force((v) => v + 1);
    editor.on('transaction', rerender);
    return () => editor.off('transaction', rerender);
  }, [editor]);

  const active = (n, a) => editor.isActive(n, a);
  const run = (fn) => fn(editor.chain().focus()).run();
  const keep = (e) => e.preventDefault(); // ne pas blurer/collapser la sélection

  return (
    <div className="pdfr-edit-toolbar">
      <button type="button" className={'et-btn' + (active('bold') ? ' active' : '')} title="Gras" onMouseDown={keep} onClick={() => run((c) => c.toggleBold())}><b>G</b></button>
      <button type="button" className={'et-btn' + (active('italic') ? ' active' : '')} title="Italique" onMouseDown={keep} onClick={() => run((c) => c.toggleItalic())}><i>I</i></button>
      <button type="button" className={'et-btn' + (active('underline') ? ' active' : '')} title="Souligné" onMouseDown={keep} onClick={() => run((c) => c.toggleUnderline())}><u>U</u></button>
      <button type="button" className={'et-btn' + (active('strike') ? ' active' : '')} title="Barré" onMouseDown={keep} onClick={() => run((c) => c.toggleStrike())}><s>S</s></button>
      <span className="et-sep" />
      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <button type="button" className={'et-btn' + (active('highlight') ? ' active' : '')} title="Surligner" onMouseDown={keep} onClick={() => setHlOpen((v) => !v)}><Icon name="edit" size={13} /></button>
        {hlOpen && (
          <div className="rt-hlmenu" style={{ top: '110%' }}>
            {HL_COLORS.map((c) => (
              <button key={c.id} type="button" className="hl-swatch" style={{ background: c.hex }} title={c.id}
                onMouseDown={keep} onClick={() => { run((ch) => ch.setHighlight({ color: c.hex })); setHlOpen(false); }} />
            ))}
            <button type="button" className="et-btn" title="Retirer le surlignage" onMouseDown={keep} onClick={() => { run((ch) => ch.unsetHighlight()); setHlOpen(false); }}><Icon name="x" size={12} /></button>
          </div>
        )}
      </div>
      <label className="et-btn" title="Couleur du texte" style={{ position: 'relative', overflow: 'hidden' }} onMouseDown={keep}>
        <span style={{ color: 'var(--accent)', fontWeight: 800 }}>A</span>
        <input type="color" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} onChange={(e) => run((c) => c.setColor(e.target.value))} />
      </label>
      <span className="et-sep" />
      <select className="et-select" defaultValue="" onMouseDown={keep} onChange={(e) => { if (e.target.value) run((c) => c.setFontSize(e.target.value)); e.target.value = ''; }} title="Taille">
        <option value="" disabled>Taille</option>
        {FONT_SIZES.map((s) => <option key={s} value={s}>{s.replace('px', '')}</option>)}
      </select>
      <select className="et-select" defaultValue="" onMouseDown={keep} onChange={(e) => { if (e.target.value) run((c) => c.setFontFamily(e.target.value)); e.target.value = ''; }} title="Police">
        <option value="" disabled>Police</option>
        {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      <span className="et-sep" />
      <button type="button" className={'et-btn' + (active('bulletList') ? ' active' : '')} title="Liste à puces" onMouseDown={keep} onClick={() => run((c) => c.toggleBulletList())}><Icon name="list" size={13} /></button>
      <select className="et-select" defaultValue="" onMouseDown={keep} onChange={(e) => { if (e.target.value) run((c) => c.setTextAlign(e.target.value)); e.target.value = ''; }} title="Alignement">
        <option value="" disabled>Alignement</option>
        <option value="left">Gauche</option>
        <option value="center">Centre</option>
        <option value="right">Droite</option>
      </select>
      <span className="et-sep" />
      <button type="button" className={'et-btn' + (active('studentQuestion') ? ' active' : '')} title="Marquer comme MA question" onMouseDown={keep} onClick={() => run((c) => c.toggleStudentQuestion())} style={{ fontWeight: 800 }}>?</button>
    </div>
  );
}

/* barre flottante style Notion, ancrée au-dessus de la sélection. Pilote la MÊME
   instance TipTap. La sélection ProseMirror persiste au blur → chain().focus() la
   restaure ; on ne met preventDefault QUE sur les boutons (les <select>/color natifs
   doivent, eux, recevoir le clic pour s'ouvrir). Aucun handler « clic extérieur » :
   la barre ne se ferme que sur changement de sélection (updateFloat) ou Échap. */
function FloatingToolbar({ editor, pos, hlOpen, setHlOpen }) {
  const [, force] = useState(0);
  useEffect(() => {
    const rerender = () => force((v) => v + 1);
    editor.on('transaction', rerender);
    return () => editor.off('transaction', rerender);
  }, [editor]);

  const active = (n, a) => editor.isActive(n, a);
  const run = (fn) => fn(editor.chain().focus()).run();
  const keep = (e) => e.preventDefault(); // boutons : ne pas blurer/collapser la sélection DOM

  const Btn = ({ mark, attrs, title, onClick, children, style }) => (
    <button type="button" className={'rt-fb' + (mark && active(mark, attrs) ? ' on' : '')} title={title}
      style={style} onMouseDown={keep} onClick={onClick}>{children}</button>
  );

  return (
    <div className="rt-float" style={{ left: Math.max(8, Math.min(pos.x, window.innerWidth - 8)), top: pos.y }}>
      <Btn mark="bold" title="Gras" onClick={() => run((c) => c.toggleBold())}><b>G</b></Btn>
      <Btn mark="italic" title="Italique" onClick={() => run((c) => c.toggleItalic())}><i>I</i></Btn>
      <Btn mark="underline" title="Souligné" onClick={() => run((c) => c.toggleUnderline())}><u>U</u></Btn>
      <Btn mark="strike" title="Barré" onClick={() => run((c) => c.toggleStrike())}><s>S</s></Btn>
      <span className="rt-fsep" />
      <div style={{ position: 'relative' }}>
        <Btn mark="highlight" title="Surligner" onClick={() => setHlOpen((v) => !v)}><Icon name="edit" size={13} /></Btn>
        {hlOpen && (
          <div className="rt-hlmenu">
            {HL_COLORS.map((c) => (
              <button key={c.id} type="button" className="hl-swatch" style={{ background: c.hex }} title={c.id}
                onMouseDown={keep} onClick={() => { run((ch) => ch.setHighlight({ color: c.hex })); setHlOpen(false); }} />
            ))}
            <button type="button" className="rt-fb" title="Retirer" onMouseDown={keep} onClick={() => { run((ch) => ch.unsetHighlight()); setHlOpen(false); }}><Icon name="x" size={12} /></button>
          </div>
        )}
      </div>
      <label className="rt-fb" title="Couleur du texte" style={{ position: 'relative', overflow: 'hidden' }}>
        <span style={{ color: 'var(--accent)', fontWeight: 800 }}>A</span>
        <input type="color" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} onChange={(e) => run((c) => c.setColor(e.target.value))} />
      </label>
      <span className="rt-fsep" />
      <select className="rt-fsel" defaultValue="" onChange={(e) => { if (e.target.value) run((c) => c.setFontSize(e.target.value)); e.target.value = ''; }} title="Taille">
        <option value="" disabled>T</option>
        {FONT_SIZES.map((s) => <option key={s} value={s}>{s.replace('px', '')}</option>)}
      </select>
      <select className="rt-fsel" defaultValue="" onChange={(e) => { if (e.target.value) run((c) => c.setFontFamily(e.target.value)); e.target.value = ''; }} title="Police">
        <option value="" disabled>Aa</option>
        {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      <span className="rt-fsep" />
      <Btn mark="bulletList" title="Liste à puces" onClick={() => run((c) => c.toggleBulletList())}><Icon name="list" size={13} /></Btn>
      <select className="rt-fsel" defaultValue="" onChange={(e) => { if (e.target.value) run((c) => c.setTextAlign(e.target.value)); e.target.value = ''; }} title="Alignement">
        <option value="" disabled>≡</option>
        <option value="left">Gauche</option>
        <option value="center">Centre</option>
        <option value="right">Droite</option>
      </select>
      <span className="rt-fsep" />
      <Btn mark="studentQuestion" title="Marquer comme MA question" onClick={() => run((c) => c.toggleStudentQuestion())} style={{ fontWeight: 800 }}>?</Btn>
    </div>
  );
}
