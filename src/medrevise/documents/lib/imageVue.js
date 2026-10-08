/* ============================================================
   MedRevise — IMAGE D'UN DOCUMENT : bloc à part entière (08/10,
   docs/compte-rendu-tablette-document-transcript.md).

   Vue ProseMirror « à la main » (pas de React : une par image, légère) :
   - centrée par défaut (attribut `align` : left | center | right) ;
   - largeur ≤ largeur du texte, hauteur proportionnelle — et JAMAIS plus haute que la zone
     d'écriture d'une page (.pt-corps) : une image géante est réduite à la hauteur de page ;
     ces bornes sont appliquées À L'AFFICHAGE, sans réécrire les documents existants ;
   - sélection au clic / tap (NodeSelection), 4 poignées d'angle : proportions gardées,
     Maj = libre ; ≥ 40 px au doigt (pointer: coarse) ;
   - mini barre flottante : gauche / centre / droite, supprimer (Suppr marche aussi) ;
   - DÉPLACEMENT au pointeur (souris, doigt, stylet) une fois l'image sélectionnée : un trait
     montre où elle tombera, entre deux blocs, sur n'importe quelle page du document (chaque
     page est un éditeur : on retrouve celui sous le doigt par `dom.editor`, posé par TipTap).
   Les tailles sont en unités de PAGE : la page est agrandie par `transform` — les écarts du
   pointeur sont divisés par l'échelle mesurée.
   ============================================================ */
import { NodeSelection } from '@tiptap/pm/state';

const SEUIL_GLISSER = 6; // px écran avant qu'un appui devienne un déplacement
const LARGEUR_MIN = 40;

const echelleDe = (el) => { const r = el.getBoundingClientRect(); return el.offsetWidth ? r.width / el.offsetWidth : 1; };
const bornes = (view, dom) => {
  const corps = dom.closest('.pt-corps');
  const maxW = Math.max(LARGEUR_MIN, view.dom.clientWidth || 400);
  // une ligne reste libre sous une image pleine page : le paragraphe qui la suit (toujours là, pour
  // écrire après) tient sur la même page — sinon il déborderait sans fin vers la page suivante
  const maxH = corps ? Math.max(60, corps.clientHeight - 44) : Infinity;
  return { maxW, maxH };
};

/** l'éditeur (TipTap) d'une page sous un point de l'écran, ou null */
function editeurSous(x, y) {
  const el = document.elementFromPoint(x, y);
  const pm = el && el.closest ? el.closest('.ProseMirror') : null;
  return pm && pm.editor && !pm.editor.isDestroyed ? pm.editor : null;
}
/** limite de bloc (niveau 1) la plus proche de y dans cet éditeur → { pos, y (écran), x, w } */
export function limiteSous(editor, x, y) {
  const view = editor.view;
  const r = view.dom.getBoundingClientRect();
  const doc = view.state.doc;
  let meilleur = null;
  doc.forEach((n, offset) => {
    const d = view.nodeDOM(offset);
    if (!d || !d.getBoundingClientRect) return;
    const b = d.getBoundingClientRect();
    const mid = (b.top + b.bottom) / 2;
    const cand = y < mid ? { pos: offset, y: b.top } : { pos: offset + n.nodeSize, y: b.bottom };
    const dist = y < b.top ? b.top - y : y > b.bottom ? y - b.bottom : 0;
    if (!meilleur || dist < meilleur.dist || (dist === meilleur.dist && Math.abs(cand.y - y) < Math.abs(meilleur.y - y))) meilleur = { ...cand, dist };
  });
  if (!meilleur) meilleur = { pos: 0, y: r.top };
  return { pos: meilleur.pos, y: meilleur.y, x: r.left, w: r.width };
}

