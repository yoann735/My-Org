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
/** taille par défaut d'une boîte posée d'un simple clic (fraction de page).
    COMPACTE depuis le 01/10 (avant : 0.30 × 0.075, « trop grande ») : une ligne de
    texte et sa poignée. Elle n'a plus besoin d'être grande d'avance : la HAUTEUR
    d'une boîte est un minimum, la boîte grandit avec son texte (voir NoteBox). */
export const BOITE_DEFAUT = { width: 0.2, height: 0.036 };
export const BOITE_MIN = { width: 0.04, height: 0.022 };

/* PALETTE DU CRAYON (et du texte libre) — 01/10. Les 4 couleurs des surlignages
   ont un SENS (prioritaire, cloze…) et restent seules pour eux ; le crayon, lui,
   dessine : il a droit à une vraie palette. Mêmes ids que COLORS pour les 4
   premières, donc un trait d'avant garde exactement sa couleur. Une couleur
   PERSONNALISÉE est enregistrée telle quelle, en hexadécimal (« #12ab34 »). */
export const PALETTE_CRAYON = [
  { id: 'noir', hex: '#1F1F24', label: 'Noir' },
  { id: 'gris', hex: '#7A7A85', label: 'Gris' },
  { id: 'rouge', hex: '#E5383B', label: 'Rouge' },
  { id: 'orange', hex: '#F28C28', label: 'Orange' },
  { id: 'jaune', hex: '#FFD84D', label: 'Jaune' },
  { id: 'vert', hex: '#8BE38B', label: 'Vert clair' },
  { id: 'vertfonce', hex: '#1E9E5A', label: 'Vert' },
  { id: 'bleu', hex: '#7EC8FF', label: 'Bleu clair' },
  { id: 'bleufonce', hex: '#2563EB', label: 'Bleu' },
  { id: 'violet', hex: '#8B5CF6', label: 'Violet' },
  { id: 'rose', hex: '#FF9FD1', label: 'Rose' },
  { id: 'marron', hex: '#8B5A2B', label: 'Marron' },
];
const PALETTE_HEX = { ...Object.fromEntries(PALETTE_CRAYON.map((c) => [c.id, c.hex])), blanc: '#FFFFFF' }; // blanc : cartes du tableau d'avant le 02/10 soir
/** couleur affichable d'un id de palette (surlignage, crayon) ou d'un hex libre. */
export function couleurHex(c, repli = '#FFD84D') {
  if (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) return c;
  return PALETTE_HEX[c] || repli;
}

/** FOND DE PAGE NOIR (08/10) : une encre sombre devient claire (même teinte, luminosité
    inversée) ; une couleur déjà claire est gardée telle quelle. */
export function lisibleSurNoir(c) {
  const hex = couleurHex(c, '#FFD84D');
  const n = parseInt(hex.slice(1), 16);
  let r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let L = (max + min) / 2;
  if (0.299 * r + 0.587 * g + 0.114 * b >= 0.45) return hex;
  const d = max - min;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * L - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  L = Math.max(0.72, 1 - L);
  const C = (1 - Math.abs(2 * L - 1)) * s, X = C * (1 - Math.abs(((h / 60) % 2) - 1)), m = L - C / 2;
  [r, g, b] = h < 60 ? [C, X, 0] : h < 120 ? [X, C, 0] : h < 180 ? [0, C, X] : h < 240 ? [0, X, C] : h < 300 ? [X, 0, C] : [C, 0, X];
  const v = (x) => Math.round((x + m) * 255).toString(16).padStart(2, '0');
  return '#' + v(r) + v(g) + v(b);
}

/** teinte FONCÉE d'une couleur de boîte, pour que sa flèche reste lisible sur le
    blanc de la page (les couleurs « cours » sont des pastels). Table fixe pour les 4
    couleurs « cours » (rendu d'avant inchangé) ; une couleur perso claire est
    assombrie, une couleur déjà foncée est gardée telle quelle. */
export const COULEUR_FLECHE = { jaune: '#B8920A', vert: '#2F8F3A', bleu: '#2A72B8', rose: '#C2457F' };
export function couleurFoncee(c) {
  if (COULEUR_FLECHE[c]) return COULEUR_FLECHE[c];
  const hex = couleurHex(c, '#FFD84D');
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum < 0.55) return hex;
  const k = 0.62; // assombrit vers ~la même luminosité que la table fixe
  const h = (v) => Math.round(v * k).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** opacité du FOND d'une boîte : les pastels « cours » restent pleins (0,92, rendu
    d'avant) ; une couleur perso foncée devient une teinte légère, sinon le texte
    noir de la boîte serait illisible (même idée que les surlignages perso). */
