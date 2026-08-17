/* OverdueBox — encadré « À rattraper » : les fiches dont l'échéance est
   dépassée. Les groupes sont ceux de planning.js#overdueByFiche (une entrée par
   fiche, avec ses cartes en retard) ; un groupe `isSchema` porte un schéma
   d'anatomie, qui compte pour un seul item planifiable. */
import { OverdueBox } from 'mealweek';

const anatomie = { nom: 'Anatomie', couleur: '#7C6FE0', icon: 'bone' };
const physio = { nom: 'Physiologie', couleur: '#4FA6D9', icon: 'lungs' };
const cartes = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `q${i}` }));

const groups = [
  { fiche: { id: 'f1', titre: 'Ostéologie du coude' }, matiere: anatomie, items: cartes(8) },
  { fiche: { id: 'f2', titre: 'Plexus brachial' }, matiere: anatomie, items: cartes(5) },
  { fiche: { id: 'f3', titre: 'Régulation de la pression artérielle' }, matiere: physio, items: cartes(11) },
];

const noop = () => {};

export const TroisFichesEnRetard = () => (
  <OverdueBox groups={groups} onStartFiche={noop} onStartAll={noop} onDismissFiche={noop} />
);

export const UneSeuleFiche = () => (
  <OverdueBox groups={[groups[0]]} onStartFiche={noop} onStartAll={noop} onDismissFiche={noop} />
);

/* `bare` : le contenu sans la carte englobante — c'est ainsi que l'Accueil
   l'intègre dans sa propre Card, pour ne pas emboîter deux cartes. */
export const SansCarteEnglobante = () => (
  <OverdueBox bare groups={groups} onStartFiche={noop} onStartAll={noop} onDismissFiche={noop} />
);

export const Repliee = () => (
  <OverdueBox groups={groups} collapsible collapsed onToggleCollapse={noop} onStartFiche={noop} onStartAll={noop} />
);

/* Un schéma d'anatomie compte pour UN item : la ligne l'annonce comme « schéma »
   au lieu d'un nombre de cartes. */
export const AvecUnSchema = () => (
  <OverdueBox
    groups={[groups[0], { fiche: { id: 'f4', titre: 'Schéma — muscles de la coiffe' }, matiere: anatomie, items: [], isSchema: true }]}
    onStartFiche={noop} onStartAll={noop} onDismissFiche={noop}
  />
);
