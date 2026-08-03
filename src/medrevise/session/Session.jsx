/* ============================================================
   MedRevise — session de révision : context bar, carte unique
   (QCM / flashcard flip / anatomie image), notation 3 boutons qui
   applique le VRAI SM-2 (persisté), Précédent, déroulé sectorisé,
   célébration + mise à jour du streak.
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Breadcrumb, matiereMeta, EtiquetteQuickSet, SessionTrendCard } from '../components/ui.jsx';
import { Tex } from '../components/Tex.jsx';
import { advanceQuestion, recordRelearnAttempt, QUALITY, QUALITY_TO_RATING, qualityFromRatio, shuffle, labelForCursor, todayISO, computeStreak, lastTwoAreFails } from '../lib/sm2.js';
import { index } from '../lib/planning.js';
import { blobURL } from '../lib/storage.js';
import { isCloze, parseCloze, clozeBlanks, matchClozeBlank, highlightClozeWords } from '../lib/cloze.js';

const KEYS = ['A', 'B', 'C', 'D', 'E'];
// carnet d'erreurs v2 (étape 2) : 'flashcard_erreur' (V2, storage.js#newErrorCard)
// est traitée comme une flashcard pour le RENDU (carte flip) — jamais pour la
// persistance SM-2 (voir erreurMode/advance() ci-dessous, qui bifurque AVANT
// tout advanceQuestion).
const isFlash = (t) => t === 'flashcard' || t === 'flash' || t === 'flashcard_erreur';
const RATING_QUALITY = { fail: QUALITY.rate, hard: QUALITY.difficile, easy: QUALITY.facile };
// une notation peut arriver soit comme étiquette ('fail'|'hard'|'easy', 3 boutons),
// soit comme qualité SM-2 numérique déjà résolue (cloze actif, dérivée du ratio de
// trous justes) — on la ramène systématiquement à une étiquette pour ne garder
// qu'UN SEUL chemin de calcul de qualité (RATING_QUALITY ci-dessus).
const resolveRating = (r) => (typeof r === 'number' ? (QUALITY_TO_RATING[r] || 'hard') : r);

export function Session({ ctx }) {
  const session = ctx.session || { items: [], title: 'Révision' };
  // carnet d'erreurs v2 (étape 2) : session de révision des V2 (Réviser mes
  // flashcards d'erreur, CarnetDashboard.jsx) — même précédent que
  // startExercice(..., {mode:'weekend'}) (Exercice.jsx, session bonus sans
  // écriture). En mode 'erreur' : carte flip réutilisée telle quelle, mais
  // advance() ne passe JAMAIS par advanceQuestion/plan/cursor (les V2 n'en
  // ont pas) — voir plus bas.
  const erreurMode = session.mode === 'erreur';
  const ix = useMemo(() => index(ctx.db), [ctx.db]);

  // ordre aléatoire par id, tiré UNE SEULE FOIS au lancement (clé = session,
  // stable toute la durée de la série) — PAS dans le useMemo `items` ci-dessous :
  // celui-ci dépend de ctx.db, qui change à CHAQUE carte notée (saveQuestion →
  // reload), donc un shuffle() posé là rebattrait l'ordre en plein milieu de la
  // série au lieu d'une fois par lancement.
  const shuffleRank = useMemo(() => {
    const m = new Map();
    shuffle(session.items || []).forEach((it, i) => m.set(it.id, i));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // enrich + order: grouped by matière, QCM puis flashcards, mélangés DANS
  // chaque groupe (méthode des J : QCM avant flashcards reste voulu, seul
  // l'ordre à l'intérieur de chaque bloc est randomisé).
  const items = useMemo(() => {
    const src = (session.items || []).filter((it) => it.type === 'qcm' || isFlash(it.type));
    const enriched = src.map((it) => {
      const f = ix.fById[it.ficheId];
      const m = f && ix.mById[f.matiereId];
      return { ...it, _fiche: f, _matiere: m, _j: labelForCursor(it).jLabel };
    });
    const byRank = (a, b) => (shuffleRank.get(a.id) ?? 0) - (shuffleRank.get(b.id) ?? 0);
    const order = [];
    const seen = [];
    enriched.forEach((it) => { const k = it._matiere ? it._matiere.id : '?'; if (!seen.includes(k)) seen.push(k); });
    seen.forEach((mid) => {
      const inCat = enriched.filter((i) => (i._matiere ? i._matiere.id : '?') === mid);
      order.push(...inCat.filter((i) => i.type === 'qcm').sort(byRank), ...inCat.filter((i) => isFlash(i.type)).sort(byRank));
    });
    return order.length ? order : enriched;
  }, [session, ctx.db, ix, shuffleRank]);

  const [idx, setIdx] = useState(0);
  const [anim, setAnim] = useState('in');
  const [results, setResults] = useState([]);
  const [finished, setFinished] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]); // ids d'options cochées (QCM v1.0, simple ou multiple)
  const [validated, setValidated] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [pulse, setPulse] = useState('');
  // carnet d'erreurs v2 (étape 1) : { rating, updated, addedRelearn } tant
  // qu'on attend une décision (Ajouter/Passer) après un 2e+ raté consécutif
  // sur une flashcard — null sinon. `updated` = le record déjà persisté par
  // advance() (intervalDays/dueDate/historique/missed à jour), réutilisé tel
  // quel pour y greffer carnetRaison/carnetAt sans recalculer la méthode des
  // J. `addedRelearn` : voir extraItems ci-dessous.
  const [carnetPrompt, setCarnetPrompt] = useState(null);
  // relearning step (moteur adaptatif, Raté) : file d'attente EN MÉMOIRE DE
  // SESSION uniquement, jamais persistée — une carte ratée y est ajoutée et
  // ne réapparaît qu'APRÈS toutes les cartes initialement prévues ("fin de
  // séance"), pour un second passage. Distincte de `items` (qui reste la
  // liste FIXE de la série, dérivée de session.items) : `allItems` étend la
  // série affichée sans jamais toucher à `items` lui-même (Roadmap/compteurs
  // affichent naturellement le total qui grandit d'1 à chaque Raté, comme un
  // "learning step" — même principe que la plupart des apps de répétition
  // espacée). `_relearn: true` sur l'entrée marque un second passage : sa
  // notation appelle recordRelearnAttempt (historique-only, voir sm2.js) et
  // n'est JAMAIS re-mise en file (une seule répétition par Raté, confirmé).
  const [extraItems, setExtraItems] = useState([]);
  const allItems = useMemo(() => [...items, ...extraItems], [items, extraItems]);

  const item = allItems[idx];
  const resetCard = () => { setSelectedIds([]); setValidated(false); setFlipped(false); setPulse(''); setCarnetPrompt(null); };
  // mode cloze (saisie/retourner) : bascule simple, mémorisée entre sessions (stats).
  const clozeMode = (ctx.stats && ctx.stats.clozeMode) || 'actif';
  const setClozeMode = (m) => ctx.saveStats({ ...ctx.stats, clozeMode: m });

  // chrono par carte (flashcards) : temps ACTIF, pas wall-clock — cardElapsedRef
  // accumule, runningSinceRef pointe le début du segment en cours (null =
  // en pause, onglet caché). Le plafond (rejet des temps aberrants) est géré
  // par advanceQuestion (MAX_CARD_TIME_MS, lib/sm2.js), pas ici.
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
  // nouvelle carte affichée (avance, précédent, roadmap) → le chrono repart de zéro.
  useEffect(() => {
    cardElapsedRef.current = 0;
    runningSinceRef.current = document.hidden ? null : Date.now();
  }, [idx]);
  const cardElapsedMs = () => cardElapsedRef.current + (runningSinceRef.current != null ? Date.now() - runningSinceRef.current : 0);

  // avance réellement à la carte suivante (ou termine la série) — extrait
  // d'advance() pour être rejouable APRÈS la décision du carnet d'erreurs
  // (Ajouter/Passer), sans dupliquer la persistance du moteur. `addedRelearn`
  // : true si CETTE notation vient de pousser une nouvelle entrée dans
  // extraItems (Raté) — `allItems.length` n'a pas encore répercuté ce push
  // au moment de cet appel (setExtraItems est async), donc on corrige le
  // total explicitement plutôt que de lire une valeur non encore à jour.
  const proceedToNext = (rating, itemId, itemType, addedRelearn = false) => {
    setResults((r) => { const n = r.slice(0, idx); n[idx] = { id: itemId, type: itemType, rating }; return n; });
    const total = allItems.length + (addedRelearn ? 1 : 0);
    if (idx + 1 >= total) { setAnim('out'); setTimeout(() => setFinished(true), 240); return; }
    setAnim('out');
    setTimeout(() => { setIdx((i) => i + 1); resetCard(); setAnim('in'); }, 240);
  };

  const advance = async (ratingIn) => {
    // carnet d'erreurs v2 (étape 2) : mode 'erreur' — ratingIn est ici
    // 'resolu'|'a_revoir' (ErreurRatingButtons), JAMAIS 'fail'/'hard'/'easy'.
    // Bifurque AVANT tout le reste : pas de resolveRating (numérique = cloze
    // actif, N/A pour une V2), pas d'advanceQuestion, pas de carnetPrompt
    // (celui-ci concerne UNIQUEMENT les V1) — juste ctx.setV2Statut, puis la
    // navigation habituelle (proceedToNext, réutilisée telle quelle).
    if (erreurMode) {
      if (item) await ctx.setV2Statut(item.id, ratingIn);
      proceedToNext(ratingIn === 'resolu' ? 'easy' : 'fail', item.id, item.type);
      return;
    }
    const rating = resolveRating(ratingIn);
    let addedRelearn = false;
    // persist — SAUF pour les items ÉPHÉMÈRES (théorie de schéma générée à la
    // volée) : ils ne sont jamais planifiés ni écrits en base (aucun impact méthode des J).
    if (item && !item.ephemeral) {
      const quality = RATING_QUALITY[rating];
      // chrono uniquement pour les flashcards (voir la demande) — un QCM n'a
      // pas de "temps par carte" affiché dans Réviser.
      const applyExtra = isFlash(item.type) ? { tempsMs: cardElapsedMs() } : {};
      // relearning (moteur adaptatif) : une répétition (`item._relearn`) ne
      // rejoue JAMAIS le calcul d'intervalle (recordRelearnAttempt,
      // historique-only) — sinon on écraserait le dueDate déjà posé par le
      // Raté initial et reproduirait le bug historique (voir sm2.js header).
      let updated = item._relearn ? recordRelearnAttempt(item, quality, applyExtra) : advanceQuestion(item, quality, applyExtra);
      delete updated._fiche; delete updated._matiere; delete updated._j; delete updated._relearn;
      // rotation QCM (Étape 4, lib/planning.js pickQcmSubset) : suivi de la
      // dernière présentation + du dernier résultat, DISTINCT de la notation
      // 3 boutons — correction directe (cochées == reponses_correctes),
      // pas la qualité choisie ensuite pour la méthode des J.
      if (item.type === 'qcm') {
        const correct = new Set(item.reponses_correctes || []);
        const ok = selectedIds.length === correct.size && selectedIds.every((id) => correct.has(id));
        updated = { ...updated, lastSeenAt: todayISO(), lastResult: ok ? 'ok' : 'ko' };
      }
      await ctx.saveQuestion(updated);
      // relearning step (Raté, moteur adaptatif) : la carte revient EN
      // MÉMOIRE DE SESSION en fin de série (voir extraItems ci-dessus) — une
      // seule fois par Raté, jamais si `item` est déjà une répétition
      // (`item._relearn`, pas de récursion, confirmé). S'applique à QCM ET
      // flashcard (la règle 1 ne restreint pas aux flashcards, contrairement
      // au carnet d'erreurs ci-dessous).
      if (!item._relearn && rating === 'fail') {
        const f = ix.fById[updated.ficheId];
        const m = f && ix.mById[f.matiereId];
        setExtraItems((prev) => [...prev, { ...updated, _fiche: f, _matiere: m, _j: 'Reprise', _relearn: true }]);
        addedRelearn = true;
      }
      // carnet d'erreurs v2 (étape 1) : la note est déjà persistée ci-dessus
      // (le cycle des J avance normalement, quelle que soit la suite) — on
      // interrompt seulement la NAVIGATION vers la carte suivante, le temps que
      // l'utilisateur décide d'ajouter une raison ou de passer. Flashcards
      // uniquement (isFlash), et seulement via le bouton "Raté" explicite —
      // pas le cloze en mode saisie (auto-noté, pas de bouton Raté). S'applique
      // aussi bien à un Raté "normal" qu'à un Raté sur la répétition de
      // relearning (updated.historique porte alors les 2 entrées consécutives).
      if (isFlash(item.type) && rating === 'fail' && lastTwoAreFails(updated.historique)) {
        setCarnetPrompt({ rating, updated, addedRelearn });
        return;
      }
    }
    proceedToNext(rating, item.id, item.type, addedRelearn);
  };

  // "Ajouter au carnet d'erreurs" : greffe carnetRaison/carnetAt sur le record
  // déjà avancé par advance() (autre écriture outbox, LWW — aucun impact sur
  // intervalDays/dueDate/historique/missed déjà sauvés).
  const submitCarnetRaison = async (raison) => {
    const p = carnetPrompt;
    if (!p) return;
    const text = (raison || '').trim();
    if (text) await ctx.saveQuestion({ ...p.updated, carnetRaison: text, carnetAt: todayISO() });
    setCarnetPrompt(null);
    proceedToNext(p.rating, p.updated.id, p.updated.type, p.addedRelearn);
  };

  // "Passer" : avance sans rien enregistrer de plus (la note Raté, elle, est
  // déjà persistée).
  const skipCarnetRaison = () => {
    const p = carnetPrompt;
    if (!p) return;
    setCarnetPrompt(null);
    proceedToNext(p.rating, p.updated.id, p.updated.type, p.addedRelearn);
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
  if (finished) return <Celebration items={allItems} results={results} session={session} ctx={ctx} />;

  const qcmTotal = allItems.filter((i) => i.type === 'qcm').length;
  const flashTotal = allItems.filter((i) => isFlash(i.type)).length;
  const qcmDone = allItems.slice(0, idx).filter((i) => i.type === 'qcm').length;
  const flashDone = allItems.slice(0, idx).filter((i) => isFlash(i.type)).length;
  const curType = item.type;
  const posInType = curType === 'qcm' ? qcmDone + 1 : flashDone + 1;
  const totInType = curType === 'qcm' ? qcmTotal : flashTotal;
  const minsLeft = Math.max(1, Math.round((allItems.length - idx) * 0.8));
  const meta = matiereMeta(item._matiere);
  const typeLabel = curType === 'qcm' ? 'QCM' : erreurMode ? "Flashcards d'erreur" : 'Flashcards';

  return (
    <div className="screen noscroll fadein" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="ctx-bar">
        <div style={{ minWidth: 0 }}>
          {/* erreurMode : pas de matière/fiche (V2 hors cours, ficheId null) ni de
             badge "J" (pas de plan/cursor — le badge afficherait "Nouveau", trompeur
             pour une carte volontairement hors cycle). */}
          <Breadcrumb parts={erreurMode ? ['Carnet', session.title, typeLabel] : ['Réviser', meta.label, (item._fiche && item._fiche.titre) || session.title, typeLabel]} />
          <div className="row" style={{ gap: 10, marginTop: 9 }}>
            {!erreurMode && <span className="pill accent" style={{ height: 26 }}><Icon name="calendar" size={12} /> {item._j}</span>}
            <span className="rp-count tnum">{posInType} / {totInType} {typeLabel}</span>
            <span className="meta"><Icon name="clock" size={13} className="ic" /> ~{minsLeft} min restantes</span>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="btn ghost" disabled={idx === 0} onClick={goPrev} style={{ opacity: idx === 0 ? 0.4 : 1 }}><Icon name="chevL" size={16} /> Précédent</button>
          <button className="btn ghost" onClick={() => ctx.go(erreurMode ? 'carnet' : 'revise')}><Icon name="x" size={16} /> Quitter</button>
          <button className="icon-btn" onClick={ctx.toggleTheme}><Icon name={ctx.theme === 'dark' ? 'sun' : 'moon'} size={19} /></button>
        </div>
      </div>

      <div className="rev-prog" style={{ maxWidth: 720, margin: '0 auto 18px', width: '100%' }}>
        <div className="bar"><span style={{ width: (idx / allItems.length) * 100 + '%' }} /></div>
        <span className="rp-count tnum">{idx + 1} / {allItems.length}</span>
      </div>

      <div className="rev-stage scroll" style={{ flex: '1 1 auto', overflowY: 'auto', minHeight: 0, paddingTop: 4, paddingBottom: 10, justifyContent: 'flex-start' }}>
        <div className={'rev-anim-' + anim} key={idx}>
          {item.type === 'qcm'
            ? <QcmCard item={item} meta={meta} selectedIds={selectedIds} setSelectedIds={setSelectedIds} validated={validated} validate={validate} pulse={pulse} onRate={advance} canPrev={idx > 0} onPrev={goPrev} ctx={ctx} />
            : <FlashCardView item={item} meta={meta} flipped={flipped} setFlipped={setFlipped} onRate={advance} canPrev={idx > 0} onPrev={goPrev} clozeMode={clozeMode} setClozeMode={setClozeMode} ctx={ctx} carnetPrompt={carnetPrompt} onCarnetSubmit={submitCarnetRaison} onCarnetSkip={skipCarnetRaison} erreurMode={erreurMode} />}
        </div>
      </div>

      <Roadmap items={allItems} idx={idx} onJump={jumpTo} />
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

