/* ============================================================
   MedRevise — session de révision : context bar, carte unique
   (QCM / flashcard flip / anatomie image), notation 3 boutons qui
   applique le VRAI SM-2 (persisté), Précédent, déroulé sectorisé,
   célébration + mise à jour du streak.
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Breadcrumb, matiereMeta, EtiquetteQuickSet } from '../components/ui.jsx';
import { Tex } from '../components/Tex.jsx';
import { applyReview, QUALITY, QUALITY_TO_RATING, qualityFromRatio, shuffle, labelForPalier, todayISO, computeStreak } from '../lib/sm2.js';
import { effectiveCoef, index } from '../lib/planning.js';
import { blobURL } from '../lib/storage.js';
import { isCloze, parseCloze, clozeBlanks, matchClozeBlank, highlightClozeWords } from '../lib/cloze.js';

const KEYS = ['A', 'B', 'C', 'D', 'E'];
const isFlash = (t) => t === 'flashcard' || t === 'flash';
const RATING_QUALITY = { fail: QUALITY.rate, hard: QUALITY.difficile, easy: QUALITY.facile };
// une notation peut arriver soit comme étiquette ('fail'|'hard'|'easy', 3 boutons),
// soit comme qualité SM-2 numérique déjà résolue (cloze actif, dérivée du ratio de
// trous justes) — on la ramène systématiquement à une étiquette pour ne garder
// qu'UN SEUL chemin de calcul de qualité (RATING_QUALITY ci-dessus).
const resolveRating = (r) => (typeof r === 'number' ? (QUALITY_TO_RATING[r] || 'hard') : r);

export function Session({ ctx }) {
  const session = ctx.session || { items: [], title: 'Révision' };
  const ix = useMemo(() => index(ctx.db), [ctx.db]);

  // enrich + order: grouped by matière, QCM then flashcards
  const items = useMemo(() => {
    const src = (session.items || []).filter((it) => it.type === 'qcm' || isFlash(it.type));
    const enriched = src.map((it) => {
      const f = ix.fById[it.ficheId];
      const m = f && ix.mById[f.matiereId];
      return { ...it, _fiche: f, _matiere: m, _coef: effectiveCoef(ctx.db, f, ix), _j: labelForPalier(it.palier).jLabel };
    });
    const order = [];
    const seen = [];
    enriched.forEach((it) => { const k = it._matiere ? it._matiere.id : '?'; if (!seen.includes(k)) seen.push(k); });
    seen.forEach((mid) => {
      const inCat = enriched.filter((i) => (i._matiere ? i._matiere.id : '?') === mid);
      order.push(...inCat.filter((i) => i.type === 'qcm'), ...inCat.filter((i) => isFlash(i.type)));
    });
    return order.length ? order : enriched;
  }, [session, ctx.db, ix]);

  const [idx, setIdx] = useState(0);
  const [anim, setAnim] = useState('in');
  const [results, setResults] = useState([]);
  const [finished, setFinished] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]); // ids d'options cochées (QCM v1.0, simple ou multiple)
  const [validated, setValidated] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [pulse, setPulse] = useState('');

  const item = items[idx];
  const resetCard = () => { setSelectedIds([]); setValidated(false); setFlipped(false); setPulse(''); };
  // mode cloze (saisie/retourner) : bascule simple, mémorisée entre sessions (stats).
  const clozeMode = (ctx.stats && ctx.stats.clozeMode) || 'actif';
  const setClozeMode = (m) => ctx.saveStats({ ...ctx.stats, clozeMode: m });

  const advance = async (ratingIn) => {
    const rating = resolveRating(ratingIn);
    // persist SM-2 — SAUF pour les items ÉPHÉMÈRES (théorie de schéma générée à la
    // volée) : ils ne sont jamais planifiés ni écrits en base (aucun impact méthode des J).
    if (item && !item.ephemeral) {
      const quality = RATING_QUALITY[rating];
      let updated = applyReview(item, quality, item._coef || 3);
      delete updated._fiche; delete updated._matiere; delete updated._coef; delete updated._j;
      // rotation QCM (Étape 4, lib/planning.js pickQcmSubset) : suivi de la
      // dernière présentation + du dernier résultat, DISTINCT de la notation
      // SM-2 3 boutons — correction directe (cochées == reponses_correctes),
      // pas la qualité choisie ensuite pour la méthode des J.
      if (item.type === 'qcm') {
        const correct = new Set(item.reponses_correctes || []);
        const ok = selectedIds.length === correct.size && selectedIds.every((id) => correct.has(id));
        updated = { ...updated, lastSeenAt: todayISO(), lastResult: ok ? 'ok' : 'ko' };
      }
      await ctx.saveQuestion(updated);
    }
    setResults((r) => { const n = r.slice(0, idx); n[idx] = { id: item.id, type: item.type, rating }; return n; });
    if (idx + 1 >= items.length) { setAnim('out'); setTimeout(() => setFinished(true), 240); return; }
    setAnim('out');
    setTimeout(() => { setIdx((i) => i + 1); resetCard(); setAnim('in'); }, 240);
  };

  const goPrev = () => { if (idx === 0) return; setAnim('outR'); setTimeout(() => { setIdx((i) => i - 1); resetCard(); setAnim('inL'); }, 220); };
  const jumpTo = (t) => { if (t >= idx) return; setAnim('outR'); setTimeout(() => { setIdx(t); resetCard(); setAnim('inL'); }, 220); };

  const validate = () => {
    if (!selectedIds.length) return;
    setValidated(true);
    // correction v1.0 : égalité d'ensemble entre coches et reponses_correctes[]
    const correct = new Set(item.reponses_correctes || []);
    const ok = selectedIds.length === correct.size && selectedIds.every((id) => correct.has(id));
    setPulse(ok ? 'pulse-ok' : 'pulse-bad');
    if (navigator.vibrate) navigator.vibrate(ok ? 18 : [12, 40, 12]);
    setTimeout(() => setPulse(''), 500);
  };

  if (!items.length) {
    return (
      <div className="screen scroll fadein">
        <div className="rev-empty" style={{ marginTop: 60 }}>
          <Icon name="check" size={30} />
          <div className="re-title">Rien à réviser ici</div>
          <button className="btn primary" onClick={() => ctx.go('revise')}>Retour</button>
        </div>
      </div>
    );
  }
  if (finished) return <Celebration items={items} results={results} session={session} ctx={ctx} />;

  const qcmTotal = items.filter((i) => i.type === 'qcm').length;
  const flashTotal = items.filter((i) => isFlash(i.type)).length;
  const qcmDone = items.slice(0, idx).filter((i) => i.type === 'qcm').length;
  const flashDone = items.slice(0, idx).filter((i) => isFlash(i.type)).length;
  const curType = item.type;
  const posInType = curType === 'qcm' ? qcmDone + 1 : flashDone + 1;
  const totInType = curType === 'qcm' ? qcmTotal : flashTotal;
  const minsLeft = Math.max(1, Math.round((items.length - idx) * 0.8));
  const meta = matiereMeta(item._matiere);
  const typeLabel = curType === 'qcm' ? 'QCM' : 'Flashcards';

  return (
    <div className="screen noscroll fadein" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="ctx-bar">
        <div style={{ minWidth: 0 }}>
          <Breadcrumb parts={['Réviser', meta.label, (item._fiche && item._fiche.titre) || session.title, typeLabel]} />
          <div className="row" style={{ gap: 10, marginTop: 9 }}>
            <span className="pill accent" style={{ height: 26 }}><Icon name="calendar" size={12} /> {item._j}</span>
            <span className="rp-count tnum">{posInType} / {totInType} {typeLabel}</span>
            <span className="meta"><Icon name="clock" size={13} className="ic" /> ~{minsLeft} min restantes</span>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="btn ghost" disabled={idx === 0} onClick={goPrev} style={{ opacity: idx === 0 ? 0.4 : 1 }}><Icon name="chevL" size={16} /> Précédent</button>
          <button className="btn ghost" onClick={() => ctx.go('revise')}><Icon name="x" size={16} /> Quitter</button>
          <button className="icon-btn" onClick={ctx.toggleTheme}><Icon name={ctx.theme === 'dark' ? 'sun' : 'moon'} size={19} /></button>
        </div>
      </div>

      <div className="rev-prog" style={{ maxWidth: 720, margin: '0 auto 18px', width: '100%' }}>
        <div className="bar"><span style={{ width: (idx / items.length) * 100 + '%' }} /></div>
        <span className="rp-count tnum">{idx + 1} / {items.length}</span>
      </div>

      <div className="rev-stage scroll" style={{ flex: '1 1 auto', overflowY: 'auto', minHeight: 0, paddingTop: 4, paddingBottom: 10, justifyContent: 'flex-start' }}>
        <div className={'rev-anim-' + anim} key={idx}>
          {item.type === 'qcm'
            ? <QcmCard item={item} meta={meta} selectedIds={selectedIds} setSelectedIds={setSelectedIds} validated={validated} validate={validate} pulse={pulse} onRate={advance} canPrev={idx > 0} onPrev={goPrev} />
            : <FlashCardView item={item} meta={meta} flipped={flipped} setFlipped={setFlipped} onRate={advance} canPrev={idx > 0} onPrev={goPrev} clozeMode={clozeMode} setClozeMode={setClozeMode} />}
        </div>
      </div>

      <Roadmap items={items} idx={idx} onJump={jumpTo} />
    </div>
  );
}

/* ---- anatomy image (from blob) ---- */
function AnatImage({ imageId, compact }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { let on = true; blobURL(imageId).then((u) => { if (on) setUrl(u); }); return () => { on = false; if (url) URL.revokeObjectURL(url); }; }, [imageId]);
  if (!imageId) return null;
  return (
    <div className={'anat-fig' + (compact ? ' compact' : '')}>
      <div className="afig-frame">
        {url ? <img src={url} alt="structure anatomique" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 12 }} />
          : <div className="afig-ph"><Icon name="image" size={compact ? 22 : 32} /></div>}
      </div>
    </div>
  );
}

