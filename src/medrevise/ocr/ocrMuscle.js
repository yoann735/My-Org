/* ============================================================
   MedRevise — OCR d'une capture de TABLEAU MUSCLE (08/10, lib/muscle.js).

   Même moteur et même préparation que l'OCR d'image des documents (ocrImage.js :
   Tesseract.js fra+eng dans son Web Worker, tout auto-hébergé). Seule différence :
   les puces (« • », souvent lues « e », « © », « « »…) en début de ligne sont gardées,
   pour que lib/muscle.js#lignesDepuisMots les rende en liste. Pas de cache : la capture
   n'est pas enregistrée, elle ne sert qu'à pré-remplir le formulaire.
   ============================================================ */
import { moteurOcr } from './moteur.js';
import { motUtile } from './pipeline.js';
import { preparer } from './ocrImage.js';
import { lignesDepuisMots } from '../lib/muscle.js';

const PUCE_SEULE = /^[•●◦○▪■□‣·*\-–—»«>©®°➢➤►eo¢+]$/;

/** File/Blob image → { lignes, trouvees, nom } (jamais d'exception : au pire tout vide) */
export async function lireTableauMuscle(blob) {
  let res = null;
  for (let essai = 0; essai < 2 && !res; essai++) { // le moteur partagé a pu être libéré entre-temps
    try {
      const { bitmap, w, h } = await preparer(blob);
      const r = await moteurOcr().recognizePage(bitmap);
      const premiers = new Map();
      r.mots.forEach((m) => { const p = premiers.get(m.line); if (!p || m.x < p.x) premiers.set(m.line, m); });
      const mots = r.mots
        .filter((m) => motUtile(m) || (premiers.get(m.line) === m && PUCE_SEULE.test((m.t || '').trim())))
        .map((m) => ({ t: m.t, c: m.c, line: m.line, x: m.x / w, y: m.y / h, w: m.w / w, h: m.h / h }));
      res = lignesDepuisMots(mots, w / h);
    } catch (e) {
      if (essai) return { lignes: null, trouvees: [], nom: '', erreur: true };
    }
  }
  return res;
}
