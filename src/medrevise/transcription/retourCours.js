/* ============================================================
   MedRevise — RETOUR AU COURS depuis la barre « Transcription en cours » (20/11,
   docs/compte-rendu-export-png-et-retour-transcription.md).

   La session de transcription vit hors du lecteur (engine.js) : on peut quitter le
   cours, elle continue. Ce module retient OÙ le lecteur de chaque cours était ouvert
   (embarqué dans la Bibliothèque ou en plein écran, document Original/Fiche) et sait
   y ramener l'utilisateur :
     - le shell d'ordinateur (MedReviseApp) déclare le « gestionnaire » de navigation ;
       le shell du téléphone n'a pas de lecteur de cours : aucun gestionnaire, la barre
       n'offre alors pas de retour ;
     - une demande « panneau Transcript » est posée pour le cours, et consommée par le
       lecteur (PdfReader / CourseHtmlView) une fois sa position de lecture restaurée.
   La page et l'endroit du cours viennent de la position de lecture mémorisée
   (lib/positionLecture.js) : rien n'est écrit ici, rien ne touche à la session.
   ============================================================ */

const origines = new Map(); // courseId → { embedded, srcTab }
const demandesPanneau = new Set(); // courseId en attente d'ouverture du panneau Transcript
let gestionnaire = null;

/** le lecteur d'un cours note où il est affiché (appelé à son montage / changement d'onglet). */
export function noterOrigineLecteur(courseId, origine) {
  if (!courseId) return;
  origines.set(courseId, { ...(origines.get(courseId) || {}), ...origine });
}
export function origineLecteur(courseId) { return origines.get(courseId) || null; }

/** consommée par le lecteur : vrai une seule fois après une demande de retour. */
export function prendreDemandePanneau(courseId) { return demandesPanneau.delete(courseId); }

/** le shell d'ordinateur déclare comment naviguer vers un cours ; rend le « désabonnement ». */
export function definirRetourCours(fn) {
  gestionnaire = fn;
  return () => { if (gestionnaire === fn) gestionnaire = null; };
}
export function retourPossible() { return !!gestionnaire; }

/** ramène au cours (même endroit, panneau Transcript ouvert). Faux si aucun lecteur n'existe ici. */
export function revenirAuCours(courseId) {
  if (!gestionnaire || !courseId) return false;
  demandesPanneau.add(courseId);
  gestionnaire(courseId, origineLecteur(courseId));
  return true;
}
