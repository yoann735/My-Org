/* ============================================================
   MedRevise — OCR : interface de moteur (05/10, docs/compte-rendu-ocr.md).

   Un moteur OCR est un objet :
     {
       nom: 'tesseract', version: '7.0.0+best_int', langues: ['fra', 'eng'],
       async recognizePage(bitmap: ImageBitmap) → {
         confidence: 0–100,
         mots: [{ t, x, y, w, h, c, line, para }]   // en PIXELS de l'image reçue
       },
       async liberer()                               // termine le worker, rend la mémoire
     }
   Le pipeline (pipeline.js) ne connaît QUE cette interface : il rend la page, appelle
   recognizePage, puis convertit les pixels en unités PDF. Brancher un autre moteur
   (service local, modèle plus récent…) = écrire un autre module qui la respecte et
   le renvoyer ici — rien d'autre ne change. La version du moteur entre dans
   l'identifiant des couches : changer de moteur relance l'OCR, jamais l'inverse.
   ============================================================ */
import { creerMoteurTesseract, VERSION_TESSERACT } from './moteurTesseract.js';

export const MOTEUR_PAR_DEFAUT = { nom: 'tesseract', version: VERSION_TESSERACT, langues: ['fra', 'eng'] };

let moteur = null;
/** Le moteur partagé (créé à la première demande). */
export function moteurOcr() {
  if (!moteur) moteur = creerMoteurTesseract(MOTEUR_PAR_DEFAUT.langues);
  return moteur;
}
/** Libère le moteur (file vide depuis un moment : ~100 Mo de mémoire rendus). */
export async function libererMoteur() {
  const m = moteur; moteur = null;
  if (m) await m.liberer();
}
