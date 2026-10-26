/* ============================================================
   MedRevise — SÉANCE QUOTIDIENNE DES FLASHCARDS (étape 2 FSRS, 10/10/2026,
   docs/fsrs-etape2-compte-rendu.md). Un seul bouton, aucun mode.
   La séance = toutes les flashcards planifiées dues aujourd'hui ou avant (révisions + nouvelles
   arrivées à leur date de départ), une vue chacune, cours mélangés, 4 boutons (À revoir /
   Difficile / Correct / Facile) avec l'intervalle prévu. Pas de re-présentation dans la séance.
   Le mode Apprentissage (paquet, présentation, Pas su / Su, réinsertion, bascule) est supprimé.
   L'état (liste, position, compteurs, temps) est écrit dans IndexedDB (store `meta`, local à
   l'appareil) après chaque réponse et quand l'onglet passe en arrière-plan. REPRISE : la séance
   est remise d'accord avec le plan du jour (cartes entrées entre-temps ajoutées en fin, cartes
   notées ou supprimées ailleurs retirées — lib/apprentissageFC.js reprendreSeance).
   Notation : scheduler/repondre.js (planificateur maison si FSRS OFF, FSRS si ON ; mode ombre et
   journal des révisions toujours actifs). Partagé bureau / mobile.
   (24/10, docs/compte-rendu-seance-categories.md) SÉANCE PAR CATÉGORIES : la liste est composée à l'écran de
   lancement (components/SeanceAujourdhui.jsx, lib/categoriesFC.js) — Retard → Révisions → Nouvelles, types
   cochés, maximums — et figée : la reprise retire ce qui n'est plus à faire, n'ajoute rien. Carte NOUVELLE
   (bloc Nouvelles) : recto → retourner → « Garder en nouvelle » (revient au prochain bloc, rien n'est écrit) ou
   « Passer en révision » (J0 = aujourd'hui, scheduler/noter.js passerEnRevision). Révisions et Retard : 4 boutons.
   ============================================================ */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Tex } from '../components/Tex.jsx';
import { ZoneDefilante } from '../components/ZoneDefilante.jsx';
import { OcclusionView, estOcclusion } from '../components/OcclusionImage.jsx';
import { TableauMuscle, ligneParLigne, ImageGeneraleMuscle } from '../components/FlashcardMuscle.jsx';
import { BoutonsFlashcard } from '../components/BoutonsFlashcard.jsx';
import { ActionsCarte } from '../components/ActionsCarte.jsx';
import { estMuscle } from '../lib/muscle.js';
import { estTableau } from '../lib/carteTableau.js';
import { TableauRevision } from '../components/FlashcardTableau.jsx';
import { ElementsVerso, elementsDe } from '../components/ElementsVerso.jsx';
import { estMolecule } from '../molecule/carte.js';
import { FaceMoleculeParesseuse } from '../molecule/Paresseux.jsx';
import { ImageFlashcard, imageAuRecto, imageAuVerso } from '../components/FlashcardImage.jsx';
import { isCloze, parseCloze, highlightClozeWords } from '../lib/cloze.js';
import { put, getMeta, setMeta } from '../lib/storage.js';
import { garderTagEnBase } from '../lib/aApprendre.js';
import { todayISO } from '../lib/sm2.js';
import { index, isFicheScheduled, nextDate } from '../lib/planning.js';
import { planDuJour, entrelacer, estFlashcardJ, VERSION_MESURES, reprendreSeance } from '../lib/apprentissageFC.js';
import { repondreFlashcard, passerFlashcardEnRevision } from '../scheduler/repondre.js';
import { categoriser, composerSeance, reprendreSeanceChoix, choixValide, estNouvelle } from '../lib/categoriesFC.js';
import { rangDesCours } from '../apprentissageLibre/tableauBord.js';

export const CLE_SEANCE = 'seanceFC';
export const CLE_MESURES = 'seanceFC.mesures';
export const CLE_CHOIX = 'seanceFC.choix'; // (24/10) dernier choix de l'écran de lancement (local à l'appareil)
// v1 (avant le 10/10) : blocs Révisions / Apprendre — non reprise. v2 (10/10) : toutes les dues, reprise avec ajouts.
// v3 (24/10) : liste composée par catégories (`categorie`, `choix`), reprise sans ajout.
const VERSION_SEANCE = 3;
const VERSIONS_REPRISES = [2, 3];

