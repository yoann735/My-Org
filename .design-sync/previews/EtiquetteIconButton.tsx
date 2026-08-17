/* EtiquetteIconButton — bouton d'étiquette : l'icône se remplit et prend la
   couleur de l'étiquette posée, et reste grise quand il n'y en a pas. */
import { EtiquetteIconButton } from 'mealweek';

const Cellule = ({ value, texte }: { value?: any; texte: string }) => (
  <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 7, width: 130 }}>
    <EtiquetteIconButton value={value} onClick={() => {}} />
    <span style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>{texte}</span>
  </div>
);

export const Etats = () => (
  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
    <Cellule texte="aucune étiquette" />
    <Cellule value="a_apprendre" texte="À apprendre" />
    <Cellule value="a_reapprendre" texte="À réapprendre" />
    <Cellule value="revision_j" texte="Révision des J" />
  </div>
);
