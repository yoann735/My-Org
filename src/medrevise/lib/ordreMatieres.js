/* MedRevise — ORDRE DES MATIÈRES (26/10, docs/compte-rendu-nettoyage-v2.md §7). Pur. Le glisser-déposer de la Bibliothèque
   pose un champ `ordre` (en ajout) sur les matières d'une section ; sans lui, l'ordre de la base (celui d'avant). */
export function trierMatieres(mats) {
  return (mats || []).map((m, i) => ({ m, i })).sort((a, b) => ((a.m.ordre ?? a.i) - (b.m.ordre ?? b.i)) || (a.i - b.i)).map((x) => x.m);
}
