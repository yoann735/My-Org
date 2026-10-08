/* ============================================================
   MedRevise — PAGINATION DANS L'ÉDITEUR (08/10, docs/compte-rendu-document-engine.md).

   Le document est UN éditeur ProseMirror (un seul flux). Ce plugin :
   1. MESURE chaque bloc de premier niveau sur le VRAI rendu (offsetHeight : insensible au
      zoom, qui est un `transform`), avec un cache par nœud (les nœuds ProseMirror sont
      immuables : même nœud = même hauteur, tant que la largeur ne change pas). Les blocs
      coupables (paragraphes, listes, citations) donnent aussi leurs points de coupe : début
      de chaque ligne (posAtCoords au bord gauche de la ligne) ou de chaque élément ;
   2. PAGINE (pagination.js, déterministe) ;
   3. pose des ESPACEURS (décorations « widget ») : avant un bloc qui passe à la page
      suivante, ou entre deux lignes d'un paragraphe coupé. Le texte n'est jamais déplacé
      d'un conteneur à l'autre : il ne bouge que par ces espaceurs.
   Jamais pendant un geste (image glissée / redimensionnée : `gesteDocument`), toujours
   après le chargement des polices (document.fonts.ready). Reprise à partir de la PAGE du
   premier bloc modifié : les espaceurs d'avant sont gardés tels quels.
   ============================================================ */
import { Extension, Node as NoeudTiptap } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { paginer, pointDeReprise } from './pagination.js';

export const clePagination = new PluginKey('paginationDocument');

/* geste en cours (glisser / redimensionner une image) : la pagination attend la fin */
let gestes = 0;
const enAttente = new Set();
export const gesteDocument = {
  debut() { gestes += 1; },
  fin() { gestes = Math.max(0, gestes - 1); if (!gestes) enAttente.forEach((f) => f()); },
  enCours: () => gestes > 0,
};

const geoSig = (g) => `${g.haut(0)}/${g.haut(1)}/${g.zone}`;
const COUPABLES = new Set(['paragraph', 'bulletList', 'orderedList', 'taskList', 'blockquote']);
const GARDER_AVEC_SUIVANT = new Set(['heading']);

/* SAUT DE PAGE : bloc atomique — tout ce qui suit commence sur la page suivante */
export const SautDePage = NoeudTiptap.create({
  name: 'sautDePage',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() { return [{ tag: 'div[data-saut-page]' }]; },
  renderHTML() { return ['div', { 'data-saut-page': '', class: 'pt-saut-page', contenteditable: 'false' }, ['span', {}, 'Saut de page']]; },
});

function hauteurEspaceursDans(el) {
  let s = 0;
  el.querySelectorAll('.pt-saut-ligne').forEach((x) => { s += Number(x.dataset.h) || 0; });
  return s;
}

