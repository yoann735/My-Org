/* ============================================================
   Top-level router for the "univers" : app selector (hub) + the
   two apps (MealWeek, MedRevise). Theme is shared across both.
   Which app is open follows the URL path (/, /mealweek,
   /medrevise) so each app has a direct, shareable/bookmarkable
   URL, while `/` always shows the hub selector.
   ============================================================ */
import { useCallback, useEffect, useState } from 'react';
import { Selecteur } from './Selecteur.jsx';
import MealWeekApp from './mealweek/MealWeekApp.jsx';
import MedReviseApp from './medrevise/MedReviseApp.jsx';
import { useSharedTheme } from './shared/useSharedTheme.js';

const MED_READY = true; // MedRevise is built (stage 2)

const PATH_TO_APP = { '/mealweek': 'mealweek', '/medrevise': 'medrevise' };
const APP_TO_PATH = { hub: '/', mealweek: '/mealweek', medrevise: '/medrevise' };

function appFromPath(pathname) {
  return PATH_TO_APP[pathname] || 'hub';
}

export default function App() {
  const themeApi = useSharedTheme();
  // which app is open: 'hub' | 'mealweek' | 'medrevise' — derived from the URL
  const [app, setApp] = useState(() => appFromPath(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setApp(appFromPath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((next) => {
    setApp(next);
    const path = APP_TO_PATH[next] ?? '/';
    if (window.location.pathname !== path) window.history.pushState(null, '', path);
  }, []);

  const goHub = () => navigate('hub');

  if (app === 'mealweek') return <MealWeekApp themeApi={themeApi} goHub={goHub} />;
  if (app === 'medrevise') return <MedReviseApp themeApi={themeApi} goHub={goHub} />;
  return <Selecteur themeApi={themeApi} onOpen={navigate} medReady={MED_READY} />;
}
