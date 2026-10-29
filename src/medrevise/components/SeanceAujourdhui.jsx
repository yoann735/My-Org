/* ============================================================
   MedRevise — LANCEMENT DE LA SÉANCE DES FLASHCARDS (24/10/2026, docs/compte-rendu-seance-categories.md § 4 ;
   remplace l'en-tête à un seul bouton de l'étape 2 FSRS). Accueil mobile + Réviser (ordinateur).
   Trois cases Nouvelles · Révisions · Retard, chacune avec le nombre disponible et un maximum (5, 10 … 100,
   Tout) ; seuls les types cochés entrent dans la séance, dans l'ordre Retard → Révisions → Nouvelles
   (lib/categoriesFC.js). Deux raccourcis : « Bloc nouvelles » (Nouvelles seules) et « Révisions J »
   (Révisions + Retard). Le dernier choix est mémorisé sur l'appareil (meta `seanceFC.choix`).
   L'en-tête « N cartes · ≈ M min » suit la sélection. Séance du jour commencée : « Reprendre ».
   (26/10) Sous les cases : l'interrupteur « Regrouper par cours » (mémorisé avec le choix) — il ne change QUE l'ordre
   de passage (lib/categoriesFC.js regrouperParCours).
   (28/10) Tant que la synchro complète n'est pas finie (components/Chiffre.jsx) : chiffres remplacés par un indicateur,
   Démarrer / Reprendre désactivés, jamais « Rien à faire » sur un état local périmé.
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { CaseACocher } from './CaseACocher.jsx';
import { Switch } from './ui.jsx';
import { Chiffre, useEnSynchro } from './Chiffre.jsx';
import { getMeta, setMeta } from '../lib/storage.js';
import { todayISO } from '../lib/sm2.js';
import { nextDate } from '../lib/planning.js';
import { prochaineSeance, estimationMs } from '../lib/apprentissageFC.js';
import { categoriser, nombres, raccourci, choixValide, CATEGORIES, MAXIMUMS } from '../lib/categoriesFC.js';
import { flashcardsPlanifiees, seanceEnCours, nouvelleSeance, CLE_SEANCE, CLE_MESURES, CLE_CHOIX } from '../session/SeanceFC.jsx';

const fmtJour = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const memeChoix = (a, b) => CATEGORIES.every(({ cle }) => a[cle].coche === b[cle].coche);

export function SeanceAujourdhui({ ctx, onDemarrer, compact = false }) {
  const today = todayISO();
  const enSynchro = useEnSynchro();
  const [sauve, setSauve] = useState(undefined);
  const [mesures, setMesures] = useState([]);
  const [choix, setChoix] = useState(null);
  useEffect(() => {
    let vivant = true;
    Promise.all([getMeta(CLE_SEANCE), getMeta(CLE_MESURES), getMeta(CLE_CHOIX)]).then(([s, m, c]) => {
      if (vivant) { setSauve(s || null); setMesures(m || []); setChoix((x) => x || choixValide(c)); }
    });
    return () => { vivant = false; };
  }, [ctx.db]);

  const cartes = useMemo(() => flashcardsPlanifiees(ctx.db), [ctx.db]);
  const parId = useMemo(() => Object.fromEntries((ctx.db.questions || []).map((q) => [q.id, q])), [ctx.db]);
  const cats = useMemo(() => categoriser(cartes, today, nextDate), [cartes, today]);
  const reprise = sauve === undefined ? null : seanceEnCours(sauve, parId, today, ctx.db);

  if (sauve === undefined || !choix) return null;
  const { total } = nombres(cats, choix);
  const minutes = (k) => Math.max(1, Math.round(estimationMs(k, mesures) / 60000));
  const pluriel = (k) => `${k} carte${k > 1 ? 's' : ''}`;
  const changer = (c) => { setChoix(c); setMeta(CLE_CHOIX, c); };
  const cocher = (cle, v) => changer({ ...choix, [cle]: { ...choix[cle], coche: v } });
  const borner = (cle, v) => changer({ ...choix, [cle]: { ...choix[cle], max: v === 'tout' ? 'tout' : Number(v) } });
  const demarrer = async () => {
    if (enSynchro) return;
    const e = nouvelleSeance(ctx.db, today, choix, ctx.stats);
    if (!e.cartes.length) return;
    await setMeta(CLE_SEANCE, e);
    onDemarrer('choix');
  };
  const cls = 'sfa sfa-lanceur' + (compact ? ' compact' : '');
  const disponibles = cats.nouvelles.length + cats.revisions.length + cats.retard.length;

  if (!disponibles && !reprise && !enSynchro) {
    const proch = prochaineSeance(cartes, today, nextDate);
    return (
      <div className={'sfa' + (compact ? ' compact' : '') + ' vide'}>
        <div className="sfa-titre">Aujourd'hui</div>
        <div className="sfa-rien">Rien à faire aujourd'hui</div>
        {proch && <div className="sfa-ligne">Prochaine séance : {fmtJour(proch)}</div>}
      </div>
    );
  }
  const blocNouvelles = raccourci('blocNouvelles', choix), revisionsJ = raccourci('revisionsJ', choix);
  return (
    <div className={cls} data-sfa="lanceur">
      <div className="sfa-tete">
        <div className="sfa-titre">Aujourd'hui</div>
        <div className="sfa-ligne"><Chiffre><span className="tnum" data-sfa="total">{pluriel(total)} · ≈ {minutes(total)} min</span></Chiffre></div>
      </div>
      {reprise && (
        <button type="button" className="sfa-reprise" data-sfa="reprendre" disabled={enSynchro} onClick={() => onDemarrer('reprise')}>
          <Icon name="play" size={14} fill /> Reprendre la séance commencée · <Chiffre><span className="tnum">{reprise.restantes}</span> restante{reprise.restantes > 1 ? 's' : ''}</Chiffre>
        </button>
      )}
      <div className="sfa-cats" role="group" aria-label="Cartes de la séance">
        {CATEGORIES.map(({ cle, libelle }) => {
          const c = choix[cle], n = cats[cle].length;
          return (
            <div key={cle} className={'sfa-cat' + (c.coche ? ' coche' : '') + (n ? '' : ' vide')} data-cat={cle}>
              <CaseACocher className="sfa-case" checked={c.coche} onChange={(v) => cocher(cle, v)}>
                <span className="sfa-cat-nom">{libelle}</span>
                <Chiffre className="sfa-cat-n"><span className="sfa-cat-n tnum" data-n={n}>{n}</span></Chiffre>
              </CaseACocher>
              <select className="sfa-max" value={String(c.max)} disabled={!c.coche} aria-label={`Nombre maximum de cartes ${libelle.toLowerCase()}`}
                onChange={(e) => borner(cle, e.target.value)}>
                {MAXIMUMS.map((m) => <option key={m} value={String(m)}>{m === 'tout' ? 'Tout' : `max ${m}`}</option>)}
              </select>
            </div>
          );
        })}
      </div>
      <div className="sfa-groupe" data-sfa="par-cours">
        <span className="sfa-groupe-lib" id="sfa-par-cours">Regrouper par cours
          <span className="sfa-groupe-sous">{choix.parCours ? 'cours après cours, dans l’ordre de la bibliothèque' : 'cartes mélangées'}</span></span>
        <Switch on={choix.parCours} onChange={(v) => changer({ ...choix, parCours: v })} label="Regrouper par cours" />
      </div>
      <div className="sfa-pied">
        <div className="sfa-raccourcis" role="group" aria-label="Raccourcis">
          <button type="button" className={'sfa-racc' + (memeChoix(choix, blocNouvelles) ? ' actif' : '')} data-raccourci="blocNouvelles" onClick={() => changer(blocNouvelles)}>Bloc nouvelles</button>
          <button type="button" className={'sfa-racc' + (memeChoix(choix, revisionsJ) ? ' actif' : '')} data-raccourci="revisionsJ" onClick={() => changer(revisionsJ)}>Révisions J</button>
        </div>
        <button type="button" className="sfa-btn" data-sfa="demarrer" disabled={!total || enSynchro} onClick={demarrer}><Icon name="play" size={16} fill /> Démarrer</button>
      </div>
    </div>
  );
}
