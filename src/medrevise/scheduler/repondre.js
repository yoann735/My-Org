/* ============================================================
   MedRevise — enregistrement d'une réponse à une flashcard (écrans de notation).
   noterFlashcard (pur) → carte enregistrée par l'écran (`sauver`, qui met à jour l'affichage)
   → entrée ajoutée au journal des révisions (toujours, interrupteur ON ou OFF).
   (20/11) `surEntree(entree)` facultatif : l'écran reçoit l'entrée journalisée (la séance garde son id pour pouvoir
   l'annuler — lib/retourSeance.js). Le calcul n'est pas touché.
   ============================================================ */
import { noterFlashcard, passerEnRevision } from './noter.js';
import { ajouterAuJournal, appareil } from '../journal/journal.js';

export async function repondreFlashcard(carte, note, { reglages = null, sauver, relearn = false, tempsMs, maintenant = new Date(), surEntree = null } = {}) {
  const { carte: maj, entree } = noterFlashcard(carte, note, { reglages, relearn, tempsMs, maintenant, appareil: appareil() });
  if (surEntree) surEntree(entree, maj);
  const enregistree = sauver ? await sauver(maj) : maj;
  try { await ajouterAuJournal(entree); } catch (e) { console.warn('[MedRevise] journal : entrée non écrite', e); } // eslint-disable-line no-console
  return enregistree || maj;
}

/** (24/10) bloc Nouvelles : « Passer en révision » — carte enregistrée, événement journalisé (sans note) */
export async function passerFlashcardEnRevision(carte, { reglages = null, sauver, maintenant = new Date(), surEntree = null } = {}) {
  const { carte: maj, entree } = passerEnRevision(carte, { reglages, maintenant, appareil: appareil() });
  if (surEntree) surEntree(entree, maj);
  const enregistree = sauver ? await sauver(maj) : maj;
  try { await ajouterAuJournal(entree); } catch (e) { console.warn('[MedRevise] journal : événement non écrit', e); } // eslint-disable-line no-console
  return enregistree || maj;
}
