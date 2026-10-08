/* ============================================================
   MedRevise — ÉDITEUR DE MOLÉCULES (08/10, docs/compte-rendu-flashcards-molecules.md).

   Le moteur est l'éditeur d'OpenChemLib JS (CanvasEditor, BSD-3, maintenu) — chargé à la
   demande. On l'habille pour MedRevise :
   - BARRE D'OUTILS compacte en français (l'essentiel de la biochimie) : sélection, liaison
     (toucher une liaison existante : simple → double → triple), chaîne, coins plein et hachuré,
     cycles 5 / 6 / benzène, C H O N S P (+ palette : F Cl Br I Si), charges, gomme, annuler /
     rétablir, tout effacer, zoom. La barre native (réactions, requêtes, textes…) est cachée :
     nos boutons la pilotent (un clic synthétique sur l'outil voulu) ;
   - ÉCHELLE au doigt : les liaisons sont dessinées 1,6× (souris) à 2× (tactile) plus grandes que
     l'échelle native (24 px), sinon une molécule au doigt est un timbre-poste ;
   - ZOOM / DÉPLACEMENT : boutons, pincement à deux doigts, ⌘ / Ctrl + molette ; « Ajuster »
     recadre la molécule ;
   - ANNULER / RÉTABLIR : instantanés de la molécule (le natif n'a pas de « rétablir ») ;
   - THÈME SOMBRE : en thème sombre, la toile est inversée (filtre CSS) — fond sombre, traits
     clairs, O rouge et N bleu conservés (inversion + rotation de teinte).
   ============================================================ */
import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { chargerOCL, exporter, lire } from './chimie.js';

/* --- échelle de l'éditeur, fixée UNE fois par session : OpenChemLib la lit dans devicePixelRatio
   à la création du premier éditeur. On la fixe sur une toile hors écran, juste le temps du constructeur. */
const estTactile = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
let amorce = null;
async function chargerEditeur() {
  const OCL = await chargerOCL();
  if (!amorce) {
    const K = estTactile() ? 2 : 1.6;
    const desc = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio') || Object.getOwnPropertyDescriptor(Window.prototype, 'devicePixelRatio');
    const vrai = window.devicePixelRatio || 1;
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:-10000px;top:0;width:240px;height:240px;';
    document.body.appendChild(d);
    try {
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => vrai * K });
      new OCL.CanvasEditor(d).destroy();
    } finally {
      if (desc) Object.defineProperty(window, 'devicePixelRatio', desc); else delete window.devicePixelRatio;
      d.remove();
    }
    amorce = { K };
  }
  return OCL;
}

/** un dessin (molfile, en ångströms) → coordonnées de la toile : liaison de l'éditeur, centré */
function pourToile(OCL, m, largeur, hauteur) {
  if (!m.getAllAtoms()) return m;
  const R = window.devicePixelRatio || 1;
  const cible = 24 * ((amorce && amorce.K) || 1.6) * R; // longueur de liaison native de l'éditeur, en pixels de la toile
  const bl = m.getAllBonds() ? m.getAverageBondLength(true) || m.getAverageBondLength(false) : 1;
  m.scaleCoords(cible / (bl || 1));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let a = 0; a < m.getAllAtoms(); a++) { x0 = Math.min(x0, m.getAtomX(a)); x1 = Math.max(x1, m.getAtomX(a)); y0 = Math.min(y0, m.getAtomY(a)); y1 = Math.max(y1, m.getAtomY(a)); }
  m.translateCoords((largeur * R) / 2 - (x0 + x1) / 2, (hauteur * R) / 2 - (y0 + y1) / 2);
  return m;
}

/* outils de la barre native (ligne, colonne) — OpenChemLib 9.25 */
const NATIF = {
  effacer: [0, 0], nettoyer: [1, 0], lasso: [2, 0], gomme: [4, 0], liaison: [5, 0], chaine: [5, 1], coin: [6, 0], hachure: [6, 1],
  c5: [8, 0], c6: [8, 1], benzene: [9, 1], plus: [10, 0], moins: [10, 1],
  C: [11, 0], Si: [11, 1], N: [12, 0], P: [12, 1], O: [13, 0], S: [13, 1], F: [14, 0], Cl: [14, 1], Br: [15, 0], I: [15, 1], H: [16, 0],
};
const LIGNES_NATIF = 17;

