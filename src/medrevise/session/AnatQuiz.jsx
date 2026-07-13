/* ============================================================
   MedRevise — QUIZ d'anatomie visuelle (Étape C). Révision d'une fiche
   type "anat_schema" : on masque le TEXTE de certaines coches (champ de
   saisie vide) tout en gardant flèches + ancres visibles. L'étudiant
   remplit, on corrige avec une normalisation tolérante, puis on mappe le
   % de bonnes réponses sur une qualité SM-2 (moteur existant) modulée par
   le coefficient de la fiche/matière — exactement comme les autres fiches.

   Modes :
   - TOTAL : toutes les coches masquées.
   - ALÉATOIRE : un sous-ensemble masqué (proportion réglable), le reste
     reste affiché comme repères ; tirage aléatoire à chaque session.
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Breadcrumb, matiereMeta } from '../components/ui.jsx';
import { index, effectiveCoef } from '../lib/planning.js';
import { applyReview, qualityFromRatio, normalizeAnswer, todayISO, computeStreak, jStepForInterval } from '../lib/sm2.js';
import { blobURL } from '../lib/storage.js';

const DEFAULT_COLOR = '#7C6FE0';
const markerId = (col) => 'quiz-ah-' + (col || DEFAULT_COLOR).replace('#', '');

export function AnatQuiz({ ctx }) {
  const q = ctx.anatQuiz;
  if (!q || !q.fiche) {
    return (
      <div className="screen scroll fadein">
        <div className="rev-empty" style={{ marginTop: 60 }}>
          <Icon name="image" size={30} />
          <div className="re-title">Aucun schéma à réviser</div>
          <button className="btn primary" onClick={() => ctx.go('revise')}>Retour</button>
        </div>
      </div>
    );
  }

  const { db } = ctx;
  const ix = useMemo(() => index(db), [db]);
  const fiche = q.fiche;
  const matiere = ix.mById[fiche.matiereId];
  const meta = matiereMeta(matiere);
  const coches = fiche.coches || [];

  // tirage des coches masquées (stable pour la session)
  const maskedIds = useMemo(() => {
    if (q.mode === 'total') return coches.map((c) => c.id);
    const n = Math.max(1, Math.round((q.proportion ?? 0.5) * coches.length));
    const shuffled = [...coches].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(n, coches.length)).map((c) => c.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiche.id, q.mode, q.proportion]);
  const maskedSet = useMemo(() => new Set(maskedIds), [maskedIds]);

  const [imgUrl, setImgUrl] = useState(null);
  const [answers, setAnswers] = useState({});
  const [phase, setPhase] = useState('answer'); // answer | result | done
  const [overrides, setOverrides] = useState(() => new Set()); // "compter comme juste"
  const [finalScore, setFinalScore] = useState(null);

  useEffect(() => {
    let on = true, url = null;
    blobURL(fiche.imageId).then((u) => { if (on) { url = u; setImgUrl(u); } });
    return () => { on = false; if (url) URL.revokeObjectURL(url); };
  }, [fiche.imageId]);

  const isCorrect = (c) => {
    if (overrides.has(c.id)) return true;
    return normalizeAnswer(answers[c.id]) !== '' && normalizeAnswer(answers[c.id]) === normalizeAnswer(c.texte);
  };
  const correctCount = coches.filter((c) => maskedSet.has(c.id) && isCorrect(c)).length;
  const ratio = maskedIds.length ? correctCount / maskedIds.length : 1;

  const validate = () => setPhase('result');
  const toggleOverride = (id) => setOverrides((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const finish = async () => {
    const quality = qualityFromRatio(ratio);
    const coef = effectiveCoef(db, fiche, ix);
    const updated = applyReview(fiche, quality, coef);
    await ctx.saveFiche(updated);
    // enregistre le jour d'activité réel + recalcul du streak (comme les sessions)
    const s = ctx.stats || {};
    const today = todayISO();
    if (!(s.activityDays || []).includes(today)) {
      const activityDays = [...(s.activityDays || []), today];
      const streak = computeStreak(activityDays);
      await ctx.saveStats({ ...s, activityDays, streak, best: Math.max(s.best || 0, streak), dernierJourRevise: today });
    }
    setFinalScore({ correct: correctCount, total: maskedIds.length, jLabel: jStepForInterval(updated.interval).jLabel });
    setPhase('done');
  };

  if (phase === 'done' && finalScore) {
    const pct = finalScore.total ? Math.round((finalScore.correct / finalScore.total) * 100) : 100;
    return (
      <div className="screen scroll fadein">
        <div className="celebrate">
          <div className="cel-badge"><Icon name="trophy" size={48} /></div>
          <h1 className="serif">Schéma terminé !</h1>
          <div className="cel-score">« {fiche.titre} » — {finalScore.correct}/{finalScore.total} coches ({pct}%)</div>
          <div className="cel-streak"><Icon name="calendar" size={15} /> Prochaine révision : {finalScore.jLabel}</div>
          <div className="row" style={{ gap: 12, justifyContent: 'center', marginTop: 26 }}>
            <button className="btn lg" onClick={() => ctx.go('revise')}><Icon name="cards" size={16} /> Revenir à Réviser</button>
            <button className="btn primary lg" onClick={() => ctx.go('dashboard')}><Icon name="home" size={16} /> Continuer</button>
          </div>
        </div>
      </div>
    );
  }

  const answeredCount = coches.filter((c) => maskedSet.has(c.id) && normalizeAnswer(answers[c.id]) !== '').length;

  return (
    <div className="screen noscroll fadein" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="ctx-bar">
        <div style={{ minWidth: 0 }}>
          <Breadcrumb parts={['Réviser', meta.label, fiche.titre, 'Schéma']} />
          <div className="row" style={{ gap: 10, marginTop: 9 }}>
            <span className="pill accent" style={{ height: 26 }}><Icon name="image" size={12} /> {q.mode === 'total' ? 'Toutes les coches' : 'Aléatoire'}</span>
            <span className="rp-count tnum">{phase === 'result' ? `${correctCount} / ${maskedIds.length} justes` : `${answeredCount} / ${maskedIds.length} remplies`}</span>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="btn ghost" onClick={() => ctx.go('revise')}><Icon name="x" size={16} /> Quitter</button>
          <button className="icon-btn" onClick={ctx.toggleTheme}><Icon name={ctx.theme === 'dark' ? 'sun' : 'moon'} size={19} /></button>
        </div>
      </div>

      <div className="rev-stage scroll" style={{ flex: '1 1 auto', overflowY: 'auto', minHeight: 0, paddingTop: 4, paddingBottom: 10, justifyContent: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 900, margin: '0 auto' }}>
          <SchemaQuizCanvas
            imgUrl={imgUrl} coches={coches} maskedSet={maskedSet}
            answers={answers} setAnswers={setAnswers} phase={phase}
            isCorrect={isCorrect} overrides={overrides} toggleOverride={toggleOverride}
            onEnter={validate}
          />
        </div>
      </div>

      <div className="session-road" style={{ padding: '12px 16px' }}>
        <div className="row spread" style={{ maxWidth: 900, margin: '0 auto', width: '100%' }}>
          <span className="hint">
            {phase === 'answer'
              ? 'Remplis le nom de chaque coche masquée, puis valide.'
              : <>Score : <strong className="tnum">{correctCount}/{maskedIds.length}</strong> · les erreurs révèlent la bonne réponse — « Compter comme juste » si ta variante est correcte.</>}
          </span>
          {phase === 'answer'
            ? <button className="btn primary lg" onClick={validate}><Icon name="check" size={16} /> Valider</button>
            : <button className="btn primary lg" onClick={finish}><Icon name="trophy" size={16} /> Terminer ({Math.round(ratio * 100)}%)</button>}
        </div>
      </div>
    </div>
  );
}

/* ---- rendu : image + overlay (flèches SVG + ancres + boîtes) en % ---- */
function SchemaQuizCanvas({ imgUrl, coches, maskedSet, answers, setAnswers, phase, isCorrect, overrides, toggleOverride, onEnter }) {
  const usedColors = [...new Set(coches.map((c) => c.couleur || DEFAULT_COLOR))];
  return (
    <div style={{ position: 'relative', width: '100%', overflow: 'hidden', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-2)' }}>
      <div style={{ position: 'relative', width: '100%', lineHeight: 0 }}>
        {imgUrl
          ? <img src={imgUrl} alt="schéma" draggable={false} style={{ display: 'block', width: '100%', height: 'auto', userSelect: 'none' }} />
          : <div style={{ width: '100%', height: 320, display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}><Icon name="image" size={32} /></div>}

        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
          <defs>
            {usedColors.map((col) => (
              <marker key={col} id={markerId(col)} markerWidth="8" markerHeight="8" refX="5.5" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L6,3 L0,6 Z" fill={col} />
              </marker>
            ))}
          </defs>
          {coches.map((c) => {
            const col = c.couleur || DEFAULT_COLOR;
            return <line key={c.id} x1={c.boite.x * 100 + '%'} y1={c.boite.y * 100 + '%'} x2={c.ancre.x * 100 + '%'} y2={c.ancre.y * 100 + '%'} stroke={col} strokeWidth={2.2} markerEnd={`url(#${markerId(col)})`} />;
          })}
        </svg>

        {coches.map((c) => {
          const col = c.couleur || DEFAULT_COLOR;
          return <span key={'a' + c.id} style={{ position: 'absolute', left: c.ancre.x * 100 + '%', top: c.ancre.y * 100 + '%', width: 12, height: 12, marginLeft: -6, marginTop: -6, borderRadius: '50%', background: col, border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,.35)' }} />;
        })}

        {coches.map((c) => {
          const col = c.couleur || DEFAULT_COLOR;
          const masked = maskedSet.has(c.id);
          const correct = phase === 'result' && isCorrect(c);
          const wrong = phase === 'result' && masked && !isCorrect(c);
          const borderCol = phase === 'result' && masked ? (correct ? '#4FB87A' : '#E0556B') : col;

          return (
            <div key={'b' + c.id} style={{ position: 'absolute', left: c.boite.x * 100 + '%', top: c.boite.y * 100 + '%', transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 4, maxWidth: '46%', padding: '4px 8px', borderRadius: 8, background: 'var(--card)', border: `2px solid ${borderCol}`, boxShadow: '0 2px 8px rgba(0,0,0,.18)', lineHeight: 1.2, zIndex: 2, opacity: !masked && phase === 'answer' ? 0.85 : 1 }}>
              <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                <span style={{ flex: '0 0 auto', width: 18, height: 18, borderRadius: '50%', background: borderCol, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>
                  {phase === 'result' && masked ? <Icon name={correct ? 'check' : 'x'} size={11} stroke={3} /> : c.numero}
                </span>
                {masked ? (
                  phase === 'answer' ? (
                    <input autoFocus={c.id === coches.find((x) => maskedSet.has(x.id))?.id}
                      value={answers[c.id] || ''} placeholder="nom ?"
                      onChange={(e) => setAnswers((a) => ({ ...a, [c.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') onEnter(); }}
                      style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', font: 'inherit', fontSize: 13, fontWeight: 600, width: 130, maxWidth: 200 }} />
                  ) : (
                    <span style={{ fontSize: 13, fontWeight: 600, color: correct ? 'var(--text)' : 'var(--accent-2)', textDecoration: wrong ? 'line-through' : 'none', whiteSpace: 'nowrap' }}>
                      {answers[c.id] ? answers[c.id] : '(vide)'}
                    </span>
                  )
                ) : (
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.texte}</span>
                )}
              </div>
              {wrong && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, borderTop: '1px dashed var(--border)', paddingTop: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#4FB87A', whiteSpace: 'nowrap' }}><Icon name="check" size={11} /> {c.texte || '(sans nom)'}</span>
                  <button type="button" className="btn ghost sm" style={{ padding: '2px 6px', fontSize: 11 }} onClick={() => toggleOverride(c.id)}>
                    <Icon name={overrides.has(c.id) ? 'x' : 'check'} size={11} /> {overrides.has(c.id) ? 'Annuler' : 'Compter comme juste'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
