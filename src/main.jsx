import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';          // Tailwind layers (responsive utilities)
import './styles/design.css';  // design system (loaded after, takes priority)
import './styles/etudes.css';  // hub + MedRevise styles (built on the design system)
import './styles/documents.css'; // MedRevise — onglet Documents (mode Transcript / éditeur riche)
import './styles/medrevise-mobile.css'; // MedRevise — shell mobile dédié (révision uniquement)

/* Direction « Motion Lab » — la couche visuelle entière, chargée EN DERNIER
   (elle l'emporte à spécificité égale). Elle n'est PAS importée statiquement :
   `?url` demande à Vite d'en faire un fichier CSS à part (traité et haché
   comme les autres), dont on décide au démarrage s'il entre ou non dans la
   page. Réglages → Apparence → « Retrouver l'UI d'avant » ne fait que poser
   le drapeau et recharger ; ici, le <link> n'est simplement pas créé, et la
   cascade d'origine reste seule en place. Voir src/shared/uiMode.js. */
import themeUrl from './styles/medrevise-theme.css?url';
import { isClassicUI } from './shared/uiMode.js';

if (!isClassicUI()) {
  const lien = document.createElement('link');
  lien.rel = 'stylesheet';
  lien.dataset.uiTheme = 'motion-lab';
  lien.href = themeUrl;
  // appendChild, donc APRÈS le <link> du bundle déjà présent dans le <head> :
  // l'ordre « thème en dernier » est conservé.
  document.head.appendChild(lien);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
