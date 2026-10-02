/* ============================================================
   MedRevise — HTML d'une zone de texte du téléphone → document TipTap d'un texte
   libre du lecteur (02/10 nuit). Le HTML est déjà nettoyé (mobile/zonesTexte.js).

   - un paragraphe par ligne (<div>, <p>, <br>) ;
   - <b>/<strong> → bold, <i>/<em> → italic, <u> → underline ;
   - <span style="font-size / color"> → textStyle { fontSize, color } ;
   - le style de LA ZONE ENTIÈRE (taille de base, gras, italique, souligné, alignement)
     s'applique à tout le texte ; un morceau plus précis l'emporte.
   `k` convertit les px du téléphone en px du lecteur (zoom de référence).
   ============================================================ */

/**
 * @param {string} html
 * @param {{ k: number, taille: number, gras?: boolean, italique?: boolean, souligne?: boolean, align?: string }} base
 *   `taille` : taille de base en px du LECTEUR ; `k` : facteur px téléphone → px lecteur
 */
export function htmlVersTiptap(html, base) {
  const paragraphes = [[]];
  let doc;
  try { doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html'); } catch (e) { doc = null; }
  const px = (v) => `${Math.max(6, Math.min(96, Math.round(v)))}px`;
  const marche = (n, st) => {
    if (n.nodeType === 3) {
      const texte = n.nodeValue.replace(/ /g, ' ');
      if (!texte) return;
      const marks = [];
      if (st.gras) marks.push({ type: 'bold' });
      if (st.italique) marks.push({ type: 'italic' });
      if (st.souligne) marks.push({ type: 'underline' });
      const attrs = { fontSize: px(st.taille) };
      if (st.couleur) attrs.color = st.couleur;
      marks.push({ type: 'textStyle', attrs });
      paragraphes[paragraphes.length - 1].push({ type: 'text', text: texte, marks });
      return;
    }
    if (n.nodeType !== 1) return;
    const tag = n.tagName;
    if (tag === 'BR') { paragraphes.push([]); return; }
    const bloc = tag === 'DIV' || tag === 'P';
    if (bloc && paragraphes[paragraphes.length - 1].length) paragraphes.push([]);
    const s = { ...st };
    if (tag === 'B' || tag === 'STRONG') s.gras = true;
    if (tag === 'I' || tag === 'EM') s.italique = true;
    if (tag === 'U') s.souligne = true;
    if (tag === 'SPAN') {
      const fs = parseFloat(n.style.fontSize); if (fs) s.taille = fs * base.k;
      if (n.style.color) s.couleur = n.style.color;
      if (/bold|[6-9]00/.test(n.style.fontWeight)) s.gras = true;
      else if (/normal|[1-4]00/.test(n.style.fontWeight)) s.gras = false; // « dé-gras » d'un mot dans une zone en gras
      if (n.style.fontStyle === 'italic') s.italique = true;
      if (/underline/.test(n.style.textDecorationLine || n.style.textDecoration)) s.souligne = true;
    }
    n.childNodes.forEach((c) => marche(c, s));
    if (bloc) paragraphes.push([]);
  };
  if (doc) doc.body.firstChild.childNodes.forEach((c) => marche(c, { taille: base.taille, gras: !!base.gras, italique: !!base.italique, souligne: !!base.souligne }));
  while (paragraphes.length > 1 && !paragraphes[paragraphes.length - 1].length) paragraphes.pop();
  const align = base.align && base.align !== 'left' ? { textAlign: base.align } : null;
  return { type: 'doc', content: paragraphes.map((c) => ({ type: 'paragraph', ...(align ? { attrs: align } : {}), content: c })) };
}
