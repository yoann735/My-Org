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
import { applyReview, qualityFromRatio, todayISO, computeStreak, jStepForInterval } from '../lib/sm2.js';
import { matchAnat } from '../lib/anatMatch.js';
import { champsFor } from '../lib/anatParse.js';
import { ZonesLayer } from '../pages/ImportAnatomieVisuel.jsx';
import { ficheImages, vueLabel } from '../lib/anatSchema.js';
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
  // MULTI-VUES : toutes les images du schéma + toutes leurs coches à plat.
  const views = useMemo(() => ficheImages(fiche), [fiche.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const coches = useMemo(() => views.flatMap((v) => v.coches || []), [views]);

  // tirage des coches masquées (stable pour la session)
  const maskedIds = useMemo(() => {
    if (q.mode === 'total') return coches.map((c) => c.id);
    const n = Math.max(1, Math.round((q.proportion ?? 0.5) * coches.length));
    const shuffled = [...coches].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(n, coches.length)).map((c) => c.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiche.id, q.mode, q.proportion]);
  const maskedSet = useMemo(() => new Set(maskedIds), [maskedIds]);

  const [imgUrls, setImgUrls] = useState({}); // { [viewId]: objectURL }
  const [answers, setAnswers] = useState({});
  const [phase, setPhase] = useState('answer'); // answer | result | done
  const [overrides, setOverrides] = useState(() => new Set()); // "compter comme juste" (visuel)
  const [finalScore, setFinalScore] = useState(null);

  // ---- THÉORIE (refonte) : mini-questions générées LOCALEMENT à partir des CHAMPS
  // INTRINSÈQUES de chaque coche masquée (c.type + c.champs). Aucune IA. ----
  const theoryOn = !!q.theory;
  const [theoryAnswers, setTheoryAnswers] = useState({});
  const [theoryOverrides, setTheoryOverrides] = useState(() => new Set());

  useEffect(() => {
    let on = true; const created = [];
    (async () => {
      const map = {};
      for (const v of views) {
        if (!v.imageId) continue;
        const u = await blobURL(v.imageId);
        if (u) { map[v.id] = u; created.push(u); }
      }
      if (on) setImgUrls(map); else created.forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } });
    })();
    return () => { on = false; created.forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } }); };
  }, [views]);

  // correction tolérante (normalisation + réponses acceptées + « presque »),
  // 100 % locale. « Compter comme juste » (override) reste le dernier mot.
  const evalCoche = (c) => {
    if (overrides.has(c.id)) return { ok: true, near: false };
    return matchAnat(answers[c.id], c);
  };
  const isCorrect = (c) => evalCoche(c).ok;
  const correctCount = coches.filter((c) => maskedSet.has(c.id) && isCorrect(c)).length;

  // mini-questions de théorie : une par champ (non vide) des structures reliées aux
  // coches MASQUÉES. La valeur du champ = réponse attendue (masquée), corrigée avec le
  // même matcher tolérant. Générées localement (champs déjà stockés), aucune IA.
  const theoryQuestions = useMemo(() => {
    if (!theoryOn) return [];
    const out = [];
    coches.forEach((c) => {
      if (!maskedSet.has(c.id) || !c.type || !c.champs) return;
      champsFor(c.type).forEach((d) => {
        const val = ((c.champs && c.champs[d.key]) || '').trim();
        if (!val) return;
        // 1 question par (coche × champ non vide) : sert au score combiné (nom + champs).
        out.push({ key: c.id + ':' + d.key, cocheId: c.id, label: d.label, expected: val });
      });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theoryOn, coches, maskedSet]);

  const evalTheory = (tq) => {
    if (theoryOverrides.has(tq.key)) return { ok: true, near: false };
    return matchAnat(theoryAnswers[tq.key], { texte: tq.expected });
  };
  const theoryCorrect = theoryQuestions.filter((tq) => evalTheory(tq).ok).length;

  // ---- SAISIE DANS LA COCHE (refonte B) : coches MASQUÉES qui portent de la théorie.
  // Leur carte s'ouvre à même l'image (nom + un champ par ligne), une active à la fois. ----
  const fieldCoches = useMemo(
    () => coches.filter((c) => maskedSet.has(c.id) && theoryOn && c.type && c.champs && champsFor(c.type).some((d) => (c.champs[d.key] || '').trim())),
    [coches, maskedSet, theoryOn],
  );
  const activeOrder = useMemo(() => fieldCoches.map((c) => c.id), [fieldCoches]);
  const [activeId, setActiveId] = useState(null);
  useEffect(() => { setActiveId((fieldCoches[0] && fieldCoches[0].id) || null); }, [fiche.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // score (b) : le ratio combine visuel + champs théoriques.
  const totalCount = maskedIds.length + theoryQuestions.length;
  const combinedCorrect = correctCount + theoryCorrect;
  const ratio = totalCount ? combinedCorrect / totalCount : 1;
  const toggleTheoryOverride = (key) => setTheoryOverrides((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });

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
    setFinalScore({
      correct: combinedCorrect, total: totalCount, jLabel: jStepForInterval(updated.interval).jLabel,
      visual: correctCount, visualTotal: maskedIds.length,
      theory: theoryCorrect, theoryTotal: theoryQuestions.length,
    });
    setPhase('done');
  };

  if (phase === 'done' && finalScore) {
    const pct = finalScore.total ? Math.round((finalScore.correct / finalScore.total) * 100) : 100;
    return (
      <div className="screen scroll fadein">
        <div className="celebrate">
          <div className="cel-badge"><Icon name="trophy" size={48} /></div>
          <h1 className="serif">Schéma terminé !</h1>
          <div className="cel-score">« {fiche.titre} » — {finalScore.correct}/{finalScore.total} {finalScore.theoryTotal ? 'bonnes réponses' : 'coches'} ({pct}%)</div>
          {finalScore.theoryTotal > 0 && (
            <div className="hint" style={{ marginTop: 4 }}>Visuel {finalScore.visual}/{finalScore.visualTotal} · Théorie {finalScore.theory}/{finalScore.theoryTotal}</div>
          )}
          <div className="cel-streak"><Icon name="calendar" size={15} /> Prochaine révision : {finalScore.jLabel}</div>
          <div className="row" style={{ gap: 12, justifyContent: 'center', marginTop: 26 }}>
            <button className="btn lg" onClick={() => ctx.go('revise')}><Icon name="cards" size={16} /> Revenir à Réviser</button>
            <button className="btn primary lg" onClick={() => ctx.go('dashboard')}><Icon name="home" size={16} /> Continuer</button>
          </div>
        </div>
      </div>
    );
  }

  const answeredCount = coches.filter((c) => maskedSet.has(c.id) && (answers[c.id] || '').trim() !== '').length;

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
          {views.map((v) => (
            <div key={v.id} style={{ marginBottom: 14 }}>
              {views.length > 1 && <div className="hint" style={{ marginBottom: 6, fontWeight: 700, color: 'var(--text-2)' }}><Icon name="image" size={12} /> {vueLabel(v.vue)}</div>}
              <SchemaQuizCanvas
                imgUrl={imgUrls[v.id]} coches={v.coches || []} maskedSet={maskedSet} firstMaskedId={maskedIds[0]}
                answers={answers} setAnswers={setAnswers} phase={phase}
                evalCoche={evalCoche} overrides={overrides} toggleOverride={toggleOverride}
                onEnter={validate}
                theoryOn={theoryOn} theoryAnswers={theoryAnswers} setTheoryAnswers={setTheoryAnswers}
                evalTheory={evalTheory} theoryOverrides={theoryOverrides} toggleTheoryOverride={toggleTheoryOverride}
                activeId={activeId} setActiveId={setActiveId} activeOrder={activeOrder}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="session-road" style={{ padding: '12px 16px' }}>
        <div className="row spread" style={{ maxWidth: 900, margin: '0 auto', width: '100%' }}>
          <span className="hint">
            {phase === 'answer'
              ? (theoryOn && theoryQuestions.length > 0
                ? 'Ouvre chaque coche masquée : nom + champs de théorie, directement sur l\'image. Puis valide.'
                : 'Remplis le nom de chaque coche masquée, puis valide.')
              : theoryOn && theoryQuestions.length > 0
                ? <>Visuel <strong className="tnum">{correctCount}/{maskedIds.length}</strong> · Théorie <strong className="tnum">{theoryCorrect}/{theoryQuestions.length}</strong> — corrections dans chaque coche.</>
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
function SchemaQuizCanvas({ imgUrl, coches, maskedSet, firstMaskedId, answers, setAnswers, phase, evalCoche, overrides, toggleOverride, onEnter,
  theoryOn, theoryAnswers, setTheoryAnswers, evalTheory, theoryOverrides, toggleTheoryOverride, activeId, setActiveId, activeOrder }) {
  const usedColors = [...new Set(coches.map((c) => c.couleur || DEFAULT_COLOR))];
  // champs de théorie (non vides) d'une coche masquée — mêmes clés que theoryQuestions.
  const fieldsOf = (c) => (theoryOn && c.type && c.champs)
    ? champsFor(c.type).map((d) => ({ key: c.id + ':' + d.key, label: d.label, expected: (c.champs[d.key] || '').trim() })).filter((f) => f.expected)
    : [];
  // couleur de bord/remplissage selon l'état de correction (identique aux libellés).
  const stateColor = (c) => {
    if (phase === 'result' && maskedSet.has(c.id)) { const ev = evalCoche(c); return ev.ok ? '#4FB87A' : ev.near ? '#E0A34F' : '#E0556B'; }
    return c.couleur || DEFAULT_COLOR;
  };
  return (
    <div style={{ position: 'relative', width: '100%', overflow: 'hidden', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-2)' }}>
      <div style={{ position: 'relative', width: '100%', lineHeight: 0 }}>
        {imgUrl
          ? <img src={imgUrl} alt="schéma" draggable={false} style={{ display: 'block', width: '100%', height: 'auto', userSelect: 'none' }} />
          : <div style={{ width: '100%', height: 320, display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}><Icon name="image" size={32} /></div>}

        <ZonesLayer coches={coches} selectedId={null} mode="quiz" borderFor={stateColor} />

        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
          <defs>
            {usedColors.map((col) => (
              <marker key={col} id={markerId(col)} markerWidth="8" markerHeight="8" refX="5.5" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L6,3 L0,6 Z" fill={col} />
              </marker>
            ))}
          </defs>
          {coches.filter((c) => c.kind !== 'zone').map((c) => {
            const col = c.couleur || DEFAULT_COLOR;
            return <line key={c.id} x1={c.boite.x * 100 + '%'} y1={c.boite.y * 100 + '%'} x2={c.ancre.x * 100 + '%'} y2={c.ancre.y * 100 + '%'} stroke={col} strokeWidth={2.2} markerEnd={`url(#${markerId(col)})`} />;
          })}
        </svg>

        {coches.filter((c) => c.kind !== 'zone').map((c) => {
          const col = c.couleur || DEFAULT_COLOR;
          return <span key={'a' + c.id} style={{ position: 'absolute', left: c.ancre.x * 100 + '%', top: c.ancre.y * 100 + '%', width: 12, height: 12, marginLeft: -6, marginTop: -6, borderRadius: '50%', background: col, border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,.35)' }} />;
        })}

        {coches.map((c) => {
          const col = c.couleur || DEFAULT_COLOR;
          const masked = maskedSet.has(c.id);
          const fields = masked ? fieldsOf(c) : [];

          // ===== coche masquée AVEC théorie : carte enrichie ancrée (nom + champs) =====
          if (masked && fields.length > 0) {
            const active = c.id === activeId;
            const nameEv = phase === 'result' ? evalCoche(c) : null;
            const nameOk = !!(nameEv && nameEv.ok);
            const nameNear = !!(nameEv && !nameEv.ok && nameEv.near);
            const badgeCol = phase === 'result' ? (nameOk ? '#4FB87A' : nameNear ? '#E0A34F' : '#E0556B') : col;

            if (!active) {
              const filled = (answers[c.id] || '').trim() !== '' || fields.some((f) => (theoryAnswers[f.key] || '').trim() !== '');
              return (
                <button key={'b' + c.id} type="button" onClick={() => setActiveId(c.id)}
                  style={{ position: 'absolute', left: c.boite.x * 100 + '%', top: c.boite.y * 100 + '%', transform: 'translate(-50%,-50%)', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 8, background: 'var(--card)', border: `2px solid ${badgeCol}`, boxShadow: '0 2px 8px rgba(0,0,0,.18)', cursor: 'pointer', zIndex: 3 }}>
                  <span style={{ flex: '0 0 auto', width: 18, height: 18, borderRadius: '50%', background: badgeCol, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>
                    {phase === 'result' ? <Icon name={nameOk ? 'check' : 'x'} size={11} stroke={3} /> : c.numero}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)' }}>{phase === 'answer' ? (filled ? 'modifier' : 'à remplir') : 'revoir'}</span>
                  <span className="pill" style={{ height: 16, fontSize: 10, padding: '0 5px' }}>{fields.length} ch.</span>
                </button>
              );
            }

            const flipX = c.boite.x > 0.5, flipY = c.boite.y > 0.5;
            return (
              <div key={'b' + c.id}
                style={{ position: 'absolute', left: c.boite.x * 100 + '%', top: c.boite.y * 100 + '%', transform: `translate(${flipX ? '-100%' : '0'}, ${flipY ? '-100%' : '0'})`, width: 'min(260px, 72vw)', maxHeight: '84%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 11px', borderRadius: 10, background: 'var(--card)', border: `2px solid ${badgeCol}`, boxShadow: '0 8px 24px rgba(0,0,0,.28)', zIndex: 20 }}>
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <span style={{ flex: '0 0 auto', width: 20, height: 20, borderRadius: '50%', background: badgeCol, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>
                    {phase === 'result' ? <Icon name={nameOk ? 'check' : 'x'} size={12} stroke={3} /> : c.numero}
                  </span>
                  <span className="pill" style={{ height: 18, fontSize: 10.5 }}>{c.type}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <label className="hint" style={{ fontWeight: 700, fontSize: 11 }}>Nom de la structure ?</label>
                  {phase === 'answer' ? (
                    <input autoFocus value={answers[c.id] || ''} placeholder="nom ?" className="srcmgr-input" style={{ width: '100%', fontSize: 12.5 }}
                      onChange={(e) => setAnswers((a) => ({ ...a, [c.id]: e.target.value }))} />
                  ) : (
                    <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: nameOk ? '#4FB87A' : nameNear ? '#E0A34F' : 'var(--accent-2)', textDecoration: (!nameOk && !nameNear) ? 'line-through' : 'none' }}>{answers[c.id] || '(vide)'}</span>
                      {!nameOk && <span style={{ fontSize: 12, fontWeight: 700, color: '#4FB87A' }}><Icon name="check" size={11} /> {c.texte || '(sans nom)'}</span>}
                      {!nameOk && <button type="button" className="btn ghost sm" style={{ padding: '1px 6px', fontSize: 10.5 }} onClick={() => toggleOverride(c.id)}><Icon name={overrides.has(c.id) ? 'x' : 'check'} size={10} /> {overrides.has(c.id) ? 'Annuler' : 'Juste'}</button>}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, borderTop: '1px dashed var(--border)', paddingTop: 7 }}>
                  {fields.map((f) => {
                    const ev = phase === 'result' ? evalTheory({ key: f.key, expected: f.expected }) : null;
                    const ok = !!(ev && ev.ok), near = !!(ev && !ev.ok && ev.near);
                    const bc = phase !== 'result' ? 'var(--border)' : ok ? '#4FB87A' : near ? '#E0A34F' : '#E0556B';
                    return (
                      <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <label className="hint" style={{ fontWeight: 700, fontSize: 11 }}>{f.label} ?</label>
                        {phase === 'answer' ? (
                          <input value={theoryAnswers[f.key] || ''} placeholder="ta réponse…" className="srcmgr-input" style={{ width: '100%', fontSize: 12, borderColor: bc }}
                            onChange={(e) => setTheoryAnswers((a) => ({ ...a, [f.key]: e.target.value }))} />
                        ) : (
                          <div className="row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: ok ? '#4FB87A' : near ? '#E0A34F' : 'var(--accent-2)', textDecoration: (!ok && !near) ? 'line-through' : 'none' }}>{theoryAnswers[f.key] || '(vide)'}</span>
                            {!ok && <span style={{ fontSize: 12, fontWeight: 700, color: '#4FB87A' }}>→ {f.expected}</span>}
                            {!ok && <button type="button" className="btn ghost sm" style={{ padding: '1px 6px', fontSize: 10.5 }} onClick={() => toggleTheoryOverride(f.key)}><Icon name={theoryOverrides.has(f.key) ? 'x' : 'check'} size={10} /> {theoryOverrides.has(f.key) ? 'Annuler' : 'Juste'}</button>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="row spread" style={{ gap: 8 }}>
                  <button type="button" className="btn ghost sm" onClick={() => setActiveId(null)} style={{ fontSize: 11 }}><Icon name="minus" size={11} /> Réduire</button>
                  {(() => { const i = activeOrder.indexOf(c.id); const nxt = activeOrder[i + 1]; return nxt ? <button type="button" className="btn sm" onClick={() => setActiveId(nxt)} style={{ fontSize: 11 }}>Suivant <Icon name="arrowR" size={11} /></button> : null; })()}
                </div>
              </div>
            );
          }

          // ===== coche/zone sans théorie (ou non masquée) : boîte nom simple (existant) =====
          const ev = phase === 'result' && masked ? evalCoche(c) : null;
          const correct = !!(ev && ev.ok);
          const near = !!(ev && !ev.ok && ev.near);
          const wrong = phase === 'result' && masked && !correct;
          const borderCol = phase === 'result' && masked ? (correct ? '#4FB87A' : near ? '#E0A34F' : '#E0556B') : col;

          return (
            <div key={'b' + c.id} style={{ position: 'absolute', left: c.boite.x * 100 + '%', top: c.boite.y * 100 + '%', transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 4, maxWidth: '46%', padding: '4px 8px', borderRadius: 8, background: 'var(--card)', border: `2px solid ${borderCol}`, boxShadow: '0 2px 8px rgba(0,0,0,.18)', lineHeight: 1.2, zIndex: 2, opacity: !masked && phase === 'answer' ? 0.85 : 1 }}>
              <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                <span style={{ flex: '0 0 auto', width: 18, height: 18, borderRadius: '50%', background: borderCol, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>
                  {phase === 'result' && masked ? <Icon name={correct ? 'check' : 'x'} size={11} stroke={3} /> : c.numero}
                </span>
                {masked ? (
                  phase === 'answer' ? (
                    <input autoFocus={c.id === firstMaskedId}
                      value={answers[c.id] || ''} placeholder="nom ?"
                      onChange={(e) => setAnswers((a) => ({ ...a, [c.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') onEnter(); }}
                      style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', font: 'inherit', fontSize: 13, fontWeight: 600, width: 130, maxWidth: 200 }} />
                  ) : (
                    <span style={{ fontSize: 13, fontWeight: 600, color: correct ? 'var(--text)' : near ? '#E0A34F' : 'var(--accent-2)', textDecoration: wrong && !near ? 'line-through' : 'none', whiteSpace: 'nowrap' }}>
                      {answers[c.id] ? answers[c.id] : '(vide)'}
                    </span>
                  )
                ) : (
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.texte}</span>
                )}
              </div>
              {wrong && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, borderTop: '1px dashed var(--border)', paddingTop: 3 }}>
                  {near && <span style={{ fontSize: 11, fontWeight: 700, color: '#E0A34F', whiteSpace: 'nowrap' }}><Icon name="alert" size={11} /> Presque — orthographe très proche</span>}
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

/* NB : la théorie s'affiche désormais DANS la carte de chaque coche masquée
   (refonte B, cf. SchemaQuizCanvas) — plus de panneau séparé sous l'image. */