function QcmCard({ item, meta, selectedIds, setSelectedIds, validated, validate, pulse, onRate, canPrev, onPrev }) {
  const multiple = !!item.multiple;
  // ordre des options mélangé à l'AFFICHAGE (Étape 5) — mémorisé par item.id pour
  // ne pas rebattre à chaque re-render (sélection, validation…) ; la correction
  // reste par id (reponses_correctes), jamais par position. Même mélange que le
  // QCM mobile (mobile/MobileSession.jsx) — lib/sm2.js#shuffle, pas de doublon.
  const options = useMemo(() => shuffle(item.options || []), [item.id]);
  const correct = new Set(item.reponses_correctes || []);
  const isOk = validated && selectedIds.length === correct.size && selectedIds.every((id) => correct.has(id));
  const optLabel = (id) => { const o = options.find((x) => x.id === id); return o ? o.texte : id; };
  const toggle = (id) => {
    if (validated) return;
    setSelectedIds((cur) => (multiple
      ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])
      : [id]));
  };
  // explications de distracteurs : on met en avant celles réellement cochées à tort
  const distract = (item.explication_distracteurs || []).filter((d) => d && d.pourquoi_faux);

  return (
    <div className={'rev-card ' + pulse}>
      <div className="rev-concept"><span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.tint, display: 'inline-block' }} /> {meta.label} · {item.theme}</div>
      <div className="rev-q"><Tex>{item.enonce}</Tex></div>
      {item.imageId && <AnatImage imageId={item.imageId} />}
      {multiple && !validated && (
        <div className="hint" style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '2px 0 10px' }}>
          <Icon name="check" size={13} /> Plusieurs réponses possibles
        </div>
      )}
      <div className="rev-choices">
        {options.map((o, i) => {
          const sel = selectedIds.includes(o.id);
          let cls = 'rev-choice';
          if (!validated && sel) cls += ' sel';
          if (validated) { cls += ' locked'; if (correct.has(o.id)) cls += ' correct'; else if (sel) cls += ' wrong'; }
          return (
            <button className={cls} key={o.id} onClick={() => toggle(o.id)}>
              <span className="rc-key" style={multiple ? { borderRadius: 6 } : undefined}>
                {validated
                  ? (correct.has(o.id) ? <Icon name="check" size={15} stroke={3} /> : (sel ? <Icon name="x" size={15} stroke={3} /> : KEYS[i]))
                  : (multiple ? (sel ? <Icon name="check" size={13} stroke={3} /> : '') : KEYS[i])}
              </span>
              <span><Tex>{o.texte}</Tex></span>
            </button>
          );
        })}
      </div>
      {!validated && (
        <div style={{ marginTop: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="btn ghost" disabled={!canPrev} style={{ opacity: canPrev ? 1 : 0.4 }} onClick={onPrev}><Icon name="chevL" size={15} /> Précédent</button>
          <button className="btn primary lg" disabled={!selectedIds.length} style={{ opacity: selectedIds.length ? 1 : 0.5 }} onClick={validate}>Valider</button>
        </div>
      )}
      {validated && <>
        {item.explication && <div className="rev-expl"><strong>{isOk ? '✓ Bonne réponse. ' : '✗ '}</strong><Tex>{item.explication}</Tex></div>}
        {distract.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {distract.map((d, i) => {
              const picked = selectedIds.includes(d.option_id);
              return (
                <div key={i} className="hint" style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '6px 10px', borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--border)', opacity: picked ? 1 : 0.75 }}>
                  <Icon name="x" size={12} style={{ color: 'var(--accent-2)', flex: '0 0 auto', marginTop: 3 }} />
                  <span><strong style={{ color: picked ? 'var(--accent-2)' : 'var(--text-2)' }}>{optLabel(d.option_id)}</strong> — <Tex>{d.pourquoi_faux}</Tex></span>
                </div>
              );
            })}
          </div>
        )}
        <RatingButtons onRate={onRate} canPrev={canPrev} onPrev={onPrev} />
      </>}
    </div>
  );
}

