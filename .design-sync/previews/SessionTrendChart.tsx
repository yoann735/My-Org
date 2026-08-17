/* SessionTrendChart — mini histogramme du taux de réussite, une barre par
   série. `rate` va de 0 à 1 ; la dernière barre est mise en avant. Moins de
   deux points ⇒ rien n'est rendu (pas de tendance sur un seul relevé). */
import { SessionTrendChart } from 'mealweek';

const serie = (rates: number[]) =>
  rates.map((rate, i) => ({ date: `2026-08-${String(i + 1).padStart(2, '0')}`, rate }));

const Cadre = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: 280, padding: 12, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--card)' }}>
    {children}
  </div>
);

export const Progression = () => (
  <Cadre><SessionTrendChart points={serie([0.35, 0.42, 0.55, 0.6, 0.72, 0.81, 0.9])} /></Cadre>
);

export const EnDentsDeScie = () => (
  <Cadre><SessionTrendChart points={serie([0.8, 0.45, 0.72, 0.5, 0.85, 0.6, 0.78])} /></Cadre>
);

export const PlusHaut = () => (
  <Cadre><SessionTrendChart points={serie([0.3, 0.5, 0.45, 0.7, 0.95])} height={90} /></Cadre>
);
