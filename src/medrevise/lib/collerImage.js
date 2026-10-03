/* ============================================================
   MedRevise — COLLER / DÉPOSER UNE IMAGE (03/10).

   Le mécanisme du lecteur PDF (Cmd/Ctrl+V d'une capture d'écran ou d'une image
   copiée sur le web), mis en commun pour les formulaires de flashcards :
   - `imageDuPressePapier` / `imageDuDepot` : le fichier image d'un collage / d'un
     glisser-déposer (ou null) ;
   - `useCollerImage` : le formulaire où l'on travaille PREND le collage d'une image
     (le lecteur ne la pose alors pas en plus sur la page du PDF).
   L'image obtenue est un File ordinaire : elle est stockée comme les autres
   (putBlob → blob synchronisé), rien de spécial.
   ============================================================ */
import { useEffect, useRef } from 'react';
import { cibleEditable } from './annotHistory.js';

const estImage = (f) => !!(f && /^image\//.test(f.type || ''));

/** l'image d'un collage (clipboardData), ou null. */
export function imageDuPressePapier(dt) {
  if (!dt) return null;
  const items = [...(dt.items || [])];
  const it = items.find((x) => x.kind === 'file' && /^image\//.test(x.type));
  const f = it && it.getAsFile();
  if (estImage(f)) return f;
  return [...(dt.files || [])].find(estImage) || null;
}

/** le presse-papier porte-t-il aussi du TEXTE ? (alors, dans un champ, on colle le texte) */
export function texteDuPressePapier(dt) {
  try { return !!(dt && dt.getData && dt.getData('text/plain').trim()); } catch (e) { return false; }
}

/** l'image d'un glisser-déposer (dataTransfer), ou null. */
export function imageDuDepot(dt) {
  return dt ? [...(dt.files || [])].find(estImage) || null : null;
}
/** un glisser porte-t-il des fichiers ? (pendant dragover, les fichiers ne sont pas encore lisibles) */
export const glisseDesFichiers = (dt) => !!(dt && [...(dt.types || [])].includes('Files'));

/**
 * Cmd/Ctrl+V d'une image → `surImage(fichier)`, tant que l'on travaille dans `racineRef` :
 * focus dedans, ou dernier clic dedans (focus nulle part). Dans un champ de texte, on
 * ne prend l'image que si le presse-papier n'a PAS de texte (sinon collage normal).
 * Écoute en phase de capture : passe avant le lecteur PDF, qui ignore ensuite ce collage.
 */
export function useCollerImage(racineRef, surImage) {
  const rappel = useRef(surImage); rappel.current = surImage;
  useEffect(() => {
    let dedans = true; // le formulaire vient de s'ouvrir : c'est là qu'on travaille
    const racine = () => racineRef.current;
    const appui = (e) => { const r = racine(); dedans = !!(r && r.contains(e.target)); };
    const focus = (e) => { const r = racine(); if (r && r.contains(e.target)) dedans = true; };
    const coller = (e) => {
      const r = racine();
      if (!r || e.defaultPrevented) return;
      const actif = document.activeElement;
      const focusDedans = !!(actif && r.contains(actif));
      const focusNullePart = !actif || actif === document.body || actif === document.documentElement;
      if (!focusDedans && !(dedans && focusNullePart)) return;
      const f = imageDuPressePapier(e.clipboardData);
      if (!f) return;
      if (cibleEditable(e.target) && texteDuPressePapier(e.clipboardData)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      rappel.current(f);
    };
    window.addEventListener('pointerdown', appui, true);
    window.addEventListener('focusin', focus, true);
    window.addEventListener('paste', coller, true);
    return () => {
      window.removeEventListener('pointerdown', appui, true);
      window.removeEventListener('focusin', focus, true);
      window.removeEventListener('paste', coller, true);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