function FlashCardView({ item, meta, flipped, setFlipped, onRate, canPrev, onPrev, clozeMode, setClozeMode }) {
  const cloze = isCloze(item);
  return (
    <div>
      {cloze && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <div className="seg">
            <button type="button" className={'seg-btn' + (clozeMode === 'actif' ? ' active' : '')} onClick={() => setClozeMode('actif')}><Icon name="edit" size={13} /> Saisie</button>
            <button type="button" className={'seg-btn' + (clozeMode === 'flemme' ? ' active' : '')} onClick={() => setClozeMode('flemme')}><Icon name="refresh" size={13} /> Retourner</button>
          </div>
        </div>
      )}
      {cloze && clozeMode === 'actif'
        ? <ClozeActiveCard item={item} meta={meta} onRate={onRate} canPrev={canPrev} onPrev={onPrev} />
        : <ClassicFlashCard item={item} meta={meta} cloze={cloze} flipped={flipped} setFlipped={setFlipped} onRate={onRate} canPrev={canPrev} onPrev={onPrev} />}
    </div>
  );
}

/* ---- flashcard classique (flip recto/verso) — aussi utilisée par le cloze en
   mode « Retourner » : recto avec blancs visuels, verso avec les mots
   masqués mis en évidence (pas de saisie, juste une auto-évaluation SM-2). ---- */
