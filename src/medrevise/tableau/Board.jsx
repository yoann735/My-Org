/* ============================================================
   MedRevise — TABLEAU (Miro) D'UNE FICHE (22/10, docs/compte-rendu-tableau-flashcards.md §1). Remplace le tableau du
   04/10 (tableau/Tableau.jsx) : mêmes dispositions dans le lecteur (côte à côte, plein écran), et l'onglet « Tableau »
   du panneau.

   UN SEUL MOTEUR D'ANNOTATION avec le lecteur — pas de copie :
     sélection, cadre, mini barre      pdf/Selection.jsx   (CadreSelection, MiniBarre, redimRect)
     flèches : modèle, tracé, gestes   pdf/flechesGeo.js + pdf/Fleche.jsx (TraitFleche, PoigneesFleche, itemsFleche,
                                       boiteSous) — droite / courbe, points de contrôle, pointes, styles, accrochées
     gestes                            pdf/pointeur.js     (suivrePointeur)
     cartes                            le dessin des cartes du tableau du 04/10 (v1.1, fondCarte ci-dessous), dont les
                                       boîtes du lecteur (.carte-mr) sont de la même famille
   Seule la CONVERSION écran ↔ monde est propre au tableau (la caméra) : le monde est en px au zoom 1, illimité.

   Le monde est une « page » (.pdfr-page) : les styles de sélection, de points et de bouts sont ceux du lecteur ; les
   mini barres vivent dans un calque à l'échelle de l'écran (.tb2-calque, lui aussi une .pdfr-page).
   Données : lib/board.js (un enregistrement par fiche, store `board`) ; pile d'annulation dédiée (lib/annotHistory.js).
   ============================================================ */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { putBlob, getBlob, getOne, put, genId } from '../lib/storage.js';
import { useAnnotHistorique, cmdModifier } from '../lib/annotHistory.js';
import { lireBoard, idBoard, nouvelleCarte, nouvelleImage, nouvelleFleche, grilleDeCartes, CARTE_BOARD, ZOOM_BOARD } from '../lib/board.js';
import { couleurHex, opaciteFondBoite, lireTaille } from '../pdf/pdfShared.js';
import { CadreSelection, MiniBarre, redimRect } from '../pdf/Selection.jsx';
import { IconeOutil } from '../pdf/IconesOutils.jsx';
import { TraitFleche, PoigneesFleche, itemsFleche, boiteSous } from '../pdf/Fleche.jsx';
import { styleFleche, cheminFleche, geoPointe, sommetsConnecteur, indexInsertion } from '../pdf/flechesGeo.js';
import { suivrePointeur } from '../pdf/pointeur.js';
import { TableauMuscle } from '../components/FlashcardMuscle.jsx';
import { TableauRevision } from '../components/FlashcardTableau.jsx';
import { VueMoleculeParesseuse } from '../molecule/Paresseux.jsx';
import { porteCartes, cartesGlissees, EVT_GLISSE } from '../apprentissageLibre/liste.js';
import { BoiteTableau, estGrille, nouvelleGrille, ajouterLigne, ajouterColonne, retirerLigne, retirerColonne, LIMITES_GRILLE } from '../pdf/BoiteTableau.jsx';
import { carteDepuisBoite } from '../lib/board.js';
import '../../styles/tableau-board.css';

const SEUIL_AIMANT = 6; // px à l'écran
const rectsSeCroisent = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const bornes = (objs) => (objs.length ? {
  x: Math.min(...objs.map((o) => o.x)), y: Math.min(...objs.map((o) => o.y)),
  r: Math.max(...objs.map((o) => o.x + o.w)), b: Math.max(...objs.map((o) => o.y + o.h)),
} : null);
const estImage = (f) => f && /^image\//.test(f.type || '');

/* une image du store des blobs (URL d'objet, libérée au démontage) */
function ImageBlob({ blobId, className = '' }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let vivant = true, u = null;
    getBlob(blobId).then((b) => { if (vivant && b) { u = URL.createObjectURL(b); setUrl(u); } }).catch(() => {});
    return () => { vivant = false; if (u) URL.revokeObjectURL(u); };
  }, [blobId]);
  return url ? <img className={className} src={url} alt="" draggable={false} /> : <span className={className + ' tb2-img-attente'} />;
}

/* ---------- une carte : le DESSIN DU TABLEAU DU 04/10 (v1.1, docs/compte-rendu-tableau-flashcards.md) ----------
   Fond de la couleur à 88 % (une couleur foncée : teinte à 30 %), encre #1d1d26, posé sur le fond clair d'alors
   (#f7f7f5) puis rendu OPAQUE : la carte est identique à celle d'avant sur le fond blanc comme sur le fond sombre. */
const FOND_ANCIEN = [0xf7, 0xf7, 0xf5];
export const ENCRE_CARTE = '#1d1d26';
export function fondCarte(couleur) {
  if (couleur === 'blanc') return '#ffffff';
  const hex = couleurHex(couleur, '#FFD84D'), n = parseInt(hex.slice(1), 16);
  const a = opaciteFondBoite(couleur) < 0.9 ? 0.3 : 0.88;
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v, i) => Math.round(v * a + FOND_ANCIEN[i] * (1 - a)).toString(16).padStart(2, '0')).join('');
}
function Carte({ o, sel, edition, onAppui, onEditer, onFinEdition, onCoin, onOuvrirFlashcard, visee, onGrille = null, onCellule = () => {}, focus = null }) {
  const style = { left: o.x, top: o.y, width: o.w, height: o.h, zIndex: (o.z || 0) + (sel ? 1000 : 0), background: fondCarte(o.couleur) };
  const titreRef = useRef(null), corpsRef = useRef(null);
  const src = o.source || null;
  const finir = () => onFinEdition({ titre: titreRef.current ? titreRef.current.value : o.titre, corps: corpsRef.current ? corpsRef.current.value : o.corps });
  return (
    <div className={'tb2-carte sel-objet' + (sel ? ' sel' : '') + (edition ? ' edition' : '') + (visee ? ' visee' : '') + (src && src.sorte ? ' de-flashcard sorte-' + src.sorte : '') + (estGrille(o.grille) ? ' carte-grille' : '')}
      data-boite={o.id} data-objet={o.id} style={style} onPointerDown={edition ? undefined : onAppui} onDoubleClick={(e) => { e.stopPropagation(); if (!edition) onEditer(e); }}>
      {src && src.flashcardId && !edition && (
        <button type="button" className="tb2-lien-fc" title="Ouvrir la flashcard d’origine (la carte du tableau en est une copie indépendante)" aria-label="Ouvrir la flashcard"
          onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onOuvrirFlashcard && onOuvrirFlashcard(src.flashcardId); }}>
          <Icon name="cards" size={12} />
        </button>
      )}
      {/* (22/10) CARTE-TABLEAU : le même composant que la boîte-tableau du lecteur (pdf/BoiteTableau.jsx) */}
      {estGrille(o.grille) ? (
        <div className="tb2-contenu tb2-grille">
          {o.titre && <div className="tb2-titre">{o.titre}</div>}
          <BoiteTableau grille={o.grille} edition={edition} focus={edition ? focus : null} filets={sel} echelle={1}
            onChange={(g, lib) => onGrille && onGrille(g, lib)} onCellule={onCellule} onFin={() => onFinEdition({ titre: o.titre, corps: o.corps })} />
        </div>
      ) : edition ? (
        <div className="tb2-edition" onPointerDown={(e) => e.stopPropagation()}
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) finir(); }}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); finir(); } }}>
          <input ref={titreRef} className="tb2-titre-ed" defaultValue={o.titre} placeholder="Titre" autoFocus aria-label="Titre de la carte" />
          <textarea ref={corpsRef} className="tb2-corps-ed" defaultValue={o.corps} placeholder="Texte…" aria-label="Texte de la carte" />
        </div>
      ) : (
        <div className="tb2-contenu">
          {o.titre && <div className="tb2-titre">{o.titre}</div>}
          {src && src.muscle && <div className="tb2-riche"><TableauMuscle item={{ muscle: src.muscle }} compact /></div>}
          {src && src.tableau && <div className="tb2-riche"><TableauRevision item={{ tableau: src.tableau, recto: o.titre }} masquable={false} compact /></div>}
          {src && src.molecule && <div className="tb2-riche tb2-mol"><VueMoleculeParesseuse molfile={src.molecule.molfile} smiles={src.molecule.smiles} hauteur={Math.max(80, o.h - 70)} classe="petite" /></div>}
          {o.blobId && <ImageBlob blobId={o.blobId} className="tb2-carte-img" />}
          {o.corps && <div className="tb2-corps">{o.corps}</div>}
          {!o.titre && !o.corps && !src && !o.blobId && <div className="tb2-vide">Double-clic pour écrire</div>}
        </div>
      )}
      {sel && !edition && <CadreSelection onCoin={onCoin} />}
    </div>
  );
}