/** flashcards des fiches planifiées (la pause d'un cours s'applique comme dans les J) */
export function flashcardsPlanifiees(db) {
  const ix = index(db);
  return (db.questions || []).filter((q) => estFlashcardJ(q) && isFicheScheduled(db, ix.fById[q.ficheId], ix));
}

/** plan du jour calculé sur un jeu de cartes donné (`db` fournit sources / matières / fiches) */
export function planSurCartes(db, cartesParId, today = todayISO()) {
  const ix = index(db);
  const cartes = Object.values(cartesParId).filter((q) => estFlashcardJ(q) && isFicheScheduled(db, ix.fById[q.ficheId], ix));
  return { plan: planDuJour(cartes, today, nextDate), coursDe: (id) => (cartesParId[id] || {}).ficheId };
}

/** séance du jour encore en cours (reprise) — null sinon ; restantes = celles de la séance remise d'accord */
export function seanceEnCours(etat, cartesParId, today = todayISO(), db = null) {
  if (!etat || !VERSIONS_REPRISES.includes(etat.v) || etat.date !== today || etat.phase === 'fin' || !db) return null;
  const e = remiseDAccord(db, etat, cartesParId, today, () => 0);
  const restantes = e.cartes.length - e.idx;
  return restantes > 0 ? { restantes, faites: e.idx } : null;
}

/** (24/10) séance remise d'accord avec l'état des cartes : v3 → reprise sans ajout ; v2 → comme avant (ajouts) */
function remiseDAccord(db, etat, cartesParId, today, rand = Math.random) {
  if (etat.v === 3) {
    const ix = index(db);
    const cartes = Object.values(cartesParId).filter((q) => estFlashcardJ(q) && isFicheScheduled(db, ix.fById[q.ficheId], ix));
    return reprendreSeanceChoix(etat, categoriser(cartes, today, nextDate)).etat;
  }
  const { plan, coursDe } = planSurCartes(db, cartesParId, today);
  return reprendreSeance(etat, plan, coursDe, rand).etat;
}

/** (24/10) nouvelle séance composée d'après le choix de l'écran de lancement (Retard → Révisions → Nouvelles).
 *  (26/10) `choix.parCours` : regroupée par cours, dans l'ordre de la Bibliothèque (`stats` : ordre des sections). L'ordre
 *  est écrit dans l'état de la séance : une reprise le garde tel quel. */
export function nouvelleSeance(db, today, choix, stats = null) {
  const cartes = flashcardsPlanifiees(db);
  const parId = Object.fromEntries(cartes.map((q) => [q.id, q]));
  const c = choixValide(choix);
  const rangs = c.parCours ? rangDesCours(db, stats) : null;
  const { ids, categorie } = composerSeance(categoriser(cartes, today, nextDate), c, (id) => (parId[id] || {}).ficheId, Math.random, rangs && ((f) => rangs.get(f)));
  return {
    v: VERSION_SEANCE, date: today, phase: ids.length ? 'cartes' : 'fin', cartes: ids, categorie, choix: c, idx: 0, nTotal: ids.length, parCours: c.parCours,
    faites: { revisions: 0, rates: 0, notees: 0, passees: 0, gardees: 0 }, ms: { revisions: 0 }, debut: new Date().toISOString(),
  };
}

