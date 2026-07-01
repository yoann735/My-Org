/* ============================================================
   MedRevise — mode Feynman (à la demande). 2 niveaux :
   Intuition (sens) / Expert (terminologie). Évaluation par l'IA
   (mock en dev). La référence envoyée = explications des QCM du
   même concept dans la fiche (on n'a pas le texte brut).
   ============================================================ */
import { useMemo, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Breadcrumb, EdTop, matiereMeta } from '../components/ui.jsx';
import { index } from '../lib/planning.js';
import { evaluateFeynman } from '../lib/api.js';

export function Feynman({ ctx }) {
  const payload = ctx.feynman || { items: [], title: 'Feynman' };
  const ix = useMemo(() => index(ctx.db), [ctx.db]);
  const items = payload.items || [];
  const [idx, setIdx] = useState(0);
  const [level, setLevel] = useState('intuition');
  const [text, setText] = useState('');
  const [evalTxt, setEvalTxt] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!items.length) {
    return (
      <div className="screen scroll fadein">
        <div className="rev-empty" style={{ marginTop: 60 }}>
          <Icon name="lightbulb" size={30} /><div className="re-title">Aucun concept Feynman</div>
          <button className="btn primary" onClick={() => ctx.go('revise')}>Retour</button>
        </div>
      </div>
    );
  }

  const item = items[idx];
  const fiche = ix.fById[item.ficheId];
  const meta = matiereMeta(fiche && ix.mById[fiche.matiereId]);
  // référence d'évaluation : l'explication générée pour ce concept Feynman
  // (+ pièges fréquents), sinon repli sur les explications des QCM du même concept.
  const reference = [
    item.explication_simple,
    item.lien_avec_le_cours,
    (item.pieges_frequents || []).join(' '),
  ].filter(Boolean).join(' ')
    || ctx.db.questions.filter((q) => q.ficheId === item.ficheId && q.concept === item.concept && q.explication).map((q) => q.explication).join(' ')
    || item.concept;

  const run = async () => {
    if (!text.trim()) return;
    setBusy(true); setEvalTxt(null);
    const res = await evaluateFeynman(level, item.concept, reference, text);
    setEvalTxt(res); setBusy(false);
  };
  const next = () => { setIdx((i) => Math.min(items.length - 1, i + 1)); setText(''); setEvalTxt(null); };
  const prev = () => { setIdx((i) => Math.max(0, i - 1)); setText(''); setEvalTxt(null); };

  return (
    <div className="screen scroll fadein">
      <div className="ctx-bar">
        <div style={{ minWidth: 0 }}>
          <Breadcrumb parts={['Réviser', meta.label, (fiche && fiche.titre) || payload.title, 'Feynman']} />
          <div className="row" style={{ gap: 10, marginTop: 9 }}>
            <span className="rp-count tnum">{idx + 1} / {items.length}</span>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="btn ghost" onClick={() => ctx.go('revise')}><Icon name="x" size={16} /> Quitter</button>
          <EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} />
        </div>
      </div>

      <div className="card" style={{ maxWidth: 760, margin: '0 auto' }}>
        <div className="card-body">
          <div className="rev-concept"><span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.tint, display: 'inline-block' }} /> {meta.label} · {item.concept}</div>
          <div className="serif" style={{ fontSize: 22, margin: '8px 0 4px' }}>Explique « {item.concept} »</div>

          <div className="row" style={{ gap: 8, margin: '14px 0' }}>
            <button className={'btn' + (level === 'intuition' ? ' primary' : '')} onClick={() => setLevel('intuition')}><Icon name="lightbulb" size={15} /> Intuition</button>
            <button className={'btn' + (level === 'expert' ? ' primary' : '')} onClick={() => setLevel('expert')}><Icon name="grad" size={15} /> Expert</button>
            <span className="hint" style={{ alignSelf: 'center' }}>{level === 'intuition' ? 'Explique à un enfant de 12 ans (le sens).' : 'Explique à un jury (termes exacts).'}</span>
          </div>

          <textarea className="imp-title" style={{ minHeight: 150, resize: 'vertical', fontFamily: 'inherit', width: '100%' }}
            placeholder="Écris ton explication avec tes mots…" value={text} onChange={(e) => setText(e.target.value)} />

          <div className="row spread" style={{ marginTop: 14 }}>
            <button className="btn ghost" onClick={prev} disabled={idx === 0}><Icon name="chevL" size={15} /> Précédent</button>
            <button className="btn primary lg" onClick={run} disabled={!text.trim() || busy}><Icon name="sparkle" size={15} /> {busy ? 'Évaluation…' : 'Évaluer mon explication'}</button>
            <button className="btn ghost" onClick={next} disabled={idx >= items.length - 1}>Suivant <Icon name="chevR" size={15} /></button>
          </div>

          {evalTxt && (
            <div className="rev-expl" style={{ marginTop: 18, whiteSpace: 'pre-wrap' }}>{evalTxt}</div>
          )}
        </div>
      </div>
    </div>
  );
}
