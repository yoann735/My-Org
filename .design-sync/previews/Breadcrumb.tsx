/* Breadcrumb — fil d'Ariane ; le DERNIER segment est rendu comme position
   courante. Usage réel : hiérarchie Cours › Matière › Unité › Chapitre. */
import { Breadcrumb } from 'mealweek';

export const HierarchieComplete = () => (
  <Breadcrumb parts={['Anatomie humaine', 'Ostéologie', 'Membre supérieur', 'Épaule']} />
);

export const DeuxNiveaux = () => <Breadcrumb parts={['Physiologie', 'Système cardiovasculaire']} />;

export const UnSeulNiveau = () => <Breadcrumb parts={['Bibliothèque']} />;
