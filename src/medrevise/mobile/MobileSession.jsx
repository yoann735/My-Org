/* ============================================================
   MedRevise mobile — session QCM + Flashcard. RÉUTILISE le moteur
   (advanceQuestion, QUALITY) et ctx.saveQuestion/ctx.saveStats — identique au
   desktop (session/Session.jsx) — seule la présentation change (une carte
   plein écran à la fois, gros boutons empilés, ordre des options mélangé
   à l'AFFICHAGE seulement : la correction reste par id, jamais par
   position, comme partout ailleurs dans l'app).
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { advanceQuestion, QUALITY, QUALITY_TO_RATING, qualityFromRatio, shuffle, todayISO, computeStreak, lastTwoAreFails } from '../lib/sm2.js';
import { index } from '../lib/planning.js';
import { Tex } from '../components/Tex.jsx';
import { isCloze, parseCloze, clozeBlanks, matchClozeBlank, highlightClozeWords } from '../lib/cloze.js';
import { SessionTrendCard, EtiquetteIconButton, etiquetteMenuItems, ContextMenu } from '../components/ui.jsx';

const isFlash = (t) => t === 'flashcard' || t === 'flash';
const RATING_QUALITY = { fail: QUALITY.rate, hard: QUALITY.difficile, easy: QUALITY.facile };
const resolveRating = (r) => (typeof r === 'number' ? (QUALITY_TO_RATING[r] || 'hard') : r);

export function MobileSession({ ctx, onQuit }) {
  const session = ctx.session || { items: [], title: 'Révision' };
  const ix = useMemo(() => index(ctx.db), [ctx.db]);

  // ordre aléatoire par id, tiré UNE SEULE FOIS au lancement (clé = session) —
  // pas dans le useMemo `items` : celui-ci dépend de ctx.db, qui change à
  // chaque carte notée (saveQuestion → reload), un shuffle() posé là
  // rebattrait l'ordre en plein milieu de la série (voir même fix, desktop
  // Session.jsx).
  const shuffleRank = useMemo(() => {
    const m = new Map();
    shuffle(session.items || []).forEach((it, i) => m.set(it.id, i));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const items = useMemo(() => (session.items || []).filter((it) => it.type === 'qcm' || isFlash(it.type)).map((it) => {
    const f = ix.fById[it.ficheId];
    return { ...it, _fiche: f };
  }).sort((a, b) => (shuffleRank.get(a.id) ?? 0) - (shuffleRank.get(b.id) ?? 0)), [session, ctx.db, ix, shuffleRank]);

  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState([]);
  const [finished, setFinished] = useState(false);
  // carnet d'erreurs v2 (étape 1) : { rating, updated } tant qu'on attend
  // Ajouter/Passer après un 2e+ raté consécutif sur une flashcard — même
  // mécanique que desktop Session.jsx, voir là-bas pour le détail.
  const [carnetPrompt, setCarnetPrompt] = useState(null);
  const item = items[idx];
  // mode cloze (saisie/retourner) : bascule simple, mémorisée entre sessions (stats).
  const clozeMode = (ctx.stats && ctx.stats.clozeMode) || 'actif';
  const setClozeMode = (m) => ctx.saveStats({ ...ctx.stats, clozeMode: m });

  // chrono par carte (flashcards) — même mécanique que desktop Session.jsx :
  // temps ACTIF (pause pendant visibilitychange→hidden), plafond des temps
  // aberrants géré par advanceQuestion (MAX_CARD_TIME_MS, lib/sm2.js).
  const cardElapsedRef = useRef(0);
  const runningSinceRef = useRef(null);
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        if (runningSinceRef.current != null) { cardElapsedRef.current += Date.now() - runningSinceRef.current; runningSinceRef.current = null; }
      } else {
        runningSinceRef.current = Date.now();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  useEffect(() => {
    cardElapsedRef.current = 0;
    runningSinceRef.current = document.hidden ? null : Date.now();
  }, [idx]);
  const cardElapsedMs = () => cardElapsedRef.current + (runningSinceRef.current != null ? Date.now() - runningSinceRef.current : 0);

  // avance réellement à la carte suivante (ou termine la série) — extrait
  // d'advance() pour être rejouable APRÈS la décision du carnet d'erreurs
  // (Ajouter/Passer), sans dupliquer la persistance SM-2 — même découpage que
  // desktop Session.jsx.
  const proceedToNext = (rating) => {
    setResults((r) => { const n = r.slice(0, idx); n[idx] = { rating }; return n; });
    setCarnetPrompt(null);
    if (idx + 1 >= items.length) { setFinished(true); return; }
    setIdx((i) => i + 1);
  };

  const advance = async (ratingIn, extra) => {
    const rating = resolveRating(ratingIn);
    if (item && !item.ephemeral) {
      const quality = RATING_QUALITY[rating];
      const applyExtra = isFlash(item.type) ? { tempsMs: cardElapsedMs() } : {};
      let updated = advanceQuestion(item, quality, applyExtra);
      delete updated._fiche;
      // rotation QCM (Étape 4, lib/planning.js pickQcmSubset) : suivi de la
      // dernière présentation + du dernier résultat (correction directe, pas
      // la notation SM-2 3 boutons) — voir même logique en desktop Session.jsx.
      if (item.type === 'qcm' && extra) {
        updated = { ...updated, lastSeenAt: todayISO(), lastResult: extra.qcmOk ? 'ok' : 'ko' };
      }
      await ctx.saveQuestion(updated);
      // carnet d'erreurs v2 (étape 1) : note SM-2 déjà persistée ci-dessus (le
      // cycle des J avance normalement) — on interrompt seulement la
      // navigation, le temps qu'on décide d'ajouter une raison ou de passer.
      // Flashcards uniquement, via le bouton "Raté" explicite (pas le cloze
      // en mode saisie, auto-noté, voir MobileClozeActiveCard#finish).
      if (isFlash(item.type) && rating === 'fail' && lastTwoAreFails(updated.historique)) {
        setCarnetPrompt({ rating, updated });
        return;
      }
    }
    proceedToNext(rating);
  };

  // "Ajouter au carnet d'erreurs" : greffe carnetRaison/carnetAt sur le record
  // déjà avancé par advance() — autre écriture outbox (LWW), aucun impact sur
  // plan/cursor/historique/missed déjà sauvés.
  const submitCarnetRaison = async (raison) => {
    const p = carnetPrompt;
    if (!p) return;
    const text = (raison || '').trim();
    if (text) await ctx.saveQuestion({ ...p.updated, carnetRaison: text, carnetAt: todayISO() });
    proceedToNext(p.rating);
  };

  // "Passer" : avance sans rien enregistrer de plus (la note Raté est déjà persistée).
  const skipCarnetRaison = () => {
    const p = carnetPrompt;
    if (!p) return;
    proceedToNext(p.rating);
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
          ? <MobileQcmCard key={item.id} item={item} onRate={advance} ctx={ctx} />
          : <MobileFlashCard key={item.id} item={item} onRate={advance} clozeMode={clozeMode} setClozeMode={setClozeMode} ctx={ctx} carnetPrompt={carnetPrompt} onCarnetSubmit={submitCarnetRaison} onCarnetSkip={skipCarnetRaison} />}
      </div>
    </div>
  );
}

function MobileQcmCard({ item, onRate, ctx }) {
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
          <MobileRateButtons onRate={(r) => onRate(r, { qcmOk: isOk })} item={item} ctx={ctx} />
        </>
      )}
    </div>
  );
}

function MobileFlashCard({ item, onRate, clozeMode, setClozeMode, ctx, carnetPrompt, onCarnetSubmit, onCarnetSkip }) {
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
      {/* carnet d'erreurs v2 (étape 1) : uniquement la flashcard classique
         (flip), pas le cloze en mode saisie — voir Session.jsx desktop pour
         le même choix de portée. */}
      {cloze && clozeMode === 'actif'
        ? <MobileClozeActiveCard item={item} onRate={onRate} ctx={ctx} />
        : <MobileClassicFlashCard item={item} cloze={cloze} onRate={onRate} ctx={ctx} carnetPrompt={carnetPrompt} onCarnetSubmit={onCarnetSubmit} onCarnetSkip={onCarnetSkip} />}
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

