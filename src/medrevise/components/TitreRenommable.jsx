/* ============================================================
   MedRevise — NOM DE LA FICHE, EN PETIT, RENOMMABLE SUR PLACE (01/10).

   Remplace le grand en-tête « Bibliothèque » quand un document est ouvert : la
   place va au document. Comme le titre d'un document Word/Pages : un clic le
   rend éditable, Entrée valide, Échap annule, cliquer ailleurs valide aussi.
   Un titre vide (ou inchangé) n'écrit rien.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';

export function TitreRenommable({ titre, onRenommer, sousTitre = null }) {
  const [edition, setEdition] = useState(false);
  const [brouillon, setBrouillon] = useState(titre || '');
  const champ = useRef(null);
  useEffect(() => { if (!edition) setBrouillon(titre || ''); }, [titre, edition]);
  useEffect(() => { if (edition && champ.current) { champ.current.focus(); champ.current.select(); } }, [edition]);

  const valider = () => {
    const t = brouillon.trim();
    setEdition(false);
    if (t && t !== (titre || '').trim() && onRenommer) onRenommer(t);
  };
  const annuler = () => { setBrouillon(titre || ''); setEdition(false); };

  return (
    <div className="titre-fiche">
      {edition ? (
        <input ref={champ} className="titre-fiche-champ" value={brouillon} aria-label="Nom de la fiche"
          size={Math.max(12, Math.min(70, brouillon.length + 2))}
          onChange={(e) => setBrouillon(e.target.value)} onBlur={valider}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); valider(); } if (e.key === 'Escape') { e.preventDefault(); annuler(); } }} />
      ) : (
        <button type="button" className="titre-fiche-nom" onClick={() => onRenommer && setEdition(true)} disabled={!onRenommer}
          title={onRenommer ? 'Cliquer pour renommer la fiche' : undefined}>
          <span className="titre-fiche-texte">{titre || 'Sans titre'}</span>
          {onRenommer && <Icon name="edit" size={11} className="titre-fiche-crayon" />}
        </button>
      )}
      {sousTitre && <span className="titre-fiche-sous">{sousTitre}</span>}
    </div>
  );
}
