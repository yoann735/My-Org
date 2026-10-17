/* ============================================================
   MedRevise — CARNET D'ERREURS : PRÉ-RÉPONSES RAPIDES (17/10,
   docs/compte-rendu-fichier-carnet-calendrier.md).
   Après une note en révision, « Carnet d'erreurs » ouvre un menu à UN tap : la pré-réponse
   devient le TYPE de l'entrée (`carnetType`) et l'entrée est créée tout de suite, sans rien
   écrire. « Autre… » ouvre le formulaire complet (components/SaisieCarnet.jsx).
   La liste éditée vit dans le store `prompts` (enregistrement `carnetPreReponses`,
   lib/storage.js) et se modifie dans Réglages › Carnet d'erreurs.

   L'entrée du carnet EST la carte (V1 : flashcard avec `carnetAt`, lib/planning.js) : elle porte
   donc son recto/verso. On n'écrit que les champs du carnet (`carnetAt`, `carnetType`,
   `carnetRaison`) sur la version ENREGISTRÉE de la carte (relue en base) : la note qui vient
   d'être donnée — dueDate, état FSRS, historique — reste exactement celle que le planificateur
   a écrite.
   ============================================================ */
import { getOne } from './storage.js';
import { todayISO } from './sm2.js';

export const AUTRE = 'autre';
export const PRE_REPONSES_DEFAUT = [
  { id: 'inconnu', label: 'Je ne connais pas' },
  { id: 'compris', label: 'Pas compris' },
  { id: 'confusion', label: 'Confusion avec une autre carte' },
  { id: 'inversion', label: 'Inversion (latéral/médial, origine/insertion…)' },
  { id: 'oubli', label: 'Oubli d’un élément' },
  { id: 'orthographe', label: 'Faute d’orthographe du terme' },
];
/** la liste en vigueur (réglages, sinon défaut) — « Autre… » est toujours ajouté à la fin par l'écran */
export const preReponsesDe = (rec) => (rec && Array.isArray(rec.liste) && rec.liste.length ? rec.liste : PRE_REPONSES_DEFAUT);
export const nouvelIdPreReponse = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

/** la carte admise au carnet : une flashcard « V1 » (pas une carte d'erreur, pas un QCM) */
export const admissibleCarnet = (q) => !!q && q.type === 'flashcard' && !q.ephemeral;

/**
 * Crée (ou met à jour) l'entrée du carnet pour la carte `id` : type = la pré-réponse, note
 * facultative. Rend la carte enregistrée. `sauver` = ctx.saveQuestion.
 */
export async function ajouterAuCarnet(id, { type, note = '' }, sauver) {
  const q = await getOne('questions', id);
  if (!admissibleCarnet(q)) throw new Error('Le carnet d’erreurs reçoit les flashcards.');
  const n = String(note || '').trim();
  const rec = { ...q, carnetAt: q.carnetAt || todayISO(), carnetType: type, carnetRaison: n || type };
  await sauver(rec);
  return rec;
}
