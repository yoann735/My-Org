/* DossierRow — ligne de dossier de l'arborescence, partagée À L'IDENTIQUE par
   Réviser et la Bibliothèque (un seul rendu, donc aucune dérive possible).
   Deux niveaux : une UNITÉ (parentId null, annonce ses chapitres) et un
   CHAPITRE (peut porter ses propres exercices). */
import { DossierRow } from 'mealweek';

const noop = () => {};
const unite = { id: 'd1', nom: 'Membre supérieur', parentId: null, matiereId: 'm1' };
const chapitre = { id: 'd2', nom: 'Épaule', parentId: 'd1', matiereId: 'm1' };

export const UniteRepliee = () => (
  <DossierRow dossier={unite} isOpen={false} fichesCount={12} sousDossiersCount={3}
    onToggle={noop} onRename={noop} onMenu={noop} />
);

export const UniteDepliee = () => (
  <DossierRow dossier={unite} isOpen fichesCount={12} sousDossiersCount={3}
    onToggle={noop} onRename={noop} onMenu={noop} />
);

/* Un chapitre qui porte des exercices affiche leur nombre ET le bouton d'accès :
   c'est le seul niveau à en avoir. */
export const ChapitreAvecExercices = () => (
  <DossierRow dossier={chapitre} isOpen={false} fichesCount={4} exosCount={7}
    onOpenExos={noop} onToggle={noop} onRename={noop} onMenu={noop} />
);

export const ChapitreSansExercice = () => (
  <DossierRow dossier={chapitre} isOpen={false} fichesCount={4}
    onToggle={noop} onRename={noop} onMenu={noop} />
);

/* En renommage, la ligne cède la place au champ fourni par l'écran appelant —
   c'est lui qui porte son propre brouillon et sa validation. */
export const EnRenommage = () => (
  <DossierRow dossier={unite} isOpen fichesCount={12} isRenaming
    renameInput={<input className="srcmgr-input" defaultValue="Membre supérieur" />}
    onToggle={noop} onRename={noop} onMenu={noop} />
);
