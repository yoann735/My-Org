/* ============================================================
   MedRevise — SÉANCE QUOTIDIENNE DES FLASHCARDS (06/10/2026,
   docs/compte-rendu-apprentissage-flashcards.md). Un seul bouton, aucun choix de mode.
   Bloc 1 Révisions : flashcards « en révision » échues, une vue chacune, notation
     Raté / Difficile / Facile de la méthode des J (advanceQuestion, inchangé).
   Bloc 2 Apprendre : nouvelles du jour (quota) + cartes en cours / redescendues.
     Première vue = présentation recto + verso ; ensuite tests Pas su / Su, réinsertion
     dans la file (lib/apprentissageFC.js reinserer) — jamais d'attente : tant que la
     file n'est pas vide, il y a une carte à montrer.
   L'état (file, position, compteurs, temps) est écrit dans IndexedDB (store `meta`,
   local à l'appareil) après chaque réponse et quand l'onglet passe en arrière-plan ;
   la progression de chaque carte (streak, présentée, état) est écrite sur la carte
   elle-même, donc synchronisée.
   Partagé bureau / mobile : `onQuit` (mobile) ou ctx.endSeanceFC (bureau).

   UN BLOC SEUL, OU BASCULER (08/10, docs/compte-rendu-tablette-document-transcript.md) :
   `bloc` = 'tout' (révisions puis apprentissage, comme avant) | 'revisions' | 'apprendre'.
   Les deux blocs vivent dans le MÊME état (révisions + position, file d'apprentissage) :
   « Passer à l'apprentissage » / « Revenir aux révisions » ne fait que changer de phase —
   rien n'est perdu ni recompté, la notation, le paquet à 3 succès et la réinsertion ne
   changent pas. Un bloc fini alors que l'autre a encore des cartes → écran « bloc
   terminé » (phase 'pause-bloc') : la séance n'est PAS close, elle se reprend plus tard.
   ============================================================ */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Tex } from '../components/Tex.jsx';
import { ZoneDefilante } from '../components/ZoneDefilante.jsx';
import { OcclusionView, estOcclusion } from '../components/OcclusionImage.jsx';
import { TableauMuscle, ligneParLigne } from '../components/FlashcardMuscle.jsx';
import { estMuscle } from '../lib/muscle.js';
import { ImageFlashcard, imageAuRecto, imageAuVerso } from '../components/FlashcardImage.jsx';
import { isCloze, parseCloze, highlightClozeWords } from '../lib/cloze.js';
import { put, putMany, getMeta, setMeta } from '../lib/storage.js';
import { advanceQuestion, QUALITY, todayISO } from '../lib/sm2.js';
import { index, isFicheScheduled, nextDate } from '../lib/planning.js';
import {
  planDuJour, introduire, presenter, repondre, apresNotationJ, entrelacer, reinserer, DISTANCE,
  estFlashcardJ, etatFC, reglagesFC,
} from '../lib/apprentissageFC.js';

export const CLE_SEANCE = 'seanceFC';
export const CLE_MESURES = 'seanceFC.mesures';
const QUAL = { fail: QUALITY.rate, hard: QUALITY.difficile, easy: QUALITY.facile };

/** flashcards des fiches planifiées (la pause d'un cours s'applique comme dans les J) */
export function flashcardsPlanifiees(db) {
  const ix = index(db);
  return (db.questions || []).filter((q) => estFlashcardJ(q) && isFicheScheduled(db, ix.fById[q.ficheId], ix));
}

/** séance du jour encore en cours (reprise) — null sinon */
export function seanceEnCours(etat, cartesParId, today = todayISO()) {
  if (!etat || etat.date !== today || etat.phase === 'fin') return null;
  const revRestantes = (etat.revisions || []).slice(etat.revIdx || 0).filter((id) => cartesParId[id]).length;
  const appRestantes = (etat.file || []).filter((id) => cartesParId[id] && etatFC(cartesParId[id], today) === 'learning').length;
  const restantes = revRestantes + appRestantes;
  return restantes > 0 ? { restantes, revRestantes, appRestantes } : null;
}

