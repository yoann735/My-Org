/* ============================================================
   MealWeek — copie de la liste de courses dans le presse-papier

   Format volontairement brut, une ligne par produit :
       Produit exact x quantité
   Directement collable dans une tâche externe (Rappels, Notes, Todoist…).

   Le nom et la quantité sortent tels quels des données de la semaine :
   rien n'est recalculé ici.
   ============================================================ */

/** @param {Array} rows lignes de courses déjà filtrées par l'appelant */
export function formatShoppingList(rows = []) {
  return rows
    .map((r) => `${r.name} x ${r.nbPaquets != null ? r.nbPaquets : 1}`)
    .join('\n');
}

/**
 * Écrit `texte` dans le presse-papier. L'API Clipboard n'existe qu'en
 * contexte sécurisé (https / localhost) : on garde un repli execCommand
 * pour ne jamais laisser l'utilisateur sans rien.
 * @returns {Promise<boolean>} vrai si la copie a abouti
 */
export async function copyText(texte) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texte);
      return true;
    }
  } catch (e) { /* on tente le repli */ }

  try {
    const ta = document.createElement('textarea');
    ta.value = texte;
    ta.setAttribute('readonly', '');
    // hors écran mais focusable : Safari refuse de copier un champ caché
    ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, texte.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) {
    return false;
  }
}
