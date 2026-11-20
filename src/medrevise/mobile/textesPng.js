/* ============================================================
   MedRevise — ZONES DE TEXTE DANS LE PNG d'un dessin (20/11,
   docs/compte-rendu-export-png-et-retour-transcription.md).

   L'export « vers un cours » ne met PAS les zones de texte dans l'image : elles
   voyagent à part et deviennent des textes libres éditables sur l'ordi. Un PNG
   enregistré sur le téléphone, lui, doit contenir TOUT le dessin : ces zones y sont
   peintes par-dessus l'image du même rendu (svgExport → svgVersPng).

   Mesure, pas réimplémentation : chaque mot est mesuré dans une COPIE de la couche
   affichée (Range.getClientRects : retour à la ligne, gras, italique, taille, alignement
   exacts), copie posée sans caméra (ni zoom ni déplacement) dans un conteneur invisible :
   un px mesuré = un px du dessin. Puis peint avec fillText.
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
  /* (20/11 soir) MESURE SUR UNE COPIE SANS CAMÉRA : sur iPhone, les mots du texte coloré manquaient dans le PNG
     alors que le même chemin marche dans Chrome et Safari macOS. La couche affichée est déplacée et zoomée par la
     caméra (transform) ; mesurer les mots DEDANS faisait dépendre les positions de ce zoom et de la façon dont
     WebKit iOS rend les rectangles d'une plage de texte transformée. La couche est donc COPIÉE, sans transform, dans
     un conteneur invisible en (0, 0) : un px mesuré = un px du dessin, quel que soit le zoom à l'écran. */
  const boite = document.createElement('div');
  boite.setAttribute('aria-hidden', 'true');
  boite.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;overflow:visible;opacity:0;pointer-events:none;z-index:-1;contain:none';
  const copie = couche.cloneNode(true);
  copie.style.transform = 'none';
  copie.style.left = '0px'; copie.style.top = '0px';
  boite.appendChild(copie);
  document.body.appendChild(boite);
  try {
    const origine = copie.getBoundingClientRect();
    for (const zone of copie.querySelectorAll(':scope > .md-zone[data-id]')) {
      if (zone.classList.contains('cachee') || zone.classList.contains('md-editeur')) continue;
      const avant = mots.length;
      const csZone = getComputedStyle(zone);
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
          const rects = [...r.getClientRects()].filter((q) => q.width > 0);
          if (!rects.length) return false;
          // un mot = une boîte ; s'il en rend plusieurs (WebKit en ajoute parfois une vide en fin de ligne), la plus large
          const q = rects.length === 1 ? rects[0] : rects.reduce((m, x) => (x.width > m.width ? x : m));
          if (rects.length > 1 && rects.filter((x) => x.width > 1).length > 1) return false; // vraiment coupé sur 2 lignes
          mots.push({ ...base, t: txt.slice(debut, fin), x: q.left - origine.left - ox, y: q.top - origine.top - oy, w: q.width, h: q.height });
          return true;
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
      // FILET : aucune boîte mesurée pour une zone qui a du texte → ses lignes, à sa place, dans sa couleur
      if (mots.length === avant && (zone.innerText || zone.textContent || '').trim()) {
        const taille = parseFloat(csZone.fontSize) || 18, interligne = taille * 1.3;
        const { hex, alpha } = couleurCss(csZone.color);
        const police = `${csZone.fontStyle} ${csZone.fontWeight} ${taille}px ${csZone.fontFamily}`;
        (zone.innerText || zone.textContent).split('\n').forEach((ligne, i) => {
          if (!ligne.trim()) return;
          mots.push({ t: ligne, x: zone.offsetLeft + 6 - ox, y: zone.offsetTop + 4 + i * interligne - oy, w: ligne.length * taille * 0.5, h: interligne,
            police, taille, couleur: encre(hex), alpha, souligne: false });
        });
      }
    }
  } finally { boite.remove(); }
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
