/* ============================================================
   MedRevise — COLLAGE D'IMAGE : éléments d'interface partagés (11/10/2026, lib/collerAuSurvol.js).
   - BoutonColler : « Coller » dans une zone image, pour les écrans tactiles (pas de survol, pas
     toujours de ⌘V) — lit le presse-papiers (navigator.clipboard.read), message clair si refus.
     Masqué sur un écran à souris (CSS, @media (hover: hover) and (pointer: fine)).
   - MessageCollage : « Image remplacée dans … — Annuler », discret, sous le formulaire.
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { lirePressePapierImage, RACCOURCI_COLLER } from '../lib/collerAuSurvol.js';

export function BoutonColler({ onFichier, libelle = 'Coller' }) {
  const [etat, setEtat] = useState(null); // null | 'lecture' | { erreur }
  const coller = async (e) => {
    e.preventDefault(); e.stopPropagation();
    setEtat('lecture');
    const r = await lirePressePapierImage();
    if (r.fichier) { setEtat(null); onFichier(r.fichier); return; }
    setEtat({ erreur: r.erreur });
    setTimeout(() => setEtat(null), 5000);
  };
  return (
    <span className="zi-coller-zone">
      <button type="button" className="zi-coller" onClick={coller} disabled={etat === 'lecture'} title={`Coller l’image du presse-papiers (${RACCOURCI_COLLER})`}>
        <Icon name="copy" size={12} /> {etat === 'lecture' ? 'Lecture…' : libelle}
      </button>
      {etat && etat.erreur && <span className="zi-coller-erreur" role="alert">{etat.erreur}</span>}
    </span>
  );
}

export function MessageCollage({ message, onAnnuler, onFermer }) {
  if (!message) return null;
  return (
    <div className="zi-message" role="status">
      <Icon name="image" size={13} /> <span>{message.texte}</span>
      {message.annulable && <button type="button" className="linklike" onClick={onAnnuler}>Annuler <kbd>{RACCOURCI_COLLER.replace('V', 'Z')}</kbd></button>}
      <button type="button" className="zi-message-x" onClick={onFermer} aria-label="Fermer"><Icon name="x" size={11} /></button>
    </div>
  );
}
