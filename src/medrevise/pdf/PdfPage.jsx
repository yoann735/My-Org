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
import { aDeuxVersions, versionAffichee } from '../lib/textesAnnotations.js';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { prendreTrace, rendreTrace } from '../lib/tablette.js';
import { suivrePointeur, versPage, rectPage } from './pointeur.js';
import { EditorContent } from '@tiptap/react';
import { IconeOutil } from './IconesOutils.jsx';
import { SelecteurCouleurs, BoutonCouleur, AUCUNE } from './Couleurs.jsx';
import { cheminForme, extremites, typeForme, estTrait, estFermee, tailleParDefaut, ancreSurForme } from './formes.js';
import { connecteursDe, epingleSeule, patchRetirer, patchAjouter, patchStyle, patchTranslater, patchRattacher } from './connecteurs.js';
import { styleFleche, cheminFleche, geoPointe, sommetsConnecteur, sommetsForme, pointesForme, harmonisee, suivant, TRAITS as TRAITS_FORME } from './flechesGeo.js';
import { TraitFleche, PoigneesFleche, pointsAvecAjout, glisserPointFleche, appuiLong, itemsFleche, boiteSous } from './Fleche.jsx';
import { CadreSelection, MiniBarre, redimensionner } from './Selection.jsx';
import { redimRectImage, ouvrirRognage, cadreApresRognage, entiereDepuisCadre } from '../lib/rognageImage.js';
import { elementsFormat, useSuiviEditeur, ALIGNEMENTS } from './FormatTexte.jsx';
import { BoiteTableau, estGrille, contenuGrille, ajouterLigne, ajouterColonne, retirerLigne, retirerColonne, LIMITES_GRILLE } from './BoiteTableau.jsx';
import { BoutonTaille } from './ChoixTaille.jsx';
import { lisser3, arrondirPoints, cheminCatmull, cheminDroit, cheminTrait, densifier, morceauxHors, OPACITE_SURLIGNEUR_CRAYON } from './crayon.js';
import { suivreImage } from './attaches.js';
import { Icon } from '../../shared/Icon.jsx';
import { outputScaleFor } from './pdfjsSetup.js';
import { cleRendu, lireRendu, lireRenduProche, garderRendu, planifierRendu, alignerCanvas } from './rendusPages.js';
import { richToHTML } from '../documents/lib/richtext.js';
import { blobURL } from '../lib/storage.js';
import { createPortal } from 'react-dom';
import { ocrImage } from '../ocr/ocrImage.js';
import { COULEUR_DEFAUT } from '../lib/palette.js';
import {
  couleurFoncee, opaciteFondBoite, FONT_SIZES, FONT_FAMILIES, BOITE_MIN, BOITE_DEFAUT, COMPACT, fractionPx100, MOT, fractionRef,
  GRILLE, PAGE_REF, taille1000De, champsTaille, ecrireTaille, epaisseurPx, ep1000De, champsEp1000, epFleche1000, champsFleche1000,
  clamp, clamp01, avecAlpha, buildTextLayer, cleanSelectedText,
  anchorFromRange, rangeFromAnchor, rectsFromRange, computeMatchRectsFromDom,
  soustraireAncres, partCouverte, surlignagesTouches, couleurHex, planSurlignage,
  traitTouche, cheminLisse, modeDuTrait, accrocherAngles,
  EPAISSEUR_SURLIGNEUR, OPACITE_SURLIGNEUR, positionTexteProche,
  lisibleSurNoir, EMPTY_ARRAY, opaciteSurlignage, lignesSurlignage,
  ecrireFondBoiteDefaut,
} from './pdfShared.js';

/** rendu d'une seule page (montée uniquement si proche du viewport) : canvas + couche de
    texte + surlignages + surlignage de recherche (géométrie exacte, Chantier 2) + blocs
    de texte édités (Chantier 1). */
