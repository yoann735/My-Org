/* ============================================================
   MealWeek — plomberie commune aux exports CSV
   Échappement, sérialisation, nom de fichier daté et remise du
   fichier à l'utilisateur (téléchargement natif, ou feuille de
   partage iOS). Partagé par l'export recettes et l'export
   ingrédients pour qu'ils se comportent EXACTEMENT pareil,
   notamment sur mobile où le geste fiable diffère.
   ============================================================ */

/** échappement CSV : guillemets si virgule, guillemet, saut de ligne ou
    espaces de bord — les guillemets internes sont doublés. */
export function cell(v) {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) || s !== s.trim() ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** nombre → texte à point décimal (le séparateur du CSV est la virgule). */
export function num(v) {
  return v == null || v === '' || Number.isNaN(Number(v)) ? '' : String(v);
}

/** Sérialise les lignes. BOM en tête pour qu'Excel lise l'UTF-8 sans réglage. */
export function serializeCsv(rows) {
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** mealweek_<sujet>_complet_2026-08-31.csv */
export function csvFilenameFor(sujet, date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const jour = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  return `mealweek_${sujet}_complet_${jour}.csv`;
}

/* iOS / iPadOS uniquement : là-bas les vieux Safari OUVRENT le fichier d'un
   `<a download>` dans un onglet au lieu de l'enregistrer, la feuille de
   partage est le geste fiable. Ailleurs (Chrome, Safari desktop) `share` +
   `canShare({files})` répondent « oui » aussi : s'y fier détournerait un
   simple téléchargement vers une feuille de partage inattendue. */
function preferePartage() {
  if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Remet le texte CSV à l'utilisateur sous le nom donné. Le repli va toujours
 * du partage vers le téléchargement — jamais l'utilisateur sans fichier.
 * @returns {Promise<'partage'|'telechargement'|'annule'>}
 */
export async function remettreCsv(texte, nom) {
  const blob = new Blob([texte], { type: 'text/csv;charset=utf-8' });

  if (preferePartage()) {
    try {
      const file = new File([blob], nom, { type: 'text/csv' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: nom });
        return 'partage';
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return 'annule';
      // NotAllowedError / partage de fichiers refusé : on télécharge.
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // révocation différée : Safari lit l'URL APRÈS le retour du click().
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'telechargement';
}