function ClassicFlashCard({ item, meta, cloze, flipped, setFlipped, onRate, canPrev, onPrev }) {
  const [showIndice, setShowIndice] = useState(false); // réinitialisé au changement de carte (remount via key={idx})
  const revealIndice = (e) => { e.stopPropagation(); setShowIndice(true); };
  const rectoSegments = useMemo(() => (cloze ? parseCloze(item.recto, item.cloze) : null), [item.id, cloze]);
  const versoParts = useMemo(() => (cloze ? highlightClozeWords(item.verso, item.cloze) : null), [item.id, cloze]);
  return (
    <div>
      <div className="flash-scene">
        <div className={'flash-card' + (flipped ? ' flipped' : '')} onClick={() => setFlipped((f) => !f)}>
          <div className="flash-face front">
            <span className="ff-tag" style={{ color: meta.tint }}>{meta.label} · {item.theme}</span>
            {item.imageId
              ? <div className="ff-imgwrap"><AnatImage imageId={item.imageId} compact /><div className="ff-imgq">{cloze ? <ClozeRecto segments={rectoSegments} /> : <Tex>{item.recto}</Tex>}</div></div>
              : <div className="ff-text">{cloze ? <ClozeRecto segments={rectoSegments} /> : <Tex>{item.recto}</Tex>}</div>}
            {item.indice && (showIndice
              ? <div className="ff-indice" onClick={(e) => e.stopPropagation()} style={{ marginTop: 10, padding: '8px 12px', borderRadius: 10, background: 'var(--accent-soft)', color: 'var(--text)', fontSize: 13.5, display: 'flex', gap: 7, alignItems: 'baseline' }}>
                  <Icon name="lightbulb" size={13} style={{ color: 'var(--accent)', flex: '0 0 auto' }} /> <span><Tex>{item.indice}</Tex></span>
                </div>
              : <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={revealIndice}><Icon name="lightbulb" size={13} /> Indice</button>)}
            <span className="ff-hint"><Icon name="refresh" size={13} /> Clique pour révéler</span>
          </div>
          <div className="flash-face back">
            <span className="ff-tag">Réponse</span>
            <div className="ff-text">{cloze ? <ClozeVerso parts={versoParts} /> : <Tex>{item.verso}</Tex>}</div>
            {item.a_retenir && (
              <div className="ff-aretenir" style={{ marginTop: 10, padding: '8px 12px', borderRadius: 10, background: 'var(--accent-soft)', border: '1px solid var(--accent)', fontSize: 13.5, display: 'flex', gap: 7, alignItems: 'baseline' }}>
                <Icon name="star" size={13} style={{ color: 'var(--accent)', flex: '0 0 auto' }} /> <span><strong>À retenir :</strong> <Tex>{item.a_retenir}</Tex></span>
              </div>
            )}
            <span className="ff-hint"><Icon name="check" size={13} /> Comment t'en es-tu sorti ?</span>
          </div>
        </div>
      </div>
      {flipped
        ? <RatingButtons onRate={onRate} canPrev={canPrev} onPrev={onPrev} />
        : canPrev && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}><button className="btn ghost" onClick={onPrev}><Icon name="chevL" size={15} /> Carte précédente</button></div>}
    </div>
  );
}

