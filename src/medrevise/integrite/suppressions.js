/* ============================================================
   MedRevise — SUPPRESSIONS VOLONTAIRES (31/10/2026, docs/diagnostic-elements-manquants.md).
   Le contrôle d'intégrité signalait « N cartes de moins qu'hier » pour des cartes supprimées à la
   main : remove() efface la carte et pousse une tombstone, sans laisser de trace de l'INTENTION.
   Désormais, chaque suppression faite depuis l'interface (carte, lot d'un type, cours, matière,
   dossier, corbeille, V2 du carnet) est notée AVANT la suppression dans un registre synchronisé
   (lib/storage.js#noterSuppressionsVolontaires : un enregistrement par appareil dans le store
   `prompts`, clé 'suppressionsVolontaires:<appareil>') — l'appareil qui reçoit la tombstone reçoit
   aussi le registre, et ne s'alarme pas. Toute disparition ABSENTE du registre reste une alerte.
   Ce module est PUR : il fusionne les registres de tous les appareils (+ la liste confirmée).
   ============================================================ */

/* Les 12 flashcards supprimées à la main les 26 et 28/10, avant que le registre n'existe
   (diagnostic du 31/10, confirmées par l'utilisateur le 31/10). Sans elles, l'appareil dont
   l'instantané précède ces suppressions alerterait encore une fois. Aucune donnée n'est écrite :
   la liste vit dans le code. */
export const SUPPRESSIONS_CONFIRMEES = {
  le: '2026-10-31',
  ids: [
    'qmvnusp4gy3qi',
    'qmutztmq7lmgv', 'qmutzs8fqiz4k', 'qmutzr1x123ti', 'qmutzpse1vtqt', 'qmutzof6vz4m7',
    'qmupvfj11ac4p', 'qmupsz165f0n3', 'qmupsydb4xh00', 'qmupsxulv8v3d', 'qmupsvq4je06o', 'qmupsujka8l6w',
  ],
};

/** Ensemble des ids supprimés volontairement : registres de tous les appareils + liste confirmée. */
export function idsVolontaires(registres = []) {
  const ids = new Set(SUPPRESSIONS_CONFIRMEES.ids);
  for (const r of registres || []) for (const id of Object.keys((r && r.entrees) || {})) ids.add(id);
  return ids;
}
