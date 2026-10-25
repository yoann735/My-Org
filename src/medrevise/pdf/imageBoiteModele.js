/* ============================================================
   MedRevise — modèle de l'IMAGE D'UNE BOÎTE (25/10, docs/compte-rendu-apprentissage-v2-recherche-tags.md §4). Pur, sans DOM.
   Champ `image` d'une boîte : { blobId, ratio (hauteur / largeur de l'image entière), position: 'dessus' | 'dessous', nom?,
   largeur? (fraction de la largeur intérieure de la boîte, 0,15 – 1 ; absente = toute la largeur, centrée),
   rognage? ({ x, y, w, h } en fractions de l'image entière — même modèle que les images collées, lib/rognageImage.js) }.
   ============================================================ */
export const LARGEUR_MIN = 0.15;
/** largeur affichée (fraction de la largeur intérieure) */
export const largeurImage = (image) => { const v = Number(image && image.largeur); return Number.isFinite(v) && v > 0 ? Math.max(LARGEUR_MIN, Math.min(1, v)) : 1; };
/** rapport hauteur / largeur de la partie VISIBLE (recadrée) */
export function ratioVisible(image) {
  const r = Number(image && image.ratio) > 0 ? Number(image.ratio) : 0.66;
  const rg = image && image.rognage;
  return rg && rg.w > 0 && rg.h > 0 ? r * (rg.h / rg.w) : r;
}
/** nouvelle largeur après un glisser de `dx` px sur une largeur intérieure de `interieur` px (bornée à la boîte) */
export const largeurApresGlisser = (depart, dx, interieur, cote = 1) => +Math.max(LARGEUR_MIN, Math.min(1, depart + (cote * 2 * dx) / Math.max(1, interieur))).toFixed(4);
