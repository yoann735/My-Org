/* SessionTrendCard — bloc « Évolution » d'une fiche : il dérive lui-même le
   taux de réussite de chaque série (good/total), n'en garde que les dix
   dernières, et compare les deux dernières pour la tendance.
   Moins de deux séries ⇒ message d'attente (vraie variante, pas un cas vide). */
import { SessionTrendCard } from 'mealweek';

const s = (date: string, good: number, total: number) => ({ date, good, total });

export const TendanceALaHausse = () => (
  <SessionTrendCard log={[
    s('2026-07-14', 6, 18), s('2026-07-21', 9, 18), s('2026-07-28', 11, 18),
    s('2026-08-04', 13, 18), s('2026-08-11', 16, 18),
  ]} />
);

export const TendanceALaBaisse = () => (
  <SessionTrendCard log={[
    s('2026-07-14', 16, 18), s('2026-07-21', 15, 18), s('2026-07-28', 14, 18),
    s('2026-08-04', 12, 18), s('2026-08-11', 9, 18),
  ]} />
);

export const PasAssezDeSeries = () => (
  <SessionTrendCard log={[s('2026-08-11', 12, 18)]} />
);
