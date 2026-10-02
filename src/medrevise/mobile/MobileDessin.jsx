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
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { POLICE_TEXTE, nettoyerHtml, htmlZone, texteBrut, convertirCouleurs, envelopperSelection, selectionDans, tailleSelection } from './zonesTexte.js';
import { Icon } from '../../shared/Icon.jsx';
import { IconeOutil, IconeForme } from '../pdf/IconesOutils.jsx';
import { FenetreRoue } from '../pdf/Couleurs.jsx';
import { useCouleursPerso } from '../lib/couleursPerso.js';
import { createPortal } from 'react-dom';
import { TYPES_FORMES, cheminForme, estTrait, estFermee } from '../pdf/formes.js';
import { getStroke, getStrokePoints } from 'perfect-freehand';
import { couleurHex, avecAlpha, COLORS } from '../pdf/pdfShared.js';

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
export const TAILLES_TEXTE = [14, 18, 24, 32, 44]; // px à zoom 1 (taille de base d'une NOUVELLE zone)
export { POLICE_TEXTE };
const TAILLE_MIN = 10, TAILLE_MAX = 72;
/* tailles RÉELLES des zones (monde), mesurées sur le DOM après chaque rendu : une zone
   fait au moins la hauteur tracée et s'allonge proprement si son texte la dépasse */
const MESURES = new Map();
export const largeurZone = (e) => e.largeur || (MESURES.get(e.id) || {}).w || 220;
export const hauteurZone = (e) => Math.max(e.hauteur || 0, (MESURES.get(e.id) || {}).h || 0, (e.taille || 18) * 1.35);
const clampTaille = (v) => Math.max(TAILLE_MIN, Math.min(TAILLE_MAX, Math.round(v)));
const ALIGNS = ['left', 'center', 'right'];
/** style CSS d'une zone (affichée ou en écriture : LE MÊME, d'où l'absence de décalage) */
export function styleZone(z) {
  return {
    left: `${z.x}px`, top: `${z.y}px`,
    width: z.largeur ? `${z.largeur}px` : 'max-content', maxWidth: z.largeur ? '' : '600px',
    minHeight: z.hauteur ? `${z.hauteur}px` : '', fontSize: `${z.taille || 18}px`,
    color: couleurSurFond(z.couleur, 'noir'), fontWeight: z.gras ? '700' : '500',
    fontStyle: z.italique ? 'italic' : 'normal', textDecorationLine: z.souligne ? 'underline' : 'none',
    textAlign: z.align || 'left',
  };
}
const rgbVersHex = (c) => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || '');
  return m ? '#' + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('') : c;
};
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

/* LISSAGE « FAÇON APPLE » EN DIRECT (02/10 nuit) — perfect-freehand (MIT), l'algorithme
   des outils de dessin à main levée (tldraw, Excalidraw) : stabilisation du point
   (streamline), lissage du contour, PRESSION simulée d'après la vitesse du doigt (ou
   la vraie pression d'un stylet), fin de trait effilée. Calculé à CHAQUE point pendant
   le geste, pas seulement au relâchement. Le trait est alors un CONTOUR rempli.
   Désactivable : le tracé brut suit exactement le doigt, en épaisseur constante. */
/* LISSAGE ADAPTATIF (02/10 nuit) : `f` ∈ [0, 1] dose le lissage selon la TAILLE du
   geste à l'écran. Écrire = petits traits rapides aux courbes serrées : un lissage fort
   y « coupe les virages » et déforme les lettres. Petit geste (f ≈ 0) : stabilisation
   légère, peu de variation d'épaisseur, pas de fin effilée → lettres fidèles et nettes.
   Grand trait ample (f ≈ 1) : le lissage fort, doux et élégant. Entre les deux, dosage
   continu.
   03/10 : UN CRAN DE PLUS, surtout sur les traits amples (lissage jusqu'à 0,9,
   stabilisation jusqu'à 0,76, fenêtre de pré-lissage élargie plus tôt) ; côté écriture
   à peine plus (lettres aussi fidèles, mesuré). Même dosage adaptatif. */
const mix = (a, b, f) => a + (b - a) * f;
export function facteurLissage(points, zoom = 1) {
  if (!points || points.length < 2) return 0;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  const diag = Math.hypot(x1 - x0, y1 - y0) * zoom; // taille du geste EN PIXELS D'ÉCRAN
  return Math.max(0, Math.min(1, (diag - 80) / 220)); // ≤ 80 px (lettres, mots) : écriture ; ≥ 300 px : dessin
}
export function optionsLissage(ep, surligneur, avecPression = false, f = 1) {
  return surligneur
    ? { size: ep, thinning: 0, smoothing: mix(0.6, 0.9, f), streamline: mix(0.36, 0.76, f), simulatePressure: false, start: { cap: true }, end: { cap: true } }
    // CALIBRÉ par la mesure (02/10 nuit) : avec size = 0,86 × épaisseur, un trait lissé
    // régulier mesure l'ÉPAISSEUR CHOISIE (avant : 1,35 × → nettement trop épais, ce qui
    // empâtait l'écriture). La pression simulée l'affine ou l'épaissit autour de cette valeur.
    : { size: ep * 0.86, thinning: mix(0.15, 0.4, f), smoothing: mix(0.52, 0.9, f), streamline: mix(0.23, 0.76, f), simulatePressure: !avecPression,
        easing: (t) => Math.sin((t * Math.PI) / 2), start: { cap: true, taper: 0 }, end: { cap: true, taper: mix(0, Math.min(ep * 4, 32), f) } };
}
/** contour (perfect-freehand) → chemin SVG en courbes (milieux + quadratiques). */
export function cheminContour(contour) {
  if (!contour || contour.length < 2) return '';
  const f = (v) => (Math.round(v * 100) / 100).toString();
  let d = `M${f(contour[0][0])} ${f(contour[0][1])} Q`;
  for (let i = 0; i < contour.length; i++) {
    const [x0, y0] = contour[i], [x1, y1] = contour[(i + 1) % contour.length];
    d += `${f(x0)} ${f(y0)} ${f((x0 + x1) / 2)} ${f((y0 + y1) / 2)} `;
  }
  return d + 'Z';
}
/** pré-lissage gaussien des points du doigt (fenêtre centrée de 7, extrémités gardées :
    le bout du trait reste sous le doigt, sans retard). Retire le tremblement fin que
    la stabilisation seule laisse en petits angles. */