export function PdfPageContent({
  pdfDoc, pageNum, vierge = false, scale, pageHeight, dpr, highlights: tousSurlignages, edits, boites, traits, outil, activeEditId, matches, activeMatchIdx,
  onCreateHighlight, onActivateEdit, activeEditor, onCreerBoite, onMajBoite, onSupprimerBoite, onModifierBoite, pageWidth, ancrageBoiteId = null, ancrageFleche = false, ancrageSurlignage = false, ancrageAjout = false,
  selection = null, onSelection = () => {}, onModifierTrait = null, onTransfererFleche = null, // (21/10) sélection unique (pdf/Selection.jsx)
  onDemanderAncrage = () => {},
  surligneurDroit = true, modeGomme = 'zone', // crayon et gomme (21/10, pdf/crayon.js)
  onCreerTrait, onGommer, cibleHlId, onDebutTrait = null,
  ocrPage = null, ocrDebug = false, // couche OCR de cette page (docs/compte-rendu-ocr.md)
  couleurTrait = 'jaune', epaisseurTrait = 0.0042, modeCrayon = 'dessin',
  textes = [], questions = [], onPoser = () => {},
  images = [], imageActiveId = null, onImageActiver = () => {}, onImageMaj = () => {}, onImageSupprimer = () => {},
  formes = [], formeActiveId = null, onFormeActiver = () => {}, onCreerForme = () => {}, onFormeMaj = () => {}, onFormeSupprimer = () => {},
  couleurForme = '#e5383b', typeFormeActif = 'rectangle', formeRemplie = false, onFormeModifier = () => {},
  couleurApercuSelection = null,
  corps = null, // TEXTE D'UNE PAGE DE DOCUMENT (08/10, pdf/PageTexte.jsx) : juste au-dessus de la page, sous les annotations
  fondNoir = false, // fond de page noir (document) : une encre sombre est rendue claire (lisibleSurNoir)
  // SURLIGNER LE TEXTE D'UNE IMAGE COLLÉE (09/10, docs/compte-rendu-pdfreader-v2.md)
  onSurlignerImage = () => {}, onFlashcardTexte = () => {}, couleurSurligneur = 'jaune-franc',
  onApercuCouleur = null, // (15/10) aperçu en direct d'une couleur personnalisée : (id, hex | null)
  onVersTableau = null, boitesAuTableau = null, onReinitialiserBloc = () => {}, // (22/10) « → Tableau », bloc remplacé
}) {
  /* surlignages posés sur les MOTS d'une image collée (`imageId` + `mots`) : dessinés par
     l'image elle-même (ils la suivent : déplacement, taille, rotation) — tout le reste de la
     page (couche de texte, liens, recouvrements) ne voit que les surlignages du texte */
  const highlights = useMemo(() => (tousSurlignages || []).filter((h) => !h.imageId), [tousSurlignages]);
  const surlignagesImages = useMemo(() => (tousSurlignages || []).filter((h) => h.imageId), [tousSurlignages]);
  const encre = (c, repli) => (fondNoir ? lisibleSurNoir(couleurHex(c, repli)) : couleurHex(c, repli));
  /* DOUBLE TAMPON (20/10, docs/compte-rendu-pdfreader-v3.md) : deux canvas superposés. `canvasRef` = celui
     de DEVANT (affiché) ; pdf.js dessine dans celui de DERRIÈRE (masqué), puis on bascule leur visibilité
     dans la même tâche : jamais une image vide ou à moitié dessinée à l'écran. */
  const canvasRef = useRef(null);
  const tamponA = useRef(null), tamponB = useRef(null);
  const derriere = () => (canvasRef.current === tamponA.current ? tamponB.current : tamponA.current);
  /* FONDU CROISÉ (20/10 soir, docs/compte-rendu-pdfreader-v4.md) : le passage de l'image étirée au rendu net
     se fait en 80 ms, les deux canvas superposés et l'un des deux TOUJOURS opaque dessous — jamais un pixel de
     page effacé, et plus de « pop » de netteté au relâchement d'un zoom. Le tampon B est au-dessus de A (ordre
     du DOM, sans z-index : les couches de texte et d'annotations restent au-dessus) : B apparaît en fondu sur A,
     ou A se montre sous B qui s'efface. */
  const fondu = useRef(null);
  const basculerTampon = (nouveau, os) => {
    const ancien = canvasRef.current;
    if (nouveau === ancien) { alignerCanvas(nouveau, os); return; }
    if (fondu.current) fondu.current(); // un fondu en cours se termine aussitôt
    nouveau.style.visibility = '';
    nouveau.classList.add('devant');
    alignerCanvas(nouveau, os);
    nouveau.dataset.rendu = '1'; nouveau.dataset.densite = String(os);
    canvasRef.current = nouveau;
    if (!ancien) return;
    ancien.classList.remove('devant'); delete ancien.dataset.rendu;
    const dessus = nouveau === tamponB.current ? nouveau : ancien; // celui qui s'anime
    const reduit = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let fini = false;
    const finir = () => {
      if (fini) return; fini = true; fondu.current = null;
      dessus.style.transition = ''; dessus.style.opacity = '';
      if (canvasRef.current !== ancien) { ancien.style.visibility = 'hidden'; ancien.width = 1; ancien.height = 1; } // l'ancien rend sa mémoire
    };
    fondu.current = finir;
    if (reduit) { finir(); return; }
    dessus.style.transition = 'none';
    dessus.style.opacity = dessus === nouveau ? '0' : '1';
    void dessus.offsetWidth; // point de départ du fondu posé avant la transition
    dessus.style.transition = 'opacity 80ms linear';
    dessus.style.opacity = dessus === nouveau ? '1' : '0';
    setTimeout(finir, 110);
  };
  useEffect(() => () => { if (fondu.current) fondu.current(); }, []);
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
  const osRef = useRef(1);
  /* (17/10) NETTETÉ (pdf/rendusPages.js) : canvas aux pixels réels (zoom × devicePixelRatio, plafonné),
     affiché 1 pour 1 et calé sur la grille des pixels de l'écran ; pendant un zoom, l'image d'avant
     s'étire (mise à l'échelle CSS) et le rendu net suit 150 ms après le dernier cran ; pages rendues
     gardées en cache (LRU 20) ; rendus pdf.js en file, pages visibles d'abord. */
  /* zoom / densité qui change : l'image en place s'étire AVANT la peinture (useLayoutEffect) à la nouvelle
     taille de la page. Page encore jamais dessinée : un rendu d'un autre zoom en cache la remplace aussitôt,
     étiré, plutôt qu'une page blanche (20/10). */
  useLayoutEffect(() => {
    const c = canvasRef.current;
    if (!c || vierge) return;
    if (dejaRendu.current) { c.style.width = '100%'; c.style.height = '100%'; c.style.transform = ''; return; }
    const proche = pdfDoc && lireRenduProche((pdfDoc.fingerprints && pdfDoc.fingerprints[0]) || 'doc', pageNum);
    if (proche) {
      c.width = proche.w; c.height = proche.h;
      c.getContext('2d').drawImage(proche.bitmap, 0, 0);
      c.style.width = '100%'; c.style.height = '100%'; c.style.transform = '';
      dejaRendu.current = true; // image provisoire : le rendu net suit, comme après un zoom
    }
  }, [pdfDoc, pageNum, vierge, scale, dpr]);
  useEffect(() => {
    let cancelled = false;
    let minuterie = null;
    let tache = null;
    const rendre = async () => {
      if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch (e) { /* ignore */ } }
      if (vierge) {
        // PAGE AJOUTÉE : rien à demander à pdf.js — une page blanche, sans texte
        const canvas = canvasRef.current;
        canvas.width = 1; canvas.height = 1; canvas.style.width = '100%'; canvas.style.height = '100%'; canvas.style.transform = '';
        const c2d = canvas.getContext('2d'); c2d.fillStyle = '#fff'; c2d.fillRect(0, 0, 1, 1);
        canvas.dataset.rendu = '1';
        if (textLayerRef.current) textLayerRef.current.replaceChildren();
        setLayerVersion((v) => v + 1);
        setMatchRects([]);
        return;
      }
      const page = await pdfDoc.getPage(pageNum);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      // densité : pixels réels par pixel CSS (2 sur Retina, 3 au plus) ; dimensions ENTIÈRES du canvas,
      // et pdf.js dessine exactement dedans (facteurs W/largeur, H/hauteur)
      const os = outputScaleFor(viewport.width, viewport.height, dpr);
      const W = Math.max(1, Math.round(viewport.width * os)), H = Math.max(1, Math.round(viewport.height * os));
      const cle = cleRendu((pdfDoc.fingerprints && pdfDoc.fingerprints[0]) || 'doc', pageNum, scale, os);
      const deja = canvasRef.current && canvasRef.current.dataset.rendu && canvasRef.current.dataset.cle === cle;
      if (!deja) {
        // le rendu se fait dans le tampon de DERRIÈRE (masqué) : celui de devant garde l'image précédente
        const arriere = derriere();
        const source = lireRendu(cle);
        if (source) {
          arriere.width = W; arriere.height = H;
          arriere.getContext('2d').drawImage(source.bitmap, 0, 0);
        } else {
          let rendu = false;
          tache = planifierRendu(canvasRef.current, async () => {
            if (cancelled) return;
            arriere.width = W; arriere.height = H;
            const task = page.render({ canvasContext: arriere.getContext('2d'), viewport, transform: [W / viewport.width, 0, 0, H / viewport.height, 0, 0] });
            renderTaskRef.current = task;
            try { await task.promise; rendu = true; } catch (e) {
              if (!(e && e.name === 'RenderingCancelledException')) throw e; // annulation normale (voir ci-dessus)
            } finally { if (renderTaskRef.current === task) renderTaskRef.current = null; }
          });
          await tache.promesse;
          if (cancelled || !rendu) return;
          garderRendu(cle, arriere);
        }
        arriere.dataset.cle = cle;
        // BASCULE : le tampon de derrière passe devant, d'un coup
        basculerTampon(arriere, os);
      }
      const canvas = canvasRef.current;
      osRef.current = os;
      alignerCanvas(canvas, os);
      // la mise en page autour peut encore bouger juste après (position restaurée, panneau) : 2e calage
      setTimeout(() => { if (!cancelled && canvasRef.current) alignerCanvas(canvasRef.current, os); }, 400);
      dejaRendu.current = true;
      await buildTextLayer(page, viewport, textLayerRef.current, ocrPage);
      if (cancelled) return;
      setLayerVersion((v) => v + 1); // couche de texte prête : les ancres peuvent être résolues
      // Chantier 2 : la textLayer réelle vient d'être (re)construite pour ce scale —
      // c'est le bon moment pour mesurer les rects exacts des occurrences via Range.
      setMatchRects(computeMatchRectsFromDom(textLayerRef.current, matches));
    };
    // premier rendu tout de suite ; ensuite (zoom, recherche) on laisse le geste se poser : 150 ms
    minuterie = setTimeout(rendre, dejaRendu.current && !vierge ? 150 : 0);
    return () => {
      cancelled = true;
      clearTimeout(minuterie);
      if (tache) tache.annuler();
      if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch (e) { /* ignore */ } }
    };
  }, [pdfDoc, pageNum, vierge, scale, dpr, matches, ocrPage]);
  // la page bouge d'une fraction de pixel quand la zone de lecture change de largeur (centrage) ou
  // après un défilement posé (position restaurée, défilement fractionnaire) : recalée — à la fin du
  // défilement seulement (100 ms sans mouvement), une lecture de position par page affichée
  useEffect(() => {
    const f = () => { const c = canvasRef.current; if (c && c.dataset.rendu && !vierge) alignerCanvas(c, osRef.current); };
    let minuteur = null;
    const fin = () => { clearTimeout(minuteur); minuteur = setTimeout(f, 100); };
    window.addEventListener('resize', fin);
    const zone = canvasRef.current && canvasRef.current.closest('.pdfr-scroll');
    if (zone) zone.addEventListener('scroll', fin, { passive: true });
    // la zone de lecture (panneau ouvert / replié, en-tête qui change de hauteur) et les pages
    const ro = typeof ResizeObserver !== 'undefined' && zone ? new ResizeObserver(fin) : null;
    if (ro) { ro.observe(zone); if (canvasRef.current.parentElement && canvasRef.current.parentElement.parentElement) ro.observe(canvasRef.current.parentElement.parentElement); }
    window.addEventListener('medrevise:recaler-pages', fin);
    return () => { clearTimeout(minuteur); window.removeEventListener('resize', fin); window.removeEventListener('medrevise:recaler-pages', fin); if (zone) zone.removeEventListener('scroll', fin); if (ro) ro.disconnect(); };
  }, [vierge]);

  /* tracé d'une NOUVELLE boîte : cliquer-glisser dessine le rectangle, un simple
     clic pose une boîte de taille par défaut au point visé. Tout est normalisé
     [0,1] par rapport à la page, donc indépendant du zoom. */
  const [trace, setTrace] = useState(null);
  const demarrerTrace = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const [x0, y0] = versPage(e, r);
    let courant = null;
    const move = (ev) => {
      const [x1, y1] = versPage(ev, r);
      courant = { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
      setTrace(courant);
    };
    const up = (ev, { annule }) => {
      setTrace(null);
      if (annule) return;
      /* (21/10) GABARIT « UN MOT » (pdfShared.js#MOT) : un clic pose une boîte de la taille d'UN mot, qui grandira
         avec son texte ; un rectangle tracé garde sa taille, jamais sous 40 × 24 px (échelle de référence) */
      const l100 = r.width / (scale || 1), h100 = r.height / (scale || 1);
      const minL = fractionRef(MOT.largeurMin, l100), minH = fractionRef(MOT.hauteur, h100);
      let rect = courant;
      const variante = outil; // (22/10) boite | postit | boiteTableau
      if (!rect || rect.width * l100 < 16 || rect.height * h100 < 12) { // un clic (ou un tracé minuscule)
        // (22/10) post-it : un carré de 170 px (référence 1000 px) ; boîte-tableau : 420 px de large ; boîte : un mot
        const dim = variante === 'postit' ? { w: 170 / PAGE_REF, h: (170 / PAGE_REF) * (r.width / r.height) }
          : variante === 'boiteTableau' ? { w: 420 / PAGE_REF, h: (130 / PAGE_REF) * (r.width / r.height) } : null;
        rect = dim ? { x: clamp(x0, 0, 1 - dim.w), y: clamp(y0, 0, 1 - dim.h), width: dim.w, height: dim.h }
          : { x: x0, y: clamp(y0 - minH / 2, 0, 1), width: minL, height: minH };
        if (dim) courant = rect; // même chemin qu'un rectangle tracé : sa taille est gardée
      }
      // la boîte ne sort jamais de la page
      const x = clamp(rect.x, 0, 1 - minL);
      const y = clamp(rect.y, 0, 1 - minH);
      const trace = rect !== courant ? false : true; // rectangle tracé : sa largeur est celle voulue
      onCreerBoite({
        page: pageNum, x, y, gabarit: 'carte', variante, ...(trace ? { largeurFixe: true } : {}),
        width: clamp(rect.width, minL, 1 - x),
        height: clamp(rect.height, minH, 1 - y),
      });
    };
    suivrePointeur(e, { doigt: 'defiler', move, fin: up });
  };

  /* TRACÉ D'UNE FORME (03/10, enrichi le 02/10 soir) : glisser = la forme étirée du point
     d'appui au pointeur ; un simple clic pose la forme à sa taille par défaut, centrée
     sur le point visé. Maj = proportions gardées (carré, cercle) ou trait aimanté à
     45°. Un trait (ligne, flèche) garde son SENS : il part du point d'appui. L'outil
     reste actif pour en poser d'autres. */
  const [traceForme, setTraceForme] = useState(null);
  const demarrerForme = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const type = typeFormeActif;
    const trait = estTrait(type);
    const [x0, y0] = versPage(e, r);
    let courant = null;
    const calculer = (ev) => {
      let [x1, y1] = versPage(ev, r);
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
    const move = (ev) => { courant = calculer(ev); setTraceForme({ ...courant, type }); };
    const up = (ev, { annule }) => {
      setTraceForme(null);
      if (annule) return;
      let rect = courant;
      const longueurPx = rect ? Math.hypot(rect.width * r.width, rect.height * r.height) : 0;
      const tropPetit = !rect || (trait ? longueurPx < 8 : rect.width * r.width < 8 || rect.height * r.height < 8);
      if (tropPetit) {
        const t = tailleParDefaut(type, r.width / r.height);
        rect = { x: clamp(x0 - t.width / 2, 0, 1 - t.width), y: clamp(y0 - t.height / 2, 0, 1 - t.height), width: t.width, height: t.height, fx: false, fy: false };
      }
      onCreerForme({ page: pageNum, ...rect, forme: type });
    };
    suivrePointeur(e, { doigt: 'defiler', move, fin: up });
  };

  /* (08/10) Plus de contour ni de main au survol d'un surlignage : il n'est plus
     cliquable (aucune bulle). Le test de position sert encore à RELIER une boîte. */
  const positionSurlignage = (clientX, clientY) => {
    const container = textLayerRef.current;
    if (!container) return null;
    const cr = container.getBoundingClientRect();
    if (!cr.width || !cr.height) return null;
    const px = (clientX - cr.left) / cr.width, py = (clientY - cr.top) / cr.height;
    const hit = [...highlights].reverse().find((h) => (shownRects[h.id] || h.rects).some((r) => px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height));
    return hit || null;
  };

  /* CRAYON (refait simple le 21/10, pdf/crayon.js). Même principe de couche que la boîte (VERROU 1) : tant que
     l'outil est actif, une couche posée au-dessus de la couche de texte intercepte tout. Le trait :
       1. tous les événements coalescés du pointeur (gestionnaire unique, pdf/pointeur.js) ;
       2. lissage fixe léger — moyenne mobile sur 3 points (lisser3), extrémités gardées : le bout du trait
          reste sous le pointeur ;
       3. aperçu EN DIRECT dès le premier point : le canvas posé sur la page est redessiné DANS l'événement,
          avec le même chemin que le trait enregistré (cheminCatmull → Path2D) ;
       4. au relâchement : enregistré en fractions de page, épaisseur en fraction de la hauteur de page
          (constante en unités PDF, quel que soit le zoom). L'aperçu s'efface quand le trait est à l'écran.
     Surligneur à main levée : même moteur, opacité 40 %, fusion multiply ; « Tracer en ligne droite » :
     du point de départ au pointeur, angle aimanté (horizontal surtout). */
  const PAS_MIN = 0.0007; // pas minimal entre deux points (fraction de page) : on ne garde que ce qui bouge
  const apercuRef = useRef(null);
  const apercuAEffacer = useRef(false);
  const effacerApercu = () => { const c = apercuRef.current; if (c && c.width > 1) c.getContext('2d').clearRect(0, 0, c.width, c.height); apercuAEffacer.current = false; };
  useEffect(() => { if (apercuAEffacer.current) requestAnimationFrame(effacerApercu); }, [traits]); // eslint-disable-line react-hooks/exhaustive-deps
  const peindreApercu = (points, r, style) => {
    const c = apercuRef.current;
    if (!c || !points.length) return;
    const d = window.devicePixelRatio || 1;
    const W = Math.round(r.width * d), H = Math.round(r.height * d);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H);
    x.globalAlpha = style.opacite; x.strokeStyle = style.couleur; x.lineWidth = style.largeur * d; x.lineCap = 'round'; x.lineJoin = 'round';
    x.stroke(new Path2D(style.droit ? cheminDroit(points, W, H) : cheminCatmull(points, W, H)));
  };
  /** le pointeur est-il sur un caractère de la couche de texte (span pdf.js ou mot OCR) ? */
  const surDuTexte = (e) => {
    const couche = textLayerRef.current, t = e.target;
    const span = t && t.closest && t.closest('span');
    if (!couche || !span || !couche.contains(span) || !(span.textContent || '').trim()) return false;
    const q = span.getBoundingClientRect();
    return e.clientX >= q.left - 1 && e.clientX <= q.right + 1 && e.clientY >= q.top - 1 && e.clientY <= q.bottom + 1;
  };
  const demarrerTrait = (e) => {
    // bout gomme / bouton gomme d'un stylet (bouton 5) : il gomme, le crayon reste l'outil
    if (e.pointerType === 'pen' && (e.button === 5 || (e.buttons & 32))) { demarrerGomme(e); return; }
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const ratio = r.width / r.height;
    const surligneur = modeCrayon === 'surligneur';
    const droit = surligneur && surligneurDroit;
    const brut = [versPage(e, r)];
    const points = () => (droit ? accrocherAngles([brut[0], brut[brut.length - 1]], ratio, 12) : lisser3(brut));
    const style = { couleur: encre(couleurTrait), opacite: surligneur ? OPACITE_SURLIGNEUR_CRAYON : 1, largeur: Math.max(surligneur ? 4 : 1, (epaisseurTrait / PAGE_REF) * r.width), droit }; // (v1.1) px d'une page de 1000 px
    let annule = false;
    const suivi = suivrePointeur(e, {
      doigt: 'defiler',
      move: (ev, lot) => {
        for (const q of lot) { const p = versPage(q, r), der = brut[brut.length - 1]; if (Math.hypot(p[0] - der[0], p[1] - der[1]) >= PAS_MIN) brut.push(p); }
        peindreApercu(points(), r, style); // tout de suite, dans l'événement
      },
      fin: (ev, { annule: interrompu }) => {
        rendreTrace(e.pointerId);
        if (annule || interrompu) { effacerApercu(); return; }
        if (ev && Number.isFinite(ev.clientX)) { const p = versPage(ev, r), der = brut[brut.length - 1]; if (Math.hypot(p[0] - der[0], p[1] - der[1]) > 1e-6) brut.push(p); }
        if (brut.length < 2) { effacerApercu(); return; }
        const finaux = arrondirPoints(points());
        peindreApercu(finaux, r, style);
        apercuAEffacer.current = true; // effacé quand le trait enregistré est à l'écran (ou au plus tard 1,5 s)
        setTimeout(() => { if (apercuAEffacer.current) effacerApercu(); }, 1500);
        onCreerTrait({ page: pageNum, mode: surligneur ? 'surligneur' : 'dessin', rendu: droit ? 'droit' : 'cr', points: finaux });
      },
    });
    if (!suivi) return; // doigt qui défile, autre bouton
    // un seul tracé à la fois ; 2e doigt aussitôt posé = geste à deux doigts → tracé annulé
    if (!prendreTrace(e, () => { annule = true; suivi.arreter(); })) { annule = true; suivi.arreter(); return; }
    if (onDebutTrait) onDebutTrait(); // (11/10) un trait commence : la boîte sélectionnée se désélectionne
    if (apercuRef.current) apercuRef.current.classList.toggle('surligneur', surligneur);
    peindreApercu(points(), r, style); // visible dès le premier point
  };

  /* GOMME (nuit du 30/09 ; deux modes depuis le 21/10). Elle n'efface QUE les traits de crayon et les formes —
     jamais un surlignage de texte ni une boîte, qui ont leur propre bouton Supprimer. Tant qu'elle est active,
     une couche de capture couvre toute la page : rien d'autre ne peut réagir. Le curseur est un rond dont le
     point chaud est au centre : ce qu'on voit sous le rond est ce qui s'efface.
       - « Zone » : seule la partie d'un trait passée sous la gomme disparaît (le trait est coupé en morceaux) ;
       - « Trait entier » : un trait touché s'efface en entier.
     Une forme touchée s'efface en entier dans les deux modes. Un geste = UNE entrée d'annulation. */
  const [masques, setMasques] = useState(null); // traits (et formes) effacés en entier pendant le geste en cours
  const [coupes, setCoupes] = useState(null); // gomme de zone : Map id → morceaux restants pendant le geste
  const pageRef = () => (canvasRef.current && canvasRef.current.closest('.pdfr-page')) || document;
  const RAYON_GOMME = 9; // px à l'écran : le rayon du curseur rond (voir etudes.css)
  const demarrerGomme = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const seuil = RAYON_GOMME / Math.min(r.width, r.height);
    const ratio = r.width / r.height;
    const zone = modeGomme === 'zone';
    const touches = new Map(); // effacés en entier
    const restes = new Map(); // gomme de zone : id → points (densifiés) encore présents
    let prec = null;
    const tester = (cx, cy) => {
      // échantillonne le segment depuis la position précédente : un glisser rapide ne « saute » aucun trait fin
      const pas = prec ? Math.max(1, Math.ceil(Math.hypot(cx - prec[0], cy - prec[1]) / 3)) : 1;
      for (let k = 1; k <= pas; k++) {
        const x = prec ? prec[0] + ((cx - prec[0]) * k) / pas : cx;
        const y = prec ? prec[1] + ((cy - prec[1]) * k) / pas : cy;
        const px = (x - r.left) / r.width, py = (y - r.top) / r.height;
        for (const t of traits || []) {
          if (touches.has(t.id) || !traitTouche(t, px, py, seuil)) continue;
          if (!zone) { touches.set(t.id, t); continue; }
          // zone : les points (rapprochés) sous le rond de la gomme disparaissent
          const demiEp = (modeDuTrait(t) === 'surligneur' ? epaisseurPx(t, ratio, 1, EPAISSEUR_SURLIGNEUR) : 0) * 0.5; // en fraction de hauteur
          const rayon = seuil + demiEp;
          const pts = restes.get(t.id) || [densifier(t.points || [], seuil / 2, ratio)];
          const nouv = pts.flatMap((m) => morceauxHors(m, (q) => Math.hypot((q[0] - px) * ratio, q[1] - py) <= rayon));
          restes.set(t.id, nouv);
        }
        // FORMES (02/10 soir) : test exact sur leur tracé SVG (isPointInStroke, élargi du rayon de la gomme)
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
      if (restes.size) setCoupes(new Map(restes));
    };
    const suivi = suivrePointeur(e, {
      doigt: 'defiler',
      move: (ev, lot) => lot.forEach((q) => tester(q.clientX, q.clientY)),
      fin: async (ev, { annule }) => {
        if (!annule) {
          const decoupes = [...restes].filter(([id]) => !touches.has(id)).map(([id, morceaux]) => ({ trait: traits.find((t) => t.id === id), morceaux })).filter((d) => d.trait);
          if (touches.size || decoupes.length) await onGommer({ supprimer: [...touches.values()], decouper: decoupes });
        }
        setMasques(null); setCoupes(null);
      },
    });
    if (suivi) tester(e.clientX, e.clientY);
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
    /* AJOUTER UNE FLÈCHE (02/10 soir ; seul geste depuis le 20/10, pdf/connecteurs.js) : la première
       comme les suivantes. Le clic choisit la cible : un surlignage (la flèche va à son bord), une forme
       (son côté, ou le milieu d'un trait), sinon le point cliqué. */
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    let cible = null;
    const hit = positionSurlignage(e.clientX, e.clientY);
    // (21/10) une autre BOÎTE visée : la flèche s'y rattache (elle finira sur son bord, et la suivra)
    const visee = boiteSous(e.clientX, e.clientY, boiteEnAncrage.id);
    if (visee) cible = { x: clamp01(px), y: clamp01(py), texte: null, boiteCible: visee };
    else if (hit) {
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
    onModifierBoite(boiteEnAncrage, patchAjouter(boiteEnAncrage, cible), 'Flèche ajoutée');
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
  // (08/10) Un simple clic sur un surlignage ne fait plus RIEN de particulier (plus de
  // bulle) : les rectangles restent transparents à la souris, le texte dessous se
  // sélectionne normalement.
  // VERROU 3 (voir l'en-tête de fichier) : un geste de boîte qui vient de se
  // terminer ne doit RIEN déclencher ici, même si le pointeur a fini sa course
  // hors de la boîte — auquel cas le mouseup atteint bien cette couche.
  const gesteBoite = useRef(false);
  const handleMouseUp = (e) => {
    if (gesteBoite.current) { gesteBoite.current = false; return; }
    const sel = window.getSelection();
    const container = textLayerRef.current;
    if (!container || !sel) return;
    if (sel.isCollapsed) return;
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
    // surlignages que la sélection RECOUVRE (repasser dessus : retirer / recolorer, PdfReader)
    const touches = surlignagesTouches(anchor, rects, highlights, shownRects);
    /* (10/10) repasser au surligneur, à la PORTION près (pdfShared#planSurlignage) : le plan
       est calculé à la couleur choisie (tout de suite au surligneur, plus tard depuis la bulle) ;
       chaque ancre résultante est remise en texte + rectangles sur CETTE couche de texte. */
    const calculer = anchor ? (couleur) => {
      const spans = [...container.querySelectorAll('span')];
      const txt = (a) => { const r = rangeFromAnchor(container, a); return r ? r.toString() : ''; };
      // blancs aux bords retirés (un morceau ne commence ni ne finit par une espace)
      const rognerBlancs = (a) => {
        let { start, end } = a;
        const t = (i) => (spans[i] && spans[i].textContent) || '';
        while ((start.item < end.item || start.char < end.char)) {
          if (start.char >= t(start.item).length) { if (start.item >= end.item) break; start = { item: start.item + 1, char: 0 }; continue; }
          if (!/\s/.test(t(start.item)[start.char])) break;
          start = { item: start.item, char: start.char + 1 };
        }
        while ((end.item > start.item || end.char > start.char)) {
          if (end.char <= 0) { if (end.item <= start.item) break; end = { item: end.item - 1, char: t(end.item - 1).length }; continue; }
          if (!/\s/.test(t(end.item)[end.char - 1])) break;
          end = { item: end.item, char: end.char - 1 };
        }
        return { v: 1, start, end };
      };
      const avecAncre = highlights.filter((h) => h.anchor && !h.imageId);
      const plan = planSurlignage(anchor, avecAncre, couleur, {
        aDuTexte: (a) => /[\p{L}\p{N}]/u.test(txt(a)),
        blanc: (a) => !txt(a).trim(),
      });
      const materialiser = (a0) => {
        const a = rognerBlancs(a0);
        const r = rangeFromAnchor(container, a);
        const t = r && cleanSelectedText(r.toString(), { inline: true });
        const rs = r ? rectsFromRange(container, r) : [];
        return t && rs.length ? { anchor: a, texte: t, rects: rs } : null;
      };
      return {
        retrait: plan.retrait,
        supprimer: plan.supprimer,
        garder: plan.garder.map((g) => ({ id: g.id, ...materialiser(g.anchor) })).filter((g) => g.texte),
        // un morceau devenu illisible est simplement abandonné (supprimé s'il remplaçait un surlignage)
        perdus: plan.garder.filter((g) => !materialiser(g.anchor)).map((g) => g.id),
        creer: plan.creer.map((c) => ({ couleur: c.couleur, depuis: c.depuis || null, ...materialiser(c.anchor) })).filter((c) => c.texte),
        // anciens surlignages SANS ancre recouverts : règle d'avant (retirés ou recolorés en entier)
        sansAncre: touches.filter((id) => { const h = highlights.find((x) => x.id === id); return h && !h.anchor && !h.imageId; }),
      };
    } : null;
    onCreateHighlight({ page: pageNum, texte, rects, anchor, segments, touches, calculer, x: last.right, y: last.bottom, fontSizeRel, fontFamily });
  };

  /* SÉLECTION UNIQUE (pdf/Selection.jsx) : l'état vit dans le lecteur ; chaque objet reçoit « sélectionné ? » et de
     quoi se sélectionner. Les boîtes signalent leur cadre affiché (une flèche rattachée finit sur leur bord). */
  const [cadres, setCadres] = useState({});
  const signalerCadre = useRef((id, c) => setCadres((m) => { const a = m[id]; if (!c) { if (!a) return m; const n = { ...m }; delete n[id]; return n; }
    if (a && Math.abs(a.x - c.x) < 1e-6 && Math.abs(a.y - c.y) < 1e-6 && Math.abs(a.w - c.w) < 1e-6 && Math.abs(a.h - c.h) < 1e-6) return m; return { ...m, [id]: c }; })).current;
  const estSel = (id, kind) => !!selection && selection.id === id && selection.kind === kind;
  const propsSelection = (rec, kind) => ({
    selectionne: estSel(rec.id, kind),
    onSelectionner: () => onSelection({ id: rec.id, kind }),
    selConn: selection && selection.kind === 'fleche' && selection.id === rec.id ? selection.conn : null,
    onSelConn: (conn) => onSelection(conn ? { id: rec.id, kind: 'fleche', conn } : null),
    cadres, onCadre: signalerCadre, onTransferer: onTransfererFleche,
  });
  /* TRAIT DE CRAYON SÉLECTIONNÉ (21/10) — même règle que les autres objets : outil Sélection, clic sur le trait =
     sélection, glisser = déplacement, 4 coins = redimension (les points suivent le cadre), mini barre couleur ·
     épaisseur · supprimer. Une entrée d'Annuler par geste. */
  const [traitApercu, setTraitApercu] = useState(null); // { id, points } pendant un geste
  const traitSel = selection && selection.kind === 'trait' ? (traits || []).find((t) => t.id === selection.id) : null;
  const cadreTrait = (pts) => { const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]); return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(1e-4, Math.max(...xs) - Math.min(...xs)), height: Math.max(1e-4, Math.max(...ys) - Math.min(...ys)) }; };
  const arrondir5 = (pts) => pts.map(([x, y]) => [+clamp01(x).toFixed(5), +clamp01(y).toFixed(5)]);
  const deplacerTrait = (e, t) => {
    const r = rectPage(e.currentTarget);
    if (!r || !r.width || !onModifierTrait) return;
    onSelection({ id: t.id, kind: 'trait' });
    const x0 = e.clientX, y0 = e.clientY;
    let pts = null;
    suivrePointeur(e, {
      seuil: 3, arreter: true, glisser: true,
      move: (ev) => { const dx = (ev.clientX - x0) / r.width, dy = (ev.clientY - y0) / r.height; pts = t.points.map(([x, y]) => [x + dx, y + dy]); setTraitApercu({ id: t.id, points: pts }); },
      fin: (ev, { bouge, annule }) => { setTraitApercu(null); if (!annule && bouge && pts) onModifierTrait(t, { points: arrondir5(pts) }, 'Déplacement du trait'); },
    });
  };
  const redimTrait = (e, coin, t) => {
    const b0 = cadreTrait(t.points);
    const mise = (rc) => t.points.map(([x, y]) => [rc.x + ((x - b0.x) / b0.width) * rc.width, rc.y + ((y - b0.y) / b0.height) * rc.height]);
    redimensionner(e, coin, { base: () => b0, min: { width: 0.004, height: 0.004 },
      apercu: (rc) => setTraitApercu(rc ? { id: t.id, points: mise(rc) } : null),
      fin: (rc) => onModifierTrait && onModifierTrait(t, { points: arrondir5(mise(rc)) }, 'Redimension du trait') });
  };
  // surlignage relié à la boîte en cours d'écriture : il s'entoure (le lien se voit)
  const liesActifs = new Set((boites || []).filter((b) => b.id === activeEditId && b.surlignageId).map((b) => b.surlignageId));
  const liesFormes = new Set((boites || []).filter((b) => b.id === activeEditId && b.formeId).map((b) => b.formeId));

  return (
    <>
      <canvas ref={(el) => { tamponA.current = el; if (el && !canvasRef.current) canvasRef.current = el; }} className="pdfr-tampon devant" style={{ width: '100%', height: '100%' }} />
      <canvas ref={tamponB} className="pdfr-tampon" style={{ width: '100%', height: '100%', visibility: 'hidden' }} aria-hidden="true" />
      {/* DÉBOGAGE OCR (menu Fichier › « Afficher la couche OCR ») : les boîtes des mots,
          en unités PDF ramenées à la page — vérifie l'alignement avec l'image */}
      {ocrDebug && ocrPage && (!ocrPage.natif || ocrPage.mixte) && ocrPage.width > 0 && (
        <div className="pdfr-ocr-debug" aria-hidden="true">
          {(ocrPage.words || []).map((m, i) => (
            <span key={i} className={m.c < 70 ? 'faible' : ''} title={`${m.t} · ${m.c} %`}
              style={{ left: `${(m.x / ocrPage.width) * 100}%`, top: `${(m.y / ocrPage.height) * 100}%`, width: `${(m.w / ocrPage.width) * 100}%`, height: `${(m.h / ocrPage.height) * 100}%` }} />
          ))}
        </div>
      )}
      {/* SURLIGNEUR UNIQUE (22/10, docs/compte-rendu-simplification-outils.md §1) : un geste qui commence SUR du texte
          (natif ou couche OCR) le sélectionne et le surligne au relâchement ; ailleurs, il trace un surlignage à main
          levée (même moteur que le crayon). */}
      <div ref={textLayerRef} className={'pdfr-textlayer outil-' + outil} onMouseUp={handleMouseUp} onCopy={handleCopy}
        onPointerDown={outil === 'surligneur' ? (e) => { if (!surDuTexte(e)) demarrerTrait(e); } : undefined} />
      {corps}
      {/* IMAGES COLLÉES (01/10) : JUSTE au-dessus du PDF, SOUS toutes les annotations
          (surlignages, blocs, traits, textes, « ? », boîtes — rendus après). Leur
          profondeur (`z`) ne les classe qu'entre elles : c'est l'ordre du DOM, sans
          z-index, donc une image ne peut jamais passer devant une annotation. */}
      {images.length > 0 && (
        <div className={'pdfr-imglayer' + (outil === 'main' ? ' interactif' : '')}>
          {images.map((img, i) => (
            <ImageCollee key={img.id} img={img} active={img.id === imageActiveId}
              outil={outil} surlignages={surlignagesImages.filter((h) => h.imageId === img.id)} couleurSurligneur={couleurSurligneur}
              onSurligner={onSurlignerImage} onFlashcard={onFlashcardTexte}
              onActiver={onImageActiver} onMaj={onImageMaj} onModifier={(im, patch, lib) => onImageMaj(im, { ...im, ...patch }, lib)} onSupprimer={onImageSupprimer}
              onApercu={(geo) => setApercuImage(geo ? { id: img.id, avant: img, geo } : null)}
              pageWidth={pageWidth} pageHeight={pageHeight}
              onGeste={(enCours) => { gesteBoite.current = enCours; }} />
          ))}
        </div>
      )}
      <div className="pdfr-hlayer">
        {/* (22/10) UN rectangle continu par ligne (pdfShared.js#lignesSurlignage), coins de 3 px, 1 px de débord en
            hauteur (etudes.css .pdfr-hl-rect) — même rendu sur le texte natif et sur la couche OCR */}
        {highlights.flatMap((h) => lignesSurlignage(shownRects[h.id] || h.rects).map((r, i) => (
          <div key={h.id + ':' + i} data-hl={h.id}
            className={'pdfr-hl-rect' + (h.id === cibleHlId ? ' cible' : '') + (liesActifs.has(h.id) ? ' lie' : '')}
            style={{ left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%', background: couleurHex(h.couleur),
              // couleur perso (hex) : translucide comme un vrai surligneur — un violet ou un
              // bleu foncé en pleine teinte rendrait le texte illisible (les 4 couleurs
              // « cours » sont déjà des pastels). Même rendu qu'à l'export (opacité 0,4).
              ...(opaciteSurlignage(h.couleur) < 1 ? { opacity: opaciteSurlignage(h.couleur) } : {}) }} />
        )))}
        {matchRects.map((m) => (
          <div key={'m' + m.idx + ':' + m.ri} className={'pdfr-match-rect' + (m.idx === activeMatchIdx ? ' active' : '')}
            style={{ left: m.rect.x * 100 + '%', top: m.rect.y * 100 + '%', width: m.rect.width * 100 + '%', height: m.rect.height * 100 + '%' }} />
        ))}
      </div>
      <canvas ref={selCanvasRef} className="pdfr-selcanvas" aria-hidden="true" />
      {edits.map((a) => (
        <TextEditBlock key={a.id} edit={a} active={a.id === activeEditId} editable={outil === 'main'} onActivate={onActivateEdit} editor={a.id === activeEditId ? activeEditor : null} pageHeight={pageHeight}
          pageWidth={pageWidth} onReinitialiser={() => onReinitialiserBloc(a.id)} />
      ))}

      {/* Les traits au crayon : un seul <svg> par page, transparent à la souris.
          `vector-effect: non-scaling-stroke` garde l'épaisseur constante à l'écran
          quel que soit le zoom, sans recalculer quoi que ce soit. */}
      {/* DEUX calques : les surligneurs en fusion « multiply » (le texte reste
          noir dessous) et SOUS les dessins. L'opacité est portée par le TRAIT
          entier (stroke-opacity d'un seul <path>) : un trait qui se recroise ne
          fonce pas sur lui-même, comme un vrai surligneur. */}
      {traits.length > 0 && (() => {
        const H = pageHeight || 800, W = pageWidth || 600;
        /* ÉPAISSEUR COLLÉE À LA PAGE (04/10, décision finale) : `epaisseur × hauteur de
           page affichée` — le trait grossit et rapetisse avec la page, comme le PDF ; depuis le 22/10, `epaisseurL ×
           largeur` (pdfShared.js#epaisseurPx) — la même proportion sur toutes les pages. */
        const rendu = (t, cle) => {
          const surl = modeDuTrait(t) === 'surligneur';
          const epPx = epaisseurPx(t, W, H, surl ? EPAISSEUR_SURLIGNEUR : 0.0042);
          return (
            <path key={cle} d={cheminTrait(t, cheminLisse)} fill="none"
              stroke={encre(t.couleur)}
              strokeOpacity={Number.isFinite(t.opacite) ? t.opacite : (surl ? OPACITE_SURLIGNEUR : 1)}
              strokeWidth={Math.max(surl ? 4 : 1, epPx)}
              strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          );
        };
        // gomme en cours : traits effacés masqués, traits coupés (gomme de zone) remplacés par leurs morceaux
        const visibles = traits.flatMap((t) => (masques && masques.has(t.id) ? [] : coupes && coupes.has(t.id)
          ? coupes.get(t.id).map((m, i) => ({ ...t, id: t.id + '#' + i, points: m })) : traitApercu && traitApercu.id === t.id ? [{ ...t, points: traitApercu.points }] : [t]));
        const surl = visibles.filter((t) => modeDuTrait(t) === 'surligneur');
        const dess = visibles.filter((t) => modeDuTrait(t) !== 'surligneur');
        return (
          <>
            <svg className="pdfr-inklayer surligneur" viewBox="0 0 100 100" preserveAspectRatio="none">
              {surl.map((t) => rendu(t, t.id))}
            </svg>
            <svg className="pdfr-inklayer" viewBox="0 0 100 100" preserveAspectRatio="none">
              {dess.map((t) => rendu(t, t.id))}
            </svg>
            {/* prise des traits, outil Sélection seulement (une bande invisible le long de chaque trait) */}
            {outil === 'main' && onModifierTrait && (
              <svg className="pdfr-traits-prise" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {visibles.map((t) => (
                  <path key={t.id} className="sel-objet" data-trait={t.id} d={cheminTrait(t, cheminLisse)} fill="none" stroke="transparent" strokeLinecap="round" strokeLinejoin="round"
                    strokeWidth={Math.max(12, epaisseurPx(t, W, H, 0.0042) + 8)} vectorEffect="non-scaling-stroke"
                    onPointerDown={(e) => { const t0 = traits.find((q) => q.id === t.id); if (t0) deplacerTrait(e, t0); }} />
                ))}
              </svg>
            )}
          </>
        );
      })()}

      {/* FORMES (03/10) : des annotations, donc au-dessus des images ; sélectionnables
          par leur BORD seulement (l'intérieur laisse passer les clics vers le texte). */}
      {formes.map((f) => (masques && masques.has(f.id) ? null : (
        <Forme key={f.id} forme={f} active={f.id === formeActiveId} interactive={outil === 'main'} fondNoir={fondNoir}
          liee={liesFormes.has(f.id)} pageWidth={pageWidth} pageHeight={pageHeight}
          onActiver={onFormeActiver} onMaj={onFormeMaj} onModifier={onFormeModifier} onSupprimer={onFormeSupprimer} cadres={cadres} k={scale / ECHELLE_REF}
          onApercu={onApercuCouleur ? (c) => onApercuCouleur(f.id, c) : null}
          onGeste={(enCours) => { gesteBoite.current = enCours; }} />
      )))}
      {traitSel && outil === 'main' && (() => {
        const pts = traitApercu && traitApercu.id === traitSel.id ? traitApercu.points : traitSel.points;
        const c = cadreTrait(pts), H = pageHeight || 800, W = pageWidth || 600;
        const marge = Math.max(4, epaisseurPx(traitSel, W, H, 0.0042) / 2 + 3); // le cadre entoure le trait, épaisseur comprise
        const ancre = { x: c.x * W - marge, y: c.y * H - marge, w: c.width * W + 2 * marge, h: c.height * H + 2 * marge };
        // (v1.1) le sélecteur commun (pdf/ChoixTaille.jsx) : l'épaisseur du trait en px d'une page de 1000 px, quelle que soit son unité
        const genreTrait = modeDuTrait(traitSel) === 'surligneur' ? 'surligneur' : 'crayon';
        return (<>
          <div className="pdfr-trait-sel sel-objet" style={{ left: ancre.x, top: ancre.y, width: ancre.w, height: ancre.h }}
            onPointerDown={(e) => deplacerTrait(e, traitSel)}>
            <CadreSelection onCoin={(e, coin) => redimTrait(e, coin, traitSel)} />
          </div>
          {!traitApercu && (
            <MiniBarre ancre={ancre} pageWidth={W} pageHeight={H} items={[
              { cle: 'couleur', couleur: traitSel.couleur, titre: 'Couleur du trait', onCouleur: (cl) => onModifierTrait(traitSel, { couleur: cl }, 'Couleur du trait') },
              { cle: 'epaisseur', element: <BoutonTaille genre={genreTrait} valeur={ep1000De(traitSel, W, H, genreTrait === 'surligneur' ? EPAISSEUR_SURLIGNEUR : 0.0042)} echelle={W / PAGE_REF}
                couleur={couleurHex(traitSel.couleur, '#1F1F24')} onChange={(v) => { ecrireTaille(genreTrait, v); onModifierTrait(traitSel, champsEp1000(v, W, H), 'Épaisseur du trait'); }} /> },
              { cle: '|' },
              { cle: 'supprimer', titre: `Supprimer le trait (annulable par ${RACCOURCI_Z})`, onClick: () => { onSelection(null); onGommer({ supprimer: [traitSel] }); } },
            ]} />
          )}
        </>);
      })()}
      {outil === 'forme' && (
        <div className="pdfr-drawlayer pdfr-formelayer" onPointerDown={demarrerForme}>
          {traceForme && (
            <Forme apercu forme={{ ...traceForme, forme: traceForme.type, couleur: couleurForme, remplie: formeRemplie, epaisseur: 0.0025 }}
              pageWidth={pageWidth} pageHeight={pageHeight} />
          )}
        </div>
      )}

      {(outil === 'crayon' || outil === 'surligneur') && <canvas ref={apercuRef} className="pdfr-apercu-trait" width={1} height={1} aria-hidden="true" />}
      {outil === 'crayon' && <div className="pdfr-inkcapture" onPointerDown={demarrerTrait} />}

      {/* VERROU 1 : la couche de tracé n'existe QUE pendant que l'outil « Boîte de
          texte » est actif, et elle est posée AU-DESSUS de la couche de texte. Tant
          qu'elle est là, aucun événement n'atteint `pdfr-textlayer` : ni sélection,
          ni surlignage, ni test de position. Rien à désactiver, rien à oublier. */}
      {(outil === 'boite' || outil === 'postit' || outil === 'boiteTableau') && (
        <div className={'pdfr-drawlayer outil-' + outil} onPointerDown={demarrerTrace}>
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
          const r = e.currentTarget.getBoundingClientRect();
          if (!r.width || !r.height || !suivrePointeur(e, { doigt: 'defiler' })) return;
          const [x, y] = versPage(e, r);
          onPoser(outil, { page: pageNum, x, y });
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
          onApercu={onApercuCouleur ? (c) => onApercuCouleur(t.id, c) : null}
          {...propsSelection(t, 'texte')}
          pageWidth={pageWidth} pageHeight={pageHeight} texteProche={texteProche} fondNoir={fondNoir} />
      ))}
      {questions.map((q) => (
        <QuestionMarque key={q.id} q={q} onModifier={onModifierBoite} onSupprimer={onSupprimerBoite}
          selectionne={estSel(q.id, 'question')} onSelectionner={() => onSelection({ id: q.id, kind: 'question' })}
          pageWidth={pageWidth} pageHeight={pageHeight} k={scale / ECHELLE_REF}
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
          enAncrage={b.id === ancrageBoiteId} viseSurlignage={ancrageSurlignage} viseAjout={ancrageAjout} onDemanderAncrage={onDemanderAncrage} flechesInteractives={outil === 'main'}
          onVersTableau={onVersTableau} auTableau={!!(boitesAuTableau && boitesAuTableau.has(b.id))}
          onApercu={onApercuCouleur ? (c) => onApercuCouleur(b.id, c) : null}
          {...propsSelection(b, 'boite')}
          pageWidth={pageWidth} pageHeight={pageHeight} texteProche={texteProche} />
      ))}

      {/* VISÉE D'UN ANCRAGE : au-dessus de tout, sur la page de la boîte seulement.
          Un clic = l'endroit visé (point exact + le passage de texte le plus proche). */}
      {boiteEnAncrage && (
        <div className="pdfr-ancrage" onPointerDown={poserAncre}>
          <div className="pdfr-ancrage-aide">Clique l’endroit, le surlignage ou la forme que la flèche doit viser · Échap pour annuler</div>
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
/* FOND D'UNE BOÎTE (09/10, docs/compte-rendu-pdfreader-v2.md) : transparent (fine bordure de sa
   couleur, texte à l'encre de la page), teinté 15 %, ou plein (texte sombre sur une couleur claire,
   clair sur une couleur foncée). Défaut des nouvelles boîtes : « plein », puis le dernier fond choisi
   sur l'appareil (15/10, pdfShared.js#lireFondBoiteDefaut). Une boîte d'avant (sans `fond`) garde
   exactement son rendu d'origine. */
export const FONDS_BOITE = [
  { id: 'transparent', label: 'Transparent' },
  { id: 'teinte', label: 'Teinté' },
  { id: 'plein', label: 'Plein' },
];
export function styleFondBoite(boite, fondNoir = false) {
  const hex = couleurHex(boite.couleur);
  if (!boite.fond) return { background: avecAlpha(hex, opaciteFondBoite(boite.couleur)), ...(opaciteFondBoite(boite.couleur) < 0.9 ? { borderColor: hex } : {}) };
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  const encrePage = fondNoir ? '#ECECF1' : '#16162a';
  if (boite.fond === 'plein') return { background: avecAlpha(hex, 0.92), borderColor: hex, color: lum < 0.5 ? '#FFFFFF' : '#16162a' };
  return { background: boite.fond === 'teinte' ? avecAlpha(hex, 0.15) : 'transparent', borderColor: hex, color: encrePage };
}
/* apparition / disparition animées (120 ms) d'un élément : [monté, en train de sortir] */
function useApparition(visible, ms = 120) {
  const [monte, setMonte] = useState(visible);
  const [sortie, setSortie] = useState(false);
  useEffect(() => {
    if (visible) { setMonte(true); setSortie(false); return undefined; }
    if (!monte) return undefined;
    setSortie(true);
    const t = setTimeout(() => { setMonte(false); setSortie(false); }, ms);
    return () => clearTimeout(t);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  return [monte || visible, sortie && !visible];
}

function NoteBox({ boite, active, editor, onActivate, onGeste, onMaj, onSupprimer, onModifier, onApercu = null, enAncrage = false, viseSurlignage = false, viseAjout = false, onDemanderAncrage, pageWidth, pageHeight, texteProche, variante = 'boite', echelle = ECHELLE_REF, fondNoir = false, flechesInteractives = true,
  selectionne = false, onSelectionner = () => {}, selConn = null, onSelConn = () => {}, cadres = null, onCadre = null, onTransferer = null,
  onVersTableau = null, auTableau = false }) {
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
  const [redim, setRedim] = useState(false); // (20/10 soir) une REDIMENSION est en cours (pas un déplacement)
  const b = apercu || boite;
  const html = useMemo(() => richToHTML(boite.content), [boite.content]);
  const barreRef = useRef(null);
  const clicRef = useRef(null); // coordonnées du clic d'activation, pour y poser le curseur

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
  const grille = !texteLibre && estGrille(boite.grille) ? boite.grille : null; // (22/10) boîte-tableau (pdf/BoiteTableau.jsx)
  useEffect(() => {
    if (!active || !editor || grille) return undefined;
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
    clicRef.current = e && Number.isFinite(e.clientX) ? { x: e.clientX, y: e.clientY, depuis: null } : null;
    onActivate(boite.id);
  };
  const contre = k !== 1 ? 1 / k : 1; // les poignées gardent leur taille à l'écran

  /* GESTE UNIQUE (21/10, pdf/Selection.jsx) — le même pour tous les objets : un clic sélectionne, cliquer-glisser
     N'IMPORTE OÙ sur la boîte la déplace (elle garde sa taille et passe au-dessus des autres), un clic sur une boîte
     déjà sélectionnée ou un double-clic ouvre l'édition du texte. En édition, le texte reçoit le pointeur. */
  const verrou = !!boite.verrouille; // (22/10) boîte verrouillée : ni déplacée ni redimensionnée (son texte reste modifiable)
  const appui = (e) => {
    if (active) return;
    const r = rectPage(e.currentTarget);
    if (!r || !r.width || !r.height) return;
    const avant = boite, x0 = e.clientX, y0 = e.clientY, deja = selectionne;
    let courant = null;
    const suivi = suivrePointeur(e, {
      seuil: 4, arreter: true, glisser: !verrou,
      move: (ev) => { if (verrou) return; courant = { ...avant, x: clamp(avant.x + (ev.clientX - x0) / r.width, 0, 0.98), y: clamp(avant.y + (ev.clientY - y0) / r.height, 0, 0.98) }; setApercu(courant); },
      fin: (ev, { bouge, annule }) => {
        setApercu(null); onGeste(false);
        if (annule) return;
        if (bouge && courant) { onMaj(avant, courant, 'Déplacement de la boîte'); if (!deja) onSelectionner(); }
        else if (bouge && verrou) { if (!deja) onSelectionner(); } // glisser une boîte verrouillée : rien ne bouge, rien ne s'ouvre
        else if (deja) activer(ev);
        else onSelectionner();
      },
    });
    if (suivi) onGeste(true);
  };

  /* HAUTEUR = UN MINIMUM (01/10) : la boîte grandit avec son texte au lieu de le cacher derrière un ascenseur.
     LARGEUR QUI ÉPOUSE LE TEXTE (02/10) : la largeur enregistrée devient un MAXIMUM, sauf boîte redimensionnée à la
     main (`largeurFixe`) ; pendant une REDIMENSION on montre la largeur exacte, un déplacement ne fait que translater
     (cause du bug du 20/10 : docs/compte-rendu-pdfreader-v4.md). Gabarit compact du 20/10 (pdfShared.js#COMPACT) et
     gabarit « un mot » du 21/10 (pdfShared.js#MOT) : largeur du texte, au plus 45 % de la page. */
  const extraitBrut = boite.content ? richToHTML(boite.content).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
  /* (22/10) gabarit « carte » des boîtes créées depuis le 22/10 : la règle « un mot » (largeur du texte), avec les
     métriques de la famille « carte » (marges 10 × 8 px, coins 10 px) partagées avec les cartes du tableau ; une
     boîte d'avant garde ses métriques (aucune ne change de position ni de taille) */
  const carte = boite.gabarit === 'carte';
  const mot = boite.gabarit === 'mot' || carte;
  const motLibre = mot && !boite.largeurFixe && !redim;
  const compacteLibre = !mot && !!boite.compacte && !boite.largeurFixe && !redim;
  const ajustee = !mot && !boite.compacte && !redim && !boite.largeurFixe && !!extraitBrut;
  const libre = motLibre || compacteLibre || ajustee; // largeur suivie à l'écran (largVue), pas celle enregistrée
  /* TAILLE DU TEXTE (v1.1, pdfShared.js#GRILLE) : px d'une page de 1000 px (`taille1000`) ; --lp = 1 % de la largeur de
     la page à l'échelle de référence de la boîte (10 px de référence = --lp). Sans champ : la taille d'avant (`tailleTexte`
     en %, sinon 13 px — 15 px pour une zone de texte — de référence), relue telle quelle.
     BORDURE et MARGES des boîtes créées depuis la v1.1 (`bord1000`, `pad1000`) : elles aussi en px d'une page de 1000 px. */
  const [apercuTaille, setApercuTaille] = useState(null);
  const tailleEff = taille1000De(boite, texteLibre ? 15 : 13, refW);
  const tailleVue = apercuTaille != null ? apercuTaille : Number.isFinite(boite.taille1000) || Number.isFinite(boite.tailleTexte) ? tailleEff : null;
  const styleCorps = tailleVue != null ? { fontSize: `calc(var(--lp) * ${+(tailleVue / 10).toFixed(4)})` } : undefined;
  const [apercuBord, setApercuBord] = useState(null);
  const avecBord = !texteLibre && (boite.fond === 'transparent' || boite.fond === 'teinte');
  const bord1000 = apercuBord != null ? apercuBord : Number.isFinite(boite.bord1000) ? boite.bord1000 : null;
  const style = {
    '--lp': (refW / 100) + 'px',
    ...(Array.isArray(boite.pad1000) ? { '--carte-px': (boite.pad1000[0] / PAGE_REF) * refW + 'px', '--carte-py': (boite.pad1000[1] / PAGE_REF) * refW + 'px' } : {}),
    left: b.x * 100 + '%', top: b.y * 100 + '%', minHeight: mot ? (boite.largeurFixe || redim ? b.height * refH : 0) : b.height * refH,
    ...(k !== 1 ? { scale: String(k), transformOrigin: '0 0' } : {}),
    ...(motLibre ? { width: 'max-content', minWidth: MOT.largeurMin, maxWidth: MOT.largeurMaxPage * refW }
      : compacteLibre ? { width: 'max-content', minWidth: Math.max(b.width * refW, COMPACT.largeurMin * ECHELLE_REF), maxWidth: Math.max(b.width, COMPACT.largeurMaxPage) * refW }
      : ajustee ? { width: 'max-content', maxWidth: b.width * refW } : { width: b.width * refW }),
    ...(boite.compacte && !mot ? { minHeight: Math.max(b.height * refH, COMPACT.hauteurMin * ECHELLE_REF) } : {}),
    ...(texteLibre
      ? { color: couleurHex(boite.couleur, '#1F1F24') }
      : (() => { const f = styleFondBoite(boite, fondNoir); if ((active || selectionne) && !boite.fond) delete f.borderColor; return f; })()),
    ...(avecBord && bord1000 != null ? { borderWidth: (bord1000 / PAGE_REF) * refW, '--carte-bord': (bord1000 / PAGE_REF) * refW + 'px' } : {}),
  };

  const bLarg = refW ? (libre && largVue ? largVue : b.width * refW) / refW : b.width; // largeur affichée (fraction de page)
  const bHaut = mot && hautVue ? (hautVue * k) / (pageHeight || 1) : Math.max(b.height, (hautVue * k) / (pageHeight || 1)); // hauteur affichée
  // cadre AFFICHÉ (fractions de page), signalé à la page : une flèche rattachée à cette boîte finit sur son bord
  useEffect(() => { if (onCadre) onCadre(boite.id, boite.reduite ? null : { x: b.x, y: b.y, w: bLarg, h: bHaut }); }, [b.x, b.y, bLarg, bHaut, boite.reduite]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (onCadre) onCadre(boite.id, null); }, [boite.id]); // eslint-disable-line react-hooks/exhaustive-deps
  /* ÉPINGLE (ancre) d'avant le 20/10 : le point de la fiche auquel la boîte se rapporte ; une boîte épinglée ET réduite
     devient une pastille posée SUR ce passage. */
  const extrait = extraitBrut || 'Boîte vide';
  const [pointApercu, setPointApercu] = useState(null); // position pendant le glisser d'une épingle / pastille / d'un bout
  const ancreBrute = boite.ancre && Number.isFinite(boite.ancre.x) && Number.isFinite(boite.ancre.y) ? boite.ancre : null;
  const ancre = ancreBrute && pointApercu && pointApercu.cible === 'ancre' ? { ...ancreBrute, ...pointApercu } : ancreBrute;
  const titreAncre = ancre ? (ancre.texte ? `Épinglée sur « ${ancre.texte} »` : 'Épinglée à cet endroit') : '';

  /* GLISSER UN POINT (l'épingle, la pastille d'une boîte réduite, ou un BOUT de flèche) — un simple clic garde son
     sens ; relâché sur une autre boîte, le bout d'une flèche s'y rattache (le départ : la flèche change de boîte). */
  const glisserPoint = (e, { cible, depart, surClic }) => {
    const r = rectPage(e.currentTarget);
    if (!r || !r.width || !r.height) return;
    const d0 = { x: e.clientX, y: e.clientY };
    let dernier = null;
    const move = (ev) => {
      dernier = { x: clamp01(depart.x + (ev.clientX - d0.x) / r.width), y: clamp01(depart.y + (ev.clientY - d0.y) / r.height), cx: ev.clientX, cy: ev.clientY };
      setPointApercu({ cible, x: dernier.x, y: dernier.y });
    };
    const up = (ev, { bouge, annule }) => {
      onGeste(false);
      setPointApercu(null);
      if (annule) return;
      if (!bouge || !dernier) { if (surClic) surClic(); return; }
      const texte = texteProche ? texteProche(dernier.cx, dernier.cy) : null;
      if (cible === 'ancre') { // épingle SANS flèche (ancien modèle) : son repère se déplace comme avant
        onModifier(boite, { ancre: { x: dernier.x, y: dernier.y, texte } }, 'Déplacement de l’épingle');
      } else if (cible.startsWith('fl:')) { // bout d'une flèche : rattaché à la boîte sous le pointeur, ou libre
        const sous = boiteSous(dernier.cx, dernier.cy, boite.id);
        onModifier(boite, patchRattacher(boite, cible.slice(3), sous, { x: dernier.x, y: dernier.y, texte: sous ? null : texte }), sous ? 'Flèche rattachée à une boîte' : 'Déplacement d’une flèche');
      } else if (cible.startsWith('dep:')) { // départ d'une flèche relâché sur une autre boîte : elle en part désormais
        const sous = boiteSous(dernier.cx, dernier.cy, boite.id);
        if (sous && onTransferer) onTransferer(boite, cible.slice(4), sous);
      } else { // pastille d'une boîte NON épinglée : la boîte rouvrira à cet endroit
        onModifier(boite, { x: clamp(dernier.x, 0, 1 - boite.width), y: clamp(dernier.y, 0, 1 - boite.height) }, 'Déplacement de la boîte réduite');
      }
    };
    if (suivrePointeur(e, { seuil: 4, arreter: true, glisser: true, move, fin: up })) onGeste(true);
  };
  const rouvrir = () => onModifier(boite, { reduite: false }, 'Réouverture de la boîte');
  const couleurBoite = couleurHex(boite.couleur);
  const [ctlApercu, setCtlApercu] = useState(null); // point de contrôle en cours de glisser : { id, points }
  const [translApercu, setTranslApercu] = useState(null); // flèche entière en cours de glisser : { id, dx, dy }

  // (22/10) hooks de la mini barre, AVANT le rendu en pastille (même nombre de hooks dans les deux cas)
  useSuiviEditeur(active && editor && !editor.isDestroyed && !grille ? editor : null);
  const celluleRef = useRef(null); // boîte-tableau : la cellule qui a le curseur (+ ligne / + colonne s'y ajoutent)
  useEffect(() => { if (!active) celluleRef.current = null; }, [active]); // hors édition : à la fin du tableau
  if (boite.reduite && !texteLibre) {
    const pos = pointApercu && pointApercu.cible === 'pastille' ? pointApercu : (ancre || { x: b.x, y: b.y });
    const cible = ancre ? 'ancre' : 'pastille';
    return (
      <button type="button" className={'nb-pastille sel-objet' + (pointApercu ? ' glisse' : '')}
        style={{ left: pos.x * 100 + '%', top: pos.y * 100 + '%', background: couleurBoite }}
        title={`« ${extrait.slice(0, 100)}${extrait.length > 100 ? '…' : ''} »${ancre && ancre.texte ? `\n${titreAncre}` : ''}\nClic : rouvrir · Glisser : déplacer`}
        onPointerDown={(e) => glisserPoint(e, { cible, depart: ancre ? { x: ancre.x, y: ancre.y } : { x: b.x, y: b.y }, surClic: rouvrir })}
        onClick={(e) => e.stopPropagation()}>
        <IconeEpingle size={18} />
      </button>
    );
  }

  /* FLÈCHES DE LA BOÎTE (30/09 ; une seule implémentation depuis le 21/10 : pdf/flechesGeo.js + pdf/Fleche.jsx) :
     chaque connecteur part du BORD de la boîte AFFICHÉE, passe par ses points de contrôle et finit au rond de sa cible
     — ou au bord de la boîte à laquelle il est rattaché. Gestes, les mêmes que pour les flèches de l'outil Formes :
     clic sur le trait = sélection ; glisser le trait = TOUTE la flèche (le départ et un bout rattaché restent
     accrochés) ; glisser un point = ce point ; double-clic sur le trait = un point à cet endroit, sur un point = le
     retirer ; glisser un bout = le déplacer, et le rattacher à une boîte si on le relâche dessus. */
  const cadreBoite = () => ({ x: b.x * pageWidth, y: b.y * pageHeight, w: bLarg * pageWidth, h: bHaut * pageHeight });
  const connecteurs = connecteursDe(boite).map((c) => {
    if (pointApercu && pointApercu.cible === 'fl:' + c.id) return { ...c, x: pointApercu.x, y: pointApercu.y, boiteCible: null };
    if (translApercu && translApercu.id === c.id) {
      const t = (p) => ({ ...p, x: p.x + translApercu.dx, y: p.y + translApercu.dy });
      return { ...c, ...(c.boiteCible ? {} : t(c)), ...(Array.isArray(c.points) && c.points.length ? { points: c.points.map(t) } : {}) };
    }
    return c;
  });
  const pinSeule = epingleSeule(boite);
  const geoConn = (c, sel) => {
    if (!pageWidth || !pageHeight) return null;
    const points = ctlApercu && ctlApercu.id === c.id ? ctlApercu.points : null;
    const cc = c.boiteCible && cadres && cadres[c.boiteCible];
    const pts = sommetsConnecteur(cadreBoite(), c, pageWidth, pageHeight, k, points, cc ? { x: cc.x * pageWidth, y: cc.y * pageHeight, w: cc.w * pageWidth, h: cc.h * pageHeight } : null);
    if (!pts) return null;
    const st = styleFleche(points ? { ...c, points } : c);
    const harmo = harmonisee(c);
    // dessin harmonisé (21/10) : le trait d'une bordure de boîte (1,5 px à 160 %), la couleur de la boîte ; flèches
    // d'avant : 2 px, la teinte foncée de la boîte — exactement leur rendu d'alors
    const base = Number.isFinite(c.ep1000) ? (c.ep1000 / PAGE_REF) * pageWidth : (harmo ? 1.5 : 2) * k * st.epaisseur; // (v1.1) px d'une page de 1000 px
    const defaut = harmo ? couleurBoite : couleurFoncee(boite.couleur);
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return { pts, st, harmo, c, largeur: base * (sel ? 1.5 : 1), geo: geoPointe(c, base, { k }), couleurDefaut: defaut, couleur: st.couleur ? couleurHex(st.couleur, defaut) : defaut,
      boite: { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } };
  };
  const geos = new Map(connecteurs.map((c) => [c.id, geoConn(c, false)]));
  const selVisible = selConn && geos.get(selConn) ? selConn : null;
  const ajouterPoint = (c, clientX, clientY, r) => {
    const g = geoConn(c, false);
    const points = g && pointsAvecAjout(g.pts, g.st, clientX, clientY, r, pageWidth, pageHeight);
    if (!points) return;
    onSelConn(c.id);
    onModifier(boite, patchStyle(boite, c.id, { points }), 'Point ajouté à la flèche');
  };
  const glisserCtl = (e, c, i) => glisserPointFleche(e, { points: styleFleche(c).points, i, onGeste,
    onApercu: (pts) => setCtlApercu(pts ? { id: c.id, points: pts } : null),
    onFin: (pts) => onModifier(boite, patchStyle(boite, c.id, { points: pts }), 'Point de la flèche déplacé') });
  const retirerPoint = (c, i) => onModifier(boite, patchStyle(boite, c.id, { points: styleFleche(c).points.filter((_, j) => j !== i) }), 'Point de la flèche retiré');
  // glisser le TRAIT : toute la flèche ; un simple clic la sélectionne ; appui long au doigt = un point
  const appuiTrait = (e, c) => {
    if (e.button !== 0) return;
    const r = rectPage(e.currentTarget);
    if (!r || !r.width) return;
    onSelConn(c.id);
    const a = document.activeElement;
    if (a && a.blur && a !== document.body && boiteRef.current && boiteRef.current.contains(a)) a.blur(); // Suppr ira à la flèche
    appuiLong(e, (x, y, rr) => ajouterPoint(c, x, y, rr));
    const x0 = e.clientX, y0 = e.clientY;
    let dernier = null;
    const suivi = suivrePointeur(e, {
      seuil: 4, arreter: true, glisser: true,
      move: (ev) => { dernier = { id: c.id, dx: (ev.clientX - x0) / r.width, dy: (ev.clientY - y0) / r.height }; setTranslApercu(dernier); },
      fin: (ev, { bouge, annule }) => { onGeste(false); setTranslApercu(null); if (!annule && bouge && dernier) onModifier(boite, patchTranslater(boite, c.id, dernier.dx, dernier.dy), 'Déplacement de la flèche'); },
    });
    if (suivi) onGeste(true);
  };

  /* LA MINI BARRE (pdf/Selection.jsx) — la même pour tous les objets. (22/10, docs/compte-rendu-simplification-outils.md)
     Elle porte aussi la mise en forme du texte (l'ancienne grande barre au-dessus de la diapo, pdf/FormatTexte.jsx) :
       boîte, post-it : taille · couleur du texte · fond · G · I · alignement · flèche · → Tableau · « … » · supprimer
       boîte-tableau  : taille · couleur du texte · fond · G · I · + ligne · + colonne · − ligne · − colonne · en-tête ·
                        flèche · → Tableau · « … » · supprimer
       texte libre    : taille · couleur · G · I · alignement · « … » · supprimer
     En édition, une action de texte vaut pour la sélection (s'il y en a une), sinon pour tout le texte de la boîte.
     Pendant la visée d'une flèche : « Annuler ». */
  const ancreBarre = { x: b.x * pageWidth, y: b.y * pageHeight, w: bLarg * pageWidth, h: bHaut * pageHeight };
  const deuxVersions = aDeuxVersions(boite);
  const version = versionAffichee(boite);
  const iFond = Math.max(0, FONDS_BOITE.findIndex((f) => f.id === (boite.fond || 'plein')));
  const fondSuivant = FONDS_BOITE[(iFond + 1) % FONDS_BOITE.length];
  const ouvert = active && editor && !editor.isDestroyed && !grille ? editor : null;
  const surSelection = !!ouvert && !ouvert.state.selection.empty;
  const fmt = grille ? null : elementsFormat({ editor: ouvert, contenu: boite.content, onContenu: (json, lib) => onModifier(boite, { content: json }, lib) });
  const itemTaille = { cle: 'taille', element: <BoutonTaille genre="texte" valeur={tailleEff} echelle={(refW * k) / PAGE_REF} onApercu={surSelection ? null : setApercuTaille}
    onChange={(v) => {
      // une sélection dans le texte : sa taille seulement (px d'une page de 1000 px, --lp) ; sinon toute la boîte
      if (surSelection) { ouvert.chain().focus().setFontSize(`calc(var(--lp) * ${+(v / 10).toFixed(4)})`).run(); return; }
      ecrireTaille('texte', v); onModifier(boite, champsTaille(v), 'Taille du texte');
    }} /> };
  // bordure d'une boîte transparente ou teintée (px d'une page de 1000 px ; une boîte d'avant : sa bordure de 1,5 px de référence)
  const itemBordure = avecBord ? { cle: 'bordure', titre: 'Épaisseur de la bordure', element: <BoutonTaille genre="bordure" valeur={Number.isFinite(boite.bord1000) ? boite.bord1000 : +((1.5 / (refW || 1)) * PAGE_REF).toFixed(2)}
    echelle={(refW * k) / PAGE_REF} couleur={couleurHex(boite.couleur)} onApercu={setApercuBord}
    onChange={(v) => { ecrireTaille('bordure', v); onModifier(boite, { bord1000: v }, 'Bordure de la boîte'); }} /> } : null;
  const icL = (n, t = 16) => <IconeOutil nom={n} size={t} />;
  const itemVerrou = { cle: 'verrou', icone: icL(verrou ? 'cadenas' : 'cadenasOuvert'), actif: verrou, libelle: verrou ? 'Déverrouiller' : 'Verrouiller',
    titre: verrou ? 'Verrouillée — cliquer pour déverrouiller' : 'Verrouiller : la boîte ne bouge plus',
    onClick: () => onModifier(boite, { verrouille: !verrou }, verrou ? 'Boîte déverrouillée' : 'Boîte verrouillée') };
  const itemSupprimer = { cle: 'supprimer', titre: `${texteLibre ? 'Supprimer ce texte' : 'Supprimer la boîte'} (annulable par ${RACCOURCI_Z})`, onClick: () => onSupprimer(boite) };
  // couleur du texte : sélection (éditeur) ; sinon zone de texte = sa couleur, boîte-tableau = la couleur de son texte
  const itemCouleurTexte = texteLibre
    ? (surSelection ? fmt.couleur : { cle: 'couleur', couleur: boite.couleur, titre: 'Couleur du texte', icone: <span className="et-lettre" aria-hidden="true">A</span>, onApercu, onCouleur: (c) => onModifier(boite, { couleur: c }, 'Couleur du texte') })
    : grille ? { cle: 'couleur-texte', couleur: boite.couleurTexte || null, titre: 'Couleur du texte', icone: <span className="et-lettre" aria-hidden="true">A</span>, aucune: true,
      onCouleur: (c) => onModifier(boite, { couleurTexte: c === AUCUNE ? null : c }, 'Couleur du texte') }
      : fmt.couleur;
  const itemsFond = [
    { cle: 'couleur', couleur: boite.couleur, titre: boite.postit ? 'Couleur du post-it' : 'Fond de la boîte (couleur)', onApercu, onCouleur: (c) => onModifier(boite, { couleur: c }, 'Couleur de la boîte') },
    { cle: 'fond', icone: <span className={'nb-fond-ic ' + FONDS_BOITE[iFond].id} style={{ '--c': couleurBoite }} aria-hidden="true" />,
      titre: `Fond : ${FONDS_BOITE[iFond].label.toLowerCase()} — cliquer pour « ${fondSuivant.label.toLowerCase()} » (plein → transparent → teinté)`,
      onClick: () => { ecrireFondBoiteDefaut(fondSuivant.id); onModifier(boite, { fond: fondSuivant.id }, 'Fond de la boîte'); } },
  ];
  const itemsActions = [
    { cle: 'fleche', icone: <Icon name="arrowR" size={15} />, titre: 'Ajouter une flèche : clique ensuite l’endroit, le surlignage, la forme ou la boîte visés', onClick: () => onDemanderAncrage(boite.id, { ajout: true }) },
    onVersTableau && { cle: 'vers-tableau', icone: icL('versTableau'), actif: auTableau, titre: auTableau ? 'Déjà sur le tableau de la fiche — l’y montrer' : '→ Tableau : ajouter cette boîte au tableau de la fiche (même contenu, même couleur)', onClick: () => onVersTableau(boite) },
  ];
  const majGrille = (g, lib) => onModifier(boite, { grille: g, content: contenuGrille(g) }, lib);
  const itemsGrille = grille ? (() => {
    const c = celluleRef.current, gi = c ? c.i : grille.lignes.length - 1, gj = c ? c.j : grille.cols.length - 1;
    return [
      { cle: 'gras', icone: icL('gras', 15), titre: 'Gras (tout le tableau)', actif: !!boite.gras, onClick: () => onModifier(boite, { gras: !boite.gras }, 'Gras') },
      { cle: 'italique', icone: icL('italique', 15), titre: 'Italique (tout le tableau)', actif: !!boite.italique, onClick: () => onModifier(boite, { italique: !boite.italique }, 'Italique') },
      { cle: '|' },
      { cle: 'ligne+', icone: icL('ligneAjout'), titre: 'Ajouter une ligne', desactive: grille.lignes.length >= LIMITES_GRILLE.ligMax, onClick: () => majGrille(ajouterLigne(grille, gi), 'Ligne ajoutée') },
      { cle: 'colonne+', icone: icL('colonneAjout'), titre: 'Ajouter une colonne', desactive: grille.cols.length >= LIMITES_GRILLE.colMax, onClick: () => majGrille(ajouterColonne(grille, gj), 'Colonne ajoutée') },
      { cle: 'ligne-', icone: icL('ligneMoins'), titre: 'Supprimer la ligne', desactive: grille.lignes.length <= LIMITES_GRILLE.ligMin, onClick: () => { celluleRef.current = null; majGrille(retirerLigne(grille, gi), 'Ligne supprimée'); } },
      { cle: 'colonne-', icone: icL('colonneMoins'), titre: 'Supprimer la colonne', desactive: grille.cols.length <= LIMITES_GRILLE.colMin, onClick: () => { celluleRef.current = null; majGrille(retirerColonne(grille, gj), 'Colonne supprimée'); } },
      { cle: 'entete', icone: icL('entete'), actif: !!grille.entete, titre: grille.entete ? 'Ligne d’en-tête : oui — cliquer pour la retirer' : 'Ligne d’en-tête : non — cliquer pour la première ligne en gras', onClick: () => majGrille({ ...grille, entete: !grille.entete }, 'En-tête du tableau') },
    ];
  })() : null;
  const iAlignG = Math.max(0, ALIGNEMENTS.findIndex((a) => a.id === (boite.align || 'left')));
  const alignGrille = { cle: 'align', icone: icL(ALIGNEMENTS[iAlignG].icone), titre: `Alignement : ${ALIGNEMENTS[iAlignG].label}`,
    onClick: () => onModifier(boite, { align: ALIGNEMENTS[(iAlignG + 1) % ALIGNEMENTS.length].id }, 'Alignement') };
  const itemsBoite = enAncrage ? [{ cle: 'vise', libelle: 'Clique ce que la flèche vise… · Annuler', titre: 'Annuler (Échap)', onClick: () => onDemanderAncrage(null) }]
    : texteLibre ? [
      itemTaille, itemCouleurTexte,
      { cle: '|' },
      fmt.gras, fmt.italique, fmt.align,
      { cle: '|' },
      { cle: '…', plus: [fmt.police, fmt.souligne, fmt.barre, fmt.fond, fmt.puces, fmt.numeros, { cle: '|' }, itemVerrou] },
      itemSupprimer,
    ] : grille ? [
      itemTaille, itemCouleurTexte, ...itemsFond,
      { cle: '|' },
      ...itemsGrille,
      { cle: '|' },
      ...itemsActions,
      { cle: '…', plus: [alignGrille, itemBordure, { cle: '|' }, { cle: 'reduire', icone: icL('reduire'), libelle: 'Réduire en pastille', titre: 'Réduire en pastille', onClick: () => onModifier(boite, { reduite: true }, 'Réduction de la boîte') }, itemVerrou] },
      itemSupprimer,
    ] : [
      itemTaille, itemCouleurTexte, ...itemsFond,
      { cle: '|' },
      fmt.gras, fmt.italique, fmt.align,
      { cle: '|' },
      ...itemsActions,
      { cle: '…', plus: [fmt.police, fmt.souligne, fmt.barre, fmt.fond, fmt.puces, fmt.numeros, itemBordure, { cle: '|' },
        { cle: 'reduire', icone: icL('reduire'), libelle: 'Réduire en pastille', titre: 'Réduire en pastille : un clic sur la pastille rouvre la boîte, un glisser la déplace', onClick: () => onModifier(boite, { reduite: true }, 'Réduction de la boîte') },
        itemVerrou] },
      itemSupprimer,
    ];
  const enGeste = !!apercu;
  const cSel = selVisible && connecteurs.find((x) => x.id === selVisible);
  const gSel = cSel && geoConn(cSel, true);

  return (
    <>
    {connecteurs.length > 0 && (
      <svg className="nb-fleche" viewBox={`0 0 ${pageWidth} ${pageHeight}`} preserveAspectRatio="none" aria-hidden="true">
        {connecteurs.map((c) => {
          const sel = selVisible === c.id;
          const g = sel ? gSel : geos.get(c.id);
          if (!g) return null;
          return (
            <TraitFleche key={c.id} pts={g.pts} st={g.st} largeur={g.largeur} geo={g.geo} couleur={g.couleur} sel={sel} halo={9 * k} idMarqueur={'pointe-' + boite.id + '-' + c.id}
              classes={{ g: 'nb-conn sel-objet' + (sel ? ' sel' : ''), halo: 'nb-conn-halo', trait: 'nb-conn-trait', tete: 'nb-conn-tete', cible: 'nb-conn-cible' }}
              donnees={{ 'data-conn': c.id }}
              titre="Flèche — clic : la sélectionner · glisser : la déplacer · double-clic : ajouter un point"
              /* zone de prise large et invisible (outil Sélection seulement : ne gêne ni le crayon ni la gomme) */
              cible={flechesInteractives ? { strokeWidth: Math.max(14, 12 * k), onPointerDown: (e) => appuiTrait(e, c),
                onDoubleClick: (e) => { e.preventDefault(); e.stopPropagation(); ajouterPoint(c, e.clientX, e.clientY, rectPage(e.currentTarget)); } } : null} />
          );
        })}
      </svg>
    )}
    {gSel && (<>
      <PoigneesFleche points={ctlApercu && ctlApercu.id === cSel.id ? ctlApercu.points : gSel.st.points} couleur={gSel.couleur} classe="nb-ctl sel-zone" donnees={{ 'data-conn': cSel.id }}
        position={(p) => ({ left: p.x * 100 + '%', top: p.y * 100 + '%' })}
        onGlisser={(e, i) => glisserCtl(e, cSel, i)} onRetirer={(i) => retirerPoint(cSel, i)} onTrait={(e) => appuiTrait(e, cSel)} />
      {/* les deux bouts : le départ (sur la boîte) se glisse sur une autre boîte, l'arrivée se déplace ou se rattache */}
      <span className="fl-bout sel-zone" data-bout="debut" data-conn={cSel.id} style={{ left: (gSel.pts[0].x / pageWidth) * 100 + '%', top: (gSel.pts[0].y / pageHeight) * 100 + '%' }}
        title="Départ — glisser sur une autre boîte pour que la flèche en parte"
        onPointerDown={(e) => glisserPoint(e, { cible: 'dep:' + cSel.id, depart: { x: gSel.pts[0].x / pageWidth, y: gSel.pts[0].y / pageHeight } })} />
      {(gSel.harmo || cSel.boiteCible) && (
        <span className="fl-bout sel-zone" data-bout="fin" data-conn={cSel.id} style={{ left: (gSel.pts[gSel.pts.length - 1].x / pageWidth) * 100 + '%', top: (gSel.pts[gSel.pts.length - 1].y / pageHeight) * 100 + '%' }}
          title="Arrivée — glisser pour la déplacer, relâcher sur une boîte pour l’y rattacher"
          onPointerDown={(e) => { const p = gSel.pts[gSel.pts.length - 1]; glisserPoint(e, { cible: 'fl:' + cSel.id, depart: cSel.boiteCible ? { x: p.x / pageWidth, y: p.y / pageHeight } : { x: cSel.x, y: cSel.y } }); }} />
      )}
      {!enGeste && !translApercu && !ctlApercu && (
        <MiniBarre ancre={gSel.boite} pageWidth={pageWidth} pageHeight={pageHeight}
          items={itemsFleche(gSel.st, { couleurDefaut: gSel.couleurDefaut, onStyle: (patch, libelle) => onModifier(boite, patchStyle(boite, cSel.id, patch), libelle),
            ep: { valeur: epFleche1000(cSel, refW, gSel.harmo ? 1.5 : 2), echelle: pageWidth / PAGE_REF, champs: (v) => champsFleche1000(v, refW, gSel.harmo ? 1.5 : 2) },
            onSupprimer: () => { onSelConn(null); onModifier(boite, patchRetirer(boite, cSel.id), 'Flèche retirée'); } })} />
      )}
    </>)}
    {/* bouts des flèches d'avant (rond à la cible, toujours visible comme avant) ; harmonisées : seulement sélectionnées */}
    {connecteurs.filter((c) => !harmonisee(c) && !c.boiteCible).map((c) => (
      <span key={c.id} data-conn={c.id} className={'nb-ancre sel-objet' + (c.principale ? '' : ' nb-ancre-fl') + (pointApercu && pointApercu.cible === 'fl:' + c.id ? ' glisse' : '') + (selVisible === c.id ? ' sel' : '')}
        title={`${c.texte ? `Vise « ${c.texte} »` : 'Flèche'}\nClic : sélectionner · Glisser : déplacer (relâcher sur une boîte pour l’y rattacher)`}
        style={{ left: c.x * 100 + '%', top: c.y * 100 + '%', borderColor: couleurBoite }}
        onPointerDown={(e) => { const d = connecteursDe(boite).find((q) => q.id === c.id) || c; glisserPoint(e, { cible: 'fl:' + c.id, depart: { x: d.x, y: d.y }, surClic: () => onSelConn(c.id) }); }} />
    ))}
    {pinSeule && ancre && (
      <span className={'nb-ancre sel-objet' + (pointApercu && pointApercu.cible === 'ancre' ? ' glisse' : '')} title={`${titreAncre}\nGlisser pour déplacer l’épingle`}
        style={{ left: ancre.x * 100 + '%', top: ancre.y * 100 + '%', borderColor: couleurBoite }}
        onPointerDown={(e) => glisserPoint(e, { cible: 'ancre', depart: { x: ancreBrute.x, y: ancreBrute.y } })}>
        {(active || selectionne) && (
          <button type="button" className="nb-fl-x" title="Retirer l’épingle" aria-label="Retirer l’épingle"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onModifier(boite, patchRetirer(boite, 'principale'), 'Retrait de l’épingle'); }}>
            <Icon name="x" size={8} />
          </button>
        )}
      </span>
    )}
    {(selectionne || active || enAncrage) && !selVisible && !enGeste && (
      <MiniBarre ancre={ancreBarre} pageWidth={pageWidth} pageHeight={pageHeight} items={itemsBoite} classe={enAncrage ? 'vise' : ''} />
    )}
    <div ref={boiteRef} data-boite={boite.id} data-objet={boite.id}
      className={'note-box sel-objet' + (ajustee ? ' ajustee' : '') + (mot ? ' mot' : boite.compacte ? ' compacte' : '') + (carte ? ' carte' : '') + (!texteLibre && boite.fond ? ' fond-' + boite.fond : '') + (texteLibre ? ' texte-libre' : '') + (active ? ' active' : '') + (selectionne || active ? ' selectionnee' : '') + (enGeste ? ' en-geste' : '') + (enAncrage ? ' en-ancrage' : '') + (texteLibre && !extraitBrut ? ' vide' : '') + (boite.postit ? ' postit' : '') + (grille ? ' boite-tableau' : '') + (verrou ? ' verrouillee' : '')} style={style}
      onPointerDown={appui} onDoubleClick={(e) => { if (!active) { e.stopPropagation(); activer(e); } }}>
      {/* (21/10) plus de poignée de déplacement : le bandeau des boîtes d'avant reste un simple bandeau (même rendu),
          il ne porte plus que l'état (épinglée) et le badge « IA / orig. » */}
      {((!mot && !texteLibre) || deuxVersions) && (
        <div className="nb-bar" ref={barreRef}>
          {ancre && <span className="nb-etat" title={titreAncre}><IconeEpingle size={11} /></span>}
          {deuxVersions && (
            <button type="button" className={'nb-version' + (version === 'alt' ? '' : ' orig')}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); e.currentTarget.blur(); /* ⌘Z ira au journal du lecteur, pas à l'éditeur de la boîte */ onModifier(boite, { versionTexte: version === 'alt' ? 'original' : 'alt' }, 'Version du texte'); }}
              aria-label={version === 'alt' ? 'Version IA affichée — afficher le texte d’origine' : 'Texte d’origine affiché — afficher la version IA'}
              title={version === 'alt' ? 'Version IA affichée — cliquer pour le texte d’origine' : 'Texte d’origine affiché — cliquer pour la version IA'}>
              {version === 'alt' ? 'IA' : 'orig.'}
            </button>
          )}
        </div>
      )}

      {/* VERROU 4 : en édition, le corps est du TEXTE */}
      {/* (22/10) BOÎTE-TABLEAU : le tableau occupe le corps de la boîte (même typographie, même fond) */}
      {grille ? (
        <div className="nb-body" style={{ ...(styleCorps || {}), ...(boite.couleurTexte ? { color: couleurHex(boite.couleurTexte, '#1F1F24') } : {}),
          fontWeight: boite.gras ? 700 : undefined, fontStyle: boite.italique ? 'italic' : undefined, textAlign: boite.align || undefined }}>
          <BoiteTableau grille={grille} edition={active} focus={active ? clicRef.current : null} filets={(active || selectionne) && !verrou} echelle={k}
            onCellule={(i, j) => { celluleRef.current = { i, j }; }}
            onChange={(g, lib) => majGrille(g, lib)} onFin={() => onActivate(null)} />
        </div>
      ) : active && editor
        ? <div className="nb-body" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => {
            // CLIC N'IMPORTE OÙ (02/10) : hors des lignes de texte, le curseur va au point le plus proche
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
          }} style={styleCorps}><EditorContent editor={editor} /></div>
        : <div className="nb-body" style={styleCorps} data-vide={texteLibre ? 'Texte…' : undefined} dangerouslySetInnerHTML={{ __html: html }} />}

      {(selectionne || active) && (
        <CadreSelection contre={contre} onCoin={verrou ? null : (e, coin) => redimensionner(e, coin, {
          base: () => ({ x: boite.x, y: boite.y, width: bLarg, height: bHaut }),
          // minimum : un mot (40 × 24 px de référence) ; 48 × 24 px à 100 % pour une boîte compacte du 20/10 ; l'ancien minimum sinon
          min: mot ? { width: MOT.largeurMin / refW, height: MOT.hauteur / refH }
            : boite.compacte ? { width: fractionPx100(COMPACT.largeurMin, refW / ECHELLE_REF), height: fractionPx100(COMPACT.hauteurMin, refH / ECHELLE_REF) } : BOITE_MIN,
          onGeste,
          apercu: (rc) => { setRedim(!!rc); setApercu(rc ? { ...boite, ...rc } : null); },
          fin: (rc) => onMaj(boite, { ...boite, ...rc, largeurFixe: true }, 'Redimension de la boîte'),
        })} />
      )}
    </div>
    </>
  );
}

