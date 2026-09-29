/* ============================================================
   MedRevise — SOCLE PARTAGÉ du lecteur PDF : constantes de la palette et
   fonctions PURES de géométrie/texte.

   Extrait de pdf/PdfReader.jsx (étape 4 du refactor) SANS AUCUN CHANGEMENT DE
   COMPORTEMENT : les corps de fonction sont recopiés à l'identique, seuls les
   `export` sont ajoutés. Elles étaient partagées de fait entre le lecteur, la
   page et les annotations ; elles le sont maintenant explicitement.
   ============================================================ */
import { useEffect, useState } from 'react';
import { pdfjsLib } from './pdfjsSetup.js';
import { rgb } from 'pdf-lib';

/** densité réelle de l'écran, suivie en direct : elle change quand la fenêtre passe
    d'un écran Retina à un écran externe, ou au zoom navigateur (Cmd +/−). Une page
    rendue pour l'ancienne densité serait floue (ou inutilement lourde) sur la nouvelle. */
export function useDevicePixelRatio() {
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1);
  useEffect(() => {
    const mq = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const onChange = () => setDpr(window.devicePixelRatio || 1);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [dpr]);
  return dpr;
}

// Sens des couleurs = celui du gabarit HTML (voir SENS_PAR_COULEUR, lib/courseExport.js) :
// jaune = notion PRIORITAIRE, rose = CLOZE, vert/bleu = surlignage simple. Mêmes ids
// que data-hl du gabarit, pour que l'export des deux sources parle la même langue.
export const COLORS = [
  { id: 'jaune', hex: '#FFD84D', short: 'Prio', label: 'Prioritaire' },
  { id: 'vert', hex: '#8BE38B', short: 'Vert', label: 'Surlignage simple' },
  { id: 'bleu', hex: '#7EC8FF', short: 'Bleu', label: 'Surlignage simple' },
  { id: 'rose', hex: '#FF9FD1', short: 'Cloze', label: 'Cloze' },
];
export const COLOR_HEX = Object.fromEntries(COLORS.map((c) => [c.id, c.hex]));
export const COLOR_TAG = { jaune: 'Prioritaire', rose: 'Cloze' }; // étiquette affichée dans le panneau
export const COLOR_RGB = { jaune: rgb(1, 0.85, 0.3), vert: rgb(0.55, 0.89, 0.55), bleu: rgb(0.5, 0.78, 1), rose: rgb(1, 0.62, 0.82) };

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const clamp01 = (v) => clamp(v, 0, 1);
/** teinte de fond d'une boîte de texte : la couleur de la palette, opacifiée. */
export const avecAlpha = (hex, a) => {
  const h = String(hex || '#FFD84D').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
/** taille par défaut d'une boîte posée d'un simple clic (fraction de page). */
export const BOITE_DEFAUT = { width: 0.30, height: 0.075 };
export const BOITE_MIN = { width: 0.04, height: 0.022 };

export const FONT_SIZES = ['10px', '11px', '12px', '13px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'];
export const FONT_FAMILIES = ['inherit', 'serif', 'sans-serif', 'monospace', 'Georgia', 'Arial', 'Times New Roman'];

/** libellé du modificateur dans les infobulles — « Cmd » sur Mac, « Ctrl » ailleurs. */
export const RACCOURCI = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '') ? 'Cmd+' : 'Ctrl+';

export const GAP = 18; // px à scale=1 — scale avec `scale` pour garder un contenu strictement linéaire
export const EMPTY_ARRAY = []; // référence stable pour les pages sans highlights/edits/matches (BUG 1)

