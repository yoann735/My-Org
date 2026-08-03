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
import { SUBJECTS, DEFAULT_PROMPTS, parsePromptsMd } from '../lib/coursePrompts.js';

const effectiveText = (ctx, id) => (ctx.promptOverrides && ctx.promptOverrides[id]) || DEFAULT_PROMPTS[id];

async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; }
}

export function CoursePromptsButton({ ctx }) {
  const [pop, setPop] = useState(null); // { top, left }
  const [copiedId, setCopiedId] = useState(null);
  const [modalState, setModalState] = useState(null); // { subject, mode: 'view'|'edit' }
  const [bulkOpen, setBulkOpen] = useState(false);
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
            onClick={() => { setPop(null); setBulkOpen(true); }}>
            <Icon name="sliders" size={13} /> Modifier les 4
          </button>
        </div>,
        document.body,
      )}

      {modalState && (
        <PromptModal ctx={ctx} initial={modalState} onClose={() => setModalState(null)} />
      )}
      {bulkOpen && (
        <BulkPromptModal ctx={ctx} onClose={() => setBulkOpen(false)} />
      )}
    </>
  );
}

/** "Modifier les 4" — colle le fichier .md COMPLET (les 4 prompts d'un coup),
   découpé automatiquement par matière (parsePromptsMd, lib/coursePrompts.js)
   sur les séparateurs "=== PROMPT XXX ===" déjà présents dans le fichier.
   Étape "Prévisualiser" OBLIGATOIRE avant "Enregistrer les 4" : montre les 4
   matières trouvées (✓ + longueur) ou manquantes (séparateur introuvable) —
   jamais d'enregistrement partiel silencieux si une matière manque. */
function BulkPromptModal({ ctx, onClose }) {
  const [raw, setRaw] = useState('');
  const [parsed, setParsed] = useState(null); // { results, missing } | null tant que pas prévisualisé (ou après une frappe qui invalide l'aperçu)
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const onRawChange = (e) => { setRaw(e.target.value); setParsed(null); setSaved(false); };
  const preview = () => setParsed(parsePromptsMd(raw));
  const canSave = !!parsed && parsed.missing.length === 0;

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    // merge ATOMIQUE des 4 (voir MedReviseApp.jsx#saveAllPromptOverrides) —
    // jamais 4 appels séquentiels à savePromptOverride, qui s'écraseraient
    // entre eux (chaque appel referme le promptOverrides du rendu courant).
    await ctx.saveAllPromptOverrides(parsed.results);
    setSaving(false);
    setSaved(true);
    setTimeout(onClose, 900);
  };

  return (
    <Modal title="Modifier les 4 prompts — coller le MD complet" onClose={onClose} width="min(760px, 94vw)">
      <div className="hint" style={{ marginBottom: 10 }}>
        Colle ici le fichier .md entier (les 4 prompts séparés par <code>=== PROMPT PHYSIQUE ===</code>, etc.) — l'app découpe automatiquement chaque bloc vers la bonne matière.
      </div>
      <textarea className="cpm-edit" style={{ minHeight: 260 }} value={raw} onChange={onRawChange} spellCheck={false} placeholder="Colle ici le MD complet des 4 prompts…" />
      <div className="imp-actions" style={{ marginTop: 12 }}>
        <button type="button" className="btn ghost" onClick={preview} disabled={!raw.trim()}><Icon name="search" size={14} /> Prévisualiser</button>
        {canSave && (
          <button type="button" className="btn primary" onClick={save} disabled={saving}>
            <Icon name="check" size={14} /> {saved ? 'Enregistré ✓' : (saving ? 'Enregistrement…' : 'Enregistrer les 4')}
          </button>
        )}
      </div>

      {parsed && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {SUBJECTS.map((s) => {
            const text = parsed.results[s.id];
            return (
              <div key={s.id} className="row" style={{ gap: 8, alignItems: 'center' }}>
                <Icon name={text ? 'check' : 'x'} size={14} style={{ color: text ? 'var(--ok)' : 'var(--crit)', flex: '0 0 auto' }} />
                <strong style={{ minWidth: 110 }}>{s.label}</strong>
                {text
                  ? <span className="hint">✓ ({text.length} caractères)</span>
                  : <span className="hint" style={{ color: 'var(--crit)' }}>manquant — séparateur "=== PROMPT {s.label.toUpperCase()} ===" introuvable ou mal écrit</span>}
              </div>
            );
          })}
          {!canSave && (
            <div className="hint" style={{ marginTop: 6, color: 'var(--crit)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <Icon name="alert" size={13} style={{ flex: '0 0 auto', marginTop: 1 }} />
              <span>Il manque au moins une matière — <strong>rien n'a été enregistré</strong>. Corrige le séparateur manquant dans le texte collé puis reprévisualise avant de pouvoir enregistrer.</span>
            </div>
          )}
        </div>
      )}
    </Modal>
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
