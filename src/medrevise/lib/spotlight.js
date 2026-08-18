/* ============================================================
   MedRevise — halo de bordure qui suit le curseur (ÉTAPE 3).

   Porté depuis la maquette Claude Design (templates/motion-lab, `.mi-border`
   et son handler `track`). Le JS ne fait qu'écrire trois variables CSS sur
   l'élément survolé ; tout le rendu est dans la feuille de style :
     --mx / --my : position du curseur DANS l'élément (le centre du dégradé
                   radial s'y place, d'où un halo qui suit le contour en
                   continu, sans jamais sauter d'un bord à l'autre) ;
     --gop       : opacité, croissante à mesure qu'on approche du bord.

   ÉCART DE PERFORMANCE ASSUMÉ avec la maquette : elle boucle sur TOUTES les
   cartes à chaque frame en appelant getBoundingClientRect() sur chacune —
   soit un reflow forcé par carte et par frame. Ici, elementFromPoint donne
   directement l'élément sous le curseur : une seule mesure par frame, quel
   que soit le nombre de cartes. Rendu identique, coût constant.
   ============================================================ */

const SEL = '.card, .today-cta, .cel-trend';

export function initSpotlight(root) {
  if (!root) return () => {};
  // Respecte le réglage système : pas de halo si l'utilisateur a demandé
  // moins d'animation.
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};

  let raf = 0;
  let px = 0, py = 0;
  let lit = null;

  const eteindre = () => {
    if (!lit) return;
    lit.style.setProperty('--gop', '0');
    lit = null;
  };

  const frame = () => {
    raf = 0;
    const sous = document.elementFromPoint(px, py);
    const cible = sous && sous.closest ? sous.closest(SEL) : null;
    // hors du sous-arbre MedRevise (ex. une surface en portail), on éteint
    const valide = cible && root.contains(cible) ? cible : null;
    if (valide !== lit) eteindre();
    if (!valide) return;
    lit = valide;
    const r = valide.getBoundingClientRect();
    if (!r.width || !r.height) return;
    // proximité du bord : 0 au centre, 1 sur le contour
    const nx = (px - (r.left + r.right) / 2) / (r.width / 2);
    const ny = (py - (r.top + r.bottom) / 2) / (r.height / 2);
    const k = Math.min(1, Math.max(Math.abs(nx), Math.abs(ny)));
    valide.style.setProperty('--gop', (0.2 + 0.78 * Math.pow(k, 1.3)).toFixed(3));
    valide.style.setProperty('--mx', (px - r.left).toFixed(1) + 'px');
    valide.style.setProperty('--my', (py - r.top).toFixed(1) + 'px');
  };

  const onMove = (e) => {
    px = e.clientX; py = e.clientY;
    if (!raf) raf = requestAnimationFrame(frame);
  };
  const onOut = (e) => { if (!e.relatedTarget) eteindre(); };

  document.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerout', onOut, { passive: true });
  window.addEventListener('blur', eteindre);

  return () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerout', onOut);
    window.removeEventListener('blur', eteindre);
    if (raf) cancelAnimationFrame(raf);
    eteindre();
  };
}
