/* ============================================================
   MedRevise — shell MOBILE (petit écran, voir MedReviseApp.jsx). Une seule
   préoccupation : FAIRE SES J au pouce. Rien d'autre n'est atteignable ici
   (pas d'import, pas de Bibliothèque, pas de lecteurs, pas de Réglages).

   Routeur local, indépendant du `screen` desktop (qui reste inerte en
   arrière-plan) : home | session | exercice | feynman. Chaque écran
   RÉUTILISE les fonctions ctx.* et les libs existantes (sm2, correction,
   planning) — seule la présentation est neuve. Quitter une révision revient
   toujours à l'accueil, sans jamais perdre de données (chaque carte est déjà
   validée en base au moment où elle est notée, comme sur desktop).
   ============================================================ */
import { useState } from 'react';
import { MobileHome } from './MobileHome.jsx';
import { MobileSession } from './MobileSession.jsx';
import { MobileExercice } from './MobileExercice.jsx';
import { MobileFeynman } from './MobileFeynman.jsx';

export function MobileApp({ ctx }) {
  const [screen, setScreen] = useState('home'); // home | session | exercice | feynman
  const goHome = () => setScreen('home');

  if (screen === 'session' && ctx.session) {
    return <MobileSession ctx={ctx} onQuit={() => { ctx.endSession(); goHome(); }} />;
  }
  if (screen === 'exercice' && ctx.exercice) {
    return <MobileExercice ctx={ctx} onQuit={goHome} />;
  }
  if (screen === 'feynman' && ctx.feynman) {
    return <MobileFeynman ctx={ctx} onQuit={goHome} />;
  }
  return (
    <MobileHome ctx={ctx}
      onStartSession={(items, title) => { ctx.startSession(items, title); setScreen('session'); }}
      onStartExercice={(items, title) => { ctx.startExercice(items, title); setScreen('exercice'); }}
      onStartFeynman={(payload) => { ctx.startFeynman(payload); setScreen('feynman'); }}
    />
  );
}