/** recto avec blancs visuels ("[ ..... ]") à la place de chaque {{mot}} — jamais la longueur réelle du mot (pas d'indice de taille). */
function ClozeRecto({ segments }) {
  return segments.map((s, i) => (s.type === 'text' ? <Tex key={i}>{s.value}</Tex> : <span key={i} className="cloze-blank" aria-hidden="true" />));
}

/** verso complet, mots précédemment masqués mis en évidence (couleur d'accent). */
function ClozeVerso({ parts }) {
  return parts.map((p, i) => (p.hl ? <mark key={i} className="cloze-mark">{p.text}</mark> : <span key={i}>{p.text}</span>));
}

/* ---- cloze, MODE ACTIF : un champ de saisie par trou, correction tolérante
   (RÉUTILISE matchClozeBlank → matchAnat, le matcher du quiz d'anatomie).
   Qualité SM-2 dérivée du ratio de trous justes (qualityFromRatio, comme le
   quiz d'anatomie) — pas de notation 3 boutons ici. ---- */
function ClozeActiveCard({ item, meta, onRate, canPrev, onPrev }) {
  const blanks = useMemo(() => clozeBlanks(item.recto, item.cloze), [item.id]);
  const segments = useMemo(() => parseCloze(item.recto, item.cloze), [item.id]);
  const [values, setValues] = useState(() => blanks.map(() => ''));
  const [validated, setValidated] = useState(false);
  const [overrides, setOverrides] = useState(() => new Set());

  const setValue = (i, v) => setValues((arr) => arr.map((x, j) => (i === j ? v : x)));
  const evalBlank = (i) => (overrides.has(i) ? { ok: true, typo: false } : matchClozeBlank(values[i], blanks[i].expected));
  const correctCount = blanks.reduce((n, _b, i) => n + (evalBlank(i).ok ? 1 : 0), 0);
  const toggleOverride = (i) => setOverrides((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  const finish = () => {
    const ratio = blanks.length ? correctCount / blanks.length : 1;
    onRate(qualityFromRatio(ratio));
  };

  return (
    <div className="rev-card">
      <div className="rev-concept"><span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.tint, display: 'inline-block' }} /> {meta.label} · {item.theme}</div>
      <div className="rev-q"><ClozeRecto segments={segments} /></div>
      <div className="cloze-inputs">
        {blanks.map((b, i) => {
          const ev = validated ? evalBlank(i) : null;
          return (
            <div key={i} className="cloze-input-row">
              <span className="cloze-input-n">{i + 1}</span>
              <input
                className={'cloze-input' + (validated ? (ev.ok ? ' ok' : ' wrong') : '')}
                value={values[i]} disabled={validated}
                onChange={(e) => setValue(i, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !validated) setValidated(true); }}
                placeholder={`Trou ${i + 1}`}
              />
              {validated && (ev.ok
                ? <Icon name="check" size={16} title={ev.typo ? 'Juste (orthographe tolérée)' : undefined} style={{ color: 'var(--ok)', flex: '0 0 auto' }} />
                : <>
                    <span className="cloze-expected">{b.expected}</span>
                    <button type="button" className="btn ghost sm" onClick={() => toggleOverride(i)}>
                      {overrides.has(i) ? 'Annuler' : 'Compter comme juste'}
                    </button>
                  </>)}
            </div>
          );
        })}
      </div>
      {!validated ? (
        <div style={{ marginTop: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="btn ghost" disabled={!canPrev} style={{ opacity: canPrev ? 1 : 0.4 }} onClick={onPrev}><Icon name="chevL" size={15} /> Précédent</button>
          <button className="btn primary lg" onClick={() => setValidated(true)}>Valider</button>
        </div>
      ) : (
        <div style={{ marginTop: 18 }}>
          <div className="hint"><strong className="tnum">{correctCount}/{blanks.length}</strong> trou{blanks.length > 1 ? 's' : ''} juste{blanks.length > 1 ? 's' : ''}</div>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn ghost" disabled={!canPrev} style={{ opacity: canPrev ? 1 : 0.4 }} onClick={onPrev}><Icon name="chevL" size={15} /> Précédent</button>
            <button className="btn primary lg" onClick={finish}><Icon name="check" size={15} /> Continuer</button>
          </div>
        </div>
      )}
    </div>
  );
}

function RatingButtons({ onRate, canPrev, onPrev }) {
  return (
    <div>
      <div className="rev-rate">
        <button className="rate-btn fail" onClick={() => onRate('fail')}>Raté<span className="rb-sub">à revoir vite</span></button>
        <button className="rate-btn hard" onClick={() => onRate('hard')}>Difficile<span className="rb-sub">bientôt</span></button>
        <button className="rate-btn easy" onClick={() => onRate('easy')}>Facile<span className="rb-sub">dans longtemps</span></button>
      </div>
      {canPrev && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}><button className="btn ghost sm" onClick={onPrev}><Icon name="chevL" size={14} /> Revenir à la carte précédente</button></div>}
    </div>
  );
}

