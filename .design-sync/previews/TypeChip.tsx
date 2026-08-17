/* TypeChip — pastille de type de carte. Trois types seulement : les trois
   modes de révision de MedRevise. Le compteur est optionnel. */
import { TypeChip } from 'mealweek';

export const LesTroisTypes = () => (
  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
    <TypeChip type="qcm" />
    <TypeChip type="flashcard" />
    <TypeChip type="feynman" />
  </div>
);

export const AvecCompteurs = () => (
  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
    <TypeChip type="qcm" count={24} />
    <TypeChip type="flashcard" count={18} />
    <TypeChip type="feynman" count={3} />
  </div>
);