/** couche de texte invisible mais sélectionnable, positionnée depuis item.transform.
    Un seul <span> (= un seul nœud texte) par item de contenu texte — c'est cet
    alignement d'index avec computePageTextMap qui permet à computeMatchRectsFromDom
    et au clic d'édition de retrouver le bon nœud texte réel dans le DOM (les <br>
    ajoutés ci-dessous ne sont pas des <span> : ils ne décalent aucun index).

    Deux corrections (docs/diag-pdf-etape0.md, constats 2 à 4) :
    - FINS DE LIGNE : pdf.js les signale par `hasEOL`, très souvent sur un item VIDE
      (str "") que l'ancien filtre jetait. Sans séparateur entre deux spans, la
      sélection recollait les lignes (« un calcul : unIMC »). Un <br> par hasEOL —
      même convention que la couche officielle de pdf.js — rend le « \n » à la copie.
    - LARGEUR : chaque span est dessiné en sans-serif, pas dans la police du PDF ; sa
      largeur naturelle diffère donc du texte peint sur le canvas (jusqu'à +60 px sur
      un titre), et la sélection/les surlignages débordaient. On l'étire (scaleX) à la
      largeur exacte donnée par pdf.js. Les items faits d'espaces seuls ne sont PAS
      étirés : entre deux cellules de tableau, ils couvriraient toute la case vide. */
export async function buildTextLayer(page, viewport, container) {
  const textContent = await page.getTextContent();
  container.replaceChildren();
  const frag = document.createDocumentFragment();
  const toFit = []; // [span, largeur cible en px, angle, espaces seuls]
  for (const item of textContent.items) {
    if (!item.str) {
      if (item.hasEOL) frag.appendChild(document.createElement('br'));
      continue;
    }
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const angle = Math.atan2(tx[1], tx[0]);
    const fontHeight = Math.hypot(tx[2], tx[3]) || 1;
    const span = document.createElement('span');
    span.textContent = item.str;
    span.style.position = 'absolute';
    span.style.whiteSpace = 'pre';
    span.style.left = `${tx[4]}px`;
    span.style.top = `${tx[5] - fontHeight}px`;
    span.style.fontSize = `${fontHeight}px`;
    span.style.fontFamily = 'sans-serif';
    span.style.lineHeight = '1';
    span.style.transformOrigin = '0% 100%';
    frag.appendChild(span);
    toFit.push([span, item.width * viewport.scale, angle, !item.str.trim()]);
    if (item.hasEOL) frag.appendChild(document.createElement('br'));
  }
  container.appendChild(frag);
  // toutes les lectures de largeur PUIS toutes les écritures : un seul calcul de mise
  // en page pour la page entière, au lieu d'un par span. Mesure faite AVANT toute
  // transformation (largeur naturelle, non pivotée).
  const natural = toFit.map(([span]) => span.getBoundingClientRect().width);
  toFit.forEach(([span, target, angle, blank], k) => {
    const parts = [];
    if (angle) parts.push(`rotate(${angle}rad)`);
    if (!blank && natural[k] > 0 && target > 0) parts.push(`scaleX(${target / natural[k]})`);
    if (parts.length) span.style.transform = parts.join(' ');
  });
}

/** texte d'une sélection, tel qu'il doit sortir de l'app. pdf.js normalise ses
    caractères de compatibilité (ligatures « ﬁ », espaces insécables…) ; `inline`
    replie en plus tous les blancs sur une ligne — même règle que `inline()` du
    gabarit (ficheToText.js), pour le texte d'un surlignage. */
export function cleanSelectedText(raw, { inline = false } = {}) {
  const t = pdfjsLib.normalizeUnicode(raw || '').replace(/\u0000/g, '');
  return inline ? t.replace(/\s+/g, ' ').trim() : t;
}