function QcmCard({ item, meta, selectedIds, setSelectedIds, validated, validate, pulse, onRate, canPrev, onPrev, ctx }) {
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
        <RatingButtons onRate={onRate} canPrev={canPrev} onPrev={onPrev} item={item} ctx={ctx} />
      </>}
    </div>
  );
}

function FlashCardView({ item, meta, flipped, setFlipped, onRate, canPrev, onPrev, clozeMode, setClozeMode, ctx, carnetPrompt, onCarnetSubmit, onCarnetSkip, erreurMode }) {
  const cloze = isCloze(item);
  // carnet d'erreurs v2 : une V2 PEUT porter un cloze (prompt externe,
  // parseErrorCardsJson.js) — mais jamais le mode "Saisie" (ClozeActiveCard) :
  // son finish() émet une QUALITÉ SM-2 numérique (qualityFromRatio), pas
  // 'resolu'/'a_revoir', ce qui casserait ctx.setV2Statut. En erreurMode, on
  // force donc "Retourner" (ClassicFlashCard sait déjà rendre un recto/verso
  // cloze SANS notation active) — seul sous-mode compatible avec le bouton
  // Résolu/À revoir.
  const clozeActive = cloze && clozeMode === 'actif' && !erreurMode;
  return (
    <div>
      {cloze && !erreurMode && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <div className="seg">
            <button type="button" className={'seg-btn' + (clozeMode === 'actif' ? ' active' : '')} onClick={() => setClozeMode('actif')}><Icon name="edit" size={13} /> Saisie</button>
            <button type="button" className={'seg-btn' + (clozeMode === 'flemme' ? ' active' : '')} onClick={() => setClozeMode('flemme')}><Icon name="refresh" size={13} /> Retourner</button>
          </div>
        </div>
      )}
      {/* carnet d'erreurs v2 (étape 1) : uniquement la flashcard classique (flip),
         via son bouton "Raté" explicite — pas le cloze en mode saisie, auto-noté
         sans bouton Raté (voir ClozeActiveCard#finish). */}
      {clozeActive
        ? <ClozeActiveCard item={item} meta={meta} onRate={onRate} canPrev={canPrev} onPrev={onPrev} ctx={ctx} />
        : <ClassicFlashCard item={item} meta={meta} cloze={cloze} flipped={flipped} setFlipped={setFlipped} onRate={onRate} canPrev={canPrev} onPrev={onPrev} ctx={ctx} carnetPrompt={carnetPrompt} onCarnetSubmit={onCarnetSubmit} onCarnetSkip={onCarnetSkip} erreurMode={erreurMode} />}
    </div>
  );
}

