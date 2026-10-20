/* ============================================================
   MedRevise — NETTETÉ ET RYTHME DU RENDU DES PAGES PDF (17/10, docs/compte-rendu-import-tableau-nettete.md).

   1. CACHE des pages rendues, par document, page, niveau de zoom et densité (LRU, 20 pages) : une page
      qui revient à l'écran (défilement, bascule Original ⇄ Fiche, recherche) est recopiée aussitôt,
      sans repasser par pdf.js.
   2. FILE DE RENDU : au plus 2 rendus pdf.js à la fois ; à chaque place libre, la page la plus utile
      d'abord — celles qui sont à l'écran, puis les plus proches du centre de la zone de lecture.
   3. ALIGNEMENT : le canvas porte exactement les pixels réels de la page (zoom × devicePixelRatio,
      plafonné à 3× et au plafond de pixels d'un canvas), affiché 1 pour 1 et calé sur la grille des
      pixels de l'écran. Sans ça, une page centrée à x = 200,05 px ou large de 767,9 px était
      ré-échantillonnée par le navigateur : texte mou, sauf à fort zoom.
   ============================================================ */
export const DENSITE_MAX = 3;
export const TAILLE_CACHE = 20;
/* (20/10, docs/compte-rendu-pdfreader-v3.md) BUDGET MÉMOIRE du cache, en pixels : 20 pages zoomées d'une
   diapositive 4K pouvaient garder plus de 250 Mpx de canvas — au-delà de ce que Safari (iPad) accepte, qui
   rend alors des canvas VIDES (pages blanches). 32 Mpx ≈ 128 Mo, et jamais un canvas affiché n'est libéré. */
export const BUDGET_PIXELS = 32e6;

/* ---- cache LRU ---- */
const cache = new Map(); // clé → { bitmap (canvas), w, h }
export const cleRendu = (docId, page, scale, os) => `${docId}|${page}|${scale.toFixed(4)}|${os.toFixed(3)}`;
export function lireRendu(cle) {
  const v = cache.get(cle);
  if (!v) return null;
  cache.delete(cle); cache.set(cle, v); // le plus récent à la fin
  return v;
}
export function garderRendu(cle, canvas) {
  // copie : le canvas d'origine peut être réutilisé ou libéré
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  c.getContext('2d').drawImage(canvas, 0, 0);
  cache.delete(cle); cache.set(cle, { bitmap: c, w: c.width, h: c.height });
  let pixels = 0; cache.forEach((v) => { pixels += v.w * v.h; });
  // les plus anciens d'abord, jusqu'à repasser sous les deux limites (nombre de pages ET pixels)
  for (const [k, v] of [...cache.entries()]) {
    if (cache.size <= TAILLE_CACHE && pixels <= BUDGET_PIXELS) break;
    if (k === cle) continue; // le rendu qu'on vient de garder reste
    cache.delete(k); pixels -= v.w * v.h;
    v.bitmap.width = 0; v.bitmap.height = 0; // mémoire rendue tout de suite (une copie : jamais un canvas affiché)
  }
}
/** un rendu de cette page à N'IMPORTE QUEL zoom (le plus grand) : image provisoire d'une page qui revient
    à l'écran à un zoom pas encore rendu — étirée, plutôt qu'une page blanche */
export function lireRenduProche(docId, page) {
  const debut = `${docId}|${page}|`;
  let meilleur = null;
  cache.forEach((v, k) => { if (k.startsWith(debut) && (!meilleur || v.w > meilleur.w)) meilleur = v; });
  return meilleur;
}
export const pixelsCache = () => { let p = 0; cache.forEach((v) => { p += v.w * v.h; }); return p; };
export const tailleCache = () => cache.size;
export function viderCache() { cache.forEach((v) => { v.bitmap.width = 0; v.bitmap.height = 0; }); cache.clear(); }

/* ---- file de rendu à priorité ---- */
const MAX_PARALLELE = 2;
const file = []; // { el, lancer, fini }
let actifs = 0;
function priorite(el) {
  if (!el || !el.isConnected) return 1e9;
  const r = el.getBoundingClientRect();
  const h = window.innerHeight, w = window.innerWidth;
  const visible = r.bottom > 0 && r.top < h && r.right > 0 && r.left < w;
  const centre = Math.abs((r.top + r.bottom) / 2 - h / 2);
  return (visible ? 0 : 1e6) + centre;
}
function pomper() {
  while (actifs < MAX_PARALLELE && file.length) {
    let k = 0, meilleur = Infinity;
    file.forEach((t, i) => { const p = priorite(t.el); if (p < meilleur) { meilleur = p; k = i; } });
    const t = file.splice(k, 1)[0];
    actifs++;
    Promise.resolve().then(t.lancer).catch(() => {}).finally(() => { actifs--; t.fini(); pomper(); });
  }
}
/** met un rendu dans la file ; `lancer` est appelé quand c'est son tour. Rend une fonction d'annulation. */
export function planifierRendu(el, lancer) {
  let fini, annule = false;
  const p = new Promise((r) => { fini = r; });
  const t = { el, lancer: () => (annule ? null : lancer()), fini };
  file.push(t);
  pomper();
  return { promesse: p, annuler: () => { annule = true; const i = file.indexOf(t); if (i >= 0) { file.splice(i, 1); fini(); } } };
}
export const enFile = () => ({ attente: file.length, actifs });

/* ---- alignement sur la grille des pixels de l'écran ---- */
/** canvas affiché 1 pour 1 (si sa densité est celle de l'écran) et calé au pixel réel près */
export function alignerCanvas(canvas, os) {
  if (!canvas || !canvas.width || !canvas.isConnected) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.style.transform = '';
  if (Math.abs(os - dpr) > 1e-3) { canvas.style.width = '100%'; canvas.style.height = '100%'; return; } // densité plafonnée : mise à l'échelle inévitable
  canvas.style.width = canvas.width / dpr + 'px';
  canvas.style.height = canvas.height / dpr + 'px';
  const r = canvas.getBoundingClientRect();
  const dx = Math.round(r.left * dpr) / dpr - r.left;
  const dy = Math.round(r.top * dpr) / dpr - r.top;
  if (Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4) canvas.style.transform = `translate(${dx.toFixed(4)}px, ${dy.toFixed(4)}px)`;
}