/** points de coupe d'un bloc (y relatif au haut du bloc, en unités non zoomées, + position) */
function coupesDe(view, node, debut, el, echelle) {
  const coupes = [];
  const haut = el.getBoundingClientRect().top;
  const naturel = (yEcran) => { // y à l'écran → y naturel dans le bloc (espaceurs déduits)
    let y = (yEcran - haut) / echelle;
    el.querySelectorAll('.pt-saut-ligne').forEach((x) => { if (x.getBoundingClientRect().top < yEcran - 1) y -= Number(x.dataset.h) || 0; });
    return y;
  };
  if (node.type.name === 'paragraph') {
    // lignes : les rectangles des nœuds TEXTE (pas ceux des espaceurs)
    const tops = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement && n.parentElement.closest('.pt-saut-ligne') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    const r = document.createRange();
    let t;
    while ((t = w.nextNode())) {
      if (!t.length) continue;
      r.selectNodeContents(t);
      for (const rc of r.getClientRects()) {
        if (!rc.height) continue;
        // haut de la LIGNE (pas du glyphe) : le rectangle d'un texte est centré dans sa ligne
        const lh = parseFloat(getComputedStyle(t.parentElement).lineHeight) * echelle;
        const dec = Number.isFinite(lh) && lh > rc.height ? (lh - rc.height) / 2 : 0;
        if (!tops.some((x) => Math.abs(x.top + x.dec - rc.top) < 2)) tops.push({ top: rc.top - dec, dec, left: rc.left, h: rc.height });
        else { const x = tops.find((z) => Math.abs(z.top + z.dec - rc.top) < 2); if (rc.left < x.left) x.left = rc.left; }
      }
    }
    tops.sort((a, b) => a.top - b.top);
    const g = el.getBoundingClientRect().left;
    for (let i = 1; i < tops.length; i++) {
      const res = view.posAtCoords({ left: Math.max(g + 1, tops[i].left + 1), top: tops[i].top + tops[i].dec + tops[i].h / 2 });
      if (!res) continue;
      const pos = Math.max(debut + 1, Math.min(debut + node.nodeSize - 1, res.pos));
      coupes.push({ y: naturel(tops[i].top), pos });
    }
  } else {
    // listes, citations : entre deux éléments
    let off = debut + 1;
    node.forEach((enfant, o, i) => {
      if (i > 0) {
        const d = view.nodeDOM(debut + 1 + o);
        if (d && d.getBoundingClientRect) coupes.push({ y: naturel(d.getBoundingClientRect().top), pos: debut + 1 + o });
      }
      off += enfant.nodeSize;
    });
  }
  // dédoublonnage, ordre croissant, ni 0 ni le bas
  return coupes.filter((c, i, a) => c.y > 1 && (i === 0 || c.y > a[i - 1].y + 1)).sort((a, b) => a.y - b.y);
}

