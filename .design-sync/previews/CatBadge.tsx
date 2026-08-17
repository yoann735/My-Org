/* CatBadge — badge de matière : libellé, teinte et icône viennent de la
   matière elle-même (matiereMeta). Sans matière, il retombe sur « — ». */
import { CatBadge } from 'mealweek';

export const Matieres = () => (
  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
    <CatBadge matiere={{ nom: 'Anatomie', couleur: '#7C6FE0', icon: 'bone' }} />
    <CatBadge matiere={{ nom: 'Physiologie', couleur: '#4FA6D9', icon: 'lungs' }} />
    <CatBadge matiere={{ nom: 'Biochimie', couleur: '#4FB87A', icon: 'flask' }} />
    <CatBadge matiere={{ nom: 'Pharmacologie', couleur: '#F5A623', icon: 'pill' }} />
  </div>
);

export const SansCouleurChoisie = () => (
  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
    <CatBadge matiere={{ nom: 'Histologie' }} />
    <CatBadge matiere={{ nom: 'Embryologie' }} />
  </div>
);
