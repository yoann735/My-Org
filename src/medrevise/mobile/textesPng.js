/* ============================================================
   MedRevise — ZONES DE TEXTE DANS LE PNG d'un dessin (20/11,
   docs/compte-rendu-export-png-et-retour-transcription.md).

   L'export « vers un cours » ne met PAS les zones de texte dans l'image : elles
   voyagent à part et deviennent des textes libres éditables sur l'ordi. Un PNG
   enregistré sur le téléphone, lui, doit contenir TOUT le dessin : ces zones y sont
   peintes par-dessus l'image du même rendu (svgExport → svgVersPng).

   Mesure, pas réimplémentation : chaque mot est mesuré dans le DOM affiché
   (Range.getClientRects : retour à la ligne, gras, italique, taille, alignement
   exacts), ramené en coordonnées du dessin (la couche est transformée par la
   caméra : on divise par l'échelle réelle de la zone), puis peint avec fillText.
   Pas de <foreignObject> : Safari « teinte » le canvas et le PNG deviendrait illisible.
   ============================================================ */

/** couleur CSS calculée (rgb/rgba) → { hex, alpha }. */
export function couleurCss(c) {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?/.exec(c || '');
  if (!m) return { hex: c || '#000000', alpha: 1 };
  const hex = '#' + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('');
  let alpha = 1;
  if (m[4] != null) alpha = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return { hex, alpha: Number.isFinite(alpha) ? alpha : 1 };
}

const souligne = (el, zone) => {
  for (let n = el; n; n = n.parentElement) {
    const d = getComputedStyle(n).textDecorationLine || '';
    if (d.includes('underline')) return true;
    if (n === zone) break;
  }
  return false;
};

/**
 * Relevé des mots des zones de texte affichées, en px du dessin, relatifs à l'origine
 * de l'image exportée (`ox`, `oy` = position monde du coin haut-gauche de l'image).
 * @param {HTMLElement} couche  la couche HTML des zones (`.md-couche`)
 * @param {(hex: string) => string} encre  conversion de couleur pour le fond choisi
 * @returns {Array<{ t, x, y, w, h, police, taille, couleur, alpha, souligne }>}
 */
export function releverTextes(couche, { ox, oy, encre }) {
  const mots = [];
  if (!couche) return mots;
  for (const zone of couche.querySelectorAll(':scope > .md-zone[data-id]')) {
    if (zone.classList.contains('cachee') || zone.classList.contains('md-editeur')) continue;
    const zr = zone.getBoundingClientRect();
    const k = zone.offsetWidth ? zr.width / zone.offsetWidth : 0;
    if (!k) continue;
    const zx = zone.offsetLeft - ox, zy = zone.offsetTop - oy;
    const parcours = document.createTreeWalker(zone, NodeFilter.SHOW_TEXT);
    for (let n = parcours.nextNode(); n; n = parcours.nextNode()) {
      const txt = n.nodeValue || '';
      if (!txt.trim() || !n.parentElement) continue;
      const cs = getComputedStyle(n.parentElement);
      const taille = parseFloat(cs.fontSize) || 18;
      const police = `${cs.fontStyle} ${cs.fontWeight} ${taille}px ${cs.fontFamily}`;
      const { hex, alpha } = couleurCss(cs.color);
      const base = { police, taille, couleur: encre(hex), alpha, souligne: souligne(n.parentElement, zone) };
      const r = document.createRange();
      const pousser = (debut, fin) => {
        r.setStart(n, debut); r.setEnd(n, fin);
        const rects = [...r.getClientRects()].filter((q) => q.width > 0 || q.height > 0);
        if (rects.length === 1) {
          const q = rects[0];
          mots.push({ ...base, t: txt.slice(debut, fin), x: zx + (q.left - zr.left) / k, y: zy + (q.top - zr.top) / k, w: q.width / k, h: q.height / k });
          return true;
        }
        return false;
      };
      // mot par mot ; un mot coupé sur deux lignes (overflow-wrap) : lettre par lettre
      const re = /\S+/g;
      let m;
      while ((m = re.exec(txt))) {
        if (pousser(m.index, m.index + m[0].length)) continue;
        for (let i = m.index; i < m.index + m[0].length;) {
          const cp = txt.codePointAt(i), l = cp > 0xffff ? 2 : 1;
          pousser(i, i + l);
          i += l;
        }
      }
    }
  }
  return mots;
}

/** peint les mots relevés dans un contexte 2D déjà à l'échelle de l'image (px du dessin × k). */
export function peindreTextes(g, mots, k) {
  if (!mots.length) return;
  g.save();
  g.scale(k, k);
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  for (const w of mots) {
    g.font = w.police;
    g.fillStyle = w.couleur;
    g.globalAlpha = w.alpha;
    const mt = g.measureText(w.t);
    const asc = Number.isFinite(mt.fontBoundingBoxAscent) ? mt.fontBoundingBoxAscent : w.taille * 0.9;
    const desc = Number.isFinite(mt.fontBoundingBoxDescent) ? mt.fontBoundingBoxDescent : w.taille * 0.22;
    const ligne = w.y + (w.h - (asc + desc)) / 2 + asc; // ligne de base, centrée dans la boîte du mot
    g.fillText(w.t, w.x, ligne);
    if (w.souligne) {
      const ep = Math.max(1, w.taille / 15);
      g.fillRect(w.x, ligne + w.taille * 0.11, w.w, ep);
    }
  }
  g.restore();
}
