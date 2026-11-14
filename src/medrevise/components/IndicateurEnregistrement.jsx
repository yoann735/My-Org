/* ============================================================
   MedRevise — INDICATEUR D'ENREGISTREMENT d'un document (14/11/2026). Discret, dans la barre du
   document : une icône + un mot, l'infobulle donne le détail. UN SEUL calcul pour toutes les barres :
   lib/enregistrement.js#etatEnregistrement. « Enregistré » n'apparaît que pour une écriture confirmée
   par relecture.
   ============================================================ */
import { useEffect, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { etatEnregistrement, surEtatEnregistrement, rafraichirFile } from '../lib/enregistrement.js';
import '../../styles/enregistrement.css';

const ICONES = { erreur: 'alert', ecriture: 'refresh', attente: 'clock', appareil: 'check', envoye: 'check' };

export function IndicateurEnregistrement({ ns, onClick = null, compact = false }) {
  const [e, setE] = useState(() => etatEnregistrement(ns));
  useEffect(() => {
    let attente = null;
    const poser = (n) => setE((p) => (p.code === n.code && p.detail === n.detail ? p : n)); // aucun rendu si rien ne change
    /* « Enregistrement… » seulement si l'écriture DURE (> 400 ms) : une écriture ordinaire prend quelques ms, et faire
       clignoter la barre à chaque frappe coûtait un rendu (mesuré, docs/compte-rendu-boites-disparues-et-sauvegarde-continue.md) */
    const maj = () => {
      const n = etatEnregistrement(ns);
      if (n.code === 'ecriture') { if (!attente) attente = setTimeout(() => { attente = null; poser(etatEnregistrement(ns)); }, 400); return; }
      clearTimeout(attente); attente = null; poser(n);
    };
    maj();
    rafraichirFile();
    const off = surEtatEnregistrement(maj);
    const t = setInterval(maj, 4000); // hors ligne / retour du réseau, sans événement de file
    return () => { off(); clearInterval(t); clearTimeout(attente); };
  }, [ns]);
  const titre = e.detail + (onClick ? ' — cliquer pour l’historique des versions' : '');
  return (<>
    {e.code === 'erreur' && (
      <div className="enr-bandeau erreur enr-flottant" role="alert" data-erreur-enregistrement="">
        <Icon name="alert" size={15} />
        <span className="enr-txt"><b>Modification non enregistrée sur cet appareil.</b> {e.detail}</span>
      </div>
    )}
    <button type="button" className={'ienr ienr-' + e.code + (compact ? ' ienr-compact' : '')} data-enregistrement={e.code}
      title={titre} aria-label={e.libelle + ' — ' + e.detail} onClick={onClick || undefined} disabled={!onClick}>
      <Icon name={ICONES[e.code] || 'check'} size={13} />
      {e.code === 'envoye' && <Icon name="check" size={13} />}
      {!compact && <span className="ienr-lib">{e.libelle}</span>}
    </button>
  </>);
}