export const Board = forwardRef(function Board({ ficheId, flashcards = [], onOuvrirFlashcard = null }, ref) {
  /* ---------- données : un enregistrement par fiche, pile d'annulation dédiée ---------- */
  const [board, setBoard] = useState(null);
  const boardRef = useRef(null); boardRef.current = board;
  const recharger = useCallback(async () => { const r = await getOne('board', idBoard(ficheId)); if (r) setBoard(r); }, [ficheId]);
  const appliquerLocal = (effets) => { for (const e of effets) if (e.store === 'board' && e.apres) setBoard(e.apres); };
  const hist = useAnnotHistorique(recharger, appliquerLocal);
  const geste = useRef(false); // un geste en cours : la synchro attend
  useEffect(() => {
    let vivant = true;
    lireBoard(ficheId).then((b) => { if (!vivant) return; setBoard(b); cam.current = { ...(b.viewport || { x: 80, y: 80, z: 1 }) }; peindreCam(); setCamEtat({ ...cam.current }); });
    hist.vider();
    return () => { vivant = false; };
  }, [ficheId]); // eslint-disable-line react-hooks/exhaustive-deps
  // SYNCHRO : une version plus récente arrivée d'un autre appareil (rechargement après synchro) remplace l'affichage
  useEffect(() => {
    const maj = async () => {
      if (geste.current) return;
      const r = await getOne('board', idBoard(ficheId));
      const l = boardRef.current;
      if (r && (!l || !l.updatedAt || (r.updatedAt || '') > l.updatedAt)) setBoard(r);
    };
    window.addEventListener('medrevise:recharge', maj);
    return () => window.removeEventListener('medrevise:recharge', maj);
  }, [ficheId]);
  /** une modification du tableau = une entrée d'annulation ; `fn(board)` rend le board modifié */
  const modifier = (fn, libelle) => {
    const avant = boardRef.current;
    if (!avant) return null;
    const apres = fn(avant);
    if (!apres || apres === avant) return null;
    hist.appliquer(cmdModifier('board', avant, { ...apres, viewport: { ...cam.current } }, libelle));
    return apres;
  };
  const objets = useMemo(() => (board ? [...board.objects].sort((a, b) => (a.z || 0) - (b.z || 0)) : []), [board]);
  const fleches = board ? board.edges : [];
  const parId = useMemo(() => new Map((board ? board.objects : []).map((o) => [o.id, o])), [board]);
  const zMax = () => objets.reduce((m, o) => Math.max(m, o.z || 0), 0);
  const theme = (board && board.theme) || 'sombre';

  /* ---------- caméra : écrite directement sur le style pendant un geste, validée au repos ---------- */
  const vueRef = useRef(null), mondeRef = useRef(null), racineRef = useRef(null);
  const cam = useRef({ x: 80, y: 80, z: 1 });
  const [camEtat, setCamEtat] = useState(cam.current);
  const [panEnCours, setPanEnCours] = useState(false);
  const minuterie = useRef(null), minuterieVue = useRef(null);
  const peindreCam = () => {
    const c = cam.current;
    if (mondeRef.current) { mondeRef.current.style.transform = `translate(${c.x}px, ${c.y}px) scale(${c.z})`; mondeRef.current.style.setProperty('--contre', String(1 / c.z)); }
    const v = vueRef.current;
    if (v) { const pas = 24 * c.z; v.style.backgroundSize = `${pas}px ${pas}px`; v.style.backgroundPosition = `${c.x}px ${c.y}px`; }
  };
  const validerCam = () => {
    clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => { setCamEtat({ ...cam.current }); setPanEnCours(false); }, 150);
    // la position de vue voyage avec le tableau (sans entrée d'annulation)
    clearTimeout(minuterieVue.current);
    minuterieVue.current = setTimeout(() => { const b = boardRef.current; if (!b || geste.current) return; const nb = { ...b, viewport: { ...cam.current } }; setBoard(nb); put('board', nb).catch(() => {}); }, 1200);
  };
  useLayoutEffect(() => { peindreCam(); });
  const versMonde = (cx, cy) => { const r = vueRef.current.getBoundingClientRect(), c = cam.current; return { x: (cx - r.left - c.x) / c.z, y: (cy - r.top - c.y) / c.z }; };
  const zoomerEn = (cx, cy, zNouveau) => {
    const r = vueRef.current.getBoundingClientRect(), c = cam.current;
    const z = Math.max(ZOOM_BOARD.min, Math.min(ZOOM_BOARD.max, zNouveau));
    const mx = (cx - r.left - c.x) / c.z, my = (cy - r.top - c.y) / c.z;
    cam.current = { z, x: cx - r.left - mx * z, y: cy - r.top - my * z };
    setPanEnCours(true); peindreCam(); validerCam();
  };
  // molette / trackpad : déplacement ; ⌘ / Ctrl (ou pincement du trackpad) : zoom
  useEffect(() => {
    const v = vueRef.current;
    if (!v) return undefined;
    let raf = null, dz = 0, px = 0, py = 0, cx = 0, cy = 0;
    const appliquer = () => {
      raf = null;
      if (dz) zoomerEn(cx, cy, cam.current.z * Math.exp(Math.max(-0.5, Math.min(0.5, dz))));
      if (px || py) { cam.current = { ...cam.current, x: cam.current.x - px, y: cam.current.y - py }; setPanEnCours(true); peindreCam(); validerCam(); }
      dz = 0; px = 0; py = 0;
    };
    const onWheel = (e) => {
      e.preventDefault();
      const d = e.deltaMode === 1 ? 16 : 1;
      if (e.ctrlKey || e.metaKey) { dz += -e.deltaY * d * (Math.abs(e.deltaY) < 25 ? 0.01 : 0.0018); cx = e.clientX; cy = e.clientY; } else { px += e.deltaX * d; py += e.deltaY * d; }
      if (!raf) raf = requestAnimationFrame(appliquer);
    };
    v.addEventListener('wheel', onWheel, { passive: false });
    return () => { v.removeEventListener('wheel', onWheel); if (raf) cancelAnimationFrame(raf); };
  }, [board ? 1 : 0]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- sélection ---------- */
  const [selection, setSelection] = useState(() => new Set());
  const [editId, setEditId] = useState(null);
  const celluleRef = useRef(null); // (22/10) carte-tableau : { id, i, j } de la cellule qui a le curseur
  const focusEdition = useRef(null); // point du clic qui ouvre l'édition (la cellule visée prend le curseur)
  const [visee, setVisee] = useState(null); // id de la carte d'où part une flèche en cours de pose
  const [apercu, setApercu] = useState(null); // { ids, dx, dy } | { id, rect }
  const [apercuFleche, setApercuFleche] = useState(null); // { id, ...patch } pendant un geste sur une flèche
  const [marquee, setMarquee] = useState(null);
  const [guides, setGuides] = useState([]);
  const [outilMain, setOutilMain] = useState(false);
  const espace = useRef(false);
  /* un groupe se sélectionne d'un bloc */
  const avecGroupes = (ids) => { const n = new Set(ids); for (const id of ids) { const o = parId.get(id); if (o && o.groupe) for (const p of board.objects) if (p.groupe === o.groupe) n.add(p.id); } return n; };
  const selectionner = (ids, ajouter = false) => setSelection((s) => {
    const n = ajouter ? new Set(s) : new Set();
    for (const id of avecGroupes(ids)) { if (ajouter && s.has(id)) n.delete(id); else n.add(id); }
    return n;
  });
  const geo = (o) => {
    if (!o) return null;
    if (apercu && apercu.ids && apercu.ids.has(o.id)) return { ...o, x: o.x + apercu.dx, y: o.y + apercu.dy };
    if (apercu && apercu.id === o.id) return { ...o, ...apercu.rect };
    return o;
  };
  const focusTableau = () => { if (racineRef.current) racineRef.current.focus({ preventScroll: true }); };

  /* ---------- créer ---------- */
  const [couleurNouvelle, setCouleurNouvelle] = useState('jaune-franc');
  const centreVue = () => { const r = vueRef.current.getBoundingClientRect(); return versMonde(r.left + r.width / 2, r.top + r.height / 2); };
  const cascade = useRef(0);
  const creerCarte = (x, y, champs = {}, editer = true) => {
    const c = nouvelleCarte({ x: x - CARTE_BOARD.w / 2, y: y - CARTE_BOARD.h / 2, couleur: couleurNouvelle, z: zMax() + 1, ...champs });
    modifier((b) => ({ ...b, objects: [...b.objects, c] }), 'Carte');
    setSelection(new Set([c.id]));
    if (editer) setEditId(c.id);
    return c;
  };
  /** (22/10) une CARTE-TABLEAU (3 colonnes × 4 lignes, en-tête), en édition tout de suite */
  const creerCarteTableau = (x, y) => {
    const c = nouvelleCarte({ x: x - 190, y: y - 80, w: 380, h: 160, couleur: couleurNouvelle, z: zMax() + 1, grille: nouvelleGrille() });
    modifier((b) => ({ ...b, objects: [...b.objects, c] }), 'Boîte-tableau');
    setSelection(new Set([c.id]));
    setEditId(c.id);
    return c;
  };
  const importer = (ids, ou = null) => {
    const qs = ids.map((id) => flashcards.find((q) => q.id === id)).filter(Boolean);
    if (!qs.length) return [];
    // sans point de dépôt : à droite de ce qui est déjà posé (rien n'est recouvert)
    const B0 = bornes(objets);
    const p = ou ? { x: ou.x - 140, y: ou.y - 60 } : B0 ? { x: B0.r + 80, y: B0.y } : (() => { const c = centreVue(); return { x: c.x - 140, y: c.y - 60 }; })();
    const cartes = grilleDeCartes(qs, { x: p.x, y: p.y, colonnes: Math.min(3, qs.length), z: zMax() });
    modifier((b) => ({ ...b, objects: [...b.objects, ...cartes] }), qs.length > 1 ? `${qs.length} cartes importées` : 'Carte importée');
    setSelection(new Set(cartes.map((c) => c.id)));
    montrer(cartes);
    return cartes;
  };
  /** la vue se recadre sur ces objets s'ils ne sont pas entièrement visibles (zoom gardé, réduit s'il le faut) */
  const montrer = (objs) => {
    const B = bornes(objs), v = vueRef.current;
    if (!B || !v) return;
    const r = v.getBoundingClientRect(), c = cam.current;
    const vis = { x: -c.x / c.z, y: -c.y / c.z, w: r.width / c.z, h: r.height / c.z };
    if (B.x >= vis.x && B.y >= vis.y && B.r <= vis.x + vis.w && B.b <= vis.y + vis.h) return;
    const z = Math.max(ZOOM_BOARD.min, Math.min(c.z, (r.width - 120) / (B.r - B.x || 1), (r.height - 120) / (B.b - B.y || 1)));
    cam.current = { z, x: r.width / 2 - ((B.x + B.r) / 2) * z, y: r.height / 2 - ((B.y + B.b) / 2) * z };
    peindreCam(); validerCam();
  };
  /** la vue centrée sur ces objets (zoom gardé, réduit s'ils ne tiennent pas) */
  const centrer = (objs) => {
    const B = bornes(objs), v = vueRef.current;
    if (!B || !v) return;
    const r = v.getBoundingClientRect(), c = cam.current;
    const z = Math.max(ZOOM_BOARD.min, Math.min(c.z, (r.width - 120) / (B.r - B.x || 1), (r.height - 120) / (B.b - B.y || 1)));
    cam.current = { z, x: r.width / 2 - ((B.x + B.r) / 2) * z, y: r.height / 2 - ((B.y + B.b) / 2) * z };
    peindreCam(); validerCam();
  };
  /* (v1.1) « → Tableau » d'une flashcard déjà posée : le tableau se recentre sur sa carte (attend le chargement) */
  const aMontrer = useRef(null);
  const montrerFlashcard = (id) => {
    const b = boardRef.current;
    if (!b) { aMontrer.current = id; return; }
    const objs = b.objects.filter((o) => o.source && o.source.flashcardId === id);
    if (!objs.length) return;
    setSelection(new Set(objs.map((o) => o.id)));
    centrer(objs); focusTableau();
    // le tableau vient peut-être de s'ouvrir (le panneau se ferme, la vue s'élargit) : recentrer tant que la vue change
    const v = vueRef.current;
    if (v && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => centrer(objs));
      ro.observe(v);
      setTimeout(() => ro.disconnect(), 1200);
    }
  };
  useEffect(() => { if (board && aMontrer.current) { const id = aMontrer.current; aMontrer.current = null; requestAnimationFrame(() => (typeof id === 'object' ? montrerBoite(id.boiteId) : montrerFlashcard(id))); } }); // eslint-disable-line react-hooks/exhaustive-deps
  /* (22/10) « → Tableau » d'une BOÎTE du lecteur : sa carte (copie, même contenu, même couleur) ; déjà posée : montrée */
  const montrerBoite = (id) => {
    const b = boardRef.current;
    if (!b) { aMontrer.current = { boiteId: id }; return; } // le tableau se charge : il la montrera
    const objs = b.objects.filter((o) => o.source && o.source.boiteId === id);
    if (!objs.length) return;
    setSelection(new Set(objs.map((o) => o.id)));
    centrer(objs); focusTableau();
    const v = vueRef.current;
    if (v && typeof ResizeObserver !== 'undefined') { const ro = new ResizeObserver(() => centrer(objs)); ro.observe(v); setTimeout(() => ro.disconnect(), 1200); }
  };
  const ajouterBoite = (boite) => {
    if (objets.some((o) => o.source && o.source.boiteId === boite.id)) { montrerBoite(boite.id); return null; }
    const B0 = bornes(objets);
    const p = B0 ? { x: B0.r + 80, y: B0.y } : (() => { const c = centreVue(); return { x: c.x - 140, y: c.y - 60 }; })();
    const c = carteDepuisBoite(boite, { x: p.x, y: p.y, z: zMax() + 1 });
    modifier((b) => ({ ...b, objects: [...b.objects, c] }), 'Boîte ajoutée au tableau');
    setSelection(new Set([c.id]));
    montrer([c]);
    return c;
  };
  useImperativeHandle(ref, () => ({
    creerCarteTexte(texte) { const p = centreVue(); const k = (cascade.current++ % 6) * 26; const c = creerCarte(p.x + k, p.y + k, { corps: texte }, false); focusTableau(); return c; },
    importerFlashcards(ids) { return importer(ids); },
    montrerFlashcard, montrerBoite, ajouterBoite,
  }));
  const ajouterImages = async (fichiers, ou = null) => {
    const p = ou || centreVue();
    const nouvelles = [];
    let k = 0;
    for (const f of fichiers.filter(estImage)) {
      const blobId = await putBlob(f);
      let w = 320, h = 220;
      try { const bm = await createImageBitmap(f); const s = Math.min(1, 420 / Math.max(bm.width, bm.height)); w = Math.round(bm.width * s); h = Math.round(bm.height * s); } catch (e) { /* taille par défaut */ }
      nouvelles.push(nouvelleImage({ x: p.x - w / 2 + k, y: p.y - h / 2 + k, w, h, blobId, z: zMax() + 1 + k / 30 }));
      k += 30;
    }
    if (!nouvelles.length) return;
    modifier((b) => ({ ...b, objects: [...b.objects, ...nouvelles] }), nouvelles.length > 1 ? 'Images' : 'Image');
    setSelection(new Set(nouvelles.map((n) => n.id)));
  };

  /* ---------- modifier, supprimer, grouper ---------- */
  const modifierObjet = (id, patch, libelle) => modifier((b) => ({ ...b, objects: b.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)) }), libelle);
  const modifierFleche = (id, patch, libelle) => modifier((b) => ({ ...b, edges: b.edges.map((f) => (f.id === id ? { ...f, ...patch } : f)) }), libelle);
  const supprimerSelection = () => {
    if (!selection.size) return;
    const ids = selection;
    modifier((b) => ({ ...b, objects: b.objects.filter((o) => !ids.has(o.id)), edges: b.edges.filter((f) => !ids.has(f.id) && !ids.has(f.de) && !(f.vers && ids.has(f.vers))) }), 'Suppression');
    setSelection(new Set()); setEditId(null);
  };
  const dupliquer = () => {
    const src = objets.filter((o) => selection.has(o.id));
    if (!src.length) return;
    let z = zMax();
    const copies = src.map((o) => ({ ...JSON.parse(JSON.stringify(o)), id: genId(o.type === 'image' ? 'bi' : 'bc'), x: o.x + 30, y: o.y + 30, z: ++z, groupe: undefined }));
    modifier((b) => ({ ...b, objects: [...b.objects, ...copies] }), 'Duplication');
    setSelection(new Set(copies.map((c) => c.id)));
  };
  const grouper = (oui) => {
    const ids = [...selection].filter((id) => parId.has(id));
    if (ids.length < 2 && oui) return;
    const g = oui ? genId('g') : undefined;
    modifier((b) => ({ ...b, objects: b.objects.map((o) => (ids.includes(o.id) ? { ...o, groupe: g } : o)) }), oui ? 'Groupe' : 'Dégroupé');
  };

  /* ---------- gestes sur le fond : déplacement de la vue (doigt, Espace, main, molette), sélection rectangle ---------- */
  const doigts = useRef(new Map());
  const debutFond = (e) => {
    if (e.target !== vueRef.current && e.target !== mondeRef.current && !(e.target.closest && e.target.closest('.tb2-fleches-fond'))) return;
    focusTableau();
    if (editId) setEditId(null);
    if (visee) { // flèche en cours de pose : un clic sur le fond pose son bout libre
      const p = versMonde(e.clientX, e.clientY);
      const f = { ...nouvelleFleche({ de: visee, x: p.x, y: p.y }), ep1000: lireTaille('fleche') };
      modifier((b) => ({ ...b, edges: [...b.edges, f] }), 'Flèche');
      setVisee(null); setSelection(new Set([f.id]));
      return;
    }
    doigts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pan = e.pointerType === 'touch' || outilMain || espace.current || e.button === 1;
    if (e.button !== 0 && !pan) return;
    e.preventDefault();
    const d0 = { x: e.clientX, y: e.clientY }, c0 = { ...cam.current }, m0 = versMonde(e.clientX, e.clientY);
    let pince = null, bouge = false;
    const move = (ev) => {
      if (doigts.current.has(ev.pointerId)) doigts.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (doigts.current.size >= 2) { // PINCEMENT à deux doigts : zoom autour du milieu
        const [a, b2] = [...doigts.current.values()];
        const dist = Math.hypot(a.x - b2.x, a.y - b2.y), mx = (a.x + b2.x) / 2, my = (a.y + b2.y) / 2;
        if (!pince) pince = { dist, z: cam.current.z };
        else zoomerEn(mx, my, pince.z * (dist / (pince.dist || 1)));
        bouge = true; return;
      }
      if (ev.pointerId !== e.pointerId) return;
      if (!bouge && Math.abs(ev.clientX - d0.x) + Math.abs(ev.clientY - d0.y) < 3) return;
      bouge = true;
      if (pan) { cam.current = { ...c0, x: c0.x + ev.clientX - d0.x, y: c0.y + ev.clientY - d0.y }; setPanEnCours(true); peindreCam(); }
      else { const m1 = versMonde(ev.clientX, ev.clientY); setMarquee({ x: Math.min(m0.x, m1.x), y: Math.min(m0.y, m1.y), w: Math.abs(m1.x - m0.x), h: Math.abs(m1.y - m0.y) }); }
    };
    const up = (ev) => {
      doigts.current.delete(ev.pointerId);
      if (doigts.current.size) return;
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      if (pan || pince) { if (bouge) validerCam(); else if (!ev.shiftKey) setSelection(new Set()); return; }
      setMarquee((mq) => {
        if (mq && bouge) selectionner(objets.filter((o) => rectsSeCroisent(o, mq)).map((o) => o.id), ev.shiftKey);
        else if (!ev.shiftKey) setSelection(new Set());
        return null;
      });
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };
  const doubleClicFond = (e) => {
    if (e.target !== vueRef.current && e.target !== mondeRef.current) return;
    const p = versMonde(e.clientX, e.clientY);
    creerCarte(p.x, p.y);
  };

  /* ---------- gestes sur un objet : la règle du lecteur — clic = sélection, glisser n'importe où = déplacement
     (le groupe et la sélection entière suivent ; aimantation légère), clic sur une carte sélectionnée = édition ---------- */
  const appuiObjet = (e, o) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (visee) { // la flèche en cours de pose vise cette carte
      e.stopPropagation(); e.preventDefault();
      if (o.id !== visee && o.type === 'carte') { const f = { ...nouvelleFleche({ de: visee, vers: o.id }), ep1000: lireTaille('fleche') }; modifier((b) => ({ ...b, edges: [...b.edges, f] }), 'Flèche'); setSelection(new Set([f.id])); }
      setVisee(null); return;
    }
    if (outilMain || espace.current) return; // le fond fait le déplacement de vue
    e.stopPropagation(); e.preventDefault();
    focusTableau();
    if (editId && editId !== o.id) setEditId(null);
    if (e.shiftKey) { selectionner([o.id], true); return; }
    const deja = selection.has(o.id) && selection.size === 1;
    let sel = selection;
    if (!sel.has(o.id)) { sel = avecGroupes([o.id]); setSelection(sel); }
    const ids = new Set([...sel].filter((id) => parId.has(id)));
    const bouges = objets.filter((x) => ids.has(x.id)), autres = objets.filter((x) => !ids.has(x.id));
    const B = bornes(bouges), z = cam.current.z;
    let dx = 0, dy = 0;
    const suivi = suivrePointeur(e, {
      seuil: 3, arreter: true, glisser: true,
      move: (ev) => {
        dx = (ev.clientX - e.clientX) / z; dy = (ev.clientY - e.clientY) / z;
        const seuil = SEUIL_AIMANT / z, g = [];
        if (!ev.altKey && B) { // GUIDES D'ALIGNEMENT : bords et centres du groupe ↔ ceux des autres objets
          const xs = [B.x + dx, (B.x + B.r) / 2 + dx, B.r + dx], ys = [B.y + dy, (B.y + B.b) / 2 + dy, B.b + dy];
          let mx = null, my = null;
          for (const a of autres) {
            for (const ox of [a.x, a.x + a.w / 2, a.x + a.w]) xs.forEach((x) => { const d = ox - x; if (Math.abs(d) < seuil && (!mx || Math.abs(d) < Math.abs(mx.d))) mx = { d, v: ox }; });
            for (const oy of [a.y, a.y + a.h / 2, a.y + a.h]) ys.forEach((y) => { const d = oy - y; if (Math.abs(d) < seuil && (!my || Math.abs(d) < Math.abs(my.d))) my = { d, v: oy }; });
          }
          if (mx) { dx += mx.d; g.push({ x: mx.v }); }
          if (my) { dy += my.d; g.push({ y: my.v }); }
        }
        setGuides(g); setApercu({ ids, dx, dy });
      },
      fin: (ev, { bouge, annule }) => {
        geste.current = false; setGuides([]); setApercu(null);
        if (annule) return;
        if (!bouge) { if (deja && o.type === 'carte') { focusEdition.current = ev ? { x: ev.clientX, y: ev.clientY } : null; setEditId(o.id); } return; }
        const rx = Math.round(dx), ry = Math.round(dy);
        if (!rx && !ry) return;
        modifier((b) => ({ ...b, objects: b.objects.map((x) => (ids.has(x.id) ? { ...x, x: x.x + rx, y: x.y + ry } : x)),
          edges: b.edges.map((f) => (ids.has(f.de) && (!f.vers || ids.has(f.vers)) ? { ...f, x: f.x + rx, y: f.y + ry, points: (f.points || []).map((p) => ({ x: p.x + rx, y: p.y + ry })) } : f)) }),
        bouges.length > 1 ? `Déplacement de ${bouges.length} objets` : 'Déplacement');
      },
    });
    if (suivi) geste.current = true;
  };
  const redim = (e, o, coin) => {
    const z = cam.current.z, x0 = e.clientX, y0 = e.clientY;
    const base = { x: o.x, y: o.y, width: o.w, height: o.h };
    const ratio = o.type === 'image' ? o.h / o.w : null;
    let courant = null;
    const suivi = suivrePointeur(e, {
      seuil: 2, arreter: true,
      move: (ev) => { const r = redimRect(base, coin, (ev.clientX - x0) / z, (ev.clientY - y0) / z, { min: { width: CARTE_BOARD.min.w, height: o.type === 'image' ? 30 : CARTE_BOARD.min.h }, ratio }); courant = { x: r.x, y: r.y, w: r.width, h: r.height }; setApercu({ id: o.id, rect: courant }); },
      fin: (ev, { annule }) => { geste.current = false; setApercu(null); if (!annule && courant) modifierObjet(o.id, { x: Math.round(courant.x), y: Math.round(courant.y), w: Math.round(courant.w), h: Math.round(courant.h) }, 'Redimension'); },
    });
    if (suivi) geste.current = true;
  };

  /* ---------- flèches : le modèle et les gestes du lecteur ---------- */
  const cadreDe = (id) => { const o = geo(parId.get(id)); return o ? { x: o.x, y: o.y, w: o.w, h: o.h } : null; };
  const geoFleche = (f0, sel = false) => {
    const f = apercuFleche && apercuFleche.id === f0.id ? { ...f0, ...apercuFleche.patch } : f0;
    const cad = cadreDe(f.de);
    if (!cad) return null;
    const cible = f.vers ? cadreDe(f.vers) : null;
    const pts = sommetsConnecteur(cad, f, 1, 1, 1, null, cible);
    if (!pts) return null;
    const st = styleFleche(f);
    // (v1.1) `ep1000` : le monde du tableau compte comme une page de 1000 px ; une flèche d'avant : 1,5 × son facteur
    const base = Number.isFinite(f.ep1000) ? f.ep1000 : 1.5 * st.epaisseur;
    // couleur par défaut : l'encre du fond du tableau (une flèche de la couleur de sa carte se perdait sur les cartes)
    const defaut = theme === 'blanc' ? '#3b3b4f' : '#c9c9d6';
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return { f, pts, st, largeur: base * (sel ? 1.5 : 1), geo: geoPointe(f, base, { k: 1 }), couleurDefaut: defaut, couleur: st.couleur ? couleurHex(st.couleur, defaut) : defaut,
      boite: { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } };
  };
  // glisser le TRAIT : toute la flèche (un bout accroché à une carte reste accroché)
  const appuiTrait = (e, f) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    focusTableau();
    setSelection(new Set([f.id]));
    const z = cam.current.z;
    let d = null;
    const suivi = suivrePointeur(e, {
      seuil: 4, arreter: true, glisser: true,
      move: (ev) => { const dx = (ev.clientX - e.clientX) / z, dy = (ev.clientY - e.clientY) / z; d = { dx, dy };
        setApercuFleche({ id: f.id, patch: { points: (f.points || []).map((p) => ({ x: p.x + dx, y: p.y + dy })), ...(f.vers ? {} : { x: f.x + dx, y: f.y + dy }) } }); },
      fin: (ev, { bouge, annule }) => { geste.current = false; setApercuFleche(null); if (annule || !bouge || !d) return;
        modifierFleche(f.id, { points: (f.points || []).map((p) => ({ x: Math.round(p.x + d.dx), y: Math.round(p.y + d.dy) })), ...(f.vers ? {} : { x: Math.round(f.x + d.dx), y: Math.round(f.y + d.dy) }) }, 'Déplacement de la flèche'); },
    });
    if (suivi) geste.current = true;
  };
  const ajouterPoint = (f, cx, cy) => {
    const g = geoFleche(f);
    if (!g) return;
    const p = versMonde(cx, cy);
    const i = indexInsertion(g.pts, p, g.st.type === 'souple');
    const points = [...(f.points || [])];
    points.splice(i, 0, { x: Math.round(p.x), y: Math.round(p.y) });
    modifierFleche(f.id, { points }, 'Point ajouté à la flèche');
  };
  const glisserPoint = (e, f, i) => {
    const z = cam.current.z, p0 = (f.points || [])[i];
    if (!p0) return;
    let pts = null;
    const suivi = suivrePointeur(e, {
      seuil: 3, arreter: true,
      move: (ev) => { pts = f.points.map((p, j) => (j === i ? { x: p0.x + (ev.clientX - e.clientX) / z, y: p0.y + (ev.clientY - e.clientY) / z } : p)); setApercuFleche({ id: f.id, patch: { points: pts } }); },
      fin: (ev, { annule }) => { geste.current = false; setApercuFleche(null); if (!annule && pts) modifierFleche(f.id, { points: pts.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })) }, 'Point de la flèche déplacé'); },
    });
    if (suivi) geste.current = true;
  };
  // un BOUT : l'arrivée se déplace et se rattache à la carte où on la relâche ; le départ passe sur une autre carte
  const glisserBout = (e, f, bout, depart) => {
    e.stopPropagation();
    let p = null;
    const suivi = suivrePointeur(e, {
      seuil: 3, arreter: true,
      move: (ev) => { p = versMonde(ev.clientX, ev.clientY); if (bout === 'fin') setApercuFleche({ id: f.id, patch: { vers: null, x: p.x, y: p.y } }); },
      fin: (ev, { annule }) => {
        geste.current = false; setApercuFleche(null);
        if (annule || !p || !ev) return;
        const sous = boiteSous(ev.clientX, ev.clientY, bout === 'fin' ? f.de : null);
        const carte = sous && parId.get(sous) && parId.get(sous).type === 'carte' ? sous : null;
        if (bout === 'fin') modifierFleche(f.id, carte ? { vers: carte } : { vers: null, x: Math.round(p.x), y: Math.round(p.y) }, carte ? 'Flèche rattachée à une carte' : 'Déplacement d’un bout de la flèche');
        else if (carte && carte !== f.de && carte !== f.vers) modifierFleche(f.id, { de: carte }, 'Départ de la flèche déplacé');
      },
    });
    if (suivi) geste.current = true;
    void depart;
  };

  /* ---------- clavier (focus dans le tableau seulement) ---------- */
  const onKeyDown = (e) => {
    if (editId) return; // la frappe va au texte de la carte
    const mod = e.metaKey || e.ctrlKey, k = String(e.key).toLowerCase();
    if (mod && k === 'z') { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) hist.retablir(); else hist.annuler(); return; }
    if (mod && k === 'y') { e.preventDefault(); e.stopPropagation(); hist.retablir(); return; }
    if (mod && k === 'a') { e.preventDefault(); setSelection(new Set(objets.map((o) => o.id))); return; }
    if (mod && k === 'd') { e.preventDefault(); dupliquer(); return; }
    if (mod && k === 'g') { e.preventDefault(); grouper(!e.shiftKey); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); supprimerSelection(); return; }
    if (e.key === 'Escape') { e.stopPropagation(); setVisee(null); setSelection(new Set()); return; }
    if (e.key === 'Enter') { const s = selection.size === 1 && parId.get([...selection][0]); if (s && s.type === 'carte') { e.preventDefault(); setEditId(s.id); } return; }
    if (e.key === ' ' && !espace.current) { espace.current = true; if (vueRef.current) vueRef.current.classList.add('pan'); e.preventDefault(); return; }
    if (k === 'n' && !mod) { const p = centreVue(); creerCarte(p.x, p.y); e.preventDefault(); return; }
    const fl = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (fl && selection.size) { e.preventDefault(); const pas = e.shiftKey ? 10 : 1; modifier((b) => ({ ...b, objects: b.objects.map((o) => (selection.has(o.id) ? { ...o, x: o.x + fl[0] * pas, y: o.y + fl[1] * pas } : o)) }), 'Déplacement'); }
  };
  const onKeyUp = (e) => { if (e.key === ' ') { espace.current = false; if (vueRef.current) vueRef.current.classList.remove('pan'); } };
  // coller : une image devient un objet image ; un texte, une carte
  const onPaste = (e) => {
    if (editId || (e.target && e.target.closest && e.target.closest('input, textarea'))) return;
    const fichiers = [...(e.clipboardData ? e.clipboardData.files : [])].filter(estImage);
    if (fichiers.length) { e.preventDefault(); ajouterImages(fichiers); return; }
    const t = e.clipboardData && e.clipboardData.getData('text/plain');
    if (t && t.trim()) { e.preventDefault(); const p = centreVue(); creerCarte(p.x, p.y, { corps: t.trim() }, false); }
  };
  // déposer : des flashcards glissées depuis le panneau (aperçu fantôme à l'endroit visé), ou des images
  const [depot, setDepot] = useState(false);
  const [fantome, setFantome] = useState(null); // { x, y } (monde) : où tomberont les cartes glissées
  const nGlisse = useRef(1);
  useEffect(() => {
    const f = (e) => { if (e.detail && e.detail.actif) nGlisse.current = e.detail.n || 1; else setFantome(null); };
    window.addEventListener(EVT_GLISSE, f);
    return () => window.removeEventListener(EVT_GLISSE, f);
  }, []);
  const onDragOver = (e) => {
    const cartes = porteCartes(e);
    if (!cartes && ![...(e.dataTransfer.types || [])].includes('Files')) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
    if (!depot) setDepot(true);
    if (cartes) { const p = versMonde(e.clientX, e.clientY); setFantome((f) => (f && Math.abs(f.x - p.x) < 1 && Math.abs(f.y - p.y) < 1 ? f : { x: p.x, y: p.y })); }
  };
  const onDrop = (e) => {
    setDepot(false); setFantome(null);
    const p = versMonde(e.clientX, e.clientY);
    if (porteCartes(e)) { e.preventDefault(); importer(cartesGlissees(e), p); return; }
    const fichiers = [...(e.dataTransfer.files || [])].filter(estImage);
    if (fichiers.length) { e.preventDefault(); ajouterImages(fichiers, p); }
  };

  /* ---------- vue : zoom, recadrer sur tout, minimap, fond ---------- */
  const zoomBoutons = (f) => { const r = vueRef.current.getBoundingClientRect(); zoomerEn(r.left + r.width / 2, r.top + r.height / 2, cam.current.z * f); };
  const recadrer = () => {
    const B = bornes(objets);
    const r = vueRef.current.getBoundingClientRect();
    if (!B) { cam.current = { x: 80, y: 80, z: 1 }; peindreCam(); validerCam(); return; }
    const z = Math.max(ZOOM_BOARD.min, Math.min(1.5, Math.min((r.width - 120) / (B.r - B.x || 1), (r.height - 120) / (B.b - B.y || 1))));
    cam.current = { z, x: r.width / 2 - ((B.x + B.r) / 2) * z, y: r.height / 2 - ((B.y + B.b) / 2) * z };
    peindreCam(); validerCam();
  };
  const [minimap, setMinimap] = useState(() => { try { return localStorage.getItem('medrevise.board.minimap') === '1'; } catch (e) { return false; } });
  const basculerMinimap = () => setMinimap((v) => { try { localStorage.setItem('medrevise.board.minimap', v ? '0' : '1'); } catch (e) { /* ignore */ } return !v; });
  const changerTheme = () => { const b = boardRef.current; if (!b) return; const nb = { ...b, theme: theme === 'sombre' ? 'blanc' : 'sombre', viewport: { ...cam.current } }; setBoard(nb); put('board', nb).catch(() => {}); };

  /* ---------- export PNG : le tableau entier, dessiné sur un canvas ---------- */
  const [exportEnCours, setExportEnCours] = useState(false);
  const exporterPng = async () => {
    const B = bornes(objets);
    if (!B) return;
    setExportEnCours(true);
    try {
      const marge = 40, W = B.r - B.x + 2 * marge, H = B.b - B.y + 2 * marge;
      const s = Math.min(2, 4096 / Math.max(W, H));
      const cv = document.createElement('canvas'); cv.width = Math.round(W * s); cv.height = Math.round(H * s);
      const x = cv.getContext('2d');
      x.scale(s, s); x.translate(marge - B.x, marge - B.y);
      x.fillStyle = theme === 'sombre' ? '#14151a' : '#fbfbfd'; x.fillRect(B.x - marge, B.y - marge, W, H);
      for (const f of fleches) {
        const g = geoFleche(f); if (!g) continue;
        const ch = cheminFleche(g.pts, g.st, g.largeur, g.geo);
        x.strokeStyle = g.couleur; x.fillStyle = g.couleur; x.lineWidth = g.largeur; x.lineCap = 'round'; x.lineJoin = 'round';
        if (ch.dash) x.setLineDash(String(ch.dash).split(/[ ,]+/).map(Number)); else x.setLineDash([]);
        x.stroke(new Path2D(ch.d)); x.setLineDash([]);
        for (const t of ch.tetes) { const p = new Path2D(t.d); if (t.pleine) x.fill(p); else x.stroke(p); }
      }
      const lignes = (t, larg, police) => { x.font = police; const out = []; for (const par of String(t || '').split('\n')) { let l = ''; for (const m of par.split(/\s+/)) { const e = l ? l + ' ' + m : m; if (x.measureText(e).width > larg && l) { out.push(l); l = m; } else l = e; } out.push(l); } return out; };
      for (const o of objets) {
        const el = mondeRef.current && mondeRef.current.querySelector(`[data-objet="${o.id}"]`);
        if (o.type === 'image' || o.blobId) {
          const b = await getBlob(o.blobId).catch(() => null);
          if (o.type === 'image') { if (b) { const bm = await createImageBitmap(b); x.drawImage(bm, o.x, o.y, o.w, o.h); } continue; }
        }
        // le dessin des cartes (v1.1) : coins de 10, bord fin, ombre légère, encre #1d1d26, 16 px
        x.save(); x.shadowColor = 'rgba(0,0,0,.10)'; x.shadowBlur = 10; x.shadowOffsetY = 3;
        x.fillStyle = fondCarte(o.couleur); x.beginPath(); x.roundRect(o.x, o.y, o.w, o.h, 10); x.fill(); x.restore();
        x.strokeStyle = 'rgba(0,0,0,.08)'; x.lineWidth = 1; x.beginPath(); x.roundRect(o.x + 0.5, o.y + 0.5, o.w - 1, o.h - 1, 10); x.stroke();
        x.save(); x.beginPath(); x.roundRect(o.x, o.y, o.w, o.h, 10); x.clip();
        x.fillStyle = ENCRE_CARTE;
        let y = o.y + 10;
        const POLICE = '"Plus Jakarta Sans", system-ui, sans-serif';
        if (o.titre) for (const l of lignes(o.titre, o.w - 24, `600 16px ${POLICE}`)) { x.font = `600 16px ${POLICE}`; x.fillText(l, o.x + 12, y + 15); y += 20; }
        const src = o.source || {};
        const rangs = src.muscle ? Object.entries(src.muscle.lignes || {}).filter(([, v]) => v).map(([k, v]) => `${k} : ${v}`)
          : src.tableau ? [src.tableau.colonnes.join(' · '), ...src.tableau.lignes.map((l) => l.join(' · '))] : [];
        const svg = el && el.querySelector('.tb2-mol svg');
        if (svg) { try { const u = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })); const im = new Image(); await new Promise((ok) => { im.onload = ok; im.onerror = ok; im.src = u; }); const r = svg.getBoundingClientRect(); const k2 = Math.min((o.w - 24) / (r.width || 1), (o.h - (y - o.y) - 12) / (r.height || 1)); x.drawImage(im, o.x + 12, y + 4, r.width * k2, r.height * k2); y += r.height * k2 + 8; URL.revokeObjectURL(u); } catch (e) { /* molécule non dessinée */ } }
        if (o.blobId) { const b = await getBlob(o.blobId).catch(() => null); if (b) { const bm = await createImageBitmap(b); const k2 = Math.min((o.w - 24) / bm.width, Math.max(20, o.h - (y - o.y) - 40) / bm.height); x.drawImage(bm, o.x + 12, y + 4, bm.width * k2, bm.height * k2); y += bm.height * k2 + 10; } }
        for (const l of [...rangs.flatMap((r) => lignes(r, o.w - 24, `13px ${POLICE}`)), ...lignes(o.corps, o.w - 24, `16px ${POLICE}`)]) { x.font = `16px ${POLICE}`; if (y > o.y + o.h - 8) break; x.fillText(l, o.x + 12, y + 15); y += 20; }
        x.restore();
      }
      const blob = await new Promise((ok) => cv.toBlob(ok, 'image/png'));
      if (blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `tableau-${ficheId}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); window.__dernierExportTableau = { largeur: cv.width, hauteur: cv.height, octets: blob.size }; }
    } finally { setExportEnCours(false); }
  };

  if (!board) return <div className="tb tb2 chargement" ref={racineRef}><span className="gen-spinner" /></div>;

  /* ---------- rendu ---------- */
  const z = camEtat.z;
  const selObjets = objets.filter((o) => selection.has(o.id));
  const selFleches = fleches.filter((f) => selection.has(f.id));
  const versEcran = (r) => ({ x: r.x * z + camEtat.x, y: r.y * z + camEtat.y, w: r.w * z, h: r.h * z });
  const rv = vueRef.current ? vueRef.current.getBoundingClientRect() : { width: 800, height: 600 };
  const fSel = selFleches.length === 1 && !selObjets.length ? fleches.find((f) => f.id === selFleches[0].id) : null;
  const gSel = fSel && geoFleche(fSel, true);
  const itemsObjets = () => {
    if (selObjets.length > 1) return [
      { cle: 'couleur', couleur: selObjets[0].couleur, titre: 'Couleur des cartes', onCouleur: (c) => { setCouleurNouvelle(c); modifier((b) => ({ ...b, objects: b.objects.map((o) => (selection.has(o.id) && o.type === 'carte' ? { ...o, couleur: c } : o)) }), 'Couleur'); } },
      { cle: '|' },
      selObjets.every((o) => o.groupe && o.groupe === selObjets[0].groupe)
        ? { cle: 'degrouper', icone: <Icon name="layers" size={15} />, titre: 'Dégrouper (⇧⌘G)', onClick: () => grouper(false) }
        : { cle: 'grouper', icone: <Icon name="layers" size={15} />, titre: 'Grouper : ils se sélectionnent et se déplacent ensemble (⌘G)', onClick: () => grouper(true) },
      { cle: 'dupliquer', icone: <Icon name="copy" size={14} />, titre: 'Dupliquer (⌘D)', onClick: dupliquer },
      { cle: '|' },
      { cle: 'supprimer', titre: 'Supprimer (Suppr)', onClick: supprimerSelection },
    ];
    const o = selObjets[0];
    if (estGrille(o.grille)) {
      const g = o.grille, c = celluleRef.current && celluleRef.current.id === o.id ? celluleRef.current : null;
      const gi = c ? c.i : g.lignes.length - 1, gj = c ? c.j : g.cols.length - 1;
      const maj = (ng, lib) => modifierObjet(o.id, { grille: ng }, lib);
      const ic = (n) => <IconeOutil nom={n} size={16} />;
      return [
        { cle: 'couleur', couleur: o.couleur, titre: 'Couleur de la carte', onCouleur: (cl) => { setCouleurNouvelle(cl); modifierObjet(o.id, { couleur: cl }, 'Couleur de la carte'); } },
        { cle: '|' },
        { cle: 'ligne+', icone: ic('ligneAjout'), titre: 'Ajouter une ligne', desactive: g.lignes.length >= LIMITES_GRILLE.ligMax, onClick: () => maj(ajouterLigne(g, gi), 'Ligne ajoutée') },
        { cle: 'colonne+', icone: ic('colonneAjout'), titre: 'Ajouter une colonne', desactive: g.cols.length >= LIMITES_GRILLE.colMax, onClick: () => maj(ajouterColonne(g, gj), 'Colonne ajoutée') },
        { cle: 'ligne-', icone: ic('ligneMoins'), titre: 'Supprimer la ligne', desactive: g.lignes.length <= LIMITES_GRILLE.ligMin, onClick: () => { celluleRef.current = null; maj(retirerLigne(g, gi), 'Ligne supprimée'); } },
        { cle: 'colonne-', icone: ic('colonneMoins'), titre: 'Supprimer la colonne', desactive: g.cols.length <= LIMITES_GRILLE.colMin, onClick: () => { celluleRef.current = null; maj(retirerColonne(g, gj), 'Colonne supprimée'); } },
        { cle: 'entete', icone: ic('entete'), actif: !!g.entete, titre: g.entete ? 'Ligne d’en-tête : oui — cliquer pour la retirer' : 'Ligne d’en-tête : non', onClick: () => maj({ ...g, entete: !g.entete }, 'En-tête du tableau') },
        { cle: '|' },
        { cle: 'fleche', icone: <Icon name="arrowR" size={15} />, titre: 'Ajouter une flèche : clique ensuite la carte visée (ou un endroit du tableau)', onClick: () => setVisee(o.id) },
        { cle: 'ecrire', icone: <Icon name="edit" size={14} />, titre: 'Écrire dans le tableau (Entrée, ou double-clic)', onClick: () => setEditId(o.id) },
        { cle: '|' },
        { cle: 'supprimer', titre: 'Supprimer (Suppr)', onClick: supprimerSelection },
      ];
    }
    if (o.type === 'image') return [{ cle: 'dupliquer', icone: <Icon name="copy" size={14} />, titre: 'Dupliquer (⌘D)', onClick: dupliquer }, { cle: '|' }, { cle: 'supprimer', titre: 'Supprimer (Suppr)', onClick: supprimerSelection }];
    return [
      { cle: 'couleur', couleur: o.couleur, titre: 'Couleur de la carte', onCouleur: (c) => { setCouleurNouvelle(c); modifierObjet(o.id, { couleur: c }, 'Couleur de la carte'); } },
      { cle: '|' },
      { cle: 'fleche', icone: <Icon name="arrowR" size={15} />, titre: 'Ajouter une flèche : clique ensuite la carte visée (ou un endroit du tableau)', onClick: () => setVisee(o.id) },
      { cle: 'ecrire', icone: <Icon name="edit" size={14} />, titre: 'Écrire (Entrée, ou double-clic)', onClick: () => setEditId(o.id) },
      ...(o.source ? [{ cle: 'flashcard', icone: <Icon name="cards" size={14} />, titre: 'Ouvrir la flashcard d’origine', onClick: () => onOuvrirFlashcard && onOuvrirFlashcard(o.source.flashcardId) }] : []),
      { cle: '|' },
      { cle: 'supprimer', titre: 'Supprimer (Suppr)', onClick: supprimerSelection },
    ];
  };

  return (
    <div className={'tb tb2 theme-' + theme + (depot ? ' depot' : '') + (visee ? ' en-visee' : '')} ref={racineRef} tabIndex={0}
      onKeyDown={onKeyDown} onKeyUp={onKeyUp} onPaste={onPaste} onDragOver={onDragOver} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) { setDepot(false); setFantome(null); } }} onDrop={onDrop}>
      <div ref={vueRef} className={'tb-vue tb2-vue' + (outilMain ? ' pan' : '')} onPointerDown={debutFond} onDoubleClick={doubleClicFond}>
        <div ref={mondeRef} className="pdfr-page tb2-monde">
          <svg className="tb2-fleches" width="1" height="1" overflow="visible" aria-hidden="true">
            {fleches.map((f) => {
              const sel = selection.has(f.id);
              const g = geoFleche(f, sel);
              if (!g) return null;
              return (
                <TraitFleche key={f.id} pts={g.pts} st={g.st} largeur={g.largeur} geo={g.geo} couleur={g.couleur} sel={sel} halo={9}
                  classes={{ g: 'nb-conn sel-objet' + (sel ? ' sel' : ''), halo: 'nb-conn-halo', trait: 'nb-conn-trait', tete: 'nb-conn-tete', cible: 'nb-conn-cible' }}
                  donnees={{ 'data-fleche': f.id }} titre="Flèche — clic : la sélectionner · glisser : la déplacer · double-clic : ajouter un point"
                  cible={{ strokeWidth: Math.max(14, 14 / z), onPointerDown: (e) => { e.stopPropagation(); appuiTrait(e, f); }, onDoubleClick: (e) => { e.preventDefault(); e.stopPropagation(); ajouterPoint(f, e.clientX, e.clientY); } }} />
              );
            })}
            {marquee && <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} className="tb-marquee" />}
            {guides.map((g, i) => (g.x != null ? <line key={i} x1={g.x} x2={g.x} y1={-100000} y2={100000} className="tb-guide" /> : <line key={i} y1={g.y} y2={g.y} x1={-100000} x2={100000} className="tb-guide" />))}
          </svg>
          {objets.map((o0) => {
            const o = geo(o0);
            const sel = selection.has(o.id);
            if (o.type === 'image') {
              return (
                <div key={o.id} className={'tb2-image sel-objet' + (sel ? ' sel' : '')} data-objet={o.id} style={{ left: o.x, top: o.y, width: o.w, height: o.h, zIndex: (o.z || 0) + (sel ? 1000 : 0) }}
                  onPointerDown={(e) => appuiObjet(e, o0)}>
                  <ImageBlob blobId={o.blobId} className="tb2-img" />
                  {sel && <CadreSelection onCoin={(e, coin) => redim(e, o0, coin)} />}
                </div>
              );
            }
            return (
              <Carte key={o.id} o={o} sel={sel} edition={editId === o.id} visee={visee === o.id}
                onGrille={(g, lib) => modifierObjet(o.id, { grille: g }, lib)} onCellule={(i, j) => { celluleRef.current = { id: o.id, i, j }; }} focus={focusEdition.current}
                onAppui={(e) => appuiObjet(e, o0)} onEditer={(e) => { focusEdition.current = e ? { x: e.clientX, y: e.clientY } : null; setSelection(new Set([o.id])); setEditId(o.id); }}
                onFinEdition={({ titre, corps }) => { setEditId(null); if (titre !== o0.titre || corps !== o0.corps) modifierObjet(o.id, { titre, corps }, 'Texte de la carte'); focusTableau(); }}
                onCoin={(e, coin) => redim(e, o0, coin)} onOuvrirFlashcard={onOuvrirFlashcard} />
            );
          })}
          {fantome && Array.from({ length: Math.min(9, nGlisse.current) }, (_, i) => { // les cartes à venir, en grille (comme au dépôt)
            const col = Math.min(3, nGlisse.current);
            return <div key={i} className="tb2-fantome" aria-hidden="true" style={{ left: fantome.x - 140 + (i % col) * (CARTE_BOARD.w + 28), top: fantome.y - 60 + Math.floor(i / col) * (CARTE_BOARD.h + 28), width: CARTE_BOARD.w, height: CARTE_BOARD.h }}>{i === 0 ? (nGlisse.current > 1 ? `${nGlisse.current} cartes` : 'Déposer ici') : null}</div>;
          })}
          {gSel && (<>
            <PoigneesFleche points={gSel.st.points} couleur={gSel.couleur} classe="nb-ctl sel-zone" donnees={{ 'data-fleche': fSel.id }}
              position={(p) => ({ left: p.x, top: p.y })} onGlisser={(e, i) => glisserPoint(e, fSel, i)}
              onRetirer={(i) => modifierFleche(fSel.id, { points: fSel.points.filter((_, j) => j !== i) }, 'Point de la flèche retiré')}
              onTrait={(e) => appuiTrait(e, fSel)} />
            <span className="fl-bout sel-zone" data-bout="debut" style={{ left: gSel.pts[0].x, top: gSel.pts[0].y }} title="Départ — glisser sur une autre carte pour que la flèche en parte"
              onPointerDown={(e) => glisserBout(e, fSel, 'debut')} />
            <span className="fl-bout sel-zone" data-bout="fin" style={{ left: gSel.pts[gSel.pts.length - 1].x, top: gSel.pts[gSel.pts.length - 1].y }} title="Arrivée — glisser pour la déplacer, relâcher sur une carte pour l’y accrocher"
              onPointerDown={(e) => glisserBout(e, fSel, 'fin')} />
          </>)}
        </div>
      </div>

      {/* calque des mini barres : à l'échelle de l'écran (une « page » de la taille de la vue) */}
      <div className="pdfr-page tb2-calque" aria-hidden={false}>
        {/* (22/10) une carte-tableau en édition garde sa mini barre (+ ligne / + colonne au curseur) */}
        {!panEnCours && !apercu && !apercuFleche && (!editId || estGrille((parId.get(editId) || {}).grille)) && selObjets.length > 0 && (() => {
          const B = bornes(selObjets.map(geo));
          return <MiniBarre ancre={versEcran({ x: B.x, y: B.y, w: B.r - B.x, h: B.b - B.y })} pageWidth={rv.width} pageHeight={rv.height} items={itemsObjets()} />;
        })()}
        {!panEnCours && !apercuFleche && gSel && (
          <MiniBarre ancre={versEcran(gSel.boite)} pageWidth={rv.width} pageHeight={rv.height}
            items={itemsFleche(gSel.st, { couleurDefaut: gSel.couleurDefaut, onStyle: (patch, libelle) => modifierFleche(fSel.id, patch, libelle),
              ep: { valeur: Number.isFinite(fSel.ep1000) ? fSel.ep1000 : 1.5 * gSel.st.epaisseur, echelle: z, champs: (v) => ({ ep1000: v, epaisseur: +(v / 1.5).toFixed(3) }) }, onSupprimer: () => { setSelection(new Set()); modifier((b) => ({ ...b, edges: b.edges.filter((f) => f.id !== fSel.id) }), 'Flèche retirée'); } })} />
        )}
        {visee && <div className="tb2-visee mini-barre">Clique la carte visée (ou un endroit du tableau) · <button type="button" className="linklike" onClick={() => setVisee(null)}>Annuler</button></div>}
      </div>

      {/* barre du tableau */}
      <div className="tb2-barre" role="toolbar" aria-label="Tableau" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" className="tb2-btn principal" data-act="carte" onClick={() => { const p = centreVue(); creerCarte(p.x, p.y); }} title="Nouvelle carte (N, ou double-clic sur le fond)"><Icon name="plus" size={13} /> Carte</button>
        <button type="button" className="tb2-btn" data-act="carte-tableau" onClick={() => { const p = centreVue(); creerCarteTableau(p.x, p.y); }} title="Nouvelle boîte-tableau : une carte contenant un tableau (3 colonnes × 4 lignes)" aria-label="Nouvelle boîte-tableau"><IconeOutil nom="boiteTableau" size={15} /></button>
        <span className="tb2-sep" />
        <button type="button" className="tb2-btn" data-act="annuler" onClick={hist.annuler} disabled={!hist.peutAnnuler} title={hist.peutAnnuler ? `Annuler — ${hist.libelleAnnuler} (⌘Z)` : 'Annuler (⌘Z)'}><IconeOutil nom="annuler" size={14} /></button>
        <button type="button" className="tb2-btn" data-act="retablir" onClick={hist.retablir} disabled={!hist.peutRetablir} title="Rétablir (⇧⌘Z)"><IconeOutil nom="retablir" size={14} /></button>
        <span className="tb2-sep" />
        <button type="button" className="tb2-btn" onClick={() => zoomBoutons(1 / 1.2)} title="Dézoomer (⌘ + molette, ou pincer)" aria-label="Dézoomer"><span className="tb2-moins" aria-hidden="true">−</span></button>
        <span className="tb2-zoom tnum" data-zoom={z}>{Math.round(z * 100)} %</span>
        <button type="button" className="tb2-btn" onClick={() => zoomBoutons(1.2)} title="Zoomer" aria-label="Zoomer"><Icon name="plus" size={13} /></button>
        <button type="button" className="tb2-btn" data-act="recadrer" onClick={recadrer} title="Recadrer sur tout"><Icon name="maximize" size={13} /></button>
        <button type="button" className={'tb2-btn' + (minimap ? ' actif' : '')} data-act="minimap" onClick={basculerMinimap} title="Minimap" aria-pressed={minimap}><Icon name="grid" size={14} /></button>
        <button type="button" className="tb2-btn" data-act="fond" onClick={changerTheme} title={theme === 'sombre' ? 'Fond blanc' : 'Fond sombre'} aria-label="Fond du tableau"><Icon name={theme === 'sombre' ? 'sun' : 'moon'} size={14} /></button>
        <button type="button" className="tb2-btn" data-act="png" onClick={exporterPng} disabled={exportEnCours || !objets.length} title="Exporter le tableau en image PNG"><Icon name="image" size={14} /></button>
      </div>

      {minimap && objets.length > 0 && (() => {
        const B = bornes(objets), Wv = rv.width / z, Hv = rv.height / z, vx = -camEtat.x / z, vy = -camEtat.y / z;
        const X0 = Math.min(B.x, vx), Y0 = Math.min(B.y, vy), X1 = Math.max(B.r, vx + Wv), Y1 = Math.max(B.b, vy + Hv);
        const k = Math.min(180 / (X1 - X0 || 1), 120 / (Y1 - Y0 || 1));
        const aller = (e) => { const r = e.currentTarget.getBoundingClientRect(); const mx = X0 + (e.clientX - r.left) / k, my = Y0 + (e.clientY - r.top) / k; cam.current = { ...cam.current, x: rv.width / 2 - mx * z, y: rv.height / 2 - my * z }; peindreCam(); validerCam(); };
        return (
          <div className="tb2-minimap" style={{ width: (X1 - X0) * k, height: (Y1 - Y0) * k }} onPointerDown={(e) => { e.stopPropagation(); aller(e); }} title="Minimap — cliquer pour y aller">
            {objets.map((o) => <span key={o.id} className="tb2-mm-obj" style={{ left: (o.x - X0) * k, top: (o.y - Y0) * k, width: Math.max(2, o.w * k), height: Math.max(2, o.h * k), background: o.type === 'image' ? '#8a8a99' : couleurHex(o.couleur) }} />)}
            <span className="tb2-mm-vue" style={{ left: (vx - X0) * k, top: (vy - Y0) * k, width: Wv * k, height: Hv * k }} />
          </div>
        );
      })()}

      {/* (22/10) tableau vide : une seule phrase, centrée */}
      {!objets.length && (
        <div className="tb2-vide-tableau" data-vide="1">
          <div className="tb2-vide-titre">Double-cliquez pour ajouter une carte, ou glissez une flashcard ici</div>
        </div>
      )}
      {board.repris > 0 && <div className="tb2-info">Ton tableau d’avant ({board.repris} éléments) a été repris ici.</div>}
    </div>
  );
});
