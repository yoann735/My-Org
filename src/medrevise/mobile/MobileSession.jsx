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
import { applyReview, QUALITY, todayISO, computeStreak } from '../lib/sm2.js';
import { effectiveCoef, index } from '../lib/planning.js';
import { Tex } from '../components/Tex.jsx';

const isFlash = (t) => t === 'flashcard' || t === 'flash';
const RATING_QUALITY = { fail: QUALITY.rate, hard: QUALITY.difficile, easy: QUALITY.facile };

/** mélange stable (Fisher-Yates) — nouvelle permutation à chaque appel. */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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

  const advance = async (rating) => {
    if (item && !item.ephemeral) {
      const quality = RATING_QUALITY[rating];
      const updated = applyReview(item, quality, item._coef || 3);
      delete updated._fiche; delete updated._coef;
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
          : <MobileFlashCard key={item.id} item={item} onRate={advance} />}
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
          <MobileRateButtons onRate={onRate} />
        </>
      )}
    </div>
  );
}

function MobileFlashCard({ item, onRate }) {
  const [flipped, setFlipped] = useState(false);
  const [showIndice, setShowIndice] = useState(false);
  return (
    <div>
      <div className="mrm-concept">{item.theme || item.concept}</div>
      <div className="mrm-flash-scene">
        <button type="button" className="mrm-flash-card" onClick={() => setFlipped((f) => !f)}>
          {!flipped ? (
            <>
              <div className="mrm-flash-text"><Tex>{item.recto}</Tex></div>
              {item.indice && (showIndice
                ? <div className="mrm-indice" onClick={(e) => e.stopPropagation()}><Tex>{item.indice}</Tex></div>
                : <span className="mrm-flash-hint" onClick={(e) => { e.stopPropagation(); setShowIndice(true); }}><Icon name="lightbulb" size={13} /> Voir l'indice</span>)}
              <span className="mrm-flash-hint">Tape pour révéler la réponse</span>
            </>
          ) : (
            <>
              <div className="mrm-flash-back"><Tex>{item.verso}</Tex></div>
              {item.a_retenir && <div className="mrm-indice"><strong>À retenir :</strong> <Tex>{item.a_retenir}</Tex></div>}
            </>
          )}
        </button>
      </div>
      {flipped && <MobileRateButtons onRate={onRate} />}
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