export function SeanceFC({ ctx, onQuit = null, pleinEcran = false }) {
  const quitter = onQuit || ctx.endSeanceFC;
  const today = useMemo(() => todayISO(), []);
  const [etat, setEtat] = useState(null); // null = chargement
  const [cartes, setCartes] = useState(() => Object.fromEntries((ctx.db.questions || []).map((q) => [q.id, q])));
  const [retournee, setRetournee] = useState(false);
  const [enCours, setEnCours] = useState(false); // une réponse est en train d'être enregistrée
  const [intercalairePasse, setIntercalairePasse] = useState(-1); // (26/10) index dont l'intercalaire « Cours suivant » a été passé
  const etatRef = useRef(null); etatRef.current = etat;
  const cartesRef = useRef(cartes); cartesRef.current = cartes;

  /* ---- chrono ACTIF (pause quand l'onglet est caché) ---- */
  const depuis = useRef(null);
  const tick = () => {
    const e = etatRef.current;
    if (!e || depuis.current == null || e.phase !== 'cartes') { depuis.current = document.hidden ? null : Date.now(); return e; }
    const now = Date.now(); const delta = now - depuis.current; depuis.current = document.hidden ? null : now;
    return { ...e, ms: { ...e.ms, revisions: (e.ms.revisions || 0) + delta } };
  };
  const ecrire = useCallback(async (e) => { setEtat(e); await setMeta(CLE_SEANCE, e); }, []);
  useEffect(() => {
    const sauver = () => { const e = tick(); if (e) { etatRef.current = e; setMeta(CLE_SEANCE, e); } };
    const onVis = () => { if (document.hidden) sauver(); else depuis.current = Date.now(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', sauver);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', sauver); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- reprise : séance remise d'accord avec le plan du jour ---- */
  const remettreDAccord = (base = null, cartesParId = cartesRef.current) => remiseDAccord(ctx.db, base || tick() || etatRef.current, cartesParId, today);
  // fin de synchro / retour d'arrière-plan (nouveau ctx.db) : cartes rafraîchies (la plus récente gagne)
  const premierDb = useRef(true);
  const monte = useRef(true);
  useEffect(() => { monte.current = true; return () => { monte.current = false; }; }, []);
  useEffect(() => {
    if (premierDb.current) { premierDb.current = false; return; }
    const avant = etatRef.current;
    if (!avant || avant.phase === 'fin') return;
    const prec = cartesRef.current;
    const frais = {};
    (ctx.db.questions || []).forEach((q) => { const p = prec[q.id]; frais[q.id] = p && (p.updatedAt || '') > (q.updatedAt || '') ? p : q; });
    cartesRef.current = frais; setCartes(frais);
    const e = remettreDAccord();
    if (!monte.current) return;
    if (e.cartes[e.idx] !== avant.cartes[avant.idx]) setRetournee(false);
    ecrire(e);
  }, [ctx.db]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- chargement : reprise du jour, ou nouvelle séance ---- */
  useEffect(() => {
    let vivant = true;
    (async () => {
      const sauve = await getMeta(CLE_SEANCE);
      // (24/10) l'écran de lancement écrit la séance composée avant d'ouvrir celle-ci ; sinon : le dernier choix
      const e = seanceEnCours(sauve, cartesRef.current, today, ctx.db) ? remettreDAccord(sauve) : nouvelleSeance(ctx.db, today, await getMeta(CLE_CHOIX), ctx.stats);
      if (vivant) { depuis.current = Date.now(); await ecrire(e); }
    })();
    return () => { vivant = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- fin de séance : mesure enregistrée une fois (recalibre l'estimation du temps) ---- */
  useEffect(() => {
    if (!etat || etat.phase !== 'fin' || etat.mesuree || !etat.faites.revisions) return;
    (async () => {
      const m = (await getMeta(CLE_MESURES)) || [];
      m.push({ v: VERSION_MESURES, date: today, nRevisions: etat.faites.revisions, msRevisions: etat.ms.revisions });
      await setMeta(CLE_MESURES, m.slice(-20));
      await ecrire({ ...etat, mesuree: true });
    })();
  }, [etat && etat.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const terminer = async () => { const e = tick() || etatRef.current; if (e) await setMeta(CLE_SEANCE, e); await ctx.reload(); quitter(); };

  if (!etat) return <div className={'sfc' + (pleinEcran ? ' plein-ecran' : '')}><div className="sfc-centre"><span className="hint">Préparation de la séance…</span></div></div>;

  const id = etat.phase === 'cartes' ? etat.cartes[etat.idx] : null;
  const carte = id ? cartes[id] || null : null;
  const total = etat.cartes.length;

  const noter = async (note) => {
    if (!carte || enCours) return;
    setEnCours(true);
    try {
      let e = tick();
      const s = await repondreFlashcard(carte, note, {
        reglages: ctx.reglagesFC,
        sauver: async (c) => { const r = await put('questions', await garderTagEnBase(c)); setCartes((x) => ({ ...x, [r.id]: r })); return r; },
      });
      e = { ...e, idx: e.idx + 1, faites: { ...e.faites, revisions: e.faites.revisions + 1, notees: (e.faites.notees || 0) + 1, rates: e.faites.rates + (note === 1 ? 1 : 0) } };
      // la séance se remet d'accord à chaque réponse (v2 : cartes devenues dues entre-temps ajoutées)
      e = remettreDAccord(e, { ...cartesRef.current, [s.id]: s });
      setRetournee(false);
      await ecrire(e);
    } finally { setEnCours(false); }
  };
  /* (24/10) CARTE NOUVELLE — « Garder en nouvelle » : rien n'est écrit, elle revient au prochain bloc Nouvelles ;
     « Passer en révision » : J0 = aujourd'hui, entrée dans le cycle des J, événement journalisé, FSRS ombre initialisé */
  const nouvelleSuivante = async (passer) => {
    if (!carte || enCours) return;
    setEnCours(true);
    try {
      let e = tick();
      let s = carte;
      if (passer) {
        s = await passerFlashcardEnRevision(carte, {
          reglages: ctx.reglagesFC,
          sauver: async (c) => { const r = await put('questions', await garderTagEnBase(c)); setCartes((x) => ({ ...x, [r.id]: r })); return r; },
        });
      }
      e = { ...e, idx: e.idx + 1, faites: { ...e.faites, revisions: e.faites.revisions + 1, [passer ? 'passees' : 'gardees']: ((e.faites[passer ? 'passees' : 'gardees']) || 0) + 1 } };
      e = remettreDAccord(e, { ...cartesRef.current, [s.id]: s });
      setRetournee(false);
      await ecrire(e);
    } finally { setEnCours(false); }
  };

  const pct = total ? (etat.idx / total) * 100 : 100;
  // (24/10) carte du bloc Nouvelles (séance v3) encore nouvelle : Garder / Passer au lieu des 4 boutons
  const categorie = (id && etat.categorie && etat.categorie[id]) || null;
  const nouvelle = !!carte && categorie === 'nouvelles' && estNouvelle(carte);
  /* (26/10) REGROUPÉE PAR COURS : le cours de la carte en haut de la carte ; au changement de cours, un court
     intercalaire « Cours suivant : <nom> · N cartes », passé d'un tap */
  const coursDe = (k) => { const q = cartes[etat.cartes[k]]; return q ? q.ficheId : null; };
  const titreCours = (f) => ((ctx.db.fiches || []).find((x) => x.id === f) || {}).titre || 'Cours';
  const coursActuel = etat.parCours && carte ? carte.ficheId : null;
  let nCours = 0;
  if (coursActuel) for (let k = etat.idx; k < etat.cartes.length && coursDe(k) === coursActuel; k++) nCours++;
  const intercalaire = !!coursActuel && etat.idx > 0 && coursDe(etat.idx - 1) !== coursActuel && intercalairePasse !== etat.idx;

  return (
    <div className={'sfc' + (pleinEcran ? ' plein-ecran' : '')}>
      <div className="sfc-tete">
        <button type="button" className="sfc-quitter" onClick={terminer} aria-label="Quitter la séance" title="Quitter (la séance reprend où tu t'es arrêté)"><Icon name="x" size={18} /></button>
        <div className="sfc-barre"><span style={{ width: Math.max(0, Math.min(100, pct)) + '%' }} /></div>
        <span className="sfc-prog tnum">{etat.phase === 'cartes' ? `${Math.min(etat.idx + 1, total)} / ${total}` : ''}</span>
      </div>

      {etat.phase === 'fin' && (
        <div className="sfc-centre sfc-synthese">
          <div className="sfc-titre">{etat.faites.revisions ? 'Séance terminée' : 'Rien à faire aujourd’hui'}</div>
          {etat.faites.revisions > 0 && (
            <div className="sfc-chiffres">
              <div><span className="tnum">{etat.faites.revisions}</span> carte{etat.faites.revisions > 1 ? 's' : ''} vue{etat.faites.revisions > 1 ? 's' : ''}</div>
              {etat.faites.passees > 0 && <div><span className="tnum">{etat.faites.passees}</span> passée{etat.faites.passees > 1 ? 's' : ''} en révision</div>}
              {etat.faites.gardees > 0 && <div><span className="tnum">{etat.faites.gardees}</span> gardée{etat.faites.gardees > 1 ? 's' : ''} en nouvelle{etat.faites.gardees > 1 ? 's' : ''}</div>}
              {etat.faites.rates > 0 && <div><span className="tnum">{etat.faites.rates}</span> à revoir</div>}
              <div><span className="tnum">{Math.max(1, Math.round((etat.ms.revisions || 0) / 60000))}</span> min de travail réel</div>
            </div>
          )}
          <button type="button" className="sfc-btn principal" onClick={terminer}>Terminer</button>
        </div>
      )}

      {etat.phase === 'cartes' && carte && intercalaire && (
        <button type="button" className="sfc-centre sfc-intercalaire" data-intercalaire={coursActuel} onClick={() => setIntercalairePasse(etat.idx)}
          title="Toucher pour continuer">
          <span className="sfc-intercalaire-sur">Cours suivant</span>
          <span className="sfc-titre">{titreCours(coursActuel)}</span>
          <span className="sfc-intercalaire-n tnum">{nCours} carte{nCours > 1 ? 's' : ''}</span>
          <span className="sfc-indication">Touche pour continuer</span>
        </button>
      )}

      {etat.phase === 'cartes' && carte && !intercalaire && (
        <div className="sfc-corps">
          <div className="sfc-etiquette" data-categorie={categorie}>{nouvelle ? 'Nouvelle carte' : categorie === 'retard' ? 'En retard' : (carte.historique || []).some((h) => h && h.qualite != null) ? 'Révision' : 'Nouvelle carte'}
            {coursActuel && <span className="sfc-cours" data-cours={coursActuel} title={titreCours(coursActuel)}>{titreCours(coursActuel)}</span>}</div>
          {/* (17/10) cadre : la carte (un bouton) + les icônes carnet / apprentissage de CETTE carte, en surimpression dans son en-tête */}
          <div className="sfc-carte-cadre">
          <button type="button" className="sfc-carte avec-actions" key={carte.id + ':' + (retournee ? 'v' : 'r')} data-carte={carte.id}
            onClick={() => setRetournee((r) => !r)}>
            <FaceFC carte={carte} cote={retournee ? 'verso' : 'recto'} masquable={ligneParLigne(ctx)} />
            {!retournee && <span className="sfc-indication">Touche pour voir la réponse</span>}
          </button>
          {/* (26/10) « À apprendre » toujours là (recto compris) ; le carnet, lui, après le retournement */}
          <ActionsCarte ctx={ctx} carte={carte} carnet={retournee} />
          </div>
          <div className="sfc-bas">
            {!retournee && <button type="button" className="sfc-btn neutre" onClick={() => setRetournee(true)}>Voir la réponse</button>}
            {retournee && !nouvelle && <BoutonsFlashcard carte={carte} reglages={ctx.reglagesFC} onNoter={noter} disabled={enCours} variante="seance" />}
            {retournee && nouvelle && (
              <div className="sfc-notes deux" role="group" aria-label="Carte nouvelle">
                <button type="button" className="sfc-btn neutre" data-nouvelle="garder" disabled={enCours} onClick={() => nouvelleSuivante(false)}>
                  Garder en nouvelle<span className="sfc-btn-sous">revient au prochain bloc</span></button>
                <button type="button" className="sfc-btn principal" data-nouvelle="passer" disabled={enCours} onClick={() => nouvelleSuivante(true)}>
                  Passer en révision<span className="sfc-btn-sous">J0 aujourd’hui · revient demain</span></button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** une face (recto, verso, ou les deux pour la présentation) — texte, trous, image, masques.
 *  (26/10) exportée : la vue « Agrandir » du panneau Flashcards affiche la carte avec CE composant. */
export function FaceFC({ carte, cote, masquable = false }) {
  const cloze = isCloze(carte);
  const occ = estOcclusion(carte) ? carte.occlusion : null;
  const recto = cloze
    ? parseCloze(carte.recto, carte.cloze).map((s, i) => (s.type === 'text' ? <Tex key={i}>{s.value}</Tex> : <span key={i} className="mrm-cloze-blank" aria-hidden="true" />))
    : <Tex>{carte.recto}</Tex>;
  const verso = cloze
    ? highlightClozeWords(carte.verso, carte.cloze).map((p, i) => (p.hl ? <mark key={i} className="mrm-cloze-mark">{p.text}</mark> : <span key={i}>{p.text}</span>))
    : <Tex leger={carte.versoFormat === 'leger'}>{carte.verso}</Tex>;
  const montrerRecto = cote !== 'verso';
  const montrerVerso = cote !== 'recto';
  const image = !occ && ((montrerRecto && imageAuRecto(carte)) || (montrerVerso && imageAuVerso(carte)));
  const elements = montrerVerso && elementsDe(carte).length > 0; // (26/10) éléments à révéler : contenu en liste, aligné à gauche
  const long = elements || ((montrerRecto ? carte.recto || '' : '') + (montrerVerso ? carte.verso || '' : '')).length > 260;
  if (estMolecule(carte)) {
    return (
      <>
      {image && <ImageFlashcard imageId={carte.imageId} maxH="min(220px, 28dvh)" className="mrm" />}
      <ZoneDefilante className="sfc-zone sfc-molecule">
        <FaceMoleculeParesseuse carte={carte} cote={cote} />
        {cote !== 'recto' && carte.a_retenir && <div className="sfc-retenir"><strong>À retenir :</strong> <Tex>{carte.a_retenir}</Tex></div>}
      </ZoneDefilante>
      </>
    );
  }
  if (estTableau(carte)) {
    // (17/10) carte Tableau : le titre au recto ; au verso les noms de colonnes, cellules révélées une par une
    return (
      <ZoneDefilante className={'sfc-zone sfc-muscle' + (montrerVerso ? ' long' : '')}>
        {montrerRecto && <div className={'sfc-recto' + (montrerVerso ? ' mu-nom-petit' : ' mu-nom')}><Tex>{carte.recto}</Tex></div>}
        {!montrerRecto && <div className="mu-titre"><Tex>{carte.recto}</Tex></div>}
        {montrerVerso && <TableauRevision item={carte} masquable={cote === 'verso'} />}
        {montrerVerso && carte.a_retenir && <div className="sfc-retenir"><strong>À retenir :</strong> <Tex>{carte.a_retenir}</Tex></div>}
      </ZoneDefilante>
    );
  }
  if (estMuscle(carte)) {
    // carte Muscle : le nom au recto, le tableau au verso (révélé d'emblée à la présentation)
    return (
      <ZoneDefilante className={'sfc-zone sfc-muscle' + (montrerVerso ? ' long' : '')}>
        {montrerRecto && <div className={'sfc-recto' + (montrerVerso ? ' mu-nom-petit' : ' mu-nom')}><Tex>{carte.recto}</Tex></div>}
        {!montrerRecto && <div className="mu-titre"><Tex>{carte.recto}</Tex></div>}
        <ImageGeneraleMuscle item={carte} face={montrerVerso ? 'verso' : 'recto'} />
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
        {montrerVerso && !(occ && carte.versoAuto) && !(elements && !String(carte.verso || '').trim()) && <div className="sfc-verso">{verso}</div>}
        {elements && <ElementsVerso carte={carte} masquable={cote === 'verso'} />}
        {montrerVerso && carte.a_retenir && <div className="sfc-retenir"><strong>À retenir :</strong> <Tex>{carte.a_retenir}</Tex></div>}
      </ZoneDefilante>
    </>
  );
}
