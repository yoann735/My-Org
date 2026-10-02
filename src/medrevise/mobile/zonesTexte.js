/* ============================================================
   MedRevise — ZONES DE TEXTE du dessin mobile : contenu riche (02/10 nuit).

   Le contenu d'une zone est un petit HTML, édité en place (contentEditable) :
   gras, italique, souligné, taille et couleur — sur toute la zone ou sur une partie
   (un mot sélectionné). Ce HTML est TOUJOURS repassé par `nettoyerHtml` (liste
   blanche de balises et de styles) avant d'être affiché, stocké ou envoyé.
   Les tailles des morceaux sont en px « monde » (ceux du canvas à zoom 1).
   ============================================================ */

export const POLICE_TEXTE = 'system-ui, -apple-system, "Segoe UI", sans-serif';

const BALISES = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'DIV', 'P', 'SPAN']);
const STYLES = ['font-size', 'color', 'font-weight', 'font-style', 'text-decoration-line', 'text-decoration'];

const echapper = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** HTML sûr : seules les balises et les styles utiles survivent. */
export function nettoyerHtml(html) {
  if (!html) return '';
  let doc;
  try { doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html'); } catch (e) { return echapper(html); }
  const sortie = (n) => {
    if (n.nodeType === 3) return echapper(n.nodeValue);
    if (n.nodeType !== 1) return '';
    const enfants = [...n.childNodes].map(sortie).join('');
    const tag = n.tagName;
    if (!BALISES.has(tag)) return enfants;
    if (tag === 'BR') return '<br>';
    if (tag === 'SPAN') {
      const st = STYLES.map((p) => { const v = n.style.getPropertyValue(p); return v && /^[#\w\s.,()%-]+$/.test(v) ? `${p}: ${v}` : ''; }).filter(Boolean).join('; ');
      return st ? `<span style="${st}">${enfants}</span>` : enfants;
    }
    const t = tag.toLowerCase();
    return `<${t}>${enfants}</${t}>`;
  };
  return [...doc.body.firstChild.childNodes].map(sortie).join('');
}

/** contenu HTML d'une zone (les zones d'avant n'ont que `texte`). */
export function htmlZone(z) {
  if (z.html) return nettoyerHtml(z.html);
  return echapper(z.texte || '').replace(/\n/g, '<br>');
}

/** texte brut (lignes) d'un HTML de zone. */
export function texteBrut(html) {
  try {
    const d = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html').body.firstChild;
    const out = [];
    const marche = (n) => {
      if (n.nodeType === 3) { out.push(n.nodeValue); return; }
      if (n.nodeType !== 1) return;
      if (n.tagName === 'BR') { out.push('\n'); return; }
      const bloc = n.tagName === 'DIV' || n.tagName === 'P';
      if (bloc && out.length && !String(out[out.length - 1]).endsWith('\n')) out.push('\n');
      n.childNodes.forEach(marche);
    };
    d.childNodes.forEach(marche);
    return out.join('').replace(/ /g, ' ').replace(/\n+$/, '');
  } catch (e) { return ''; }
}

/** les couleurs du HTML passent par `conv` (encre adaptée au fond de l'export). */
export function convertirCouleurs(html, conv) {
  return String(html || '').replace(/color:\s*([^;"]+)/g, (m, c) => `color: ${conv(c.trim())}`);
}

/* ---------- édition : appliquer un style à la SÉLECTION ---------- */

/** enveloppe la sélection courante (dans `racine`) dans un <span style> ; les mêmes
    propriétés sur les morceaux intérieurs sont retirées (la nouvelle l'emporte). */
export function envelopperSelection(racine, style) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  if (!racine.contains(range.commonAncestorContainer)) return false;
  // la sélection couvre EXACTEMENT un morceau déjà stylé (A+ répété sur le même mot) :
  // on modifie ce morceau au lieu d'en emboîter un nouveau
  let n = range.commonAncestorContainer;
  if (n.nodeType === 3) n = n.parentElement;
  const morceau = n && n !== racine && n.tagName === 'SPAN' && racine.contains(n) && n.textContent === range.toString() ? n : null;
  if (morceau) {
    Object.entries(style).forEach(([k, v]) => { morceau.style[k] = v; });
    morceau.querySelectorAll('span').forEach((x) => { Object.keys(style).forEach((k) => { x.style[k] = ''; }); if (!x.getAttribute('style')) x.replaceWith(...x.childNodes); });
    sel.removeAllRanges(); const r1 = document.createRange(); r1.selectNodeContents(morceau); sel.addRange(r1);
    return true;
  }
  const frag = range.extractContents();
  const span = document.createElement('span');
  Object.entries(style).forEach(([k, v]) => { span.style[k] = v; });
  span.appendChild(frag);
  span.querySelectorAll('span').forEach((n) => { Object.keys(style).forEach((k) => { n.style[k] = ''; }); if (!n.getAttribute('style')) n.replaceWith(...n.childNodes); });
  range.insertNode(span);
  sel.removeAllRanges();
  const r2 = document.createRange(); r2.selectNodeContents(span); sel.addRange(r2);
  return true;
}

/** la sélection est-elle un morceau NON vide de `racine` ? */
export function selectionDans(racine) {
  const sel = window.getSelection();
  return !!(racine && sel && sel.rangeCount && !sel.isCollapsed && racine.contains(sel.getRangeAt(0).commonAncestorContainer));
}

/** taille de police (px monde) au début de la sélection. */
export function tailleSelection(racine, repli) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return repli;
  let n = sel.getRangeAt(0).startContainer;
  if (n.nodeType === 3) n = n.parentElement;
  if (!n || !racine.contains(n)) return repli;
  return parseFloat(getComputedStyle(n).fontSize) || repli;
}
