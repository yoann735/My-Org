/* ============================================================
   MedRevise — L'ONGLET « TABLEAU » du panneau de la fiche (22/10, docs/compte-rendu-tableau-flashcards.md §1) : ouvrir
   le tableau en plein écran ou côte à côte (ordinateur large), son résumé. Le tableau lui-même s'affiche dans le lecteur
   (tableau/Board.jsx), à la place du PDF ou à côté. Les flashcards s'y ajoutent DEPUIS LA CARTE (v1.1) : « → Tableau »
   sur une flashcard ou une sélection (onglet Flashcards), ou en la glissant sur le tableau.
   ============================================================ */
import { useEffect, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { lireBoard, flashcardsDuBoard, boitesDuBoard } from '../lib/board.js';

/** (v1.1) les ids des flashcards déjà posées sur le tableau de la fiche, tenus à jour (écritures, synchro) */
export const useFlashcardsAuTableau = (ficheId, actif = true) => useIdsDuTableau(ficheId, flashcardsDuBoard, actif);
/** (22/10) les ids des boîtes du lecteur déjà posées sur le tableau (« → Tableau » de la mini barre) */
export const useBoitesAuTableau = (ficheId, actif = true) => useIdsDuTableau(ficheId, boitesDuBoard, actif);

function useIdsDuTableau(ficheId, extraire, actif) {
  const [ids, setIds] = useState(() => new Set());
  useEffect(() => {
    if (!actif || !ficheId) { setIds(new Set()); return undefined; }
    let vivant = true;
    const lire = () => lireBoard(ficheId).then((b) => {
      if (!vivant) return;
      const n = extraire(b);
      setIds((v) => (v.size === n.size && [...n].every((x) => v.has(x)) ? v : n));
    });
    lire();
    const maj = (e) => { if (!e.detail || e.detail.store === 'board') lire(); };
    window.addEventListener('medrevise:ecriture', maj); window.addEventListener('medrevise:recharge', lire);
    return () => { vivant = false; window.removeEventListener('medrevise:ecriture', maj); window.removeEventListener('medrevise:recharge', lire); };
  }, [ficheId, actif, extraire]);
  return ids;
}

export function PanneauTableau({ ficheId, disposition, onDisposition, large = true }) {
  const [resume, setResume] = useState(null);
  useEffect(() => {
    let vivant = true;
    const lire = () => lireBoard(ficheId).then((b) => vivant && setResume({ cartes: b.objects.filter((o) => o.type === 'carte').length, images: b.objects.filter((o) => o.type === 'image').length, fleches: b.edges.length, theme: b.theme }));
    lire();
    const maj = (e) => { if (!e.detail || e.detail.store === 'board') lire(); };
    window.addEventListener('medrevise:ecriture', maj); window.addEventListener('medrevise:recharge', lire);
    return () => { vivant = false; window.removeEventListener('medrevise:ecriture', maj); window.removeEventListener('medrevise:recharge', lire); };
  }, [ficheId]);
  return (
    <div className="ptb2">
      <div className="ptb2-resume tnum">
        {resume ? (resume.cartes + resume.images + resume.fleches === 0 ? 'Tableau vide' : `${resume.cartes} carte${resume.cartes > 1 ? 's' : ''} · ${resume.fleches} flèche${resume.fleches > 1 ? 's' : ''}${resume.images ? ` · ${resume.images} image${resume.images > 1 ? 's' : ''}` : ''}`) : '…'}
      </div>
      <button type="button" className={'btn' + (disposition === 'tableau' ? ' actif' : ' primary')} data-act="plein" onClick={() => onDisposition('tableau')}>
        <Icon name="maximize" size={14} /> Ouvrir en plein écran
      </button>
      <button type="button" className={'btn' + (disposition === 'deux' ? ' actif' : '')} data-act="cote" disabled={!large} onClick={() => onDisposition('deux')}
        title={large ? 'Le PDF et le tableau côte à côte' : 'Côte à côte : sur un écran large seulement'}>
        <Icon name="panel" size={14} /> Côte à côte
      </button>
      {disposition !== 'pdf' && <button type="button" className="btn ghost" data-act="fermer-tableau" onClick={() => onDisposition('pdf')}><Icon name="filePdf" size={14} /> Revenir au cours</button>}
      <div className="hint ptb2-aide">
        Cartes, flèches (droites ou courbes, accrochées aux cartes), images collées ou glissées, groupes, export PNG. Une flashcard s’y ajoute par « → Tableau » sur la carte (Exercices › Flashcards), ou en la glissant sur le tableau ; du texte du cours, par la sélection › « Ajouter au tableau ».
      </div>
    </div>
  );
}
