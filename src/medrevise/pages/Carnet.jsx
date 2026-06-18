/* ============================================================
   MedRevise — Carnet d'erreurs (handoff §5.5).
   Spotlight des concepts ratés, classement pondéré par coefficient,
   refaire par lot (fiche / global), liste complète dépliable,
   retrait d'une erreur (remet missed à 0, persisté).
   ============================================================ */
import { useMemo, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Card, TypeChip, matiereMeta } from '../components/ui.jsx';
import { index, missedQuestions, weakPoints, topConcepts } from '../lib/planning.js';

/** Carnet d'erreurs — embeddable body (intégré dans l'onglet Réviser). */
export function CarnetBody({ ctx }) {
  const { db } = ctx;
  const ix = useMemo(() => index(db), [db]);
  const [open, setOpen] = useState(false);

  const missed = missedQuestions(db, ix);
  const reviewable = missed.filter((m) => m.type !== 'feynman');
  const weak = weakPoints(db, ix);
  const problems = topConcepts(missed, 4);
  const maxScore = weak.length ? weak[0].score : 1;

  return (
    <>
      {!missed.length ? (
        <Card title="Carnet d'erreurs" icon="target">
          <div className="err-empty"><Icon name="check" size={26} stroke={2.5} /><div>Aucune erreur en attente. Continue comme ça !</div></div>
        </Card>
      ) : (
        <Card title="Vue d'ensemble" icon="target" action={<span className="hint">pondéré par coefficient</span>}>
          <div className="wp-spotlight">
            <span className="wp-spot-label">Tu bloques souvent sur</span>
            <div className="wp-spot-chips">
              {problems.map((p) => <span className="wp-spot-chip" key={p.concept}>{p.concept} <em className="tnum">×{p.n}</em></span>)}
            </div>
          </div>

          <div className="wp-rank">
            {weak.slice(0, 6).map((w) => {
              const meta = matiereMeta(w.matiere);
              return (
                <div className="wp-row" key={w.fiche.id}>
                  <div className="wp-info">
                    <span className="wp-bar-dot" style={{ background: meta.tint }} />
                    <span className="wp-course">{w.fiche.titre}</span>
                    <span className="wp-coef" title="Coefficient (modifiable dans Réviser)">×{w.coef}</span>
                  </div>
                  <div className="wp-track"><span style={{ width: Math.max(8, (w.score / maxScore) * 100) + '%', background: meta.tint }} /></div>
                  <div className="wp-meta"><span className="tnum">{w.misses}</span> err.</div>
                  <button className="btn sm" onClick={() => ctx.startSession(w.list.filter((m) => m.type !== 'feynman'), w.fiche.titre + ' — erreurs')}>
                    <Icon name="refresh" size={13} /> Revoir
                  </button>
                </div>
              );
            })}
          </div>

          <div className="wp-actions">
            <button className="btn primary" onClick={() => ctx.startSession(reviewable, 'Mes erreurs')} disabled={!reviewable.length}>
              <Icon name="refresh" size={15} /> Refaire mes erreurs ({reviewable.length})
            </button>
            <button className="btn ghost" onClick={() => setOpen((o) => !o)}>
              <Icon name={open ? 'chevU' : 'chevD'} size={15} /> {open ? 'Masquer le détail' : 'Voir toutes mes erreurs'}
            </button>
          </div>

          {open && <FullList ctx={ctx} ix={ix} missed={missed} />}
        </Card>
      )}
    </>
  );
}

function FullList({ ctx, ix, missed }) {
  // group by matière → fiche
  const byMat = {};
  missed.forEach((m) => {
    const mat = m.matiere; const mk = mat ? mat.id : '?';
    (byMat[mk] = byMat[mk] || { matiere: mat, items: [] }).items.push(m);
  });
  return (
    <div className="err-full scroll">
      {Object.values(byMat).map((grp) => {
        const meta = matiereMeta(grp.matiere);
        const byFiche = {};
        grp.items.forEach((m) => { const f = m.fiche; const fk = f ? f.id : '?'; (byFiche[fk] = byFiche[fk] || { fiche: f, list: [] }).list.push(m); });
        const fiches = Object.values(byFiche).map((c) => ({ ...c, misses: c.list.reduce((a, m) => a + m.missed, 0) })).sort((a, b) => b.misses - a.misses);
        const catMisses = grp.items.reduce((a, m) => a + m.missed, 0);
        return (
          <div className="err-cat" key={meta.label}>
            <div className="err-cat-head">
              <span className="kpi-ic" style={{ width: 28, height: 28, background: `color-mix(in srgb, ${meta.tint} 15%, transparent)`, color: meta.tint }}><Icon name={meta.icon} size={15} /></span>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{meta.label}</span>
              <span className="err-cat-count tnum">{catMisses} err.</span>
            </div>
            {fiches.map((course) => (
              <div className="err-course" key={course.fiche.id}>
                <div className="err-course-head">
                  <span className="ec-bar" style={{ background: meta.tint }} />
                  <span className="ec-title">{course.fiche.titre}</span>
                  <span className="ec-badge tnum">{course.list.length} concept{course.list.length > 1 ? 's' : ''}</span>
                  <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => ctx.startSession(course.list.filter((m) => m.type !== 'feynman'), course.fiche.titre + ' — erreurs')}>
                    <Icon name="refresh" size={12} /> Lot
                  </button>
                </div>
                {course.list.map((m) => (
                  <div className="err-line" key={m.id}>
                    <div className="el-count tnum" title={`${m.missed} fois ratée`}><Icon name="x" size={11} stroke={3} />{m.missed}</div>
                    <div className="el-main">
                      <div className="el-top"><TypeChip type={m.type} /><span className="el-concept">{m.concept}</span></div>
                      <div className="el-q">{m.type === 'flashcard' ? m.recto : m.question}</div>
                    </div>
                    <div className="el-actions">
                      {m.type !== 'feynman' && <button className="btn sm" onClick={() => ctx.startSession([m], m.concept)}><Icon name="refresh" size={13} /> Revoir</button>}
                      <button className="icon-btn sm" title="Retirer de mes erreurs" style={{ color: 'var(--text-3)' }} onClick={() => ctx.clearQuestionError(m.id)}><Icon name="trash" size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
