/* ============================================================
   MedRevise — CONVERSION « NOUVELLES » (24/10/2026, docs/compte-rendu-seance-categories.md § 3). PUR.
   Toute flashcard JAMAIS notée en révision devient une Nouvelle : on AJOUTE `nouvelle: true` et la
   trace `conversionNouvelles` ({ version, le, dueDateAvant }). Rien n'est retiré ni réécrit : sa date
   de départ (`dueDate`, `j0Date`) reste en base, elle n'est simplement plus lue (lib/categoriesFC.js).
   Les cartes déjà notées gardent leur date telle quelle (elles ne sont pas touchées).
   Idempotente par carte : une carte déjà marquée (`nouvelle` true OU false — false = passée en
   révision) n'est jamais reconvertie.
   ============================================================ */
import { estFlashcardJ, aEteNoteeJ } from './apprentissageFC.js';

export const VERSION_CONVERSION_NOUVELLES = 1;

export const aConvertirNouvelle = (q) => estFlashcardJ(q) && q.nouvelle === undefined && !aEteNoteeJ(q);

const texte = (v) => String(v == null ? '' : v).replace(/<[^>]+>/g, ' ').replace(/\{\{([^}]*)\}\}/g, '$1').replace(/\s+/g, ' ').trim().slice(0, 90);

/** → { maj: cartes à écrire, rapport: { convertis, gardentLeurDate, liste: [{ id, ficheId, recto, dueDateAvant }] } } */
export function convertirNouvelles(questions, today) {
  const fc = (questions || []).filter(estFlashcardJ);
  const maj = fc.filter(aConvertirNouvelle).map((q) => ({
    ...q, nouvelle: true,
    conversionNouvelles: { version: VERSION_CONVERSION_NOUVELLES, le: today, dueDateAvant: q.dueDate == null ? null : q.dueDate },
  }));
  return {
    maj,
    rapport: {
      convertis: maj.length,
      gardentLeurDate: fc.filter(aEteNoteeJ).length,
      dejaMarquees: fc.filter((q) => q.nouvelle !== undefined && !aEteNoteeJ(q)).length,
      liste: maj.map((q) => ({ id: q.id, ficheId: q.ficheId, recto: texte(q.recto), dueDateAvant: q.conversionNouvelles.dueDateAvant })),
    },
  };
}
