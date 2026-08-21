/* ============================================================
   MedRevise — "Voir les prompts" (vue cours, à côté de "Tout exporter") : les
   4 prompts de complétion (Mathématiques/Physique/Chimie/Biologie) que
   l'utilisateur colle dans un chat externe avec l'export "Tout exporter".
   Ce bouton ne génère RIEN : il copie/affiche/édite un texte figé, réutilise
   le même mécanisme presse-papier que "Tout exporter" (navigator.clipboard).

   Trois VARIANTES du même composant, sélectionnées par la prop `kind` :
   - 'theorie' (défaut) : DEFAULT_PROMPTS/parsePromptsMd (lib/coursePrompts.js),
     surcharges ctx.promptOverrides, séparateurs "=== PROMPT XXX ===".
   - 'pratique' (exercices, méthode des J des exos) : DEFAULT_EXO_PROMPTS/
     parseExoPromptsMd (lib/exoPrompts.js), surcharges ctx.exoPromptOverrides
     (stockage SÉPARÉ, storage.js#getExoPrompts/setExoPrompts), séparateurs
     "## N — MATIÈRE — PRATIQUE" + bloc de code.
   - 'chapitre' (exercices couvrant TOUT un chapitre) : DEFAULT_CHAP_EXO_PROMPTS
     (lib/chapExoPrompt.js), surcharges ctx.chapExoPromptOverrides (stockage
     encore SÉPARÉ, storage.js#getChapExoPrompts/setChapExoPrompts). Seule
     variante à n'avoir qu'UNE entrée au lieu de quatre : ce prompt est unique
     et sert les 4 matières (il détecte la matière depuis les fiches collées),
     donc pas de découpage par matière et pas de "Modifier les 4".
   Les variantes ne se mélangent JAMAIS (stockage et contenu par défaut
   distincts).

   Contenu par défaut = fourni par l'utilisateur, figé dans lib/coursePrompts.js,
   lib/exoPrompts.js ou lib/chapExoPrompt.js. Une surcharge éditée par
   l'utilisateur (persistée via outbox durable) prime toujours sur le défaut ; "Réinitialiser" retire la
   surcharge.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../shared/Icon.jsx';
import { Modal } from './ui.jsx';
import { SUBJECTS, DEFAULT_PROMPTS, parsePromptsMd } from '../lib/coursePrompts.js';
import { DEFAULT_EXO_PROMPTS, parseExoPromptsMd } from '../lib/exoPrompts.js';
import { CHAP_EXO_ENTRIES, DEFAULT_CHAP_EXO_PROMPTS } from '../lib/chapExoPrompt.js';

async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; }
}

/** construit la config de variante à partir de `kind` + `ctx` — un seul
   endroit où les variantes divergent, tout le reste du fichier ne lit
   plus que `cfg`. Champs communs à toutes : `entries` (les prompts de la
   catégorie, 4 matières ou 1 entrée unique) et `bulk` (la catégorie
   propose-t-elle "Modifier les 4"). */
