/* EtiquetteQuickSet — sélecteur d'étiquette d'une fiche : « Aucune » plus
   les trois étiquettes, la valeur courante étant mise en avant. */
import { EtiquetteQuickSet } from 'mealweek';

export const AucuneEtiquette = () => <EtiquetteQuickSet value={null} onChange={() => {}} />;

export const AApprendre = () => <EtiquetteQuickSet value="a_apprendre" onChange={() => {}} />;

export const RevisionDesJ = () => <EtiquetteQuickSet value="revision_j" onChange={() => {}} />;
