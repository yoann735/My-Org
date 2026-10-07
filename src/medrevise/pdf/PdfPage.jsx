/* ============================================================
   MedRevise — UNE PAGE de PDF et ses couches d'annotation, plus les
   composants d'annotation eux-mêmes (boîte de texte libre, bloc de
   remplacement de texte, barre de mise en forme).

   Extrait de pdf/PdfReader.jsx (étape 4 du refactor) SANS AUCUN CHANGEMENT DE
   COMPORTEMENT : corps recopiés à l'identique, seuls les imports et les
   `export` sont nouveaux. Le fichier de 1900 lignes n'était plus relisable ;
   séparer « le lecteur » de « une page » était le découpage évident, parce que
   l'interface entre les deux existait déjà (les props de PdfPageContent).

   Ordre des couches dans une page, du bas vers le haut — il porte la moitié des
   garanties d'interaction, voir « LES QUATRE VERROUS » dans NoteBox :
     canvas → couche de texte → surlignages (transparents à la souris)
            → blocs de remplacement → couche de tracé (outil Boîte seulement)
            → boîtes libres
   ============================================================ */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { noterPointeur, pointeurIgnore, prendreTrace, rendreTrace } from '../lib/tablette.js';
import { EditorContent } from '@tiptap/react';
import { IconeOutil } from './IconesOutils.jsx';
import { SelecteurCouleurs, BoutonCouleur } from './Couleurs.jsx';
import { cheminForme, extremites, typeForme, estTrait, estFermee, tailleParDefaut, ancreSurForme } from './formes.js';
import { suivreImage } from './attaches.js';
import { Icon } from '../../shared/Icon.jsx';
import { outputScaleFor } from './pdfjsSetup.js';
import { richToHTML } from '../documents/lib/richtext.js';
import { blobURL } from '../lib/storage.js';
import {
  couleurFoncee, opaciteFondBoite, FONT_SIZES, FONT_FAMILIES, BOITE_MIN, BOITE_DEFAUT,
  clamp, clamp01, avecAlpha, buildTextLayer, cleanSelectedText,
  anchorFromRange, rangeFromAnchor, rectsFromRange, computeMatchRectsFromDom,
  soustraireAncres, partCouverte, couleurHex,
  lisserTrait, traitTouche, cheminLisse, suivreEnDouceur, modeDuTrait,
  EPAISSEUR_SURLIGNEUR, OPACITE_SURLIGNEUR, positionTexteProche,
} from './pdfShared.js';

/** rendu d'une seule page (montée uniquement si proche du viewport) : canvas + couche de
    texte + surlignages + surlignage de recherche (géométrie exacte, Chantier 2) + blocs
    de texte édités (Chantier 1). */
