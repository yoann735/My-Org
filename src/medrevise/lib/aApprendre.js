/* ============================================================
   MedRevise — TAG « À APPRENDRE » d'une flashcard (26/10, docs/compte-rendu-flashcards.md).
   Un seul tag, booléen, stocké SUR LA CARTE (champ additif `aApprendre`), synchronisé avec elle
   (lib/storage.js put → file d'envoi, comme le carnet d'erreurs).
   INDÉPENDANCE : on relit la version ENREGISTRÉE de la carte et on n'y change QUE `aApprendre` —
   dueDate, catégorie, état FSRS, historique et journal des révisions restent exactement tels quels.
   Le tag n'est lu par aucun planificateur : il ne sert qu'à l'affichage et au filtre.
   ============================================================ */
import { getOne } from './storage.js';

export const estAApprendre = (q) => !!q && q.aApprendre === true;

/** carte qui peut porter le tag : une flashcard enregistrée (pas une carte éphémère de séance) */
export const admissibleAApprendre = (q) => !!q && q.type === 'flashcard' && !q.ephemeral;

/** pose (`valeur` = true) ou retire le tag de la carte `id` ; `sauver` = ctx.saveQuestion. Rend la carte enregistrée. */
export async function ecrireAApprendre(id, valeur, sauver) {
  const q = await getOne('questions', id);
  if (!admissibleAApprendre(q)) throw new Error('Seules les flashcards peuvent être mises « À apprendre ».');
  const rec = { ...q, aApprendre: !!valeur };
  await sauver(rec);
  return rec;
}

/** (26/10) une séance note la copie de la carte prise à l'affichage : le tag posé ENTRE-TEMPS (étoile de la carte
 *  affichée) ne doit pas être écrasé par la note. Rend `c` avec le tag de la version enregistrée — rien d'autre ne change. */
export async function garderTagEnBase(c) {
  const enBase = c && c.id ? await getOne('questions', c.id) : null;
  if (!enBase || !('aApprendre' in enBase)) return c;
  return { ...c, aApprendre: enBase.aApprendre };
}
