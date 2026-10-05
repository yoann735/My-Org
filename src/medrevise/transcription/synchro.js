/* ============================================================
   MedRevise — TRANSCRIPTION EN DIRECT : synchro cloud (palier 2).
   Le mécanisme générique vit dans lib/synchroIsolee.js (partagé avec les couches
   OCR depuis le 05/10). Spécificité ici : une session EN DIRECT n'est jamais
   échangée pendant qu'elle tourne — une seule fois, à l'arrêt.
   ============================================================ */
import { creerSynchroIsolee } from '../lib/synchroIsolee.js';

let vivante = null; // id de la session en cours d'enregistrement (exclue des échanges)
export function marquerVivante(id) { vivante = id || null; }

const s = creerSynchroIsolee('transcript_session', { exclu: (id) => id === vivante });
export const pousser = s.pousser;
export const pousserMaintenant = s.pousserMaintenant;
export const synchroTranscripts = s.synchro;