/* ---- flashcard classique (flip recto/verso) — aussi utilisée par le cloze en
   mode « Retourner » : recto avec blancs visuels, verso avec les mots
   masqués mis en évidence (pas de saisie, juste une auto-évaluation SM-2). ---- */
function ClassicFlashCard({ item, meta, cloze, flipped, setFlipped, onRate, canPrev, onPrev, ctx, carnetPrompt, onCarnetSubmit, onCarnetSkip, erreurMode }) {
  const [showIndice, setShowIndice] = useState(false); // réinitialisé au changement de carte (remount via key={idx})
  const revealIndice = (e) => { e.stopPropagation(); setShowIndice(true); };
  const rectoSegments = useMemo(() => (cloze ? parseCloze(item.recto, item.cloze) : null), [item.id, cloze]);
  const versoParts = useMemo(() => (cloze ? highlightClozeWords(item.verso, item.cloze) : null), [item.id, cloze]);
  return (
    <div>
      <div className="flash-scene">
        <div className={'flash-card' + (flipped ? ' flipped' : '')} onClick={() => setFlipped((f) => !f)}>
          <div className="flash-face front">
            <span className="ff-tag" style={{ color: meta.tint }}>{erreurMode ? "Flashcard d'erreur" : `${meta.label} · ${item.theme}`}</span>
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
        ? (erreurMode
            ? <ErreurRatingButtons onRate={onRate} canPrev={canPrev} onPrev={onPrev} />
            : <RatingButtons onRate={onRate} canPrev={canPrev} onPrev={onPrev} item={item} ctx={ctx} carnetPrompt={carnetPrompt} onCarnetSubmit={onCarnetSubmit} onCarnetSkip={onCarnetSkip} />)
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
function ClozeActiveCard({ item, meta, onRate, canPrev, onPrev, ctx }) {
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
          <CardEtiquetteControl item={item} ctx={ctx} />
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn ghost" disabled={!canPrev} style={{ opacity: canPrev ? 1 : 0.4 }} onClick={onPrev}><Icon name="chevL" size={15} /> Précédent</button>
            <button className="btn primary lg" onClick={finish}><Icon name="check" size={15} /> Continuer</button>
          </div>
        </div>
      )}
    </div>
  );
}

