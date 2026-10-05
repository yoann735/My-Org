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

   05/10 (refonte du panneau) : REPLIÉE par défaut — une petite ligne grise
   « 38,42 $ · ≈ 132 h 27 min » en bas du mode Transcript ; un clic la déplie en
   la carte complète, un clic sur son titre la replie. Les Réglages la montrent
   dépliée (`deplieeParDefaut`). Même composant partout.
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

export function CarteCredits({ deplieeParDefaut = false }) {
  const { donnees: d, erreur, chargement } = useCredits();
  useSyncExternalStore(abonnerMoteur, lireEtat); // le bouton suit le début/fin de session
  const [ouverte, setOuverte] = useState(deplieeParDefaut);
  useHorloge(ouverte ? 15000 : 60000);
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

  /* REPLIÉE (défaut) : une petite ligne grise « 38,42 $ · ≈ 132 h 27 min » — un clic déplie. */
  if (!ouverte) {
    return (
      <button type="button" className="trx-credits-ligne-repliee" onClick={() => setOuverte(true)}
        title="Crédits Deepgram — cliquer pour le détail et Actualiser" aria-expanded="false">
        {d ? (
          <>
            <span className="tnum">{fmtUsd(d.remainingUsd)}</span>
            <span className="trx-cc-sep">·</span>
            <span className={'tnum trx-cc-temps ' + niveau}>≈ {fmtDuree(heures)}</span>
            {horsLigne && <span>· hors ligne</span>}
          </>
        ) : <span>{erreur ? 'Crédits Deepgram indisponibles' : 'Crédits Deepgram…'}</span>}
      </button>
    );
  }

  return (
    <div className="card trx-carte-credits">
      <div className="card-body">
        <button type="button" className="trx-cc-titre" onClick={() => setOuverte(false)} aria-expanded="true" title="Replier">
          Crédits Deepgram <Icon name="chevU" size={11} />
        </button>
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
          <button type="button" className={'trx-cc-actualiser' + (chargement ? ' tourne' : '')}
            disabled={chargement || enSession || attente > 0}
            title={enSession ? 'Pas de relecture pendant une transcription' : attente > 0 ? `Patiente ${Math.ceil(attente / 1000)} s avant d’actualiser à nouveau` : 'Relire les crédits sur Deepgram maintenant'}
            onClick={() => actualiserCredits({ force: true })}>
            <Icon name="refresh" size={13} /> Actualiser
          </button>
          <span className={'trx-cc-quand' + (horsLigne ? ' trx-cc-gris' : '')}>
            {horsLigne ? 'hors ligne' : d ? 'mis à jour ' + fmtQuand(d.updatedAt) : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
