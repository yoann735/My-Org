/* ============================================================
   MedRevise mobile — session QCM + Flashcard. RÉUTILISE le moteur SM-2
   (applyReview, QUALITY) et ctx.saveQuestion/ctx.saveStats — identique au
   desktop (session/Session.jsx) — seule la présentation change (une carte
   plein écran à la fois, gros boutons empilés, ordre des options mélangé
   à l'AFFICHAGE seulement : la correction reste par id, jamais par
   position, comme partout ailleurs dans l'app).
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { applyReview, QUALITY, QUALITY_TO_RATING, qualityFromRatio, shuffle, todayISO, computeStreak } from '../lib/sm2.js';
import { effectiveCoef, index } from '../lib/planning.js';
import { Tex } from '../components/Tex.jsx';
import { isCloze, parseCloze, clozeBlanks, matchClozeBlank, highlightClozeWords } from '../lib/cloze.js';

const isFlash = (t) => t === 'flashcard' || t === 'flash';
const RATING_QUALITY = { fail: QUALITY.rate, hard: QUALITY.difficile, easy: QUALITY.facile };
const resolveRating = (r) => (typeof r === 'number' ? (QUALITY_TO_RATING[r] || 'hard') : r);

export function MobileSession({ ctx, onQuit }) {
  const session = ctx.session || { items: [], title: 'Révision' };
  const ix = useMemo(() => index(ctx.db), [ctx.db]);

  const items = useMemo(() => (session.items || []).filter((it) => it.type === 'qcm' || isFlash(it.type)).map((it) => {
    const f = ix.fById[it.ficheId];
    return { ...it, _fiche: f, _coef: effectiveCoef(ctx.db, f, ix) };
  }), [session, ctx.db, ix]);

  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState([]);
  const [finished, setFinished] = useState(false);
  const item = items[idx];
  // mode cloze (saisie/retourner) : bascule simple, mémorisée entre sessions (stats).
  const clozeMode = (ctx.stats && ctx.stats.clozeMode) || 'actif';
  const setClozeMode = (m) => ctx.saveStats({ ...ctx.stats, clozeMode: m });

  const advance = async (ratingIn, extra) => {
    const rating = resolveRating(ratingIn);
    if (item && !item.ephemeral) {
      const quality = RATING_QUALITY[rating];
      let updated = applyReview(item, quality, item._coef || 3);
      delete updated._fiche; delete updated._coef;
      // rotation QCM (Étape 4, lib/planning.js pickQcmSubset) : suivi de la
      // dernière présentation + du dernier résultat (correction directe, pas
      // la notation SM-2 3 boutons) — voir même logique en desktop Session.jsx.
      if (item.type === 'qcm' && extra) {
        updated = { ...updated, lastSeenAt: todayISO(), lastResult: extra.qcmOk ? 'ok' : 'ko' };
      }
      await ctx.saveQuestion(updated);
    }
    setResults((r) => { const n = r.slice(0, idx); n[idx] = { rating }; return n; });
    if (idx + 1 >= items.length) { setFinished(true); return; }
    setIdx((i) => i + 1);
  };

  if (!items.length) {
    return (
      <div className="mrm-app">
        <div className="mrm-done">
          <Icon name="check" size={34} />
          <div>Rien à réviser ici.</div>
          <button type="button" className="mrm-primary-btn" style={{ maxWidth: 220 }} onClick={onQuit}>Retour</button>
        </div>
      </div>
    );
  }

  if (finished) return <MobileSessionDone items={items} results={results} title={session.title} ctx={ctx} onQuit={onQuit} />;

  return (
    <div className="mrm-app">
      <div className="mrm-header">
        <button type="button" className="mrm-quit" onClick={onQuit} aria-label="Quitter"><Icon name="x" size={18} /></button>
        <div className="mrm-progress"><span style={{ width: (idx / items.length) * 100 + '%' }} /></div>
        <span className="mrm-progress-n">{idx + 1} / {items.length}</span>
      </div>
      <div className="mrm-body">
        {item.type === 'qcm'
          ? <MobileQcmCard key={item.id} item={item} onRate={advance} />
          : <MobileFlashCard key={item.id} item={item} onRate={advance} clozeMode={clozeMode} setClozeMode={setClozeMode} />}
      </div>
    </div>
  );
}

function MobileQcmCard({ item, onRate }) {
  const options = useMemo(() => shuffle(item.options || []), [item.id]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [validated, setValidated] = useState(false);
  const multiple = !!item.multiple;
  const correct = new Set(item.reponses_correctes || []);
  const isOk = validated && selectedIds.length === correct.size && selectedIds.every((id) => correct.has(id));

  const toggle = (id) => {
    if (validated) return;
    setSelectedIds((cur) => (multiple ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id]));
  };
  const distract = (item.explication_distracteurs || []).filter((d) => d && d.pourquoi_faux);

  return (
    <div>
      <div className="mrm-concept">{item.theme || item.concept}</div>
      <div className="mrm-question"><Tex>{item.enonce}</Tex></div>
      <div className="mrm-options">
        {options.map((o) => {
          const sel = selectedIds.includes(o.id);
          let cls = 'mrm-option';
          if (!validated && sel) cls += ' sel';
          if (validated) { if (correct.has(o.id)) cls += ' correct'; else if (sel) cls += ' wrong'; }
          return (
            <button type="button" key={o.id} className={cls} onClick={() => toggle(o.id)} disabled={validated}>
              {validated
                ? <span className="mrm-opt-key">{correct.has(o.id) ? <Icon name="check" size={13} stroke={3} /> : (sel ? <Icon name="x" size={13} stroke={3} /> : '')}</span>
                : <span className="mrm-opt-key">{sel ? <Icon name="check" size={13} stroke={3} /> : ''}</span>}
              <span><Tex>{o.texte}</Tex></span>
            </button>
          );
        })}
      </div>

      {!validated ? (
        <button type="button" className="mrm-primary-btn" disabled={!selectedIds.length} onClick={() => setValidated(true)}>Valider</button>
      ) : (
        <>
          {item.explication && (
            <div className="mrm-explication"><strong>{isOk ? '✓ Bonne réponse. ' : '✗ '}</strong><Tex>{item.explication}</Tex></div>
          )}
          {distract.filter((d) => selectedIds.includes(d.option_id)).map((d, i) => (
            <div className="mrm-explication" key={i} style={{ marginTop: 8 }}><Tex>{d.pourquoi_faux}</Tex></div>
          ))}
          <MobileRateButtons onRate={(r) => onRate(r, { qcmOk: isOk })} />
        </>
      )}
    </div>
  );
}

function MobileFlashCard({ item, onRate, clozeMode, setClozeMode }) {
  const cloze = isCloze(item);
  return (
    <div>
      <div className="mrm-concept">{item.theme || item.concept}</div>
      {cloze && (
        <div className="mrm-cloze-toggle">
          <button type="button" className={'mrm-chip-btn' + (clozeMode === 'actif' ? '' : ' ghost')} onClick={() => setClozeMode('actif')} style={{ marginRight: 8 }}><Icon name="edit" size={13} /> Saisie</button>
          <button type="button" className={'mrm-chip-btn' + (clozeMode === 'flemme' ? '' : ' ghost')} onClick={() => setClozeMode('flemme')}><Icon name="refresh" size={13} /> Retourner</button>
        </div>
      )}
      {cloze && clozeMode === 'actif'
        ? <MobileClozeActiveCard item={item} onRate={onRate} />
        : <MobileClassicFlashCard item={item} cloze={cloze} onRate={onRate} />}
    </div>
  );
}

/** recto avec blancs visuels — jamais la longueur réelle du mot masqué. */
function MobileClozeRecto({ segments }) {
  return segments.map((s, i) => (s.type === 'text' ? <Tex key={i}>{s.value}</Tex> : <span key={i} className="mrm-cloze-blank" aria-hidden="true" />));
}
function MobileClozeVerso({ parts }) {
  return parts.map((p, i) => (p.hl ? <mark key={i} className="mrm-cloze-mark">{p.text}</mark> : <span key={i}>{p.text}</span>));
}

