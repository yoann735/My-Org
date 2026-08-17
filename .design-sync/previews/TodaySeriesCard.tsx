/* TodaySeriesCard — bandeau « Série du jour » de la méthode des J.
   Le `plan` est celui que produit planning.js#todayPlan : une entrée par fiche
   due, dans l'ordre de révision, la première étant la prochaine à lancer. */
import { TodaySeriesCard } from 'mealweek';

const anatomie = { nom: 'Anatomie', couleur: '#7C6FE0', icon: 'bone' };
const physio = { nom: 'Physiologie', couleur: '#4FA6D9', icon: 'lungs' };

const cartes = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `q${i}` }));

const plan = [
  { fiche: { id: 'f1', titre: 'Ostéologie du membre supérieur' }, matiere: anatomie, jLabel: 'J+7', qcm: 12, flash: 6, items: cartes(18) },
  { fiche: { id: 'f2', titre: 'Plexus brachial' }, matiere: anatomie, jLabel: 'J+3', qcm: 0, flash: 9, items: cartes(9) },
  { fiche: { id: 'f3', titre: 'Régulation de la pression artérielle' }, matiere: physio, jLabel: 'J+14', qcm: 7, flash: 0, items: cartes(7) },
];

export const SerieDuJour = () => (
  <TodaySeriesCard plan={plan} onStart={() => {}} />
);

export const Compacte = () => (
  <TodaySeriesCard plan={plan} compact onStart={() => {}} />
);

export const Repliee = () => (
  <TodaySeriesCard plan={plan} compact collapsed onToggleCollapse={() => {}} onStart={() => {}} />
);

/* Plan vide = tout est à jour : le composant bascule sur son état de fin,
   c'est une vraie variante d'affichage, pas un cas dégénéré. */
export const ToutEstAJour = () => (
  <TodaySeriesCard plan={[]} onStart={() => {}} />
);