function RatingButtons({ onRate, canPrev, onPrev, item, ctx, carnetPrompt, onCarnetSubmit, onCarnetSkip }) {
  // carnet d'erreurs v2 (étape 1) : la note est déjà enregistrée dès qu'on
  // attend une décision (Ajouter/Passer) — les 3 boutons se désactivent pour
  // éviter une double notation de la même carte pendant que la carte
  // "pourquoi" est affichée dessous.
  const awaitingCarnet = !!carnetPrompt;
  return (
    <div>
      <div className="rev-rate">
        <button className="rate-btn fail" disabled={awaitingCarnet} onClick={() => onRate('fail')}>Raté<span className="rb-sub">à revoir vite</span></button>
        <button className="rate-btn hard" disabled={awaitingCarnet} onClick={() => onRate('hard')}>Difficile<span className="rb-sub">bientôt</span></button>
        <button className="rate-btn easy" disabled={awaitingCarnet} onClick={() => onRate('easy')}>Facile<span className="rb-sub">dans longtemps</span></button>
      </div>
      {awaitingCarnet && <CarnetPrompt onSubmit={onCarnetSubmit} onSkip={onCarnetSkip} />}
      {!awaitingCarnet && <CardEtiquetteControl item={item} ctx={ctx} />}
      {!awaitingCarnet && canPrev && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}><button className="btn ghost sm" onClick={onPrev}><Icon name="chevL" size={14} /> Revenir à la carte précédente</button></div>}
    </div>
  );
}

