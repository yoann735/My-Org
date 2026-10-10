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
import { ocrImage } from '../../ocr/ocrImage.js';
import { genId } from '../../lib/storage.js';
import { planMots } from '../../lib/resurlignage.js';
import { gesteDocument } from './paginationExt.js';
import { hexPalette, COULEUR_DEFAUT } from '../../lib/palette.js';

const SEUIL_GLISSER = 6; // px écran avant qu'un appui devienne un déplacement
const LARGEUR_MIN = 40;

const echelleDe = (el) => { const r = el.getBoundingClientRect(); return el.offsetWidth ? r.width / el.offsetWidth : 1; };
const bornes = (view, dom) => {
  // DOCUMENT (un seul flux paginé, 08/10) : une image ne dépasse jamais la zone utile d'une
  // page — elle est réduite pour tenir (marges du bloc déduites), puis la pagination la place
  const flux = dom.closest('.pt-flux');
  if (flux) {
    const zone = Number(flux.dataset.zone) || 730;
    return { maxW: Math.max(LARGEUR_MIN, view.dom.clientWidth || 483), maxH: Math.max(60, zone - 14) };
  }
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
  // flux paginé : les marges et l'écart entre deux pages appartiennent aussi au document
  const flux = el && el.closest ? el.closest('.pt-flux-echelle') : null;
  const pm = el && el.closest ? (el.closest('.ProseMirror') || (flux && flux.querySelector('.ProseMirror'))) : null;
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
  /* TEXTE EN DIRECT (08/10) : calque des mots reconnus (transparent ; visible et sélectionnable
     en « mode texte »), boîtes des notions prises sur l'image, et le badge en bas à droite :
     petit spinner pendant l'OCR, puis icône « texte détecté » s'il y a du texte. */
  const calque = document.createElement('span');
  calque.className = 'pti-texte';
  const notionsCalque = document.createElement('span');
  notionsCalque.className = 'pti-notions';
  const badge = document.createElement('button');
  badge.type = 'button';
  badge.className = 'pti-ocr';
  badge.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
  badge.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!badge.classList.contains('pret')) return;
    const on = !dom.classList.contains('texte-actif');
    dom.classList.toggle('texte-actif', on);
    badge.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (!on) fermerBulle();
  });
  cadre.insertBefore(notionsCalque, barre);
  cadre.insertBefore(calque, barre);
  cadre.appendChild(badge);
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
    if (typeof ajusterMots === 'function') ajusterMots();
  };
  const appliquer = () => {
    const a = courant.attrs;
    if (a.src && img.getAttribute('src') !== a.src) img.src = a.src;
    dom.dataset.align = a.align || 'center';
    Object.entries(bAlign).forEach(([k, b]) => b.classList.toggle('actif', (a.align || 'center') === k));
    majTaille();
    majOcr();
  };
  /* ---- TEXTE EN DIRECT : OCR, calque, notions, bulle ---- */
  let rendu = { ocr: null, notions: null }; // ce qui est dessiné (évite de tout refaire à chaque mise à jour)
  let ocrLance = false;
  const ICONE_TEXTE = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M8 9.5h8M8 12h8M8 14.5h5"/></svg>';
  const mesure = document.createElement('canvas').getContext('2d');
  const ajusterMots = () => {
    // taille de police de chaque mot : la hauteur de sa boîte, étirée à sa largeur (sélection juste)
    const H = img.offsetHeight || 0, W = cadre.offsetWidth || 0;
    if (!H || !W) return;
    for (const sp of calque.children) {
      const m = (courant.attrs.ocr && courant.attrs.ocr.mots[Number(sp.dataset.i)]) || null;
      if (!m) continue;
      const fs = Math.max(4, m.h * H * 0.86);
      mesure.font = `${fs}px sans-serif`;
      const larg = mesure.measureText(m.t).width || 1; // le séparateur final ne compte pas
      sp.style.fontSize = fs + 'px';
      sp.style.transform = `scaleX(${(m.w * W) / larg})`;
    }
  };
  const dessinerMots = (ocr) => {
    calque.textContent = '';
    (ocr ? ocr.mots : []).forEach((m, i) => {
      const sp = document.createElement('span');
      sp.className = 'pti-mot';
      sp.dataset.i = String(i);
      // l'espace (ou le retour à la ligne) qui suit est DANS le mot : la copie native garde les
      // séparateurs ; la largeur n'est pas imposée — le mot est étiré à sa boîte par scaleX
      sp.textContent = m.t + (i + 1 < ocr.mots.length ? (ocr.mots[i + 1].line !== m.line ? '\n' : ' ') : '');
      Object.assign(sp.style, { left: m.x * 100 + '%', top: m.y * 100 + '%', height: m.h * 100 + '%' });
      calque.appendChild(sp);
    });
    ajusterMots();
  };
  const dessinerNotions = (ocr, notions) => {
    notionsCalque.textContent = '';
    if (!ocr) return;
    for (const n of notions || []) {
      for (const i of n.mots || []) {
        const m = ocr.mots[i];
        if (!m) continue;
        const b = document.createElement('span');
        b.className = 'pti-notion';
        b.dataset.notion = n.id;
        b.style.setProperty('--nc', hexPalette(n.couleur || 'jaune'));
        Object.assign(b.style, { left: m.x * 100 + '%', top: m.y * 100 + '%', width: m.w * 100 + '%', height: m.h * 100 + '%' });
        notionsCalque.appendChild(b);
      }
    }
  };
  function majOcr() {
    const a = courant.attrs;
    if (a.ocr !== rendu.ocr) { dessinerMots(a.ocr); rendu.ocr = a.ocr; }
    if (a.notions !== rendu.notions || a.ocr !== rendu.ocr) { dessinerNotions(a.ocr, a.notions); rendu.notions = a.notions; }
    const n = a.ocr && a.ocr.mots ? a.ocr.mots.length : 0;
    if (a.ocr) {
      badge.className = 'pti-ocr' + (n ? ' pret' : ' vide');
      badge.innerHTML = n ? ICONE_TEXTE : '';
      badge.title = n ? 'Texte détecté — afficher et sélectionner le texte de l’image' : '';
      badge.setAttribute('aria-label', n ? 'Texte détecté dans l’image' : '');
      if (!n) dom.classList.remove('texte-actif');
      return;
    }
    if (ocrLance || !a.src) return;
    // pas encore reconnue : OCR en arrière-plan (moteur partagé, Web Worker)
    ocrLance = true;
    badge.className = 'pti-ocr en-cours';
    badge.innerHTML = '<span class="pti-ocr-spin" aria-hidden="true"></span>';
    badge.title = 'Recherche de texte dans l’image…';
    ocrImage({ blobId: a.blobId || null, src: a.blobId ? null : a.src }).then((r) => {
      const p = pos();
      if (p == null || !r || courant.attrs.ocr) { if (!r) { badge.className = 'pti-ocr vide'; badge.innerHTML = ''; } return; }
      // résultat posé sur le nœud : enregistré et synchronisé avec le document, hors historique
      const tr = view.state.tr.setNodeMarkup(p, undefined, { ...courant.attrs, ocr: r });
      tr.setMeta('addToHistory', false).setMeta('journalIgnorer', true);
      view.dispatch(tr);
    }).catch(() => { badge.className = 'pti-ocr vide'; badge.innerHTML = ''; });
  }

  // bulle de sélection sur le texte de l'image : Notion · Flashcard · Copier (comme sur le texte)
  let bulle = null;
  const fermerBulle = () => { if (bulle) { bulle.remove(); bulle = null; } };
  const motsSelectionnes = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount || !calque.contains(sel.anchorNode)) return [];
    const r = sel.getRangeAt(0);
    return [...calque.children].filter((sp) => sp.firstChild && r.intersectsNode(sp.firstChild) && !(r.endContainer === sp.firstChild && r.endOffset === 0) && !(r.startContainer === sp.firstChild && r.startOffset >= sp.firstChild.length - 1 && sp.firstChild.length > 1)).map((sp) => Number(sp.dataset.i));
  };
  const texteDe = (ids) => ids.map((i) => courant.attrs.ocr.mots[i].t).join(' ');
  const ouvrirBulle = () => {
    fermerBulle();
    const ids = motsSelectionnes();
    if (!ids.length) return;
    const r = window.getSelection().getRangeAt(0).getBoundingClientRect();
    bulle = document.createElement('div');
    bulle.className = 'nd-bulle pt-bulle pti-bulle';
    Object.assign(bulle.style, { left: (r.left + r.right) / 2 + 'px', top: (r.top - 8) + 'px' });
    const act = (libelle, f) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'nd-bt nd-bt-txt'; b.textContent = libelle;
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); f(); fermerBulle(); });
      bulle.appendChild(b);
    };
    act('Notion', () => {
      // seulement les mots pas encore pris par une notion (jamais de doublon)
      const pris = new Set((courant.attrs.notions || []).flatMap((x) => x.mots || []));
      const libres = ids.filter((i) => !pris.has(i));
      if (libres.length) changer({ notions: [...(courant.attrs.notions || []), { id: genId('nd'), couleur: COULEUR_DEFAUT, mots: libres }] });
      window.getSelection().removeAllRanges();
    });
    act('Flashcard', () => dom.dispatchEvent(new CustomEvent('pti-flashcard', { bubbles: true, detail: { texte: texteDe(ids) } })));
    act('Copier', () => { try { navigator.clipboard.writeText(texteDe(ids)); } catch (e) { /* refus */ } });
    document.body.appendChild(bulle);
  };
  /* SURLIGNEUR SUR L'IMAGE (09/10, docs/compte-rendu-pdfreader-v2.md) : comme sur le texte —
     les mots balayés deviennent une notion de la couleur courante (indices de mots OCR : la
     notion suit l'image, à toute taille) ; repasser dans la même couleur la retire, dans une
     autre la recolore. Plus besoin d'activer l'icône « texte » : elle sert à VOIR le texte. */
  const outilCourant = () => { const z = dom.closest('[data-outil]'); return z ? z.dataset.outil : 'main'; };
  const couleurCourante = () => { const z = dom.closest('[data-couleur-surligneur]'); return (z && z.dataset.couleurSurligneur) || COULEUR_DEFAUT; };
  const surligner = () => {
    const ids = motsSelectionnes();
    if (!ids.length) return;
    const couleur = couleurCourante();
    // (10/10) à la portion près, une seule couche (lib/resurlignage.js#planMots)
    const notions = courant.attrs.notions || [];
    const plan = planMots(ids, notions, couleur);
    const retirees = new Set([...plan.supprimer, ...plan.garder.map((g) => g.id)]);
    const suite = [
      ...notions.filter((n) => !retirees.has(n.id)),
      ...plan.garder.map((g) => ({ ...notions.find((n) => n.id === g.id), mots: g.mots })),
      ...plan.creer.map((c) => ({ id: genId('nd'), couleur: c.couleur, mots: c.mots })),
    ];
    changer({ notions: suite });
    window.getSelection().removeAllRanges();
  };
  const finSelection = () => {
    const o = outilCourant();
    if (o === 'surligneur') surligner();
    else if (o === 'main' || dom.classList.contains('texte-actif')) ouvrirBulle();
  };
  // fin du geste : même relâché HORS des mots (balayage qui dépasse l'image)
  calque.addEventListener('pointerdown', (e) => {
    if (e.button && e.button !== 0) return;
    fermerBulle();
    // appui sur des mots DÉJÀ sélectionnés : le navigateur lancerait un glisser-déposer du texte
    // au lieu d'une nouvelle sélection — on repart d'une sélection vide
    try { window.getSelection().removeAllRanges(); } catch (x) { /* ignore */ }
    const fin = () => { window.removeEventListener('pointerup', fin, true); setTimeout(finSelection, 0); };
    window.addEventListener('pointerup', fin, true);
  });
  calque.addEventListener('keyup', () => setTimeout(ouvrirBulle, 0));
  const dehors = (e) => { if (bulle && !bulle.contains(e.target) && !calque.contains(e.target)) fermerBulle(); };
  document.addEventListener('pointerdown', dehors, true);

  img.addEventListener('load', () => { majTaille(); ajusterMots(); dom.dispatchEvent(new CustomEvent('pti-taille', { bubbles: true })); });
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
    gesteDocument.debut(); // pas de pagination pendant le geste
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
      gesteDocument.fin();
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
        gesteDocument.debut();
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
      if (actif) gesteDocument.fin();
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
    const groupe = 'img-' + Date.now(); // une seule étape d'annulation pour les deux pages (lib/journalAnnuler.js)
    const trB = vB.state.tr.insert(posCible, copie).setMeta('groupeJournal', groupe);
    trB.setSelection(NodeSelection.create(trB.doc, posCible));
    vB.dispatch(trB);
    const trA = view.state.tr.setMeta('groupeJournal', groupe);
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
      if (t && t.closest && (t.closest('.pti-poignee') || t.closest('.pti-barre') || t.closest('.pti-ocr'))) return true;
      // texte de l'image (mode texte) : sélection et copie natives, ProseMirror n'y touche pas
      if (t && (t === calque || (calque.contains && calque.contains(t)))) return true;
      if (dom.classList.contains('sel') && t === img && /^(pointer|mouse|touch)/.test(e.type)) return true;
      return false;
    },
    ignoreMutation() { return true; },
    destroy() { if (ligne) ligne.remove(); fermerBulle(); document.removeEventListener('pointerdown', dehors, true); },
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