export const PaginationDocument = Extension.create({
  name: 'paginationDocument',
  addOptions() {
    return { geo: null, onResultat: null };
  },
  addProseMirrorPlugins() {
    const ext = this;
    return [new Plugin({
      key: clePagination,
      state: {
        init: () => ({ deco: DecorationSet.empty, sig: '' }),
        apply(tr, val) {
          const m = tr.getMeta(clePagination);
          if (m) return m;
          if (!tr.docChanged) return val;
          /* un espaceur posé au bord d'un nœud REMPLACÉ (ex. image qui reçoit son texte reconnu :
             setNodeMarkup) est supprimé par le mappage — la signature ne correspond plus à
             l'écran : on l'oublie, le prochain passage reposera tout */
          const deco = val.deco.map(tr.mapping, tr.doc);
          const n = (d) => d.find().length;
          return { deco, sig: n(deco) === n(val.deco) ? val.sig : '' };
        },
      },
      props: { decorations(state) { return clePagination.getState(state).deco; } },
      view(view) {
        const cache = new WeakMap(); // nœud → { h, coupes (relatives), largeur }
        let prec = null; // { blocs: [noeud], hauteurs, res }
        let raf = null, vivant = true, polices = false;
        const largeur = () => view.dom.clientWidth;
        const mesurerEtPaginer = () => {
          raf = null;
          if (!vivant || !polices) return;
          if (gesteDocument.enCours()) { enAttente.add(planifier); return; }
          enAttente.delete(planifier);
          const geo = ext.options.geo;
          if (!geo || !view.dom.isConnected || !view.dom.offsetWidth) return;
          const echelle = view.dom.getBoundingClientRect().width / view.dom.offsetWidth || 1;
          const L = largeur();
          const blocs = [], noeuds = [], debuts = [];
          let premierChange = -1;
          view.state.doc.forEach((node, offset, i) => {
            const el = view.nodeDOM(offset);
            noeuds.push(node); debuts.push(offset);
            let m = cache.get(node);
            const avecImage = node.type.name === 'image' || (node.content && node.content.size && node.descendants && (() => { let im = false; node.descendants((n) => { if (n.type.name === 'image') im = true; return !im; }); return im; })());
            if (!m || m.largeur !== L || avecImage || !el) {
              // hauteur EXACTE (offsetHeight arrondit au pixel : la dérive s'accumulait de page en page)
              const h = el && el.getBoundingClientRect ? el.getBoundingClientRect().height / echelle - hauteurEspaceursDans(el) : 0;
              const coupes = el && COUPABLES.has(node.type.name) ? coupesDe(view, node, offset, el, echelle).map((c) => ({ y: c.y, rel: c.pos - offset })) : [];
              const n = { h, coupes, largeur: L };
              if (!m || m.h !== n.h || m.coupes.length !== n.coupes.length) { if (premierChange < 0) premierChange = i; }
              m = n;
              if (!avecImage && el) cache.set(node, m);
            }
            if (prec && premierChange < 0 && prec.noeuds[i] !== node) premierChange = i;
            blocs.push({
              h: m.h, type: node.type.name, saut: node.type.name === 'sautDePage',
              garderAvecSuivant: GARDER_AVEC_SUIVANT.has(node.type.name),
              coupes: m.coupes.map((c) => ({ y: c.y, pos: offset + c.rel })),
            });
          });
          if (prec && premierChange < 0 && prec.noeuds.length !== noeuds.length) premierChange = Math.min(prec.noeuds.length, noeuds.length);
          if (prec && premierChange < 0) return; // rien n'a changé
          // reprise à partir de la page du premier bloc modifié (les pages d'avant ne bougent pas)
          const reprise = prec && prec.res && prec.geoSig === geoSig(geo) ? pointDeReprise(prec.res, premierChange) : null;
          const res = paginer(blocs, geo, reprise);
          const deco = DecorationSet.create(view.state.doc, res.espaceurs.map((e) => {
            const pos = e.pos != null ? e.pos : (debuts[e.bloc] != null ? debuts[e.bloc] : view.state.doc.content.size);
            const h = Math.round(e.h * 100) / 100;
            const ligne = e.pos != null;
            return Decoration.widget(pos, () => {
              const s = document.createElement(ligne ? 'span' : 'div');
              s.className = ligne ? 'pt-saut-ligne' : 'pt-saut';
              s.dataset.h = String(h);
              s.style.height = h + 'px';
              s.contentEditable = 'false';
              return s;
            }, { side: -1, key: (ligne ? 'l' : 'b') + pos + ':' + h, ignoreSelection: true });
          }));
          const sig = res.espaceurs.map((e) => `${e.bloc}/${e.pos}/${Math.round(e.h * 100)}`).join(',');
          prec = { noeuds, res, geoSig: geoSig(geo) };
          view.dom.pagination = { blocs, res, reprise: reprise && reprise.bloc, n: ((view.dom.pagination && view.dom.pagination.n) || 0) + 1 }; // lecture seule (tests de conformité)
          const etat = clePagination.getState(view.state);
          if (sig !== etat.sig) {
            view.dispatch(view.state.tr.setMeta(clePagination, { deco, sig }).setMeta('addToHistory', false).setMeta('journalIgnorer', true));
            planifier(); // un espaceur peut décaler la coupe d'une ligne : un second passage confirme (point fixe)
          }
          const blocsPages = res.pages.map((p, i) => ({ page: p, pos: debuts[i], type: noeuds[i].type.name }));
          if (ext.options.onResultat) ext.options.onResultat({ nbPages: res.nbPages, blocs: blocsPages, espaceurs: res.espaceurs });
        };
        function planifier() { if (!raf && vivant) raf = requestAnimationFrame(mesurerEtPaginer); }
        const surTaille = () => { prec = null; planifier(); };
        view.dom.addEventListener('pti-taille', surTaille);
        (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => { polices = true; prec = null; planifier(); });
        return {
          update(v, ancien) { if (v.state.doc !== ancien.doc) planifier(); },
          destroy() { vivant = false; if (raf) cancelAnimationFrame(raf); enAttente.delete(planifier); view.dom.removeEventListener('pti-taille', surTaille); },
        };
      },
    })];
  },
});