const NOYAU = [1, 3, 6, 7, 6, 3, 1];
function preLisser(points, f = 1) {
  const n = points.length;
  if (n < 5) return points;
  // fenêtre adaptative : 1 (écriture) → 3 (grand trait) de rayon ; un cran plus large
  // depuis le 03/10 (le rayon 2 arrive plus tôt : traits moyens plus doux)
  const r = Math.max(1, Math.min(3, Math.round(mix(1.3, 3.4, f))));
  return points.map((p, i) => {
    if (i === 0 || i === n - 1) return p;
    const k = Math.min(r, i, n - 1 - i); // fenêtre réduite près des bouts
    let sx = 0, sy = 0, sw = 0;
    for (let j = -k; j <= k; j++) { const w = NOYAU[j + 3], q = points[i + j]; sx += q[0] * w; sy += q[1] * w; sw += w; }
    return p.length > 2 ? [sx / sw, sy / sw, p[2]] : [sx / sw, sy / sw];
  });
}
export function cheminLisse(e, fini = true) {
  const f = e.fl ?? 1; // trait d'avant le lissage adaptatif : lissage fort, comme avant
  return cheminContour(getStroke(preLisser(e.points, f), { ...optionsLissage(e.ep, e.opacite < 1, e.pression, f), last: fini }));
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
  if (e.type === 'texte') return { x: e.x - 2, y: e.y - 2, w: largeurZone(e) + 4, h: hauteurZone(e) + 4 };
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
  if (e.type === 'texte') return null; // zones de texte : couche HTML (voir CanvasDessin)
  if (e.type === 'trait') {
    const d = cheminTrait(e.points);
    return (
      <g data-id={e.id}>
        {e.lisse
          ? <path d={cheminLisse(e)} fill={coul} fillOpacity={e.opacite ?? 1} stroke="none" />
          : <path d={d} fill="none" stroke={coul} strokeWidth={e.ep} strokeOpacity={e.opacite ?? 1} strokeLinecap="round" strokeLinejoin="round" />}
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

/* ============================================================
   PALETTE DU TÉLÉPHONE (02/10 nuit) — même système que partout (encre, 4 couleurs
   « cours », mes couleurs synchronisées, roue), dessiné pour le doigt : pastilles de
   32 px, alignées, l'anneau de sélection À L'INTÉRIEUR de la rangée (il n'est plus
   rogné). Appui long sur une de MES couleurs : la retirer.
   ============================================================ */
const ENCRE_PASTILLE = { id: 'blanc', hex: '#F2F2F5', label: 'Encre' };
function PaletteMobile({ couleur, onCouleur }) {
  const [perso, ajouter, retirer] = useCouleursPerso();
  const [roue, setRoue] = useState(null);
  const [aRetirer, setARetirer] = useState(null);
  const appui = useRef(null);
  const pastilles = [ENCRE_PASTILLE, ...COLORS, ...perso.map((h) => ({ id: h, hex: h, label: h, perso: true }))];
  const actif = (id) => couleur === id || (id === 'blanc' && couleurSurFond(couleur, 'noir') === ENCRE.noir && !COLORS.some((c) => c.id === couleur) && !perso.includes(couleur));
  return (
    <div className="md-rang md-palette" role="group" aria-label="Couleur">
      {pastilles.map((c, i) => (
        <span key={c.id} className="md-pastille-cel">
          {i === 1 && <span className="md-pastille-sep" aria-hidden="true" />}
          <button type="button" className={'md-pastille' + (actif(c.id) ? ' actif' : '')} style={{ '--c': c.hex }} aria-label={c.label}
            onPointerDown={() => { if (c.perso) { clearTimeout(appui.current); appui.current = setTimeout(() => setARetirer(c.id), 520); } }}
            onPointerUp={() => clearTimeout(appui.current)} onPointerLeave={() => clearTimeout(appui.current)}
            onClick={() => { if (aRetirer) return; onCouleur(c.id); }} />
          {aRetirer === c.id && (
            <span className="md-retirer">
              <button type="button" onClick={() => { retirer(c.id); setARetirer(null); }}>Retirer</button>
              <button type="button" onClick={() => setARetirer(null)}>Garder</button>
            </span>
          )}
        </span>
      ))}
      <button type="button" className={'md-pastille md-pastille-roue sc-roue-btn' + (roue ? ' actif' : '')} aria-label="Nouvelle couleur"
        onClick={() => setRoue(roue ? null : { x: Math.max(8, (window.innerWidth - 240) / 2), y: Math.max(8, window.innerHeight * 0.16) })}>
        <Icon name="plus" size={14} />
      </button>
      {roue && createPortal(
        <FenetreRoue classe="md-roue" x={roue.x} y={roue.y} depart={couleurHex(couleur, '#e5383b')}
          onFermer={() => setRoue(null)}
          onValider={(hex) => { ajouter(hex); onCouleur(hex); setRoue(null); }} />,
        document.body,
      )}
    </div>
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
  /* PAYSAGE (02/10 nuit) : téléphone à l'horizontale → les commandes passent sur les
     CÔTÉS (rail à gauche, outils à droite) et la carte des réglages ne s'ouvre qu'à la
     demande (toucher l'outil actif) : le canvas prend toute la place. */
  const requetePaysage = '(orientation: landscape) and (max-height: 500px)';
  const [paysage, setPaysage] = useState(() => typeof window !== 'undefined' && window.matchMedia && window.matchMedia(requetePaysage).matches);
  const [carteOuverte, setCarteOuverte] = useState(() => !(typeof window !== 'undefined' && window.matchMedia && window.matchMedia(requetePaysage).matches));
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(requetePaysage);
    const maj = () => { setPaysage(mq.matches); setCarteOuverte(!mq.matches); };
    mq.addEventListener('change', maj);
    return () => mq.removeEventListener('change', maj);
  }, []);
  const [lisse, setLisseBrut] = useState(() => { try { return localStorage.getItem('medrevise.dessinLisse') !== '0'; } catch (e) { return true; } });
  const setLisse = (v) => { setLisseBrut(v); try { localStorage.setItem('medrevise.dessinLisse', v ? '1' : '0'); } catch (e) { /* ignore */ } };
  /* ============================================================
     ZONES DE TEXTE (refaites le 02/10 nuit). Du HTML posé sur le canvas, dans une couche
     transformée EXACTEMENT comme le dessin : la zone affichée et la zone en écriture ont
     la même mise en page (plus de texte qui déborde, plus de boîte qui ne fait pas sa
     taille). Écriture en place (contentEditable), mise en forme sur la zone entière ou
     sur la SÉLECTION (un mot), poignées, déplacer, dupliquer, supprimer, et une barre
     qui se colle au-dessus du clavier.
     ============================================================ */
  const racineRef = useRef(null), sceneRef = useRef(null), coucheRef = useRef(null), editeurRef = useRef(null);
  const [selId, setSelId] = useState(null);
  const [edition, setEdition] = useState(null); // zone en cours d'écriture { ...zone, nouvelle? }
  const editionRef = useRef(null); editionRef.current = edition;
  const [glisseZone, setGlisseZone] = useState(null); // { id, dx, dy, dw, dh } pendant un geste
  const [zoneApercu, setZoneApercu] = useState(null); // zone en train d'être tracée
  const [clavier, setClavier] = useState(0); // hauteur du clavier à l'écran
  const [vueH, setVueH] = useState(0); // hauteur visible (visualViewport)
  const [paletteZone, setPaletteZone] = useState(false);
  const barreFormatRef = useRef(null);
  const [, setVersion] = useState(0);
  const rafraichir = () => setVersion((v) => v + 1);

  const appliquerStyleEditeur = (z) => { const ed = editeurRef.current; if (ed) Object.assign(ed.style, styleZone(z)); };
  const ouvrirEdition = (z, point = null) => {
    const ed = editeurRef.current;
    if (!ed) return;
    ed.innerHTML = htmlZone(z);
    appliquerStyleEditeur(z);
    ed.style.display = 'block';
    try {
      ed.focus({ preventScroll: true }); // focus DANS le geste : iOS ouvre le clavier
      const sel = window.getSelection();
      let r = null;
      if (point && document.caretRangeFromPoint) { r = document.caretRangeFromPoint(point[0], point[1]); if (r && !ed.contains(r.startContainer)) r = null; }
      if (!r) { r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); }
      sel.removeAllRanges(); sel.addRange(r);
    } catch (err) { /* ignore */ }
    setEdition({ ...z }); setSelId(z.id); setPaletteZone(false);
  };
  const terminerEdition = () => {
    const z = editionRef.current;
    if (!z) return;
    const ed = editeurRef.current;
    const html = nettoyerHtml(ed ? ed.innerHTML : '');
    const texte = texteBrut(html);
    editionRef.current = null; // tout de suite : le blur qui suit ne relance pas la fin d'écriture
    if (ed) { ed.style.display = 'none'; ed.blur(); ed.innerHTML = ''; }
    setEdition(null); setPaletteZone(false);
    const { nouvelle, ...propre } = z;
    const els = elementsRef.current;
    if (!texte.trim()) { if (!nouvelle) valider(els.filter((x) => x.id !== z.id)); setSelId(null); return; }
    if (nouvelle) { valider([...els, { ...propre, html, texte }]); return; }
    const avant = els.find((x) => x.id === z.id);
    const apres = { ...avant, ...propre, html, texte };
    if (JSON.stringify(avant) !== JSON.stringify(apres)) valider(els.map((x) => (x.id === z.id ? apres : x)));
  };
  const modifierZone = (id, patch) => valider(elementsRef.current.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const zoneCourante = () => editionRef.current || elementsRef.current.find((x) => x.id === selId) || null;
  /* MISE EN FORME : sur la SÉLECTION si un morceau de texte est sélectionné pendant
     l'écriture, sinon sur TOUTE la zone. */
  const appliquer = (action, val) => {
    const ed = editeurRef.current, z = zoneCourante();
    if (!z) return;
    if (editionRef.current && ed && selectionDans(ed)) {
      if (action === 'gras') document.execCommand('bold');
      else if (action === 'italique') document.execCommand('italic');
      else if (action === 'souligne') document.execCommand('underline');
      else if (action === 'taille') envelopperSelection(ed, { fontSize: `${clampTaille(tailleSelection(ed, z.taille) + val)}px` });
      else if (action === 'couleur') envelopperSelection(ed, { color: couleurSurFond(val, 'noir') });
      if (action !== 'align') { rafraichir(); return; }
    }
    const patch = action === 'gras' ? { gras: !z.gras } : action === 'italique' ? { italique: !z.italique } : action === 'souligne' ? { souligne: !z.souligne }
      : action === 'taille' ? { taille: clampTaille((z.taille || 18) + val) } : action === 'couleur' ? { couleur: val }
        : action === 'align' ? { align: ALIGNS[(ALIGNS.indexOf(z.align || 'left') + 1) % ALIGNS.length] } : {};
    if (editionRef.current) { const n = { ...editionRef.current, ...patch }; setEdition(n); appliquerStyleEditeur(n); }
    else modifierZone(z.id, patch);
  };
  const etatFormat = (cmd, champ) => {
    const ed = editeurRef.current, z = zoneCourante();
    if (editionRef.current && ed && selectionDans(ed)) { try { return document.queryCommandState(cmd); } catch (e) { return false; } }
    return !!(z && z[champ]);
  };
  const supprimerZone = () => {
    const z = zoneCourante();
    if (editionRef.current) { const ed = editeurRef.current; if (ed) { ed.style.display = 'none'; ed.innerHTML = ''; ed.blur(); } setEdition(null); }
    if (z && !z.nouvelle) valider(elementsRef.current.filter((x) => x.id !== z.id));
    setSelId(null); setPaletteZone(false);
  };
  const dupliquerZone = () => {
    const id = editionRef.current ? editionRef.current.id : selId;
    if (editionRef.current) terminerEdition();
    const z = elementsRef.current.find((x) => x.id === id);
    if (!z) return;
    const k = 18 / camRef.current.z;
    const copie = { ...z, id: nouvelId(), x: z.x + k, y: z.y + k };
    valider([...elementsRef.current, copie]);
    setSelId(copie.id); // la copie est sélectionnée : on la glisse où on veut
  };
  // zone sous un point d'écran (rectangles réels du DOM, marge pour le doigt)
  const zoneSous = (cx, cy, marge = 10) => {
    const couche = coucheRef.current; if (!couche) return null;
    const els = [...couche.querySelectorAll('.md-zone[data-id]')].reverse();
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (cx >= r.left - marge && cx <= r.right + marge && cy >= r.top - marge && cy <= r.bottom + marge) return elementsRef.current.find((x) => x.id === el.dataset.id) || null;
    }
    return null;
  };
  // POIGNÉES (coins) : redimensionner la zone, le texte se replie dans sa nouvelle largeur
  const debutPoignee = (e, coin) => {
    e.preventDefault(); e.stopPropagation();
    const z = elementsRef.current.find((x) => x.id === selId); if (!z) return;
    const zoom = camRef.current.z, x0 = e.clientX, y0 = e.clientY;
    const l0 = largeurZone(z), h0 = z.hauteur || hauteurZone(z);
    const calc = (ev) => {
      const dx = (ev.clientX - x0) / zoom, dy = (ev.clientY - y0) / zoom;
      const gauche = coin.includes('o'), haut = coin.includes('n');
      const dw = Math.max(48 / zoom - l0, gauche ? -dx : dx), dh = Math.max((z.taille || 18) * 1.35 - h0, haut ? -dy : dy);
      return { id: z.id, dx: gauche ? -dw : 0, dy: haut ? -dh : 0, dw, dh };
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const move = (ev) => setGlisseZone(calc(ev));
    const up = (ev) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      const g = calc(ev); setGlisseZone(null);
      modifierZone(z.id, { x: z.x + g.dx, y: z.y + g.dy, largeur: l0 + g.dw, hauteur: h0 + g.dh });
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  // le CLAVIER : sa hauteur (visualViewport), et la zone en écriture toujours AU-DESSUS
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    // iOS : la page garde sa hauteur, la partie VISIBLE rétrécit (clavier = la différence) ;
    // Android : toute la page rétrécit. On suit les deux.
    const maj = () => { setClavier(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))); setVueH(Math.round(vv.height)); };
    vv.addEventListener('resize', maj); vv.addEventListener('scroll', maj); maj();
    return () => { vv.removeEventListener('resize', maj); vv.removeEventListener('scroll', maj); };
  }, []);
  useEffect(() => {
    if (!edition || !editeurRef.current || !sceneRef.current) return;
    const r = editeurRef.current.getBoundingClientRect(), sc = sceneRef.current.getBoundingClientRect();
    const vv = window.visualViewport;
    const hb = (barreFormatRef.current && barreFormatRef.current.offsetHeight) || 124;
    const basVisible = (vv ? vv.offsetTop + vv.height : window.innerHeight) - hb - 16; // place de la barre de mise en forme
    let dy = 0;
    if (r.bottom > basVisible) dy = basVisible - r.bottom - 12;
    if (r.top + dy < sc.top + 12) dy = sc.top + 12 - r.top;
    if (Math.abs(dy) > 1) { const c = camRef.current; setCam({ ...c, y: c.y + dy }); }
  }, [clavier, vueH, edition && edition.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- historique ----
  // L'état courant est CAPTURÉ avant les setters : une fonction de mise à jour est
  // exécutée par React plus tard, au rendu — après que `elementsRef.current` a déjà
  // reçu la NOUVELLE valeur (constaté : le 1er « annuler » ne faisait rien).
  const valider = useCallback((suivant) => {
    const avant = elementsRef.current;
    setPasse((p) => [...p.slice(-99), avant]);
    setFutur([]);
    setElements(suivant);
    // tout de suite (pas au prochain rendu) : deux validations enchaînées dans le même
    // geste (finir l'écriture PUIS dupliquer) partent ainsi chacune du bon état
    elementsRef.current = suivant;
  }, []);
  const annuler = () => {
    if (!passe.length) return;
    const courant = elementsRef.current, precedent = passe[passe.length - 1];
    setFutur((f) => [courant, ...f]); setElements(precedent); setPasse((p) => p.slice(0, -1)); elementsRef.current = precedent;
  };
  const retablir = () => {
    if (!futur.length) return;
    const courant = elementsRef.current, suivant = futur[0];
    setPasse((p) => [...p, courant]); setElements(suivant); setFutur((f) => f.slice(1)); elementsRef.current = suivant;
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
      const morceaux = [...mondeRef.current.querySelectorAll(':scope > g[data-id]')].map((g) => {
        const c = g.cloneNode(true);
        c.querySelectorAll('.md-gomme').forEach((x) => x.remove());
        let html = c.outerHTML;
        if (fondExport !== 'noir') html = html.split(ENCRE.noir).join(ENCRE.clair).split(avecAlpha(ENCRE.noir, 0.2)).join(avecAlpha(ENCRE.clair, 0.2));
        return html;
      }).join('');
      const fond = fondExport === 'blanc' ? `<rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff"/>`
        : fondExport === 'noir' ? `<rect x="0" y="0" width="${w}" height="${h}" fill="#111114"/>` : '';
      // zones de texte : en FRACTIONS de l'image, avec leur HTML riche, pour être reposées
      // par-dessus sur l'ordi en textes libres éditables
      const encre = (c) => couleurSurFond(rgbVersHex(c), fondExport === 'noir' ? 'noir' : 'clair');
      const textes = elementsRef.current.filter((x) => x.type === 'texte' && String(x.texte || texteBrut(x.html || '')).trim()).map((x) => ({
        texte: x.texte || texteBrut(x.html), html: convertirCouleurs(htmlZone(x), encre), k: 1 / w,
        x: (x.x - b.x + m) / w, y: (x.y - b.y + m) / h, taille: (x.taille || 18) / w,
        largeur: largeurZone(x) / w, hauteur: hauteurZone(x) / h, boite: true,
        gras: !!x.gras, italique: !!x.italique, souligne: !!x.souligne, align: x.align || 'left',
        couleur: encre(x.couleur),
      }));
      return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${fond}<g transform="translate(${m - b.x} ${m - b.y})">${morceaux}</g></svg>`, w, h, textes };
    },
    vider: () => { valider([]); try { localStorage.removeItem(CLE_BROUILLON); } catch (e) { /* ignore */ } },
  }), [valider]);

  // ---- caméra ----
  /* ZOOM FLUIDE (02/10 soir) : pendant un pincement ou un déplacement, la caméra est
     écrite directement dans le DOM à chaque image — le monde ET la grille du fond.
     LA GRILLE EST UN MOTIF SVG (02/10 nuit), plus un fond CSS : un fond CSS répété est
     recalé par le navigateur sur les pixels PHYSIQUES de l'écran — mesuré : pour un pas
     de 24,25 px, les écarts réels alternaient 24,5 / 24,0, la grille avançait par
     crans (les « paliers »). Le motif SVG suit la même transformation que le dessin,
     au sous-pixel près : il grandit en continu. Les points grossissent doucement avec
     le zoom (rayon ∝ √zoom) et la grille s'efface quand elle devient trop serrée. */
  const rafCam = useRef(0);
  const motifRef = useRef(null), pointRef = useRef(null), grilleRef = useRef(null);
  const ecrireCam = (c) => {
    if (mondeRef.current) mondeRef.current.setAttribute('transform', `translate(${c.x} ${c.y}) scale(${c.z})`);
    if (coucheRef.current) coucheRef.current.style.transform = `translate(${c.x}px, ${c.y}px) scale(${c.z})`;
    if (motifRef.current) motifRef.current.setAttribute('patternTransform', `translate(${c.x} ${c.y}) scale(${c.z})`);
    if (pointRef.current) pointRef.current.setAttribute('r', String(1.15 / Math.sqrt(c.z)));
    if (grilleRef.current) grilleRef.current.setAttribute('opacity', String(Math.max(0, Math.min(1, (24 * c.z - 5) / 9))));
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

  const finPince = () => { marquerGeste(false); setCam({ ...camRef.current }); };
  const abandonner = () => {
    const g = geste.current;
    if (g && g.type === 'trait' && traitRef.current) traitRef.current.setAttribute('d', '');
    if (g && g.type === 'forme') setApercu(null);
    if (g && g.type === 'gomme') setMasques(null);
    geste.current = null;
  };
  const marquerGeste = (v) => { const el = racineRef.current; if (el) el.classList.toggle('md-en-geste', v); };
  const debutPince = () => {
    marquerGeste(true);
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
    const z = zoneSous(cx, cy, 0);
    if (z) touches.add(z.id);
    setMasques(new Set(touches));
  };

  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    doigts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (doigts.current.size === 2) { abandonner(); debutPince(); return; }
    if (doigts.current.size > 2) return;
    if (editionRef.current) { terminerEdition(); geste.current = null; return; } // toucher ailleurs = fin de l'écriture
    const [wx, wy] = versMonde(e.clientX, e.clientY);
    if (outil === 'texte') {
      const cible = zoneSous(e.clientX, e.clientY);
      if (cible) { geste.current = { type: 'texte', cible, c0: [e.clientX, e.clientY], bouge: false, dejaSel: selId === cible.id }; setSelId(cible.id); setPaletteZone(false); return; }
      if (selId) { setSelId(null); setPaletteZone(false); geste.current = null; return; } // toucher le vide = désélectionner d'abord
      geste.current = { type: 'texte-zone', p0: [wx, wy], c0: [e.clientX, e.clientY] };
      return;
    }
    if (outil === 'main') { marquerGeste(true); geste.current = { type: 'pan', x0: e.clientX, y0: e.clientY, cam0: { ...camRef.current } }; return; }
    if (outil === 'gomme') { geste.current = { type: 'gomme', touches: new Set() }; toucheGomme(e.clientX, e.clientY); return; }
    if (outil === 'forme') { geste.current = { type: 'forme', p0: [wx, wy], courant: null }; return; }
    const surl = outil === 'surligneur';
    const stylet = e.pointerType === 'pen' && e.pressure > 0;
    const p0 = stylet ? [wx, wy, e.pressure] : [wx, wy];
    geste.current = { type: 'trait', points: [p0], dernier: [wx, wy], surl, lisse, stylet, ep: EPAISSEURS[epIdx] * (surl ? 3 : 1) };
    const tr = traitRef.current;
    if (tr) {
      const coulT = couleurSurFond(surl ? couleurSurl : couleur, 'noir');
      if (lisse) {
        tr.setAttribute('d', cheminLisse({ points: [p0], ep: geste.current.ep, opacite: surl ? 0.4 : 1, pression: stylet, fl: 0 }, false));
        tr.setAttribute('fill', coulT); tr.setAttribute('fill-opacity', surl ? '0.4' : '1'); tr.setAttribute('stroke', 'none');
      } else {
        tr.setAttribute('d', cheminTrait([[wx, wy]]));
        tr.setAttribute('fill', 'none'); tr.setAttribute('stroke', coulT);
        tr.setAttribute('stroke-width', String(geste.current.ep));
        tr.setAttribute('stroke-opacity', surl ? '0.4' : '1');
      }
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
    if (g.type === 'texte-zone') {
      const [x1, y1] = versMonde(e.clientX, e.clientY);
      if (Math.hypot(e.clientX - g.c0[0], e.clientY - g.c0[1]) < 10) return;
      setZoneApercu({ x: Math.min(g.p0[0], x1), y: Math.min(g.p0[1], y1), w: Math.abs(x1 - g.p0[0]), h: Math.abs(y1 - g.p0[1]) });
      return;
    }
    if (g.type === 'texte') {
      if (!g.cible) return;
      if (!g.bouge && Math.hypot(e.clientX - g.c0[0], e.clientY - g.c0[1]) < 6) return;
      g.bouge = true;
      const z = camRef.current.z;
      setGlisseZone({ id: g.cible.id, dx: (e.clientX - g.c0[0]) / z, dy: (e.clientY - g.c0[1]) / z, dw: 0, dh: 0 });
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
      if (g.lisse) {
        // TOUS les points du doigt (événements regroupés compris) : le lissage les traite
        for (const q of lot) { const [x, y] = versMonde(q.clientX, q.clientY); g.points.push(g.stylet ? [x, y, q.pressure || 0.5] : [x, y]); }
        g.fl = facteurLissage(g.points, camRef.current.z);
        if (traitRef.current) traitRef.current.setAttribute('d', cheminLisse({ points: g.points, ep: g.ep, opacite: g.surl ? 0.4 : 1, pression: g.stylet, fl: g.fl }, false));
      } else {
        // tracé BRUT : chaque point du doigt, sans filtre
        for (const q of lot) { g.dernier = versMonde(q.clientX, q.clientY); g.points.push(g.dernier); }
        if (traitRef.current) traitRef.current.setAttribute('d', cheminTrait(g.points));
      }
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
    if (g.type === 'pan') { marquerGeste(false); setCam({ ...camRef.current }); return; }
    if (g.type === 'texte') {
      if (g.cible && g.bouge) {
        const z = camRef.current.z, dx = (e.clientX - g.c0[0]) / z, dy = (e.clientY - g.c0[1]) / z;
        setGlisseZone(null);
        modifierZone(g.cible.id, { x: g.cible.x + dx, y: g.cible.y + dy });
        return;
      }
      // toucher une zone DÉJÀ sélectionnée = l'écrire, curseur à l'endroit touché
      if (g.cible && g.dejaSel) ouvrirEdition(g.cible, [e.clientX, e.clientY]);
      return;
    }
    if (g.type === 'texte-zone') {
      // ZONE TRACÉE AU DOIGT : sa largeur règle le retour à la ligne ; un simple toucher
      // crée une zone de largeur par défaut
      setZoneApercu(null);
      const taille = TAILLES_TEXTE[tailleIdx], z = camRef.current.z;
      const [x1, y1] = versMonde(e.clientX, e.clientY);
      const trace = Math.hypot(e.clientX - g.c0[0], e.clientY - g.c0[1]) >= 10 && Math.abs(x1 - g.p0[0]) * z >= 40;
      // ZONE TRACÉE : largeur ET hauteur du geste ; un simple toucher : zone d'une ligne
      const zone = trace
        ? { x: Math.min(g.p0[0], x1), y: Math.min(g.p0[1], y1), largeur: Math.abs(x1 - g.p0[0]), hauteur: Math.max(Math.abs(y1 - g.p0[1]), taille * 1.35) }
        : (() => {
          // zone par défaut : elle tient TOUJOURS dans la vue (recalée vers la gauche près du bord)
          const vueW = svgRef.current.getBoundingClientRect().width, l = Math.min(240, vueW - 40);
          const xEcran = Math.max(12, Math.min(g.c0[0] - svgRef.current.getBoundingClientRect().left, vueW - l - 12));
          return { x: (xEcran - camRef.current.x) / z, y: g.p0[1] - taille * 0.6, largeur: l / z, hauteur: taille * 1.35 };
        })();
      ouvrirEdition({ id: nouvelId(), type: 'texte', ...zone, taille, couleur, html: '', texte: '', nouvelle: true });
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
      const pts = g.lisse ? g.points.map((q) => q.map((v) => Math.round(v * 100) / 100)) : alleger(g.points);
      if (traitRef.current) traitRef.current.setAttribute('d', '');
      valider([...elementsRef.current, { id: nouvelId(), type: 'trait', points: pts, couleur: g.surl ? couleurSurl : couleur, ep: g.ep, opacite: g.surl ? 0.4 : 1,
        ...(g.lisse ? { lisse: true, fl: Math.round(facteurLissage(g.points, camRef.current.z) * 100) / 100 } : {}), ...(g.stylet ? { pression: true } : {}) }]);
    }
  };

  // mesure des zones (largeur/hauteur réelles, monde) après chaque rendu
  useLayoutEffect(() => {
    const couche = coucheRef.current; if (!couche) return;
    let change = false;
    couche.querySelectorAll('.md-zone[data-id]').forEach((el) => {
      const m = { w: el.offsetWidth, h: el.offsetHeight }, avant = MESURES.get(el.dataset.id);
      if (!avant || avant.w !== m.w || avant.h !== m.h) { MESURES.set(el.dataset.id, m); change = true; }
    });
    if (change) rafraichir();
  });
  // le monde suit l'état React de la caméra hors geste
  useEffect(() => { camRef.current = cam; ecrireCam(cam); }, [cam]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibles = elements.filter((x) => !(masques && masques.has(x.id)));
  // zones de texte (couche HTML) : celle qu'on glisse / redimensionne suit le doigt ;
  // celle en écriture est remplacée par l'éditeur (même style, même place)
  const zones = visibles.filter((x) => x.type === 'texte').map((x) => (glisseZone && glisseZone.id === x.id
    ? { ...x, x: x.x + glisseZone.dx, y: x.y + glisseZone.dy, ...(glisseZone.dw || glisseZone.dh ? { largeur: largeurZone(x) + glisseZone.dw, hauteur: (x.hauteur || hauteurZone(x)) + glisseZone.dh } : {}) } : x));
  const zoneSel = outil === 'texte' && selId ? (edition && edition.id === selId ? edition : zones.find((x) => x.id === selId)) : null;
  const selEcran = zoneSel ? (() => {
    const g = glisseZone && glisseZone.id === zoneSel.id ? zones.find((x) => x.id === zoneSel.id) || zoneSel : zoneSel;
    return { x: g.x * cam.z + cam.x, y: g.y * cam.z + cam.y, w: largeurZone(g) * cam.z, h: hauteurZone(g) * cam.z };
  })() : null;
  const tailleCourante = zoneSel ? zoneSel.taille : null;
  const ep = EPAISSEURS[epIdx];
  const couleurActive = outil === 'surligneur' ? couleurSurl : couleur;

  return (
    <div className={'md' + (edition ? ' md-ecriture' : '') + (paysage ? ' md-paysage' : '')} ref={racineRef}>
      <div className="md-haut">
        <button type="button" className="md-btn" onClick={onRetour} aria-label="Retour"><Icon name="chevL" size={18} /></button>
        <button type="button" className="md-btn" onClick={annuler} disabled={!passe.length} aria-label="Annuler"><IconeOutil nom="annuler" size={19} /></button>
        <button type="button" className="md-btn" onClick={retablir} disabled={!futur.length} aria-label="Rétablir"><IconeOutil nom="retablir" size={19} /></button>
        <button type="button" className="md-btn" onClick={recentrer} aria-label="Recentrer" title="Recentrer sur le dessin"><Icon name="maximize" size={17} /></button>
        <button type="button" className="md-btn" onClick={toutEffacer} disabled={!elements.length} aria-label="Tout effacer" title="Tout effacer (annulable)"><Icon name="trash" size={17} /></button>
        <span style={{ flex: 1 }} />
        {edition ? (
          <button type="button" className="md-exporter" onPointerDown={(e) => e.preventDefault()} onClick={terminerEdition}><Icon name="check" size={16} /> OK</button>
        ) : barreHaut}
      </div>

      <div className="md-scene" ref={sceneRef}>
      <svg ref={svgRef} className={'md-surface outil-' + outil}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onContextMenu={(e) => e.preventDefault()}>
        <defs>
          <pattern ref={motifRef} id="md-grille" patternUnits="userSpaceOnUse" width="24" height="24">
            <circle ref={pointRef} cx="12" cy="12" r="1.15" fill="rgba(255,255,255,0.17)" />
          </pattern>
        </defs>
        <rect ref={grilleRef} x="0" y="0" width="100%" height="100%" fill="url(#md-grille)" pointerEvents="none" />
        <g ref={mondeRef}>
          {visibles.map((x) => <ElementDessin key={x.id} e={x} gommeLarg={outil === 'gomme' ? 22 / cam.z : 0} />)}
          {apercu && <g opacity="0.75"><ElementDessin e={{ id: 'apercu', type: 'forme', forme: typeForme, ...apercu, couleur, ep, remplie: remplie && estFermee(typeForme) }} /></g>}
          <path ref={traitRef} d="" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {zoneApercu && <rect x={zoneApercu.x} y={zoneApercu.y} width={zoneApercu.w} height={Math.max(zoneApercu.h, TAILLES_TEXTE[tailleIdx] * 1.35)} rx={6 / cam.z}
            fill="rgba(10,132,255,0.08)" stroke="#0a84ff" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" strokeWidth="1.5" />}
        </g>
      </svg>

      {/* COUCHE DES ZONES DE TEXTE : transformée comme le dessin (caméra) */}
      <div className={'md-couche' + (outil === 'texte' ? ' outil-texte' : '')} ref={coucheRef}>
        {zones.map((z) => (
          <div key={z.id} data-id={z.id} className={'md-zone' + (z.id === selId ? ' sel' : '') + (edition && edition.id === z.id ? ' cachee' : '')}
            style={styleZone(z)} dangerouslySetInnerHTML={{ __html: htmlZone(z) }} />
        ))}
        <div ref={editeurRef} className="md-zone md-editeur" contentEditable suppressContentEditableWarning spellCheck={false}
          style={{ display: 'none' }} onInput={rafraichir} onKeyUp={rafraichir} onMouseUp={rafraichir}
          onBlur={(e) => { if (editionRef.current && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.md-format'))) terminerEdition(); }} />
      </div>

      {/* POIGNÉES de la zone sélectionnée (taille constante à l'écran, gros pour le doigt) */}
      {selEcran && !edition && (
        <div className="md-poignees" style={{ left: selEcran.x, top: selEcran.y, width: selEcran.w, height: selEcran.h }}>
          {['no', 'ne', 'so', 'se'].map((c) => (
            <span key={c} className={'md-poignee md-poignee-' + c} onPointerDown={(e) => debutPoignee(e, c)} aria-label="Redimensionner la zone"><i /></span>
          ))}
        </div>
      )}
      </div>

      {!elements.length && !edition && <div className="md-vide">Dessine au doigt · deux doigts pour déplacer et zoomer</div>}

      {/* BARRE DE MISE EN FORME : au-dessus de la zone sélectionnée, ou collée au-dessus du
          CLAVIER pendant l'écriture. Gros boutons ; un toucher ne retire pas le clavier. */}
      {zoneSel && (() => {
        const enEcriture = !!edition;
        const sc = sceneRef.current ? sceneRef.current.getBoundingClientRect() : { top: 60, width: 390 };
        const racine = racineRef.current ? racineRef.current.getBoundingClientRect() : { top: 0 };
        const hautSc = sc.top - racine.top;
        // hors écriture : AU-DESSUS de la zone (poignées comprises), sinon EN DESSOUS, sinon
        // en haut de l'écran — jamais par-dessus la zone. En écriture : collée au clavier.
        const HB = (barreFormatRef.current && barreFormatRef.current.offsetHeight) || 124;
        const style = enEcriture
          ? { bottom: clavier + 8 }
          : (() => {
            const dessus = hautSc + selEcran.y - HB - 26, dessous = hautSc + selEcran.y + selEcran.h + 26;
            if (dessus >= hautSc + 6) return { top: dessus };
            if (dessous + HB <= hautSc + sc.height - 90) return { top: dessous };
            return { top: hautSc + 6 };
          })();
        const selMot = enEcriture && selectionDans(editeurRef.current);
        const B = ({ action, val, label, actif, children, className = '' }) => (
          <button type="button" aria-label={label} title={label} className={'md-fbtn ' + className + (actif ? ' actif' : '')}
            onPointerDown={(e) => e.preventDefault()} onClick={() => appliquer(action, val)}>{children}</button>
        );
        return (
          <div ref={barreFormatRef} className={'md-format' + (enEcriture ? ' sur-clavier' : '')} style={style} onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}>
            {paletteZone && (
              <div className="md-format-couleurs">
                {[ENCRE_PASTILLE, ...COLORS].map((c) => (
                  <button key={c.id} type="button" className="md-pastille" style={{ '--c': c.hex }} aria-label={c.label}
                    onPointerDown={(e) => e.preventDefault()} onClick={() => { appliquer('couleur', c.id); setPaletteZone(false); }} />
                ))}
              </div>
            )}
            {/* rangée 1 : la mise en forme (tient en largeur, boutons de 40 px) */}
            <div className="md-format-rang">
              <B action="taille" val={-2} label="Texte plus petit"><span className="md-a-petit">A</span>−</B>
              <span className="md-texte-taille">{selMot ? Math.round(tailleSelection(editeurRef.current, tailleCourante)) : tailleCourante}</span>
              <B action="taille" val={2} label="Texte plus grand"><span className="md-a-grand">A</span>+</B>
              <span className="md-format-sep" />
              <B action="gras" label="Gras" actif={etatFormat('bold', 'gras')}><b>G</b></B>
              <B action="italique" label="Italique" actif={etatFormat('italic', 'italique')}><i style={{ fontFamily: 'Georgia, serif' }}>I</i></B>
              <B action="souligne" label="Souligné" actif={etatFormat('underline', 'souligne')}><u>S</u></B>
              <button type="button" className="md-fbtn" aria-label="Couleur" onPointerDown={(e) => e.preventDefault()} onClick={() => setPaletteZone((v) => !v)}>
                <span className="md-fcouleur" style={{ background: couleurSurFond(zoneSel.couleur, 'noir') }} />
              </button>
              {!selMot && <B action="align" label="Alignement"><span className={'md-align md-align-' + (zoneSel.align || 'left')}><i /><i /><i /></span></B>}
            </div>
            {/* rangée 2 : à quoi s'applique la mise en forme, et les actions (avec libellés) */}
            <div className="md-format-rang md-format-actions">
              <span className={'md-format-cible' + (selMot ? ' mot' : '')}>{selMot ? 'Mot sélectionné' : 'Toute la zone'}</span>
              <span style={{ flex: 1 }} />
              <button type="button" className="md-fbtn md-flabel" aria-label="Dupliquer la zone" onPointerDown={(e) => e.preventDefault()} onClick={dupliquerZone}><Icon name="copy" size={16} /> Dupliquer</button>
              <button type="button" className="md-fbtn md-flabel md-fsuppr" aria-label="Supprimer la zone" onPointerDown={(e) => e.preventDefault()} onClick={supprimerZone}><Icon name="trash" size={16} /> Supprimer</button>
              {enEcriture
                ? <button type="button" className="md-fbtn md-fok" aria-label="Terminer" onPointerDown={(e) => e.preventDefault()} onClick={terminerEdition}><Icon name="check" size={17} /></button>
                : <button type="button" className="md-fbtn md-fok" aria-label="Écrire dans la zone" onClick={() => ouvrirEdition(zoneSel)}><IconeOutil nom="texte" size={17} /></button>}
            </div>
          </div>
        );
      })()}

      {/* DOCK FLOTTANT (02/10 nuit) : la carte des réglages de l'outil (couleurs, taille,
          lissage, formes) au-dessus de la barre d'outils, en verre sombre. Toucher l'outil
          actif replie / déplie la carte. */}
      <div className="md-dock">
        {/* zone de texte sélectionnée : sa barre de mise en forme remplace la carte (place libre) */}
        {/* PAYSAGE (03/10) : la carte devient un panneau VERTICAL le long de la colonne
            d'outils (chaque réglage en colonne) — la largeur reste au dessin. La gomme et
            la main n'y ont pas de réglage : pas de carte. */}
        {carteOuverte && !(outil === 'texte' && selId) && !(paysage && (outil === 'gomme' || outil === 'main')) && (
          <div className="md-carte" role="group" aria-label="Réglages de l’outil">
            {outil === 'forme' && (
              <div className="md-rang md-formes">
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
              <PaletteMobile couleur={outil === 'texte' && zoneSel ? zoneSel.couleur : couleurActive}
                onCouleur={(c) => {
                  if (outil === 'surligneur') { setCouleurSurl(c); return; }
                  setCouleur(c);
                  if (outil === 'texte' && (editionRef.current || selId)) appliquer('couleur', c);
                }} />
            )}
            {outil === 'texte' && (
              <div className="md-rang md-tailles" role="group" aria-label="Taille du texte">
                {TAILLES_TEXTE.map((t, i) => (
                  <button key={t} type="button" className={'md-taille' + (tailleIdx === i ? ' actif' : '')} onClick={() => setTailleIdx(i)} aria-label={`Taille ${i + 1}`}>
                    <span className="md-taille-a" style={{ fontSize: 12 + i * 3.5 }}>A</span>
                  </button>
                ))}
              </div>
            )}
            {/* épaisseur + lissage : une seule colonne en paysage (sans effet en portrait) */}
            <div className="md-col">
            {outil !== 'gomme' && outil !== 'main' && outil !== 'texte' && (
              <div className="md-rang md-tailles" role="group" aria-label="Épaisseur">
                {EPAISSEURS.map((p, i) => {
                  const d = Math.min(24, p * (outil === 'surligneur' ? 1.4 : 1) + 3);
                  return (
                    <button key={p} type="button" className={'md-taille' + (epIdx === i ? ' actif' : '')} onClick={() => setEpIdx(i)} aria-label={`Épaisseur ${i + 1}`}>
                      <span className="md-taille-pt" style={{ width: d, height: d, background: couleurSurFond(couleurActive, 'noir'), opacity: outil === 'surligneur' ? 0.55 : 1 }} />
                    </button>
                  );
                })}
              </div>
            )}
            {(outil === 'crayon' || outil === 'surligneur') && (
              <button type="button" className={'md-bascule' + (lisse ? ' actif' : '')} onClick={() => setLisse(!lisse)} aria-pressed={lisse}>
                <span className="md-bascule-txt"><b>Lissage</b><small>{lisse ? 'Adaptatif : léger pour écrire, doux pour dessiner' : 'Tracé brut, exactement le doigt'}</small></span>
                <span className="md-interrupteur"><i /></span>
              </button>
            )}
            </div>
            {outil === 'gomme' && <div className="md-aide">Touche ou glisse sur un trait, une forme ou un texte pour l’effacer.</div>}
            {outil === 'texte' && <div className="md-aide">Trace une zone au doigt pour écrire · touche une zone pour la sélectionner (poignées, mise en forme), glisse-la pour la déplacer.</div>}
            {outil === 'main' && <div className="md-aide">Glisse pour déplacer le dessin · pince pour zoomer.</div>}
          </div>
        )}
        <div className="md-outils" role="group" aria-label="Outils">
          {OUTILS.map((o) => (
            <button key={o.id} type="button" className={'md-outil' + (outil === o.id ? ' actif' : '')}
              onClick={() => { if (editionRef.current) terminerEdition(); if (o.id === outil) setCarteOuverte((v) => !v); else { setOutil(o.id); setSelId(null); setCarteOuverte(true); } }}>
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

/* outil de mesure (tests) : écart moyen entre les points du doigt et la ligne lissée */
/** ligne centrale lissée d'un trait (mesures). */
export function pointsLisses(points, ep, f) {
  return getStrokePoints(preLisser(points, f), { ...optionsLissage(ep, false, false, f), last: true }).map((p) => p.point);
}
export function ecartLissage(points, ep, f) {
  const lisses = pointsLisses(points, ep, f);
  let somme = 0, max = 0;
  for (const q of points) { let m = Infinity; for (const p of lisses) m = Math.min(m, Math.hypot(p[0] - q[0], p[1] - q[1])); somme += m; max = Math.max(max, m); }
  return { moyen: somme / points.length, max };
}