/* ============================================================
   ANCRAGE D'UN SURLIGNAGE DANS LE TEXTE (étape 3).
   Un surlignage garde ses `rects` (géométrie au moment de la création — servent
   encore à l'export PDF annoté et de repli), et gagne un `anchor` : la position
   dans le texte de la page, en indices de morceaux pdf.js + caractères :
     { v: 1, start: { item, char }, end: { item, char } }   (end.char exclu)
   `item` = index du <span> dans la couche de texte = index des items NON VIDES de
   getTextContent (même contrat que computePageTextMap). C'est déterministe pour un
   même PDF : l'ancre ne dépend ni du zoom, ni de l'écran, ni de la couche de texte.
   À l'affichage, les rects sont RECALCULÉS depuis l'ancre (Range DOM) — un surlignage
   reste donc collé au texte même si la couche change un jour. Garde-fou : si le texte
   retrouvé par l'ancre n'est plus exactement `texte` (autre version de pdf.js, PDF
   remplacé…), on affiche les rects stockés plutôt qu'un surlignage au mauvais endroit.
   ============================================================ */

/** borne d'une sélection (nœud DOM + offset) → position { item, char }. La borne
    tombe le plus souvent DANS le texte d'un span ; sinon (glisser terminé dans le vide,
    sur un <br>, sur une autre page), on prend le premier caractère du premier span
    APRÈS elle (début) ou le dernier caractère du dernier span AVANT elle (fin). */
export function boundaryToPosition(spans, node, offset, edge) {
  if (node.nodeType === Node.TEXT_NODE) {
    const idx = spans.indexOf(node.parentElement);
    if (idx >= 0) return { item: idx, char: offset };
  }
  const probe = document.createRange();
  probe.setStart(node, offset);
  if (edge === 'start') {
    for (let i = 0; i < spans.length; i++) {
      if (spans[i].firstChild && probe.comparePoint(spans[i].firstChild, 0) >= 0) return { item: i, char: 0 };
    }
    return null;
  }
  for (let i = spans.length - 1; i >= 0; i--) {
    const t = spans[i].firstChild;
    if (t && probe.comparePoint(t, t.length) <= 0) return { item: i, char: t.length };
  }
  return null;
}

/** Range DOM (sélection) → ancre sur CETTE page (une sélection qui déborde sur la page
    suivante est bornée à la fin de celle-ci). null si rien de sélectionné ici. */
export function anchorFromRange(container, range) {
  const spans = [...container.querySelectorAll('span')];
  const start = boundaryToPosition(spans, range.startContainer, range.startOffset, 'start');
  const end = boundaryToPosition(spans, range.endContainer, range.endOffset, 'end');
  if (!start || !end) return null;
  if (end.item < start.item || (end.item === start.item && end.char <= start.char)) return null;
  return { v: 1, start, end };
}

/** ancre → Range DOM sur la couche de texte montée, ou null si l'ancre ne correspond
    à aucun texte de cette page (indices hors bornes). */
export function rangeFromAnchor(container, anchor) {
  if (!container || !anchor || !anchor.start || !anchor.end) return null;
  const spans = container.querySelectorAll('span');
  const s = spans[anchor.start.item] && spans[anchor.start.item].firstChild;
  const e = spans[anchor.end.item] && spans[anchor.end.item].firstChild;
  if (!s || !e || anchor.start.char > s.length || anchor.end.char > e.length) return null;
  try {
    const r = document.createRange();
    r.setStart(s, anchor.start.char);
    r.setEnd(e, anchor.end.char);
    return r;
  } catch (err) { return null; }
}

/** rects d'un Range, normalisés [0,1] par rapport à la page, sans chevauchements : un
    span entièrement couvert remonte à la fois sa boîte et celle de son texte, deux
    rectangles presque identiques qui, en fusion « multiply », dessineraient une tache
    plus foncée. On ne garde que le plus grand des deux. */