export function opaciteFondBoite(c) {
  const hex = couleurHex(c);
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum >= 0.6 ? 0.92 : 0.3;
}

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
/* ============================================================
   COUCHE OCR (05/10, docs/compte-rendu-ocr.md) — une page IMAGE reçoit les mots
   reconnus par l'OCR (ocr/pipeline.js), en unités PDF. Ils deviennent des « items »
   au MÊME contrat que ceux de getTextContent : un par mot, dans l'ordre de lecture
   (ligne par ligne), avec l'espace qui le suit sur la ligne et une fin de ligne
   après le dernier. Chaque item couvre son mot ET l'espace jusqu'au mot suivant :
   la sélection est continue, la copie rend « mot mot\nmot ». buildTextLayer (couche
   sélectionnable) et computePageTextMap (recherche) les construisent à l'identique :
   les ancres des surlignages (index de span) restent valables.
   Une page qui a un vrai texte PDF garde son texte natif (ocrPage.natif).
   ============================================================ */
export function itemsDepuisOcr(ocrPage) {
  const mots = (ocrPage && ocrPage.words) || [];
  const tries = [...mots].sort((a, b) => (a.line - b.line) || (a.x - b.x));
  const items = [];
  for (let i = 0; i < tries.length; i++) {
    const m = tries[i], suivant = tries[i + 1];
    const memeLigne = suivant && suivant.line === m.line && suivant.x > m.x;
    items.push({
      str: m.t + (memeLigne ? ' ' : ''),
      x: m.x, y: m.y, h: m.h,
      w: memeLigne ? Math.max(m.w, suivant.x - m.x) : m.w,
      eol: !memeLigne,
    });
  }
  return items;
}
export const pageOcrUtile = (ocrPage) => !!(ocrPage && !ocrPage.natif && ocrPage.words && ocrPage.words.length);

export async function buildTextLayer(page, viewport, container, ocrPage = null) {
  if (pageOcrUtile(ocrPage)) { construireCoucheOcr(viewport, container, ocrPage); return; }
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
  installerFinDeTexte(container);
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

function construireCoucheOcr(viewport, container, ocrPage) {
  const k = viewport.scale;
  container.replaceChildren();
  const frag = document.createDocumentFragment();
  const toFit = [];
  for (const it of itemsDepuisOcr(ocrPage)) {
    const span = document.createElement('span');
    span.textContent = it.str;
    span.className = 'pdfr-ocr-mot';
    span.style.position = 'absolute';
    span.style.whiteSpace = 'pre';
    span.style.left = `${it.x * k}px`;
    span.style.top = `${it.y * k}px`;
    span.style.fontSize = `${Math.max(1, it.h * k)}px`;
    span.style.fontFamily = 'sans-serif';
    span.style.lineHeight = '1';
    span.style.transformOrigin = '0% 0%';
    frag.appendChild(span);
    toFit.push([span, it.w * k]);
    if (it.eol) frag.appendChild(document.createElement('br'));
  }
  container.appendChild(frag);
  installerFinDeTexte(container);
  const naturel = toFit.map(([span]) => span.getBoundingClientRect().width);
  toFit.forEach(([span, cible], i) => { if (naturel[i] > 0 && cible > 0) span.style.transform = `scaleX(${cible / naturel[i]})`; });
}

/** position dans le TEXTE la plus proche d'un point écran : la ligne (span) la
    plus proche verticalement, puis le caractère à la hauteur du point, borné aux
    extrémités de la ligne. null si la couche ne contient aucun texte. */
export function positionTexteProche(container, x, y) {
  let best = null, dBest = Infinity;
  for (const sp of container.querySelectorAll('span')) {
    const t = sp.firstChild;
    if (!t || t.nodeType !== Node.TEXT_NODE || !t.length) continue;
    const r = sp.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    const d = dy * 1000 + dx; // la LIGNE d'abord, puis la plus proche horizontalement
    if (d < dBest) { dBest = d; best = { sp, t, r }; }
  }
  if (!best) return null;
  const { t, r } = best;
  if (x <= r.left) return { node: t, offset: 0 };
  if (x >= r.right) return { node: t, offset: t.length };
  const c = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, r.top + r.height / 2) : null;
  if (c && c.startContainer === t) return { node: t, offset: c.startOffset };
  // repli : proportion de la largeur (spans étirés à la largeur exacte du texte)
  return { node: t, offset: Math.max(0, Math.min(t.length, Math.round(((x - r.left) / r.width) * t.length))) };
}