function MobileClassicFlashCard({ item, cloze, onRate, ctx, carnetPrompt, onCarnetSubmit, onCarnetSkip }) {
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
      {flipped && <MobileRateButtons onRate={onRate} item={item} ctx={ctx} carnetPrompt={carnetPrompt} onCarnetSubmit={onCarnetSubmit} onCarnetSkip={onCarnetSkip} />}
    </div>
  );
}

/* cloze, MODE ACTIF : un champ de saisie par trou, correction tolérante (RÉUTILISE
   matchClozeBlank → matchAnat, quiz d'anatomie). Qualité SM-2 dérivée du ratio
   de trous justes (qualityFromRatio) — pas de notation 3 boutons ici. */
function MobileClozeActiveCard({ item, onRate, ctx }) {
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
          <MobileEtiquetteControl item={item} ctx={ctx} />
          <button type="button" className="mrm-primary-btn" onClick={finish}><Icon name="check" size={16} /> Continuer</button>
        </>
      )}
    </div>
  );
}

function MobileRateButtons({ onRate, item, ctx, carnetPrompt, onCarnetSubmit, onCarnetSkip }) {
  // carnet d'erreurs v2 (étape 1) : boutons désactivés pendant qu'on attend
  // Ajouter/Passer — la note est déjà enregistrée, on évite une double
  // notation de la même carte (voir même choix, desktop Session.jsx).
  const awaitingCarnet = !!carnetPrompt;
  return (
    <div>
      <div className="mrm-rate">
        <button type="button" className="mrm-rate-btn fail" disabled={awaitingCarnet} onClick={() => onRate('fail')}>Raté <span className="sub">à revoir vite</span></button>
        <button type="button" className="mrm-rate-btn hard" disabled={awaitingCarnet} onClick={() => onRate('hard')}>Difficile <span className="sub">bientôt</span></button>
        <button type="button" className="mrm-rate-btn easy" disabled={awaitingCarnet} onClick={() => onRate('easy')}>Facile <span className="sub">dans longtemps</span></button>
      </div>
      {awaitingCarnet && <MobileCarnetPrompt onSubmit={onCarnetSubmit} onSkip={onCarnetSkip} />}
      {!awaitingCarnet && <MobileEtiquetteControl item={item} ctx={ctx} />}
    </div>
  );
}

