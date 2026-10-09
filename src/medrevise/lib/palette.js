/* ============================================================
   MedRevise — PALETTE DES ANNOTATIONS (09/10, docs/compte-rendu-pdfreader-v2.md).

   Module SANS dépendance (ni pdf.js ni pdf-lib) : lu par le lecteur, l'éditeur de document,
   la vue image (Texte en direct) et l'export. Les mêmes valeurs existent en variables CSS
   dans styles/pdfreader-v2.css (--annot-<id>, --annot-<id>-hl).

   Six couleurs de base, inspirées des palettes d'Apple Notes et de Linear : des teintes de
   luminance moyenne, lisibles sur une page BLANCHE comme sur le fond NOIR d'un document.
   Chacune a une variante « surligneur » semi-transparente.

   Les anciennes couleurs (jaune, vert, bleu, rose — ids d'avant le 09/10) restent
   reconnues et rendues EXACTEMENT comme avant : aucune annotation n'est convertie.
   Sens hérité : ambre = « prioritaire » (comme jaune), rose poudré = « cloze » (comme rose).
   ============================================================ */
export const PALETTE_BASE = [
  { id: 'ambre', hex: '#F5A524', label: 'Ambre', sens: 'prioritaire' },
  { id: 'corail', hex: '#F2706A', label: 'Corail' },
  { id: 'violet', hex: '#9B8AFB', label: 'Violet doux' },
  { id: 'ardoise', hex: '#5E8BEA', label: 'Bleu ardoise' },
  { id: 'sauge', hex: '#5DBB8A', label: 'Vert sauge' },
  { id: 'poudre', hex: '#EE8FC0', label: 'Rose poudré', sens: 'cloze' },
];
/** opacité de la variante « surligneur » (sur le blanc : teinte nette, texte noir lisible) */
export const ALPHA_SURLIGNEUR = 0.42;
/** couleurs d'avant le 09/10 : gardées pour le rendu des annotations existantes */
export const COULEURS_HISTORIQUES = { jaune: '#FFD84D', vert: '#8BE38B', bleu: '#7EC8FF', rose: '#FF9FD1' };
export const COULEUR_DEFAUT = 'ambre';

const HEX = { ...COULEURS_HISTORIQUES, ...Object.fromEntries(PALETTE_BASE.map((c) => [c.id, c.hex])) };
/** hex d'un id de palette (nouveau ou ancien) ou d'un hex libre ; `repli` sinon */
export function hexPalette(c, repli = '#F5A524') {
  if (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) return c;
  return HEX[c] || repli;
}
/** variante « surligneur » : rgba semi-transparent */
export function surligneurPalette(c, a = ALPHA_SURLIGNEUR) {
  const n = parseInt(hexPalette(c).slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
/** sens d'une couleur pour les exports de cours : 'jaune' (prioritaire), 'rose' (cloze) ou l'id */
export function sensCouleur(c) {
  const p = PALETTE_BASE.find((x) => x.id === c);
  if (p && p.sens === 'prioritaire') return 'jaune';
  if (p && p.sens === 'cloze') return 'rose';
  return c;
}
