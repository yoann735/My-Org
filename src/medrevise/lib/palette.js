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

/* COULEURS DU THÈME (20/10, docs/compte-rendu-pdfreader-v3.md) : la grille du sélecteur « façon Word ».
   10 teintes de la DA en colonnes — l'encre et le gris des textes, les 6 couleurs de base (avec leur id :
   ambre reste « prioritaire », rose poudré « cloze »), l'indigo de l'accent (design.css --accent) et une
   sarcelle — chacune avec 5 variantes en dessous, comme Word : plus claire 80 / 60 / 40 %, plus foncée 25 / 50 %. */
export const COULEURS_THEME = [
  { id: null, hex: '#2B2B33', label: 'Encre' },
  { id: null, hex: '#8A8F98', label: 'Gris' },
  ...['ambre', 'corail', 'poudre', 'violet'].map((id) => PALETTE_BASE.find((c) => c.id === id)),
  { id: null, hex: '#7C6FE0', label: 'Indigo' },
  PALETTE_BASE.find((c) => c.id === 'ardoise'),
  { id: null, hex: '#3FAFBF', label: 'Sarcelle' },
  PALETTE_BASE.find((c) => c.id === 'sauge'),
];
export const NUANCES_THEME = [
  { t: 0, label: '' },
  { t: 0.8, label: 'plus claire 80 %' }, { t: 0.6, label: 'plus claire 60 %' }, { t: 0.4, label: 'plus claire 40 %' },
  { t: -0.25, label: 'plus foncée 25 %' }, { t: -0.5, label: 'plus foncée 50 %' },
];
/** nuance d'un hex : t > 0 éclaircit (mélange avec le blanc), t < 0 fonce (mélange avec le noir) */
export function nuance(hex, t) {
  const n = parseInt(hexPalette(hex).slice(1), 16);
  const f = (c) => Math.round(t >= 0 ? c + (255 - c) * t : c * (1 + t));
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, '0')).join('');
}
/** la grille : lignes × colonnes de { valeur (id de base ou hex), hex, label } */
export function grilleTheme() {
  return NUANCES_THEME.map(({ t, label }) => COULEURS_THEME.map((c) => (t === 0
    ? { valeur: c.id || c.hex.toLowerCase(), hex: c.hex, label: c.label }
    : { valeur: nuance(c.hex, t), hex: nuance(c.hex, t), label: `${c.label}, ${label}` })));
}
