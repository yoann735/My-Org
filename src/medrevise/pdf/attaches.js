/* ============================================================
   MedRevise — TEXTES ATTACHÉS À UNE IMAGE (02/10 nuit).

   Les zones de texte d'un dessin du téléphone deviennent, à la pose, des textes
   libres ÉDITABLES portant `imageId` : ils font corps avec l'image. Quand l'image
   est déplacée, redimensionnée ou pivotée, chaque texte garde sa position RELATIVE
   à l'image — celle du moment du geste : un texte déplacé à la main suit ensuite
   depuis sa nouvelle place.

   Calcul en unités de page « réelles » (le rapport hauteur/largeur de la page
   compte : une rotation se fait en vraies proportions), autour du CENTRE de l'image.
   ============================================================ */

const rad = (d) => ((d || 0) * Math.PI) / 180;

/**
 * Nouvelle place d'un texte attaché quand son image passe de `avant` à `apres`.
 * @param {{x,y,width,height,rotation?}} avant, apres  géométrie de l'image (fractions de page)
 * @param {{x,y,width}} t                                texte (coin haut-gauche, fractions)
 * @param {number} ratio                                 hauteur / largeur de la page
 */
export function suivreImage(avant, apres, t, ratio = 1.414) {
  const cxA = avant.x + avant.width / 2, cyA = avant.y + avant.height / 2;
  const cxB = apres.x + apres.width / 2, cyB = apres.y + apres.height / 2;
  // vecteur centre → texte, en unités où x et y ont la même échelle
  let vx = t.x - cxA, vy = (t.y - cyA) * ratio;
  // dans le repère de l'image d'avant (rotation annulée)
  const a = -rad(avant.rotation), ca = Math.cos(a), sa = Math.sin(a);
  [vx, vy] = [vx * ca - vy * sa, vx * sa + vy * ca];
  // mise à l'échelle de l'image
  const kx = avant.width ? apres.width / avant.width : 1, ky = avant.height ? apres.height / avant.height : 1;
  vx *= kx; vy *= ky;
  // rotation d'après
  const b = rad(apres.rotation), cb = Math.cos(b), sb = Math.sin(b);
  [vx, vy] = [vx * cb - vy * sb, vx * sb + vy * cb];
  return {
    x: cxB + vx,
    y: cyB + vy / ratio,
    width: t.width ? Math.max(0.03, t.width * kx) : t.width,
  };
}
