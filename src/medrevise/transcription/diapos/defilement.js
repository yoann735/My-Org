/* ============================================================
   MedRevise — « FAIRE DÉFILER JUSQU'À LA DIAPO DÉTECTÉE » (26/11/2026,
   docs/compte-rendu-suivi-diapos-continu-et-defilement.md).

   Option du panneau Transcript (à côté de « Suivre les diapos automatiquement »), active par
   défaut, mémorisée sur l'appareil. Quand le suivi reconnaît une NOUVELLE diapo, elle devient la
   « cible » du lecteur du cours transcrit :
   - le lecteur de ce cours est à l'écran (onglet visible, document original affiché) → il défile
     jusqu'à la page (défilement doux ≈ 200 ms, par SA fonction allerALaPage), puis la cible est
     consommée : entre deux changements, l'élève fait défiler librement sans être ramené ;
   - ailleurs (autre document, autre écran, autre onglet, fenêtre réduite) → rien ne bouge, la cible
     attend ; au retour sur le document du cours, il s'ouvre directement à la dernière diapo détectée ;
   - dessin, écriture dans une boîte ou sélection de texte en cours → attend la fin du geste.
   Option coupée = aucune cible, comportement d'avant strictement identique.
   ============================================================ */
const CLE = 'medrevise.transcription.defilerDiapos'; // '0' = désactivé ; actif par défaut

export const defilementVoulu = () => { try { return localStorage.getItem(CLE) !== '0'; } catch (e) { return true; } };

let etat = { actif: defilementVoulu(), cible: null }; // cible : { courseId, page, pageCle, n }
const abonnes = new Set();
const publier = (p) => { etat = { ...etat, ...p }; abonnes.forEach((f) => f(etat)); };
export const lireDefilement = () => etat;
export function abonnerDefilement(f) { abonnes.add(f); return () => abonnes.delete(f); }

/** interrupteur « Faire défiler jusqu'à la diapo détectée » */
export function activerDefilement(on) {
  try { localStorage.setItem(CLE, on ? '1' : '0'); } catch (e) { /* bloqué */ }
  publier({ actif: !!on, cible: null });
}

/** une nouvelle diapo reconnue (suivi.js) */
export function signalerDiapo({ courseId, page, pageCle, n }) {
  if (!etat.actif) return;
  publier({ cible: { courseId, page, pageCle, n } });
}

/** le lecteur du cours a défilé jusqu'à la cible (ou s'y est ouvert) : elle est consommée */
export function consommerCible(n) {
  if (etat.cible && etat.cible.n === n) publier({ cible: null });
}

/** fin de session : plus de cible */
export function oublierCible() { if (etat.cible) publier({ cible: null }); }