function buildCfg(kind, ctx) {
  // 'chapitre' : prompt UNIQUE valable pour les 4 matières — une seule entrée
  // dans `entries`, et `bulk: false` (il n'y a rien à découper par matière,
  // donc pas de "Modifier les 4" ni de parseur de collage en masse).
  if (kind === 'chapitre') {
    return {
      kind,
      entries: CHAP_EXO_ENTRIES,
      bulk: false,
      icon: 'layers',
      label: 'Voir le prompt',
      triggerTitle: "Le prompt « Exercices de chapitre » (couvre tout le chapitre) à coller dans un chat externe, avec l'export « Tout exporter »",
      popupTitle: 'Prompt exercices de chapitre',
      defaultPrompts: DEFAULT_CHAP_EXO_PROMPTS,
      overrides: ctx.chapExoPromptOverrides,
      saveOne: ctx.saveChapExoPromptOverride,
      resetOne: ctx.resetChapExoPromptOverride,
    };
  }
  const isExo = kind === 'pratique';
  return {
    kind,
    entries: SUBJECTS,
    bulk: true,
    icon: isExo ? 'target' : 'sparkle',
    label: isExo ? 'Voir les prompts (exercices)' : 'Voir les prompts',
    triggerTitle: isExo
      ? 'Les 4 prompts PRATIQUE (méthode des J des exercices) à coller dans un chat externe'
      : 'Les 4 prompts de complétion à coller dans un chat externe',
    popupTitle: isExo ? 'Prompts pratique (exercices)' : 'Prompts de complétion',
    defaultPrompts: isExo ? DEFAULT_EXO_PROMPTS : DEFAULT_PROMPTS,
    overrides: isExo ? ctx.exoPromptOverrides : ctx.promptOverrides,
    parseMd: isExo ? parseExoPromptsMd : parsePromptsMd,
    saveOne: isExo ? ctx.saveExoPromptOverride : ctx.savePromptOverride,
    saveAll: isExo ? ctx.saveAllExoPromptOverrides : ctx.saveAllPromptOverrides,
    resetOne: isExo ? ctx.resetExoPromptOverride : ctx.resetPromptOverride,
    bulkTitle: isExo ? 'Modifier les 4 prompts pratique — coller le MD complet' : 'Modifier les 4 prompts — coller le MD complet',
    bulkHint: isExo
      ? <>Colle ici le fichier .md entier (les 4 sections <code>## N — MATIÈRE — PRATIQUE</code>, chacune suivie d'un bloc de code) — l'app découpe automatiquement chaque bloc vers la bonne matière.</>
      : <>Colle ici le fichier .md entier (les 4 prompts séparés par <code>=== PROMPT PHYSIQUE ===</code>, etc.) — l'app découpe automatiquement chaque bloc vers la bonne matière.</>,
    missingHint: (label) => (isExo
      ? `manquant — titre "## N — ${label.toUpperCase()} — PRATIQUE" (+ son bloc de code) introuvable ou mal écrit`
      : `manquant — séparateur "=== PROMPT ${label.toUpperCase()} ===" introuvable ou mal écrit`),
  };
}

const effectiveText = (cfg, id) => (cfg.overrides && cfg.overrides[id]) || cfg.defaultPrompts[id];

export function CoursePromptsButton({ ctx, kind = 'theorie' }) {
  const cfg = buildCfg(kind, ctx);
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
    if (await copyToClipboard(effectiveText(cfg, id))) {
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1800);
    }
  };

  return (
    <>
      <button ref={btnRef} type="button" className="btn ghost sm" onClick={openPop} title={cfg.triggerTitle}>
        <Icon name={cfg.icon} size={13} /> {cfg.label}
      </button>

      {pop && createPortal(
        <div className="cpm-pop" style={{ top: pop.top, left: pop.left }}>
          <div className="cpm-pop-title">{cfg.popupTitle}</div>
          {cfg.entries.map((s) => (
            <div key={s.id} className="cpm-row">
              <button type="button" className="cpm-copy" onClick={() => copySubject(s.id)} title="Copier ce prompt">
                <Icon name={copiedId === s.id ? 'check' : 'copy'} size={13} style={copiedId === s.id ? { color: 'var(--ok)' } : undefined} />
                {copiedId === s.id ? 'Copié ✓' : s.label}
              </button>
              <button type="button" className="cd-ic" title="Voir en entier" onClick={() => { setPop(null); setModalState({ subject: s.id, mode: 'view' }); }}><Icon name="ext" size={13} /></button>
              <button type="button" className="cd-ic" title="Modifier" onClick={() => { setPop(null); setModalState({ subject: s.id, mode: 'edit' }); }}><Icon name="edit" size={13} /></button>
            </div>
          ))}
          {cfg.bulk && (
            <button type="button" className="btn ghost sm" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
              onClick={() => { setPop(null); setBulkOpen(true); }}>
              <Icon name="sliders" size={13} /> Modifier les 4
            </button>
          )}
        </div>,
        document.body,
      )}

      {modalState && (
        <PromptModal cfg={cfg} initial={modalState} onClose={() => setModalState(null)} />
      )}
      {bulkOpen && (
        <BulkPromptModal cfg={cfg} onClose={() => setBulkOpen(false)} />
      )}
    </>
  );
}

/** Accès CENTRAL sidebar (bas de nav, à côté de Réglages) : regroupe les
   9 prompts (4 théorie + 4 pratique + 1 exercices de chapitre) en un seul
   endroit, pour copier sans passer par un cours. La 3e catégorie n'a qu'UNE
   entrée : ce prompt est unique et sert les 4 matières.
   RÉUTILISE buildCfg/effectiveText/PromptModal/BulkPromptModal tels quels —
   mêmes stockages (getCoursePrompts/getExoPrompts/getChapExoPrompts via ctx),
   donc une modif ici se reflète aussi dans les boutons "Voir les prompts" /
   "Voir le prompt" existants (vue cours, vue chapitre), et inversement.
   Le sous-dialogue (voir/modifier une matière, ou "Modifier les 4") remplace
   temporairement la liste plutôt que de s'empiler dessus (même convention
   que CoursePromptsButton, qui referme son popover avant d'ouvrir un
   modal) ; fermer le sous-dialogue revient à la liste. */