/** carnet d'erreurs v2 (étape 2) : notation d'une V2 pendant "Réviser mes
   flashcards d'erreur" (Session.jsx erreurMode) — 2 boutons SEULEMENT
   (Résolu/À revoir), PAS Facile/Difficile/Raté : une V2 n'a pas de cycle J,
   rien à faire avancer (voir advance() qui bifurque sur ctx.setV2Statut,
   jamais advanceQuestion). Pas de CardEtiquetteControl (item._fiche est
   toujours undefined pour une V2, ficheId null). */
function ErreurRatingButtons({ onRate, canPrev, onPrev }) {
  return (
    <div>
      <div className="rev-rate erreur-rate">
        <button className="rate-btn revoir" onClick={() => onRate('a_revoir')}>À revoir<span className="rb-sub">pas encore acquis</span></button>
        <button className="rate-btn resolu" onClick={() => onRate('resolu')}>Résolu<span className="rb-sub">c'est bon</span></button>
      </div>
      {canPrev && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}><button className="btn ghost sm" onClick={onPrev}><Icon name="chevL" size={14} /> Revenir à la carte précédente</button></div>}
    </div>
  );
}

/** carnet d'erreurs v2 (étape 1) : carte "pourquoi tu l'as loupée ?" — sous les
   3 boutons de notation, au 2e raté consécutif (et chaque raté suivant tant que
   le streak dure, voir lastTwoAreFails). "Ajouter" exige un texte non vide ;
   "Passer" avance sans rien enregistrer de plus (la note Raté est déjà persistée
   par advance() avant l'affichage de cette carte). */
