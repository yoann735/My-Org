/* ============================================================
   MedRevise — CHIFFRES EN ATTENTE DE SYNCHRO (28/10/2026, docs/compte-rendu-synchro-avant-affichage.md).
   Tant que la passe de synchro complète (lib/synchroAffichage.js) n'est pas terminée, aucun chiffre calculé n'est
   montré : <Chiffre> rend un petit indicateur à la place de son contenu, et `useEnSynchro()` permet aux écrans de
   désactiver Démarrer / Lancer. La phase vient de SynchroContext (MedReviseApp, ordinateur et téléphone).
   Le bandeau « Synchronisation… / À jour · 18:42 / Hors ligne · dernière synchro … / Synchro en échec / Synchro incomplète » vit ici aussi.
   ============================================================ */
import { createContext, useContext, useEffect, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { libelleBandeau } from '../lib/synchroAffichage.js';
import '../../styles/synchro-affichage.css';

export const SynchroContext = createContext({ phase: 'local' });

/** vrai tant que les chiffres calculés doivent attendre la fin de la synchro */
export const useEnSynchro = () => useContext(SynchroContext).phase === 'attente';

/** un chiffre calculé : son contenu, ou un indicateur de chargement pendant la synchro */
export function Chiffre({ children, className = '' }) {
  if (!useEnSynchro()) return children;
  return <span className={'chiffre-attente ' + className} role="status" aria-label="Synchronisation en cours" data-chiffre="attente" />;
}

/** bandeau discret, en haut au centre ; « À jour » disparaît en fondu */
export function BandeauSynchro({ porte, onReessayer, mobile = false }) {
  const [visible, setVisible] = useState(true);
  const [fondu, setFondu] = useState(false);
  useEffect(() => {
    setVisible(true); setFondu(false);
    if (!porte || porte.phase !== 'ajour') return undefined;
    const t1 = setTimeout(() => setFondu(true), 2200);
    const t2 = setTimeout(() => setVisible(false), 2900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [porte && porte.phase, porte && porte.at]); // eslint-disable-line react-hooks/exhaustive-deps
  const texte = libelleBandeau(porte);
  if (!texte || !visible) return null;
  const phase = porte.phase;
  return (
    <div className={'bandeau-synchro ' + phase + (fondu ? ' fondu' : '') + (mobile ? ' mobile' : '')} role="status" aria-live="polite" data-bandeau-synchro={phase}>
      {phase === 'attente' && <span className="chiffre-attente seul" aria-hidden="true" />}
      {phase === 'ajour' && <Icon name="check" size={13} />}
      {(phase === 'horsligne' || phase === 'incomplet' || phase === 'echec') && <Icon name="alert" size={13} />}
      <span data-bandeau-texte>{texte}</span>
      {(phase === 'incomplet' || phase === 'echec') && onReessayer && (
        <button type="button" className="linklike bandeau-reessayer" onClick={onReessayer} data-act="reessayer-synchro">Réessayer</button>
      )}
    </div>
  );
}