/** carnet d'erreurs v2 (étape 1) : carte "pourquoi tu l'as loupée ?" mobile —
   même mécanique que desktop (Session.jsx CarnetPrompt) : "Ajouter" exige un
   texte non vide, "Passer" avance sans rien enregistrer de plus. */
function MobileCarnetPrompt({ onSubmit, onSkip }) {
  const [raison, setRaison] = useState('');
  return (
    <div className="mrm-carnet-prompt">
      <div className="mrm-carnet-prompt-title"><Icon name="edit" size={13} /> Pourquoi tu l'as loupée ?</div>
      <textarea
        className="mrm-textarea"
        style={{ minHeight: 64 }}
        value={raison}
        onChange={(e) => setRaison(e.target.value)}
        placeholder="Ta raison (confusion, pas révisé, mal compris…)"
      />
      <button type="button" className="mrm-primary-btn" disabled={!raison.trim()} onClick={() => onSubmit(raison)}>
        <Icon name="plus" size={15} /> Ajouter au carnet d'erreurs
      </button>
      <button type="button" className="mrm-ghost-btn" onClick={onSkip}>Passer</button>
    </div>
  );
}

/* ---- étiquette de statut du COURS depuis l'écran de réponse mobile (QCM +
   flashcard, cloze saisie compris) : RÉUTILISE tel quel EtiquetteIconButton +
   etiquetteMenuItems + ContextMenu + ctx.setFicheEtiquette — le MÊME trio que
   la bibliothèque desktop (Bibliotheque.jsx), importé du même fichier partagé
   (components/ui.jsx), pas un système d'étiquettes séparé pour le mobile.
   Bouton icône (30px) + menu flottant plutôt que la rangée de chips desktop
   (EtiquetteQuickSet) : ça reste compact sur un écran étroit, ne pousse pas
   la carte. Ne touche NI la carte ni son rattachement (ficheId) ni son
   plan/cursor SM-2 — uniquement fiche.etiquette, même écriture outbox que
   partout ailleurs. */