function nouvelEtat(db, reglages, today) {
  const cartes = flashcardsPlanifiees(db);
  const plan = planDuJour(cartes, reglages, today, nextDate);
  const coursDe = (id) => (cartes.find((q) => q.id === id) || {}).ficheId;
  const revisions = entrelacer(plan.revisions.map((q) => q.id), coursDe);
  const apprendre = [...entrelacer(plan.enCours.map((q) => q.id), coursDe), ...entrelacer(plan.nouvelles.map((q) => q.id), coursDe)];
  return {
    etat: {
      date: today, phase: revisions.length ? 'revisions' : apprendre.length ? 'apprendre' : 'fin',
      revisions, revIdx: 0, file: apprendre, nApprendre: apprendre.length, nNouvelles: plan.nouvelles.length,
      faites: { revisions: 0, apprises: 0, rates: 0 }, ms: { revisions: 0, apprendre: 0 }, testsFaits: 0, debut: new Date().toISOString(),
    },
    aIntroduire: plan.nouvelles,
  };
}

/** cartes encore à faire dans chaque bloc */
const resteRevisions = (e) => (e.revisions || []).length - (e.revIdx || 0);
const resteApprendre = (e) => (e.file || []).length;
/** phase d'entrée selon le bloc choisi (si ce bloc est vide, l'autre ; rien → fin) */
function phaseDepart(e, bloc) {
  const r = resteRevisions(e) > 0, a = resteApprendre(e) > 0;
  if (bloc === 'apprendre') return a ? 'apprendre' : r ? 'revisions' : 'fin';
  if (bloc === 'revisions') return r ? 'revisions' : a ? 'apprendre' : 'fin';
  return r ? 'revisions' : a ? 'apprendre' : 'fin';
}

