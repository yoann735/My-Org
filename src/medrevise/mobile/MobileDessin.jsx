/* ============================================================
   MedRevise — DESSIN AU DOIGT SUR LE TÉLÉPHONE (02/10).
   Mécanique : docs/mecanique-dessin-mobile.md §3.

   Un canvas infini en SVG : un groupe « monde » transformé (translate + scale)
   porte des éléments VECTORIELS — traits (crayon, surligneur) et formes (les 12 de
   pdf/formes.js). Rien n'est pixelisé avant l'export.

   GESTES (Pointer Events, `touch-action: none` sur la surface : ni défilement ni
   zoom du navigateur) :
   - 1 doigt : l'outil actif (crayon, surligneur, forme, gomme ; Main = déplacer) ;
   - 2 doigts : déplacer + zoomer, centré entre les doigts ; un 2e doigt posé
     pendant un trait l'ABANDONNE (c'était le début d'un pincement).
   FLUIDITÉ : pendant un geste, on écrit directement dans le DOM (le `d` du trait en
   cours, le `transform` du monde), sans rendu React ; React reprend au lever du doigt.
   ============================================================ */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { IconeOutil, IconeForme } from '../pdf/IconesOutils.jsx';
import { SelecteurCouleurs } from '../pdf/Couleurs.jsx';
import { TYPES_FORMES, cheminForme, estTrait, estFermee } from '../pdf/formes.js';
import { couleurHex, avecAlpha, suivreEnDouceur } from '../pdf/pdfShared.js';

export const EPAISSEURS = [2, 4, 7, 12, 20]; // px à zoom 1
const CLE_BROUILLON = 'medrevise.dessinMobile';
const OUTILS = [
  { id: 'crayon', label: 'Crayon' },
  { id: 'surligneur', label: 'Surligneur' },
  { id: 'forme', label: 'Formes' },
  { id: 'texte', label: 'Texte' },
  { id: 'gomme', label: 'Gomme' },
  { id: 'main', label: 'Main' },
];
const ZMIN = 0.2, ZMAX = 8;
/* ZONES DE TEXTE (02/10 soir) : des légendes écrites au clavier du téléphone. Elles ne
   sont PAS aplaties dans le PNG : elles voyagent à part (texte, position, taille,
   couleur) et deviennent, posées sur l'ordi, des TEXTES LIBRES du lecteur au-dessus de
   l'image — déplaçables et modifiables comme les autres. */
export const TAILLES_TEXTE = [14, 18, 24, 32, 44]; // px à zoom 1
export const POLICE_TEXTE = 'system-ui, -apple-system, "Segoe UI", sans-serif';
let ctxMesure = null;
/** largeur/hauteur (monde) d'une zone de texte. */
export function mesurerTexte(e) {
  const lignes = String(e.texte || '').split('\n');
  let w = 0;
  try {
    if (!ctxMesure) ctxMesure = document.createElement('canvas').getContext('2d');
    ctxMesure.font = `500 ${e.taille}px ${POLICE_TEXTE}`;
    for (const l of lignes) w = Math.max(w, ctxMesure.measureText(l || ' ').width);
  } catch (err) { w = Math.max(...lignes.map((l) => l.length)) * e.taille * 0.55; }
  return { w: Math.max(e.taille, w), h: lignes.length * e.taille * 1.25 };
}
const nouvelId = () => 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** chemin lissé (courbes quadratiques entre les milieux) en coordonnées monde. */
export function cheminTrait(points) {
  const p = points || [];
  if (!p.length) return '';
  const f = (v) => (Math.round(v * 10) / 10).toString();
  if (p.length === 1) return `M${f(p[0][0])} ${f(p[0][1])} l0.01 0`;
  let d = `M${f(p[0][0])} ${f(p[0][1])}`;
  for (let i = 1; i < p.length - 1; i++) {
    const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2;
    d += ` Q${f(p[i][0])} ${f(p[i][1])} ${f(mx)} ${f(my)}`;
  }
  const z = p[p.length - 1];
  return `${d} L${f(z[0])} ${f(z[1])}`;
}