function MobileEtiquetteControl({ item, ctx }) {
  const [menu, setMenu] = useState(null);
  const fiche = item && item._fiche;
  if (!fiche) return null;
  const openMenu = (e) => {
    e.stopPropagation();
    setMenu({ x: Math.min(e.clientX, window.innerWidth - 200), y: Math.min(e.clientY, window.innerHeight - 170) });
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 }}>
      <span className="hint" style={{ fontSize: 12.5 }}>Étiquette du cours</span>
      <EtiquetteIconButton value={fiche.etiquette} onClick={openMenu} />
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}
          items={etiquetteMenuItems(fiche.etiquette, (v) => ctx.setFicheEtiquette(fiche.id, v))} />
      )}
    </div>
  );
}

function MobileSessionDone({ items, results, title, ctx, onQuit }) {
  const good = results.filter((r) => r && r.rating !== 'fail').length;
  const qcmTotal = items.filter((i) => i.type === 'qcm').length;
  const flashTotal = items.filter((i) => isFlash(i.type)).length;
  const qcmGood = results.filter((r) => r && r.type === 'qcm' && r.rating !== 'fail').length;
  const flashGood = results.filter((r) => r && isFlash(r.type) && r.rating !== 'fail').length;

  // même règle que desktop (Session.jsx/Celebration) : une seule fiche → on
  // loggue le point d'évolution ; plusieurs fiches → rien, plutôt que fausser
  // un graphique.
  const ficheIds = [...new Set(items.map((it) => it.ficheId).filter(Boolean))];
  const singleFicheId = ficheIds.length === 1 ? ficheIds[0] : null;

  useEffect(() => {
    const s = ctx.stats || {};
    const today = todayISO();
    if (!(s.activityDays || []).includes(today)) {
      const activityDays = [...(s.activityDays || []), today];
      const streak = computeStreak(activityDays);
      ctx.saveStats({ ...s, activityDays, streak, best: Math.max(s.best || 0, streak), dernierJourRevise: today });
    }
    if (singleFicheId) {
      ctx.logSessionResult({
        ficheId: singleFicheId, title, date: today,
        total: items.length, good, qcmTotal, qcmGood, flashTotal, flashGood,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ficheLog = useMemo(() => (singleFicheId
    ? (ctx.db.sessionsLog || []).filter((r) => r.ficheId === singleFicheId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    : null), [ctx.db.sessionsLog, singleFicheId]);

  return (
    <div className="mrm-app">
      <div className="mrm-done">
        <Icon name="trophy" size={40} />
        <div style={{ fontSize: 20, fontWeight: 700 }}>Série terminée !</div>
        <div style={{ color: 'var(--text-2)' }}>« {title} » — {good}/{items.length} réussies</div>
        {(ctx.stats && ctx.stats.streak > 0) && (
          <div className="mrm-streak"><Icon name="fire" size={14} fill /> Série : {ctx.stats.streak} jour{ctx.stats.streak > 1 ? 's' : ''}</div>
        )}
        {ficheLog && <SessionTrendCard log={ficheLog} />}
        <button type="button" className="mrm-primary-btn" style={{ maxWidth: 260, marginTop: 10 }} onClick={onQuit}>
          <Icon name="home" size={17} /> Retour à l'accueil
        </button>
      </div>
    </div>
  );
}
