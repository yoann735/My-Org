/* ============================================================
   MedRevise — visibilité d'un mode du panneau latéral (v1.2, 06/10).
   Les 3 modes (Exercices · Notions · Transcript) restent MONTÉS en permanence
   pour que le glissement montre le voisin déjà rendu. Un mode hors écran doit
   rester passif : ce contexte lui dit s'il est affiché, et `useDejaVisible`
   permet de ne lancer une requête réseau qu'à sa première apparition.
   Sans fournisseur (composant utilisé ailleurs) : toujours visible.
   ============================================================ */
import { createContext, useContext, useRef } from 'react';

export const ModeVisibleCtx = createContext(true);

export function useModeVisible() { return useContext(ModeVisibleCtx); }

/* vrai dès que le mode a été affiché une fois (et le reste) */
export function useDejaVisible() {
  const visible = useContext(ModeVisibleCtx);
  const deja = useRef(false);
  if (visible) deja.current = true;
  return deja.current;
}