export function PdfPageContent({
  pdfDoc, pageNum, vierge = false, scale, pageHeight, dpr, highlights, edits, boites, traits, outil, activeEditId, matches, activeMatchIdx,
  onCreateHighlight, onHighlightClick, onActivateEdit, activeEditor, onCreerBoite, onMajBoite, onSupprimerBoite, onModifierBoite, pageWidth, ancrageBoiteId = null, ancrageFleche = false, ancrageSurlignage = false, ancrageAjout = false, onDemanderAncrage = () => {},
  onCreerTrait, onSupprimerTraits, cibleHlId,
  ocrPage = null, ocrDebug = false, // couche OCR de cette page (docs/compte-rendu-ocr.md)
  couleurTrait = 'jaune', epaisseurTrait = 0.0042, opaciteTrait = 1, aimantActif = true, modeCrayon = 'dessin',
  textes = [], questions = [], onPoser = () => {},
  images = [], imageActiveId = null, onImageActiver = () => {}, onImageMaj = () => {}, onImageCalque = () => {}, onImageSupprimer = () => {},
  formes = [], formeActiveId = null, onFormeActiver = () => {}, onCreerForme = () => {}, onFormeMaj = () => {}, onFormeSupprimer = () => {}, onFormeLegende = () => {},
  couleurForme = '#e5383b', typeFormeActif = 'rectangle', formeRemplie = false, onFormeModifier = () => {},
  couleurApercuSelection = null,
}) {
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  /* ============================================================
     SÉLECTION DESSINÉE PAR L'APP (02/10 nuit). Le navigateur garde la sélection
     (précise au caractère) mais elle est INVISIBLE sur la couche de texte ; ce calque
     la dessine : un aplat UNIFORME (les spans qui se chevauchent ne s'additionnent pas,
     un surlignage dessous ne la fait pas foncer), puis le texte de la page ré-imprimé
     par-dessus en « multiply » — net et noir. Redessinée à chaque changement de
     sélection, une fois par image. `couleurApercuSelection` : avec le surligneur, la
     sélection prend la couleur du surlignage à venir (aperçu fidèle pendant le geste).
     ============================================================ */
  const selCanvasRef = useRef(null);
  const couleurSelRef = useRef(null); couleurSelRef.current = couleurApercuSelection;
  const dessinerSelRef = useRef(null);
  useEffect(() => {
    let raf = 0;
    const dessiner = () => {
      raf = 0;
      const cv = selCanvasRef.current, couche = textLayerRef.current, src = canvasRef.current;
      if (!cv || !couche) return;
      const pr = couche.getBoundingClientRect();
      const W = pr.width, H = pr.height, k = window.devicePixelRatio || 1;
      const rects = [];
      const sel = document.getSelection();
      if (sel && sel.rangeCount && !sel.isCollapsed) {
        const range = sel.getRangeAt(0);
        if (range.intersectsNode(couche)) {
          for (const sp of couche.querySelectorAll('span')) {
            const t = sp.firstChild;
            if (!t || t.nodeType !== 3 || !t.length || !range.intersectsNode(t)) continue;
            const r = document.createRange();
            r.setStart(t, t === range.startContainer ? range.startOffset : 0);
            r.setEnd(t, t === range.endContainer ? range.endOffset : t.length);
            // même hauteur qu'un surlignage (un peu plus haute que la boîte du span) :
            // un surlignage sous la sélection est entièrement recouvert, sans liseré
            for (const q of r.getClientRects()) if (q.width > 0.5 && q.height > 0.5) rects.push([q.left - pr.left, q.top - pr.top - q.height * 0.1, q.width, q.height * 1.16]);
          }
        }
      }
      const pw = Math.max(1, Math.round(W * k)), ph = Math.max(1, Math.round(H * k));
      if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
      const g = cv.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, pw, ph);
      if (!rects.length) return;
      g.setTransform(k, 0, 0, k, 0, 0);
      g.beginPath(); rects.forEach(([x, y, w, h]) => g.rect(x, y, w, h)); // UNION des morceaux : un seul aplat
      g.fillStyle = couleurSelRef.current || getComputedStyle(document.documentElement).getPropertyValue('--mr-selection-page').trim() || 'rgb(197, 216, 246)';
      g.fill();
      if (src && src.width) { g.save(); g.clip(); g.globalCompositeOperation = 'multiply'; g.drawImage(src, 0, 0, W, H); g.restore(); }
    };
    const planifier = () => { if (!raf) raf = requestAnimationFrame(dessiner); };
    dessinerSelRef.current = planifier;
    document.addEventListener('selectionchange', planifier);
    return () => { document.removeEventListener('selectionchange', planifier); if (raf) cancelAnimationFrame(raf); };
  }, []);
  useEffect(() => { if (dessinerSelRef.current) dessinerSelRef.current(); }, [couleurApercuSelection]);

  // image en cours de geste : ses textes attachés la suivent EN DIRECT (02/10 nuit)
  const [apercuImage, setApercuImage] = useState(null);
  const renderTaskRef = useRef(null);
  const [matchRects, setMatchRects] = useState([]);
  const [layerVersion, setLayerVersion] = useState(0); // +1 à chaque (re)construction de la couche de texte

  // rects AFFICHÉS de chaque surlignage ancré, recalculés depuis l'ancre sur la couche
  // réellement montée (voir « ANCRAGE » en tête de fichier). Absents de la table (ancien
  // surlignage sans ancre, couche pas encore prête, texte qui ne correspond plus) →
  // on affiche h.rects, la géométrie enregistrée à la création.
  const [shownRects, setShownRects] = useState({});
  useLayoutEffect(() => {
    const container = textLayerRef.current;
    if (!container || !layerVersion) { setShownRects({}); return; }
    const next = {};
    for (const h of highlights) {
      const range = h.anchor && rangeFromAnchor(container, h.anchor);
      if (!range || cleanSelectedText(range.toString(), { inline: true }) !== h.texte) continue;
      const rects = rectsFromRange(container, range);
      if (rects.length) next[h.id] = rects;
    }
    setShownRects(next);
  }, [highlights, layerVersion]);

  // BUG 1 : annule tout rendu pdf.js encore en vol avant d'en démarrer un nouveau sur le
  // MÊME <canvas> — deux RenderTask concurrents sur un même contexte 2D peuvent laisser sa
  // matrice de transformation dans un état incohérent (page rendue "à l'envers" jusqu'au
  // scroll suivant, qui force un rendu propre). On repart aussi d'une matrice identité
  // (setTransform) avant chaque rendu, en garde défensive — pdf.js gère lui-même son
  // save()/restore() interne, mais on ne laisse rien d'hypothétiquement résiduel s'accumuler.
  /* ZOOM FLUIDE (02/10). Avant, chaque cran de zoom remettait le canvas à zéro
     (changer sa largeur l'efface) puis faisait redessiner la page par pdf.js : page
     blanche, puis page nette, à chaque événement de molette — d'où les à-coups.
     Désormais : le canvas est affiché à 100 % de la page (l'ancienne image s'étire
     AUSSITÔT à la nouvelle taille), la page est redessinée HORS ÉCRAN puis recopiée
     d'un coup, et ce rendu attend que le zoom se pose (140 ms sans nouveau cran). */
  const dejaRendu = useRef(false);
  useEffect(() => {
    let cancelled = false;
    let minuterie = null;
    const rendre = async () => {
      if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch (e) { /* ignore */ } }
      if (vierge) {
        // PAGE AJOUTÉE : rien à demander à pdf.js — une page blanche, sans texte
        const canvas = canvasRef.current;
        canvas.width = 1; canvas.height = 1; canvas.style.width = '100%'; canvas.style.height = '100%';
        const c2d = canvas.getContext('2d'); c2d.fillStyle = '#fff'; c2d.fillRect(0, 0, 1, 1);
        if (textLayerRef.current) textLayerRef.current.replaceChildren();
        setLayerVersion((v) => v + 1);
        setMatchRects([]);
        return;
      }
      const page = await pdfDoc.getPage(pageNum);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      // netteté : le canvas porte `os` pixels réels par pixel CSS (2 sur Retina) et
      // reste AFFICHÉ à la taille du viewport — la couche de texte et les surlignages,
      // positionnés en px CSS, ne voient aucune différence.
      const os = outputScaleFor(viewport.width, viewport.height, dpr);
      // rendu HORS ÉCRAN : le canvas affiché garde l'image précédente jusqu'au bout
      const horsEcran = document.createElement('canvas');
      horsEcran.width = Math.floor(viewport.width * os); horsEcran.height = Math.floor(viewport.height * os);
      const c2d = horsEcran.getContext('2d');
      c2d.setTransform(1, 0, 0, 1, 0, 0);
      const task = page.render({ canvasContext: c2d, viewport, transform: os !== 1 ? [os, 0, 0, os, 0, 0] : undefined });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch (e) {
        if (e && e.name === 'RenderingCancelledException') return; // annulation normale (voir ci-dessus)
        throw e;
      } finally {
        if (renderTaskRef.current === task) renderTaskRef.current = null;
      }
      if (cancelled) return;
      // recopie d'un seul coup (redimensionner puis dessiner dans la même tâche : aucune
      // image blanche n'est jamais affichée)
      canvas.width = horsEcran.width; canvas.height = horsEcran.height;
      canvas.style.width = '100%'; canvas.style.height = '100%';
      canvas.getContext('2d').drawImage(horsEcran, 0, 0);
      dejaRendu.current = true;
      await buildTextLayer(page, viewport, textLayerRef.current, ocrPage);
      if (cancelled) return;
      setLayerVersion((v) => v + 1); // couche de texte prête : les ancres peuvent être résolues
      // Chantier 2 : la textLayer réelle vient d'être (re)construite pour ce scale —
      // c'est le bon moment pour mesurer les rects exacts des occurrences via Range.
      setMatchRects(computeMatchRectsFromDom(textLayerRef.current, matches));
    };
    // premier rendu tout de suite ; ensuite (zoom, recherche) on laisse le geste se poser
    minuterie = setTimeout(rendre, dejaRendu.current && !vierge ? 140 : 0);
    return () => {
      cancelled = true;
      clearTimeout(minuterie);
      if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch (e) { /* ignore */ } }
    };
  }, [pdfDoc, pageNum, vierge, scale, dpr, matches, ocrPage]);

  /* tracé d'une NOUVELLE boîte : cliquer-glisser dessine le rectangle, un simple
     clic pose une boîte de taille par défaut au point visé. Tout est normalisé
     [0,1] par rapport à la page, donc indépendant du zoom. */
  const [trace, setTrace] = useState(null);
  const demarrerTrace = (e) => {
    noterPointeur(e); // stylet : le doigt et la paume ne dessinent plus (lib/tablette.js)
    if (pointeurIgnore(e)) return;
    const pid = e.pointerId; // un tracé ne suit QUE son pointeur (2e doigt, paume)
    e.preventDefault(); // pas de sélection native pendant le tracé
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const x0 = clamp01((e.clientX - r.left) / r.width);
    const y0 = clamp01((e.clientY - r.top) / r.height);
    let courant = null;
    const move = (ev) => {
      if (ev.pointerId !== pid) return;
      const x1 = clamp01((ev.clientX - r.left) / r.width);
      const y1 = clamp01((ev.clientY - r.top) / r.height);
      courant = { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
      setTrace(courant);
    };
    const up = (ev) => {
      if (ev && ev.pointerId !== pid) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setTrace(null);
      let rect = courant;
      if (!rect || rect.width < BOITE_MIN.width || rect.height < BOITE_MIN.height) {
        rect = { x: x0, y: y0, width: BOITE_DEFAUT.width, height: BOITE_DEFAUT.height };
      }
      // la boîte ne sort jamais de la page
      const x = clamp(rect.x, 0, 1 - BOITE_MIN.width);
      const y = clamp(rect.y, 0, 1 - BOITE_MIN.height);
      // taille TRACÉE = fraction de la page, telle quelle (04/10 : la boîte suit la page au zoom)
      const k = 1;
      onCreerBoite({
        page: pageNum, x, y,
        width: clamp(rect.width * k, BOITE_MIN.width, 1 - x),
        height: clamp(rect.height * k, BOITE_MIN.height, 1 - y),
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /* TRACÉ D'UNE FORME (03/10, enrichi le 02/10 soir) : glisser = la forme étirée du point
     d'appui au pointeur ; un simple clic pose la forme à sa taille par défaut, centrée
     sur le point visé. Maj = proportions gardées (carré, cercle) ou trait aimanté à
     45°. Un trait (ligne, flèche) garde son SENS : il part du point d'appui. L'outil
     reste actif pour en poser d'autres. */
  const [traceForme, setTraceForme] = useState(null);
  const demarrerForme = (e) => {
    noterPointeur(e); // stylet : le doigt et la paume ne dessinent plus (lib/tablette.js)
    if (pointeurIgnore(e)) return;
    const pid = e.pointerId; // un tracé ne suit QUE son pointeur (2e doigt, paume)
    if (e.button !== 0) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const type = typeFormeActif;
    const trait = estTrait(type);
    const x0 = clamp01((e.clientX - r.left) / r.width), y0 = clamp01((e.clientY - r.top) / r.height);
    let courant = null;
    const calculer = (ev) => {
      let x1 = clamp01((ev.clientX - r.left) / r.width), y1 = clamp01((ev.clientY - r.top) / r.height);
      if (ev.shiftKey) {
        const dxp = (x1 - x0) * r.width, dyp = (y1 - y0) * r.height;
        if (trait) { // aimanté à 45°
          const a = Math.round(Math.atan2(dyp, dxp) / (Math.PI / 4)) * (Math.PI / 4), L = Math.hypot(dxp, dyp);
          x1 = clamp01(x0 + (Math.cos(a) * L) / r.width); y1 = clamp01(y0 + (Math.sin(a) * L) / r.height);
        } else { // carré / cercle
          const c = Math.max(Math.abs(dxp), Math.abs(dyp));
          x1 = clamp01(x0 + (Math.sign(dxp || 1) * c) / r.width); y1 = clamp01(y0 + (Math.sign(dyp || 1) * c) / r.height);
        }
      }
      return { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0),
        // sens du tracé : un trait part du point d'appui ; une accolade / un crochet / un
        // triangle s'ouvrent vers là où on a tiré (vers la gauche ou le haut = retourné)
        fx: x1 < x0, fy: y1 < y0 };
    };
    const move = (ev) => { if (ev.pointerId !== pid) return; courant = calculer(ev); setTraceForme({ ...courant, type }); };
    const up = (ev) => {
      if (ev && ev.pointerId !== pid) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setTraceForme(null);
      let rect = courant;
      const longueurPx = rect ? Math.hypot(rect.width * r.width, rect.height * r.height) : 0;
      const tropPetit = !rect || (trait ? longueurPx < 8 : rect.width * r.width < 8 || rect.height * r.height < 8);
      if (tropPetit) {
        const t = tailleParDefaut(type, r.width / r.height);
        rect = { x: clamp(x0 - t.width / 2, 0, 1 - t.width), y: clamp(y0 - t.height / 2, 0, 1 - t.height), width: t.width, height: t.height, fx: false, fy: false };
      }
      onCreerForme({ page: pageNum, ...rect, forme: type });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /* CONTOUR AU SURVOL : le surlignage sous le curseur s'entoure, et le curseur passe
     en « main ». Sans ça, rien n'indiquait qu'un surlignage était cliquable — c'est
     la première raison pour laquelle le supprimer n'était pas évident.
     MÊME test de position que le clic (les rectangles sont transparents à la souris,
     pour qu'on puisse toujours sélectionner le texte dessous), limité à une frame. */
  const [survolId, setSurvolId] = useState(null);
  const rafSurvol = useRef(null);
  const positionSurlignage = (clientX, clientY) => {
    const container = textLayerRef.current;
    if (!container) return null;
    const cr = container.getBoundingClientRect();
    if (!cr.width || !cr.height) return null;
    const px = (clientX - cr.left) / cr.width, py = (clientY - cr.top) / cr.height;
    const hit = [...highlights].reverse().find((h) => (shownRects[h.id] || h.rects).some((r) => px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height));
    return hit || null;
  };
  const handleMouseMove = (e) => {
    // FLUIDITÉ (02/10 nuit) : pendant un glisser (sélection, surlignage), aucun calcul de
    // survol — il recalculait la position de chaque surlignage à chaque image du geste
    if (e.buttons & 1) return;
    if (rafSurvol.current) return;
    const { clientX, clientY } = e; // capturé avant la frame suivante
    rafSurvol.current = requestAnimationFrame(() => {
      rafSurvol.current = null;
      const hit = positionSurlignage(clientX, clientY);
      setSurvolId((cur) => (hit ? (cur === hit.id ? cur : hit.id) : (cur === null ? cur : null)));
    });
  };
  useEffect(() => () => { if (rafSurvol.current) cancelAnimationFrame(rafSurvol.current); }, []);

  /* CRAYON. Même principe de couche que la boîte (VERROU 1) : tant que l'outil
     est actif, une couche posée au-dessus de la couche de texte intercepte tout,
     donc ni sélection ni surlignage ne peuvent se déclencher pendant qu'on dessine.
     On échantillonne avec un pas minimal — sans ça un trait lent enregistrerait
     des milliers de points quasi confondus, pour rien.
     `ratio` = largeur/hauteur de la page : sans lui, l'accrochage angulaire
     redresserait de travers, l'espace normalisé n'étant pas carré. */
  /* FLUIDITÉ (nuit du 30/09) : l'ancien échantillonnage gardait un point tous les
     ~3 px et le rendait en segments droits — d'où un trait anguleux. Désormais :
     1. TOUS les événements du pointeur (getCoalescedEvents : la souris en émet
        plusieurs par image, le navigateur n'en livre qu'un) ;
     2. un pas minimal sous le pixel, pour ne garder que ce qui bouge ;
     3. le STREAMLINE (suivreEnDouceur) qui absorbe le tremblement en direct ;
     4. un rendu en courbes (cheminLisse), en direct comme une fois enregistré.
     Le dernier point rejoint la position réelle au relâchement : le trait finit
     exactement sous le curseur, sans le retard du lissage. */
  const [traitEnCours, setTraitEnCours] = useState(null);
  const PAS_MIN = 0.0007;
  const demarrerTrait = (e) => {
    noterPointeur(e); // stylet : le doigt et la paume ne dessinent plus (lib/tablette.js)
    if (pointeurIgnore(e)) return;
    const pid = e.pointerId; // un tracé ne suit QUE son pointeur (2e doigt, paume)
    if (e.button !== 0) return;
    // un seul tracé à la fois ; 2e doigt aussitôt posé = geste à deux doigts → tracé annulé
    if (!prendreTrace(e, () => { annule = true; finir(); })) return;
    let annule = false;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const ratio = r.width / r.height;
    const surligneur = modeCrayon === 'surligneur';
    const pt = (ev) => [clamp01((ev.clientX - r.left) / r.width), clamp01((ev.clientY - r.top) / r.height)];
    let points = [pt(e)];
    let brut = points[0];
    let raf = null;
    const peindre = () => { raf = null; setTraitEnCours(points); };
    setTraitEnCours(points);
    const ajouter = (q) => {
      brut = q;
      const lisse = suivreEnDouceur(points[points.length - 1], q, surligneur ? 0.3 : 0.45);
      const der = points[points.length - 1];
      if (Math.hypot(lisse[0] - der[0], lisse[1] - der[1]) < PAS_MIN) return;
      points = [...points, lisse];
    };
    const move = (ev) => {
      if (ev.pointerId !== pid) return;
      const lot = typeof ev.getCoalescedEvents === 'function' ? ev.getCoalescedEvents() : [];
      (lot.length ? lot : [ev]).forEach((x) => ajouter(pt(x)));
      if (!raf) raf = requestAnimationFrame(peindre);
    };
    const finir = () => {
      rendreTrace(pid);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (raf) cancelAnimationFrame(raf);
      setTraitEnCours(null);
    };
    const up = (ev) => {
      if (ev && ev.pointerId !== pid) return;
      finir();
      if (annule || (ev && ev.type === 'pointercancel')) return;
      const fin = ev && Number.isFinite(ev.clientX) ? pt(ev) : brut;
      const der = points[points.length - 1];
      if (Math.hypot(fin[0] - der[0], fin[1] - der[1]) > 1e-6) points = [...points, fin];
      if (points.length >= 2) {
        onCreerTrait({ page: pageNum, mode: modeCrayon,
          points: lisserTrait(points, { aimant: !surligneur && aimantActif, ratio }) });
      }
    };
    window.addEventListener('pointercancel', up);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /* GOMME (nuit du 30/09). Elle n'efface QUE les traits de crayon (dessin et
     surligneur à main levée) — jamais un surlignage de texte ni une boîte, qui ont
     leur propre bouton Supprimer. Tant qu'elle est active, une couche de capture
     couvre toute la page (boîtes comprises) : rien d'autre ne peut réagir.
     Précision : la position est mesurée sur CETTE couche, qui a exactement la
     taille de la page, et le curseur est un rond dont le point chaud est au centre
     — ce qu'on voit sous le rond est ce qui s'efface. On peut cliquer (un trait)
     ou glisser (tous ceux qu'on traverse) ; un geste = UNE entrée d'annulation. */
  const [masques, setMasques] = useState(null); // traits (et formes) déjà gommés pendant le geste en cours
  const pageRef = () => (canvasRef.current && canvasRef.current.closest('.pdfr-page')) || document;
  const RAYON_GOMME = 9; // px à l'écran : le rayon du curseur rond (voir etudes.css)
  const demarrerGomme = (e) => {
    noterPointeur(e); // stylet : le doigt et la paume ne dessinent plus (lib/tablette.js)
    if (pointeurIgnore(e)) return;
    const pid = e.pointerId; // un tracé ne suit QUE son pointeur (2e doigt, paume)
    if (e.button !== 0) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const seuil = RAYON_GOMME / Math.min(r.width, r.height);
    const touches = new Map();
    let prec = null;
    const tester = (cx, cy) => {
      // échantillonne le segment depuis la position précédente : un glisser rapide
      // ne « saute » aucun trait fin entre deux événements
      const pas = prec ? Math.max(1, Math.ceil(Math.hypot(cx - prec[0], cy - prec[1]) / 3)) : 1;
      for (let k = 1; k <= pas; k++) {
        const x = prec ? prec[0] + ((cx - prec[0]) * k) / pas : cx;
        const y = prec ? prec[1] + ((cy - prec[1]) * k) / pas : cy;
        const px = (x - r.left) / r.width, py = (y - r.top) / r.height;
        for (const t of traits || []) if (!touches.has(t.id) && traitTouche(t, px, py, seuil)) touches.set(t.id, t);
        // FORMES (02/10 soir) : la gomme les efface aussi — test exact sur leur tracé SVG
        // (isPointInStroke, élargi du rayon de la gomme), intérieur compris si remplie
        if (formes && formes.length) {
          for (const el of pageRef().querySelectorAll('path.pf-gomme')) {
            const id = el.getAttribute('data-id');
            if (touches.has(id)) continue;
            const f = formes.find((q) => q.id === id);
            if (f && formeSousPoint(el, x, y)) touches.set(id, f);
          }
        }
      }
      prec = [cx, cy];
      if (touches.size) setMasques(new Set(touches.keys()));
    };
    tester(e.clientX, e.clientY);
    const move = (ev) => {
      if (ev.pointerId !== pid) return;
      const lot = typeof ev.getCoalescedEvents === 'function' ? ev.getCoalescedEvents() : [];
      (lot.length ? lot : [ev]).forEach((x) => tester(x.clientX, x.clientY));
    };
    const up = async (ev) => {
      if (ev && ev.pointerId !== pid) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (touches.size) await onSupprimerTraits([...touches.values()]);
      setMasques(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /* ANCRAGE d'une boîte : la boîte en attente est-elle sur CETTE page ? Le point
     est normalisé [0,1] comme tout le reste (indépendant du zoom) ; le passage
     retenu est la ligne de texte la plus proche du point (positionTexteProche),
     pour dire en clair À QUOI la boîte est rattachée. */
  const boiteEnAncrage = ancrageBoiteId ? (boites || []).find((b) => b.id === ancrageBoiteId) : null;
  // la ligne de texte la plus proche d'un point écran (sert aussi au glisser de l'épingle)
  const texteProche = (cx, cy) => {
    const pos = textLayerRef.current && positionTexteProche(textLayerRef.current, cx, cy);
    if (!pos) return null;
    const t = cleanSelectedText(pos.node.nodeValue || '', { inline: true });
    return t ? (t.length > 90 ? t.slice(0, 90) + '…' : t) : null;
  };
  const [viseeRatee, setViseeRatee] = useState(false);
  const poserAncre = (e) => {
    if (e.button !== 0 || !boiteEnAncrage) return;
    e.preventDefault(); e.stopPropagation();
    /* VERROU 3 étendu : la couche de visée disparaît dès l'appui ; le RELÂCHEMENT
       tombait alors sur la couche de texte et ouvrait la bulle du surlignage visé.
       On le neutralise (le drapeau est consommé par handleMouseUp, ou levé juste après). */
    gesteBoite.current = true;
    window.addEventListener('mouseup', () => setTimeout(() => { gesteBoite.current = false; }, 0), { once: true });
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    /* FLÈCHE SUPPLÉMENTAIRE (02/10 soir) : une boîte peut viser PLUSIEURS endroits. Le
       clic choisit la cible : un surlignage (la flèche va à son bord), une forme
       (son côté, ou le milieu d'un trait), sinon le point cliqué. Elle s'ajoute à
       `fleches` sans toucher à l'épingle ni à la flèche principale. */
    if (ancrageAjout) {
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      let cible = null;
      const hit = positionSurlignage(e.clientX, e.clientY);
      if (hit) {
        const rs = shownRects[hit.id] || hit.rects || [];
        const rc = rs.find((q) => px >= q.x && px <= q.x + q.width && py >= q.y && py <= q.y + q.height) || rs[0];
        const boiteADroite = boiteEnAncrage.x + boiteEnAncrage.width / 2 > rc.x + rc.width / 2;
        cible = { x: boiteADroite ? rc.x + rc.width : rc.x, y: rc.y + rc.height / 2, texte: (hit.texte || '').slice(0, 90) || null, surlignageId: hit.id };
      } else {
        const m = 0.012;
        const f = [...(formes || [])].reverse().find((q) => px >= q.x - m && px <= q.x + q.width + m && py >= q.y - m && py <= q.y + q.height + m);
        cible = f ? { ...ancreSurForme(f, boiteEnAncrage), formeId: f.id } : { x: clamp01(px), y: clamp01(py), texte: texteProche(e.clientX, e.clientY) || null };
      }
      onDemanderAncrage(null);
      const id = 'fl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      onModifierBoite(boiteEnAncrage, { fleches: [...(boiteEnAncrage.fleches || []), { id, ...cible }] }, 'Flèche ajoutée');
      return;
    }
    if (ancrageSurlignage) {
      // RELIER À UN SURLIGNAGE : le clic doit tomber sur un surlignage ; l'épingle va
      // sur son bord le plus proche de la boîte, la flèche suit
      const hit = positionSurlignage(e.clientX, e.clientY);
      if (!hit) {
        // pas un surlignage : une FORME, peut-être (03/10) — l'épingle va sur son bord
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height, m = 0.012;
        const f = [...(formes || [])].reverse().find((q) => px >= q.x - m && px <= q.x + q.width + m && py >= q.y - m && py <= q.y + q.height + m);
        if (f) {
          onDemanderAncrage(null);
          onModifierBoite(boiteEnAncrage, { ancre: ancreSurForme(f, boiteEnAncrage), fleche: true, formeId: f.id, surlignageId: null }, 'Boîte reliée à la forme');
          return;
        }
        setViseeRatee(true); setTimeout(() => setViseeRatee(false), 1400); return;
      }
      const rs = shownRects[hit.id] || hit.rects || [];
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      const rc = rs.find((q) => px >= q.x && px <= q.x + q.width && py >= q.y && py <= q.y + q.height) || rs[0];
      const boiteADroite = boiteEnAncrage.x + boiteEnAncrage.width / 2 > rc.x + rc.width / 2;
      onDemanderAncrage(null);
      onModifierBoite(boiteEnAncrage, {
        ancre: { x: boiteADroite ? rc.x + rc.width : rc.x, y: rc.y + rc.height / 2, texte: (hit.texte || '').slice(0, 90) || null },
        fleche: true, surlignageId: hit.id,
      }, 'Boîte reliée au surlignage');
      return;
    }
    const x = clamp01((e.clientX - r.left) / r.width), y = clamp01((e.clientY - r.top) / r.height);
    const texte = texteProche(e.clientX, e.clientY);
    const avecFleche = ancrageFleche; // « Flèche » cliquée sans épingle : on trace la flèche dans la foulée
    onDemanderAncrage(null);
    onModifierBoite(boiteEnAncrage, { ancre: { x, y, texte: texte || null }, ...(avecFleche ? { fleche: true } : {}) }, avecFleche ? 'Épingle et flèche' : 'Épinglage de la boîte');
  };

  // Cmd+C : le texte copié garde ses retours à la ligne (issus des <br>), caractères
  // de compatibilité normalisés. Sélection vide → copie native, on ne touche à rien.
  const handleCopy = (e) => {
    const raw = window.getSelection && window.getSelection().toString();
    if (!raw) return;
    e.clipboardData.setData('text/plain', cleanSelectedText(raw));
    e.preventDefault();
  };

  // BUG 2 : un clic seul (sélection vide) ne doit RIEN déclencher — ni surlignage, ni
  // édition. L'unité d'action est toujours une sélection réelle de texte, mesurée via
  // l'API Range du DOM (gère nativement les sélections à cheval sur plusieurs spans/
  // lignes). Le choix entre "surligner" et "éditer ce texte" se fait ensuite dans la
  // popover (voir `pending` / commitHighlight / startEditFromSelection dans PdfReader) —
  // les deux actions partagent donc exactement la même géométrie de sélection.
  //
  // Étape 3 : actif en Lecture comme en Édition. Un simple clic (sélection vide) sur un
  // surlignage l'ouvre (couleur, note, suppression) — par test de position plutôt que
  // par un clic sur le rectangle : les rectangles restent transparents à la souris, on
  // peut donc toujours sélectionner du texte déjà surligné.
  // VERROU 3 (voir l'en-tête de fichier) : un geste de boîte qui vient de se
  // terminer ne doit RIEN déclencher ici, même si le pointeur a fini sa course
  // hors de la boîte — auquel cas le mouseup atteint bien cette couche.
  const gesteBoite = useRef(false);
  const handleMouseUp = (e) => {
    if (gesteBoite.current) { gesteBoite.current = false; return; }
    const sel = window.getSelection();
    const container = textLayerRef.current;
    if (!container || !sel) return;
    if (sel.isCollapsed) {
      const cr = container.getBoundingClientRect();
      if (!cr.width || !cr.height) return;
      const px = (e.clientX - cr.left) / cr.width, py = (e.clientY - cr.top) / cr.height;
      const hit = [...highlights].reverse().find((h) => (shownRects[h.id] || h.rects).some((r) => px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height));
      if (hit) onHighlightClick(hit, e);
      return;
    }
    if (!container.contains(sel.anchorNode)) return;
    /* CORRECTIF (nuit du 30/09) : sur une couche de texte faite de spans en position
       absolue, quand le glisser se termine ENTRE deux lignes (ou dans une marge),
       Chrome pose la borne mobile de la sélection sur le conteneur — « DIV, 37 » —
       dont l'index d'enfant n'a aucun rapport avec la position à l'écran : le
       surlignage englobait alors plusieurs lignes de trop sous le curseur. Dans ce
       cas, on reprend la borne sur la LIGNE la plus proche du pointeur, à la
       hauteur du pointeur (bornée aux extrémités de la ligne). */
    let selRange = sel.getRangeAt(0);
    if (sel.focusNode && sel.focusNode.nodeType !== Node.TEXT_NODE && sel.anchorNode.nodeType === Node.TEXT_NODE) {
      const pos = positionTexteProche(container, e.clientX, e.clientY);
      if (pos) {
        const r = document.createRange();
        r.setStart(sel.anchorNode, sel.anchorOffset);
        if (r.comparePoint(pos.node, pos.offset) < 0) { r.setStart(pos.node, pos.offset); r.setEnd(sel.anchorNode, sel.anchorOffset); }
        else r.setEnd(pos.node, pos.offset);
        if (!r.collapsed) selRange = r;
      }
    }
    const anchor = anchorFromRange(container, selRange);
    const range = (anchor && rangeFromAnchor(container, anchor)) || selRange;
    // sur une ligne : un surlignage à cheval sur deux lignes donne « un calcul : un IMC »,
    // pas deux lignes (ni, avant les <br>, « unIMC »)
    const texte = cleanSelectedText(range.toString(), { inline: true });
    if (!texte) return;
    const cr = container.getBoundingClientRect();
    const rects = rectsFromRange(container, range);
    if (!rects.length) return;
    const clientRects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
    // BUG C : typographie EXACTE du texte d'origine (celle du <span> pdf.js réellement
    // rendu), normalisée à la hauteur de page pour survivre au zoom. Reprise à
    // l'identique par la boîte d'édition ET le rendu final → même box model, donc
    // aucun retour à la ligne parasite ni décalage au « Terminé ».
    const startEl = sel.anchorNode && (sel.anchorNode.nodeType === Node.TEXT_NODE ? sel.anchorNode.parentElement : sel.anchorNode);
    const cs = startEl ? window.getComputedStyle(startEl) : null;
    const fontSizeRel = cs ? (parseFloat(cs.fontSize) / cr.height) : null;
    const fontFamily = cs ? cs.fontFamily : null;
    const last = clientRects[clientRects.length - 1];
    // morceaux de la sélection que ne couvre AUCUN surlignage existant (voir
    // soustraireAncres) — ce sont eux, et eux seuls, que le surligneur colorera
    const segments = [];
    if (anchor) {
      const sansAncre = highlights.filter((h) => !h.anchor).flatMap((h) => shownRects[h.id] || h.rects || []);
      for (const seg of soustraireAncres(anchor, highlights.map((h) => h.anchor).filter(Boolean))) {
        const r = rangeFromAnchor(container, seg);
        const t = r && cleanSelectedText(r.toString(), { inline: true });
        if (!t || !/[\p{L}\p{N}]/u.test(t)) continue; // espace ou ponctuation seule entre deux surlignages
        const rs = rectsFromRange(container, r).filter((x) => partCouverte(x, sansAncre) < 0.5);
        if (rs.length) segments.push({ texte: t, rects: rs, anchor: seg });
      }
    } else {
      const toutes = highlights.flatMap((h) => shownRects[h.id] || h.rects || []);
      const rs = rects.filter((x) => partCouverte(x, toutes) < 0.5);
      if (rs.length) segments.push({ texte, rects: rs, anchor: null });
    }
    onCreateHighlight({ page: pageNum, texte, rects, anchor, segments, x: last.right, y: last.bottom, fontSizeRel, fontFamily });
  };

  // surlignage relié à la boîte en cours d'écriture : il s'entoure (le lien se voit)
  const liesActifs = new Set((boites || []).filter((b) => b.id === activeEditId && b.surlignageId).map((b) => b.surlignageId));
  const liesFormes = new Set((boites || []).filter((b) => b.id === activeEditId && b.formeId).map((b) => b.formeId));

  return (
    <>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      {/* DÉBOGAGE OCR (menu Fichier › « Afficher la couche OCR ») : les boîtes des mots,
          en unités PDF ramenées à la page — vérifie l'alignement avec l'image */}
      {ocrDebug && ocrPage && !ocrPage.natif && ocrPage.width > 0 && (
        <div className="pdfr-ocr-debug" aria-hidden="true">
          {(ocrPage.words || []).map((m, i) => (
            <span key={i} className={m.c < 70 ? 'faible' : ''} title={`${m.t} · ${m.c} %`}
              style={{ left: `${(m.x / ocrPage.width) * 100}%`, top: `${(m.y / ocrPage.height) * 100}%`, width: `${(m.w / ocrPage.width) * 100}%`, height: `${(m.h / ocrPage.height) * 100}%` }} />
          ))}
        </div>
      )}
      <div ref={textLayerRef} className={'pdfr-textlayer outil-' + outil} onMouseUp={handleMouseUp} onCopy={handleCopy}
        onMouseMove={handleMouseMove} onMouseLeave={() => setSurvolId(null)}
        style={survolId ? { cursor: 'pointer' } : undefined} />
      {/* IMAGES COLLÉES (01/10) : JUSTE au-dessus du PDF, SOUS toutes les annotations
          (surlignages, blocs, traits, textes, « ? », boîtes — rendus après). Leur
          profondeur (`z`) ne les classe qu'entre elles : c'est l'ordre du DOM, sans
          z-index, donc une image ne peut jamais passer devant une annotation. */}
      {images.length > 0 && (
        <div className={'pdfr-imglayer' + (outil === 'main' ? ' interactif' : '')}>
          {images.map((img, i) => (
            <ImageCollee key={img.id} img={img} active={img.id === imageActiveId}
              premier={i === images.length - 1} dernier={i === 0}
              onActiver={onImageActiver} onMaj={onImageMaj} onCalque={onImageCalque} onSupprimer={onImageSupprimer}
              onApercu={(geo) => setApercuImage(geo ? { id: img.id, avant: img, geo } : null)}
              pageWidth={pageWidth} pageHeight={pageHeight}
              onGeste={(enCours) => { gesteBoite.current = enCours; }} />
          ))}
        </div>
      )}
      <div className="pdfr-hlayer">
        {highlights.flatMap((h) => (shownRects[h.id] || h.rects).map((r, i) => (
          <div key={h.id + ':' + i}
            className={'pdfr-hl-rect' + (h.id === survolId ? ' survol' : '') + (h.id === cibleHlId ? ' cible' : '') + (liesActifs.has(h.id) ? ' lie' : '')}
            style={{ left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.width * 100 + '%', height: r.height * 100 + '%', background: couleurHex(h.couleur),
              // couleur perso (hex) : translucide comme un vrai surligneur — un violet ou un
              // bleu foncé en pleine teinte rendrait le texte illisible (les 4 couleurs
              // « cours » sont déjà des pastels). Même rendu qu'à l'export (opacité 0,4).
              ...(String(h.couleur).startsWith('#') ? { opacity: 0.45 } : {}) }} />
        )))}
        {matchRects.map((m) => (
          <div key={'m' + m.idx + ':' + m.ri} className={'pdfr-match-rect' + (m.idx === activeMatchIdx ? ' active' : '')}
            style={{ left: m.rect.x * 100 + '%', top: m.rect.y * 100 + '%', width: m.rect.width * 100 + '%', height: m.rect.height * 100 + '%' }} />
        ))}
      </div>
      <canvas ref={selCanvasRef} className="pdfr-selcanvas" aria-hidden="true" />
      {edits.map((a) => (
        <TextEditBlock key={a.id} edit={a} active={a.id === activeEditId} editable={outil === 'main'} onActivate={onActivateEdit} editor={a.id === activeEditId ? activeEditor : null} pageHeight={pageHeight} />
      ))}

      {/* Les traits au crayon : un seul <svg> par page, transparent à la souris.
          `vector-effect: non-scaling-stroke` garde l'épaisseur constante à l'écran
          quel que soit le zoom, sans recalculer quoi que ce soit. */}
      {/* DEUX calques : les surligneurs en fusion « multiply » (le texte reste
          noir dessous) et SOUS les dessins. L'opacité est portée par le TRAIT
          entier (stroke-opacity d'un seul <path>) : un trait qui se recroise ne
          fonce pas sur lui-même, comme un vrai surligneur. */}
      {(traits.length > 0 || traitEnCours) && (() => {
        const H = pageHeight || 800;
        /* ÉPAISSEUR COLLÉE À LA PAGE (04/10, décision finale) : `epaisseur × hauteur de
           page affichée` — le trait grossit et rapetisse avec la page, comme le PDF. */
        const rendu = (t, cle, apercu = false) => {
          const surl = modeDuTrait(t) === 'surligneur';
          const ep = surl ? (t.epaisseur || EPAISSEUR_SURLIGNEUR) : (t.epaisseur || 0.0042);
          return (
            <path key={cle} d={cheminLisse(t.points)} fill="none"
              stroke={couleurHex(t.couleur)}
              strokeOpacity={Number.isFinite(t.opacite) ? t.opacite : (surl ? OPACITE_SURLIGNEUR : (apercu ? 0.9 : 1))}
              strokeWidth={Math.max(surl ? 4 : 1, ep * H)}
              strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          );
        };
        const enCours = traitEnCours && { points: traitEnCours, couleur: couleurTrait, mode: modeCrayon,
          epaisseur: epaisseurTrait, opacite: opaciteTrait };
        const visibles = masques ? traits.filter((t) => !masques.has(t.id)) : traits;
        const surl = visibles.filter((t) => modeDuTrait(t) === 'surligneur');
        const dess = visibles.filter((t) => modeDuTrait(t) !== 'surligneur');
        return (
          <>
            <svg className="pdfr-inklayer surligneur" viewBox="0 0 100 100" preserveAspectRatio="none">
              {surl.map((t) => rendu(t, t.id))}
              {enCours && enCours.mode === 'surligneur' && rendu(enCours, 'en-cours', true)}
            </svg>
            <svg className="pdfr-inklayer" viewBox="0 0 100 100" preserveAspectRatio="none">
              {dess.map((t) => rendu(t, t.id))}
              {enCours && enCours.mode !== 'surligneur' && rendu(enCours, 'en-cours', true)}
            </svg>
          </>
        );
      })()}

      {/* FORMES (03/10) : des annotations, donc au-dessus des images ; sélectionnables
          par leur BORD seulement (l'intérieur laisse passer les clics vers le texte). */}
      {formes.map((f) => (masques && masques.has(f.id) ? null : (
        <Forme key={f.id} forme={f} active={f.id === formeActiveId} interactive={outil === 'main'}
          liee={liesFormes.has(f.id)} pageWidth={pageWidth} pageHeight={pageHeight}
          onActiver={onFormeActiver} onMaj={onFormeMaj} onModifier={onFormeModifier} onSupprimer={onFormeSupprimer} onLegende={onFormeLegende}
          onGeste={(enCours) => { gesteBoite.current = enCours; }} />
      )))}
      {outil === 'forme' && (
        <div className="pdfr-drawlayer pdfr-formelayer" onPointerDown={demarrerForme}>
          {traceForme && (
            <Forme apercu forme={{ ...traceForme, forme: traceForme.type, couleur: couleurForme, remplie: formeRemplie, epaisseur: 0.0025 }}
              pageWidth={pageWidth} pageHeight={pageHeight} />
          )}
        </div>
      )}

      {outil === 'crayon' && (
        <div className="pdfr-inkcapture" onPointerDown={demarrerTrait} />
      )}

      {/* VERROU 1 : la couche de tracé n'existe QUE pendant que l'outil « Boîte de
          texte » est actif, et elle est posée AU-DESSUS de la couche de texte. Tant
          qu'elle est là, aucun événement n'atteint `pdfr-textlayer` : ni sélection,
          ni surlignage, ni test de position. Rien à désactiver, rien à oublier. */}
      {outil === 'boite' && (
        <div className="pdfr-drawlayer" onPointerDown={demarrerTrace}>
          {trace && (
            <div className="nb-preview" style={{ left: trace.x * 100 + '%', top: trace.y * 100 + '%', width: trace.width * 100 + '%', height: trace.height * 100 + '%' }} />
          )}
        </div>
      )}

      {/* OUTILS « UN CLIC = UN ÉLÉMENT » (01/10) : Texte et « ? ». Même principe
          que la couche de tracé (VERROU 1) : posée au-dessus de la couche de texte,
          elle seule reçoit le clic — ni sélection ni surlignage possibles. */}
      {(outil === 'texte' || outil === 'question') && (
        <div className={'pdfr-poselayer outil-' + outil} onPointerDown={(e) => {
          noterPointeur(e);
          if (e.button !== 0 || pointeurIgnore(e)) return;
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          if (!r.width || !r.height) return;
          onPoser(outil, { page: pageNum, x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) });
        }} />
      )}

      {/* textes libres et « ? » : des ANNOTATIONS, donc au-dessus des images et
          des traits, comme les boîtes (règle fixe des calques). */}
      {textes.map((t0) => (apercuImage && t0.imageId === apercuImage.id
        ? { ...t0, ...suivreImage(apercuImage.avant, apercuImage.geo, t0, pageHeight && pageWidth ? pageHeight / pageWidth : 1.414) } : t0)).map((t) => (
        <NoteBox key={t.id} boite={t} variante="texte" echelle={scale} active={t.id === activeEditId}
          editor={t.id === activeEditId ? activeEditor : null}
          onActivate={onActivateEdit}
          onGeste={(enCours) => { gesteBoite.current = enCours; }}
          onMaj={onMajBoite} onSupprimer={onSupprimerBoite} onModifier={onModifierBoite}
          pageWidth={pageWidth} pageHeight={pageHeight} texteProche={texteProche} />
      ))}
      {questions.map((q) => (
        <QuestionMarque key={q.id} q={q} onModifier={onModifierBoite} onSupprimer={onSupprimerBoite}
          onGeste={(enCours) => { gesteBoite.current = enCours; }} />
      ))}

      {/* rendues APRÈS la couche de tracé : une boîte existante reste toujours
          atteignable, même l'outil « Boîte de texte » actif. */}
      {boites.map((b) => (
        <NoteBox key={b.id} boite={b} echelle={scale} active={b.id === activeEditId}
          editor={b.id === activeEditId ? activeEditor : null}
          onActivate={onActivateEdit}
          onGeste={(enCours) => { gesteBoite.current = enCours; }}
          onMaj={onMajBoite} onSupprimer={onSupprimerBoite} onModifier={onModifierBoite}
          enAncrage={b.id === ancrageBoiteId} viseSurlignage={ancrageSurlignage} viseAjout={ancrageAjout} onDemanderAncrage={onDemanderAncrage}
          pageWidth={pageWidth} pageHeight={pageHeight} texteProche={texteProche} />
      ))}

      {/* VISÉE D'UN ANCRAGE : au-dessus de tout, sur la page de la boîte seulement.
          Un clic = l'endroit visé (point exact + le passage de texte le plus proche). */}
      {boiteEnAncrage && (
        <div className="pdfr-ancrage" onPointerDown={poserAncre}>
          <div className={'pdfr-ancrage-aide' + (viseeRatee ? ' ratee' : '')}>{ancrageAjout
            ? 'Clique l’endroit, le surlignage ou la forme que la nouvelle flèche doit viser'
            : ancrageSurlignage
            ? (viseeRatee ? 'Ni un surlignage ni une forme — clique sur l’un des deux' : 'Clique le surlignage ou la forme à relier à cette boîte')
            : ancrageFleche ? 'Clique l’endroit que la flèche doit viser' : 'Clique l’endroit de la fiche où épingler cette boîte'} · Échap pour annuler</div>
        </div>
      )}

      {/* GOMME : posée en DERNIER, au-dessus des boîtes — elle ne touche qu'aux traits. */}
      {outil === 'gomme' && <div className="pdfr-gommecapture" onPointerDown={demarrerGomme} />}
    </>
  );
}

/* ============================================================
   BOÎTE DE TEXTE LIBRE — et la séparation stricte des interactions.

   Le piège : cette boîte et le surligneur vivent sur la même page. Un glisser
   de boîte ne doit JAMAIS produire une sélection de texte ni un test de
   position de surlignage. Quatre verrous indépendants, parce qu'aucun ne
   couvre tout seul l'ensemble des cas :

   1. OUTIL EXPLICITE — l'outil « Boîte de texte » monte `.pdfr-drawlayer`
      AU-DESSUS de la couche de texte : pendant le tracé, `pdfr-textlayer` ne
      reçoit plus rien du tout. Structurel, pas conditionnel.
   2. LE GESTE PART D'UNE POIGNÉE, jamais de la couche de texte : le bandeau
      (déplacement) ou le coin (redimension). `preventDefault()` empêche le
      navigateur de démarrer une sélection, `stopPropagation()` isole le geste.
      Même patron éprouvé que le glisser des coches d'anatomie
      (pages/ImportAnatomieVisuel.jsx) : seuil de 4 px, écouteurs sur window,
      coordonnées normalisées par getBoundingClientRect.
   3. GARDE À L'ENTRÉE du hit-test (`gesteBoite`, voir handleMouseUp) — pour le
      cas où le pointeur termine sa course HORS de la boîte.
   4. LE CORPS N'EST PAS UNE POIGNÉE : cliquer dans le texte place le curseur.
      Si la boîte entière était déplaçable, on ne pourrait plus sélectionner
      son propre texte.

   Une seule entrée d'historique par geste : l'état d'avant est capturé au
   pointerdown, la commande empilée au pointerup, et seulement si ça a bougé.
   ============================================================ */
function NoteBox({ boite, active, editor, onActivate, onGeste, onMaj, onSupprimer, onModifier, enAncrage = false, viseSurlignage = false, viseAjout = false, onDemanderAncrage, pageWidth, pageHeight, texteProche, variante = 'boite', echelle = ECHELLE_REF }) {
  /* UN SEUL REPÈRE : LA PAGE (04/10, docs/compte-rendu-zoom-annotations.md). Position,
     épingle, connecteurs ET taille sont des fractions de page. La boîte est mise en page
     à l'échelle de RÉFÉRENCE (160 % : refW × refH, police 13 px…) puis mise à l'échelle
     de la page par UN SEUL `scale: k` (k = zoom ÷ 160 %) : cadre, texte, barre, flèches
     grossissent et rapetissent exactement comme la page. Avant (03/10), la taille restait
     en px d'écran alors que la position et les connecteurs suivaient la page : deux
     repères — au dézoom, les boîtes débordaient et l'épingle se détachait. Stockage
     inchangé : une largeur enregistrée est une fraction de la page à 160 %. */
  const refW = ((pageWidth || 0) / (echelle || ECHELLE_REF)) * ECHELLE_REF;
  const refH = ((pageHeight || 0) / (echelle || ECHELLE_REF)) * ECHELLE_REF;
  const k = (echelle || ECHELLE_REF) / ECHELLE_REF;
  const texteLibre = variante === 'texte'; // TEXTE LIBRE (01/10) : même mécanique, sans cadre ni fond
  const [apercu, setApercu] = useState(null); // géométrie pendant le geste (état local, non persisté)
  const b = apercu || boite;
  const html = useMemo(() => richToHTML(boite.content), [boite.content]);
  const barreRef = useRef(null);
  const clicRef = useRef(null); // coordonnées du clic d'activation, pour y poser le curseur
  const appuiRef = useRef(null); // point d'appui sur le texte AFFICHÉ (boîte inactive) : début d'une sélection

  /* CORRECTIF (défaut 1) : à l'activation, personne ne donnait le focus à
     l'éditeur. Le curseur restait sur <body> : la frappe n'arrivait nulle part, et
     la barre de mise en forme s'appliquait à une sélection VIDE — donc sans effet
     visible (défaut 2). On met le focus dès que l'éditeur est monté dans la boîte,
     et on pose le curseur À L'ENDROIT CLIQUÉ (posAtCoords) plutôt qu'au début. */
  /* Deuxième correctif (nuit du 30/09) : `commands.focus()` de TipTap donne le
     focus dans un requestAnimationFrame. Juste après la création d'une boîte, la
     vue n'était pas toujours encore montée DANS la boîte, et le focus restait sur
     le bouton d'outil cliqué juste avant — la première Espace tapée « cliquait »
     alors ce bouton et désactivait la boîte. On attend donc que la vue soit
     réellement dans CETTE boîte, on pose la sélection par commande, puis on
     donne le focus au DOM de façon synchrone (view.focus()). */
  const boiteRef = useRef(null);
  useEffect(() => {
    if (!active || !editor) return undefined;
    let essais = 0;
    let t = null;
    const essayer = () => {
      if (editor.isDestroyed) return;
      let dom = null;
      try { dom = editor.view && editor.view.dom; } catch (e) { dom = null; }
      if (!dom || !boiteRef.current || !boiteRef.current.contains(dom)) {
        if (essais++ < 40) t = setTimeout(essayer, 16);
        return;
      }
      try {
        const pt = clicRef.current;
        clicRef.current = null;
        const at = pt && posDansEditeur(editor, pt.x, pt.y);
        const pos = at && Number.isFinite(at.pos) ? at.pos : editor.state.doc.content.size;
        // SÉLECTION FAITE AVANT L'ACTIVATION (04/10) : glisser sur le texte affiché d'une
        // boîte inactive sélectionnait, puis le clic l'activait et l'éditeur remplaçait
        // ce texte — la sélection disparaissait. On la recrée dans l'éditeur, du point
        // d'appui au point de relâchement (même mise en page : mêmes positions).
        const de = pt && pt.depuis ? posDansEditeur(editor, pt.depuis.x, pt.depuis.y) : null;
        if (de && Number.isFinite(de.pos) && de.pos !== pos) editor.commands.setTextSelection({ from: Math.min(de.pos, pos), to: Math.max(de.pos, pos) });
        else editor.commands.setTextSelection(pos);
        editor.view.focus();
      } catch (err) { try { editor.view.focus(); } catch (e2) { /* ignore */ } }
    };
    t = setTimeout(essayer, 0);
    return () => clearTimeout(t);
  }, [active, editor]);

  // hauteur RÉELLEMENT affichée (px) : la boîte grandit avec son texte, la flèche et
  // la barre d'actions doivent partir de ce qu'on voit, pas du minimum enregistré
  const [hautVue, setHautVue] = useState(0);
  const [largVue, setLargVue] = useState(0);
  useEffect(() => {
    const el = boiteRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const mesurer = () => { setHautVue(el.offsetHeight); setLargVue(el.offsetWidth); };
    mesurer();
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, [boite.reduite]);

  const activer = (e) => {
    if (e) {
      const a = appuiRef.current;
      appuiRef.current = null;
      const sel = typeof document !== 'undefined' ? document.getSelection() : null;
      const glisse = a && Math.abs(e.clientX - a.x) + Math.abs(e.clientY - a.y) > 3 && sel && !sel.isCollapsed;
      clicRef.current = { x: e.clientX, y: e.clientY, depuis: glisse ? a : null };
    }
    onActivate(boite.id);
  };

  const demarrer = (e, type) => {
    if (e.button !== 0) return;
    e.preventDefault();   // VERROU 2 : pas de sélection native
    e.stopPropagation();  // VERROU 2 : l'événement ne remonte pas à la page
    const page = e.currentTarget.closest('.pdfr-page');
    const r = page && page.getBoundingClientRect();
    if (!r || !r.width || !r.height) return;
    const depart = { x: e.clientX, y: e.clientY };
    const avant = boite;
    // la hauteur AFFICHÉE peut dépasser la hauteur enregistrée (la boîte grandit avec
    // son texte) : la redimension part de ce qu'on voit, sinon le coin « sauterait »
    const vue = boiteRef.current ? boiteRef.current.getBoundingClientRect() : null;
    // taille AFFICHÉE en fraction de page (le rectangle à l'écran inclut déjà le scale)
    const hVue = vue ? vue.height / r.height : 0, lVue = vue ? vue.width / r.width : 0;
    // la redimension part de la taille AFFICHÉE (la boîte épouse son texte : elle peut
    // être plus étroite que sa largeur enregistrée, ou plus haute)
    const base = type === 'resize' ? { ...avant, height: Math.max(hVue, avant.height), width: lVue || avant.width } : avant;
    let courant = null;
    let bouge = false;
    onGeste(true);

    const move = (ev) => {
      if (!bouge && Math.abs(ev.clientX - depart.x) + Math.abs(ev.clientY - depart.y) <= 4) return;
      bouge = true;
      // déplacer comme redimensionner : en fraction de la page (un seul repère)
      const dx = (ev.clientX - depart.x) / r.width;
      const dy = (ev.clientY - depart.y) / r.height;
      courant = type === 'move'
        ? { ...avant, x: clamp(avant.x + dx, 0, 0.98), y: clamp(avant.y + dy, 0, 0.98) }
        : { ...avant, largeurFixe: true, // redimensionnée à la main : sa largeur ne s'ajuste plus au texte
            width: clamp(base.width + dx, BOITE_MIN.width, 1 - avant.x),
            height: clamp(base.height + dy, BOITE_MIN.height, 1 - avant.y) };
      setApercu(courant);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setApercu(null);
      onGeste(false); // relâché ici ; handleMouseUp consommera le drapeau s'il est appelé
      if (bouge && courant) onMaj(avant, courant, type === 'move' ? 'Déplacement de la boîte' : 'Redimension de la boîte');
      else if (type === 'move') onActivate(boite.id); // clic sans déplacement sur le bandeau → sélectionner
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /* HAUTEUR = UN MINIMUM (01/10) : la boîte grandit avec son texte au lieu de
     le cacher derrière un ascenseur — c'est ce qui permet de la créer compacte
     (BOITE_DEFAUT) sans jamais rien perdre. La poignée l'agrandit toujours. */
  /* LARGEUR QUI ÉPOUSE LE TEXTE (02/10) : la largeur enregistrée devient un MAXIMUM ;
     la boîte se resserre sur sa ligne la plus longue (+ une marge à droite pour
     replacer le curseur). Exceptions : une boîte vide garde sa taille (sinon elle
     deviendrait minuscule), une boîte redimensionnée à la main (`largeurFixe`)
     garde la largeur choisie, et pendant un geste on montre la largeur exacte. */
  const extraitBrut = boite.content ? richToHTML(boite.content).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
  const ajustee = !apercu && !boite.largeurFixe && !!extraitBrut;
  const style = {
    left: b.x * 100 + '%', top: b.y * 100 + '%', minHeight: b.height * refH,
    ...(k !== 1 ? { scale: String(k), transformOrigin: '0 0' } : {}),
    ...(ajustee ? { width: 'max-content', maxWidth: b.width * refW } : { width: b.width * refW }),
    ...(texteLibre
      ? { color: couleurHex(boite.couleur, '#1F1F24') }
      : { background: avecAlpha(couleurHex(boite.couleur), opaciteFondBoite(boite.couleur)), ...(!active && opaciteFondBoite(boite.couleur) < 0.9 ? { borderColor: couleurHex(boite.couleur) } : {}) }),
  };

  /* ÉPINGLE (ancre) : le point de la fiche auquel la boîte se rapporte. Un repère
     rond à cet endroit ; une boîte épinglée ET réduite devient une pastille posée
     SUR ce passage. Une boîte d'avant n'a ni ancre, ni `reduite` : ouverte, libre. */
  const extrait = extraitBrut || 'Boîte vide';
  const [pointApercu, setPointApercu] = useState(null); // position pendant le glisser d'une épingle / pastille
  const ancreBrute = boite.ancre && Number.isFinite(boite.ancre.x) && Number.isFinite(boite.ancre.y) ? boite.ancre : null;
  const ancre = ancreBrute && pointApercu && pointApercu.cible === 'ancre' ? { ...ancreBrute, ...pointApercu } : ancreBrute;
  const titreAncre = ancre ? (ancre.texte ? `Épinglée sur « ${ancre.texte} »` : 'Épinglée à cet endroit') : '';

  /* GLISSER UN POINT (l'épingle, ou la pastille d'une boîte réduite). Un simple
     clic (< 4 px) n'est pas un glisser : il garde son sens (rouvrir la pastille).
     Le point reste dans la page ; le passage visé est recalculé au relâchement. */
  const glisserPoint = (e, { cible, depart, surClic }) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const page = e.currentTarget.closest('.pdfr-page');
    const r = page && page.getBoundingClientRect();
    if (!r || !r.width || !r.height) return;
    const d0 = { x: e.clientX, y: e.clientY };
    let bouge = false, dernier = null;
    onGeste(true);
    const move = (ev) => {
      if (!bouge && Math.abs(ev.clientX - d0.x) + Math.abs(ev.clientY - d0.y) <= 4) return;
      bouge = true;
      dernier = { x: clamp01(depart.x + (ev.clientX - d0.x) / r.width), y: clamp01(depart.y + (ev.clientY - d0.y) / r.height), cx: ev.clientX, cy: ev.clientY };
      setPointApercu({ cible, x: dernier.x, y: dernier.y });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onGeste(false);
      setPointApercu(null);
      if (!bouge || !dernier) { if (surClic) surClic(); return; }
      if (cible === 'ancre') {
        onModifier(boite, { ancre: { x: dernier.x, y: dernier.y, texte: texteProche ? texteProche(dernier.cx, dernier.cy) : null } }, 'Déplacement de l’épingle');
      } else if (cible.startsWith('fl:')) { // bout d'une flèche supplémentaire : déplacé à la main, il n'est plus lié
        const idf = cible.slice(3);
        onModifier(boite, { fleches: (boite.fleches || []).map((fl) => (fl.id === idf ? { id: fl.id, x: dernier.x, y: dernier.y, texte: texteProche ? texteProche(dernier.cx, dernier.cy) : null } : fl)) }, 'Déplacement d’une flèche');
      } else { // pastille d'une boîte NON épinglée : la boîte rouvrira à cet endroit
        onModifier(boite, { x: clamp(dernier.x, 0, 1 - boite.width), y: clamp(dernier.y, 0, 1 - boite.height) }, 'Déplacement de la boîte réduite');
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // survol (barre d'actions) — déclaré AVANT le retour anticipé de la pastille : même
  // nombre de hooks que la boîte soit ouverte ou réduite.
  const [survol, setSurvol] = useState(false);
  const timerSurvol = useRef(null);
  // la barre n'apparaît qu'après un court survol (300 ms) : passer la souris sur une
  // boîte ne la fait plus surgir par-dessus le cours (03/10)
  const entrer = () => { clearTimeout(timerSurvol.current); timerSurvol.current = setTimeout(() => setSurvol(true), 300); };
  const sortir = () => { clearTimeout(timerSurvol.current); timerSurvol.current = setTimeout(() => setSurvol(false), 250); };
  useEffect(() => () => clearTimeout(timerSurvol.current), []);
  const rouvrir = () => onModifier(boite, { reduite: false }, 'Réouverture de la boîte');
  const couleurBoite = couleurHex(boite.couleur);

  /* RÉDUITE : une pastille. Glisser = la déplacer (épinglée : l'épingle suit, le
     passage visé est recalculé ; libre : la boîte rouvrira là). Clic = rouvrir. */
  if (boite.reduite && !texteLibre) {
    const pos = pointApercu && pointApercu.cible === 'pastille' ? pointApercu : (ancre || { x: b.x, y: b.y });
    const cible = ancre ? 'ancre' : 'pastille';
    return (
      <button type="button" className={'nb-pastille' + (pointApercu ? ' glisse' : '')}
        style={{ left: pos.x * 100 + '%', top: pos.y * 100 + '%', background: couleurBoite }}
        title={`« ${extrait.slice(0, 100)}${extrait.length > 100 ? '…' : ''} »${ancre && ancre.texte ? `\n${titreAncre}` : ''}\nClic : rouvrir · Glisser : déplacer`}
        onPointerDown={(e) => glisserPoint(e, { cible, depart: ancre ? { x: ancre.x, y: ancre.y } : { x: b.x, y: b.y }, surClic: rouvrir })}
        onClick={(e) => e.stopPropagation()}>
        <IconeEpingle size={18} />
      </button>
    );
  }

  /* FLÈCHE (demande du 30/09) : du BORD de la boîte jusqu'à l'endroit ancré.
     Calculée en pixels de page (viewBox = taille de la page) pour que la pointe ne
     soit jamais déformée ; elle part de la géométrie AFFICHÉE (`b`, qui inclut
     l'aperçu pendant un déplacement) : la flèche suit la boîte en direct. */
  // flèche de la boîte vers un point (fractions de page) ; null si le point est sous la boîte
  const flecheVers = (cible) => {
    if (!cible || !pageWidth || !pageHeight) return null;
    const W = pageWidth, H = pageHeight;
    // taille mise en page (px de référence) × k = taille à l'écran, dans le repère de la page
    const bx = b.x * W, by = b.y * H, bw = (ajustee && largVue ? largVue : b.width * refW) * k, bh = Math.max(b.height * refH, hautVue || 0) * k;
    const cx = bx + bw / 2, cy = by + bh / 2, ax = cible.x * W, ay = cible.y * H;
    const dx = ax - cx, dy = ay - cy;
    if (ax >= bx && ax <= bx + bw && ay >= by && ay <= by + bh) return null;
    const t = Math.min(dx ? (bw / 2) / Math.abs(dx) : Infinity, dy ? (bh / 2) / Math.abs(dy) : Infinity);
    const sx = cx + dx * t, sy = cy + dy * t;
    const L = Math.hypot(ax - sx, ay - sy);
    if (L < 14 * k) return null;
    const recul = (7 * k) / L;
    return { sx, sy, ex: ax - (ax - sx) * recul, ey: ay - (ay - sy) * recul };
  };
  /* FLÈCHES SUPPLÉMENTAIRES (02/10 soir) : `fleches`, chacune vers son point ; le bout
     qu'on glisse suit le pointeur (pointApercu). */
  const autres = (boite.fleches || []).filter((fl) => fl && Number.isFinite(fl.x) && Number.isFinite(fl.y))
    .map((fl) => (pointApercu && pointApercu.cible === 'fl:' + fl.id ? { ...fl, x: pointApercu.x, y: pointApercu.y } : fl));
  const tracesAutres = autres.map((fl) => ({ fl, tr: flecheVers(fl) }));
  const fleche = (() => {
    if (!ancre || !boite.fleche || !pageWidth || !pageHeight) return null;
    const W = pageWidth, H = pageHeight;
    const bx = b.x * W, by = b.y * H, bw = (ajustee && largVue ? largVue : b.width * refW) * k, bh = Math.max(b.height * refH, hautVue || 0) * k;
    const cx = bx + bw / 2, cy = by + bh / 2, ax = ancre.x * W, ay = ancre.y * H;
    const dx = ax - cx, dy = ay - cy;
    if (ax >= bx && ax <= bx + bw && ay >= by && ay <= by + bh) return null; // point sous la boîte : rien à relier
    const t = Math.min(dx ? (bw / 2) / Math.abs(dx) : Infinity, dy ? (bh / 2) / Math.abs(dy) : Infinity);
    const sx = cx + dx * t, sy = cy + dy * t;
    const L = Math.hypot(ax - sx, ay - sy);
    if (L < 14 * k) return null;
    const recul = (7 * k) / L; // la pointe s'arrête au bord du repère rond (rayon 6, à l'échelle de la page)
    return { W, H, sx, sy, ex: ax - (ax - sx) * recul, ey: ay - (ay - sy) * recul };
  })();
  const couleurFleche = couleurFoncee(boite.couleur);

  /* LES ACTIONS DE LA BOÎTE — une barre À LIBELLÉS, au-dessus de la boîte, visible
     quand la boîte est active ou survolée (retour de l'utilisateur : cinq icônes de
     18 px sans texte, « on ne comprend pas quoi fait quoi »). Chaque bouton dit ce
     qu'il fait ; l'infobulle dit comment. La « Flèche » n'est jamais grisée : sans
     épingle, elle commence par la faire poser, puis se trace toute seule. */
  const actionsVisibles = active || survol || enAncrage;
  // barre SOUS l'élément : boîte collée en haut de page, ou texte libre (sa poignée
  // de déplacement occupe déjà le dessus)
  const dessous = texteLibre || (pageHeight && b.y * pageHeight < 42);
  const bLarg = refW ? (ajustee && largVue ? largVue : b.width * refW) / refW : b.width; // largeur affichée (fraction de page)
  const stop = (fn) => ({ onPointerDown: (e) => e.stopPropagation(), onClick: (e) => { e.stopPropagation(); fn(); } });

  return (
    <>
    {(fleche || tracesAutres.some((t) => t.tr)) && (
      <svg className="nb-fleche" viewBox={`0 0 ${pageWidth} ${pageHeight}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <marker id={'pointe-' + boite.id} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth={9 * k} markerHeight={9 * k} markerUnits="userSpaceOnUse" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={couleurFleche} />
          </marker>
        </defs>
        {fleche && (
          <line x1={fleche.sx} y1={fleche.sy} x2={fleche.ex} y2={fleche.ey} stroke={couleurFleche} strokeWidth={2 * k} strokeLinecap="round"
            markerEnd={`url(#pointe-${boite.id})`} />
        )}
        {tracesAutres.map(({ fl, tr }) => tr && (
          <line key={fl.id} x1={tr.sx} y1={tr.sy} x2={tr.ex} y2={tr.ey} stroke={couleurFleche} strokeWidth={2 * k} strokeLinecap="round"
            markerEnd={`url(#pointe-${boite.id})`} />
        ))}
      </svg>
    )}
    {autres.map((fl) => (
      <span key={fl.id} className={'nb-ancre nb-ancre-fl' + (pointApercu && pointApercu.cible === 'fl:' + fl.id ? ' glisse' : '')}
        title={`${fl.texte ? `Vise « ${fl.texte} »` : 'Flèche'}\nGlisser pour la déplacer`}
        style={{ left: fl.x * 100 + '%', top: fl.y * 100 + '%', borderColor: couleurBoite }}
        onMouseEnter={entrer} onMouseLeave={sortir}
        onPointerDown={(e) => glisserPoint(e, { cible: 'fl:' + fl.id, depart: { x: (boite.fleches.find((q) => q.id === fl.id) || fl).x, y: (boite.fleches.find((q) => q.id === fl.id) || fl).y } })}>
        {(active || survol) && (
          <button type="button" className="nb-fl-x" title="Retirer cette flèche"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onModifier(boite, { fleches: (boite.fleches || []).filter((q) => q.id !== fl.id) }, 'Flèche retirée'); }}>
            <Icon name="x" size={8} />
          </button>
        )}
      </span>
    ))}
    {ancre && (
      <span className={'nb-ancre' + (pointApercu ? ' glisse' : '')} title={`${titreAncre}\nGlisser pour déplacer l’épingle`}
        style={{ left: ancre.x * 100 + '%', top: ancre.y * 100 + '%', borderColor: couleurBoite }}
        onPointerDown={(e) => glisserPoint(e, { cible: 'ancre', depart: { x: ancreBrute.x, y: ancreBrute.y } })} />
    )}
    {actionsVisibles && (
      <div className={'nb-actions' + (dessous ? ' dessous' : '')}
        style={{ ...(b.x + bLarg / 2 > 0.5 ? { right: (1 - b.x - bLarg) * 100 + '%' } : { left: b.x * 100 + '%' }), top: (dessous ? b.y + Math.max(b.height, (hautVue * k) / (pageHeight || 1)) : b.y) * 100 + '%' }}
        onMouseEnter={entrer} onMouseLeave={sortir}
        onPointerDown={(e) => e.stopPropagation()}>
        {texteLibre ? (
          <button type="button" className="nb-act danger" {...stop(() => onSupprimer(boite))} title={`Supprimer ce texte (annulable par ${RACCOURCI_Z})`}>
            <Icon name="trash" size={12} />
          </button>
        ) : enAncrage ? (
          <button type="button" className="nb-act vise" {...stop(() => onDemanderAncrage(null))} title="Annuler (Échap)">
            <IconeEpingle size={13} /> {viseAjout ? 'Clique ce que la nouvelle flèche vise…' : viseSurlignage ? 'Clique un surlignage ou une forme…' : 'Clique l’endroit à épingler…'} <span className="nb-act-x">Annuler</span>
          </button>
        ) : (<>
          {ancre ? (
            <button type="button" className="nb-act actif" {...stop(() => onModifier(boite, { ancre: null, fleche: false, surlignageId: null, formeId: null }, 'Retrait de l’épingle'))}
              title={`${titreAncre}. Pour la déplacer : glisse l’épingle sur la page. Cliquer ici la retire (et la flèche avec).`}>
              <IconeEpingle size={11} /> Épingle
            </button>
          ) : (
            <button type="button" className="nb-act" {...stop(() => onDemanderAncrage(boite.id))}
              title="Épingler la boîte à un endroit précis de la fiche : clique ensuite sur le passage visé.">
              <IconeEpingle size={11} /> Épingler
            </button>
          )}
          {boite.surlignageId || boite.formeId ? (
            <button type="button" className="nb-act actif" {...stop(() => onModifier(boite, { ancre: null, fleche: false, surlignageId: null, formeId: null }, 'Lien retiré'))}
              title={`Reliée au surlignage${ancre && ancre.texte ? ` « ${ancre.texte} »` : ''}. Cliquer pour retirer le lien.`}>
              <IconeOutil nom="fleche" size={11} /> Délier
            </button>
          ) : (
            <button type="button" className="nb-act" {...stop(() => onDemanderAncrage(boite.id, { surlignage: true }))}
              title="Relier cette boîte à un surlignage : clique ensuite le passage surligné, une flèche les relie.">
              <IconeOutil nom="fleche" size={11} /> Relier
            </button>
          )}
          <button type="button" className={'nb-act' + (ancre && boite.fleche ? ' actif' : '')}
            {...stop(() => (ancre ? onModifier(boite, { fleche: !boite.fleche }, boite.fleche ? 'Retrait de la flèche' : 'Ajout de la flèche') : onDemanderAncrage(boite.id, { fleche: true })))}
            title={!ancre ? 'Flèche vers un endroit de la fiche : clique ensuite sur le passage visé, la flèche se trace toute seule.' : boite.fleche ? 'Retirer la flèche' : 'Tracer une flèche de la boîte vers son épingle'}>
            <Icon name="arrowR" size={11} /> Flèche
          </button>
          <button type="button" className={'nb-act' + ((boite.fleches || []).length ? ' actif' : '')}
            {...stop(() => onDemanderAncrage(boite.id, { ajout: true }))}
            title={`Ajouter une autre flèche, vers un endroit, un surlignage ou une forme${(boite.fleches || []).length ? ` (${boite.fleches.length} déjà)` : ''}. Le petit rond au bout se glisse ; sa croix la retire.`}>
            <Icon name="plus" size={10} /><IconeOutil nom="fleche" size={11} />{(boite.fleches || []).length ? ` ${boite.fleches.length}` : ''}
          </button>
          <button type="button" className="nb-act" {...stop(() => onModifier(boite, { reduite: true }, 'Réduction de la boîte'))}
            title="Réduire en pastille : un clic sur la pastille rouvre la boîte, un glisser la déplace.">
            <Icon name="minus" size={11} /> Réduire
          </button>
          <button type="button" className="nb-act danger" {...stop(() => onSupprimer(boite))} title={`Supprimer la boîte (annulable par ${RACCOURCI_Z})`}>
            <Icon name="trash" size={12} />
          </button>
        </>)}
      </div>
    )}
    <div ref={boiteRef} className={'note-box' + (ajustee ? ' ajustee' : '') + (texteLibre ? ' texte-libre' : '') + (active ? ' active' : '') + (enAncrage ? ' en-ancrage' : '') + (texteLibre && !extraitBrut ? ' vide' : '')} style={style}
      onMouseEnter={entrer} onMouseLeave={sortir}>
      {/* CORRECTIF (défaut 4) : le bandeau est focusable, et c'est LUI qui porte la
          suppression au clavier — plus aucun écouteur global ne peut effacer la
          boîte pendant que le curseur est ailleurs. */}
      <div className="nb-bar" ref={barreRef} tabIndex={0}
        title="Glisser ici pour déplacer la boîte · Suppr pour l’effacer"
        onPointerDown={(e) => { demarrer(e, 'move'); if (barreRef.current) barreRef.current.focus(); }}
        onKeyDown={(e) => {
          if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); onSupprimer(boite); }
          if (e.key === 'Enter') { e.preventDefault(); activer(null); }
        }}>
        <span className="nb-grip" style={active && k !== 1 ? { scale: String(1 / k) } : undefined}><Icon name="grip" size={12} /></span>
        {ancre && <span className="nb-etat" title={titreAncre}><IconeEpingle size={11} /></span>}
      </div>

      {/* VERROU 4 : le corps est du TEXTE, pas une poignée. */}
      {active && editor
        ? <div className="nb-body" onMouseDown={(e) => {
            // CLIC N'IMPORTE OÙ (02/10) : hors des lignes de texte (marge, bas de la
            // boîte, à droite d'une ligne courte), le curseur va au point le plus proche
            if (!editor || (e.target.closest && e.target.closest('.ProseMirror p, .ProseMirror li, .ProseMirror h1, .ProseMirror h2, .ProseMirror h3'))) return;
            e.preventDefault();
            try {
              const at = posDansEditeur(editor, e.clientX, e.clientY);
              const ancre = at ? at.pos : editor.state.doc.content.size;
              editor.commands.setTextSelection(ancre);
              editor.view.focus();
              // et GLISSER depuis la marge sélectionne (04/10) : la sélection suit le pointeur
              const bouger = (ev) => {
                if (!(ev.buttons & 1) || editor.isDestroyed) return;
                const ici = posDansEditeur(editor, ev.clientX, ev.clientY);
                if (ici && Number.isFinite(ici.pos)) editor.commands.setTextSelection({ from: Math.min(ancre, ici.pos), to: Math.max(ancre, ici.pos) });
              };
              const lacher = () => { window.removeEventListener('mousemove', bouger); window.removeEventListener('mouseup', lacher); };
              window.addEventListener('mousemove', bouger);
              window.addEventListener('mouseup', lacher);
            } catch (err) { /* ignore */ }
          }}><EditorContent editor={editor} /></div>
        : <div className="nb-body" onMouseDown={(e) => { if (e.button === 0) appuiRef.current = { x: e.clientX, y: e.clientY }; }} onClick={activer} data-vide={texteLibre ? 'Texte…' : undefined} dangerouslySetInnerHTML={{ __html: html }} />}

      <div className="nb-corner" title="Glisser pour redimensionner" onPointerDown={(e) => demarrer(e, 'resize')}
        style={active && k !== 1 ? { scale: String(1 / k), transformOrigin: '100% 100%' } : undefined} />
    </div>
    </>
  );
}

/* ============================================================
   « ? » — « je n'ai pas compris ce passage » (01/10). Un rond, posé d'un clic
   avec l'outil « ? ». Glisser = déplacer ; survol ou focus = une petite croix
   pour le retirer (Suppr aussi). Une entrée d'annulation par geste.
   ============================================================ */
function QuestionMarque({ q, onModifier, onSupprimer, onGeste }) {
  const [apercu, setApercu] = useState(null);
  const pos = apercu || q;
  const glisser = (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const btn = e.currentTarget;
    const page = btn.closest('.pdfr-page');
    const r = page && page.getBoundingClientRect();
    if (!r || !r.width || !r.height) return;
    const d0 = { x: e.clientX, y: e.clientY };
    let bouge = false, dernier = null;
    onGeste(true);
    const move = (ev) => {
      if (!bouge && Math.abs(ev.clientX - d0.x) + Math.abs(ev.clientY - d0.y) <= 4) return;
      bouge = true;
      dernier = { x: clamp01(q.x + (ev.clientX - d0.x) / r.width), y: clamp01(q.y + (ev.clientY - d0.y) / r.height) };
      setApercu(dernier);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onGeste(false);
      setApercu(null);
      if (bouge && dernier) onModifier(q, dernier, 'Déplacement du « ? »');
      else btn.focus();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <span className={'pdfr-question' + (apercu ? ' glisse' : '')} style={{ left: pos.x * 100 + '%', top: pos.y * 100 + '%' }}>
      <button type="button" className="pq-rond" title="Je n'ai pas compris ce passage · Glisser : déplacer · Suppr : retirer"
        onPointerDown={glisser} onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); onSupprimer(q); } }}>?</button>
      <button type="button" className="pq-x" title={`Retirer ce « ? » (annulable par ${RACCOURCI_Z})`}
        onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onSupprimer(q); }}><Icon name="x" size={10} /></button>
    </span>
  );
}

/* ============================================================
   IMAGE COLLÉE (01/10) — comme dans Aperçu : cliquer la sélectionne, glisser la
   déplace, les coins la redimensionnent (proportions gardées). Sa barre règle le
   CALQUE (devant / derrière les AUTRES images) et la supprime. Une entrée
   d'annulation par geste ; le blob d'origine de l'image n'est jamais modifié.
   ============================================================ */
/* Adresses des images collées, gardées le temps de la session : une page qui sort
   de l'écran puis y revient (lecteur virtualisé) remonte ses images — sans ce cache,
   chacune affichait « … » une fraction de seconde le temps de relire son fichier
   (même famille de flash que le bug « hallucinations »). Un blob ne change jamais
   de contenu pour un même id : l'adresse reste valable. */
const URLS_IMAGES = new Map();
function ImageCollee({ img, active, premier, dernier, onActiver, onMaj, onCalque, onSupprimer, onGeste, onApercu = () => {}, pageWidth = 0, pageHeight = 0 }) {
  const [url, setUrl] = useState(() => URLS_IMAGES.get(img.blobId) || null);
  const [manquante, setManquante] = useState(false);
  useEffect(() => {
    if (URLS_IMAGES.has(img.blobId)) { setUrl(URLS_IMAGES.get(img.blobId)); return undefined; }
    let annule = false;
    blobURL(img.blobId).then((x) => {
      if (x) URLS_IMAGES.set(img.blobId, x);
      if (!annule) { setUrl(x); setManquante(!x); }
    }).catch(() => { if (!annule) setManquante(true); });
    return () => { annule = true; };
  }, [img.blobId]);

  const [apercu, setApercu] = useState(null);
  const g = apercu || img;
  const cadreRef = useRef(null);
  const geste = (e, type) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const page = e.currentTarget.closest('.pdfr-page');
    const r = page && page.getBoundingClientRect();
    if (!r || !r.width || !r.height) return;
    const d0 = { x: e.clientX, y: e.clientY };
    const avant = img;
    const ratio = avant.width ? avant.height / avant.width : 1; // proportions en coordonnées normalisées
    /* ROTATION (02/10 nuit) : l'image pivote autour de son centre. Les coins travaillent
       dans le REPÈRE TOURNÉ de l'image (le coin opposé reste fixe), en pixels de page. */
    const rot = avant.rotation || 0, th = (rot * Math.PI) / 180, cosT = Math.cos(th), sinT = Math.sin(th);
    const centre = { x: r.left + (avant.x + avant.width / 2) * r.width, y: r.top + (avant.y + avant.height / 2) * r.height };
    const a0 = Math.atan2(e.clientY - centre.y, e.clientX - centre.x);
    let bouge = false, courant = null;
    onGeste(true);
    onActiver(img.id);
    if (cadreRef.current) cadreRef.current.focus({ preventScroll: true });
    const move = (ev) => {
      if (!bouge && Math.abs(ev.clientX - d0.x) + Math.abs(ev.clientY - d0.y) <= 3) return;
      bouge = true;
      const dx = (ev.clientX - d0.x) / r.width, dy = (ev.clientY - d0.y) / r.height;
      if (type === 'rotation') {
        let deg = rot + ((Math.atan2(ev.clientY - centre.y, ev.clientX - centre.x) - a0) * 180) / Math.PI;
        deg = ((deg % 360) + 540) % 360 - 180; // ]-180, 180]
        if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
        else { const droit = Math.round(deg / 90) * 90; if (Math.abs(deg - droit) < 4) deg = droit; } // aimant aux angles droits
        courant = { ...avant, rotation: deg === -180 ? 180 : deg };
      } else if (type === 'move') {
        courant = { ...avant, x: clamp(avant.x + dx, -avant.width * 0.8, 1 - avant.width * 0.2), y: clamp(avant.y + dy, -avant.height * 0.8, 1 - avant.height * 0.2) };
      } else {
        // coin tiré : le coin OPPOSÉ reste fixe, la largeur suit le plus grand des deux déplacements
        const sx = type.includes('e') ? 1 : -1, sy = type.includes('s') ? 1 : -1;
        // déplacement ramené dans le repère de l'image (rotation annulée), en fractions
        const px = ev.clientX - d0.x, py = ev.clientY - d0.y;
        const lx = (px * cosT + py * sinT) / r.width, ly = (-px * sinT + py * cosT) / r.height;
        // h = w × ratio en coordonnées normalisées : un déplacement vertical dh vaut dh / ratio en largeur
        const dW = Math.max(sx * lx, (sy * ly) / (ratio || 1));
        const w = clamp(avant.width + dW, 0.03, 2);
        const h = w * ratio;
        if (!rot) {
          courant = { ...avant, width: w, height: h,
            x: sx > 0 ? avant.x : avant.x + avant.width - w,
            y: sy > 0 ? avant.y : avant.y + avant.height - h };
        } else {
          // coin OPPOSÉ fixe, en pixels de page : O = C + R·(−sx·w/2, −sy·h/2) ; C' = O + R·(sx·w'/2, sy·h'/2)
          const W = r.width, H = r.height, R = (vx, vy) => [vx * cosT - vy * sinT, vx * sinT + vy * cosT];
          const C = [(avant.x + avant.width / 2) * W, (avant.y + avant.height / 2) * H];
          const o = R(-sx * avant.width * W / 2, -sy * avant.height * H / 2);
          const n = R(sx * w * W / 2, sy * h * H / 2);
          const cx = C[0] + o[0] + n[0], cy = C[1] + o[1] + n[1];
          courant = { ...avant, width: w, height: h, x: cx / W - w / 2, y: cy / H - h / 2 };
        }
      }
      setApercu(courant);
      onApercu(courant);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onGeste(false);
      setApercu(null);
      onApercu(null);
      if (bouge && courant) onMaj(avant, courant, type === 'move' ? 'Déplacement de l’image' : type === 'rotation' ? 'Rotation de l’image' : 'Redimension de l’image');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const stop = (fn) => ({ onPointerDown: (e) => e.stopPropagation(), onClick: (e) => { e.stopPropagation(); fn(); } });
  return (
    <div ref={cadreRef} tabIndex={0} className={'pdfr-image' + (active ? ' active' : '') + (apercu ? ' glisse' : '')}
      style={{ left: g.x * 100 + '%', top: g.y * 100 + '%', width: g.width * 100 + '%', height: g.height * 100 + '%' }}
      onPointerDown={(e) => geste(e, 'move')}
      onKeyDown={(e) => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); onSupprimer(img); } }}
      title="Image collée · glisser pour déplacer · coins pour redimensionner · Suppr pour retirer">
      {/* le CORPS pivote (image, coins, poignée) ; la barre d'actions reste horizontale */}
      <div className="pdfr-image-corps" style={g.rotation ? { transform: `rotate(${g.rotation}deg)` } : undefined}>
      {url ? <img src={url} alt={img.nom || 'Image collée'} draggable={false} />
        : <div className="pdfr-image-vide">{manquante ? 'Image indisponible sur cet appareil' : '…'}</div>}
      {active && ['nw', 'ne', 'sw', 'se'].map((c) => (
        <span key={c} className={'pi-coin pi-' + c} onPointerDown={(e) => geste(e, c)} />
      ))}
      {active && (
        <span className="pi-rotation" onPointerDown={(e) => geste(e, 'rotation')}
          title={`Pivoter — glisser autour de l’image (aimant aux angles droits, Maj : pas de 15°)${g.rotation ? ` · ${Math.round(g.rotation)}°` : ''}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" /></svg>
        </span>
      )}
      </div>
      {apercu && apercu.rotation !== undefined && apercu.rotation !== img.rotation && <span className="pi-angle">{Math.round(g.rotation || 0)}°</span>}
      {active && (() => {
        // haut de la boîte TOURNÉE (en px), pour poser la barre au-dessus sans la faire pivoter
        const w = g.width * pageWidth, h = g.height * pageHeight, t = ((g.rotation || 0) * Math.PI) / 180;
        const demiH = pageWidth && pageHeight ? (Math.abs(w * Math.sin(t)) + Math.abs(h * Math.cos(t))) / 2 : h / 2;
        const decal = g.rotation ? h / 2 - demiH - 30 : 0; // + la place de la poignée de rotation
        return (
        <div className={'nb-actions pi-actions' + (g.y < 0.06 ? ' dessous' : '')} style={decal ? { top: decal } : undefined} onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className="nb-act" {...stop(() => onMaj(img, { ...img, rotation: ((((img.rotation || 0) + 90) % 360) + 540) % 360 - 180 }, 'Rotation de l’image'))} title="Pivoter d'un quart de tour (ou glisser la poignée ronde)">↻ 90°</button>
          <button type="button" className="nb-act" disabled={premier} {...stop(() => onCalque(img, 'premier'))} title="Mettre devant toutes les autres images">Premier plan</button>
          <button type="button" className="nb-act" disabled={premier} {...stop(() => onCalque(img, 'avancer'))} title="Avancer d'un calque">Avancer</button>
          <button type="button" className="nb-act" disabled={dernier} {...stop(() => onCalque(img, 'reculer'))} title="Reculer d'un calque">Reculer</button>
          <button type="button" className="nb-act" disabled={dernier} {...stop(() => onCalque(img, 'arriere'))} title="Mettre derrière toutes les autres images">Arrière-plan</button>
          <button type="button" className="nb-act danger" {...stop(() => onSupprimer(img))} title={`Supprimer l'image (annulable par ${RACCOURCI_Z})`}><Icon name="trash" size={13} /> Supprimer</button>
        </div>
        );
      })()}
    </div>
  );
}

/* ============================================================
   FORME (03/10 ; douze formes depuis le 02/10 soir, voir formes.js). Dessinée en SVG,
   dans sa boîte englobante, en pixels (trait net, pointes non déformées).
   - Sélection par son TRACÉ seulement (une bande invisible de 14 px autour du
     trait) : l'intérieur reste transparent aux clics, on peut toujours
     sélectionner le texte encadré.
   - Glisser le tracé = déplacer ; coins = redimensionner ; pour un trait (ligne,
     flèche), ses deux BOUTS se glissent.
   - Double-clic sur le tracé ou « Texte » = écrire une étiquette au centre.
   - Barre compacte : Texte, Légende, couleur, remplissage, supprimer.
   Une entrée d'annulation par geste.
   ============================================================ */
function formeSousPoint(el, cx, cy) {
  try {
    const svg = el.ownerSVGElement;
    const m = svg && svg.getScreenCTM();
    if (!m) return false;
    const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
    const p = pt.matrixTransform(m.inverse());
    return el.isPointInStroke(p) || (el.getAttribute('data-remplie') === '1' && el.isPointInFill(p));
  } catch (e) { return false; }
}

function Forme({ forme, active = false, interactive = false, liee = false, apercu = false, pageWidth, pageHeight, onActiver, onMaj, onModifier, onSupprimer, onLegende, onGeste }) {
  const [geste, setGeste] = useState(null);
  const [ecrit, setEcrit] = useState(null); // texte en cours d'écriture (null = pas d'édition)
  const g = geste || forme;
  const type = typeForme(forme);
  const trait = estTrait(type);
  const W = pageWidth || 600, H = pageHeight || 800;
  // épaisseur du cadre : fraction de la page affichée — elle suit le zoom avec le cadre (04/10)
  const ep = Math.max(1, (forme.epaisseur || 0.0025) * H);
  const coul = couleurHex(forme.couleur, '#e5383b');
  const wpx = g.width * W, hpx = g.height * H;
  const { d, pointes } = cheminForme(type, wpx, hpx, { fx: !!g.fx, fy: !!g.fy, epaisseur: ep });

  const demarrer = (e, typeGeste) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const page = e.currentTarget.closest('.pdfr-page');
    const r = page && page.getBoundingClientRect();
    if (!r || !r.width || !r.height) return;
    const d0 = { x: e.clientX, y: e.clientY };
    const avant = forme;
    let bouge = false, courant = null;
    onGeste(true);
    onActiver(forme.id);
    // extrémités d'un trait en fractions de page : [départ, arrivée]
    const [a0, b0] = extremites(avant.width, avant.height, avant.fx, avant.fy).map((p) => ({ x: avant.x + p.x, y: avant.y + p.y }));
    const move = (ev) => {
      if (!bouge && Math.abs(ev.clientX - d0.x) + Math.abs(ev.clientY - d0.y) <= 3) return;
      bouge = true;
      const dx = (ev.clientX - d0.x) / r.width, dy = (ev.clientY - d0.y) / r.height;
      if (typeGeste === 'move') {
        courant = { ...avant, x: clamp(avant.x + dx, 0, 1 - avant.width), y: clamp(avant.y + dy, 0, 1 - avant.height) };
      } else if (typeGeste === 'debut' || typeGeste === 'fin') {
        const a = typeGeste === 'debut' ? { x: clamp01(a0.x + dx), y: clamp01(a0.y + dy) } : a0;
        const b = typeGeste === 'fin' ? { x: clamp01(b0.x + dx), y: clamp01(b0.y + dy) } : b0;
        courant = { ...avant, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y), fx: a.x > b.x, fy: a.y > b.y };
      } else {
        let { x, y, width: w, height: h } = avant;
        if (typeGeste.includes('e')) w = clamp(avant.width + dx, 0.015, 1 - avant.x);
        if (typeGeste.includes('s')) h = clamp(avant.height + dy, 0.01, 1 - avant.y);
        if (typeGeste.includes('w')) { const nx = clamp(avant.x + dx, 0, avant.x + avant.width - 0.015); w = avant.width + (avant.x - nx); x = nx; }
        if (typeGeste.includes('n')) { const ny = clamp(avant.y + dy, 0, avant.y + avant.height - 0.01); h = avant.height + (avant.y - ny); y = ny; }
        courant = { ...avant, x, y, width: w, height: h };
      }
      setGeste(courant);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onGeste(false);
      setGeste(null);
      if (bouge && courant) onMaj(avant, courant, typeGeste === 'move' ? 'Déplacement de la forme' : 'Redimension de la forme');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const finirTexte = (valider) => {
    if (ecrit === null) return;
    const t = ecrit.trim();
    setEcrit(null);
    if (valider && t !== (forme.texte || '')) onModifier(forme, { texte: t || null }, t ? 'Texte de la forme' : 'Texte de la forme retiré');
  };
  const stop = (fn) => ({ onPointerDown: (e) => e.stopPropagation(), onClick: (e) => { e.stopPropagation(); fn(); } });
  const couleurTexte = couleurFoncee(forme.couleur);

  return (
    <div className={'pdfr-forme' + (active ? ' active' : '') + (liee ? ' liee' : '') + (interactive ? ' interactive' : '') + (geste || apercu ? ' glisse' : '')}
      data-forme={type}
      style={{ left: g.x * 100 + '%', top: g.y * 100 + '%', width: g.width * 100 + '%', height: g.height * 100 + '%' }}
      tabIndex={-1} onKeyDown={(e) => { if (ecrit === null && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); onSupprimer(forme); } }}>
      <svg className="pf-svg" width="100%" height="100%" overflow="visible" aria-hidden="true">
        <path className="pf-trace" d={d} fill={forme.remplie && estFermee(type) ? avecAlpha(coul, 0.18) : 'none'} stroke={coul} strokeWidth={ep}
          strokeLinecap="round" strokeLinejoin="round" />
        {pointes.map((p, i) => <path key={i} d={p} fill={coul} stroke={coul} strokeWidth={Math.min(ep, 2)} strokeLinejoin="round" />)}
        {!apercu && (
          <path className="pf-gomme" data-id={forme.id} data-remplie={forme.remplie && estFermee(type) ? '1' : '0'} d={d}
            fill="transparent" stroke="transparent" strokeWidth={ep + 18} strokeLinecap="round" />
        )}
        {interactive && (
          <path className="pf-hit" d={d} fill="none" stroke="transparent" strokeWidth={Math.max(14, ep + 10)} strokeLinecap="round"
            onPointerDown={(e) => { e.currentTarget.closest('.pdfr-forme').focus({ preventScroll: true }); demarrer(e, 'move'); }}
            onDoubleClick={(e) => { e.stopPropagation(); setEcrit(forme.texte || ''); }}>
            <title>Forme · glisser pour déplacer · double-clic pour écrire · Suppr pour retirer</title>
          </path>
        )}
      </svg>
      {(forme.texte || ecrit !== null) && (
        <div className={'pf-texte' + (trait ? ' sur-trait' : '')} style={{ color: couleurTexte }}>
          {ecrit !== null ? (
            <textarea autoFocus value={ecrit} rows={Math.max(1, ecrit.split('\n').length)} placeholder="Texte…"
              onChange={(e) => setEcrit(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              onBlur={() => finirTexte(true)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') { e.preventDefault(); finirTexte(false); }
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finirTexte(true); }
              }} />
          ) : <span>{forme.texte}</span>}
        </div>
      )}
      {interactive && active && !trait && ['nw', 'ne', 'sw', 'se'].map((c) => (
        <span key={c} className={'pi-coin pi-' + c} onPointerDown={(e) => demarrer(e, c)} />
      ))}
      {interactive && active && trait && extremites(100, 100, !!g.fx, !!g.fy).map((p, i) => (
        <span key={i} className="pf-bout" style={{ left: p.x + '%', top: p.y + '%' }} title={i ? 'Glisser la pointe' : 'Glisser le départ'}
          onPointerDown={(e) => demarrer(e, i ? 'fin' : 'debut')} />
      ))}
      {interactive && active && !geste && (
        <div className={'nb-actions pf-actions' + (g.y < 0.05 ? ' dessous' : '') + (g.x + g.width / 2 > 0.5 ? ' a-droite' : '')} onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className={'nb-act' + (forme.texte ? ' actif' : '')} {...stop(() => setEcrit(forme.texte || ''))} title="Écrire un texte dans la forme (ou double-clic sur la forme)">
            <IconeOutil nom="etiquette" size={12} /> Texte
          </button>
          <button type="button" className="nb-act" {...stop(() => onLegende(forme))} title="Ajouter une légende : une boîte de texte reliée à cette forme par une flèche">
            <IconeOutil nom="legende" size={12} /> Légende
          </button>
          <BoutonCouleur couleur={forme.couleur} titre="Couleur de la forme" onCouleur={(c) => onModifier(forme, { couleur: c }, 'Couleur de la forme')} />
          {estFermee(type) && (
            <button type="button" className={'nb-act' + (forme.remplie ? ' actif' : '')} {...stop(() => onModifier(forme, { remplie: !forme.remplie }, forme.remplie ? 'Forme vidée' : 'Forme remplie'))}
              title={forme.remplie ? 'Retirer le fond' : 'Remplir d’une teinte légère de sa couleur'}>
              <IconeOutil nom="remplir" size={12} />
            </button>
          )}
          <button type="button" className="nb-act danger" {...stop(() => onSupprimer(forme))} title={`Supprimer la forme (annulable par ${RACCOURCI_Z}, ou à la gomme)`}>
            <Icon name="trash" size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

/** zoom de référence des boîtes (le zoom par défaut du lecteur) : voir NoteBox. */
export const ECHELLE_REF = 1.6;

/** position dans l'éditeur la plus proche d'un point écran, même hors des lignes de
    texte : le point est d'abord ramené dans le rectangle du texte. */
function posDansEditeur(editor, x, y) {
  const dom = editor && editor.view && editor.view.dom;
  if (!dom) return null;
  // les LIGNES de texte réellement affichées : dans le vide à droite d'une ligne,
  // posAtCoords répond le début du paragraphe — on vise donc la ligne la plus
  // proche verticalement, puis un point DANS cette ligne (sa fin si on est au-delà)
  // rectangles des NŒUDS DE TEXTE seulement : ceux d'un paragraphe entier couvriraient
  // toutes ses lignes à la fois
  const lignes = [];
  const parcours = document.createTreeWalker(dom, NodeFilter.SHOW_TEXT);
  for (let n = parcours.nextNode(); n; n = parcours.nextNode()) {
    const rg = document.createRange();
    rg.selectNodeContents(n);
    for (const r of rg.getClientRects()) if (r.width > 0 && r.height > 0) lignes.push(r);
  }
  if (!lignes.length) return { pos: editor.state.doc.content.size };
  let best = lignes[0], dBest = Infinity;
  for (const r of lignes) {
    const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    if (d < dBest || (d === dBest && Math.abs(x - (r.left + r.right) / 2) < Math.abs(x - (best.left + best.right) / 2))) { dBest = d; best = r; }
  }
  // fusionne les morceaux d'une même ligne (gras, italique…) pour connaître sa vraie fin
  const memeLigne = lignes.filter((r) => Math.abs((r.top + r.bottom) / 2 - (best.top + best.bottom) / 2) < best.height / 2);
  const gauche = Math.min(...memeLigne.map((r) => r.left)), droite = Math.max(...memeLigne.map((r) => r.right));
  const cy = (best.top + best.bottom) / 2;
  if (x >= droite) {
    const fin = editor.view.posAtCoords({ left: droite - 1, top: cy });
    if (!fin) return null;
    // avance tant que la position suivante reste sur CETTE ligne : on finit après son dernier caractère
    let p = fin.pos;
    const max = editor.state.doc.content.size;
    for (let i = 0; i < 3 && p < max; i++) {
      try { const c = editor.view.coordsAtPos(p + 1, -1); /* côté gauche : à une coupure de ligne, la FIN de cette ligne */ if (Math.abs((c.top + c.bottom) / 2 - cy) < best.height / 2 && c.left >= editor.view.coordsAtPos(p).left) p += 1; else break; } catch (e) { break; }
    }
    return { pos: p };
  }
  return editor.view.posAtCoords({ left: Math.max(gauche + 1, x), top: cy });
}

/** l'épingle : une icône qui dit ce qu'elle est (l'icône « cible » ne le disait pas). */
function IconeEpingle({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z" /><circle cx="12" cy="11" r="2.2" />
    </svg>
  );
}
const RACCOURCI_Z = (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '') ? 'Cmd' : 'Ctrl') + '+Z';


/** Chantier 1 : rendu d'un bloc de texte édité. Masque le rendu original (fond opaque
    calé sur la boîte englobante d'origine) et affiche le contenu riche par-dessus —
    statique (HTML généré) tant qu'il n'est pas actif, live (une SEULE instance TipTap,
    possédée par PdfReader et partagée avec EditToolbar — voir plus haut) une fois activé.
    Read-only strict en mode lecture (aucun onClick, aucune interaction). */
function TextEditBlock({ edit, active, editable, onActivate, editor, pageHeight }) {
  const html = useMemo(() => richToHTML(edit.content), [edit.content]);
  // BUG C : la boîte hérite EXACTEMENT de la typographie du texte d'origine — même
  // font-size (dérivé de la hauteur de page courante → suit le zoom), même
  // font-family, line-height 1 et letter-spacing normal, padding 0. Les DEUX états
  // (édition live TipTap ET rendu statique) partagent ce style : aucune différence de
  // box model, donc pas de retour à la ligne parasite (C1) ni de décalage au
  // « Terminé » (C2). La largeur = celle des rects de la sélection (edit.width).
  const fontSize = (edit.fontSize && pageHeight) ? `${edit.fontSize * pageHeight}px` : undefined;
  const style = {
    left: edit.x * 100 + '%', top: edit.y * 100 + '%', width: edit.width * 100 + '%',
    minHeight: edit.height * 100 + '%', maxHeight: `calc(100% - ${edit.y * 100}%)`,
    fontFamily: edit.fontFamily || 'sans-serif',
    fontSize, lineHeight: 1, letterSpacing: 'normal', padding: 0,
  };

  if (active && editable && editor) {
    return <div className="edit-block-active" style={style}><EditorContent editor={editor} className="edit-block-content" /></div>;
  }
  return (
    <div className={'edit-block-static' + (editable ? ' editable' : '')} style={style}
      onClick={editable ? () => onActivate(edit.id) : undefined}
      dangerouslySetInnerHTML={{ __html: html }} />
  );
}

/** barre d'outils riche, fixe sous la barre principale tant qu'un bloc est en édition —
    plutôt qu'une popover flottante ancrée sur le bloc, pour rester fiable pendant le
    scroll/zoom (un bloc édité peut sortir du viewport pendant qu'on le rédige). Pilote
    la MÊME instance `editor` que celle rendue dans le bloc (passée par PdfReader). */
export function EditToolbar({ editor, onReset, onClose, libre = false, couleur = null, onCouleur = null, palette = null, libelleSupprimer = null }) {
  const [, force] = useState(0);
  useEffect(() => {
    const rerender = () => force((v) => v + 1);
    editor.on('transaction', rerender);
    return () => editor.off('transaction', rerender);
  }, [editor]);

  const active = (name, attrs) => editor.isActive(name, attrs);
  const run = (fn) => fn(editor.chain().focus()).run();

  /* CORRECTIF (défaut 2) : un `mousedown` sur un bouton de cette barre RETIRE le
     curseur de l'éditeur. `chain().focus()` le rendait bien, mais sur une sélection
     déjà perdue : la mise en forme s'appliquait alors à une sélection vide, donc
     sans effet visible. On empêche la barre de prendre le focus — sauf sur les
     <select> et <input>, qui ont besoin de s'ouvrir normalement. */
  const garderLeCurseur = (e) => {
    if (e.target && e.target.closest && e.target.closest('select, input')) return;
    e.preventDefault();
  };

  return (
    <div className="pdfr-edit-toolbar" onMouseDown={garderLeCurseur}>
      {libre && onCouleur && (
        <>
          <span className="et-sep" />
          <SelecteurCouleurs couleur={couleur} onCouleur={onCouleur} titre="Couleur de la boîte" />
          <span className="et-sep" />
        </>
      )}
      {palette && <><span className="et-sep" />{palette}<span className="et-sep" /></>}
      <button type="button" className={'et-btn' + (active('bold') ? ' active' : '')} title="Gras" onClick={() => run((c) => c.toggleBold())}><b>G</b></button>
      <button type="button" className={'et-btn' + (active('italic') ? ' active' : '')} title="Italique" onClick={() => run((c) => c.toggleItalic())}><i>I</i></button>
      <button type="button" className={'et-btn' + (active('underline') ? ' active' : '')} title="Souligné" onClick={() => run((c) => c.toggleUnderline())}><u>U</u></button>
      <button type="button" className={'et-btn' + (active('strike') ? ' active' : '')} title="Barré" onClick={() => run((c) => c.toggleStrike())}><s>S</s></button>
      <span className="et-sep" />
      <select className="et-select" defaultValue="" onChange={(e) => { if (e.target.value) run((c) => c.setFontSize(e.target.value)); e.target.value = ''; }}>
        <option value="" disabled>Taille</option>
        {FONT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select className="et-select" defaultValue="" onChange={(e) => { if (e.target.value) run((c) => c.setFontFamily(e.target.value)); e.target.value = ''; }}>
        <option value="" disabled>Police</option>
        {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      {/* même système de couleurs que tous les outils (02/10 soir), en version compacte */}
      <BoutonCouleur titre="Couleur du texte sélectionné" couleur={editor.getAttributes('textStyle').color || null}
        icone={<span className="et-lettre" aria-hidden="true">A</span>}
        onCouleur={(c) => run((ch) => ch.setColor(couleurHex(c, '#1F1F24')))} />
      <BoutonCouleur titre="Surligneur de fond du texte sélectionné" couleur={editor.getAttributes('textStyle').backgroundColor || null}
        icone={<IconeOutil nom="surligneur" size={13} />}
        onCouleur={(c) => run((ch) => ch.setBackgroundColor(couleurHex(c)))} />
      <span className="et-sep" />
      <button type="button" className={'et-btn' + (active('bulletList') ? ' active' : '')} title="Liste à puces" onClick={() => run((c) => c.toggleBulletList())}><Icon name="list" size={13} /></button>
      <button type="button" className={'et-btn' + (active('orderedList') ? ' active' : '')} title="Liste numérotée" onClick={() => run((c) => c.toggleOrderedList())}>1.</button>
      <select className="et-select" defaultValue="" onChange={(e) => { if (e.target.value) run((c) => c.setTextAlign(e.target.value)); e.target.value = ''; }}>
        <option value="" disabled>Alignement</option>
        <option value="left">Gauche</option>
        <option value="center">Centre</option>
        <option value="right">Droite</option>
      </select>
      <span className="et-sep" />
      <button type="button" className="et-btn" title="Annuler" onClick={() => editor.chain().focus().undo().run()}><Icon name="refresh" size={13} style={{ transform: 'scaleX(-1)' }} /></button>
      <button type="button" className="et-btn" title="Rétablir" onClick={() => editor.chain().focus().redo().run()}><Icon name="refresh" size={13} /></button>
      <span style={{ flex: 1 }} />
      <button type="button" className="btn ghost sm" onClick={onReset}>
        {libelleSupprimer ? <><Icon name="trash" size={13} /> {libelleSupprimer}</> : libre ? <><Icon name="trash" size={13} /> Supprimer la boîte</> : <><Icon name="refresh" size={13} /> Réinitialiser (texte d'origine)</>}
      </button>
      <button type="button" className="btn sm" onClick={onClose}><Icon name="check" size={13} /> Terminé</button>
    </div>
  );
}