export function SeanceFC({ ctx, onQuit = null, pleinEcran = false, bloc: blocProp = null }) {
  const quitter = onQuit || ctx.endSeanceFC;
  const bloc = blocProp || ctx.blocSeanceFC || 'tout';
  const today = useMemo(() => todayISO(), []);
  const reglages = reglagesFC(ctx.reglagesFC);
  const [etat, setEtat] = useState(null); // null = chargement
  const [cartes, setCartes] = useState(() => Object.fromEntries((ctx.db.questions || []).map((q) => [q.id, q])));
  const [retournee, setRetournee] = useState(false);
  const etatRef = useRef(null); etatRef.current = etat;
  const cartesRef = useRef(cartes); cartesRef.current = cartes;

  /* ---- chrono ACTIF (pause quand l'onglet est caché), par bloc ---- */
  const depuis = useRef(null);
  const tick = () => {
    const e = etatRef.current;
    if (!e || depuis.current == null || (e.phase !== 'revisions' && e.phase !== 'apprendre')) { depuis.current = document.hidden ? null : Date.now(); return e; }
    const now = Date.now(); const delta = now - depuis.current; depuis.current = document.hidden ? null : now;
    const bloc = e.phase === 'revisions' ? 'revisions' : 'apprendre';
    return { ...e, ms: { ...e.ms, [bloc]: e.ms[bloc] + delta } };
  };
  const ecrire = useCallback(async (e) => { setEtat(e); await setMeta(CLE_SEANCE, e); }, []);
  // arrêt : onglet caché / fermeture → état sauvegardé tout de suite
  useEffect(() => {
    const sauver = () => { const e = tick(); if (e) { etatRef.current = e; setMeta(CLE_SEANCE, e); } };
    const onVis = () => { if (document.hidden) sauver(); else depuis.current = Date.now(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', sauver);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', sauver); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- chargement : reprise du jour, ou nouvelle séance ---- */
  useEffect(() => {
    let vivant = true;
    (async () => {
      const sauve = await getMeta(CLE_SEANCE);
      if (seanceEnCours(sauve, cartesRef.current, today)) {
        // reprise : les cartes disparues ou déjà sorties ailleurs (autre appareil) sont retirées
        const c = cartesRef.current;
        const e = { ...sauve, file: (sauve.file || []).filter((id) => c[id] && etatFC(c[id], today) === 'learning') };
        if ((e.revisions || []).slice(e.revIdx).filter((id) => c[id]).length === 0 && e.phase === 'revisions') e.phase = e.file.length ? 'apprendre' : 'fin';
        e.bloc = bloc;
        // reprise : on entre par le bloc demandé (« Reprendre » = là où l'on s'était arrêté)
        if (bloc !== 'tout' || e.phase === 'pause-bloc' || e.phase === 'transition') e.phase = bloc === 'tout' ? phaseDepart(e, e.phase === 'transition' ? 'apprendre' : 'tout') : phaseDepart(e, bloc);
        if (vivant) { depuis.current = Date.now(); await ecrire(e); }
        return;
      }
      const { etat: e0, aIntroduire } = nouvelEtat(ctx.db, ctx.reglagesFC, today);
      const e = { ...e0, bloc, phase: phaseDepart(e0, bloc) };
      if (aIntroduire.length) {
        const maj = await putMany('questions', aIntroduire.map((q) => introduire(q, reglages, today)));
        if (vivant) setCartes((c) => ({ ...c, ...Object.fromEntries(maj.map((q) => [q.id, q])) }));
      }
      if (vivant) { depuis.current = Date.now(); await ecrire(e); }
    })();
    return () => { vivant = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- fin de séance : mesure enregistrée une fois (recalibre l'estimation du temps) ---- */
  useEffect(() => {
    if (!etat || etat.phase !== 'fin' || etat.mesuree) return;
    (async () => {
      const m = (await getMeta(CLE_MESURES)) || [];
      m.push({ date: today, nRevisions: etat.faites.revisions, msRevisions: etat.ms.revisions, nApprendre: etat.nApprendre, msApprendre: etat.ms.apprendre });
      await setMeta(CLE_MESURES, m.slice(-20));
      await ecrire({ ...etat, mesuree: true });
    })();
  }, [etat && etat.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const coursDe = (id) => (cartesRef.current[id] || {}).ficheId;
  const enregistrerCarte = async (q) => { const s = await put('questions', q); setCartes((c) => ({ ...c, [s.id]: s })); return s; };
  const terminer = async () => { const e = tick() || etatRef.current; if (e) await setMeta(CLE_SEANCE, e); await ctx.reload(); quitter(); };

  if (!etat) return <div className={'sfc' + (pleinEcran ? ' plein-ecran' : '')}><div className="sfc-centre"><span className="hint">Préparation de la séance…</span></div></div>;

  const revId = etat.phase === 'revisions' ? etat.revisions[etat.revIdx] : null;
  const appId = etat.phase === 'apprendre' ? etat.file[0] : null;
  const carte = cartes[revId || appId] || null;

  /* ---- bloc Révisions : une vue, notation de la méthode des J ---- */
  const noter = async (rating) => {
    const q = cartes[revId];
    let e = tick();
    const quality = QUAL[rating];
    let maj = advanceQuestion(q, quality);
    maj = apresNotationJ(maj, quality, ctx.reglagesFC, today);
    await enregistrerCarte(maj);
    e = { ...e, revIdx: e.revIdx + 1, faites: { ...e.faites, revisions: e.faites.revisions + 1, rates: e.faites.rates + (rating === 'fail' ? 1 : 0) } };
    if (e.revIdx >= e.revisions.length) e = { ...e, phase: !e.file.length ? 'fin' : e.bloc === 'revisions' ? 'pause-bloc' : 'transition' };
    setRetournee(false);
    await ecrire(e);
  };

  /* ---- bloc Apprendre ---- */
  const avancerFile = async (maj, plage) => {
    let e = tick();
    const reste = e.file.slice(1);
    const file = plage ? reinserer(reste, maj.id, plage, coursDe) : reste;
    e = { ...e, file, phase: file.length ? 'apprendre' : resteRevisions(e) > 0 ? 'pause-bloc' : 'fin' };
    setRetournee(false);
    return e;
  };
  const compris = async () => {
    const maj = await enregistrerCarte(presenter(cartes[appId]));
    await ecrire(await avancerFile(maj, DISTANCE.presentation));
  };
  const reponse = async (su) => {
    const { carte: maj, sortie } = repondre(cartes[appId], su, ctx.reglagesFC, today);
    const s = await enregistrerCarte(maj);
    let e = await avancerFile(s, sortie ? null : (su ? DISTANCE.su : DISTANCE.pasSu));
    e = { ...e, testsFaits: (e.testsFaits || 0) + 1, faites: { ...e.faites, apprises: e.faites.apprises + (sortie ? 1 : 0) } };
    await ecrire(e);
  };

  /* basculer d'un bloc à l'autre en cours de séance : l'état du bloc quitté est gardé tel quel */
  const basculer = async (vers) => {
    const e = tick() || etatRef.current;
    setRetournee(false);
    depuis.current = Date.now();
    await ecrire({ ...e, phase: vers });
  };

  const nRev = etat.revisions.length;
  const enApprendre = etat.phase === 'apprendre';
  const autreBloc = etat.phase === 'revisions' && resteApprendre(etat) > 0 ? { vers: 'apprendre', label: `Passer à l’apprentissage (${resteApprendre(etat)})` }
    : enApprendre && resteRevisions(etat) > 0 ? { vers: 'revisions', label: `Revenir aux révisions (${resteRevisions(etat)})` } : null;
  const presentation = enApprendre && carte && !carte.learningPresented;
  const progression = etat.phase === 'revisions' ? `Révisions · ${etat.revIdx + 1} / ${nRev}`
    : enApprendre ? `Apprendre · ${etat.file.length} restante${etat.file.length > 1 ? 's' : ''}` : '';
  const pct = etat.phase === 'revisions' ? (etat.revIdx / Math.max(1, nRev)) * 100
    : enApprendre ? ((etat.nApprendre - etat.file.length) / Math.max(1, etat.nApprendre)) * 100 : 100;

  return (
    <div className={'sfc' + (pleinEcran ? ' plein-ecran' : '')}>
      <div className="sfc-tete">
        <button type="button" className="sfc-quitter" onClick={terminer} aria-label="Quitter la séance" title="Quitter (la séance reprend où tu t'es arrêté)"><Icon name="x" size={18} /></button>
        <div className="sfc-barre"><span style={{ width: Math.max(0, Math.min(100, pct)) + '%' }} /></div>
        <span className="sfc-prog tnum">{progression}</span>
        {autreBloc && <button type="button" className="sfc-basculer" onClick={() => basculer(autreBloc.vers)}
          title="L’état du bloc en cours est gardé : tu le reprends où tu l’as laissé">{autreBloc.label}</button>}
      </div>

      {etat.phase === 'pause-bloc' && (
        <div className="sfc-centre sfc-transition">
          <div className="sfc-titre">{resteRevisions(etat) > 0 ? 'Apprentissage terminé' : 'Révisions terminées'} <span className="sfc-ok">✓</span></div>
          <div className="hint">
            {resteRevisions(etat) > 0
              ? `Il reste ${resteRevisions(etat)} révision${resteRevisions(etat) > 1 ? 's' : ''} aujourd’hui.`
              : `Il reste ${resteApprendre(etat)} carte${resteApprendre(etat) > 1 ? 's' : ''} à apprendre aujourd’hui.`}
          </div>
          <button type="button" className="sfc-btn principal" onClick={() => basculer(resteRevisions(etat) > 0 ? 'revisions' : 'apprendre')}>
            {resteRevisions(etat) > 0 ? 'Faire les révisions' : 'Commencer l’apprentissage'}
          </button>
          <button type="button" className="sfc-btn neutre" onClick={terminer}>Plus tard</button>
        </div>
      )}

      {etat.phase === 'fin' && (
        <div className="sfc-centre sfc-synthese">
          <div className="sfc-titre">Séance terminée</div>
          <div className="sfc-chiffres">
            <div><span className="tnum">{etat.faites.apprises}</span> carte{etat.faites.apprises > 1 ? 's' : ''} apprise{etat.faites.apprises > 1 ? 's' : ''} aujourd'hui</div>
            <div><span className="tnum">{etat.faites.revisions}</span> révision{etat.faites.revisions > 1 ? 's' : ''} faite{etat.faites.revisions > 1 ? 's' : ''}</div>
            <div><span className="tnum">{Math.max(1, Math.round((etat.ms.revisions + etat.ms.apprendre) / 60000))}</span> min de travail réel</div>
          </div>
          <button type="button" className="sfc-btn principal" onClick={terminer}>Terminer</button>
        </div>
      )}

      {etat.phase === 'transition' && (
        <Transition nRev={etat.faites.revisions} nApp={etat.file.length} nNouvelles={etat.nNouvelles}
          onSuite={async () => { depuis.current = Date.now(); await ecrire({ ...etatRef.current, phase: 'apprendre' }); }} />
      )}

      {(etat.phase === 'revisions' || enApprendre) && carte && (
        <div className="sfc-corps">
          <div className="sfc-etiquette">
            {etat.phase === 'revisions' ? 'Révision' : presentation ? 'Nouvelle carte' : carte.learningSource === 'rate' ? 'À réapprendre' : 'Apprendre'}
            {enApprendre && !presentation && <span className="sfc-points" aria-label={`${carte.learningStreak || 0} sur ${carte.learningCriterion || reglages.critere}`}>
              {Array.from({ length: carte.learningCriterion || reglages.critere }).map((_, i) => <i key={i} className={i < (carte.learningStreak || 0) ? 'on' : ''} />)}
            </span>}
          </div>
          <button type="button" className="sfc-carte" key={carte.id + ':' + (presentation ? 'p' : retournee ? 'v' : 'r')}
            data-carte={carte.id} data-serie={carte.learningStreak || 0}
            onClick={() => { if (!presentation) setRetournee((r) => !r); }}>
            <FaceFC carte={carte} cote={presentation ? 'deux' : retournee ? 'verso' : 'recto'} masquable={ligneParLigne(ctx)} />
            {!presentation && !retournee && <span className="sfc-indication">Touche pour voir la réponse</span>}
          </button>
          <div className="sfc-bas">
            {presentation && <button type="button" className="sfc-btn principal" onClick={compris}>Compris, suivante</button>}
            {!presentation && !retournee && <button type="button" className="sfc-btn neutre" onClick={() => setRetournee(true)}>Voir la réponse</button>}
            {!presentation && retournee && etat.phase === 'revisions' && (
              <div className="sfc-notes trois">
                <button type="button" className="sfc-btn rate" onClick={() => noter('fail')}>Raté</button>
                <button type="button" className="sfc-btn difficile" onClick={() => noter('hard')}>Difficile</button>
                <button type="button" className="sfc-btn facile" onClick={() => noter('easy')}>Facile</button>
              </div>
            )}
            {!presentation && retournee && enApprendre && (
              <>
                <div className="sfc-notes deux">
                  <button type="button" className="sfc-btn rate" onClick={() => reponse(false)}>Pas su</button>
                  <button type="button" className="sfc-btn facile" onClick={() => reponse(true)}>Su</button>
                </div>
                {!etat.testsFaits && <div className="sfc-aide">Une hésitation compte comme « Pas su ».</div>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Transition({ nRev, nApp, nNouvelles, onSuite }) {
  // enchaîne tout seul ; le bouton permet de ne pas attendre
  useEffect(() => { const t = setTimeout(onSuite, 2200); return () => clearTimeout(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const reprises = nApp - nNouvelles;
  return (
    <div className="sfc-centre sfc-transition">
      <div className="sfc-titre">Révisions terminées <span className="sfc-ok">✓</span></div>
      <div className="hint">{nRev} révision{nRev > 1 ? 's' : ''} faite{nRev > 1 ? 's' : ''}</div>
      <div className="sfc-sous">
        {nNouvelles > 0 && <>{nNouvelles} nouvelle{nNouvelles > 1 ? 's' : ''} à apprendre</>}
        {nNouvelles > 0 && reprises > 0 && ' · '}
        {reprises > 0 && <>{reprises} à reprendre</>}
      </div>
      <button type="button" className="sfc-btn principal" onClick={onSuite}>Commencer l'apprentissage</button>
    </div>
  );
}

/** une face (recto, verso, ou les deux pour la présentation) — texte, trous, image, masques */
function FaceFC({ carte, cote, masquable = false }) {
  const cloze = isCloze(carte);
  const occ = estOcclusion(carte) ? carte.occlusion : null;
  const recto = cloze
    ? parseCloze(carte.recto, carte.cloze).map((s, i) => (s.type === 'text' ? <Tex key={i}>{s.value}</Tex> : <span key={i} className="mrm-cloze-blank" aria-hidden="true" />))
    : <Tex>{carte.recto}</Tex>;
  const verso = cloze
    ? highlightClozeWords(carte.verso, carte.cloze).map((p, i) => (p.hl ? <mark key={i} className="mrm-cloze-mark">{p.text}</mark> : <span key={i}>{p.text}</span>))
    : <Tex>{carte.verso}</Tex>;
  const montrerRecto = cote !== 'verso';
  const montrerVerso = cote !== 'recto';
  const image = !occ && ((montrerRecto && imageAuRecto(carte)) || (montrerVerso && imageAuVerso(carte)));
  const long = ((montrerRecto ? carte.recto || '' : '') + (montrerVerso ? carte.verso || '' : '')).length > 260;
  if (estMuscle(carte)) {
    // carte Muscle : le nom au recto, le tableau au verso (révélé d'emblée à la présentation)
    return (
      <ZoneDefilante className={'sfc-zone sfc-muscle' + (montrerVerso ? ' long' : '')}>
        {montrerRecto && <div className={'sfc-recto' + (montrerVerso ? ' mu-nom-petit' : ' mu-nom')}><Tex>{carte.recto}</Tex></div>}
        {!montrerRecto && <div className="mu-titre"><Tex>{carte.recto}</Tex></div>}
        {montrerVerso && <TableauMuscle item={carte} masquable={masquable && cote === 'verso'} />}
        {montrerVerso && carte.a_retenir && <div className="sfc-retenir"><strong>À retenir :</strong> <Tex>{carte.a_retenir}</Tex></div>}
      </ZoneDefilante>
    );
  }
  return (
    <>
      {image && <ImageFlashcard imageId={carte.imageId} maxH="min(220px, 28dvh)" className="mrm" />}
      <ZoneDefilante className={'sfc-zone' + (long ? ' long' : '')}>
        {occ && <OcclusionView occ={occ} revele={montrerVerso} maxH={260} />}
        {montrerRecto && <div className="sfc-recto">{recto}</div>}
        {cote === 'deux' && <div className="sfc-sep" />}
        {montrerVerso && !(occ && carte.versoAuto) && <div className="sfc-verso">{verso}</div>}
        {montrerVerso && carte.a_retenir && <div className="sfc-retenir"><strong>À retenir :</strong> <Tex>{carte.a_retenir}</Tex></div>}
      </ZoneDefilante>
    </>
  );
}
