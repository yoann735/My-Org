/* ============================================================
   MedRevise — « Afficher l'onglet Réviser sur ordinateur » (26/10, docs/compte-rendu-nettoyage-v2.md §5).
   Réglage d'APPAREIL (localStorage, non synchronisé, comme l'ancienne bascule d'interface) : ON par défaut. OFF :
   l'onglet Réviser disparaît de la barre latérale de l'ordinateur seulement ; le téléphone (shell mobile) et la
   tablette (écran tactile, barre du bas) le gardent toujours. Un stockage illisible = ON (rien ne disparaît par erreur).
   ============================================================ */
import { useEffect, useState } from 'react';

export const CLE_ONGLET_REVISER = 'medrevise.onglet.reviser.ordinateur';
const EVT = 'medrevise:onglet-reviser';

export function ongletReviserOrdinateur() {
  try { return JSON.parse(localStorage.getItem(CLE_ONGLET_REVISER)) !== false; } catch (e) { return true; }
}
export function setOngletReviserOrdinateur(on) {
  try { localStorage.setItem(CLE_ONGLET_REVISER, JSON.stringify(!!on)); } catch (e) { /* stockage indisponible */ }
  try { window.dispatchEvent(new CustomEvent(EVT)); } catch (e) { /* ignore */ }
  return !!on;
}
/** l'appareil est-il une tablette / un écran tactile ? (l'onglet y reste toujours) */
export const ecranTactile = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

/** l'onglet Réviser est-il affiché dans la barre latérale ? (suivi en direct) */
export function useOngletReviserVisible() {
  const lire = () => ongletReviserOrdinateur() || ecranTactile();
  const [v, setV] = useState(lire);
  useEffect(() => {
    const maj = () => setV(lire());
    window.addEventListener(EVT, maj); window.addEventListener('storage', maj);
    const mq = window.matchMedia ? window.matchMedia('(pointer: coarse)') : null;
    if (mq && mq.addEventListener) mq.addEventListener('change', maj);
    return () => { window.removeEventListener(EVT, maj); window.removeEventListener('storage', maj); if (mq && mq.removeEventListener) mq.removeEventListener('change', maj); };
  }, []);
  return v;
}