/* ============================================================
   SÉLECTION QUI NE « SAUTE » PLUS (02/10 nuit) — la parade de pdf.js (élément
   « endOfContent »). Sur une couche de spans en position absolue, quand le curseur
   passe dans un BLANC (entre deux lignes, dans une marge), le navigateur pose la
   borne de la sélection sur le conteneur lui-même — souvent sa FIN : la sélection
   englobait alors tout le reste de la page (mesuré : 13 → 167 caractères d'un coup).
   1. Un élément « fin de texte », non sélectionnable, couvre toute la couche PENDANT
      le glisser, sous les spans : les blancs ne touchent plus le conteneur.
   2. À chaque changement de sélection, cet élément est déplacé JUSTE APRÈS le span
      de la borne mobile : si le navigateur retombe malgré tout sur lui, la borne reste
      au bout de la ligne en cours, pas au bout de la page.
   À la fin du geste, il retourne à la fin de la couche.
   ============================================================ */
function installerFinDeTexte(container) {
  const fin = document.createElement('div');
  fin.className = 'pdfr-fin-texte';
  container.appendChild(fin);
  container.__finDeTexte = fin;
  ecouterSelectionTexte();
}
let ecouteSelection = false;
function ecouterSelectionTexte() {
  if (ecouteSelection || typeof document === 'undefined') return;
  ecouteSelection = true;
  let precedente = null;
  const finDuGeste = () => {
    document.querySelectorAll('.pdfr-textlayer.en-selection').forEach((tl) => {
      tl.classList.remove('en-selection');
      if (tl.__finDeTexte && tl.lastChild !== tl.__finDeTexte) tl.appendChild(tl.__finDeTexte);
    });
    precedente = null;
  };
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const tl = e.target && e.target.closest ? e.target.closest('.pdfr-textlayer') : null;
    if (!tl) return;
    tl.classList.add('en-selection');
    precedente = null; // nouvelle sélection : c'est la FIN qui bougera (référence remise à zéro, comme pdf.js)
    // appuyer DANS une sélection existante puis glisser déplaçait le texte sélectionné
    // (glisser-déposer natif) au lieu de sélectionner : chaque appui repart à neuf
    // (Maj+clic garde l'extension de la sélection)
    if (!e.shiftKey) { const s = document.getSelection(); if (s && !s.isCollapsed) s.removeAllRanges(); }
  }, true);
  document.addEventListener('pointerup', finDuGeste, true);
  document.addEventListener('pointercancel', finDuGeste, true);
  window.addEventListener('blur', finDuGeste);
  /* 3. Le curseur est dans un BLANC (entre deux lignes, dans une marge) : la borne
     mobile va au caractère le plus proche du curseur — ligne la plus proche, puis la
     position sur cette ligne, bornée à ses extrémités. La sélection suit exactement
     le curseur, comme dans un document ordinaire (marge droite = bout de la ligne). */
  let rafBlanc = 0, dernier = null;
  document.addEventListener('pointermove', (e) => {
    if (!(e.buttons & 1)) return;
    const tl = document.querySelector('.pdfr-textlayer.en-selection');
    if (!tl) return;
    const cible = e.target;
    if (cible && cible.tagName === 'SPAN' && tl.contains(cible)) return; // sur le texte : le navigateur fait déjà juste
    dernier = { x: e.clientX, y: e.clientY, tl };
    if (rafBlanc) return;
    rafBlanc = requestAnimationFrame(() => {
      rafBlanc = 0;
      const sel = document.getSelection();
      if (!dernier || !sel || !sel.rangeCount || !dernier.tl.contains(sel.anchorNode)) return;
      const pos = positionTexteProche(dernier.tl, dernier.x, dernier.y);
      if (pos && (sel.focusNode !== pos.node || sel.focusOffset !== pos.offset)) { try { sel.extend(pos.node, pos.offset); } catch (err) { /* ignore */ } }
    });
  }, true);
  document.addEventListener('selectionchange', () => {
    const sel = document.getSelection();
    if (!sel || !sel.rangeCount) { precedente = null; return; }
    const range = sel.getRangeAt(0);
    if (range.collapsed) { precedente = range.cloneRange(); return; } // simple curseur : rien à déplacer
    if (!document.querySelector('.pdfr-textlayer.en-selection')) { precedente = range.cloneRange(); return; }
    // quelle borne bouge ? (le début si la fin n'a pas changé)
    const debutBouge = !!precedente && (range.compareBoundaryPoints(Range.END_TO_END, precedente) === 0 || range.compareBoundaryPoints(Range.START_TO_END, precedente) === 0);
    let ancre = debutBouge ? range.startContainer : range.endContainer;
    if (ancre && ancre.nodeType === 3) ancre = ancre.parentNode;
    const tl = ancre && ancre.parentElement ? ancre.parentElement.closest('.pdfr-textlayer') : null;
    const fin = tl && tl.__finDeTexte;
    if (fin && ancre !== fin && ancre.parentElement === tl) tl.insertBefore(fin, debutBouge ? ancre : ancre.nextSibling);
    precedente = range.cloneRange();
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

/* ============================================================
   PAS DE SURLIGNAGE PAR-DESSUS UN SURLIGNAGE (nuit du 30/09).
   Avant, re-sélectionner un passage déjà surligné créait un second surlignage
   au même endroit : deux rectangles en « multiply » → couleur ré-accentuée, et
   un doublon dans le panneau et à l'export. Désormais on retire de la nouvelle
   ancre tout ce que couvrent déjà les ancres existantes de la page : seuls les
   morceaux LIBRES sont surlignés (souvent zéro, parfois deux bouts de part et
   d'autre d'un surlignage existant).
   ============================================================ */
const cmpPos = (a, b) => (a.item - b.item) || (a.char - b.char);

/** [anchor] moins l'union des [existantes] → liste d'ancres disjointes, dans
    l'ordre du texte. Fonction pure. */
export function soustraireAncres(anchor, existantes) {
  if (!anchor || !anchor.start || !anchor.end) return [];
  const autres = (existantes || [])
    .filter((a) => a && a.start && a.end && cmpPos(a.end, anchor.start) > 0 && cmpPos(a.start, anchor.end) < 0)
    .sort((a, b) => cmpPos(a.start, b.start));
  const libres = [];
  let curseur = anchor.start;
  for (const a of autres) {
    if (cmpPos(a.start, curseur) > 0) libres.push({ v: 1, start: curseur, end: cmpPos(a.start, anchor.end) < 0 ? a.start : anchor.end });
    if (cmpPos(a.end, curseur) > 0) curseur = a.end;
    if (cmpPos(curseur, anchor.end) >= 0) break;
  }
  if (cmpPos(curseur, anchor.end) < 0) libres.push({ v: 1, start: curseur, end: anchor.end });
  return libres;
}

/** part de la surface de `r` couverte par au moins un rectangle de `autres`
    (approximation : le plus grand recouvrement unitaire). Sert aux anciens
    surlignages SANS ancre, qu'on ne peut comparer que géométriquement. */
export function partCouverte(r, autres) {
  const aire = r.width * r.height;
  if (!aire) return 1;
  let max = 0;
  for (const o of autres || []) {
    const w = Math.min(r.x + r.width, o.x + o.width) - Math.max(r.x, o.x);
    const h = Math.min(r.y + r.height, o.y + o.height) - Math.max(r.y, o.y);
    if (w > 0 && h > 0) max = Math.max(max, (w * h) / aire);
  }
  return max;
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
export async function computePageTextMap(pdfDoc, n, ocrPage = null) {
  if (pageOcrUtile(ocrPage)) {
    const W = ocrPage.width || 1, H = ocrPage.height || 1;
    return itemsDepuisOcr(ocrPage).map((it) => ({
      str: it.str, x0: it.x / W, y0: it.y / H, x1: (it.x + it.w) / W, y1: (it.y + it.h) / H,
      fontSize: it.h / H, fontFamily: 'sans-serif', ocr: true,
    }));
  }
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

/* ============================================================
   CRAYON — géométrie du trait (étape 6). Fonctions PURES, sans DOM : elles se
   testent hors navigateur, ce qui est précieux pour de la géométrie.

   Tous les points sont normalisés [0,1] par rapport à la page, comme les
   surlignages et les boîtes — donc indépendants du zoom.

   LE MODE AIMANT, en deux temps :
     1. SIMPLIFIER (Ramer–Douglas–Peucker) : retire les points qui n'apportent
        rien à la forme. C'est ce qui enlève le tremblement de la main.
     2. ACCROCHER : tout segment à moins de TOLERANCE_DEG d'un multiple de 45°
        est redressé exactement sur cet axe. Une ligne presque droite devient
        droite ; une courbe voulue reste une courbe, parce que ses segments ne
        sont jamais tous proches d'un même axe.
   Les extrémités sont recousues au fur et à mesure : chaque segment redressé
   part du point d'arrivée du précédent, donc le trait ne se disloque pas.
   ============================================================ */

export const EPAISSEURS = [
  { id: 'fin', label: 'Fin', v: 0.0022 },
  { id: 'moyen', label: 'Moyen', v: 0.0042 },
  { id: 'epais', label: 'Épais', v: 0.0075 },
];
const TOLERANCE_DEG = 7;   // au-delà, on considère que l'angle est voulu
/* Seuil de simplification, en FRACTION DE HAUTEUR DE PAGE. Réglé à l'usage :
   à 0,0016 (~2 px au zoom courant) un tremblement de main ordinaire passait
   entre les mailles — les points étaient conservés, donc chaque micro-segment
   gardait un angle de ±10°, donc l'accrochage angulaire ne s'appliquait à aucun
   et le trait restait ondulé. 0,0035 (~5 px) absorbe le tremblement sans
   toucher aux courbes voulues, dont l'écart se compte en dizaines de pixels. */
const EPSILON_RDP = 0.0035;

/** distance d'un point à un segment (au carré, on ne compare que des distances). */
function distanceCarreeAuSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return (p[0] - (a[0] + t * dx)) ** 2 + (p[1] - (a[1] + t * dy)) ** 2;
}

/** Ramer–Douglas–Peucker, itératif (une pile plutôt que la récursion : un trait
    peut compter des milliers de points, et on ne veut pas dépendre de la pile
    d'appels du moteur). */
export function simplifierRDP(points, epsilon = EPSILON_RDP) {
  const n = (points || []).length;
  if (n < 3) return [...(points || [])];
  const garder = new Array(n).fill(false);
  garder[0] = garder[n - 1] = true;
  const pile = [[0, n - 1]];
  const eps2 = epsilon * epsilon;
  while (pile.length) {
    const [i, j] = pile.pop();
    let max = 0, idx = -1;
    for (let k = i + 1; k < j; k++) {
      const d = distanceCarreeAuSegment(points[k], points[i], points[j]);
      if (d > max) { max = d; idx = k; }
    }
    if (idx !== -1 && max > eps2) { garder[idx] = true; pile.push([i, idx], [idx, j]); }
  }
  return points.filter((_, i) => garder[i]);
}

/** redresse les segments presque horizontaux / verticaux / à 45°. `ratio` corrige
    le fait qu'une page n'est pas carrée : sans lui, un trait visuellement
    horizontal ne le serait pas dans l'espace normalisé. */
export function accrocherAngles(points, ratio = 1, toleranceDeg = TOLERANCE_DEG) {
  if ((points || []).length < 2) return [...(points || [])];
  const sortie = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = sortie[i - 1];
    const b = points[i];
    const dx = (b[0] - a[0]) * ratio, dy = b[1] - a[1];
    const longueur = Math.hypot(dx, dy);
    if (longueur === 0) { sortie.push([a[0], a[1]]); continue; }
    const angle = Math.atan2(dy, dx);
    const cible = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    if (Math.abs(angle - cible) * 180 / Math.PI <= toleranceDeg) {
      sortie.push([a[0] + (Math.cos(cible) * longueur) / ratio, a[1] + Math.sin(cible) * longueur]);
    } else {
      sortie.push([b[0], b[1]]);
    }
  }
  return sortie;
}

/** Traitement complet appliqué AU RELÂCHEMENT. Sans aimant, la FORME tracée est
    conservée : on ne retire que les points redondants à l'échelle du sous-pixel
    (EPSILON_FIN), invisibles mais qui alourdissent le stockage et la synchro
    maintenant que la capture lit tous les événements coalescés. */
const EPSILON_FIN = 0.0004;
export function lisserTrait(points, { aimant = false, ratio = 1 } = {}) {
  const p = (points || []).filter((q) => Array.isArray(q) && q.length === 2);
  if (p.length < 2) return p;
  if (!aimant) return simplifierRDP(p, EPSILON_FIN);
  return accrocherAngles(simplifierRDP(p), ratio);
}

/* ---- DEUX MODES DE CRAYON (nuit du 30/09) ----
   - « dessin » : trait fin, doux — rendu en courbes, pas en segments ;
   - « surligneur » : trait épais (≈ une ligne de texte de cours), semi-transparent
     et en fusion « multiply » : le texte dessous reste noir et lisible.
   Un trait sans `mode` (tous ceux d'avant) est un trait de dessin. */
export const MODES_CRAYON = [
  { id: 'dessin', label: 'Dessin' },
  { id: 'surligneur', label: 'Surligneur' },
];
/** épaisseur du surligneur, en fraction de hauteur de page : une ligne de texte
    en 11 pt sur A4 fait ≈ 0,013 ; un peu plus pour couvrir jambages et accents. */
export const EPAISSEUR_SURLIGNEUR = 0.017;
export const OPACITE_SURLIGNEUR = 0.38;
export const modeDuTrait = (t) => (t && t.mode === 'surligneur' ? 'surligneur' : 'dessin');

/** STREAMLINE (lissage en direct, façon Procreate) : chaque nouveau point ne
    rejoint qu'une fraction du chemin vers la position réelle du pointeur. La
    main tremble, le trait non. `force` 0 = brut, 1 = immobile. */
export function suivreEnDouceur(dernier, brut, force = 0.45) {
  if (!dernier) return brut;
  return [dernier[0] + (brut[0] - dernier[0]) * (1 - force), dernier[1] + (brut[1] - dernier[1]) * (1 - force)];
}

/** Le clic est-il sur ce trait ? (gomme) — distance au segment le plus proche.
    `seuil` en fraction de page : un trait fin doit rester facile à viser, et un
    trait de surligneur se touche sur toute son épaisseur. */
export function traitTouche(trait, x, y, seuil = 0.012) {
  const pts = (trait && trait.points) || [];
  if (!pts.length) return false;
  const s = Math.max(seuil, modeDuTrait(trait) === 'surligneur' ? (trait.epaisseur || EPAISSEUR_SURLIGNEUR) * 0.6 : 0);
  const s2 = s * s;
  if (pts.length === 1) return distanceCarreeAuSegment([x, y], pts[0], pts[0]) <= s2;
  for (let i = 1; i < pts.length; i++) {
    if (distanceCarreeAuSegment([x, y], pts[i - 1], pts[i]) <= s2) return true;
  }
  return false;
}

/** points normalisés → attribut `points` d'un <polyline> SVG en pourcentage de
    la boîte de la page (viewBox 0 0 100 100, preserveAspectRatio="none"). */
export function pointsVersSvg(points) {
  return (points || []).map(([x, y]) => `${(x * 100).toFixed(3)},${(y * 100).toFixed(3)}`).join(' ');
}

/** points normalisés → attribut `d` d'un <path> LISSÉ (même repère que
    pointsVersSvg). Courbes quadratiques passant par les MILIEUX des segments,
    chaque point servant de point de contrôle : la courbe est continue et sans
    angle, et elle reste collée au tracé (elle ne s'en écarte jamais de plus
    d'une demi-distance entre deux points échantillonnés, soit < 1 px). */
export function cheminLisse(points) {
  const p = (points || []).map(([x, y]) => [x * 100, y * 100]);
  if (!p.length) return '';
  const f = (v) => v.toFixed(3);
  if (p.length === 1) return `M${f(p[0][0])} ${f(p[0][1])} l0.001 0`; // un point : un rond (linecap)
  if (p.length === 2) return `M${f(p[0][0])} ${f(p[0][1])} L${f(p[1][0])} ${f(p[1][1])}`;
  let d = `M${f(p[0][0])} ${f(p[0][1])}`;
  for (let i = 1; i < p.length - 1; i++) {
    const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2;
    d += ` Q${f(p[i][0])} ${f(p[i][1])} ${f(mx)} ${f(my)}`;
  }
  const z = p[p.length - 1];
  return `${d} L${f(z[0])} ${f(z[1])}`;
}
