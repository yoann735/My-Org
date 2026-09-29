/* ============================================================
   MedRevise — MODE FOCUS « Prise de notes seule ».

   Quand il est actif, l'app ne montre plus qu'un onglet : Prise de notes.
   Il PERSISTE (rechargement, fermeture de l'onglet, redémarrage du navigateur),
   parce que c'est tout l'intérêt : se mettre en condition de travail et y rester.

   OÙ. localStorage, clé `medrevise.focus.notes`, booléen JSON. Même forme que la
   bascule « UI d'avant » (src/shared/uiMode.js), dont ce module s'inspire — mais
   il vit ICI, sous src/medrevise/, et PAS dans src/shared/ : ce dossier-là est
   commun aux deux apps de l'univers, et ce réglage ne concerne que MedRevise.

   PAS SYNCHRONISÉ, délibérément : c'est un réglage d'APPAREIL. Se mettre en mode
   focus sur l'ordinateur du bureau ne doit pas verrouiller le téléphone.

   PAS DE RECHARGEMENT À LA BASCULE, contrairement à `ui.classic` : aucune décision
   d'ordre de feuilles de style n'en dépend, un simple changement d'état suffit.

   ON NE PEUT PAS S'Y RETROUVER ENFERMÉ. Quatre sorties, indépendantes :
     1. le bandeau « Quitter le mode focus », rendu par le SHELL (MedReviseApp) et
        non par la page — donc présent quel que soit l'état de l'écran, y compris
        un document ouvert en plein lecteur ;
     2. l'interrupteur dans l'en-tête de l'écran Prise de notes ;
     3. l'entrée « Quitter le focus » au pied de la barre latérale ;
     4. en dernier recours, sans interface : `localStorage.removeItem('medrevise.focus.notes')`
        dans la console. Et si le stockage est illisible ou corrompu, estFocusNotes()
        renvoie false — un stockage cassé ne peut donc pas enfermer non plus.
   ============================================================ */

export const FOCUS_NOTES_KEY = 'medrevise.focus.notes';

/** Lu en direct (pas de cache) : appelable dès l'initialisation d'un useState,
    avant le premier rendu. Tout échec de lecture → false, jamais une porte fermée. */
export function estFocusNotes() {
  try {
    return JSON.parse(localStorage.getItem(FOCUS_NOTES_KEY)) === true;
  } catch (e) {
    return false;
  }
}

/** Écrit le réglage. Un échec d'écriture (mode privé, quota) n'empêche pas la
    bascule dans la session en cours : elle ne survivra simplement pas au
    rechargement, ce qui est le repli sûr. */
export function setFocusNotes(actif) {
  try {
    if (actif) localStorage.setItem(FOCUS_NOTES_KEY, 'true');
    else localStorage.removeItem(FOCUS_NOTES_KEY);
  } catch (e) { /* stockage indisponible : on n'échoue pas pour autant */ }
  return !!actif;
}

/** Le seul écran atteignable en mode focus. */
export const ECRAN_FOCUS = 'notes';
