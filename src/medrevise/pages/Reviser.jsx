/* ============================================================
   MedRevise — Réviser (hub). Gauche : arbre Cours → Matière → Fiche
   (cases à cocher, sélection simple/multiple, coef, rappels J).
   Droite : méthode des J (frise) + cards QCM/Flash/Feynman + erreurs.
   ============================================================ */
import { useMemo, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { EdTop, TodaySeriesCard, JLadder, CoefControl, matiereMeta } from '../components/ui.jsx';
import {
  index, effectiveCoef, ficheJ, dueToday, isFicheScheduled, missedQuestions, topConcepts, todayPlan,
} from '../lib/planning.js';
import { CarnetBody } from './Carnet.jsx';

export function Reviser({ ctx }) {
  const { db } = ctx;
  const ix = useMemo(() => index(db), [db]);
  const [selIds, setSelIds] = useState(() => (ctx.focusFiche ? [ctx.focusFiche] : (db.fiches[0] ? [db.fiches[0].id] : [])));
  const [openSrc, setOpenSrc] = useState(() => Object.fromEntries(db.sources.map((s) => [s.id, true])));
  const [renaming, setRenaming] = useState(null);
  const [draft, setDraft] = useState('');

  const dueIdsToday = useMemo(() => new Set(dueToday(db, ix).map((q) => q.id)), [db, ix]);
  const fichesOf = (matId) => db.fiches.filter((f) => f.matiereId === matId && !f.archive);
  const matieresOf = (srcId) => db.matieres.filter((m) => m.sourceId === srcId && !m.archive);
  const qOfFiche = (fId) => db.questions.filter((q) => q.ficheId === fId);
  const dueCountFiche = (fId) => qOfFiche(fId).filter((q) => dueIdsToday.has(q.id)).length;

  const selectOnly = (id) => setSelIds([id]);
  const toggle = (id) => setSelIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const selFiches = db.fiches.filter((f) => selIds.includes(f.id));
  const empty = selFiches.length === 0;
  const multi = selFiches.length > 1;
  const primary = selFiches[0];
  const primMat = primary && ix.mById[primary.matiereId];
  const meta = matiereMeta(primMat);

  const selItems = db.questions.filter((q) => selIds.includes(q.ficheId));
  const qcmItems = selItems.filter((q) => q.type === 'qcm');
  const flashItems = selItems.filter((q) => q.type === 'flashcard');
  const feynItems = selItems.filter((q) => q.type === 'feynman');
  const dueSel = selItems.filter((q) => dueIdsToday.has(q.id));

  const jp = primary ? ficheJ(db, primary.id, ix) : null;
  const scheduled = primary ? isFicheScheduled(db, primary, ix) : false;
  const title = multi ? `${selFiches.length} fiches sélectionnées` : (primary ? primary.titre : '');
  const mins = (n) => Math.max(1, Math.round(n * 0.8));

  const launch = (mode) => {
    const items = mode === 'qcm' ? qcmItems : mode === 'flash' ? flashItems : [...qcmItems, ...flashItems];
    if (items.length) ctx.startSession(items, title);
  };
  const launchToday = () => dueSel.length && ctx.startSession(dueSel, title + " — Aujourd'hui");
  const commitRename = () => { if (renaming) ctx.renameFiche(renaming, draft); setRenaming(null); };

  return (
    <div className="screen scroll fadein">
      <div className="topbar">
        <div>
          <h1 className="serif">Réviser</h1>
          <div className="sub">Choisis une fiche, ajuste ses priorités, lance tes QCM, flashcards ou Feynman.</div>
        </div>
        <EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} />
      </div>

      <TodaySeriesCard plan={todayPlan(db, ix)} onStart={ctx.startSession} compact />

      <div className="revise-grid" style={{ display: 'grid', gridTemplateColumns: '320px minmax(0,1fr)', gap: 20, alignItems: 'start', marginTop: 20 }}>
        {/* tree */}
        <div className="tree-card">
          <div className="tree-head">
            <span className="tree-head-title"><Icon name="folder" size={15} /> Cours &amp; matières</span>
            <button className="tree-clear" onClick={() => setSelIds([])} disabled={empty}>Tout décocher</button>
          </div>
          <div className="tree-scroll scroll">
            {db.sources.filter((s) => !s.archive).map((src) => {
              const mats = matieresOf(src.id).filter((m) => fichesOf(m.id).length);
              if (!mats.length) return null;
              const openS = openSrc[src.id] !== false;
              const on = src.rappelsJ !== false;
              return (
                <div className={'tree-src' + (on ? '' : ' off')} key={src.id}>
                  <div className="tree-src-row">
                    <button className="tree-src-main" onClick={() => setOpenSrc((o) => ({ ...o, [src.id]: !openS }))}>
                      <Icon name={openS ? 'chevD' : 'chevR'} size={14} style={{ color: 'var(--text-3)' }} />
                      <span className="tsrc-ic" style={{ background: `color-mix(in srgb, ${src.tint || '#7C6FE0'} 16%, transparent)`, color: src.tint || '#7C6FE0' }}><Icon name={src.icon || 'folder'} size={13} /></span>
                      <span className="tsrc-name">{src.nom}</span>
                    </button>
                    <button className={'src-mute' + (on ? '' : ' off')} title={on ? 'Rappels J actifs — cliquer pour mettre en pause' : 'En pause — réactiver'} onClick={() => ctx.setSourceRappels(src.id, !on)}>
                      <Icon name={on ? 'bell' : 'bellOff'} size={15} />
                    </button>
                  </div>
                  {openS && mats.map((mat) => {
                    const fiches = fichesOf(mat.id);
                    const mm = matiereMeta(mat);
                    return (
                      <div className="tree-group" key={mat.id}>
                        <div className="tree-cat-row">
                          <span className="tcat-dot" style={{ background: mm.tint, marginLeft: 4 }} />
                          <span className="tcat-label" style={{ flex: 1 }}>{mm.label}</span>
                          <CoefControl value={mat.coef ?? 3} inherited={false} onSet={(v) => ctx.setMatiereCoef(mat.id, v)} />
                        </div>
                        {fiches.map((f) => {
                          const sel = selIds.includes(f.id);
                          const cdt = dueCountFiche(f.id);
                          if (renaming === f.id) {
                            return (
                              <div key={f.id} className="tree-course on">
                                <span className="tree-check" style={{ visibility: 'hidden' }} />
                                <input className="tree-rename" autoFocus defaultValue={f.titre} onFocus={(e) => e.target.select()}
                                  onChange={(e) => setDraft(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }}
                                  onBlur={commitRename} />
                              </div>
                            );
                          }
                          return (
                            <div key={f.id} className={'tree-course' + (sel ? ' on' : '')}>
                              <button className={'tree-check' + (sel ? ' on' : '')} onClick={() => toggle(f.id)} title="Cocher / décocher">{sel ? <Icon name="check" size={11} stroke={3} /> : null}</button>
                              <button className="tree-course-main" onClick={() => selectOnly(f.id)} onDoubleClick={(e) => { e.stopPropagation(); setDraft(f.titre); setRenaming(f.id); }} title="Clic = sélectionner · double-clic = renommer">
                                <span className="tc-name">{f.titre}</span>
                                {cdt > 0 && <span className="due-badge sm" title={`${cdt} carte(s) à réviser aujourd'hui`}>{cdt}</span>}
                              </button>
                              <CoefControl value={effectiveCoef(db, f, ix)} inherited={f.coef == null} onSet={(v) => ctx.setFicheCoef(f.id, v)} onReset={() => ctx.setFicheCoef(f.id, null)} />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="tree-foot">
            <span className="tf-item"><span className="tf-badge tnum">N</span> à réviser aujourd'hui</span>
          </div>
        </div>

        {/* right */}
        <div>
          {empty ? (
            <div className="rev-empty">
              <Icon name="cards" size={30} />
              <div className="re-title">Sélectionne une fiche</div>
              <div className="hint">Coche une ou plusieurs fiches à gauche pour voir QCM, flashcards et erreurs.</div>
            </div>
          ) : (
            <>
              <div className="jcard">
                <div className="jc-ic" style={{ background: `color-mix(in srgb, ${meta.tint} 15%, transparent)`, color: meta.tint }}><Icon name="calendar" size={20} /></div>
                <div className="jc-main">
                  <div className="jc-label">Méthode des J · {title}</div>
                  {!scheduled
                    ? <div className="jc-title"><span className="jc-paused">Cours en pause</span> — hors planning J (révisable manuellement)</div>
                    : dueSel.length > 0
                      ? <div className="jc-title"><span className="jc-today-badge">Aujourd'hui</span> {dueSel.length} carte{dueSel.length > 1 ? 's' : ''} à réviser</div>
                      : <div className="jc-title">Rien dû aujourd'hui pour cette sélection.</div>}
                  {!multi && jp && jp.jIndex >= 0 && <JLadder jIndex={jp.jIndex} />}
                </div>
                {dueSel.length > 0 && <button className="btn primary" style={{ flex: '0 0 auto', alignSelf: 'center' }} onClick={launchToday}><Icon name="play" size={14} fill /> Lancer aujourd'hui</button>}
              </div>

              <div className="rev-modes">
                <button className="rev-mode" onClick={() => launch('qcm')} disabled={!qcmItems.length}>
                  <div className="rm-ic" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="list" size={20} /></div>
                  <div className="rm-n tnum">{qcmItems.length}</div><div className="rm-l">QCM</div>
                  <div className="rm-go">Lancer <Icon name="arrowR" size={14} /></div>
                </button>
                <button className="rev-mode" onClick={() => launch('flash')} disabled={!flashItems.length}>
                  <div className="rm-ic" style={{ background: 'var(--accent-2-soft)', color: 'var(--accent-2)' }}><Icon name="cards" size={20} /></div>
                  <div className="rm-n tnum">{flashItems.length}</div><div className="rm-l">Flashcards</div>
                  <div className="rm-go">Lancer <Icon name="arrowR" size={14} /></div>
                </button>
                <button className="rev-mode" onClick={() => feynItems.length && ctx.startFeynman({ items: feynItems, title })} disabled={!feynItems.length}>
                  <div className="rm-ic" style={{ background: 'color-mix(in srgb, #4FA6D9 15%, transparent)', color: '#4FA6D9' }}><Icon name="lightbulb" size={20} /></div>
                  <div className="rm-n tnum">{feynItems.length}</div><div className="rm-l">Feynman</div>
                  <div className="rm-go">Expliquer <Icon name="arrowR" size={14} /></div>
                </button>
              </div>

              <button className="btn lg" style={{ width: '100%', marginTop: 14, justifyContent: 'center' }} onClick={() => launch('all')} disabled={!qcmItems.length && !flashItems.length}>
                <Icon name="layers" size={17} /> {multi ? 'Réviser toutes les fiches' : 'Réviser toute cette fiche'} ({qcmItems.length + flashItems.length} cartes · ~{mins(qcmItems.length + flashItems.length)} min)
              </button>

              <div style={{ marginTop: 14 }}>
                <ErrorSummary ctx={ctx} ix={ix} selIds={selIds} title={title} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* carnet d'erreurs complet — intégré ici (pas d'onglet séparé) */}
      <div style={{ marginTop: 22 }}>
        <h2 className="serif" style={{ fontSize: 20, margin: '4px 0 12px' }}>Carnet d'erreurs</h2>
        <CarnetBody ctx={ctx} />
      </div>
    </div>
  );
}

/* erreurs de la sélection courante + accès au carnet complet (handoff §5.3) */
function ErrorSummary({ ctx, ix, selIds, title }) {
  const missed = missedQuestions(ctx.db, ix).filter((m) => selIds.includes(m.ficheId));
  const reviewable = missed.filter((m) => m.type !== 'feynman');
  const totalMisses = missed.reduce((a, m) => a + m.missed, 0);
  const tops = topConcepts(missed, 3);

  if (!missed.length) {
    return (
      <div className="err-mini ok">
        <div className="em-ic"><Icon name="check" size={18} stroke={2.5} /></div>
        <div className="em-body">
          <div className="em-title">Aucune erreur sur {selIds.length > 1 ? 'cette sélection' : 'cette fiche'}</div>
          <div className="hint">Rien à rejouer — tout est maîtrisé ici.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="err-mini">
      <div className="em-ic crit"><Icon name="target" size={18} /></div>
      <div className="em-body">
        <div className="em-title"><strong className="tnum">{missed.length}</strong> question{missed.length > 1 ? 's' : ''} ratée{missed.length > 1 ? 's' : ''} · {totalMisses} erreurs</div>
        <div className="em-concepts">{tops.map((t) => <span className="em-chip" key={t.concept}>{t.concept} <em className="tnum">×{t.n}</em></span>)}</div>
      </div>
      <button className="btn err-mode-btn" onClick={() => ctx.startSession(reviewable, (title || 'Mes erreurs') + ' — erreurs')} disabled={!reviewable.length} title="Rejouer toutes les erreurs d'un coup">
        <Icon name="refresh" size={14} /> Mode erreur ({reviewable.length})
      </button>
    </div>
  );
}