/** simplification légère (on retire les points à moins de 0,6 px du précédent). */
function alleger(points) {
  const out = [];
  for (const q of points) {
    const d = out[out.length - 1];
    if (!d || Math.hypot(q[0] - d[0], q[1] - d[1]) >= 0.6) out.push(q);
  }
  return out;
}

/** boîte englobante (monde) d'un élément, épaisseur comprise. */
export function boiteElement(e) {
  if (e.type === 'texte') { const t = mesurerTexte(e); return { x: e.x - 2, y: e.y - 2, w: t.w + 4, h: t.h + 4 }; }
  if (e.type === 'trait') {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of e.points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const m = e.ep / 2 + 1;
    return { x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m };
  }
  const m = e.ep * 3 + 4; // pointes de flèche
  return { x: e.x - m, y: e.y - m, w: e.w + 2 * m, h: e.h + 2 * m };
}
export function boiteDessin(elements) {
  if (!elements.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of elements) { const b = boiteElement(e); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/* ENCRE (02/10 soir) : le canvas du téléphone est NOIR, la page du PDF est BLANCHE.
   Le noir et le blanc (et les gris extrêmes) y sont donc une même « encre » qui
   s'adapte au fond : claire à l'écran, foncée sur le papier — sinon un trait blanc
   (la couleur par défaut, visible sur noir) disparaîtrait une fois posé sur la page,
   et un ancien trait noir serait invisible sur le canvas. Les autres couleurs ne
   changent jamais. */
const ENCRE = { noir: '#F2F2F5', clair: '#1F1F24' };
export function couleurSurFond(c, fond = 'noir') {
  const hex = couleurHex(c, '#1F1F24');
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  if (lum < 0.2 || lum > 0.88) return ENCRE[fond] || hex;
  return hex;
}

/** rendu SVG d'un élément (sert à l'écran ET à l'export PNG). `fond` : 'noir'
    (canvas du téléphone, export sur fond noir) ou 'clair' (PDF, fond blanc). */
export function ElementDessin({ e, gommeLarg = 0, fond = 'noir' }) {
  const coul = couleurSurFond(e.couleur, fond);
  if (e.type === 'texte') {
    const lignes = String(e.texte || '').split('\n');
    const t = mesurerTexte(e);
    return (
      <g data-id={e.id} data-type="texte" transform={`translate(${e.x} ${e.y})`}>
        <text fontSize={e.taille} fill={coul} fontFamily={POLICE_TEXTE} fontWeight="500" dominantBaseline="hanging" style={{ whiteSpace: 'pre' }}>
          {lignes.map((l, i) => <tspan key={i} x={0} y={i * e.taille * 1.25}>{l || ' '}</tspan>)}
        </text>
        {gommeLarg > 0 && <rect className="md-gomme" data-id={e.id} data-plein="1" x={-6} y={-6} width={t.w + 12} height={t.h + 12} fill="transparent" />}
      </g>
    );
  }
  if (e.type === 'trait') {
    const d = cheminTrait(e.points);
    return (
      <g data-id={e.id}>
        <path d={d} fill="none" stroke={coul} strokeWidth={e.ep} strokeOpacity={e.opacite ?? 1} strokeLinecap="round" strokeLinejoin="round" />
        {gommeLarg > 0 && <path className="md-gomme" data-id={e.id} d={d} fill="none" stroke="transparent" strokeWidth={e.ep + gommeLarg} strokeLinecap="round" />}
      </g>
    );
  }
  // pointe plafonnée : avec un trait épais, 4 × l'épaisseur faisait une pointe énorme
  const { d, pointes } = cheminForme(e.forme, e.w, e.h, { fx: !!e.fx, fy: !!e.fy, epaisseur: e.ep, tete: Math.max(10, Math.min(e.ep * 2.6, 34)) });
  const plein = e.remplie && estFermee(e.forme);
  return (
    <g data-id={e.id} transform={`translate(${e.x} ${e.y})`}>
      <path d={d} fill={plein ? avecAlpha(coul, 0.2) : 'none'} stroke={coul} strokeWidth={e.ep} strokeLinecap="round" strokeLinejoin="round" />
      {pointes.map((p, i) => <path key={i} d={p} fill={coul} stroke={coul} strokeWidth={Math.min(e.ep, 2)} strokeLinejoin="round" />)}
      {gommeLarg > 0 && <path className="md-gomme" data-id={e.id} data-plein={plein ? '1' : '0'} d={d} fill="transparent" stroke="transparent" strokeWidth={e.ep + gommeLarg} strokeLinecap="round" />}
    </g>
  );
}

function lireBrouillon() {
  try { const v = JSON.parse(localStorage.getItem(CLE_BROUILLON) || 'null'); if (v && Array.isArray(v.elements)) return v; } catch (e) { /* ignore */ }
  return null;
}

/**
 * Le canvas. Expose (ref) : elements(), vider().
 * `barreHaut` : contenu ajouté à droite de la barre du haut (bouton Exporter).
 */
export const CanvasDessin = forwardRef(function CanvasDessin({ onRetour, barreHaut = null }, ref) {
  const brouillon = useMemo(lireBrouillon, []);
  const [elements, setElements] = useState(() => (brouillon ? brouillon.elements : []));
  const elementsRef = useRef(elements); elementsRef.current = elements;
  const [passe, setPasse] = useState([]); // états précédents (annuler)
  const [futur, setFutur] = useState([]); // rétablir
  const [cam, setCam] = useState(() => (brouillon && brouillon.cam) || { x: 0, y: 0, z: 1 });
  const camRef = useRef(cam); camRef.current = cam;
  const [outil, setOutil] = useState('crayon');
  const [couleur, setCouleur] = useState('blanc'); // fond noir : l'encre par défaut est claire (sur le PDF elle sortira noire)
  const [couleurSurl, setCouleurSurl] = useState('jaune');
  const [epIdx, setEpIdx] = useState(1);
  const [typeForme, setTypeForme] = useState('rectangle');
  const [remplie, setRemplie] = useState(false);
  const [apercu, setApercu] = useState(null); // forme en cours de tracé
  const [masques, setMasques] = useState(null); // éléments touchés par la gomme pendant le geste

  const svgRef = useRef(null), mondeRef = useRef(null), traitRef = useRef(null);
  const [tailleIdx, setTailleIdx] = useState(1);
  /* SAISIE D'UN TEXTE : un <textarea> TOUJOURS monté, placé et focalisé DANS le geste
     (pointerup) — iOS n'ouvre le clavier que sur un focus synchrone à un toucher. */
  const saisieRef = useRef(null);
  const [edition, setEdition] = useState(null); // { id|null, x, y, taille, couleur }
  const editionRef = useRef(null); editionRef.current = edition;
  const [glisseTexte, setGlisseTexte] = useState(null); // { id, dx, dy } pendant un déplacement
  const ouvrirSaisie = (ed, texteInitial) => {
    const ta = saisieRef.current;
    if (ta) {
      const c = camRef.current;
      // la surface est sous la barre du haut : le champ se place par rapport à elle
      const r = svgRef.current.getBoundingClientRect(), base = svgRef.current.parentElement.getBoundingClientRect();
      ta.value = texteInitial || '';
      ta.style.left = `${r.left - base.left + ed.x * c.z + c.x - 2}px`;
      ta.style.top = `${r.top - base.top + ed.y * c.z + c.y - c.z * ed.taille * 0.12}px`;
      ta.style.fontSize = `${ed.taille * c.z}px`;
      ta.style.color = couleurSurFond(ed.couleur, 'noir');
      ta.style.display = 'block';
      try { ta.focus({ preventScroll: true }); ta.setSelectionRange(ta.value.length, ta.value.length); } catch (err) { /* ignore */ }
    }
    setEdition(ed);
  };
  const terminerSaisie = () => {
    const ed = editionRef.current;
    if (!ed) return;
    const ta = saisieRef.current;
    const texte = ta ? ta.value.replace(/\s+$/, '') : '';
    if (ta) { ta.style.display = 'none'; ta.blur(); }
    setEdition(null);
    const els = elementsRef.current;
    if (ed.id) {
      const avant = els.find((x) => x.id === ed.id);
      if (!avant) return;
      if (!texte.trim()) valider(els.filter((x) => x.id !== ed.id));
      else if (texte !== avant.texte) valider(els.map((x) => (x.id === ed.id ? { ...x, texte } : x)));
    } else if (texte.trim()) {
      valider([...els, { id: nouvelId(), type: 'texte', x: ed.x, y: ed.y, texte, couleur: ed.couleur, taille: ed.taille }]);
    }
  };
  const texteSous = (wx, wy) => [...elementsRef.current].reverse().find((x) => {
    if (x.type !== 'texte') return false;
    const b = boiteElement(x), m = 10 / camRef.current.z;
    return wx >= b.x - m && wx <= b.x + b.w + m && wy >= b.y - m && wy <= b.y + b.h + m;
  });

  // ---- historique ----
  // L'état courant est CAPTURÉ avant les setters : une fonction de mise à jour est
  // exécutée par React plus tard, au rendu — après que `elementsRef.current` a déjà
  // reçu la NOUVELLE valeur (constaté : le 1er « annuler » ne faisait rien).
  const valider = useCallback((suivant) => {
    const avant = elementsRef.current;
    setPasse((p) => [...p.slice(-99), avant]);
    setFutur([]);
    setElements(suivant);
  }, []);
  const annuler = () => {
    if (!passe.length) return;
    const courant = elementsRef.current, precedent = passe[passe.length - 1];
    setFutur((f) => [courant, ...f]); setElements(precedent); setPasse((p) => p.slice(0, -1));
  };
  const retablir = () => {
    if (!futur.length) return;
    const courant = elementsRef.current, suivant = futur[0];
    setPasse((p) => [...p, courant]); setElements(suivant); setFutur((f) => f.slice(1));
  };
  const toutEffacer = () => { if (elementsRef.current.length) valider([]); };

  // ---- brouillon (best-effort) ----
  useEffect(() => {
    const t = setTimeout(() => { try { localStorage.setItem(CLE_BROUILLON, JSON.stringify({ elements, cam })); } catch (e) { /* plein ou bloqué */ } }, 400);
    return () => clearTimeout(t);
  }, [elements, cam]);

  useImperativeHandle(ref, () => ({
    elements: () => elementsRef.current,
    /* SVG autonome du dessin, cadré sur sa boîte englobante (+ 16 px de marge) :
       les éléments tels qu'affichés, sans les zones invisibles de la gomme. */
    /* `fond` : 'transparent' (posé sur le PDF, défaut), 'blanc' ou 'noir'. Sur un fond
       clair, l'encre claire de l'écran devient foncée (voir ENCRE). */
    svgExport: ({ fond: fondExport = 'transparent' } = {}) => {
      const b = boiteDessin(elementsRef.current);
      if (!b || !mondeRef.current) return null;
      const m = 16, w = Math.ceil(b.w + 2 * m), h = Math.ceil(b.h + 2 * m);
      const morceaux = [...mondeRef.current.querySelectorAll(':scope > g[data-id]:not([data-type="texte"])')].map((g) => {
        const c = g.cloneNode(true);
        c.querySelectorAll('.md-gomme').forEach((x) => x.remove());
        let html = c.outerHTML;
        if (fondExport !== 'noir') html = html.split(ENCRE.noir).join(ENCRE.clair).split(avecAlpha(ENCRE.noir, 0.2)).join(avecAlpha(ENCRE.clair, 0.2));
        return html;
      }).join('');
      const fond = fondExport === 'blanc' ? `<rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff"/>`
        : fondExport === 'noir' ? `<rect x="0" y="0" width="${w}" height="${h}" fill="#111114"/>` : '';
      // zones de texte : en FRACTIONS de l'image, pour être reposées par-dessus sur l'ordi
      const textes = elementsRef.current.filter((x) => x.type === 'texte' && String(x.texte || '').trim()).map((x) => {
        const t = mesurerTexte(x);
        return { texte: x.texte, x: (x.x - b.x + m) / w, y: (x.y - b.y + m) / h, taille: x.taille / w, largeur: t.w / w,
          couleur: couleurSurFond(x.couleur, fondExport === 'noir' ? 'noir' : 'clair') };
      });
      return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${fond}<g transform="translate(${m - b.x} ${m - b.y})">${morceaux}</g></svg>`, w, h, textes };
    },
    vider: () => { valider([]); try { localStorage.removeItem(CLE_BROUILLON); } catch (e) { /* ignore */ } },
  }), [valider]);

  // ---- caméra ----
  /* ZOOM FLUIDE (02/10 soir) : pendant un pincement ou un déplacement, la caméra est
     écrite directement dans le DOM à chaque image — le monde (vectoriel, donc net à
     tout zoom) ET la grille du fond. Avant, la grille ne suivait qu'au relâchement :
     le fond « sautait » à la fin du geste. Un seul requestAnimationFrame par image. */
  const rafCam = useRef(0);
  const ecrireCam = (c) => {
    if (mondeRef.current) mondeRef.current.setAttribute('transform', `translate(${c.x} ${c.y}) scale(${c.z})`);
    const sv = svgRef.current;
    if (sv) { const g = 24 * c.z; sv.style.backgroundSize = `${g}px ${g}px`; sv.style.backgroundPosition = `${c.x}px ${c.y}px`; }
  };
  const appliquerCam = (c) => {
    camRef.current = c;
    if (rafCam.current) return;
    rafCam.current = requestAnimationFrame(() => { rafCam.current = 0; ecrireCam(camRef.current); });
  };
  const versMonde = (cx, cy) => {
    const r = svgRef.current.getBoundingClientRect(), c = camRef.current;
    return [(cx - r.left - c.x) / c.z, (cy - r.top - c.y) / c.z];
  };
  const recentrer = () => {
    const b = boiteDessin(elementsRef.current);
    const r = svgRef.current.getBoundingClientRect();
    if (!b) { setCam({ x: 0, y: 0, z: 1 }); return; }
    const z = Math.max(ZMIN, Math.min(2, Math.min((r.width - 40) / b.w, (r.height - 40) / b.h)));
    setCam({ z, x: r.width / 2 - (b.x + b.w / 2) * z, y: r.height / 2 - (b.y + b.h / 2) * z });
  };

  // ---- gestes ----
  const doigts = useRef(new Map());
  const geste = useRef(null); // { type: 'trait'|'forme'|'gomme'|'pan'|'pince', … }

  const finPince = () => { setCam({ ...camRef.current }); };
  const abandonner = () => {
    const g = geste.current;
    if (g && g.type === 'trait' && traitRef.current) traitRef.current.setAttribute('d', '');
    if (g && g.type === 'forme') setApercu(null);
    if (g && g.type === 'gomme') setMasques(null);
    geste.current = null;
  };
  const debutPince = () => {
    const [a, b] = [...doigts.current.values()];
    geste.current = { type: 'pince', d0: Math.hypot(b.x - a.x, b.y - a.y) || 1, m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, cam0: { ...camRef.current } };
  };

  const toucheGomme = (cx, cy) => {
    const touches = geste.current.touches;
    for (const el of svgRef.current.querySelectorAll('path.md-gomme')) {
      const id = el.getAttribute('data-id');
      if (touches.has(id)) continue;
      try {
        const m = el.getScreenCTM(); if (!m) continue;
        const pt = svgRef.current.createSVGPoint(); pt.x = cx; pt.y = cy;
        const p = pt.matrixTransform(m.inverse());
        if (el.isPointInStroke(p) || (el.getAttribute('data-plein') === '1' && el.isPointInFill(p))) touches.add(id);
      } catch (e) { /* ignore */ }
    }
    setMasques(new Set(touches));
  };

  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    doigts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (doigts.current.size === 2) { abandonner(); debutPince(); return; }
    if (doigts.current.size > 2) return;
    if (editionRef.current) { terminerSaisie(); geste.current = null; return; } // toucher ailleurs = fin de la saisie
    const [wx, wy] = versMonde(e.clientX, e.clientY);
    if (outil === 'texte') { geste.current = { type: 'texte', cible: texteSous(wx, wy) || null, p0: [wx, wy], c0: [e.clientX, e.clientY], bouge: false }; return; }
    if (outil === 'main') { geste.current = { type: 'pan', x0: e.clientX, y0: e.clientY, cam0: { ...camRef.current } }; return; }
    if (outil === 'gomme') { geste.current = { type: 'gomme', touches: new Set() }; toucheGomme(e.clientX, e.clientY); return; }
    if (outil === 'forme') { geste.current = { type: 'forme', p0: [wx, wy], courant: null }; return; }
    const surl = outil === 'surligneur';
    geste.current = { type: 'trait', points: [[wx, wy]], dernier: [wx, wy], surl };
    if (traitRef.current) {
      traitRef.current.setAttribute('d', cheminTrait([[wx, wy]]));
      traitRef.current.setAttribute('stroke', couleurSurFond(surl ? couleurSurl : couleur, 'noir'));
      traitRef.current.setAttribute('stroke-width', String(EPAISSEURS[epIdx] * (surl ? 3 : 1)));
      traitRef.current.setAttribute('stroke-opacity', surl ? '0.4' : '1');
    }
  };

  const onMove = (e) => {
    if (!doigts.current.has(e.pointerId)) return;
    doigts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = geste.current;
    if (!g) return;
    if (g.type === 'pince') {
      const [a, b] = [...doigts.current.values()];
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1, m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const z = Math.max(ZMIN, Math.min(ZMAX, g.cam0.z * (d / g.d0)));
      const r = svgRef.current.getBoundingClientRect();
      const wx = (g.m0.x - r.left - g.cam0.x) / g.cam0.z, wy = (g.m0.y - r.top - g.cam0.y) / g.cam0.z;
      appliquerCam({ z, x: m.x - r.left - wx * z, y: m.y - r.top - wy * z });
      return;
    }
    if (g.type === 'pan') { appliquerCam({ ...g.cam0, x: g.cam0.x + e.clientX - g.x0, y: g.cam0.y + e.clientY - g.y0 }); return; }
    if (g.type === 'texte') {
      if (!g.cible) return;
      if (!g.bouge && Math.hypot(e.clientX - g.c0[0], e.clientY - g.c0[1]) < 8) return;
      g.bouge = true;
      const z = camRef.current.z;
      setGlisseTexte({ id: g.cible.id, dx: (e.clientX - g.c0[0]) / z, dy: (e.clientY - g.c0[1]) / z });
      return;
    }
    const lot = typeof e.getCoalescedEvents === 'function' && e.getCoalescedEvents().length ? e.getCoalescedEvents() : [e];
    if (g.type === 'gomme') { lot.forEach((q) => toucheGomme(q.clientX, q.clientY)); return; }
    if (g.type === 'forme') {
      let [x1, y1] = versMonde(e.clientX, e.clientY);
      const [x0, y0] = g.p0;
      g.courant = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0), fx: x1 < x0, fy: y1 < y0 };
      setApercu(g.courant);
      return;
    }
    if (g.type === 'trait') {
      for (const q of lot) g.dernier = suivreEnDouceur(g.dernier, versMonde(q.clientX, q.clientY), 0.35);
      g.points.push(g.dernier);
      if (traitRef.current) traitRef.current.setAttribute('d', cheminTrait(g.points));
    }
  };

  const onUp = (e) => {
    if (!doigts.current.has(e.pointerId)) return;
    doigts.current.delete(e.pointerId);
    const g = geste.current;
    if (!g) return;
    if (g.type === 'pince') { if (doigts.current.size < 2) { geste.current = null; finPince(); } return; }
    if (doigts.current.size > 0) return;
    geste.current = null;
    if (g.type === 'pan') { setCam({ ...camRef.current }); return; }
    if (g.type === 'texte') {
      if (g.cible && g.bouge) {
        const z = camRef.current.z, dx = (e.clientX - g.c0[0]) / z, dy = (e.clientY - g.c0[1]) / z;
        setGlisseTexte(null);
        valider(elementsRef.current.map((x) => (x.id === g.cible.id ? { ...x, x: x.x + dx, y: x.y + dy } : x)));
        return;
      }
      if (g.cible) { ouvrirSaisie({ id: g.cible.id, x: g.cible.x, y: g.cible.y, taille: g.cible.taille, couleur: g.cible.couleur }, g.cible.texte); return; }
      const taille = TAILLES_TEXTE[tailleIdx];
      ouvrirSaisie({ id: null, x: g.p0[0], y: g.p0[1] - taille * 0.6, taille, couleur }, '');
      return;
    }
    if (g.type === 'gomme') {
      setMasques(null);
      if (g.touches.size) valider(elementsRef.current.filter((x) => !g.touches.has(x.id)));
      return;
    }
    const ep = EPAISSEURS[epIdx];
    if (g.type === 'forme') {
      setApercu(null);
      let c = g.courant;
      const z = camRef.current.z;
      const trait = estTrait(typeForme);
      const petit = !c || (trait ? Math.hypot(c.w, c.h) * z < 10 : c.w * z < 10 || c.h * z < 10);
      if (petit) { const t = 90 / z; c = trait ? { x: g.p0[0] - t / 2, y: g.p0[1], w: t, h: 0, fx: false, fy: false } : { x: g.p0[0] - t / 2, y: g.p0[1] - t / 2, w: t, h: t, fx: false, fy: false }; }
      valider([...elementsRef.current, { id: nouvelId(), type: 'forme', forme: typeForme, ...c, couleur, ep, remplie: remplie && estFermee(typeForme) }]);
      return;
    }
    if (g.type === 'trait') {
      const pts = alleger(g.points);
      if (traitRef.current) traitRef.current.setAttribute('d', '');
      valider([...elementsRef.current, { id: nouvelId(), type: 'trait', points: pts, couleur: g.surl ? couleurSurl : couleur, ep: ep * (g.surl ? 3 : 1), opacite: g.surl ? 0.4 : 1 }]);
    }
  };

  // le monde suit l'état React de la caméra hors geste
  useEffect(() => { camRef.current = cam; ecrireCam(cam); }, [cam]); // eslint-disable-line react-hooks/exhaustive-deps

  // le texte en cours d'écriture est masqué (le champ de saisie le remplace) ; celui
  // qu'on glisse suit le doigt
  const visibles = elements
    .filter((x) => !(masques && masques.has(x.id)) && !(edition && edition.id === x.id))
    .map((x) => (glisseTexte && glisseTexte.id === x.id ? { ...x, x: x.x + glisseTexte.dx, y: x.y + glisseTexte.dy } : x));
  const ep = EPAISSEURS[epIdx];
  const couleurActive = outil === 'surligneur' ? couleurSurl : couleur;

  return (
    <div className="md">
      <div className="md-haut">
        <button type="button" className="md-btn" onClick={onRetour} aria-label="Retour"><Icon name="chevL" size={18} /></button>
        <button type="button" className="md-btn" onClick={annuler} disabled={!passe.length} aria-label="Annuler"><IconeOutil nom="annuler" size={19} /></button>
        <button type="button" className="md-btn" onClick={retablir} disabled={!futur.length} aria-label="Rétablir"><IconeOutil nom="retablir" size={19} /></button>
        <button type="button" className="md-btn" onClick={recentrer} aria-label="Recentrer" title="Recentrer sur le dessin"><Icon name="maximize" size={17} /></button>
        <button type="button" className="md-btn" onClick={toutEffacer} disabled={!elements.length} aria-label="Tout effacer" title="Tout effacer (annulable)"><Icon name="trash" size={17} /></button>
        <span style={{ flex: 1 }} />
        {edition ? (
          <button type="button" className="md-exporter" onPointerDown={(e) => e.preventDefault()} onClick={terminerSaisie}><Icon name="check" size={16} /> OK</button>
        ) : barreHaut}
      </div>

      <svg ref={svgRef} className={'md-surface outil-' + outil}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onContextMenu={(e) => e.preventDefault()}>
        <g ref={mondeRef}>
          {visibles.map((x) => <ElementDessin key={x.id} e={x} gommeLarg={outil === 'gomme' ? 22 / cam.z : 0} />)}
          {apercu && <g opacity="0.75"><ElementDessin e={{ id: 'apercu', type: 'forme', forme: typeForme, ...apercu, couleur, ep, remplie: remplie && estFermee(typeForme) }} /></g>}
          <path ref={traitRef} d="" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>

      {!elements.length && !edition && <div className="md-vide">Dessine au doigt · deux doigts pour déplacer et zoomer</div>}
      <textarea ref={saisieRef} className="md-saisie" rows={1} spellCheck={false} aria-label="Texte"
        style={{ display: 'none', fontFamily: POLICE_TEXTE }}
        onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; t.style.width = 'auto'; t.style.width = `${Math.max(80, t.scrollWidth + 8)}px`; }}
        onBlur={() => { if (editionRef.current) terminerSaisie(); }} />

      <div className="md-bas">
        <div className="md-reglages">
          {outil === 'forme' && (
            <div className="md-formes">
              {TYPES_FORMES.map((t) => (
                <button key={t.id} type="button" className={'md-forme' + (typeForme === t.id ? ' actif' : '')} onClick={() => setTypeForme(t.id)} aria-label={t.label} title={t.label}>
                  <IconeForme type={t.id} size={22} />
                </button>
              ))}
              {estFermee(typeForme) && (
                <button type="button" className={'md-forme' + (remplie ? ' actif' : '')} onClick={() => setRemplie((v) => !v)} aria-label="Remplir" title="Remplir">
                  <IconeOutil nom="remplir" size={20} />
                </button>
              )}
            </div>
          )}
          {outil !== 'gomme' && outil !== 'main' && (
            <div className="md-ligne">
              <SelecteurCouleurs couleur={couleurActive} onCouleur={outil === 'surligneur' ? setCouleurSurl : setCouleur} titre="Couleur"
                enTete={[{ id: 'blanc', hex: '#F2F2F5', label: 'Encre — blanche ici, noire sur la page' }]} />
            </div>
          )}
          {outil === 'texte' && (
            <div className="md-ligne md-epaisseurs" role="group" aria-label="Taille du texte">
              {TAILLES_TEXTE.map((t, i) => (
                <button key={t} type="button" className={'md-ep' + (tailleIdx === i ? ' actif' : '')} onClick={() => setTailleIdx(i)} aria-label={`Taille ${i + 1}`}>
                  <span className="md-ep-a" style={{ fontSize: 11 + i * 3.5, color: couleurSurFond(couleur, 'noir') }}>A</span>
                </button>
              ))}
            </div>
          )}
          {outil !== 'gomme' && outil !== 'main' && outil !== 'texte' && (
            <div className="md-ligne md-epaisseurs" role="group" aria-label="Épaisseur">
              {EPAISSEURS.map((p, i) => (
                <button key={p} type="button" className={'md-ep' + (epIdx === i ? ' actif' : '')} onClick={() => setEpIdx(i)} aria-label={`Épaisseur ${i + 1}`}>
                  <span style={{ width: Math.min(26, p * (outil === 'surligneur' ? 1.6 : 1) + 2), height: Math.min(26, p * (outil === 'surligneur' ? 1.6 : 1) + 2), background: couleurHex(couleurActive, '#1F1F24'), opacity: outil === 'surligneur' ? 0.5 : 1 }} />
                </button>
              ))}
            </div>
          )}
          {outil === 'gomme' && <div className="md-aide">Touche ou glisse sur un trait, une forme ou un texte pour l’effacer</div>}
          {outil === 'texte' && <div className="md-aide">Touche le dessin pour écrire · touche un texte pour le modifier, glisse-le pour le déplacer</div>}
          {outil === 'main' && <div className="md-aide">Glisse pour déplacer le dessin · pince pour zoomer</div>}
        </div>
        <div className="md-outils" role="group" aria-label="Outils">
          {OUTILS.map((o) => (
            <button key={o.id} type="button" className={'md-outil' + (outil === o.id ? ' actif' : '')} onClick={() => { if (editionRef.current) terminerSaisie(); setOutil(o.id); }}>
              <IconeOutil nom={o.id} size={22} />
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});

/** L'écran complet (la barre du haut reçoit le bouton Exporter, voir étape 4). */
export function MobileDessin({ onQuit, barreHaut = null, canvasRef = null }) {
  return <CanvasDessin ref={canvasRef} onRetour={onQuit} barreHaut={barreHaut} />;
}