function CarnetPrompt({ onSubmit, onSkip }) {
  const [raison, setRaison] = useState('');
  return (
    <div className="carnet-prompt">
      <div className="carnet-prompt-title"><Icon name="edit" size={13} /> Pourquoi tu l'as loupée ?</div>
      <textarea
        className="imp-title"
        style={{ width: '100%', minHeight: 56, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
        value={raison}
        onChange={(e) => setRaison(e.target.value)}
        placeholder="Ta raison (confusion, pas révisé, mal compris…)"
      />
      <div className="carnet-prompt-actions">
        <button type="button" className="btn ghost sm" onClick={onSkip}>Passer</button>
        <button type="button" className="btn primary sm" disabled={!raison.trim()} onClick={() => onSubmit(raison)}>
          <Icon name="plus" size={13} /> Ajouter au carnet d'erreurs
        </button>
      </div>
    </div>
  );
}

/* ---- étiquette de statut du COURS depuis l'écran de réponse (QCM/flashcard,
   y compris cloze en saisie) : RÉUTILISE tel quel EtiquetteQuickSet + le champ
   fiche.etiquette + ctx.setFicheEtiquette — exactement le mécanisme de la
   bibliothèque (Bibliotheque.jsx) et de l'écran de fin de série plus bas dans
   ce même fichier (Celebration). Ne touche NI la carte ni son rattachement
   (ficheId) ni son plan/cursor SM-2 — seule fiche.etiquette change, même
   écriture outbox (put('fiches', …) → reload()) que partout ailleurs. */
function CardEtiquetteControl({ item, ctx }) {
  const fiche = item._fiche;
  if (!fiche) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
      <EtiquetteQuickSet value={fiche.etiquette} onChange={(v) => ctx.setFicheEtiquette(fiche.id, v)} />
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

  // proposition (non bloquante) de mettre à jour l'étiquette, ET point de la
  // courbe d'évolution — seulement si la session portait sur UNE SEULE fiche
  // (sinon ambigu, on ne propose/loggue rien plutôt que de fausser un graphique).
  const ficheIds = [...new Set(items.map((it) => it.ficheId).filter(Boolean))];
  const singleFiche = ficheIds.length === 1 ? ctx.db.fiches.find((f) => f.id === ficheIds[0]) : null;

  // record TODAY as a real activity day, then recompute the streak from
  // actual activity (never fictional/pre-filled days) ; loggue aussi le
  // résultat de cette série (écran de fin — graphique d'évolution, voir
  // ctx.logSessionResult/SessionTrendCard).
  useEffect(() => {
    const s = ctx.stats || {};
    const today = todayISO();
    if (!(s.activityDays || []).includes(today)) {
      const activityDays = [...(s.activityDays || []), today];
      const streak = computeStreak(activityDays);
      ctx.saveStats({ ...s, activityDays, streak, best: Math.max(s.best || 0, streak), dernierJourRevise: today });
    }
    if (singleFiche) {
      ctx.logSessionResult({
        ficheId: singleFiche.id, title: session.title, date: today,
        total: items.length, good, qcmTotal, qcmGood, flashTotal, flashGood,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const failedItems = items.filter((it, i) => results[i] && results[i].rating === 'fail');

  const ficheLog = useMemo(() => (singleFiche
    ? (ctx.db.sessionsLog || []).filter((r) => r.ficheId === singleFiche.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    : null), [ctx.db.sessionsLog, singleFiche]);

  return (
    <div className="screen scroll fadein">
      <div className="confetti">{confetti.map((c, i) => <i key={i} style={{ left: c.left + '%', background: c.bg, animationDelay: c.delay + 's', animationDuration: c.dur + 's', transform: `rotate(${c.rot}deg)` }} />)}</div>
      <div className="celebrate">
        <div className="cel-badge"><Icon name="trophy" size={48} /></div>
        <h1 className="serif">Série terminée !</h1>
        <div className="cel-score">« {session.title} » — {good}/{items.length} réussies</div>
        <div className="cel-summary">
          {qcmTotal > 0 && <div className="cel-stat"><Icon name="list" size={16} /> <strong className="tnum">{qcmGood}/{qcmTotal}</strong> QCM ✓</div>}
          {flashTotal > 0 && <div className="cel-stat"><Icon name="cards" size={16} /> <strong className="tnum">{flashGood}/{flashTotal}</strong> {session.mode === 'erreur' ? 'résolues' : 'flashcards ✓'}</div>}
        </div>
        <div className="cel-streak"><Icon name="fire" size={15} fill /> Série : {(ctx.stats && ctx.stats.streak) || 1} jour{((ctx.stats && ctx.stats.streak) || 1) > 1 ? 's' : ''} !</div>
        {ficheLog && <SessionTrendCard log={ficheLog} />}
        {singleFiche && (
          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center' }}>
            <EtiquetteQuickSet value={singleFiche.etiquette} onChange={(v) => ctx.setFicheEtiquette(singleFiche.id, v)} />
          </div>
        )}
        <div className="row" style={{ gap: 12, justifyContent: 'center', marginTop: 26 }}>
          <button className="btn lg" onClick={() => ctx.go(session.mode === 'erreur' ? 'carnet' : 'revise')}><Icon name="cards" size={16} /> {session.mode === 'erreur' ? 'Revenir au carnet' : 'Revenir à Réviser'}</button>
          {failedItems.length
            // carnet d'erreurs v2 (étape 2) : en mode 'erreur', "les ratées" sont
            // les V2 encore "à revoir" — relancer DOIT préserver mode:'erreur'
            // (sinon Session.jsx tenterait un advanceQuestion sur des cartes sans
            // plan/cursor).
            ? <button className="btn primary lg" onClick={() => ctx.startSession(failedItems, session.mode === 'erreur' ? "Mes flashcards d'erreur" : 'Mes erreurs', session.mode === 'erreur' ? { mode: 'erreur' } : {})}><Icon name="refresh" size={16} /> {session.mode === 'erreur' ? 'Refaire celles à revoir' : 'Refaire les ratées'} ({failedItems.length})</button>
            : <button className="btn primary lg" onClick={() => ctx.go('dashboard')}><Icon name="home" size={16} /> Continuer</button>}
        </div>
      </div>
    </div>
  );
}
