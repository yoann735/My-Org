/* ============================================================
   MedRevise — enregistrement d'une réponse à une flashcard (écrans de notation).
   noterFlashcard (pur) → carte enregistrée par l'écran (`sauver`, qui met à jour l'affichage)
   → entrée ajoutée au journal des révisions (toujours, interrupteur ON ou OFF).
   ============================================================ */
import { noterFlashcard } from './noter.js';
import { ajouterAuJournal, appareil } from '../journal/journal.js';

export async function repondreFlashcard(carte, note, { reglages = null, sauver, relearn = false, tempsMs, maintenant = new Date() } = {}) {
  const { carte: maj, entree } = noterFlashcard(carte, note, { reglages, relearn, tempsMs, maintenant, appareil: appareil() });
  const enregistree = sauver ? await sauver(maj) : maj;
  try { await ajouterAuJournal(entree); } catch (e) { console.warn('[MedRevise] journal : entrée non écrite', e); } // eslint-disable-line no-console
  return enregistree || maj;
}