/* ============================================================
   « ? » — « je n'ai pas compris ce passage » (01/10). Un rond, posé d'un clic
   avec l'outil « ? ». Glisser = déplacer ; survol ou focus = une petite croix
   pour le retirer (Suppr aussi). Une entrée d'annulation par geste.
   ============================================================ */
function QuestionMarque({ q, onModifier, onSupprimer, onGeste, selectionne = false, onSelectionner = () => {}, pageWidth = 0, pageHeight = 0, k = 1 }) {
  /* (21/10) MÊME RÈGLE que tous les objets (pdf/Selection.jsx) : clic = sélection, glisser n'importe où = déplacement,
     4 coins = taille (`taille`, facteur du rond de 26 px), mini barre (supprimer) */
  const [apercu, setApercu] = useState(null);
  const pos = apercu || q;
  const taille = Number.isFinite(pos.taille) ? pos.taille : 1;
  const glisser = (e) => {
    const r = rectPage(e.currentTarget);
    if (!r || !r.width || !r.height) return;
    const d0 = { x: e.clientX, y: e.clientY }, deja = selectionne;
    let dernier = null;
    const move = (ev) => {
      dernier = { x: clamp01(q.x + (ev.clientX - d0.x) / r.width), y: clamp01(q.y + (ev.clientY - d0.y) / r.height) };
      setApercu({ ...q, ...dernier });
    };
    const up = (ev, { bouge, annule }) => {
      onGeste(false);
      setApercu(null);
      if (annule) return;
      if (bouge && dernier) onModifier(q, dernier, 'Déplacement du « ? »');
      if (!deja) onSelectionner();
    };
    if (suivrePointeur(e, { seuil: 4, arreter: true, glisser: true, move, fin: up })) onGeste(true);
  };
  const diam = 26 * taille * k; // px à l'écran (le rond suit --k, l'échelle des annotations)
  const ancre = { x: pos.x * pageWidth - diam / 2, y: pos.y * pageHeight - diam / 2, w: diam, h: diam };
  return (<>
    <span data-objet={q.id} className={'pdfr-question sel-objet' + (apercu ? ' glisse' : '') + (selectionne ? ' selectionnee' : '')}
      style={{ left: pos.x * 100 + '%', top: pos.y * 100 + '%', ...(taille !== 1 ? { '--pq': taille } : {}) }}>
      <button type="button" className="pq-rond" title="Je n'ai pas compris ce passage · clic : sélectionner · glisser : déplacer · Suppr : retirer"
        onPointerDown={glisser} onClick={(e) => e.stopPropagation()}>?
        {selectionne && <CadreSelection rond onCoin={(e, coin) => redimensionner(e, coin, {
          base: () => ({ x: q.x - diam / 2 / pageWidth, y: q.y - diam / 2 / pageHeight, width: diam / pageWidth, height: diam / pageHeight }),
          min: { width: (14 * k) / pageWidth, height: (14 * k) / pageHeight }, ratio: pageWidth / pageHeight, onGeste,
          apercu: (rc) => setApercu(rc ? { ...q, x: rc.x + rc.width / 2, y: rc.y + rc.height / 2, taille: Math.min(4, (rc.width * pageWidth) / (26 * k)) } : null),
          fin: (rc) => onModifier(q, { x: rc.x + rc.width / 2, y: rc.y + rc.height / 2, taille: +Math.min(4, (rc.width * pageWidth) / (26 * k)).toFixed(3) }, 'Taille du « ? »'),
        })} />}
      </button>
    </span>
    {selectionne && !apercu && (
      <MiniBarre ancre={ancre} pageWidth={pageWidth} pageHeight={pageHeight}
        items={[{ cle: 'supprimer', titre: `Retirer ce « ? » (annulable par ${RACCOURCI_Z})`, onClick: () => onSupprimer(q) }]} />
    )}
  </>);
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
const mesureMots = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
/** (21/10) une image ROGNÉE garde l'image entière : `rognage` { x, y, w, h } = la partie visible, en fractions de l'image ;
    son cadre (x, y, width, height) est cette partie. L'image entière, en fractions de page : */
export function imageEntiere(img) {
  return entiereDepuisCadre(img, img.rognage || null); // (24/10) calcul commun : lib/rognageImage.js
}
/* (24/10) une image qui touche ou dépasse un bord de la page : le calque des images (overflow: hidden) coupait la moitié
   extérieure de ses poignées (souvent introuvables). Leur position est ramenée au bord VISIBLE de la page. */
function bordsPoignees(g, W, H) {
  if (!W || !H) return undefined;
  const s = {};
  if (g.x < 0.006) s['--sel-g'] = Math.max(0, -g.x * W) + 'px';
  if (g.y < 0.006) s['--sel-h'] = Math.max(0, -g.y * H) + 'px';
  if (g.x + g.width > 0.994) s['--sel-d'] = Math.max(0, (g.x + g.width - 1) * W) + 'px';
  if (g.y + g.height > 0.994) s['--sel-b'] = Math.max(0, (g.y + g.height - 1) * H) + 'px';
  return s;
}
function ImageCollee({ img, active, onActiver, onMaj, onModifier, onSupprimer, onGeste, onApercu = () => {}, pageWidth = 0, pageHeight = 0,
  outil = 'main', surlignages = EMPTY_ARRAY, couleurSurligneur = 'jaune-franc', onSurligner = () => {}, onFlashcard = () => {} }) {
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
  /* GESTE UNIQUE (21/10, pdf/Selection.jsx) : clic = sélection, glisser n'importe où = déplacement, 4 coins =
     redimension (proportions gardées, Maj = libre) ; verrouillée : sélection seulement.
     (24/10, docs/compte-rendu-seance-categories.md § 2) AVANT : `redimRect` était appelé ici sans être importé —
     chaque glisser d'un coin levait « ReferenceError: redimRect is not defined » (redimension ET rognage morts,
     sans rien à l'écran ; le build ne le voit pas). Le rognage se fait désormais dans le CADRE DE ROGNAGE commun
     (lib/rognageImage.js ouvrirRognage : Entrée valide, Échap annule, non destructif). */
  const [rogne, setRogne] = useState(false);
  const rognage = useRef(null);
  useEffect(() => { if (!active && rognage.current) rognage.current.valider(); }, [active]);
  useEffect(() => () => { if (rognage.current) rognage.current.annuler(); }, []);
  const rogner = () => {
    if (rognage.current) { rognage.current.valider(); return; }
    if (!cadreRef.current || !url) return;
    const avant = img;
    setRogne(true);
    rognage.current = ouvrirRognage({
      cadreEl: cadreRef.current, url, rognage: avant.rognage || null,
      onValider: (n) => { rognage.current = null; setRogne(false); onMaj(avant, { ...avant, ...cadreApresRognage(avant, avant.rognage || null, n), rognage: n }, n ? 'Rognage de l’image' : 'Image entière'); },
      onAnnuler: () => { rognage.current = null; setRogne(false); },
    });
  };
  const geste = (e, type) => {
    const r = rectPage(e.currentTarget);
    if (!r || !r.width || !r.height) return;
    const d0 = { x: e.clientX, y: e.clientY };
    const avant = img, deja = active, bloque = !!img.verrouille;
    const ratio = avant.width ? avant.height / avant.width : 1; // proportions en coordonnées normalisées
    // une image d'avant le 21/10 peut être pivotée : les coins travaillent dans son repère tourné (coin opposé fixe)
    const rot = avant.rotation || 0, th = (rot * Math.PI) / 180, cosT = Math.cos(th), sinT = Math.sin(th);
    let courant = null;
    const move = (ev) => {
      if (bloque) return;
      const dx = (ev.clientX - d0.x) / r.width, dy = (ev.clientY - d0.y) / r.height;
      if (type === 'move') {
        courant = { ...avant, x: clamp(avant.x + dx, -avant.width * 0.8, 1 - avant.width * 0.2), y: clamp(avant.y + dy, -avant.height * 0.8, 1 - avant.height * 0.2) };
      } else if (!rot) {
        courant = { ...avant, ...redimRectImage(avant, type, dx, dy, { min: { width: 0.03, height: 0.03 * ratio }, ratio, libre: ev.shiftKey }) };
      } else {
        const sx = type.includes('e') ? 1 : -1, sy = type.includes('s') ? 1 : -1;
        const px = ev.clientX - d0.x, py = ev.clientY - d0.y;
        const lx = (px * cosT + py * sinT) / r.width, ly = (-px * sinT + py * cosT) / r.height;
        const w = clamp(avant.width + Math.max(sx * lx, (sy * ly) / (ratio || 1)), 0.03, 2), h = w * ratio;
        const W = r.width, H = r.height, R = (vx, vy) => [vx * cosT - vy * sinT, vx * sinT + vy * cosT];
        const C = [(avant.x + avant.width / 2) * W, (avant.y + avant.height / 2) * H];
        const o = R(-sx * avant.width * W / 2, -sy * avant.height * H / 2), n = R(sx * w * W / 2, sy * h * H / 2);
        courant = { ...avant, width: w, height: h, x: (C[0] + o[0] + n[0]) / W - w / 2, y: (C[1] + o[1] + n[1]) / H - h / 2 };
      }
      setApercu(courant);
      onApercu(courant);
    };
    const up = (ev, { bouge, annule }) => {
      onGeste(false);
      setApercu(null);
      onApercu(null);
      if (!annule && bouge && courant) onMaj(avant, courant, type === 'move' ? 'Déplacement de l’image' : 'Redimension de l’image');
    };
    if (!suivrePointeur(e, { seuil: 3, arreter: true, glisser: type === 'move', move, fin: up })) return;
    onGeste(true);
    if (!deja) onActiver(img.id);
    if (cadreRef.current) cadreRef.current.focus({ preventScroll: true });
  };
  const stop = (fn) => ({ onPointerDown: (e) => e.stopPropagation(), onClick: (e) => { e.stopPropagation(); fn(); } });

  /* TEXTE DE L'IMAGE (09/10) : OCR en arrière-plan (ocr/ocrImage.js, mis en cache par blob),
     mots posés en calque transparent EN FRACTIONS DE L'IMAGE — ils suivent zoom, taille et
     rotation. Surligneur : balayer les mots les surligne (repasser : retirer / recolorer).
     Sélection : sur une image non sélectionnée, glisser sur les mots sélectionne le texte
     (bulle Notion · Flashcard · Copier) ; ailleurs — ou image sélectionnée — on la déplace. */
  const [ocr, setOcr] = useState(null);
  useEffect(() => {
    if (!img.blobId) return undefined;
    let vivant = true;
    ocrImage({ blobId: img.blobId }).then((r) => { if (vivant && r && r.mots && r.mots.length) setOcr(r); }).catch(() => {});
    return () => { vivant = false; };
  }, [img.blobId]);
  // (21/10) outil Sélection : glisser sur l'image la DÉPLACE (règle de tous les objets) ; ses mots se surlignent au Surligneur
  const motsVivants = !!ocr && outil === 'surligneur';
  const calqueRef = useRef(null);
  const [bulle, setBulle] = useState(null); // { x, y, ids }
  const gF = imageEntiere(g);
  const Wpx = gF.width * pageWidth, Hpx = gF.height * pageHeight;
  const tailles = useMemo(() => {
    if (!ocr || !mesureMots || !Wpx || !Hpx) return [];
    return ocr.mots.map((m) => {
      const fs = Math.max(3, m.h * Hpx * 0.86);
      mesureMots.font = `${fs}px sans-serif`;
      const l = mesureMots.measureText(m.t).width || 1;
      return { fs, sx: (m.w * Wpx) / l };
    });
  }, [ocr, Wpx, Hpx]);
  const motsSelectionnes = () => {
    const sel = window.getSelection();
    const cal = calqueRef.current;
    if (!sel || sel.isCollapsed || !sel.rangeCount || !cal || !cal.contains(sel.anchorNode)) return [];
    const r = sel.getRangeAt(0);
    return [...cal.children].filter((sp) => sp.firstChild && r.intersectsNode(sp.firstChild) && !(r.endContainer === sp.firstChild && r.endOffset === 0) && !(r.startContainer === sp.firstChild && r.startOffset >= sp.firstChild.length - 1 && sp.firstChild.length > 1)).map((sp) => Number(sp.dataset.i));
  };
  const F0 = imageEntiere(img);
  const rectsPage = (ids) => ids.map((i) => ocr.mots[i]).filter(Boolean).map((m) => ({ x: F0.x + m.x * F0.width, y: F0.y + m.y * F0.height, width: m.w * F0.width, height: m.h * F0.height }));
  const texteDe = (ids) => ids.map((i) => ocr.mots[i] && ocr.mots[i].t).filter(Boolean).join(' ');
  const surligner = (ids, couleur, opts) => onSurligner({ img, page: img.page, mots: ids, texte: texteDe(ids), rects: rectsPage(ids), texteDe, rectsDe: rectsPage }, couleur, opts);
  const appuiMots = (e) => {
    if (!motsVivants || (e.button && e.button !== 0) || !(e.target.classList && e.target.classList.contains('pi-mot'))) return;
    e.stopPropagation(); // pas de déplacement de l'image : on sélectionne son texte
    setBulle(null);
    try { window.getSelection().removeAllRanges(); } catch (x) { /* ignore */ }
    const fin = () => {
      window.removeEventListener('pointerup', fin, true);
      setTimeout(() => {
        const ids = motsSelectionnes();
        if (!ids.length) return;
        if (outil === 'surligneur') { surligner(ids, couleurSurligneur); window.getSelection().removeAllRanges(); return; }
        const r = window.getSelection().getRangeAt(0).getBoundingClientRect();
        setBulle({ x: (r.left + r.right) / 2, y: r.top - 8, ids });
      }, 0);
    };
    window.addEventListener('pointerup', fin, true);
  };
  useEffect(() => {
    if (!bulle) return undefined;
    const dehors = (e) => { if (!(e.target.closest && e.target.closest('.pi-bulle'))) setBulle(null); };
    window.addEventListener('pointerdown', dehors, true);
    return () => window.removeEventListener('pointerdown', dehors, true);
  }, [bulle]);
  const motsSurlignes = surlignages.flatMap((h) => (h.mots || []).map((i) => ({ h, m: ocr && ocr.mots[i], i }))).filter((x) => x.m);

  return (<>
    <div ref={cadreRef} tabIndex={0} data-objet={img.id} className={'pdfr-image sel-objet' + (active ? ' active' : '') + (apercu ? ' glisse' : '') + (img.verrouille ? ' verrouillee' : '') + (rogne ? ' rognage' : '')}
      style={{ left: g.x * 100 + '%', top: g.y * 100 + '%', width: g.width * 100 + '%', height: g.height * 100 + '%', ...bordsPoignees(g, pageWidth, pageHeight) }}
      onPointerDown={(e) => geste(e, 'move')}
      title="Image collée · clic : sélectionner · glisser : déplacer · coins : redimensionner · Suppr : retirer">
      {/* le CORPS pivote (image d'avant le 21/10 pivotée) ; il ne montre que la partie rognée de l'image entière */}
      <div className={'pdfr-image-corps' + (g.rognage ? ' rognee' : '')} style={g.rotation ? { transform: `rotate(${g.rotation}deg)` } : undefined}>
      <div className="pdfr-image-plein" style={g.rognage ? { left: (-g.rognage.x / g.rognage.w) * 100 + '%', top: (-g.rognage.y / g.rognage.h) * 100 + '%', width: 100 / g.rognage.w + '%', height: 100 / g.rognage.h + '%' } : undefined}>
      {url ? <img src={url} alt={img.nom || 'Image collée'} draggable={false} />
        : <div className="pdfr-image-vide">{manquante ? 'Image indisponible sur cet appareil' : '…'}</div>}
      {motsSurlignes.length > 0 && (
        <div className="pi-surlignages" aria-hidden="true">
          {/* (22/10) mots surlignés fusionnés par ligne et par surlignage, comme sur la page */}
          {[...motsSurlignes.reduce((acc, { h, m }) => { if (!acc.has(h.id)) acc.set(h.id, { h, ms: [] }); acc.get(h.id).ms.push(m); return acc; }, new Map()).values()]
            .flatMap(({ h, ms }) => lignesSurlignage(ms).map((m, i) => (
            <span key={h.id + ':' + i} className="pdfr-hl-rect pi-hl" data-hl={h.id}
              style={{ left: m.x * 100 + '%', top: m.y * 100 + '%', width: m.w * 100 + '%', height: m.h * 100 + '%', background: couleurHex(h.couleur),
                ...(opaciteSurlignage(h.couleur) < 1 ? { opacity: opaciteSurlignage(h.couleur) } : {}) }} />
          )))}
        </div>
      )}
      {ocr && (
        <div ref={calqueRef} className={'pi-texte' + (motsVivants ? ' vivant' : '')} onPointerDown={appuiMots}>
          {ocr.mots.map((m, i) => (
            <span key={i} className="pi-mot" data-i={i}
              style={{ left: m.x * 100 + '%', top: m.y * 100 + '%', height: m.h * 100 + '%', fontSize: tailles[i] ? tailles[i].fs : undefined, transform: tailles[i] ? `scaleX(${tailles[i].sx})` : undefined }}>
              {m.t + (i + 1 < ocr.mots.length ? (ocr.mots[i + 1].line !== m.line ? '\n' : ' ') : '')}
            </span>
          ))}
        </div>
      )}
      </div>
      {active && !rogne && g.rotation ? <CadreSelection onCoin={img.verrouille ? null : (e, coin) => geste(e, coin)} /> : null}
      </div>
      {/* (24/10) poignées HORS du corps : sur une image rognée, son overflow: hidden coupait les coins */}
      {active && !rogne && !g.rotation && <CadreSelection onCoin={img.verrouille ? null : (e, coin) => geste(e, coin)} />}
    </div>
    {active && !apercu && !rogne && (
      <MiniBarre ancre={{ x: g.x * pageWidth, y: g.y * pageHeight, w: g.width * pageWidth, h: g.height * pageHeight }} pageWidth={pageWidth} pageHeight={pageHeight}
        items={[
          { cle: 'rogner', icone: <IconeOutil nom="rogner" size={16} />, actif: rogne, desactive: !!img.rotation || !!img.verrouille || !url,
            titre: img.rotation ? 'Rogner : redresse d’abord l’image' : 'Rogner : cadre à poignées sur l’image entière — Entrée valide, Échap annule (réversible)', onClick: rogner },
          { cle: 'verrou', icone: <IconeOutil nom={img.verrouille ? 'cadenas' : 'cadenasOuvert'} size={16} />, actif: !!img.verrouille,
            titre: img.verrouille ? 'Verrouillée : ni déplacée ni redimensionnée — cliquer pour déverrouiller' : 'Verrouiller : l’image ne bouge plus', onClick: () => { if (rognage.current) rognage.current.annuler(); onModifier(img, { verrouille: !img.verrouille }, img.verrouille ? 'Image déverrouillée' : 'Image verrouillée'); } },
          { cle: '|' },
          { cle: 'supprimer', titre: `Supprimer l'image (annulable par ${RACCOURCI_Z})`, onClick: () => onSupprimer(img) },
        ]} />
    )}
      {bulle && createPortal(
        <div className="nd-bulle pt-bulle pi-bulle" style={{ left: bulle.x, top: bulle.y }} onMouseDown={(e) => e.preventDefault()}>
          <button type="button" className="nd-bt nd-bt-txt" onClick={() => { surligner(bulle.ids, COULEUR_DEFAUT, { ajouter: true }); window.getSelection().removeAllRanges(); setBulle(null); }}
            title="Faire de ces mots une notion (surlignage prioritaire)"><Icon name="edit" size={13} /> Notion</button>
          <button type="button" className="nd-bt nd-bt-txt" onClick={() => { onFlashcard(texteDe(bulle.ids)); setBulle(null); }}
            title="Créer une flashcard à partir de ces mots"><Icon name="cards" size={13} /> Flashcard</button>
          <button type="button" className="nd-bt nd-bt-txt" onClick={() => { try { navigator.clipboard.writeText(texteDe(bulle.ids)); } catch (x) { /* refus */ } setBulle(null); }}
            title="Copier le texte"><Icon name="copy" size={13} /> Copier</button>
        </div>,
        document.body,
      )}
    </>
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

/** (21/10) les 3 épaisseurs d'une forme (fraction de la hauteur de page) ; 0,0025 = celle d'avant ; style du trait */
const dashForme = (f, ep) => (f.trait === 'tirets' ? `${ep * 4} ${ep * 3}` : f.trait === 'pointilles' ? `0.01 ${ep * 2.4}` : undefined);
function Forme({ forme, active = false, interactive = false, liee = false, apercu = false, fondNoir = false, pageWidth, pageHeight, onActiver, onMaj, onModifier, onSupprimer, onGeste, onApercu = null, cadres = null, k = 1 }) {
  const [geste, setGeste] = useState(null);
  const [ecrit, setEcrit] = useState(null); // texte en cours d'écriture (null = pas d'édition)
  const g = geste || forme;
  const type = typeForme(forme);
  const trait = estTrait(type);
  const W = pageWidth || 600, H = pageHeight || 800;
  // épaisseur du cadre : fraction de la page affichée — elle suit le zoom avec le cadre (04/10)
  const ep = Math.max(1, epaisseurPx(forme, W, H, 0.0025)); // (v1.1) px d'une page de 1000 px (`ep1000`), sinon l'unité d'avant
  const coul = fondNoir ? lisibleSurNoir(couleurHex(forme.couleur, '#e5383b')) : couleurHex(forme.couleur, '#e5383b');
  const wpx = g.width * W, hpx = g.height * H;
  /* FLÈCHES DE L'OUTIL FORMES (ligne, flèche, double flèche) — le MÊME modèle et le même tracé que les flèches des
     boîtes depuis le 21/10 (pdf/flechesGeo.js, pdf/Fleche.jsx) : sommets = extrémités du cadre + points de contrôle
     (fractions de page, dans le sous-objet `fleche` de la forme, qui a déjà ses propres `type`, `couleur` et
     `epaisseur`), repère local = le cadre de la forme (le SVG déborde). Une flèche d'avant sans `fleche` passe par
     le même tracé avec les proportions d'avant : rendu identique. */
  const [ctl, setCtl] = useState(null); // points pendant le glisser d'un point de contrôle
  const srcStyle = ctl ? { ...(g.fleche || {}), points: ctl } : (g.fleche || null);
  const st = trait ? styleFleche(srcStyle, { pointes: pointesForme(type) }) : null;
  // flèche harmonisée (21/10) : EXACTEMENT le trait et la pointe d'une flèche de boîte (1,5 px à 160 % × épaisseur,
  // en unités de page) ; flèches d'avant : leur épaisseur de forme
  const harmo = trait && harmonisee(srcStyle);
  const epTrait = trait ? (srcStyle && Number.isFinite(srcStyle.ep1000) ? (srcStyle.ep1000 / PAGE_REF) * W : harmo ? 1.5 * k * st.epaisseur : ep * st.epaisseur) : ep;
  const coulTrait = trait && st.couleur ? (fondNoir ? lisibleSurNoir(couleurHex(st.couleur, coul)) : couleurHex(st.couleur, coul)) : coul;
  // un bout en cours de glisser est détaché (il suit le pointeur) ; les autres bouts rattachés suivent leur boîte
  const sommets = trait ? sommetsForme(g, W, H, ctl, cadres) : null;
  const geoTrait = trait ? geoPointe(srcStyle, epTrait, { contexte: 'forme', k }) : null;
  const { d, pointes } = trait ? { d: cheminFleche(sommets, st, epTrait, geoTrait).d, pointes: [] } : cheminForme(type, wpx, hpx, { fx: !!g.fx, fy: !!g.fy, epaisseur: ep });

  const demarrer = (e, typeGeste) => {
    const r = rectPage(e.currentTarget);
    if (!r || !r.width || !r.height) return;
    const d0 = { x: e.clientX, y: e.clientY };
    const avant = forme;
    let courant = null;
    // extrémités d'un trait en fractions de page, TELLES QU'AFFICHÉES (un bout rattaché part du bord de sa boîte)
    const sv = estTrait(typeForme(avant)) ? sommetsForme(avant, W, H, null, cadres) : null;
    const [a0, b0] = sv ? [sv[0], sv[sv.length - 1]].map((p) => ({ x: avant.x + p.x / W, y: avant.y + p.y / H }))
      : extremites(avant.width, avant.height, avant.fx, avant.fy).map((p) => ({ x: avant.x + p.x, y: avant.y + p.y }));
    const move = (ev) => {
      const dx = (ev.clientX - d0.x) / r.width, dy = (ev.clientY - d0.y) / r.height;
      if (typeGeste === 'move') {
        courant = { ...avant, x: clamp(avant.x + dx, 0, 1 - avant.width), y: clamp(avant.y + dy, 0, 1 - avant.height) };
        // une flèche libre se déplace d'un bloc : ses points de contrôle suivent
        if (avant.fleche && Array.isArray(avant.fleche.points) && avant.fleche.points.length) { const ddx = courant.x - avant.x, ddy = courant.y - avant.y; courant.fleche = { ...avant.fleche, points: avant.fleche.points.map((p) => ({ x: +clamp01(p.x + ddx).toFixed(5), y: +clamp01(p.y + ddy).toFixed(5) })) }; }
      } else if (typeGeste === 'debut' || typeGeste === 'fin') {
        const a = typeGeste === 'debut' ? { x: clamp01(a0.x + dx), y: clamp01(a0.y + dy) } : a0;
        const b = typeGeste === 'fin' ? { x: clamp01(b0.x + dx), y: clamp01(b0.y + dy) } : b0;
        courant = { ...avant, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y), fx: a.x > b.x, fy: a.y > b.y,
          attaches: { ...(avant.attaches || {}), [typeGeste]: null } }; // le bout glissé se détache…
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
    const up = (ev, { bouge, annule }) => {
      onGeste(false);
      setGeste(null);
      if (annule || !bouge || !courant) return;
      if ((typeGeste === 'debut' || typeGeste === 'fin') && ev) { // … et se rattache à la boîte sur laquelle on le relâche
        const sous = boiteSous(ev.clientX, ev.clientY);
        courant = { ...courant, attaches: { ...(courant.attaches || {}), [typeGeste]: sous || null } };
        onMaj(avant, courant, sous ? 'Flèche rattachée à une boîte' : 'Déplacement d’un bout de la flèche');
        return;
      }
      onMaj(avant, courant, typeGeste === 'move' ? 'Déplacement de la forme' : 'Redimension de la forme');
    };
    if (suivrePointeur(e, { seuil: 3, arreter: true, glisser: typeGeste === 'move', move, fin: up })) { onGeste(true); onActiver(forme.id); }
  };

  const stylerForme = (patch, libelle) => onModifier(forme, { fleche: { ...(forme.fleche || {}), ...patch } }, libelle);
  const ajouterPointFormeA = (clientX, clientY, r) => {
    const points = pointsAvecAjout(sommetsForme(forme, W, H), styleFleche(forme.fleche, { pointes: pointesForme(type) }), clientX, clientY, r, W, H, { x: forme.x * W, y: forme.y * H });
    if (points) stylerForme({ points }, 'Point ajouté à la flèche');
  };
  const glisserCtlForme = (e, i) => glisserPointFleche(e, { points: (forme.fleche && forme.fleche.points) || [], i, onGeste,
    onApercu: setCtl, onFin: (pts) => stylerForme({ points: pts }, 'Point de la flèche déplacé') });
  const finirTexte = (valider) => {
    if (ecrit === null) return;
    const t = ecrit.trim();
    setEcrit(null);
    if (valider && t !== (forme.texte || '')) onModifier(forme, { texte: t || null }, t ? 'Texte de la forme' : 'Texte de la forme retiré');
  };
  const couleurTexte = couleurFoncee(forme.couleur);
  /* LA MINI BARRE (pdf/Selection.jsx) : forme fermée = style du trait · remplissage · épaisseur · couleur · supprimer ;
     ligne / flèche = LA mini barre des flèches (la même que celle d'une flèche de boîte) */
  const refW = W / (k || 1); // largeur de la page à l'échelle de référence
  const IC_T = { continu: 'traitContinu', tirets: 'traitTirets', pointilles: 'traitPointilles' };
  const items = trait
    ? itemsFleche(st, { couleurDefaut: forme.couleur,
      ep: { valeur: Number.isFinite(srcStyle && srcStyle.ep1000) ? srcStyle.ep1000 : harmo ? epFleche1000(srcStyle, refW) : +(((ep * st.epaisseur) / W) * PAGE_REF).toFixed(2), echelle: W / PAGE_REF,
        champs: (v) => (harmo ? champsFleche1000(v, refW) : { ep1000: v }) },
      onStyle: (patch, libelle) => (patch.couleur !== undefined ? onModifier(forme, { couleur: patch.couleur, ...(forme.fleche && forme.fleche.couleur ? { fleche: { ...forme.fleche, couleur: null } } : {}) }, libelle) : stylerForme(patch, libelle)), onSupprimer: () => onSupprimer(forme) })
    : [
      { cle: 'trait', icone: <IconeOutil nom={IC_T[forme.trait] || 'traitContinu'} size={16} />, titre: 'Style du trait (continu, tirets, pointillés)',
        onClick: () => onModifier(forme, { trait: suivant(TRAITS_FORME, forme.trait || 'continu') }, 'Style du trait') },
      ...(estFermee(type) ? [{ cle: 'remplir', icone: <IconeOutil nom={forme.remplie ? 'remplir' : 'vide'} size={16} />, actif: !!forme.remplie, titre: forme.remplie ? 'Remplie — cliquer pour retirer le fond' : 'Vide — cliquer pour remplir d’une teinte légère',
        onClick: () => onModifier(forme, { remplie: !forme.remplie }, forme.remplie ? 'Forme vidée' : 'Forme remplie') }] : []),
      { cle: 'epaisseur', element: <BoutonTaille genre="forme" valeur={ep1000De(forme, W, H, 0.0025)} echelle={W / PAGE_REF} couleur={coul}
        onChange={(v) => { ecrireTaille('forme', v); onModifier(forme, champsEp1000(v, W, H), 'Épaisseur de la forme'); }} /> },
      { cle: 'couleur', couleur: forme.couleur, titre: 'Couleur de la forme', onApercu, onCouleur: (c) => onModifier(forme, { couleur: c }, 'Couleur de la forme') },
      { cle: '|' },
      { cle: 'supprimer', titre: `Supprimer la forme (annulable par ${RACCOURCI_Z}, ou à la gomme)`, onClick: () => onSupprimer(forme) },
    ];
  // rectangle de l'objet en px de page (une flèche : ce qu'occupe son tracé)
  const ancre = (() => {
    if (!trait) return { x: g.x * W, y: g.y * H, w: g.width * W, h: g.height * H };
    const xs = sommets.map((p) => p.x), ys = sommets.map((p) => p.y);
    return { x: g.x * W + Math.min(...xs), y: g.y * H + Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  })();
  const auDoigtOuClic = (e) => {
    if (e.currentTarget.closest) { const el = e.currentTarget.closest('.pdfr-forme'); if (el) el.focus({ preventScroll: true }); }
    if (trait) appuiLong(e, ajouterPointFormeA); // appui long au doigt sur une flèche : un point (comme le double-clic)
    demarrer(e, 'move');
  };
  const doubleClic = (e) => { e.stopPropagation(); if (trait) ajouterPointFormeA(e.clientX, e.clientY, rectPage(e.currentTarget)); else setEcrit(forme.texte || ''); };
  const dash = trait ? null : dashForme(forme, ep);

  return (<>
    <div className={'pdfr-forme sel-objet' + (active ? ' active' : '') + (liee ? ' liee' : '') + (interactive ? ' interactive' : '') + (interactive && !trait ? ' prise-pleine' : '') + (geste || apercu ? ' glisse' : '')}
      data-forme={type} data-objet={forme.id}
      style={{ left: g.x * 100 + '%', top: g.y * 100 + '%', width: g.width * 100 + '%', height: g.height * 100 + '%' }}
      tabIndex={-1}
      /* (21/10) forme fermée : cliquer-glisser N'IMPORTE OÙ dans la forme (règle de tous les objets) ; ligne / flèche :
         sur son tracé (son cadre n'est pas l'objet) */
      onPointerDown={interactive && !trait ? auDoigtOuClic : undefined} onDoubleClick={interactive && !trait ? doubleClic : undefined}>
      <svg className="pf-svg" width="100%" height="100%" overflow="visible" aria-hidden="true">
        {trait ? <TraitFleche pts={sommets} st={st} largeur={epTrait * (active ? (harmo ? 1.5 : 1.25) : 1)} geo={geoTrait} couleur={coulTrait} sel={active} halo={harmo ? 9 * k : epTrait + 7} classes={{ g: 'pf-fleche', halo: 'pf-halo', trait: 'pf-trace', tete: 'pf-tete' }} />
          : <path className="pf-trace" d={d} fill={forme.remplie && estFermee(type) ? avecAlpha(coul, 0.18) : 'none'} stroke={coul} strokeWidth={ep} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} />}
        {pointes.map((p, i) => <path key={i} d={p} fill={coul} stroke={coul} strokeWidth={Math.min(ep, 2)} strokeLinejoin="round" />)}
        {!apercu && (
          <path className="pf-gomme" data-id={forme.id} data-remplie={forme.remplie && estFermee(type) ? '1' : '0'} d={d}
            fill="transparent" stroke="transparent" strokeWidth={ep + 18} strokeLinecap="round" />
        )}
        {interactive && trait && (
          <path className="pf-hit" d={d} fill="none" stroke="transparent" strokeWidth={harmo ? Math.max(14, 12 * k) : Math.max(14, ep + 10)} strokeLinecap="round"
            onPointerDown={auDoigtOuClic} onDoubleClick={doubleClic}>
            <title>Flèche · clic : sélectionner · glisser : la déplacer · double-clic : ajouter un point · Suppr pour retirer</title>
          </path>
        )}
      </svg>
      {(forme.texte || ecrit !== null) && (
        <div className={'pf-texte' + (trait ? ' sur-trait' : '')} style={{ color: couleurTexte, ...(Number.isFinite(forme.taille1000) || Number.isFinite(forme.tailleTexte) ? { fontSize: (taille1000De(forme, 13, W) / PAGE_REF) * W } : {}) }}>
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
      {interactive && active && !trait && <CadreSelection onCoin={(e, c) => demarrer(e, c)} />}
      {interactive && active && trait && [sommets[0], sommets[sommets.length - 1]].map((p, i) => (
        <span key={i} className="fl-bout sel-zone" data-bout={i ? 'fin' : 'debut'} style={{ left: p.x, top: p.y }}
          title={i ? 'Arrivée — glisser pour la déplacer, relâcher sur une boîte pour l’y rattacher' : 'Départ — glisser pour le déplacer, relâcher sur une boîte pour l’y rattacher'}
          onPointerDown={(e) => { e.stopPropagation(); demarrer(e, i ? 'fin' : 'debut'); }} />
      ))}
      {interactive && active && trait && (
        <PoigneesFleche points={st.points} couleur={coulTrait} classe="nb-ctl pf-ctl sel-zone" position={(p) => ({ left: (p.x - g.x) * W, top: (p.y - g.y) * H })}
          onGlisser={glisserCtlForme} onRetirer={(i) => stylerForme({ points: st.points.filter((_, j) => j !== i) }, 'Point de la flèche retiré')} onTrait={auDoigtOuClic} />
      )}
    </div>
    {interactive && active && !geste && !ctl && !apercu && <MiniBarre ancre={ancre} pageWidth={W} pageHeight={H} items={items} />}
  </>);
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
function TextEditBlock({ edit, active, editable, onActivate, editor, pageHeight, pageWidth = 0, onReinitialiser = () => {} }) {
  const html = useMemo(() => richToHTML(edit.content), [edit.content]);
  /* (22/10) sa MINI BARRE remplace la grande barre de format : taille · couleur · G · I · alignement · « … » · réinitialiser */
  const ouvert = active && editable && editor && !editor.isDestroyed ? editor : null;
  useSuiviEditeur(ouvert);
  const items = (() => {
    if (!ouvert) return null;
    const fmt = elementsFormat({ editor: ouvert });
    const base1000 = edit.fontSize && pageHeight && pageWidth ? (edit.fontSize * pageHeight * PAGE_REF) / pageWidth : 13;
    return [
      { cle: 'taille', element: <BoutonTaille genre="texte" valeur={+base1000.toFixed(1)} echelle={pageWidth / PAGE_REF}
        onChange={(v) => { const em = `${+(v / base1000).toFixed(3)}em`; const c = ouvert.chain().focus(); (ouvert.state.selection.empty ? c.selectAll() : c).setFontSize(em).run(); }} /> },
      fmt.couleur,
      { cle: '|' },
      fmt.gras, fmt.italique, fmt.align,
      { cle: '|' },
      { cle: '…', plus: [fmt.police, fmt.souligne, fmt.barre, fmt.fond, fmt.puces, fmt.numeros] },
      { cle: 'reinitialiser', icone: <IconeOutil nom="reinitialiser" size={15} />, titre: 'Réinitialiser : revenir au texte d’origine (annulable)', onClick: onReinitialiser },
    ];
  })();
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
    return (<>
      <div className="edit-block-active" style={style}><EditorContent editor={editor} className="edit-block-content" /></div>
      {items && pageWidth > 0 && <MiniBarre ancre={{ x: edit.x * pageWidth, y: edit.y * pageHeight, w: edit.width * pageWidth, h: edit.height * pageHeight }} pageWidth={pageWidth} pageHeight={pageHeight} items={items} />}
    </>);
  }
  return (
    <div className={'edit-block-static' + (editable ? ' editable' : '')} style={style}
      onClick={editable ? () => onActivate(edit.id) : undefined}
      dangerouslySetInnerHTML={{ __html: html }} />
  );
}

/* (22/10) EditToolbar — la barre de mise en forme fixe sous la barre d'outils — a disparu : ses options sont dans les mini
   barres (pdf/FormatTexte.jsx, docs/compte-rendu-simplification-outils.md). */

