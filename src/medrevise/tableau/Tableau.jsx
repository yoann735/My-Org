/* ============================================================
   MedRevise — TABLEAU type Miro (04/10). Voir docs/mecanique-miro.md.

   Canvas infini en DOM transformé :
     .tb-vue (fond grille CSS, capte les gestes)
       └─ .tb-monde   transform: translate(x,y) scale(z)   ← la caméra
            ├─ <svg.tb-liens>  flèches (coordonnées monde)
            └─ .tb-carte × N   (coordonnées monde)

   FLUIDITÉ : pendant un pan/zoom, la caméra est écrite DIRECTEMENT sur le style de
   .tb-monde et de la grille (une fois par image), sans rendu React ; l'état React
   n'est validé qu'au repos (150 ms). Le GPU ne déplace qu'une couche.

   DONNÉES : un enregistrement par carte/lien (store `tableau`, lib/tableau.js),
   écrits via une pile d'annulation DÉDIÉE (lib/annotHistory.js#useAnnotHistorique)
   dont les effets s'affichent de façon synchrone — aucun flash en fin de geste.

   CLAVIER : uniquement quand le focus est DANS le tableau (.tb) ; les raccourcis
   globaux du lecteur ignorent ces événements (voir PdfReader).
   ============================================================ */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { getAll } from '../lib/storage.js';
import { useAnnotHistorique, cmdCreer, cmdModifier, cmdSupprimer, cmdGroupe } from '../lib/annotHistory.js';
import { newCarte, newLien, CARTE_DEFAUT, CARTE_MIN, STYLES_LIEN } from '../lib/tableau.js';
import { couleurHex, avecAlpha, opaciteFondBoite } from '../pdf/pdfShared.js';
import { IconeOutil } from '../pdf/IconesOutils.jsx';
import { SelecteurCouleurs } from '../pdf/Couleurs.jsx';
import { cheminLien, ancreDe, coteAuto, coteLePlusProche } from './geometrie.js';

const ZMIN = 0.1, ZMAX = 4;
const SEUIL_CULLING = 150;
const lireCam = (ficheId) => {
  try { const v = JSON.parse(localStorage.getItem('medrevise.tableau.cam.' + ficheId) || 'null'); if (v && Number.isFinite(v.z)) return v; } catch (e) { /* ignore */ }
  return { x: 40, y: 40, z: 1 };
};
const ecrireCam = (ficheId, c) => { try { localStorage.setItem('medrevise.tableau.cam.' + ficheId, JSON.stringify(c)); } catch (e) { /* ignore */ } };
const rectsSeCroisent = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const couleurCarte = (c) => couleurHex(c, '#FFD84D');