const IC = {
  lasso: <path d="M4 15c-2-4 2-10 8-10s9 4 7 8-8 4-10 2M8 16l-2 5" />,
  liaison: <path d="M5 19L19 5" />,
  chaine: <path d="M3 16l5-8 5 8 5-8 3 5" />,
  coin: <path d="M5 19L19 6l-2.2-2.2z" fill="currentColor" />,
  hachure: <path d="M6 18l1.4 1.4M8.5 15.5l2.2 2.2M11 13l3 3M13.5 10.5l3.6 3.6M16 8l4.2 4.2" />,
  c5: <path d="M12 3l8.5 6.2-3.2 10H6.7L3.5 9.2z" />,
  c6: <path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z" />,
  benzene: <><path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z" /><circle cx="12" cy="12" r="4.4" /></>,
  gomme: <path d="M4 16l9-9 6 6-6 6H8zM9 20h11" />,
  annuler: <path d="M9 7L4 12l5 5M4 12h11a5 5 0 010 10" />,
  retablir: <path d="M15 7l5 5-5 5M20 12H9a5 5 0 000 10" />,
  effacer: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />,
  zoomPlus: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M10.5 7.5v6M7.5 10.5h6M15.5 15.5L21 21" /></>,
  zoomMoins: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M7.5 10.5h6M15.5 15.5L21 21" /></>,
  ajuster: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  nettoyer: <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />,
};
const Glyphe = ({ n }) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{IC[n]}</svg>;

/**
 * Éditeur. `molfile` initial (null = vide) ; `onChange({ smiles, molfile, formule, atomes })` à chaque
 * modification ; ref → { effacer(), charger(molfile), exporter() }.
 */