function MobileClassicFlashCard({ item, cloze, onRate }) {
  const [flipped, setFlipped] = useState(false);
  const [showIndice, setShowIndice] = useState(false);
  const rectoSegments = useMemo(() => (cloze ? parseCloze(item.recto, item.cloze) : null), [item.id, cloze]);
  const versoParts = useMemo(() => (cloze ? highlightClozeWords(item.verso, item.cloze) : null), [item.id, cloze]);
  return (
    <div>
      <div className="mrm-flash-scene">
        <button type="button" className="mrm-flash-card" onClick={() => setFlipped((f) => !f)}>
          {!flipped ? (
            <>
              <div className="mrm-flash-text">{cloze ? <MobileClozeRecto segments={rectoSegments} /> : <Tex>{item.recto}</Tex>}</div>
              {item.indice && (showIndice
                ? <div className="mrm-indice" onClick={(e) => e.stopPropagation()}><Tex>{item.indice}</Tex></div>
                : <span className="mrm-flash-hint" onClick={(e) => { e.stopPropagation(); setShowIndice(true); }}><Icon name="lightbulb" size={13} /> Voir l'indice</span>)}
              <span className="mrm-flash-hint">Tape pour révéler la réponse</span>
            </>
          ) : (
            <>
              <div className="mrm-flash-back">{cloze ? <MobileClozeVerso parts={versoParts} /> : <Tex>{item.verso}</Tex>}</div>
              {item.a_retenir && <div className="mrm-indice"><strong>À retenir :</strong> <Tex>{item.a_retenir}</Tex></div>}
            </>
          )}
        </button>
      </div>
      {flipped && <MobileRateButtons onRate={onRate} />}
    </div>
  );
}

/* cloze, MODE ACTIF : un champ de saisie par trou, correction tolérante (RÉUTILISE
   matchClozeBlank → matchAnat, quiz d'anatomie). Qualité SM-2 dérivée du ratio
   de trous justes (qualityFromRatio) — pas de notation 3 boutons ici. */
function MobileClozeActiveCard({ item, onRate }) {
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
    <div>
      <div className="mrm-question"><MobileClozeRecto segments={segments} /></div>
      <div className="mrm-cloze-inputs">
        {blanks.map((b, i) => {
          const ev = validated ? evalBlank(i) : null;
          return (
            <div key={i} className="mrm-cloze-row">
              <span className="mrm-cloze-n">{i + 1}</span>
              <input
                className={'mrm-cloze-input' + (validated ? (ev.ok ? ' ok' : ' wrong') : '')}
                value={values[i]} disabled={validated}
                onChange={(e) => setValue(i, e.target.value)}
                placeholder={`Trou ${i + 1}`}
              />
              {validated && (ev.ok
                ? <Icon name="check" size={15} title={ev.typo ? 'Juste (orthographe tolérée)' : undefined} style={{ color: 'var(--ok)', flex: '0 0 auto' }} />
                : <span className="mrm-cloze-expected">{b.expected}</span>)}
            </div>
          );
        })}
      </div>
      {validated && blanks.map((b, i) => (!evalBlank(i).ok ? (
        <button key={i} type="button" className="mrm-chip-btn ghost" style={{ marginTop: 6, marginRight: 6 }} onClick={() => toggleOverride(i)}>
          {overrides.has(i) ? `Annuler (trou ${i + 1})` : `Compter le trou ${i + 1} comme juste`}
        </button>
      ) : null))}
      {!validated ? (
        <button type="button" className="mrm-primary-btn" onClick={() => setValidated(true)}>Valider</button>
      ) : (
        <>
          <div className="mrm-explication" style={{ marginTop: 10 }}><strong className="tnum">{correctCount}/{blanks.length}</strong> trou{blanks.length > 1 ? 's' : ''} juste{blanks.length > 1 ? 's' : ''}</div>
          <button type="button" className="mrm-primary-btn" onClick={finish}><Icon name="check" size={16} /> Continuer</button>
        </>
      )}
    </div>
  );
}

function MobileRateButtons({ onRate }) {
  return (
    <div className="mrm-rate">
      <button type="button" className="mrm-rate-btn fail" onClick={() => onRate('fail')}>Raté <span className="sub">à revoir vite</span></button>
      <button type="button" className="mrm-rate-btn hard" onClick={() => onRate('hard')}>Difficile <span className="sub">bientôt</span></button>
      <button type="button" className="mrm-rate-btn easy" onClick={() => onRate('easy')}>Facile <span className="sub">dans longtemps</span></button>
    </div>
  );
}

function MobileSessionDone({ items, results, title, ctx, onQuit }) {
  const good = results.filter((r) => r && r.rating !== 'fail').length;

  useEffect(() => {
    const s = ctx.stats || {};
    const today = todayISO();
    if ((s.activityDays || []).includes(today)) return;
    const activityDays = [...(s.activityDays || []), today];
    const streak = computeStreak(activityDays);
    ctx.saveStats({ ...s, activityDays, streak, best: Math.max(s.best || 0, streak), dernierJourRevise: today });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mrm-app">
      <div className="mrm-done">
        <Icon name="trophy" size={40} />
        <div style={{ fontSize: 20, fontWeight: 700 }}>Série terminée !</div>
        <div style={{ color: 'var(--text-2)' }}>« {title} » — {good}/{items.length} réussies</div>
        {(ctx.stats && ctx.stats.streak > 0) && (
          <div className="mrm-streak"><Icon name="fire" size={14} fill /> Série : {ctx.stats.streak} jour{ctx.stats.streak > 1 ? 's' : ''}</div>
        )}
        <button type="button" className="mrm-primary-btn" style={{ maxWidth: 260, marginTop: 10 }} onClick={onQuit}>
          <Icon name="home" size={17} /> Retour à l'accueil
        </button>
      </div>
    </div>
  );
}
