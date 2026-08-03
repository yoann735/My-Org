/* ============================================================
   MedRevise — "Voir les prompts" (vue cours, à côté de "Tout exporter") : les
   4 prompts de complétion (Mathématiques/Physique/Chimie/Biologie) que
   l'utilisateur colle dans un chat externe avec l'export "Tout exporter".
   Ce bouton ne génère RIEN : il copie/affiche/édite un texte figé, réutilise
   le même mécanisme presse-papier que "Tout exporter" (navigator.clipboard).

   Contenu par défaut = DEFAULT_PROMPTS (lib/coursePrompts.js, figé, fourni par
   l'utilisateur). Une surcharge éditée par l'utilisateur (ctx.promptOverrides,
   persistée via outbox durable — storage.js#getCoursePrompts/setCoursePrompts)
   prime toujours sur le défaut ; "Réinitialiser" retire la surcharge.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../shared/Icon.jsx';
import { Modal } from './ui.jsx';
import { SUBJECTS, DEFAULT_PROMPTS } from '../lib/coursePrompts.js';

const effectiveText = (ctx, id) => (ctx.promptOverrides && ctx.promptOverrides[id]) || DEFAULT_PROMPTS[id];

async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; }
}

export function CoursePromptsButton({ ctx }) {
  const [pop, setPop] = useState(null); // { top, left }
  const [copiedId, setCopiedId] = useState(null);
  const [modalState, setModalState] = useState(null); // { subject, mode: 'view'|'edit' }
  const btnRef = useRef(null);

  const openPop = () => {
    const r = btnRef.current.getBoundingClientRect();
    setPop({ top: r.bottom + 8, left: Math.min(r.left, window.innerWidth - 300) });
  };

  useEffect(() => {
    if (!pop) return;
    const onDown = (e) => { if (!(e.target.closest && e.target.closest('.cpm-pop'))) setPop(null); };
    const onKey = (e) => { if (e.key === 'Escape') setPop(null); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [pop]);

  const copySubject = async (id) => {
    if (await copyToClipboard(effectiveText(ctx, id))) {
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1800);
    }
  };

  return (
    <>
      <button ref={btnRef} type="button" className="btn ghost sm" onClick={openPop} title="Les 4 prompts de complétion à coller dans un chat externe">
        <Icon name="sparkle" size={13} /> Voir les prompts
      </button>

      {pop && createPortal(
        <div className="cpm-pop" style={{ top: pop.top, left: pop.left }}>
          <div className="cpm-pop-title">Prompts de complétion</div>
          {SUBJECTS.map((s) => (
            <div key={s.id} className="cpm-row">
              <button type="button" className="cpm-copy" onClick={() => copySubject(s.id)} title="Copier ce prompt">
                <Icon name={copiedId === s.id ? 'check' : 'copy'} size={13} style={copiedId === s.id ? { color: 'var(--ok)' } : undefined} />
                {copiedId === s.id ? 'Copié ✓' : s.label}
              </button>
              <button type="button" className="cd-ic" title="Voir en entier" onClick={() => { setPop(null); setModalState({ subject: s.id, mode: 'view' }); }}><Icon name="ext" size={13} /></button>
              <button type="button" className="cd-ic" title="Modifier" onClick={() => { setPop(null); setModalState({ subject: s.id, mode: 'edit' }); }}><Icon name="edit" size={13} /></button>
            </div>
          ))}
          <button type="button" className="btn ghost sm" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
            onClick={() => { setPop(null); setModalState({ subject: SUBJECTS[0].id, mode: 'edit' }); }}>
            <Icon name="sliders" size={13} /> Modifier les 4
          </button>
        </div>,
        document.body,
      )}

      {modalState && (
        <PromptModal ctx={ctx} initial={modalState} onClose={() => setModalState(null)} />
      )}
    </>
  );
}

function PromptModal({ ctx, initial, onClose }) {
  const [subject, setSubject] = useState(initial.subject);
  const [mode, setMode] = useState(initial.mode);
  const [editText, setEditText] = useState(() => effectiveText(ctx, initial.subject));
  const [copied, setCopied] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // resynchronise le brouillon d'édition quand on change de matière — la surcharge
  // éventuelle (ou le défaut) de la matière NOUVELLEMENT active fait foi.
  useEffect(() => { setEditText(effectiveText(ctx, subject)); }, [subject]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasOverride = !!(ctx.promptOverrides && ctx.promptOverrides[subject]);
  const isDirty = mode === 'edit' && editText !== effectiveText(ctx, subject);

  // enregistre le brouillon en cours AVANT de changer de matière ou de fermer —
  // on ne perd jamais une modification en cours de frappe (pas de prompt de
  // confirmation fragile, juste un flush systématique).
  const flush = async () => { if (isDirty) await ctx.savePromptOverride(subject, editText); };
  const switchSubject = async (next) => { await flush(); setSubject(next); };
  const close = async () => { await flush(); onClose(); };

  const save = async () => {
    await ctx.savePromptOverride(subject, editText);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1600);
  };
  const reset = async () => {
    await ctx.resetPromptOverride(subject);
    setEditText(DEFAULT_PROMPTS[subject]);
  };
  const copy = async () => {
    if (await copyToClipboard(mode === 'edit' ? editText : effectiveText(ctx, subject))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const label = (SUBJECTS.find((s) => s.id === subject) || {}).label || '';

  return (
    <Modal title={`Prompt — ${label}`} onClose={close} width="min(720px, 94vw)">
      <div className="row spread" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div className="seg">
          {SUBJECTS.map((s) => (
            <button key={s.id} type="button" className={'seg-btn' + (subject === s.id ? ' active' : '')} onClick={() => switchSubject(s.id)}>{s.label}</button>
          ))}
        </div>
        <div className="seg">
          <button type="button" className={'seg-btn' + (mode === 'view' ? ' active' : '')} onClick={() => setMode('view')}><Icon name="book" size={13} /> Lecture</button>
          <button type="button" className={'seg-btn' + (mode === 'edit' ? ' active' : '')} onClick={() => setMode('edit')}><Icon name="edit" size={13} /> Modifier</button>
        </div>
      </div>

      {!hasOverride && <div className="hint" style={{ marginBottom: 10 }}>Prompt par défaut (jamais modifié pour cette matière).</div>}

      {mode === 'view' ? (
        <pre className="cpm-view">{effectiveText(ctx, subject)}</pre>
      ) : (
        <textarea className="cpm-edit" value={editText} onChange={(e) => setEditText(e.target.value)} spellCheck={false} />
      )}

      <div className="imp-actions" style={{ marginTop: 14 }}>
        <button type="button" className="btn ghost" onClick={copy}><Icon name={copied ? 'check' : 'copy'} size={14} /> {copied ? 'Copié ✓' : 'Copier'}</button>
        {mode === 'edit' && hasOverride && (
          <button type="button" className="btn ghost" onClick={reset}><Icon name="refresh" size={14} /> Réinitialiser au prompt par défaut</button>
        )}
        {mode === 'edit' && (
          <button type="button" className="btn primary" onClick={save}><Icon name="check" size={14} /> {savedFlash ? 'Enregistré ✓' : 'Enregistrer'}</button>
        )}
      </div>
    </Modal>
  );
}
