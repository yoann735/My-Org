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

/** bandeau discret, en haut au centre ; « À jour » disparaît en fondu.
 *  (07/11) Le texte vient de l'ÉTAT DE SYNCHRO UNIQUE (lib/etatSynchro.js, le même que Réglages) : « À jour » seulement
 *  si la passe est confirmée ET qu'aucun élément n'attend ; sinon « N en attente » reste affiché. */
export function BandeauSynchro({ porte, etat, onReessayer, mobile = false }) {
  const [visible, setVisible] = useState(true);
  const [fondu, setFondu] = useState(false);
  const code = etat ? etat.code : porte && porte.phase;
  useEffect(() => {
    setVisible(true); setFondu(false);
    if (code !== 'ajour') return undefined;
    const t1 = setTimeout(() => setFondu(true), 2200);
    const t2 = setTimeout(() => setVisible(false), 2900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [code, porte && porte.at, etat && etat.n]); // eslint-disable-line react-hooks/exhaustive-deps
  const texte = etat ? etat.libelle : libelleBandeau(porte);
  if (!texte || !visible) return null;
  return (
    <div className={'bandeau-synchro ' + code + (fondu ? ' fondu' : '') + (mobile ? ' mobile' : '')} role="status" aria-live="polite" data-bandeau-synchro={code} data-en-attente={etat ? etat.n : undefined}>
      {code === 'attente' && <span className="chiffre-attente seul" aria-hidden="true" />}
      {code === 'ajour' && <Icon name="check" size={13} />}
      {(code === 'horsligne' || code === 'incomplet' || code === 'echec' || code === 'enattente') && <Icon name="alert" size={13} />}
      <span data-bandeau-texte>{texte}</span>
      {(code === 'incomplet' || code === 'echec') && onReessayer && (
        <button type="button" className="linklike bandeau-reessayer" onClick={onReessayer} data-act="reessayer-synchro">Réessayer</button>
      )}
    </div>
  );
}

/** l'état de synchro unique, pour Réglages / accueil mobile */
export const useEtatSynchro = () => useContext(SynchroContext);