function Roadmap({ items, idx, onJump }) {
  const typeLabel = (t) => (t === 'qcm' ? 'QCM' : isFlash(t) ? 'Flashcards' : 'Feynman');
  const typeIcon = (t) => (t === 'qcm' ? 'list' : isFlash(t) ? 'cards' : 'lightbulb');
  const sections = [];
  items.forEach((it, i) => {
    const mk = it._matiere ? it._matiere.id : '?';
    const last = sections[sections.length - 1];
    if (last && last.mk === mk) last.nodes.push({ it, i });
    else sections.push({ mk, matiere: it._matiere, nodes: [{ it, i }] });
  });
  const cur = items[idx];
  const curSecIdx = sections.findIndex((s) => s.nodes.some((n) => n.i === idx));
  const sameTypeGroup = items.filter((x) => (x._matiere?.id) === (cur._matiere?.id) && x.type === cur.type);
  const posInGroup = items.slice(0, idx).filter((x) => (x._matiere?.id) === (cur._matiere?.id) && x.type === cur.type).length + 1;
  const nextItem = items[idx + 1];
  const meta = matiereMeta(cur._matiere);

  return (
    <div className="session-road">
      <div className="road-now">
        <span className="rn-now"><Icon name="play" size={12} fill /> Maintenant&nbsp;:<strong>&nbsp;{typeLabel(cur.type)} {posInGroup}/{sameTypeGroup.length}</strong><span className="rn-dot" style={{ background: meta.tint }} /> {meta.label} · {cur.theme || cur.concept}</span>
        {nextItem
          ? <span className="rn-next"><Icon name="arrowR" size={12} /> Ensuite&nbsp;: {matiereMeta(nextItem._matiere).label} · {typeLabel(nextItem.type)}</span>
          : <span className="rn-next"><Icon name="check" size={12} stroke={3} /> Dernière étape</span>}
      </div>
      <div className="road-sections scroll">
        {sections.map((sec, si) => {
          const sm = matiereMeta(sec.matiere);
          const done = sec.nodes.filter((n) => n.i < idx).length;
          const types = [];
          sec.nodes.forEach((n) => { let t = types.find((x) => x.type === n.it.type); if (!t) { t = { type: n.it.type, nodes: [] }; types.push(t); } t.nodes.push(n); });
          return (
            <div className={'road-sec' + (si === curSecIdx ? ' active' : '')} key={si} style={{ '--sec-tint': sm.tint }}>
              <div className="rsec-head"><span className="rsec-dot" style={{ background: sm.tint }} /><span className="rsec-name"><Icon name={sm.icon} size={12} /> {sm.label}</span><span className="rsec-count tnum">{done}/{sec.nodes.length}</span></div>
              <div className="rsec-types">
                {types.map((tp, ti) => (
                  <div className="rsec-type" key={ti}>
                    <span className="rstype-label"><Icon name={typeIcon(tp.type)} size={11} /> {typeLabel(tp.type)}</span>
                    <div className="rsec-dots">
                      {tp.nodes.map((n) => {
                        const st = n.i < idx ? 'done' : n.i === idx ? 'active' : 'future';
                        return <button key={n.i} className={'rnode ' + st} title={n.it.theme || n.it.concept} disabled={n.i > idx} onClick={() => onJump(n.i)}>{st === 'done' ? <Icon name="check" size={10} stroke={3} /> : (n.i - tp.nodes[0].i + 1)}</button>;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Celebration({ items, results, session, ctx }) {
  const good = results.filter((r) => r && r.rating !== 'fail').length;
  const qcmTotal = items.filter((i) => i.type === 'qcm').length;
  const flashTotal = items.filter((i) => isFlash(i.type)).length;
  const qcmGood = results.filter((r) => r && r.type === 'qcm' && r.rating !== 'fail').length;
  const flashGood = results.filter((r) => r && isFlash(r.type) && r.rating !== 'fail').length;
  const colors = ['var(--accent)', 'var(--accent-2)', '#4FA6D9', '#4FB87A', '#E0556B'];
  const confetti = useMemo(() => Array.from({ length: 42 }, (_, i) => ({ left: Math.random() * 100, delay: Math.random() * 0.6, dur: 1.6 + Math.random() * 1.4, bg: colors[i % colors.length], rot: Math.random() * 360 })), []);

  // record TODAY as a real activity day, then recompute the streak from
  // actual activity (never fictional/pre-filled days).
  useEffect(() => {
    const s = ctx.stats || {};
    const today = todayISO();
    if ((s.activityDays || []).includes(today)) return;
    const activityDays = [...(s.activityDays || []), today];
    const streak = computeStreak(activityDays);
    ctx.saveStats({ ...s, activityDays, streak, best: Math.max(s.best || 0, streak), dernierJourRevise: today });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const failedItems = items.filter((it, i) => results[i] && results[i].rating === 'fail');

  // proposition (non bloquante) de mettre à jour l'étiquette — seulement si la
  // session portait sur UNE SEULE fiche (sinon ambigu, on ne propose rien).
  const ficheIds = [...new Set(items.map((it) => it.ficheId).filter(Boolean))];
  const singleFiche = ficheIds.length === 1 ? ctx.db.fiches.find((f) => f.id === ficheIds[0]) : null;

  return (
    <div className="screen scroll fadein">
      <div className="confetti">{confetti.map((c, i) => <i key={i} style={{ left: c.left + '%', background: c.bg, animationDelay: c.delay + 's', animationDuration: c.dur + 's', transform: `rotate(${c.rot}deg)` }} />)}</div>
      <div className="celebrate">
        <div className="cel-badge"><Icon name="trophy" size={48} /></div>
        <h1 className="serif">Série terminée !</h1>
        <div className="cel-score">« {session.title} » — {good}/{items.length} réussies</div>
        <div className="cel-summary">
          {qcmTotal > 0 && <div className="cel-stat"><Icon name="list" size={16} /> <strong className="tnum">{qcmGood}/{qcmTotal}</strong> QCM ✓</div>}
          {flashTotal > 0 && <div className="cel-stat"><Icon name="cards" size={16} /> <strong className="tnum">{flashGood}/{flashTotal}</strong> flashcards ✓</div>}
        </div>
        <div className="cel-streak"><Icon name="fire" size={15} fill /> Série : {(ctx.stats && ctx.stats.streak) || 1} jour{((ctx.stats && ctx.stats.streak) || 1) > 1 ? 's' : ''} !</div>
        {singleFiche && (
          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center' }}>
            <EtiquetteQuickSet value={singleFiche.etiquette} onChange={(v) => ctx.setFicheEtiquette(singleFiche.id, v)} />
          </div>
        )}
        <div className="row" style={{ gap: 12, justifyContent: 'center', marginTop: 26 }}>
          <button className="btn lg" onClick={() => ctx.go('revise')}><Icon name="cards" size={16} /> Revenir à Réviser</button>
          {failedItems.length
            ? <button className="btn primary lg" onClick={() => ctx.startSession(failedItems, 'Mes erreurs')}><Icon name="refresh" size={16} /> Refaire les ratées ({failedItems.length})</button>
            : <button className="btn primary lg" onClick={() => ctx.go('dashboard')}><Icon name="home" size={16} /> Continuer</button>}
        </div>
      </div>
    </div>
  );
}
