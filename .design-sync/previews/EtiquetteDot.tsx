/* EtiquetteDot — point de couleur d'étiquette, purement décoratif.
   Trois valeurs seulement (ETIQUETTES) ; sans valeur, rien n'est rendu. */
import { EtiquetteDot } from 'mealweek';

const L = ({ value, texte }: { value?: any; texte: string }) => (
  <div className="row" style={{ gap: 8, alignItems: 'center', padding: '5px 0' }}>
    <EtiquetteDot value={value} />
    <span style={{ fontSize: 13.5 }}>{texte}</span>
  </div>
);

export const LesTroisEtiquettes = () => (
  <div>
    <L value="a_apprendre" texte="À apprendre" />
    <L value="a_reapprendre" texte="À réapprendre" />
    <L value="revision_j" texte="Révision des J" />
  </div>
);

export const DansUneListeDeFiches = () => (
  <div style={{ minWidth: 260 }}>
    <L value="a_apprendre" texte="Plexus brachial" />
    <L value="revision_j" texte="Ostéologie du coude" />
    <L value="a_reapprendre" texte="Muscles de la coiffe" />
    <L texte="Vascularisation du bras (sans étiquette)" />
  </div>
);
