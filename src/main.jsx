import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';          // Tailwind layers (responsive utilities)
import './styles/design.css';  // design system (loaded after, takes priority)
import './styles/etudes.css';  // hub + MedRevise styles (built on the design system)
import './styles/documents.css'; // MedRevise — onglet Documents (mode Transcript / éditeur riche)
import './styles/medrevise-mobile.css'; // MedRevise — shell mobile dédié (révision uniquement)
import './styles/medrevise-theme.css'; // direction « Motion Lab » — couche de tokens, chargée EN DERNIER (elle l'emporte à spécificité égale)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
