/* ============================================================
   MedRevise — auto-save du HTML de cours (vue "Voir le cours", PdfReader).
   Portage EXACT de serialize() (gabarit-fiche.html, script inline du gabarit
   HTML autonome — même fonction que son bouton "Enregistrer") : même nettoyage
   (retire .tick/.dropline transitoires, réinitialise la sélection/le drag des
   figures, cache la barre de figure, vide le toast, repasse en mode édition),
   juste paramétré sur le document de l'iframe au lieu du document courant.
   Ne pas faire diverger cette logique de l'originale sans mettre à jour les
   deux (le gabarit reste un fichier HTML autonome, sans dépendance JS externe).
   ============================================================ */

/** @param {Document} iframeDoc — le document de l'iframe (gabarit HTML) */
export function serializeCourseHtml(iframeDoc) {
  const clone = iframeDoc.documentElement.cloneNode(true);
  clone.querySelectorAll('.tick, .dropline').forEach((n) => n.remove());
  clone.querySelectorAll('figure').forEach((f) => f.classList.remove('sel', 'dragging'));
  const fb = clone.querySelector('#figbar'); if (fb) fb.style.display = 'none';
  const t = clone.querySelector('#toast'); if (t) { t.className = 'toast'; t.textContent = ''; }
  const b = clone.querySelector('body'); if (b) b.classList.remove('reading');
  const d = clone.querySelector('#doc'); if (d) d.setAttribute('contenteditable', 'true');
  const m = clone.querySelector('#btnMode'); if (m) m.textContent = 'Mode lecture';
  return '<!DOCTYPE html>\n' + clone.outerHTML;
}
