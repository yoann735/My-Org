/* DossierAddButton — création d'un dossier, placée EN HAUT de son conteneur
   (juste sous l'en-tête), jamais noyée sous la liste. Deux niveaux : unité
   dans une matière, chapitre dans une unité. */
import { DossierAddButton } from 'mealweek';

export const NouvelleUnite = () => <DossierAddButton onClick={() => {}} />;

export const NouveauChapitre = () => <DossierAddButton onClick={() => {}} label="Nouveau chapitre" />;

export const DansUneMatiere = () => (
  <div style={{ minWidth: 300 }}>
    <div style={{ fontSize: 13, fontWeight: 700, padding: '4px 2px' }}>Ostéologie</div>
    <DossierAddButton onClick={() => {}} />
    <div style={{ marginLeft: 18, paddingLeft: 10, borderLeft: '2px solid var(--border-2)', marginTop: 10 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, padding: '4px 2px' }}>Membre supérieur</div>
      <DossierAddButton onClick={() => {}} label="Nouveau chapitre" />
    </div>
  </div>
);