export function rectsFromRange(container, range) {
  const cr = container.getBoundingClientRect();
  if (!cr.width || !cr.height) return [];
  const inside = (a, b) => a.left >= b.left - 0.5 && a.top >= b.top - 0.5 && a.right <= b.right + 0.5 && a.bottom <= b.bottom + 0.5;
  const kept = [];
  for (const r of range.getClientRects()) {
    if (!(r.width > 0 && r.height > 0)) continue;
    if (kept.some((k) => inside(r, k))) continue;
    for (let i = kept.length - 1; i >= 0; i--) if (inside(kept[i], r)) kept.splice(i, 1);
    kept.push(r);
  }
  return kept.map((r) => ({ x: (r.left - cr.left) / cr.width, y: (r.top - cr.top) / cr.height, width: r.width / cr.width, height: r.height / cr.height }));
}

/** ordre de lecture des surlignages : page, puis position dans le texte (ancre), à
    défaut hauteur sur la page (anciens surlignages sans ancre), puis date. */
export function compareHighlights(a, b) {
  if (a.page !== b.page) return a.page - b.page;
  if (a.anchor && b.anchor) {
    return (a.anchor.start.item - b.anchor.start.item) || (a.anchor.start.char - b.anchor.start.char);
  }
  const ya = a.rects && a.rects[0] ? a.rects[0].y : 0;
  const yb = b.rects && b.rects[0] ? b.rects[0].y : 0;
  return (ya - yb) || String(a.createdAt).localeCompare(String(b.createdAt));
}

/** carte de position du texte d'une page, normalisée [0,1] (indépendante du zoom et
    du DOM) — pour la recherche (matching textuel) et la détection du bloc cliqué en
    mode édition. L'ORDRE et le FILTRE (!item.str) doivent rester identiques à
    buildTextLayer : itemIdx ici == index du <span> réel dans la textLayer. */
export async function computePageTextMap(pdfDoc, n) {
  const page = await pdfDoc.getPage(n);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const items = [];
  for (const item of tc.items) {
    if (!item.str) continue;
    const tx = pdfjsLib.Util.transform(vp.transform, item.transform);
    const scaleX = Math.hypot(tx[0], tx[1]) || 1;
    const fontHeight = Math.hypot(tx[2], tx[3]) || 1;
    const x0 = tx[4], y1 = tx[5], y0 = tx[5] - fontHeight;
    const x1 = x0 + (item.width || 0) * scaleX;
    const style = tc.styles && tc.styles[item.fontName];
    items.push({
      str: item.str, x0: x0 / vp.width, y0: y0 / vp.height, x1: x1 / vp.width, y1: y1 / vp.height,
      fontSize: fontHeight / vp.height, fontFamily: (style && style.fontFamily) || 'sans-serif',
    });
  }
  return items;
}

/** Chantier 2 : géométrie EXACTE d'une liste de matches (page courante, réellement
    montée), via l'API Range du DOM sur le vrai nœud texte du <span> concerné — pas
    une interpolation par fraction de caractères (qui déborde sur du texte justifié/
    en tableau). Le scale courant n'intervient jamais explicitement : on lit les
    rects RÉELLEMENT rendus (getBoundingClientRect/getClientRects), donc aucun risque
    de double application ou d'oubli du facteur de zoom. */
export function computeMatchRectsFromDom(container, matches) {
  if (!container || !matches.length) return [];
  const spans = container.querySelectorAll('span');
  const cr = container.getBoundingClientRect();
  if (!cr.width || !cr.height) return [];
  const out = [];
  matches.forEach((m) => {
    const span = spans[m.itemIdx];
    const textNode = span && span.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;
    const len = textNode.textContent.length;
    const start = Math.max(0, Math.min(m.charStart, len));
    const end = Math.max(start, Math.min(m.charEnd, len));
    if (start === end) return;
    try {
      const range = document.createRange();
      range.setStart(textNode, start);
      range.setEnd(textNode, end);
      Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0).forEach((r, ri) => {
        out.push({ idx: m.idx, ri, rect: { x: (r.left - cr.left) / cr.width, y: (r.top - cr.top) / cr.height, width: r.width / cr.width, height: r.height / cr.height } });
      });
    } catch (e) { /* offset invalide (page changée entre-temps) — ignore */ }
  });
  return out;
}
