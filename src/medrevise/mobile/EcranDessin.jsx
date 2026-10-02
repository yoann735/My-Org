/* ============================================================
   MedRevise — écran Dessin du téléphone (02/10) : le canvas (MobileDessin.jsx)
   + l'export vers une fiche (étape 4 de docs/mecanique-dessin-mobile.md).
   ============================================================ */
import { useRef } from 'react';
import { MobileDessin } from './MobileDessin.jsx';

export function EcranDessin({ onQuit }) {
  const canvasRef = useRef(null);
  return <MobileDessin onQuit={onQuit} canvasRef={canvasRef} />;
}
