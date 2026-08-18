import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';          // Tailwind layers (responsive utilities)
import './styles/design.css';  // design system (loaded after, takes priority)
import './styles/etudes.css';  // hub + MedRevise styles (built on the design system)
import './styles/documents.css'; // MedRevise — onglet Documents (mode Transcript / éditeur riche)
import './styles/medrevise-mobile.css'; // MedRevise — shell mobile dédié (révision uniquement)

/* Direction « Motion Lab » — la couche visuelle entière, chargée EN DERNIER
   (elle l'emporte à spécificité égale). Elle n'est pas importée statiquement :
   `?url` en fait un fichier CSS à part, dont on décide s'il entre ou non dans
   la page. Réglages → Apparence → « Retrouver l'UI d'avant » ne fait que poser
   le drapeau et recharger. Voir src/shared/uiMode.js.

   EN PRODUCTION, le <link> est écrit dans le HTML au build par le plugin
   `ui-theme-link` (vite.config.js) — c'est ce qui le rend visible du scanner
   de préchargement et le fait charger EN PARALLÈLE du bundle. La condition
   `!document.getElementById('ui-theme')` fait donc que le bloc ci-dessous ne
   s'exécute PAS en prod.

   Il sert dans deux cas :
   - EN DEV, où le plugin ne tourne pas (les feuilles de base y arrivent en
     <style> posés par le JS ; un <link> écrit dans le HTML perdrait la
     cascade) ;
   - en filet de secours, si le <link> du build venait à manquer.

   Et cette référence à `themeUrl` doit rester INCONDITIONNELLE : c'est elle
   qui fait émettre l'asset CSS par Vite. Sous `import.meta.env.DEV`, ou même
   via un simple `export`, Rollup élaguait l'import et l'asset disparaissait
   de dist/ (la build échouait alors sur le garde-fou du plugin). */
import themeUrl from './styles/medrevise-theme.css?url';
import { isClassicUI } from './shared/uiMode.js';

if (!document.getElementById('ui-theme') && !isClassicUI()) {
  const lien = document.createElement('link');
  lien.rel = 'stylesheet';
  lien.id = 'ui-theme';
  lien.href = themeUrl;
  // appendChild, donc APRÈS les feuilles déjà présentes : l'ordre « thème en
  // dernier », dont dépend toute la cascade, est conservé.
  document.head.appendChild(lien);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
