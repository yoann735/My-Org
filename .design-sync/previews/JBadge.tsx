/* JBadge — palier de la méthode des J. Rien n'est rendu sans jLabel :
   c'est ce qui permet de l'appeler sans garde côté appelant. */
import { JBadge } from 'mealweek';

export const Paliers = () => (
  <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
    <JBadge jLabel="J0" />
    <JBadge jLabel="J+3" />
    <JBadge jLabel="J+7" />
    <JBadge jLabel="J+14" />
    <JBadge jLabel="J+30" />
  </div>
);

export const DansUneLigne = () => (
  <div className="row" style={{ gap: 8, alignItems: 'center' }}>
    <span style={{ fontWeight: 700, fontSize: 14 }}>Ostéologie du membre supérieur</span>
    <JBadge jLabel="J+7" />
  </div>
);