export const Tableau = forwardRef(function Tableau({ ficheId }, ref) {
  /* ---------- données ---------- */
  const [elements, setElements] = useState([]);
  const recharger = useCallback(async () => {
    const tous = (await getAll('tableau')) || [];
    setElements(tous.filter((e) => e && e.ficheId === ficheId));
  }, [ficheId]);
  const appliquerLocal = (effets) => {
    if (!effets.some((e) => e.store === 'tableau')) return;
    setElements((arr) => {
      let res = arr;
      for (const e of effets) {
        if (e.store !== 'tableau') continue;
        const id = (e.apres || e.avant || {}).id;
        if (!id) continue;
        res = e.apres ? (res.some((x) => x.id === id) ? res.map((x) => (x.id === id ? e.apres : x)) : [...res, e.apres]) : res.filter((x) => x.id !== id);
      }
      return res;
    });
  };
  const hist = useAnnotHistorique(recharger, appliquerLocal);
  useEffect(() => { recharger(); hist.vider(); }, [ficheId]); // eslint-disable-line react-hooks/exhaustive-deps

  const cartes = useMemo(() => elements.filter((e) => e.type === 'carte').sort((a, b) => (a.z - b.z) || String(a.createdAt).localeCompare(String(b.createdAt))), [elements]);
  const liens = useMemo(() => elements.filter((e) => e.type === 'lien'), [elements]);
  const parId = useMemo(() => new Map(elements.map((e) => [e.id, e])), [elements]);

  /* ---------- caméra ---------- */
  const vueRef = useRef(null);
  const mondeRef = useRef(null);
  const cam = useRef(lireCam(ficheId));
  const [camEtat, setCamEtat] = useState(cam.current); // validé au repos (culling, % affiché)
  const minuterieCam = useRef(null);
  const peindreCam = () => {
    const c = cam.current;
    if (mondeRef.current) mondeRef.current.style.transform = `translate(${c.x}px, ${c.y}px) scale(${c.z})`;
    const v = vueRef.current;
    if (v) {
      const pas = 24 * c.z;
      v.style.backgroundSize = `${pas}px ${pas}px`;
      v.style.backgroundPosition = `${c.x}px ${c.y}px`;
    }
  };
  const validerCam = () => {
    clearTimeout(minuterieCam.current);
    minuterieCam.current = setTimeout(() => { setCamEtat({ ...cam.current }); ecrireCam(ficheId, cam.current); }, 150);
  };
  useLayoutEffect(() => { cam.current = lireCam(ficheId); peindreCam(); setCamEtat({ ...cam.current }); }, [ficheId]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { peindreCam(); });
  const versMonde = (cx, cy) => {
    const r = vueRef.current.getBoundingClientRect();
    const c = cam.current;
    return { x: (cx - r.left - c.x) / c.z, y: (cy - r.top - c.y) / c.z };
  };
  const zoomerEn = (cx, cy, zNouveau) => {
    const r = vueRef.current.getBoundingClientRect();
    const c = cam.current;
    const z = Math.max(ZMIN, Math.min(ZMAX, zNouveau));
    const mx = (cx - r.left - c.x) / c.z, my = (cy - r.top - c.y) / c.z;
    cam.current = { z, x: cx - r.left - mx * z, y: cy - r.top - my * z };
    peindreCam(); validerCam();
  };
  // molette / trackpad : pan ; Cmd/Ctrl (ou pincement) : zoom — regroupés par image
  useEffect(() => {
    const v = vueRef.current;
    if (!v) return undefined;
    let raf = null, dz = 0, px = 0, py = 0, cx = 0, cy = 0;
    const appliquer = () => {
      raf = null;
      if (dz) zoomerEn(cx, cy, cam.current.z * Math.exp(Math.max(-0.5, Math.min(0.5, dz))));
      if (px || py) { cam.current = { ...cam.current, x: cam.current.x - px, y: cam.current.y - py }; peindreCam(); validerCam(); }
      dz = 0; px = 0; py = 0;
    };
    const onWheel = (e) => {
      e.preventDefault();
      const d = e.deltaMode === 1 ? 16 : 1;
      if (e.ctrlKey || e.metaKey) { dz += -e.deltaY * d * (Math.abs(e.deltaY) < 25 ? 0.01 : 0.0018); cx = e.clientX; cy = e.clientY; }
      else { px += e.deltaX * d; py += e.deltaY * d; }
      if (!raf) raf = requestAnimationFrame(appliquer);
    };
    v.addEventListener('wheel', onWheel, { passive: false });
    return () => { v.removeEventListener('wheel', onWheel); if (raf) cancelAnimationFrame(raf); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- sélection, édition ---------- */
  const [selection, setSelection] = useState(() => new Set());
  const [editId, setEditId] = useState(null);
  const [outilMain, setOutilMain] = useState(false);
  const espace = useRef(false);
  const tbRef = useRef(null);
  const selectionner = (ids, ajouter = false) => setSelection((s) => {
    const n = ajouter ? new Set(s) : new Set();
    ids.forEach((id) => { if (ajouter && s.has(id)) n.delete(id); else n.add(id); });
    return n;
  });
  const [apercu, setApercu] = useState(null); // { ids:Set, dx, dy } | { id, w, h } pendant un geste
  const [marquee, setMarquee] = useState(null); // rectangle de sélection (monde)
  const [guides, setGuides] = useState([]); // lignes d'alignement pendant un déplacement
  const [lienEnCours, setLienEnCours] = useState(null); // { de:{id,cote}, x, y } fantôme

  // géométrie AFFICHÉE d'une carte (aperçu de geste compris) : sert aux flèches
  const geo = (c) => {
    if (!c) return null;
    if (apercu && apercu.ids && apercu.ids.has(c.id)) return { ...c, x: c.x + apercu.dx, y: c.y + apercu.dy };
    if (apercu && apercu.id === c.id) return { ...c, w: apercu.w, h: apercu.h };
    return c;
  };

  /* ---------- créer / modifier ---------- */
  const [couleurNouvelle, setCouleurNouvelle] = useState('jaune');
  const zMax = () => cartes.reduce((m, c) => Math.max(m, c.z || 0), 0);
  const creerCarte = (x, y, texte = '', editer = true) => {
    const c = newCarte({ ficheId, x: x - CARTE_DEFAUT.w / 2, y: y - CARTE_DEFAUT.h / 2, texte, couleur: couleurNouvelle, z: zMax() + 1 });
    if (texte) c.h = hauteurPourTexte(texte, c.w);
    hist.appliquer(cmdCreer('tableau', c, 'Carte'));
    setSelection(new Set([c.id]));
    if (editer) setEditId(c.id);
    return c;
  };
  const centreVue = () => {
    const r = vueRef.current.getBoundingClientRect();
    return versMonde(r.left + r.width / 2, r.top + r.height / 2);
  };
  // API pour le lecteur (création depuis une sélection du PDF)
  const cascade = useRef(0);
  useImperativeHandle(ref, () => ({
    creerCarteTexte(texte) {
      const p = centreVue();
      const k = (cascade.current++ % 6) * 26;
      const c = creerCarte(p.x + k, p.y + k, texte, false);
      if (tbRef.current) tbRef.current.focus({ preventScroll: true });
      return c;
    },
  }));
  const modifier = (avant, patch, libelle) => hist.appliquer(cmdModifier('tableau', avant, { ...avant, ...patch }, libelle));
  const supprimerSelection = () => {
    if (!selection.size) return;
    const ids = selection;
    const cartesSup = cartes.filter((c) => ids.has(c.id));
    const idsCartes = new Set(cartesSup.map((c) => c.id));
    const liensSup = liens.filter((l) => ids.has(l.id) || idsCartes.has(l.de.id) || idsCartes.has(l.vers.id));
    const cmds = [...liensSup, ...cartesSup].map((e) => cmdSupprimer('tableau', e, 'Suppression'));
    if (!cmds.length) return;
    hist.appliquer(cmdGroupe(cartesSup.length > 1 ? `Suppression de ${cartesSup.length} cartes` : 'Suppression', cmds));
    setSelection(new Set()); setEditId(null);
  };
  const dupliquer = () => {
    const src = cartes.filter((c) => selection.has(c.id));
    if (!src.length) return;
    let z = zMax();
    const copies = src.map((c) => ({ ...newCarte({ ficheId, x: c.x + 30, y: c.y + 30, w: c.w, h: c.h, texte: c.texte, couleur: c.couleur, z: ++z }) }));
    hist.appliquer(cmdGroupe('Duplication', copies.map((c) => cmdCreer('tableau', c))));
    setSelection(new Set(copies.map((c) => c.id)));
  };
  const auPremierPlan = () => {
    let z = zMax();
    const cmds = cartes.filter((c) => selection.has(c.id)).map((c) => cmdModifier('tableau', c, { ...c, z: ++z }));
    if (cmds.length) hist.appliquer(cmdGroupe('Premier plan', cmds));
  };
  const colorer = (couleur) => {
    setCouleurNouvelle(couleur);
    const cmds = cartes.filter((c) => selection.has(c.id) && c.couleur !== couleur).map((c) => cmdModifier('tableau', c, { ...c, couleur }));
    if (cmds.length) hist.appliquer(cmdGroupe('Couleur', cmds));
  };
  const modifierLiens = (patch, libelle) => {
    const cmds = liens.filter((l) => selection.has(l.id)).map((l) => cmdModifier('tableau', l, { ...l, ...patch }));
    if (cmds.length) hist.appliquer(cmdGroupe(libelle, cmds));
  };

  /* ---------- gestes sur le fond : pan, sélection rectangle, double-clic ---------- */
  const debutFond = (e) => {
    if (e.target !== vueRef.current && !e.target.classList.contains('tb-monde') && !e.target.closest('.tb-liens-fond')) return;
    if (tbRef.current) tbRef.current.focus({ preventScroll: true });
    const pan = outilMain || espace.current || e.button === 1;
    if (e.button !== 0 && !pan) return;
    e.preventDefault();
    if (editId) setEditId(null);
    const d0 = { x: e.clientX, y: e.clientY };
    const c0 = { ...cam.current };
    const m0 = versMonde(e.clientX, e.clientY);
    let bouge = false;
    const move = (ev) => {
      if (!bouge && Math.abs(ev.clientX - d0.x) + Math.abs(ev.clientY - d0.y) < 3) return;
      bouge = true;
      if (pan) {
        cam.current = { ...c0, x: c0.x + ev.clientX - d0.x, y: c0.y + ev.clientY - d0.y };
        peindreCam();
      } else {
        const m1 = versMonde(ev.clientX, ev.clientY);
        setMarquee({ x: Math.min(m0.x, m1.x), y: Math.min(m0.y, m1.y), w: Math.abs(m1.x - m0.x), h: Math.abs(m1.y - m0.y) });
      }
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (pan) { if (bouge) validerCam(); return; }
      setMarquee((mq) => {
        if (mq && bouge) {
          const ids = cartes.filter((c) => rectsSeCroisent(c, mq)).map((c) => c.id);
          selectionner(ids, ev.shiftKey);
        } else if (!ev.shiftKey) setSelection(new Set());
        return null;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const doubleClicFond = (e) => {
    if (e.target !== vueRef.current && !e.target.classList.contains('tb-monde')) return;
    const p = versMonde(e.clientX, e.clientY);
    creerCarte(p.x, p.y);
  };

  /* ---------- gestes sur une carte : sélectionner, déplacer (groupe), aimanter ---------- */
  const SEUIL_AIMANT = 6; // px à l'écran
  const debutCarte = (e, carte) => {
    if (e.button !== 0 || editId === carte.id) return;
    if (outilMain || espace.current) return; // laisse le fond faire le pan
    e.stopPropagation();
    e.preventDefault();
    if (tbRef.current) tbRef.current.focus({ preventScroll: true });
    if (editId) setEditId(null);
    let sel = selection;
    if (e.shiftKey) { selectionner([carte.id], true); return; }
    if (!sel.has(carte.id)) { sel = new Set([carte.id]); setSelection(sel); }
    const ids = new Set([...sel].filter((id) => parId.get(id) && parId.get(id).type === 'carte'));
    const d0 = { x: e.clientX, y: e.clientY };
    const z = cam.current.z;
    const bouges = cartes.filter((c) => ids.has(c.id));
    const autres = cartes.filter((c) => !ids.has(c.id));
    const bx = Math.min(...bouges.map((c) => c.x)), by = Math.min(...bouges.map((c) => c.y));
    const bw = Math.max(...bouges.map((c) => c.x + c.w)) - bx, bh = Math.max(...bouges.map((c) => c.y + c.h)) - by;
    let bouge = false, dx = 0, dy = 0;
    const move = (ev) => {
      if (!bouge && Math.abs(ev.clientX - d0.x) + Math.abs(ev.clientY - d0.y) < 3) return;
      bouge = true;
      dx = (ev.clientX - d0.x) / z; dy = (ev.clientY - d0.y) / z;
      // GUIDES D'ALIGNEMENT : bords et centres du groupe ↔ bords et centres des autres cartes
      const seuil = SEUIL_AIMANT / z, g = [];
      if (!ev.altKey) {
        const xs = [bx + dx, bx + dx + bw / 2, bx + dx + bw], ys = [by + dy, by + dy + bh / 2, by + dy + bh];
        let meilleurX = null, meilleurY = null;
        for (const o of autres) {
          for (const ox of [o.x, o.x + o.w / 2, o.x + o.w]) xs.forEach((x) => { const d = ox - x; if (Math.abs(d) < seuil && (!meilleurX || Math.abs(d) < Math.abs(meilleurX.d))) meilleurX = { d, v: ox }; });
          for (const oy of [o.y, o.y + o.h / 2, o.y + o.h]) ys.forEach((y) => { const d = oy - y; if (Math.abs(d) < seuil && (!meilleurY || Math.abs(d) < Math.abs(meilleurY.d))) meilleurY = { d, v: oy }; });
        }
        if (meilleurX) { dx += meilleurX.d; g.push({ x: meilleurX.v }); }
        if (meilleurY) { dy += meilleurY.d; g.push({ y: meilleurY.v }); }
      }
      setGuides(g);
      setApercu({ ids, dx, dy });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setGuides([]);
      setApercu(null);
      if (!bouge) return;
      const rx = Math.round(dx), ry = Math.round(dy);
      if (!rx && !ry) return;
      hist.appliquer(cmdGroupe(bouges.length > 1 ? `Déplacement de ${bouges.length} cartes` : 'Déplacement', bouges.map((c) => cmdModifier('tableau', c, { ...c, x: c.x + rx, y: c.y + ry }))));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const debutRedim = (e, carte) => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    const d0 = { x: e.clientX, y: e.clientY };
    const z = cam.current.z;
    let w = carte.w, h = carte.h, bouge = false;
    const move = (ev) => {
      bouge = true;
      w = Math.max(CARTE_MIN.w, Math.round(carte.w + (ev.clientX - d0.x) / z));
      h = Math.max(CARTE_MIN.h, Math.round(carte.h + (ev.clientY - d0.y) / z));
      setApercu({ id: carte.id, w, h });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setApercu(null);
      if (bouge && (w !== carte.w || h !== carte.h)) modifier(carte, { w, h }, 'Redimension');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /* ---------- liens : créer depuis une ancre, rediriger un bout ---------- */
  const carteSous = (cx, cy, sauf) => {
    const p = versMonde(cx, cy);
    return [...cartes].reverse().find((c) => c.id !== sauf && p.x >= c.x - 8 && p.x <= c.x + c.w + 8 && p.y >= c.y - 8 && p.y <= c.y + c.h + 8) || null;
  };
  const debutLien = (e, carte, cote, lienExistant = null, bout = null) => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    const fixe = lienExistant ? (bout === 'vers' ? lienExistant.de : lienExistant.vers) : { id: carte.id, cote };
    const move = (ev) => { const p = versMonde(ev.clientX, ev.clientY); setLienEnCours({ fixe, bout: bout || 'vers', x: p.x, y: p.y, lienId: lienExistant && lienExistant.id }); };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setLienEnCours(null);
      const cible = carteSous(ev.clientX, ev.clientY, fixe.id);
      if (!cible) return;
      const p = versMonde(ev.clientX, ev.clientY);
      const coteCible = coteLePlusProche(cible, p);
      if (lienExistant) {
        const patch = bout === 'vers' ? { vers: { id: cible.id, cote: coteCible } } : { de: { id: cible.id, cote: coteCible } };
        modifier(lienExistant, patch, 'Flèche redirigée');
      } else {
        const l = newLien({ ficheId, de: fixe, vers: { id: cible.id, cote: coteCible }, style: styleNouveau });
        hist.appliquer(cmdCreer('tableau', l, 'Flèche'));
        setSelection(new Set([l.id]));
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const [styleNouveau, setStyleNouveau] = useState('courbe');

  /* ---------- clavier (focus DANS le tableau seulement) ---------- */
  const onKeyDown = (e) => {
    if (editId) return; // la frappe va au texte de la carte
    const mod = e.metaKey || e.ctrlKey;
    const k = String(e.key).toLowerCase();
    if (mod && k === 'z') { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) hist.retablir(); else hist.annuler(); return; }
    if (mod && k === 'a') { e.preventDefault(); setSelection(new Set(cartes.map((c) => c.id))); return; }
    if (mod && k === 'd') { e.preventDefault(); dupliquer(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); supprimerSelection(); return; }
    if (e.key === 'Escape') { e.stopPropagation(); setSelection(new Set()); return; }
    if (e.key === 'Enter') {
      const seule = selection.size === 1 && parId.get([...selection][0]);
      if (seule && seule.type === 'carte') { e.preventDefault(); setEditId(seule.id); }
      return;
    }
    if (e.key === ' ' && !espace.current) { espace.current = true; if (vueRef.current) vueRef.current.classList.add('pan'); e.preventDefault(); return; }
    if (k === 'h' && !mod) { setOutilMain((v) => !v); return; }
    if (k === 'n' && !mod) { const p = centreVue(); creerCarte(p.x, p.y); e.preventDefault(); return; }
    const fl = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (fl) {
      e.preventDefault();
      const pas = e.shiftKey ? 10 : 1;
      const cmds = cartes.filter((c) => selection.has(c.id)).map((c) => cmdModifier('tableau', c, { ...c, x: c.x + fl[0] * pas, y: c.y + fl[1] * pas }));
      if (cmds.length) hist.appliquer(cmdGroupe('Déplacement', cmds));
    }
  };
  const onKeyUp = (e) => { if (e.key === ' ') { espace.current = false; if (vueRef.current) vueRef.current.classList.remove('pan'); } };

  /* ---------- édition du texte d'une carte ---------- */
  const zoneRef = useRef(null);
  /* BROUILLON : le texte en cours de frappe, gardé à chaque touche. Si le tableau est
     démonté PENDANT l'édition (lecteur fermé, disposition changée), le blur de la zone
     n'est pas garanti — on écrit ce brouillon au démontage, rien n'est perdu. */
  const brouillon = useRef(null); // { carte, texte }
  const terminerRef = useRef(null);
  useEffect(() => () => { const b = brouillon.current; if (b && terminerRef.current) terminerRef.current(b.carte, b.texte, true); }, []);
  const terminerEdition = (carte, texte, auDemontage = false) => {
    brouillon.current = null;
    if (auDemontage) {
      if (texte !== carte.texte) hist.appliquer(cmdModifier('tableau', carte, { ...carte, texte, h: Math.max(carte.h, hauteurPourTexte(texte, carte.w)) }, 'Texte de la carte'));
      return;
    }
    setEditId(null);
    const t = texte;
    const h = Math.max(carte.h, hauteurPourTexte(t, carte.w));
    if (t !== carte.texte || h !== carte.h) modifier(carte, { texte: t, h }, 'Texte de la carte');
    if (tbRef.current) tbRef.current.focus({ preventScroll: true });
  };

  terminerRef.current = terminerEdition;

  /* ---------- zoom : boutons, tout afficher ---------- */
  const zoomBoutons = (f) => { const r = vueRef.current.getBoundingClientRect(); zoomerEn(r.left + r.width / 2, r.top + r.height / 2, cam.current.z * f); };
  const toutAfficher = () => {
    if (!cartes.length) { cam.current = { x: 40, y: 40, z: 1 }; peindreCam(); validerCam(); return; }
    const r = vueRef.current.getBoundingClientRect();
    const x0 = Math.min(...cartes.map((c) => c.x)), y0 = Math.min(...cartes.map((c) => c.y));
    const x1 = Math.max(...cartes.map((c) => c.x + c.w)), y1 = Math.max(...cartes.map((c) => c.y + c.h));
    const z = Math.max(ZMIN, Math.min(1.5, Math.min((r.width - 80) / (x1 - x0 || 1), (r.height - 80) / (y1 - y0 || 1))));
    cam.current = { z, x: r.width / 2 - ((x0 + x1) / 2) * z, y: r.height / 2 - ((y0 + y1) / 2) * z };
    peindreCam(); validerCam();
  };

  /* ---------- culling (au-delà de SEUIL_CULLING cartes) ---------- */
  const visibles = useMemo(() => {
    if (cartes.length <= SEUIL_CULLING || !vueRef.current) return cartes;
    const r = vueRef.current.getBoundingClientRect();
    const c = camEtat, m = 400 / c.z;
    const vue = { x: -c.x / c.z - m, y: -c.y / c.z - m, w: r.width / c.z + 2 * m, h: r.height / c.z + 2 * m };
    return cartes.filter((k) => rectsSeCroisent(k, vue) || selection.has(k.id) || k.id === editId);
  }, [cartes, camEtat, selection, editId]);

  /* ---------- rendu ---------- */
  const selCartes = cartes.filter((c) => selection.has(c.id));
  const selLiens = liens.filter((l) => selection.has(l.id));
  const fondCarte = (c) => (c === 'blanc' ? '#FFFFFF' : avecAlpha(couleurCarte(c), opaciteFondBoite(c) < 0.9 ? 0.3 : 0.88)); // couleur foncée : teinte légère, texte lisible

  const fantome = lienEnCours && (() => {
    const a = parId.get(lienEnCours.fixe.id);
    if (!a) return null;
    const ga = geo(a);
    const p = { x: lienEnCours.x, y: lienEnCours.y };
    const cote = lienEnCours.fixe.cote === 'auto' ? coteAuto(ga, { x: p.x - 1, y: p.y - 1, w: 2, h: 2 }) : lienEnCours.fixe.cote;
    const s = ancreDe(ga, cote);
    return cheminLien(s, { x: p.x, y: p.y, cote: null }, styleNouveau);
  })();

  return (
    <div className="tb" ref={tbRef} tabIndex={0} onKeyDown={onKeyDown} onKeyUp={onKeyUp}>
      <div ref={vueRef} className={'tb-vue' + (outilMain ? ' pan' : '')} onPointerDown={debutFond} onDoubleClick={doubleClicFond}>
        <div ref={mondeRef} className="tb-monde">
          <svg className="tb-liens" width="1" height="1" overflow="visible">
            <defs>
              <marker id="tb-pointe" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#5b5b6b" />
              </marker>
              <marker id="tb-pointe-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="var(--accent, #7c5cff)" />
              </marker>
            </defs>
            {liens.map((l) => {
              const a = geo(parId.get(l.de.id)), b = geo(parId.get(l.vers.id));
              if (!a || !b) return null;
              const ca = l.de.cote === 'auto' ? coteAuto(a, b) : l.de.cote;
              const cb = l.vers.cote === 'auto' ? coteAuto(b, a) : l.vers.cote;
              const d = cheminLien(ancreDe(a, ca), ancreDe(b, cb), l.style);
              const sel = selection.has(l.id);
              const pointe = sel ? 'url(#tb-pointe-sel)' : 'url(#tb-pointe)';
              return (
                <g key={l.id} className={'tb-lien' + (sel ? ' sel' : '')}>
                  <path d={d} className="tb-lien-zone" onPointerDown={(e) => { e.stopPropagation(); if (tbRef.current) tbRef.current.focus({ preventScroll: true }); selectionner([l.id], e.shiftKey); }} />
                  <path d={d} className="tb-lien-trait" markerEnd={l.tete !== 'aucune' ? pointe : undefined} markerStart={l.tete === 'deux' ? pointe : undefined} />
                </g>
              );
            })}
            {fantome && <path d={fantome} className="tb-lien-trait fantome" markerEnd="url(#tb-pointe-sel)" />}
            {marquee && <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} className="tb-marquee" />}
            {guides.map((g, i) => (g.x != null
              ? <line key={i} x1={g.x} x2={g.x} y1={-100000} y2={100000} className="tb-guide" />
              : <line key={i} y1={g.y} y2={g.y} x1={-100000} x2={100000} className="tb-guide" />))}
          </svg>

          {visibles.map((c0) => {
            const c = geo(c0);
            const sel = selection.has(c.id);
            const edition = editId === c.id;
            return (
              <div key={c.id} className={'tb-carte' + (sel ? ' sel' : '') + (edition ? ' edition' : '')}
                style={{ left: c.x, top: c.y, width: c.w, height: c.h, background: fondCarte(c.couleur), zIndex: c.z || 0 }}
                onPointerDown={(e) => debutCarte(e, c0)}
                onDoubleClick={(e) => { e.stopPropagation(); setSelection(new Set([c.id])); setEditId(c.id); }}>
                {edition ? (
                  <textarea ref={zoneRef} className="tb-texte" defaultValue={c0.texte} autoFocus spellCheck={false}
                    onFocus={(e) => { const t = e.target; t.selectionStart = t.selectionEnd = t.value.length; }}
                    onInput={(e) => { brouillon.current = { carte: c0, texte: e.target.value }; }}
                    onBlur={(e) => terminerEdition(c0, e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); e.target.blur(); }
                    }}
                    onPointerDown={(e) => e.stopPropagation()} />
                ) : (
                  <div className={'tb-texte' + (c0.texte ? '' : ' vide')}>{c0.texte || 'Double-clic pour écrire'}</div>
                )}
                {sel && !edition && selCartes.length === 1 && <span className="tb-redim" onPointerDown={(e) => debutRedim(e, c0)} />}
                {!edition && ['n', 'e', 's', 'o'].map((k) => (
                  <span key={k} className={'tb-ancre tb-ancre-' + k} title="Glisser vers une autre carte pour créer une flèche"
                    onPointerDown={(e) => debutLien(e, c0, k)} />
                ))}
              </div>
            );
          })}

          {/* bouts d'une flèche sélectionnée : à glisser pour la rediriger */}
          {selLiens.length === 1 && (() => {
            const l = selLiens[0];
            const a = geo(parId.get(l.de.id)), b = geo(parId.get(l.vers.id));
            if (!a || !b) return null;
            const ca = l.de.cote === 'auto' ? coteAuto(a, b) : l.de.cote;
            const cb = l.vers.cote === 'auto' ? coteAuto(b, a) : l.vers.cote;
            /* PLUSIEURS FLÈCHES PAR CARTE (05/10) : ces poignées étaient posées PILE sur
               l'ancre de la carte. Une flèche juste créée restant sélectionnée, le glisser
               suivant depuis la même ancre attrapait sa poignée et REDIRIGEAIT la flèche
               au lieu d'en créer une deuxième. Elles sont maintenant décalées le long de
               la flèche (22 px à l'écran) : l'ancre reste libre pour une nouvelle flèche. */
            const NORMALE = { n: [0, -1], s: [0, 1], e: [1, 0], o: [-1, 0] };
            const decaler = (p, cote) => { const v = NORMALE[cote] || [0, 0], k = 22 / (camEtat.z || 1); return { x: p.x + v[0] * k, y: p.y + v[1] * k }; };
            const pa = decaler(ancreDe(a, ca), ca);
            const pb = decaler(ancreDe(b, cb), cb);
            return (<>
              <span className="tb-bout" style={{ left: pa.x, top: pa.y }} onPointerDown={(e) => debutLien(e, null, null, l, 'de')} title="Glisser pour changer le départ" />
              <span className="tb-bout" style={{ left: pb.x, top: pb.y }} onPointerDown={(e) => debutLien(e, null, null, l, 'vers')} title="Glisser pour changer l’arrivée" />
            </>);
          })()}
        </div>
      </div>

      {/* barre du tableau : créer, zoom, main */}
      <div className="tb-barre" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" className="tb-btn principal" onClick={() => { const p = centreVue(); creerCarte(p.x, p.y); }} title="Nouvelle carte (N, ou double-clic sur le fond)">
          <IconeOutil nom="carte" size={14} /> Carte
        </button>
        <span className="tb-sep" />
        <button type="button" className={'tb-btn' + (outilMain ? ' actif' : '')} onClick={() => setOutilMain((v) => !v)} title="Main : glisser pour se déplacer (H, ou maintenir Espace)">
          <IconeOutil nom="main" size={15} />
        </button>
        <span className="tb-sep" />
        <button type="button" className="tb-btn" onClick={() => zoomBoutons(1 / 1.2)} title="Dézoomer (Cmd/Ctrl + molette)"><Icon name="minus" size={13} /></button>
        <span className="tb-zoom">{Math.round(camEtat.z * 100)} %</span>
        <button type="button" className="tb-btn" onClick={() => zoomBoutons(1.2)} title="Zoomer"><Icon name="plus" size={13} /></button>
        <button type="button" className="tb-btn" onClick={toutAfficher} title="Tout afficher"><Icon name="maximize" size={13} /></button>
        <span className="tb-sep" />
        <button type="button" className="tb-btn" onClick={hist.annuler} disabled={!hist.peutAnnuler} title={hist.peutAnnuler ? `Annuler — ${hist.libelleAnnuler} (Cmd+Z)` : 'Annuler (Cmd+Z)'}><IconeOutil nom="annuler" size={14} /></button>
        <button type="button" className="tb-btn" onClick={hist.retablir} disabled={!hist.peutRetablir} title="Rétablir (Cmd+Maj+Z)"><IconeOutil nom="retablir" size={14} /></button>
      </div>

      {/* barre contextuelle : cartes ou flèches sélectionnées */}
      {(selCartes.length > 0 || selLiens.length > 0) && !editId && (
        <div className="tb-contexte" onPointerDown={(e) => e.stopPropagation()}>
          {selCartes.length > 0 && (<>
            <span className="tb-ctx-titre">{selCartes.length > 1 ? `${selCartes.length} cartes` : 'Carte'}</span>
            {/* même sélecteur que tous les outils du lecteur (05/10) */}
            <SelecteurCouleurs couleur={selCartes.every((c) => c.couleur === selCartes[0].couleur) ? selCartes[0].couleur : null}
              onCouleur={colorer} titre="Couleur de la carte" />
            <span className="tb-sep" />
            {selCartes.length === 1 && <button type="button" className="tb-btn" onClick={() => setEditId(selCartes[0].id)} title="Écrire (Entrée)"><IconeOutil nom="texte" size={13} /></button>}
            <button type="button" className="tb-btn" onClick={dupliquer} title="Dupliquer (Cmd+D)"><Icon name="copy" size={12} /></button>
            <button type="button" className="tb-btn" onClick={auPremierPlan} title="Premier plan"><Icon name="layers" size={12} /></button>
          </>)}
          {selLiens.length > 0 && (<>
            <span className="tb-ctx-titre">{selLiens.length > 1 ? `${selLiens.length} flèches` : 'Flèche'}</span>
            {STYLES_LIEN.map((s) => (
              <button key={s.id} type="button" className={'tb-btn texte' + (selLiens.every((l) => l.style === s.id) ? ' actif' : '')}
                onClick={() => { setStyleNouveau(s.id); modifierLiens({ style: s.id }, 'Style de flèche'); }}>{s.label}</button>
            ))}
            <span className="tb-sep" />
            {[['fin', '→'], ['deux', '↔'], ['aucune', '—']].map(([t, g]) => (
              <button key={t} type="button" className={'tb-btn texte' + (selLiens.every((l) => (l.tete || 'fin') === t) ? ' actif' : '')}
                onClick={() => modifierLiens({ tete: t }, 'Pointe de flèche')} title={t === 'fin' ? 'Pointe à l’arrivée' : t === 'deux' ? 'Deux pointes' : 'Sans pointe'}>{g}</button>
            ))}
          </>)}
          <span className="tb-sep" />
          <button type="button" className="tb-btn danger" onClick={supprimerSelection} title="Supprimer (Suppr)"><Icon name="trash" size={12} /></button>
        </div>
      )}

      {!cartes.length && (
        <div className="tb-vide">
          <div className="tb-vide-titre">Ton tableau de synthèse</div>
          <div>Double-clic pour une carte · glisse depuis le bord d’une carte pour une flèche</div>
          <div>Sélectionne du texte dans le PDF pour en faire une carte</div>
        </div>
      )}
    </div>
  );
});

/** hauteur suffisante pour un texte à cette largeur (estimation par mesure DOM). */
let mesureur = null;
export function hauteurPourTexte(texte, largeur) {
  if (typeof document === 'undefined') return CARTE_DEFAUT.h;
  if (!mesureur) {
    mesureur = document.createElement('div');
    mesureur.className = 'tb-texte tb-mesure';
    document.body.appendChild(mesureur);
  }
  mesureur.style.width = `${largeur}px`;
  mesureur.textContent = texte || ' ';
  return Math.max(CARTE_MIN.h, Math.ceil(mesureur.scrollHeight) + 4);
}