export function AllPromptsModal({ ctx, onClose }) {
  const cfgTheorie = buildCfg('theorie', ctx);
  const cfgPratique = buildCfg('pratique', ctx);
  const cfgChapitre = buildCfg('chapitre', ctx);
  const [copiedKey, setCopiedKey] = useState(null); // `${kind}:${subjectId}`
  const [modalState, setModalState] = useState(null); // { kind, subject, mode }
  const [bulkKind, setBulkKind] = useState(null); // 'theorie' | 'pratique' | null

  const copySubject = async (cfg, id) => {
    if (await copyToClipboard(effectiveText(cfg, id))) {
      const key = `${cfg.kind}:${id}`;
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1800);
    }
  };

  const renderGroup = (cfg, groupLabel) => (
    <div className="apm-group" key={cfg.kind}>
      <div className="cpm-pop-title">{groupLabel}</div>
      {cfg.entries.map((s) => {
        const key = `${cfg.kind}:${s.id}`;
        return (
          <div key={s.id} className="cpm-row">
            <button type="button" className="cpm-copy" onClick={() => copySubject(cfg, s.id)} title="Copier ce prompt">
              <Icon name={copiedKey === key ? 'check' : 'copy'} size={13} style={copiedKey === key ? { color: 'var(--ok)' } : undefined} />
              {copiedKey === key ? 'Copié ✓' : s.label}
            </button>
            <button type="button" className="cd-ic" title="Voir en entier" onClick={() => setModalState({ kind: cfg.kind, subject: s.id, mode: 'view' })}><Icon name="ext" size={13} /></button>
            <button type="button" className="cd-ic" title="Modifier" onClick={() => setModalState({ kind: cfg.kind, subject: s.id, mode: 'edit' })}><Icon name="edit" size={13} /></button>
          </div>
        );
      })}
      {cfg.bulk && (
        <button type="button" className="btn ghost sm" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
          onClick={() => setBulkKind(cfg.kind)}>
          <Icon name="sliders" size={13} /> Modifier les 4
        </button>
      )}
    </div>
  );

  const CFG_BY_KIND = { theorie: cfgTheorie, pratique: cfgPratique, chapitre: cfgChapitre };
  const modalCfg = modalState && CFG_BY_KIND[modalState.kind];
  // 'chapitre' n'expose pas "Modifier les 4" (cfg.bulk false), donc bulkKind
  // ne peut valoir que 'theorie' ou 'pratique' — routé par la même table.
  const bulkCfg = bulkKind && CFG_BY_KIND[bulkKind];

  return (
    <>
      {!modalState && !bulkKind && (
        <Modal title="Tous les prompts" onClose={onClose} width="min(420px, 94vw)">
          {renderGroup(cfgTheorie, 'Théorie — QCM, flashcards, Feynman')}
          {renderGroup(cfgPratique, 'Exercices — méthode des J')}
          {renderGroup(cfgChapitre, 'Exercices de chapitre — couverture globale')}
        </Modal>
      )}
      {modalState && (
        <PromptModal cfg={modalCfg} initial={modalState} onClose={() => setModalState(null)} />
      )}
      {bulkKind && (
        <BulkPromptModal cfg={bulkCfg} onClose={() => setBulkKind(null)} />
      )}
    </>
  );
}

/** "Modifier les 4" — colle le fichier .md COMPLET (les 4 prompts d'un coup),
   découpé automatiquement par matière (cfg.parseMd) sur les séparateurs
   propres à la variante (théorie ou pratique, voir buildCfg). Étape
   "Prévisualiser" OBLIGATOIRE avant "Enregistrer les 4" : montre les 4
   matières trouvées (✓ + longueur) ou manquantes (séparateur introuvable) —
   jamais d'enregistrement partiel silencieux si une matière manque. */