export const EditeurMolecule = forwardRef(function EditeurMolecule({ molfile = null, onChange = null, hauteur = 340, compact = false, classe = '' }, ref) {
  const zone = useRef(null);
  const hote = useRef(null);
  const ocl = useRef(null);
  const ed = useRef(null);
  const histo = useRef({ pile: [], i: -1, silence: false });
  const vue = useRef({ k: 1, x: 0, y: 0 });
  const [pret, setPret] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [outil, setOutil] = useState('liaison');
  const [palette, setPalette] = useState(false);
  const [etatHisto, setEtatHisto] = useState({ annuler: false, retablir: false });
  const rappel = useRef(onChange); rappel.current = onChange;

  const appliquerVue = () => {
    const v = vue.current;
    if (hote.current) hote.current.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
  };

  /* clic synthétique sur un outil de la barre native (cachée mais mise en page) */
  const choisirNatif = useCallback((nom) => {
    const sr = hote.current && hote.current.firstElementChild && hote.current.firstElementChild.shadowRoot;
    const tb = sr && sr.querySelector('canvas');
    if (!tb || !NATIF[nom]) return;
    const [l, c] = NATIF[nom];
    const r = tb.getBoundingClientRect();
    const k = vue.current.k || 1;
    const cw = r.width / 2, ch = r.height / LIGNES_NATIF;
    const o = { bubbles: true, cancelable: true, composed: true, clientX: r.left + c * cw + cw / 2, clientY: r.top + l * ch + ch / 2, pointerId: 999, button: 0, buttons: 1, pointerType: 'mouse', isPrimary: true };
    void k;
    tb.dispatchEvent(new PointerEvent('pointerdown', o));
    tb.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }));
    tb.dispatchEvent(new MouseEvent('click', { ...o, buttons: 0, detail: 1 }));
  }, []);

  const notifier = useCallback(() => {
    if (!ed.current || !ocl.current) return;
    const m = ed.current.getMolecule().getCompactCopy();
    if (rappel.current) rappel.current(exporter(ocl.current, m));
  }, []);

  const instantane = useCallback(() => {
    const h = histo.current;
    const m = ed.current.getMolecule();
    const snap = m.getAllAtoms() ? m.toMolfile() : '';
    if (h.pile[h.i] === snap) return;
    h.pile = h.pile.slice(0, h.i + 1);
    h.pile.push(snap);
    if (h.pile.length > 80) h.pile.shift();
    h.i = h.pile.length - 1;
    setEtatHisto({ annuler: h.i > 0, retablir: false });
  }, []);

  const poser = useCallback((snap) => {
    const OCL = ocl.current;
    const h = histo.current;
    h.silence = true;
    ed.current.setMolecule(snap ? OCL.Molecule.fromMolfile(snap) : new OCL.Molecule(0, 0)); // instantanés : déjà aux coordonnées de la toile
    h.silence = false;
    notifier();
  }, [notifier]);

  const annuler = () => { const h = histo.current; if (h.i <= 0) return; h.i--; poser(h.pile[h.i]); setEtatHisto({ annuler: h.i > 0, retablir: true }); };
  const retablir = () => { const h = histo.current; if (h.i >= h.pile.length - 1) return; h.i++; poser(h.pile[h.i]); setEtatHisto({ annuler: true, retablir: h.i < h.pile.length - 1 }); };

  /* ajuster : la molécule entière visible, centrée */
  const ajuster = useCallback(() => {
    const z = zone.current;
    if (!z || !ed.current) return;
    const m = ed.current.getMolecule();
    if (!m.getAllAtoms()) { vue.current = { k: 1, x: 0, y: 0 }; appliquerVue(); return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let a = 0; a < m.getAllAtoms(); a++) { const x = m.getAtomX(a), y = m.getAtomY(a); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const R = window.devicePixelRatio || 1; // coordonnées de la toile en pixels physiques
    x0 /= R; x1 /= R; y0 /= R; y1 /= R;
    const marge = 48, W = z.clientWidth, H = z.clientHeight;
    // ajuster ne fait que DÉZOOMER (une grande molécule entre dans le cadre) : jamais au-delà de ×1, net
    const k = Math.max(0.35, Math.min(1, Math.min((W - 2 * marge) / Math.max(1, x1 - x0), (H - 2 * marge) / Math.max(1, y1 - y0))));
    vue.current = { k, x: W / 2 - k * (x0 + x1) / 2, y: H / 2 - k * (y0 + y1) / 2 };
    appliquerVue();
  }, []);

  const zoomer = (f, cx = null, cy = null) => {
    const z = zone.current; if (!z) return;
    const v = vue.current;
    const px = cx ?? z.clientWidth / 2, py = cy ?? z.clientHeight / 2;
    const k = Math.max(0.3, Math.min(4, v.k * f));
    vue.current = { k, x: px - (px - v.x) * (k / v.k), y: py - (py - v.y) * (k / v.k) };
    appliquerVue();
  };

  /* création de l'éditeur */
  useEffect(() => {
    let vivant = true;
    chargerEditeur().then((OCL) => {
      if (!vivant || !hote.current) return;
      ocl.current = OCL;
      const e = new OCL.CanvasEditor(hote.current, { initialMode: 'molecule' });
      ed.current = e;
      // barre native : invisible et hors du flux (nos boutons la pilotent), la toile prend toute la place
      const sr = hote.current.firstElementChild && hote.current.firstElementChild.shadowRoot;
      const tb = sr && sr.querySelector('canvas');
      if (tb) Object.assign(tb.style, { position: 'absolute', left: '0', top: '0', opacity: '0', pointerEvents: 'none' });
      if (molfile) { try { e.setMolecule(pourToile(OCL, lire(OCL, { molfile }), zone.current.clientWidth, zone.current.clientHeight)); } catch (x) { /* dessin illisible : vide */ } }
      e.setOnChangeListener((ev) => {
        // seules les modifications FAITES PAR L'UTILISATEUR font un instantané (pas setMolecule d'un annuler / rétablir)
        if (ev.type !== 'molecule' || ev.isUserEvent === false || histo.current.silence) return;
        instantane();
        notifier();
      });
      histo.current = { pile: [], i: -1, silence: false };
      instantane();
      setPret(true);
      requestAnimationFrame(() => { choisirNatif('liaison'); if (molfile) ajuster(); });
      if (typeof window !== 'undefined') window.__molEditeur = { ed: e, OCL, choisirNatif, vue }; // banc de test
    }).catch((x) => { if (vivant) setErreur('L’éditeur de molécules n’a pas pu se charger. ' + ((x && x.message) || '')); });
    return () => { vivant = false; if (ed.current) { try { ed.current.destroy(); } catch (x) { /* déjà détruit */ } ed.current = null; } };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    effacer: () => { if (ed.current) { ed.current.clearAll(); instantane(); notifier(); } },
    charger: (mf) => {
      if (!ed.current) return;
      const OCL = ocl.current;
      const m = mf ? pourToile(OCL, lire(OCL, { molfile: mf }), zone.current.clientWidth, zone.current.clientHeight) : new OCL.Molecule(0, 0);
      histo.current.silence = true; ed.current.setMolecule(m); histo.current.silence = false;
      vue.current = { k: 1, x: 0, y: 0 }; appliquerVue();
      instantane(); notifier(); requestAnimationFrame(ajuster);
    },
    exporter: () => (ed.current && ocl.current ? exporter(ocl.current, ed.current.getMolecule().getCompactCopy()) : null),
    molecule: () => (ed.current ? ed.current.getMolecule().getCompactCopy() : null),
    ajuster,
  }), [instantane, notifier, poser, ajuster]);

  /* pincement à deux doigts (et glisser à deux doigts) : intercepté AVANT l'éditeur */
  useEffect(() => {
    const z = zone.current;
    if (!z) return undefined;
    const pts = new Map();
    let pince = null; // { d0, k0, mx0, my0, x0, y0 }
    let avantGeste = null;
    const centre = () => { const [a, b] = [...pts.values()]; return { mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) }; };
    const local = (e) => { const r = z.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const bas = (e) => {
      if (e.pointerType !== 'touch') return;
      pts.set(e.pointerId, local(e));
      if (pts.size === 1) { const h = histo.current; avantGeste = h.pile[h.i]; }
      if (pts.size === 2) {
        // le premier doigt avait commencé un trait : on l'annule, c'était un pincement
        e.stopPropagation(); e.preventDefault();
        const premier = [...pts.keys()][0];
        const p = pts.get(premier);
        const r = z.getBoundingClientRect();
        document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true, pointerId: premier, clientX: r.left + p.x, clientY: r.top + p.y, pointerType: 'touch' }));
        requestAnimationFrame(() => { const h = histo.current; if (avantGeste != null && h.pile[h.i] !== avantGeste) { h.pile = h.pile.slice(0, h.i); h.i = h.pile.length - 1; poser(avantGeste); setEtatHisto({ annuler: h.i > 0, retablir: false }); } });
        const c = centre(); const v = vue.current;
        pince = { d0: c.d, k0: v.k, mx0: c.mx, my0: c.my, x0: v.x, y0: v.y };
      }
    };
    const bouge = (e) => {
      if (e.pointerType !== 'touch' || !pts.has(e.pointerId)) return;
      pts.set(e.pointerId, local(e));
      if (!pince || pts.size < 2) return;
      e.stopPropagation(); e.preventDefault();
      const c = centre();
      const k = Math.max(0.3, Math.min(4, pince.k0 * (c.d / Math.max(1, pince.d0))));
      // le point sous le centre du pincement reste sous les doigts, et suit leur glissement
      const ux = (pince.mx0 - pince.x0) / pince.k0, uy = (pince.my0 - pince.y0) / pince.k0;
      vue.current = { k, x: c.mx - ux * k, y: c.my - uy * k };
      appliquerVue();
    };
    const haut = (e) => {
      if (e.pointerType !== 'touch') return;
      const enPince = !!pince;
      pts.delete(e.pointerId);
      if (enPince) { e.stopPropagation(); if (pts.size < 2) pince = null; }
    };
    const molette = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return; // pincement du trackpad = ctrl + molette
      e.preventDefault();
      const p = local(e);
      zoomer(Math.exp(-e.deltaY * 0.01), p.x, p.y);
    };
    z.addEventListener('pointerdown', bas, true);
    z.addEventListener('pointermove', bouge, true);
    z.addEventListener('pointerup', haut, true);
    z.addEventListener('pointercancel', haut, true);
    z.addEventListener('wheel', molette, { passive: false });
    return () => {
      z.removeEventListener('pointerdown', bas, true);
      z.removeEventListener('pointermove', bouge, true);
      z.removeEventListener('pointerup', haut, true);
      z.removeEventListener('pointercancel', haut, true);
      z.removeEventListener('wheel', molette);
    };
  }, [poser]); // eslint-disable-line react-hooks/exhaustive-deps

  const outilBtn = (nom, titre, contenu, natif = nom) => (
    <button key={nom} type="button" className={'mol-outil' + (outil === nom ? ' actif' : '')} title={titre} aria-label={titre} aria-pressed={outil === nom}
      onClick={() => { setOutil(nom); setPalette(false); choisirNatif(natif); }}>{contenu}</button>
  );
  const action = (nom, titre, onClick, desactive = false) => (
    <button key={nom} type="button" className="mol-outil" title={titre} aria-label={titre} disabled={desactive || !pret} onClick={onClick}><Glyphe n={nom} /></button>
  );

  return (
    <div className={'mol-editeur' + (compact ? ' compact' : '') + (classe ? ' ' + classe : '')}>
      <div className="mol-barre" role="toolbar" aria-label="Outils de dessin">
        <div className="mol-groupe">
          {outilBtn('lasso', 'Sélectionner / déplacer', <Glyphe n="lasso" />)}
          {outilBtn('liaison', 'Liaison — toucher une liaison : simple → double → triple', <Glyphe n="liaison" />)}
          {outilBtn('chaine', 'Chaîne', <Glyphe n="chaine" />)}
          {outilBtn('coin', 'Coin plein (vers soi)', <Glyphe n="coin" />)}
          {outilBtn('hachure', 'Coin hachuré (en arrière)', <Glyphe n="hachure" />)}
        </div>
        <div className="mol-groupe">
          {outilBtn('c5', 'Cycle à 5', <Glyphe n="c5" />)}
          {outilBtn('c6', 'Cycle à 6', <Glyphe n="c6" />)}
          {outilBtn('benzene', 'Benzène', <Glyphe n="benzene" />)}
        </div>
        <div className="mol-groupe mol-atomes">
          {['C', 'H', 'O', 'N', 'S', 'P'].map((x) => outilBtn(x, 'Atome ' + x, <span className={'mol-el el-' + x}>{x}</span>))}
          <span className="mol-palette-ancre">
            <button type="button" className={'mol-outil' + (['F', 'Cl', 'Br', 'I', 'Si'].includes(outil) ? ' actif' : '')} title="Autres atomes" aria-expanded={palette} onClick={() => setPalette((p) => !p)}>
              {['F', 'Cl', 'Br', 'I', 'Si'].includes(outil) ? <span className="mol-el">{outil}</span> : '…'}
            </button>
            {palette && (
              <span className="mol-palette" role="menu">
                {['F', 'Cl', 'Br', 'I', 'Si'].map((x) => outilBtn(x, 'Atome ' + x, <span className="mol-el">{x}</span>))}
              </span>
            )}
          </span>
        </div>
        <div className="mol-groupe">
          {outilBtn('plus', 'Charge +', <span className="mol-el">+</span>)}
          {outilBtn('moins', 'Charge −', <span className="mol-el">−</span>)}
          {outilBtn('gomme', 'Gomme', <Glyphe n="gomme" />)}
        </div>
        <div className="mol-groupe">
          {action('annuler', 'Annuler', annuler, !etatHisto.annuler)}
          {action('retablir', 'Rétablir', retablir, !etatHisto.retablir)}
          {action('effacer', 'Tout effacer', () => { ed.current.clearAll(); instantane(); notifier(); })}
        </div>
        <div className="mol-groupe">
          {action('zoomMoins', 'Zoom −', () => zoomer(1 / 1.25))}
          {action('zoomPlus', 'Zoom +', () => zoomer(1.25))}
          {action('ajuster', 'Ajuster à la molécule', ajuster)}
          {action('nettoyer', 'Redessiner proprement (coordonnées 2D)', () => { choisirNatif('nettoyer'); requestAnimationFrame(() => { choisirNatif(outil in NATIF ? outil : 'liaison'); ajuster(); }); })}
        </div>
      </div>
      <div className="mol-zone" ref={zone} style={{ height: hauteur }}>
        <div className="mol-hote" ref={hote} />
        {!pret && !erreur && <div className="mol-attente"><span className="mu-sablier" /> Chargement de l’éditeur…</div>}
        {erreur && <div className="mol-attente">{erreur}</div>}
      </div>
    </div>
  );
});
