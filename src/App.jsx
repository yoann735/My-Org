/* ============================================================
   Top-level router for the "univers" : app selector (hub) + the
   two apps (MealWeek, MedRevise). Theme is shared across all three
   and persisted. Which app is open is remembered too.
   ============================================================ */
import { Selecteur } from './Selecteur.jsx';
import MealWeekApp from './mealweek/MealWeekApp.jsx';
import MedReviseApp from './medrevise/MedReviseApp.jsx';
import { useSharedTheme } from './shared/useSharedTheme.js';
import { usePersistentState } from './shared/hooks/usePersistentState.js';

const MED_READY = true; // MedRevise is built (stage 2)

export default function App() {
  const themeApi = useSharedTheme();
  // which app is open: 'hub' | 'mealweek' | 'medrevise'
  const [app, setApp] = usePersistentState('app.current', 'hub');

  const goHub = () => setApp('hub');

  if (app === 'mealweek') return <MealWeekApp themeApi={themeApi} goHub={goHub} />;
  if (app === 'medrevise') return <MedReviseApp themeApi={themeApi} goHub={goHub} />;
  return <Selecteur themeApi={themeApi} onOpen={setApp} medReady={MED_READY} />;
}
