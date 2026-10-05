/* ============================================================
   MedRevise — TRANSCRIPTION EN DIRECT : carte « Crédits Deepgram » (v1.2).

   UN SEUL composant, réutilisé tel quel en haut du panneau Transcript et dans les
   Réglages — l'information n'est plus éparpillée (la pastille à survoler et la
   ligne de la feuille « Transcrire » de la v1.1 ont été retirées).

       Crédits Deepgram
       38,42 $ restants
       ≈ 132 h 27 min de cours
       [⟳ Actualiser]   mis à jour il y a 12 min

   Valeurs brutes de /api/deepgram-credits : solde en $ (2 décimales), temps restant
   = solde ÷ tarif effectif, arrondi à la minute. Seul signal : la ligne de temps
   passe en ambre sous 5 h, en rouge sous 1 h. « Actualiser » force une relecture
   (cache serveur ignoré), au plus une fois toutes les 30 s ; échec → la valeur
   reste affichée et « hors ligne » remplace la date. Jamais relu pendant une
   session (le bouton est alors inactif).

   `compact` : une seule ligne « 38,42 $ · ≈ 132 h 27 min · ⟳ » — pendant une
   session et à la lecture d'une session, pour ne pas empiéter sur le transcript.
   ============================================================ */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { abonnerCredits, lireCredits, actualiserCredits, attenteActualiser, niveauCredits, heuresRestantes, fmtUsd, fmtDuree, fmtQuand } from './credits.js';
import { abonner as abonnerMoteur, lireEtat, sessionActive } from './engine.js';

export const useCredits = () => useSyncExternalStore(abonnerCredits, lireCredits);

/* re-rendu lent : « il y a N min » et la fin du délai de 30 s avancent seuls */
function useHorloge(ms) {
  const [, setT] = useState(0);
  useEffect(() => { const id = setInterval(() => setT((t) => t + 1), ms); return () => clearInterval(id); }, [ms]);
}

export function CarteCredits({ compact = false }) {
  const { donnees: d, erreur, chargement } = useCredits();
  useSyncExternalStore(abonnerMoteur, lireEtat); // le bouton suit le début/fin de session
  useHorloge(compact ? 60000 : 15000);
  const enSession = sessionActive();
  const attente = attenteActualiser();
  // le bouton redevient actif pile à la fin des 30 s (pas au prochain tic de l'horloge)
  const [, setReveil] = useState(0);
  useEffect(() => {
    if (attente <= 0) return undefined;
    const id = setTimeout(() => setReveil((n) => n + 1), attente + 50);
    return () => clearTimeout(id);
  }, [attente > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const horsLigne = !!erreur && erreur.code !== 'missing_key';
  const heures = heuresRestantes(d);
  const niveau = niveauCredits(heures);

  const bouton = (
    <button type="button" className={'trx-cc-actualiser' + (compact ? ' icone' : '') + (chargement ? ' tourne' : '')}
      disabled={chargement || enSession || attente > 0}
      title={enSession ? 'Pas de relecture pendant une transcription' : attente > 0 ? `Patiente ${Math.ceil(attente / 1000)} s avant d’actualiser à nouveau` : 'Relire les crédits sur Deepgram maintenant'}
      onClick={() => actualiserCredits({ force: true })}>
      <Icon name="refresh" size={compact ? 12 : 13} />{!compact && ' Actualiser'}
    </button>
  );

  if (compact) {
    return (
      <div className="trx-carte-credits compacte" aria-label="Crédits Deepgram">
        {d ? (
          <>
            <span className="tnum">{fmtUsd(d.remainingUsd)}</span>
            <span className="trx-cc-sep">·</span>
            <span className={'tnum trx-cc-temps ' + niveau}>≈ {fmtDuree(heures)}</span>
          </>
        ) : <span className="trx-cc-gris">{erreur ? 'Crédits indisponibles' : 'Crédits…'}</span>}
        {horsLigne && <span className="trx-cc-gris">· hors ligne</span>}
        <span style={{ flex: 1 }} />
        {bouton}
      </div>
    );
  }

  return (
    <div className="card trx-carte-credits">
      <div className="card-body">
        <div className="trx-cc-titre">Crédits Deepgram</div>
        {d ? (
          <>
            <div className="trx-cc-montant tnum">{fmtUsd(d.remainingUsd)} <span>restants</span></div>
            <div className={'trx-cc-temps tnum ' + niveau}>≈ {fmtDuree(heures)} <span>de cours</span></div>
          </>
        ) : (
          <div className="trx-cc-gris" style={{ margin: '4px 0 2px' }}>
            {erreur ? erreur.message : chargement ? 'Lecture des crédits…' : 'Pas encore de valeur.'}
          </div>
        )}
        <div className="trx-cc-pied">
          {bouton}
          <span className={'trx-cc-quand' + (horsLigne ? ' trx-cc-gris' : '')}>
            {horsLigne ? 'hors ligne' : d ? 'mis à jour ' + fmtQuand(d.updatedAt) : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
