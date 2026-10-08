/* ============================================================
   MedRevise — OCR : ponts React.
   ============================================================ */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { abonnerOcr, lireEtatOcr, ecouterCouche, coucheDuPdf, prioriser, enfiler, ocrAutoActif } from './service.js';
import { aMettreANiveau } from './couches.js';
import { abonnementDiffere } from '../lib/gesteEnCours.js';

// v1.4 : l'avancement de l'OCR re-rend le lecteur entier — différé pendant un glissement du panneau
const abonnerOcrDiffere = abonnementDiffere(abonnerOcr);
export const useEtatOcr = () => useSyncExternalStore(abonnerOcrDiffere, lireEtatOcr);

/**
 * Couche OCR du PDF ouvert dans le lecteur, tenue à jour page par page.
 * Ouvre aussi la priorité du service sur ce PDF (page affichée d'abord) et le met
 * en file s'il n'a pas de couche complète — c'est la « reprise à l'ouverture ».
 */
export function useCoucheOcr(pdfId, { courseId = null, titre = null, page = 1, pret = false } = {}) {
  const [couche, setCouche] = useState(null);
  useEffect(() => {
    if (!pdfId) { setCouche(null); return undefined; }
    let vivant = true;
    setCouche(null);
    coucheDuPdf(pdfId).then((c) => {
      if (!vivant) return;
      setCouche(c);
      if ((!c || c.status !== 'complete' || aMettreANiveau(c)) && ocrAutoActif()) enfiler({ pdfId, courseId, titre, origine: 'ouverture' });
    }).catch(() => {});
    const stop = ecouterCouche(pdfId, (c) => { if (vivant) setCouche(c); });
    return () => { vivant = false; stop(); prioriser(null); };
  }, [pdfId]); // eslint-disable-line react-hooks/exhaustive-deps
  // la page affichée et ses voisines passent en premier
  useEffect(() => { if (pdfId && pret) prioriser(pdfId, page); }, [pdfId, page, pret]);
  return couche;
}
