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

/* PALETTE VIVE DU DOCK (20/10 soir, docs/compte-rendu-pdfreader-v4.md) — remplace les six teintes pastel dans
   TOUS les sélecteurs : 12 couleurs franches et standard, dans l'ordre arc-en-ciel, puis noir, gris, blanc.
   Rien n'est converti : les ids déjà posés (ambre, corail…, jaune, vert…, rouge, bleufonce…) gardent leur rendu.
   Quand la teinte d'un id existant était déjà franche et lisible, il est REPRIS (rouge, vertfonce, bleufonce, marron,
   noir, gris, blanc) ; les autres sont nouveaux (orange-vif, jaune-vif, cyan, violet-vif, magenta) — les ids `jaune`,
   `violet`, `rose` désignent des pastels d'avant et ne changent pas. Sens : jaune vif = prioritaire, magenta =
   cloze. Variante surligneur : 40 % d'opacité. Contrastes (WCAG) dans le compte rendu. */
export const PALETTE_VIVE = [
  { id: 'rouge', hex: '#E5383B', label: 'Rouge' },
  { id: 'orange-vif', hex: '#EA6C0A', label: 'Orange' }, // (l'ancien « orange » #F28C28 du crayon : 2,45:1 sur blanc, gardé pour ce qui est posé)
  { id: 'jaune-vif', hex: '#FFC400', label: 'Jaune', sens: 'prioritaire' },
  { id: 'vertfonce', hex: '#1E9E5A', label: 'Vert' },
  { id: 'cyan', hex: '#0E9FBE', label: 'Cyan' },
  { id: 'bleufonce', hex: '#2563EB', label: 'Bleu' },
  { id: 'violet-vif', hex: '#7C3AED', label: 'Violet' },
  { id: 'magenta', hex: '#DB2777', label: 'Magenta', sens: 'cloze' },
  { id: 'marron', hex: '#8B5A2B', label: 'Marron' },
  { id: 'noir', hex: '#1F1F24', label: 'Noir' },
  { id: 'gris', hex: '#7A7A85', label: 'Gris' },
  { id: 'blanc', hex: '#FFFFFF', label: 'Blanc' },
];
export const ALPHA_SURLIGNEUR_VIVE = 0.4;
/* DOCK DE COULEURS (21/10, docs/compte-rendu-pdfreader-reparation.md) — le même pour TOUS les outils : 7 couleurs de
   base franches (saturation 100 %, plus vives que la palette du 20/10), puis noir et blanc, puis « + » (sélecteur
   complet) et jusqu'à 3 favoris personnalisés. Nouveaux ids : rien n'est converti, les annotations déjà posées
   (palette vive, teintes du 09/10, couleurs d'avant) gardent exactement leur teinte. Sens : jaune = prioritaire,
   rose = cloze. Variante surligneur : 40 %. */
export const PALETTE_DOCK = [
  { id: 'rouge-franc', hex: '#FF1F2D', label: 'Rouge' },
  { id: 'orange-franc', hex: '#FF7A00', label: 'Orange' },
  { id: 'jaune-franc', hex: '#FFD500', label: 'Jaune', sens: 'prioritaire' },
  { id: 'vert-franc', hex: '#00C853', label: 'Vert' },
  { id: 'bleu-franc', hex: '#0A64FF', label: 'Bleu' },
  { id: 'violet-franc', hex: '#8A2BFF', label: 'Violet' },
  { id: 'rose-franc', hex: '#FF2D95', label: 'Rose', sens: 'cloze' },
];
/** les deux neutres du dock, après le séparateur (ids repris de la palette vive) */
export const NEUTRES_DOCK = ['noir', 'blanc'].map((id) => PALETTE_VIVE.find((c) => c.id === id));
export const COULEUR_DEFAUT = 'jaune-franc';
/** une couleur de la palette vive (ou du dock) ? */
export const estCouleurVive = (c) => PALETTE_VIVE.some((x) => x.id === c) || PALETTE_DOCK.some((x) => x.id === c);
/** opacité de la variante surligneur : 40 % (palette vive), 42 % (les six teintes du 09/10, inchangées) */
export const alphaSurligneur = (c) => (estCouleurVive(c) ? ALPHA_SURLIGNEUR_VIVE : ALPHA_SURLIGNEUR);

const HEX = { ...COULEURS_HISTORIQUES, ...Object.fromEntries(PALETTE_BASE.map((c) => [c.id, c.hex])), ...Object.fromEntries(PALETTE_VIVE.map((c) => [c.id, c.hex])), ...Object.fromEntries(PALETTE_DOCK.map((c) => [c.id, c.hex])) };
/** hex d'un id de palette (nouveau ou ancien) ou d'un hex libre ; `repli` sinon */
export function hexPalette(c, repli = '#F5A524') {
  if (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) return c;
  return HEX[c] || repli;
}
/** variante « surligneur » : rgba semi-transparent */
export function surligneurPalette(c, a = alphaSurligneur(c)) {
  const n = parseInt(hexPalette(c).slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
/** sens d'une couleur pour les exports de cours : 'jaune' (prioritaire), 'rose' (cloze) ou l'id */
export function sensCouleur(c) {
  const p = PALETTE_BASE.find((x) => x.id === c) || PALETTE_VIVE.find((x) => x.id === c) || PALETTE_DOCK.find((x) => x.id === c);
  if (p && p.sens === 'prioritaire') return 'jaune';
  if (p && p.sens === 'cloze') return 'rose';
  return c;
}

/* COULEURS DU THÈME (20/10, refait le 20/10 soir) : la grille du sélecteur « façon Word » — les 10 teintes
   chromatiques et neutres de la palette vive en colonnes (noir, gris, rouge, orange, jaune, vert, cyan, bleu,
   violet, magenta ; le marron et le blanc restent dans la rangée), avec leur id, et 5 variantes en dessous
   comme Word : plus claire 80 / 60 / 40 %, plus foncée 25 / 50 %. */
export const COULEURS_THEME = ['noir', 'gris', 'rouge', 'orange-vif', 'jaune-vif', 'vertfonce', 'cyan', 'bleufonce', 'violet-vif', 'magenta']
  .map((id) => PALETTE_VIVE.find((c) => c.id === id));
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
