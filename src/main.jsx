import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';          // Tailwind layers (responsive utilities)
import './styles/design.css';  // design system (loaded after, takes priority)
import './styles/etudes.css';  // hub + MedRevise styles (built on the design system)
import './styles/documents.css'; // MedRevise — onglet Documents (mode Transcript / éditeur riche)
import './styles/myorg.css';   // My Org — organisation perso (To-do, Objectifs, Dashboard)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
