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
import { EditorContent } from '@tiptap/react';
import { Icon } from '../../shared/Icon.jsx';
import { outputScaleFor } from './pdfjsSetup.js';
import { richToHTML } from '../documents/lib/richtext.js';
import {
  COLORS, COLOR_HEX, FONT_SIZES, FONT_FAMILIES, BOITE_MIN, BOITE_DEFAUT,
  clamp, clamp01, avecAlpha, buildTextLayer, cleanSelectedText,
  anchorFromRange, rangeFromAnchor, rectsFromRange, computeMatchRectsFromDom,
  lisserTrait, traitTouche, pointsVersSvg,
} from './pdfShared.js';

/** rendu d'une seule page (montée uniquement si proche du viewport) : canvas + couche de
    texte + surlignages + surlignage de recherche (géométrie exacte, Chantier 2) + blocs
    de texte édités (Chantier 1). */
export function PdfPageContent({
  pdfDoc, pageNum, scale, pageHeight, dpr, highlights, edits, boites, traits, outil, activeEditId, matches, activeMatchIdx,
  onCreateHighlight, onHighlightClick, onActivateEdit, activeEditor, onCreerBoite, onMajBoite, onSupprimerBoite,
  onCreerTrait, onSupprimerTrait, cibleHlId,
  couleurTrait = 'jaune', epaisseurTrait = 0.0042, aimantActif = true,
}) {
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
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
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch (e) { /* ignore */ } }
      const page = await pdfDoc.getPage(pageNum);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      // netteté : le canvas porte `os` pixels réels par pixel CSS (2 sur Retina) et
      // reste AFFICHÉ à la taille du viewport — la couche de texte et les surlignages,
      // positionnés en px CSS, ne voient aucune différence.
      const os = outputScaleFor(viewport.width, viewport.height, dpr);
      canvas.width = Math.floor(viewport.width * os); canvas.height = Math.floor(viewport.height * os);
      canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
      const c2d = canvas.getContext('2d');
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
      await buildTextLayer(page, viewport, textLayerRef.current);
      if (cancelled) return;
      setLayerVersion((v) => v + 1); // couche de texte prête : les ancres peuvent être résolues
      // Chantier 2 : la textLayer réelle vient d'être (re)construite pour ce scale —
      // c'est le bon moment pour mesurer les rects exacts des occurrences via Range.
      setMatchRects(computeMatchRectsFromDom(textLayerRef.current, matches));
    })();
    return () => {
      cancelled = true;
      if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch (e) { /* ignore */ } }
    };
  }, [pdfDoc, pageNum, scale, dpr, matches]);

  /* tracé d'une NOUVELLE boîte : cliquer-glisser dessine le rectangle, un simple
     clic pose une boîte de taille par défaut au point visé. Tout est normalisé
     [0,1] par rapport à la page, donc indépendant du zoom. */
  const [trace, setTrace] = useState(null);
  const demarrerTrace = (e) => {
    e.preventDefault(); // pas de sélection native pendant le tracé
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const x0 = clamp01((e.clientX - r.left) / r.width);
    const y0 = clamp01((e.clientY - r.top) / r.height);
    let courant = null;
    const move = (ev) => {
      const x1 = clamp01((ev.clientX - r.left) / r.width);
      const y1 = clamp01((ev.clientY - r.top) / r.height);
      courant = { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
      setTrace(courant);
    };
    const up = () => {
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
      onCreerBoite({
        page: pageNum, x, y,
        width: clamp(rect.width, BOITE_MIN.width, 1 - x),
        height: clamp(rect.height, BOITE_MIN.height, 1 - y),
      });
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
  const [traitEnCours, setTraitEnCours] = useState(null);
  const PAS_MIN = 0.0025;
  const demarrerTrait = (e) => {
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const ratio = r.width / r.height;
    const pt = (ev) => [clamp01((ev.clientX - r.left) / r.width), clamp01((ev.clientY - r.top) / r.height)];
    let points = [pt(e)];
    setTraitEnCours(points);
    const move = (ev) => {
      const q = pt(ev);
      const d = Math.hypot(q[0] - points[points.length - 1][0], q[1] - points[points.length - 1][1]);
      if (d < PAS_MIN) return;
      points = [...points, q];
      setTraitEnCours(points);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setTraitEnCours(null);
      if (points.length >= 2) onCreerTrait({ page: pageNum, points: lisserTrait(points, { aimant: aimantActif, ratio }) });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
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
    // GOMME sur un trait : la couche SVG est transparente à la souris (on doit
    // pouvoir sélectionner le texte dessous), donc test de position, comme pour
    // les surlignages. Le trait l'emporte : il est dessiné au-dessus.
    if (outil === 'gomme') {
      const c = textLayerRef.current;
      const cr = c && c.getBoundingClientRect();
      if (cr && cr.width && cr.height) {
        const px = (e.clientX - cr.left) / cr.width, py = (e.clientY - cr.top) / cr.height;
        const t = [...(traits || [])].reverse().find((x) => traitTouche(x, px, py));
        if (t) { onSupprimerTrait(t); return; }
      }
    }
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
    const selRange = sel.getRangeAt(0);
    // ancre bornée à CETTE page ; le texte et les rects en découlent (une sélection qui
    // déborde sur la page suivante ne produit plus de rects hors page). Repli sur la
    // sélection brute si aucune ancre n'est calculable.
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
    onCreateHighlight({ page: pageNum, texte, rects, anchor, x: last.right, y: last.bottom, fontSizeRel, fontFamily });
  };

  return (
    <>
      <canvas ref={canvasRef} />
      <div ref={textLayerRef} className={'pdfr-textlayer outil-' + outil} onMouseUp={handleMouseUp} onCopy={handleCopy}
        onMouseMove={handleMouseMove} onMouseLeave={() => setSurvolId(null)}
        style={survolId && outil !== 'gomme' ? { cursor: 'pointer' } : undefined} />
      <div className="pdfr-hlayer">
        {highlights.flatMap((h) => (shownRects[h.id] || h.rects).map((r, i) => (
          <div key={h.id + ':' + i}
            className={'pdfr-hl-rect' + (h.id === survolId ? ' survol' : '') + (h.id === cibleHlId ? ' cible' : '')}
            style={{ left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.width * 100 + '%', height: r.height * 100 + '%', background: COLOR_HEX[h.couleur] || COLOR_HEX.jaune }} />
        )))}
        {matchRects.map((m) => (
          <div key={'m' + m.idx + ':' + m.ri} className={'pdfr-match-rect' + (m.idx === activeMatchIdx ? ' active' : '')}
            style={{ left: m.rect.x * 100 + '%', top: m.rect.y * 100 + '%', width: m.rect.width * 100 + '%', height: m.rect.height * 100 + '%' }} />
        ))}
      </div>
      {edits.map((a) => (
        <TextEditBlock key={a.id} edit={a} active={a.id === activeEditId} editable={outil === 'main'} onActivate={onActivateEdit} editor={a.id === activeEditId ? activeEditor : null} pageHeight={pageHeight} />
      ))}

      {/* Les traits au crayon : un seul <svg> par page, transparent à la souris.
          `vector-effect: non-scaling-stroke` garde l'épaisseur constante à l'écran
          quel que soit le zoom, sans recalculer quoi que ce soit. */}
      {(traits.length > 0 || traitEnCours) && (
        <svg className="pdfr-inklayer" viewBox="0 0 100 100" preserveAspectRatio="none">
          {traits.map((t) => (
            <polyline key={t.id} points={pointsVersSvg(t.points)}
              stroke={COLOR_HEX[t.couleur] || COLOR_HEX.jaune}
              strokeWidth={Math.max(1.2, (t.epaisseur || 0.0042) * (pageHeight || 800))}
              fill="none" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          ))}
          {traitEnCours && (
            <polyline points={pointsVersSvg(traitEnCours)} stroke={COLOR_HEX[couleurTrait] || COLOR_HEX.jaune}
              strokeWidth={Math.max(1.2, epaisseurTrait * (pageHeight || 800))}
              fill="none" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity="0.85" />
          )}
        </svg>
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

      {/* rendues APRÈS la couche de tracé : une boîte existante reste toujours
          atteignable, même l'outil « Boîte de texte » actif. */}
      {boites.map((b) => (
        <NoteBox key={b.id} boite={b} active={b.id === activeEditId} gomme={outil === 'gomme'}
          editor={b.id === activeEditId ? activeEditor : null}
          onActivate={onActivateEdit}
          onGeste={(enCours) => { gesteBoite.current = enCours; }}
          onMaj={onMajBoite} onSupprimer={onSupprimerBoite} />
      ))}
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
function NoteBox({ boite, active, editor, onActivate, onGeste, onMaj, onSupprimer, gomme = false }) {
  const [apercu, setApercu] = useState(null); // géométrie pendant le geste (état local, non persisté)
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
        const at = pt && editor.view.posAtCoords({ left: pt.x, top: pt.y });
        const pos = at && Number.isFinite(at.pos) ? at.pos : editor.state.doc.content.size;
        editor.commands.setTextSelection(pos);
        editor.view.focus();
      } catch (err) { try { editor.view.focus(); } catch (e2) { /* ignore */ } }
    };
    t = setTimeout(essayer, 0);
    return () => clearTimeout(t);
  }, [active, editor]);

  const activer = (e) => {
    // GOMME : un clic n'ouvre pas la boîte, il l'efface (annulable par Cmd+Z).
    if (gomme) { onSupprimer(boite); return; }
    if (e) clicRef.current = { x: e.clientX, y: e.clientY };
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
    let courant = null;
    let bouge = false;
    onGeste(true);

    const move = (ev) => {
      if (!bouge && Math.abs(ev.clientX - depart.x) + Math.abs(ev.clientY - depart.y) <= 4) return;
      bouge = true;
      const dx = (ev.clientX - depart.x) / r.width;
      const dy = (ev.clientY - depart.y) / r.height;
      courant = type === 'move'
        ? { ...avant, x: clamp(avant.x + dx, 0, 1 - avant.width), y: clamp(avant.y + dy, 0, 1 - avant.height) }
        : { ...avant,
            width: clamp(avant.width + dx, BOITE_MIN.width, 1 - avant.x),
            height: clamp(avant.height + dy, BOITE_MIN.height, 1 - avant.y) };
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

  const style = {
    left: b.x * 100 + '%', top: b.y * 100 + '%', width: b.width * 100 + '%', height: b.height * 100 + '%',
    background: avecAlpha(COLOR_HEX[boite.couleur] || COLOR_HEX.jaune, 0.92),
  };

  return (
    <div ref={boiteRef} className={'note-box' + (active ? ' active' : '') + (gomme ? ' gomme' : '')} style={style}>
      {/* CORRECTIF (défaut 4) : le bandeau est focusable, et c'est LUI qui porte la
          suppression au clavier — plus aucun écouteur global ne peut effacer la
          boîte pendant que le curseur est ailleurs. */}
      <div className="nb-bar" ref={barreRef} tabIndex={0}
        title={gomme ? 'Cliquer pour effacer cette boîte' : 'Glisser pour déplacer · Suppr pour effacer'}
        onPointerDown={(e) => { if (gomme) { e.preventDefault(); onSupprimer(boite); return; } demarrer(e, 'move'); if (barreRef.current) barreRef.current.focus(); }}
        onKeyDown={(e) => {
          if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); onSupprimer(boite); }
          if (e.key === 'Enter') { e.preventDefault(); activer(null); }
        }}>
        <span className="nb-grip"><Icon name="grip" size={12} /></span>
        <span className="nb-spacer" />
        <button type="button" className="nb-btn danger" title="Supprimer cette boîte"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onSupprimer(boite); }}>
          <Icon name="trash" size={12} />
        </button>
      </div>

      {/* VERROU 4 : le corps est du TEXTE, pas une poignée. */}
      {active && editor
        ? <div className="nb-body"><EditorContent editor={editor} /></div>
        : <div className="nb-body" onClick={activer} dangerouslySetInnerHTML={{ __html: html }} />}

      <div className="nb-corner" title="Glisser pour redimensionner" onPointerDown={(e) => demarrer(e, 'resize')} />
    </div>
  );
}

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
export function EditToolbar({ editor, onReset, onClose, libre = false, couleur = null, onCouleur = null }) {
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
          {COLORS.map((c) => (
            <button key={c.id} type="button" title={`Fond ${c.label.toLowerCase()}`} onClick={() => onCouleur(c.id)}
              style={{ width: 17, height: 17, borderRadius: 5, background: c.hex, cursor: 'pointer', flex: '0 0 auto',
                border: couleur === c.id ? '2px solid var(--text)' : '1px solid rgba(0,0,0,.25)' }} />
          ))}
          <span className="et-sep" />
        </>
      )}
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
      <input type="color" className="et-color" title="Couleur du texte" onChange={(e) => run((c) => c.setColor(e.target.value))} />
      <input type="color" className="et-color" title="Surligneur de fond" defaultValue="#fff59d" onChange={(e) => run((c) => c.setBackgroundColor(e.target.value))} />
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
        {libre ? <><Icon name="trash" size={13} /> Supprimer la boîte</> : <><Icon name="refresh" size={13} /> Réinitialiser (texte d'origine)</>}
      </button>
      <button type="button" className="btn sm" onClick={onClose}><Icon name="check" size={13} /> Terminé</button>
    </div>
  );
}

