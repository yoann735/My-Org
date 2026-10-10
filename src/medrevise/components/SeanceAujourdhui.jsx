/* ============================================================
   MedRevise — en-tête « Aujourd'hui » de la séance de flashcards (06/10/2026,
   docs/compte-rendu-apprentissage-flashcards.md) : « 23 à réviser · 41 à apprendre
   · ≈ 35 min » (v1.1 : plus de quota de nouvelles) et UN bouton. Reprise le même jour ; « Rien à faire aujourd'hui »
   avec la date de la prochaine séance sinon. Accueil mobile + panneau du lecteur
   (Exercices → Flashcards).
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { getMeta } from '../lib/storage.js';
import { todayISO } from '../lib/sm2.js';
import { nextDate } from '../lib/planning.js';
import { planDuJour, prochaineSeance, estimationMs } from '../lib/apprentissageFC.js';
import { flashcardsPlanifiees, seanceEnCours, CLE_SEANCE, CLE_MESURES } from '../session/SeanceFC.jsx';

const fmtJour = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

export function SeanceAujourdhui({ ctx, onDemarrer, compact = false }) {
  const today = todayISO();
  const [sauve, setSauve] = useState(undefined);
  const [mesures, setMesures] = useState([]);
  useEffect(() => {
    let vivant = true;
    Promise.all([getMeta(CLE_SEANCE), getMeta(CLE_MESURES)]).then(([s, m]) => { if (vivant) { setSauve(s || null); setMesures(m || []); } });
    return () => { vivant = false; };
  }, [ctx.db]);

  const cartes = useMemo(() => flashcardsPlanifiees(ctx.db), [ctx.db]);
  const parId = useMemo(() => Object.fromEntries((ctx.db.questions || []).map((q) => [q.id, q])), [ctx.db]);
  const plan = useMemo(() => planDuJour(cartes, ctx.reglagesFC, today, nextDate), [cartes, ctx.reglagesFC, today]);
  // v1.2 : la séance commencée est remise d'accord avec le plan du jour → mêmes nombres que le plan
  const reprise = sauve === undefined ? null : seanceEnCours(sauve, parId, today, ctx.db, ctx.reglagesFC);

  const nRev = plan.revisions.length;
  const nNouv = plan.nouvelles.length;
  const nEnCours = plan.enCours.length;
  const total = nRev + nNouv + nEnCours;
  const minutes = Math.max(1, Math.round(estimationMs(nRev, nNouv + nEnCours, mesures) / 60000));

  if (sauve === undefined) return null;
  const cls = 'sfa' + (compact ? ' compact' : '');
  /* (08/10) à côté du bouton : lancer UN bloc seul — « Révisions (23) · Apprentissage (15) » */
  const choixBloc = (nR, nA) => (
    <div className="sfa-blocs" role="group" aria-label="Lancer un seul bloc">
      <button type="button" className="sfa-bloc" disabled={!nR} onClick={() => onDemarrer('revisions')} title="Seulement les révisions du jour (méthode des J)">
        Révisions <span className="tnum">({nR})</span>
      </button>
      <button type="button" className="sfa-bloc" disabled={!nA} onClick={() => onDemarrer('apprendre')} title="Seulement l’apprentissage (nouvelles et cartes en cours)">
        Apprentissage <span className="tnum">({nA})</span>
      </button>
    </div>
  );

  if (reprise) {
    return (
      <div className={cls}>
        <div className="sfa-titre">Aujourd'hui</div>
        <div className="sfa-ligne">Séance commencée · {reprise.restantes} carte{reprise.restantes > 1 ? 's' : ''} restante{reprise.restantes > 1 ? 's' : ''}</div>
        <button type="button" className="sfa-btn" onClick={() => onDemarrer('tout')}><Icon name="play" size={16} fill /> Reprendre la séance ({reprise.restantes} restante{reprise.restantes > 1 ? 's' : ''})</button>
        {choixBloc(reprise.revRestantes, reprise.appRestantes)}
      </div>
    );
  }
  if (!total) {
    const proch = prochaineSeance(cartes, plan, today, nextDate);
    return (
      <div className={cls + ' vide'}>
        <div className="sfa-titre">Aujourd'hui</div>
        <div className="sfa-rien">Rien à faire aujourd'hui</div>
        {proch && <div className="sfa-ligne">Prochaine séance : {fmtJour(proch)}</div>}
      </div>
    );
  }
  const morceaux = [
    nRev > 0 && `${nRev} à réviser`,
    nNouv + nEnCours > 0 && `${nNouv + nEnCours} à apprendre`,
  ].filter(Boolean);
  return (
    <div className={cls}>
      <div className="sfa-titre">Aujourd'hui</div>
      <div className="sfa-ligne"><span className="tnum">{morceaux.join(' · ')} · ≈ {minutes} min</span></div>
      <button type="button" className="sfa-btn" onClick={() => onDemarrer('tout')} title="Révisions puis apprentissage"><Icon name="play" size={16} fill /> Démarrer la séance</button>
      {choixBloc(nRev, nNouv + nEnCours)}
    </div>
  );
}
