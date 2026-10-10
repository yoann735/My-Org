/* ============================================================
   MedRevise — en-tête « Aujourd'hui » de la séance de flashcards (étape 2 FSRS, 10/10/2026) :
   « 52 cartes · ≈ 13 min » et UN bouton « Démarrer ». Reprise le même jour (« Reprendre »,
   cartes entrées entre-temps comprises) ; « Rien à faire aujourd'hui » avec la date de la
   prochaine séance sinon. Plus de compteur « à apprendre » ni de choix de bloc (mode
   Apprentissage supprimé). Accueil mobile + Réviser + panneau du lecteur.
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
  const plan = useMemo(() => planDuJour(cartes, today, nextDate), [cartes, today]);
  const reprise = sauve === undefined ? null : seanceEnCours(sauve, parId, today, ctx.db);

  const n = plan.dues.length;
  const minutes = (k) => Math.max(1, Math.round(estimationMs(k, mesures) / 60000));
  const pluriel = (k) => `${k} carte${k > 1 ? 's' : ''}`;

  if (sauve === undefined) return null;
  const cls = 'sfa' + (compact ? ' compact' : '');
  if (reprise) {
    return (
      <div className={cls}>
        <div className="sfa-titre">Aujourd'hui</div>
        <div className="sfa-ligne"><span className="tnum">Séance commencée · {pluriel(reprise.restantes)} restante{reprise.restantes > 1 ? 's' : ''} · ≈ {minutes(reprise.restantes)} min</span></div>
        <button type="button" className="sfa-btn" onClick={() => onDemarrer('tout')}><Icon name="play" size={16} fill /> Reprendre la séance</button>
      </div>
    );
  }
  if (!n) {
    const proch = prochaineSeance(cartes, today, nextDate);
    return (
      <div className={cls + ' vide'}>
        <div className="sfa-titre">Aujourd'hui</div>
        <div className="sfa-rien">Rien à faire aujourd'hui</div>
        {proch && <div className="sfa-ligne">Prochaine séance : {fmtJour(proch)}</div>}
      </div>
    );
  }
  return (
    <div className={cls}>
      <div className="sfa-titre">Aujourd'hui</div>
      <div className="sfa-ligne"><span className="tnum">{pluriel(n)} · ≈ {minutes(n)} min</span></div>
      <button type="button" className="sfa-btn" onClick={() => onDemarrer('tout')}><Icon name="play" size={16} fill /> Démarrer</button>
    </div>
  );
}
