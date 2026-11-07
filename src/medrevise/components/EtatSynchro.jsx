/* ============================================================
   MedRevise — LIGNE D'ÉTAT DE SYNCHRO (Réglages ordinateur/tablette, accueil du téléphone) — 07/11/2026,
   docs/compte-rendu-sauvegarde-et-statut-synchro.md. Lit le MÊME calcul que le bandeau de l'en-tête
   (lib/etatSynchro.js via SynchroContext) : les deux ne peuvent plus se contredire.
   « N en attente » s'ouvre au tap : type, titre lisible, depuis quand, raison du blocage. LECTURE SEULE.
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { useEtatSynchro } from './Chiffre.jsx';

const quand = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export function LigneEtatSynchro() {
  const ctx = useEtatSynchro();
  const etat = ctx && ctx.etat;
  const [ouvert, setOuvert] = useState(false);
  if (!etat || etat.code === 'local') return null;
  const { code, n, elements } = etat;
  return (
    <div className="etat-synchro" data-etat-synchro={code} data-en-attente={n}>
      <div className={'etat-synchro-ligne ' + code}>
        <span className="point" aria-hidden="true" />
        {n > 0
          ? <button type="button" className="etat-synchro-ouvrir" aria-expanded={ouvert} onClick={() => setOuvert((v) => !v)} data-act="voir-en-attente">
              <span data-etat-texte>{etat.libelle}</span> <Icon name={ouvert ? 'chevU' : 'chevD'} size={14} />
            </button>
          : <span data-etat-texte>{etat.libelle}</span>}
      </div>
      {ouvert && n > 0 && (
        <ul className="etat-synchro-liste" data-liste-en-attente>
          {elements.map((e) => (
            <li key={e.cle} data-element={e.type}>
              <div><span className="genre">{e.genre}</span><span className="titre">{e.titre}</span></div>
              <div className="meta">{[quand(e.depuis) ? 'depuis le ' + quand(e.depuis) : null, e.raison].filter(Boolean).join(' · ')}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