export function vueImageDoc({ node, getPos, editor }) {
  let courant = node;
  const view = editor.view;
  const dom = document.createElement('div');
  dom.className = 'pti';
  dom.contentEditable = 'false';
  const cadre = document.createElement('span');
  cadre.className = 'pti-cadre';
  const img = document.createElement('img');
  img.draggable = false;
  img.alt = '';
  cadre.appendChild(img);
  const poignees = ['hg', 'hd', 'bg', 'bd'].map((c) => {
    const p = document.createElement('span');
    p.className = 'pti-poignee ' + c;
    p.dataset.coin = c;
    cadre.appendChild(p);
    return p;
  });
  const barre = document.createElement('span');
  barre.className = 'pti-barre';
  const bouton = (titre, svg, action) => {
    const b = document.createElement('button');
    b.type = 'button'; b.title = titre; b.setAttribute('aria-label', titre);
    b.innerHTML = svg;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); action(); });
    barre.appendChild(b);
    return b;
  };
  const trait = (d) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${d}</svg>`;
  const bAlign = {
    left: bouton('Aligner à gauche', trait('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'), () => changer({ align: 'left' })),
    center: bouton('Centrer', trait('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'), () => changer({ align: 'center' })),
    right: bouton('Aligner à droite', trait('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'), () => changer({ align: 'right' })),
  };
  bouton('Supprimer l’image (Suppr)', trait('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'), () => supprimer()).classList.add('pti-suppr');
  cadre.appendChild(barre);
  dom.appendChild(cadre);

  const pos = () => (typeof getPos === 'function' ? getPos() : null);
  const changer = (attrs) => {
    const p = pos();
    if (p == null) return;
    const tr = view.state.tr.setNodeMarkup(p, undefined, { ...courant.attrs, ...attrs });
    tr.setSelection(NodeSelection.create(tr.doc, p));
    view.dispatch(tr);
  };
  const supprimer = () => {
    const p = pos();
    if (p == null) return;
    view.dispatch(view.state.tr.delete(p, p + courant.nodeSize));
    view.focus();
  };

  /* taille AFFICHÉE : attributs (si posés), bornée à la largeur du texte et à la hauteur de page */
  const ratio = () => {
    const a = courant.attrs;
    if (a.width && a.height) return Number(a.height) / Number(a.width);
    return img.naturalWidth ? img.naturalHeight / img.naturalWidth : 0.66;
  };
  const majTaille = () => {
    const { maxW, maxH } = bornes(view, dom);
    const r = ratio();
    let w = Number(courant.attrs.width) || img.naturalWidth || maxW;
    w = Math.min(w, maxW);
    let h = w * r;
    if (h > maxH) { h = maxH; w = h / r; }
    cadre.style.width = Math.round(w) + 'px';
    img.style.height = Math.round(h) + 'px';
  };
  const appliquer = () => {
    const a = courant.attrs;
    if (a.src && img.getAttribute('src') !== a.src) img.src = a.src;
    dom.dataset.align = a.align || 'center';
    Object.entries(bAlign).forEach(([k, b]) => b.classList.toggle('actif', (a.align || 'center') === k));
    majTaille();
  };
  img.addEventListener('load', () => { majTaille(); dom.dispatchEvent(new CustomEvent('pti-taille', { bubbles: true })); });
  appliquer();


  /* ---- redimensionnement par les coins ---- */
  poignees.forEach((p) => p.addEventListener('pointerdown', (e) => {
    if (e.button && e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    if (!view.hasFocus()) view.focus();
    try { p.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    const s = echelleDe(view.dom) || 1;
    const { maxW, maxH } = bornes(view, dom);
    const w0 = cadre.offsetWidth, h0 = img.offsetHeight, x0 = e.clientX, y0 = e.clientY;
    const coin = p.dataset.coin;
    const sensX = coin.endsWith('g') ? -1 : 1, sensY = coin.startsWith('h') ? -1 : 1;
    const facteur = (courant.attrs.align || 'center') === 'center' ? 2 : 1; // centrée : elle grandit des deux côtés
    let w = w0, h = h0, libre = false;
    dom.classList.add('redim');
    const move = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      libre = ev.shiftKey;
      w = Math.max(LARGEUR_MIN, Math.min(maxW, w0 + sensX * ((ev.clientX - x0) / s) * facteur));
      h = libre ? Math.max(30, Math.min(maxH, h0 + sensY * (ev.clientY - y0) / s)) : w * (h0 / w0);
      if (!libre && h > maxH) { h = maxH; w = h * (w0 / h0); }
      cadre.style.width = Math.round(w) + 'px';
      img.style.height = Math.round(h) + 'px';
    };
    const up = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      p.removeEventListener('pointermove', move); p.removeEventListener('pointerup', up); p.removeEventListener('pointercancel', up);
      dom.classList.remove('redim');
      const garderH = libre || !!courant.attrs.height;
      changer({ width: Math.round(w), height: garderH ? Math.round(h) : null });
    };
    p.addEventListener('pointermove', move); p.addEventListener('pointerup', up); p.addEventListener('pointercancel', up);
  }));

  /* ---- déplacement (image sélectionnée) : entre les blocs, sur toutes les pages ---- */
  let ligne = null;
  const debutDeplacer = (e) => {
    if (!dom.classList.contains('sel') || (e.button && e.button !== 0)) return;
    e.preventDefault(); e.stopPropagation();
    if (!view.hasFocus()) view.focus(); // Suppr, ⌘Z… restent à l'éditeur
    try { img.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    const x0 = e.clientX, y0 = e.clientY;
    let actif = false, cible = null, dernier = { x: x0, y: y0 }, raf = null;
    // conteneur qui défile (la zone de lecture) : défilement automatique près de ses bords
    let sc = dom.parentElement;
    while (sc && !(sc.scrollHeight > sc.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
    const viser = () => {
      const ed = editeurSous(dernier.x, dernier.y);
      if (!ed) { cible = null; if (ligne) ligne.style.display = 'none'; return; }
      const l = limiteSous(ed, dernier.x, dernier.y);
      cible = { ed, pos: l.pos };
      Object.assign(ligne.style, { display: 'block', left: l.x + 'px', top: (l.y - 2) + 'px', width: l.w + 'px' });
    };
    const bord = () => {
      raf = null;
      if (!actif || !sc) return;
      const r = sc.getBoundingClientRect();
      const v = dernier.y < r.top + 56 ? -Math.ceil((r.top + 56 - dernier.y) / 3) : dernier.y > r.bottom - 56 ? Math.ceil((dernier.y - (r.bottom - 56)) / 3) : 0;
      if (v) { sc.scrollTop += v; viser(); }
      raf = requestAnimationFrame(bord);
    };
    const move = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      dernier = { x: ev.clientX, y: ev.clientY };
      if (!actif && Math.hypot(ev.clientX - x0, ev.clientY - y0) < SEUIL_GLISSER) return;
      if (!actif) {
        actif = true;
        dom.classList.add('deplace');
        ligne = document.createElement('div');
        ligne.className = 'pti-depot';
        document.body.appendChild(ligne);
        raf = requestAnimationFrame(bord);
      }
      viser();
    };
    const fin = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      img.removeEventListener('pointermove', move); img.removeEventListener('pointerup', fin); img.removeEventListener('pointercancel', fin);
      dom.classList.remove('deplace');
      if (ligne) { ligne.remove(); ligne = null; }
      if (!actif || !cible || ev.type === 'pointercancel') return;
      deposer(cible.ed, cible.pos);
    };
    img.addEventListener('pointermove', move); img.addEventListener('pointerup', fin); img.addEventListener('pointercancel', fin);
  };
  const deposer = (edCible, posCible) => {
    const p = pos();
    if (p == null) return;
    const taille = courant.nodeSize;
    const vB = edCible.view;
    if (vB === view) {
      if (posCible >= p && posCible <= p + taille) return; // même endroit
      const tr = view.state.tr;
      let arrivee;
      if (posCible > p) { tr.insert(posCible, courant); tr.delete(p, p + taille); arrivee = posCible - taille; } else { tr.delete(p, p + taille); tr.insert(posCible, courant); arrivee = posCible; }
      tr.setSelection(NodeSelection.create(tr.doc, arrivee));
      view.dispatch(tr);
      return;
    }
    // vers une AUTRE page : on l'y pose, puis on la retire d'ici (une page ne reste jamais sans bloc)
    const copie = vB.state.schema.nodes.image.create(courant.attrs);
    const trB = vB.state.tr.insert(posCible, copie);
    trB.setSelection(NodeSelection.create(trB.doc, posCible));
    vB.dispatch(trB);
    const trA = view.state.tr;
    if (view.state.doc.childCount === 1) trA.replaceWith(p, p + taille, view.state.schema.nodes.paragraph.create());
    else trA.delete(p, p + taille);
    view.dispatch(trA);
    try { vB.focus(); } catch (x) { /* ignore */ }
  };
  img.addEventListener('pointerdown', debutDeplacer);

  /* la barre se place AU-DESSUS de l'image s'il y a la place dans la zone d'écriture, sinon
     EN DESSOUS, et dedans seulement si l'image occupe toute la hauteur (la zone rogne ce qui
     dépasse) — jamais sur l'image quand on peut l'éviter : on doit pouvoir la saisir */
  const placerBarre = () => {
    const corps = dom.closest('.pt-corps') || view.dom;
    const inv = parseFloat(getComputedStyle(dom).getPropertyValue('--pti-inv')) || 1;
    const hb = (barre.offsetHeight || 40) * inv + 10 * inv;
    const cr = corps.getBoundingClientRect(), r = cadre.getBoundingClientRect();
    const s = echelleDe(view.dom) || 1;
    const dessus = (r.top - cr.top) / s, dessous = (cr.bottom - r.bottom) / s;
    dom.dataset.barre = dessus >= hb ? 'dessus' : dessous >= hb ? 'dessous' : 'dedans';
  };

  return {
    dom,
    update(n) {
      if (n.type !== courant.type) return false;
      courant = n;
      appliquer();
      if (dom.classList.contains('sel')) requestAnimationFrame(placerBarre);
      return true;
    },
    selectNode() { dom.classList.add('sel'); requestAnimationFrame(placerBarre); },
    deselectNode() { dom.classList.remove('sel'); },
    // poignées, barre et déplacement : gérés ici, pas par ProseMirror
    stopEvent(e) {
      const t = e.target;
      if (t && t.closest && (t.closest('.pti-poignee') || t.closest('.pti-barre'))) return true;
      if (dom.classList.contains('sel') && t === img && /^(pointer|mouse|touch)/.test(e.type)) return true;
      return false;
    },
    ignoreMutation() { return true; },
    destroy() { if (ligne) ligne.remove(); },
  };
}

/** Insère une image comme BLOC, sans jamais couper un paragraphe : à `pos` (une limite de
    bloc, ex. sous le pointeur d'un dépôt), sinon après le bloc du curseur (avant s'il est en
    tout début de bloc ; un paragraphe vide est remplacé). Un paragraphe suit toujours une
    image en fin de page, pour pouvoir continuer à écrire. L'image est sélectionnée. */
export function insererImageBloc(editor, attrs, pos = null) {
  const { state, view } = editor;
  const type = state.schema.nodes.image;
  const img = type.create({ align: 'center', ...attrs });
  const tr = state.tr;
  let at = pos;
  if (at == null) {
    const $p = state.selection.$from;
    if (state.selection instanceof NodeSelection) at = state.selection.to; // une image sélectionnée : juste après elle
    else if ($p.depth >= 1) {
      const bloc = $p.node(1), debut = $p.before(1), fin = $p.after(1);
      if (bloc.isTextblock && bloc.content.size === 0) { tr.delete(debut, fin); at = debut; }
      else at = ($p.depth === 1 && $p.parentOffset === 0) ? debut : fin;
    } else at = state.selection.from;
  }
  at = Math.max(0, Math.min(at, tr.doc.content.size));
  tr.insert(at, img);
  if (at + img.nodeSize >= tr.doc.content.size) tr.insert(tr.doc.content.size, state.schema.nodes.paragraph.create());
  tr.setSelection(NodeSelection.create(tr.doc, at));
  view.dispatch(tr.scrollIntoView());
  if (!view.hasFocus()) view.focus();
  return true;
}