function BulkPromptModal({ cfg, onClose }) {
  const [raw, setRaw] = useState('');
  const [parsed, setParsed] = useState(null); // { results, missing } | null tant que pas prévisualisé (ou après une frappe qui invalide l'aperçu)
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const onRawChange = (e) => { setRaw(e.target.value); setParsed(null); setSaved(false); };
  const preview = () => setParsed(cfg.parseMd(raw));
  const canSave = !!parsed && parsed.missing.length === 0;

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    // merge ATOMIQUE des 4 (MedReviseApp.jsx#saveAllPromptOverrides/
    // saveAllExoPromptOverrides) — jamais 4 appels séquentiels à saveOne, qui
    // s'écraseraient entre eux (chaque appel referme les overrides du rendu courant).
    await cfg.saveAll(parsed.results);
    setSaving(false);
    setSaved(true);
    setTimeout(onClose, 900);
  };

  return (
    <Modal title={cfg.bulkTitle} onClose={onClose} width="min(760px, 94vw)">
      <div className="hint" style={{ marginBottom: 10 }}>{cfg.bulkHint}</div>
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
          {cfg.entries.map((s) => {
            const text = parsed.results[s.id];
            return (
              <div key={s.id} className="row" style={{ gap: 8, alignItems: 'center' }}>
                <Icon name={text ? 'check' : 'x'} size={14} style={{ color: text ? 'var(--ok)' : 'var(--crit)', flex: '0 0 auto' }} />
                <strong style={{ minWidth: 110 }}>{s.label}</strong>
                {text
                  ? <span className="hint">✓ ({text.length} caractères)</span>
                  : <span className="hint" style={{ color: 'var(--crit)' }}>{cfg.missingHint(s.label)}</span>}
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

function PromptModal({ cfg, initial, onClose }) {
  const [subject, setSubject] = useState(initial.subject);
  const [mode, setMode] = useState(initial.mode);
  const [editText, setEditText] = useState(() => effectiveText(cfg, initial.subject));
  const [copied, setCopied] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // resynchronise le brouillon d'édition quand on change de matière — la surcharge
  // éventuelle (ou le défaut) de la matière NOUVELLEMENT active fait foi.
  useEffect(() => { setEditText(effectiveText(cfg, subject)); }, [subject]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasOverride = !!(cfg.overrides && cfg.overrides[subject]);
  const isDirty = mode === 'edit' && editText !== effectiveText(cfg, subject);

  // enregistre le brouillon en cours AVANT de changer de matière ou de fermer —
  // on ne perd jamais une modification en cours de frappe (pas de prompt de
  // confirmation fragile, juste un flush systématique).
  const flush = async () => { if (isDirty) await cfg.saveOne(subject, editText); };
  const switchSubject = async (next) => { await flush(); setSubject(next); };
  const close = async () => { await flush(); onClose(); };

  const save = async () => {
    await cfg.saveOne(subject, editText);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1600);
  };
  const reset = async () => {
    await cfg.resetOne(subject);
    setEditText(cfg.defaultPrompts[subject]);
  };
  const copy = async () => {
    if (await copyToClipboard(mode === 'edit' ? editText : effectiveText(cfg, subject))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const label = (cfg.entries.find((s) => s.id === subject) || {}).label || '';
  // sélecteur de matière masqué quand la variante n'a qu'une entrée
  // ('chapitre') : un onglet unique et non cliquable n'apprend rien.
  const multi = cfg.entries.length > 1;

  return (
    <Modal title={`Prompt — ${label}`} onClose={close} width="min(720px, 94vw)">
      <div className="row spread" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        {multi ? (
          <div className="seg">
            {cfg.entries.map((s) => (
              <button key={s.id} type="button" className={'seg-btn' + (subject === s.id ? ' active' : '')} onClick={() => switchSubject(s.id)}>{s.label}</button>
            ))}
          </div>
        ) : <span />}
        <div className="seg">
          <button type="button" className={'seg-btn' + (mode === 'view' ? ' active' : '')} onClick={() => setMode('view')}><Icon name="book" size={13} /> Lecture</button>
          <button type="button" className={'seg-btn' + (mode === 'edit' ? ' active' : '')} onClick={() => setMode('edit')}><Icon name="edit" size={13} /> Modifier</button>
        </div>
      </div>

      {!hasOverride && (
        <div className="hint" style={{ marginBottom: 10 }}>
          {multi ? 'Prompt par défaut (jamais modifié pour cette matière).' : 'Prompt par défaut (jamais modifié).'}
        </div>
      )}

      {mode === 'view' ? (
        <pre className="cpm-view">{effectiveText(cfg, subject)}</pre>
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
