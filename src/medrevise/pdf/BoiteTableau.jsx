/* ============================================================
   MedRevise — LA BOÎTE-TABLEAU (22/10, docs/compte-rendu-simplification-outils.md §4 ; système complet le 25/10,
   docs/compte-rendu-boites-tableaux.md §5). UN composant, posé dans une boîte du lecteur (pdf/PdfPage.jsx, NoteBox :
   cours PDF, document créé dans l'app, fiche jumelle) et dans une carte du tableau Miro (tableau/Board.jsx).

   Le tableau FAIT CORPS avec sa boîte : il en occupe toute la largeur intérieure, hérite de son fond, de ses marges,
   de ses arrondis et de sa typographie ; LA BOÎTE SUIT LA HAUTEUR DU TABLEAU (rien ne dépasse jamais : les filets
   sont dessinés dans la boîte, le tableau est rogné à son cadre). Modèle et opérations : pdf/grille.js.

   Sélection : clic = la cellule ; glisser ou Maj+clic = une plage ; clic dans la marge = la ligne / la colonne ;
   le coin haut-gauche = tout le tableau (et les mêmes choix dans le menu Tableau, pour le doigt).
   Clavier : Tab / Maj+Tab (Tab dans la dernière cellule ajoute une ligne), flèches (aux bords du texte : la cellule
   voisine ; Maj+flèche : étend la plage), Entrée = retour à la ligne dans la cellule, Suppr sur une plage = la vider,
   ⌘C sur une plage = TSV + HTML, coller un tableau (Excel, Sheets, Word, Numbers) = les cellules se remplissent.
   ⌘Z hors frappe en cours = le journal d'Annuler du lecteur / du tableau Miro (chaque opération = une entrée).
   ============================================================ */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { placerACote, contourSel } from './tableauPlacement.js';
import { suivrePointeur } from './pointeur.js';
import { couleurHex } from './pdfShared.js';
import { BoutonCouleur, AUCUNE } from './Couleurs.jsx';
import { IconeOutil } from './IconesOutils.jsx';
import * as G from './grille.js';

export { GRILLE_DEFAUT, LIMITES_GRILLE, nouvelleGrille, estGrille, texteGrille, contenuGrille, ajouterLigne, ajouterColonne, retirerLigne, retirerColonne } from './grille.js';

const memeSel = (a, b) => (!a && !b) || (a && b && a.i0 === b.i0 && a.j0 === b.j0 && a.i1 === b.i1 && a.j1 === b.j1);
const ALIGN_V = { haut: 'top', milieu: 'middle', bas: 'bottom' };
/** style d'une cellule (format + bordures) ; `u` : l'unité des tailles (px d'une page de 1000 px dans le lecteur) */
export function styleCellule(g, c, nl, nc) {
  const f = G.formatDe(g, c.i, c.j) || {};
  const s = {};
  if (f.fond) s.background = couleurHex(f.fond, 'transparent');
  if (f.couleur) s.color = couleurHex(f.couleur, '#1F1F24');
  if (f.gras) s.fontWeight = 700;
  if (f.italique) s.fontStyle = 'italic';
  if (Number.isFinite(f.taille)) s.fontSize = `calc(var(--btab-u, 1px) * ${f.taille})`;
  if (f.alignH) s.textAlign = f.alignH;
  if (f.alignV) s.verticalAlign = ALIGN_V[f.alignV] || 'top';
  const b = g.bordures;
  if (b) {
    const ext = b.mode === 'toutes' || b.mode === 'exterieures', int = b.mode === 'toutes' || b.mode === 'interieures';
    const coul = b.couleur ? couleurHex(b.couleur, '#1F1F24') : 'color-mix(in srgb, currentColor 24%, transparent)';
    const trait = `calc(var(--btab-u, 1px) * ${Number.isFinite(b.ep) ? b.ep : 1}) solid ${coul}`;
    const cote = (bord) => ((bord ? ext : int) ? trait : 'none');
    s.borderTop = cote(c.i === 0); s.borderBottom = cote(c.i + c.rs >= nl);
    s.borderLeft = cote(c.j === 0); s.borderRight = cote(c.j + c.cs >= nc);
  }
  return s;
}

/**
 * <BoiteTableau grille edition onChange onFin focus filets echelle unite api onSel onAnnuler />
 *   edition            cellules modifiables (sinon simple affichage, le pointeur passe à la boîte)
 *   onChange(g, lib)   une modification validée (cellule quittée, colonne ajustée, opération du menu)
 *   onFin()            Échap : sortir de l'édition
 *   focus              { x, y } : point du clic d'activation — la cellule visée prend le curseur
 *   filets             boîte sélectionnée ou en édition : filets glissables, marges de sélection, plage visible
 *   unite              longueur CSS d'une unité de taille (px d'une page de 1000 px dans le lecteur ; '1px' au tableau)
 *   api                ref remplie ici : { grille() (avec la frappe en cours), sel, choisir(sel), focusCellule(i, j) }
 *   onSel(sel)         la sélection a changé ({ i0, j0, i1, j1 } ou null)
 *   onAnnuler(retab)   ⌘Z / ⌘⇧Z hors frappe en cours (tableau Miro ; le lecteur l'intercepte en amont)
 */
export function BoiteTableau({ grille, edition = false, onChange, onFin = () => {}, onCellule = () => {}, focus = null, filets = false, style = null, unite = '1px', api = null, onSel = null, onAnnuler = null }) {
  const g = G.estGrille(grille) ? grille : G.nouvelleGrille();
  const nl = g.lignes.length, nc = g.cols.length;
  const ref = useRef(null), tableRef = useRef(null), sondeRef = useRef(null);
  const [colsApercu, setColsApercu] = useState(null);
  const [hautApercu, setHautApercu] = useState(null); // { i, h } pendant le glisser d'un filet horizontal
  const cols = colsApercu || g.cols;
  const valeurs = useRef(new Map()); // texte en cours de frappe par cellule « i:j »
  const [sel, setSelBrut] = useState(null);
  const ancreSel = useRef(null); // cellule de départ d'une plage (Maj+clic, Maj+flèche, glisser)
  const grilleRef = useRef(g); grilleRef.current = g;
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  const onSelRef = useRef(onSel); onSelRef.current = onSel;
  const choisir = (s, ancre = null) => {
    const r = s ? G.elargir(grilleRef.current, s) : null;
    if (ancre) ancreSel.current = ancre; else if (!r) ancreSel.current = null;
    setSelBrut((p) => (memeSel(p, r) ? p : r));
  };
  useEffect(() => { if (onSelRef.current) onSelRef.current(sel); }, [sel]);
  // hors édition ET hors sélection de la boîte : plus de plage
  useEffect(() => { if (!edition && !filets) choisir(null); }, [edition, filets]); // eslint-disable-line react-hooks/exhaustive-deps
  // une sélection qui ne tient plus dans la grille (lignes retirées) est recalée
  useEffect(() => { if (sel && (sel.i1 >= nl || sel.j1 >= nc)) choisir(sel.i0 < nl && sel.j0 < nc ? { ...sel, i1: Math.min(sel.i1, nl - 1), j1: Math.min(sel.j1, nc - 1) } : null); }, [nl, nc]); // eslint-disable-line react-hooks/exhaustive-deps

  /** la grille avec la frappe en cours (pas encore validée) */
  const courante = () => {
    const g0 = grilleRef.current;
    if (!valeurs.current.size) return g0;
    const lignes = g0.lignes.map((l, i) => l.map((c, j) => { const v = valeurs.current.get(i + ':' + j); return v == null ? c : v.replace(/\n$/, ''); }));
    return { ...g0, lignes };
  };
  const vider = () => { valeurs.current.clear(); if (ref.current) ref.current.querySelectorAll('.btab-cell[contenteditable]').forEach((el) => el.setAttribute('data-propre', '')); };
  const focusApres = useRef(null);
  const focusCellule = (i, j, fin = true) => { focusApres.current = { i, j, fin }; };
  if (api) api.current = { grille: () => { const c = courante(); return c; }, valider: () => { const c = courante(); vider(); return c; }, sel, choisir, focusCellule, element: () => ref.current };

  // ENTRÉE EN ÉDITION : la cellule cliquée (ou la première) prend le curseur, à la fin de son texte
  useLayoutEffect(() => {
    if (!edition || !ref.current) return;
    let cible = null;
    if (focus && Number.isFinite(focus.x)) {
      const sous = document.elementFromPoint(focus.x, focus.y);
      cible = sous && sous.closest && sous.closest('.btab-cell[contenteditable]');
      if (cible && !ref.current.contains(cible)) cible = null;
    }
    if (!cible) cible = ref.current.querySelector('.btab-cell[contenteditable]');
    if (cible && document.activeElement !== cible) placerCurseur(cible);
  }, [edition]); // eslint-disable-line react-hooks/exhaustive-deps
  // curseur demandé après une opération (Tab qui ajoute une ligne, insertion, collage…)
  useLayoutEffect(() => {
    const f = focusApres.current;
    if (!f || !edition || !ref.current) return;
    focusApres.current = null;
    const a = G.ancreDe(g, Math.min(f.i, nl - 1), Math.min(f.j, nc - 1));
    const el = ref.current.querySelector(`.btab-cell[data-i="${a.i}"][data-j="${a.j}"]`);
    if (el) placerCurseur(el, f.fin);
  });
  /* SORTIE D'ÉDITION par un clic ailleurs : les cellules disparaissent sans toujours recevoir `blur` — le texte tapé
     et pas encore validé est écrit ici (une seule entrée d'Annuler) */
  useEffect(() => {
    if (edition || !valeurs.current.size) return;
    const g0 = grilleRef.current, c = courante();
    valeurs.current.clear();
    if (JSON.stringify(c.lignes) !== JSON.stringify(g0.lignes)) onChangeRef.current(c, 'Cellule du tableau');
  }, [edition]); // eslint-disable-line react-hooks/exhaustive-deps

  const valider = (i, j, el) => {
    const t = el.innerText.replace(/\n$/, '');
    valeurs.current.delete(i + ':' + j);
    el.setAttribute('data-propre', '');
    if (t === (g.lignes[i][j] || '')) return;
    onChange(G.texteCellule(g, i, j, t), 'Cellule du tableau');
  };
  const appliquer = (fn, lib, apres = null) => {
    const g0 = courante(); vider();
    const g1 = fn(g0);
    if (g1 !== g0) onChange(g1, lib);
    if (apres) apres(g1);
  };

  /* ---- navigation ---- */
  const affichees = () => G.cellulesAffichees(g);
  const allerA = (i, j, fin = true) => {
    const a = G.ancreDe(g, i, j);
    const el = ref.current && ref.current.querySelector(`.btab-cell[data-i="${a.i}"][data-j="${a.j}"]`);
    if (el) placerCurseur(el, fin);
  };
  const voisine = (i, j, di, dj) => {
    const f = G.fusionSous(g, i, j) || { i, j, rs: 1, cs: 1 };
    const ni = di > 0 ? f.i + f.rs : di < 0 ? f.i - 1 : i;
    const nj = dj > 0 ? f.j + f.cs : dj < 0 ? f.j - 1 : j;
    if (ni < 0 || nj < 0 || ni >= nl || nj >= nc) return null;
    return G.ancreDe(g, ni, nj);
  };
  const clavier = (e, i, j) => {
    e.stopPropagation(); // ⌘1–6, Suppr… restent au texte
    const mod = e.metaKey || e.ctrlKey, k = String(e.key).toLowerCase();
    const el = e.currentTarget;
    if (mod && (k === 'z' || k === 'y') && el.hasAttribute('data-propre') && onAnnuler) { e.preventDefault(); onAnnuler(k === 'y' || e.shiftKey); return; }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (sel && G.taileSel(sel) > 1) { choisir({ i0: i, j0: j, i1: i, j1: j }, { i, j }); return; }
      el.blur(); onFin(); return;
    }
    if (mod && k === 'a') {
      // ⌘A : le texte de la cellule ; un 2e ⌘A : tout le tableau
      const s = window.getSelection();
      if (s && el.innerText && s.toString().replace(/\n$/, '') === el.innerText.replace(/\n$/, '')) { e.preventDefault(); choisir(G.toutLeTableau(g), { i: 0, j: 0 }); return; }
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel && G.taileSel(sel) > 1) { e.preventDefault(); appliquer((x) => G.viderCellules(x, sel), 'Cellules vidées'); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      const liste = affichees(), k0 = liste.findIndex((c) => c.i === i && c.j === j), suiv = liste[k0 + (e.shiftKey ? -1 : 1)];
      if (suiv) { allerA(suiv.i, suiv.j); return; }
      if (!e.shiftKey && nl < G.LIMITES_GRILLE.ligMax) appliquer((x) => G.insererLignes(x, nl), 'Ligne ajoutée', () => focusCellule(nl, 0));
      return;
    }
    const dir = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
    if (!dir || mod || e.altKey) return;
    if (e.shiftKey) { // étendre la plage, de cellule en cellule
      if (!sel || G.taileSel(sel) <= 1) {
        // Maj+flèche à l'intérieur du texte : sélection de texte normale, sauf au bord
        if (!auBord(el, dir)) return;
      }
      e.preventDefault();
      const a = ancreSel.current || { i, j };
      const coin = sel ? { i: sel.i0 === a.i ? sel.i1 : sel.i0, j: sel.j0 === a.j ? sel.j1 : sel.j0 } : { i, j };
      const ni = Math.max(0, Math.min(nl - 1, coin.i + dir[0])), nj = Math.max(0, Math.min(nc - 1, coin.j + dir[1]));
      choisir({ i0: a.i, j0: a.j, i1: ni, j1: nj }, a);
      return;
    }
    if (!auBord(el, dir)) return;
    const v = voisine(i, j, dir[0], dir[1]);
    if (!v) return;
    e.preventDefault();
    allerA(v.i, v.j, dir[1] < 0 || dir[0] !== 0);
  };
  /* ---- coller un tableau ---- */
  const coller = (e, i, j) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html'), texte = e.clipboardData.getData('text/plain');
    const m = G.matriceCollee(html, texte);
    if (!m) { document.execCommand('insertText', false, texte); return; }
    const a = sel && G.taileSel(sel) > 1 ? { i: sel.i0, j: sel.j0 } : { i, j };
    appliquer((x) => G.collerMatrice(x, a.i, a.j, m), 'Collage d’un tableau', (g1) => {
      choisir({ i0: a.i, j0: a.j, i1: Math.min(g1.lignes.length - 1, a.i + m.length - 1), j1: Math.min(g1.cols.length - 1, a.j + Math.max(...m.map((l) => l.length)) - 1) }, a);
      focusCellule(a.i, a.j);
    });
  };
  const copier = (e) => {
    if (!sel || G.taileSel(sel) <= 1) return;
    e.preventDefault();
    const c = courante(), lignes = [];
    for (let i = sel.i0; i <= sel.i1; i++) lignes.push(c.lignes[i].slice(sel.j0, sel.j1 + 1));
    const tsv = lignes.map((l) => l.map((t) => (/[\t\n"]/.test(t) ? '"' + String(t).replace(/"/g, '""') + '"' : t)).join('\t')).join('\n');
    const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
    e.clipboardData.setData('text/plain', tsv);
    e.clipboardData.setData('text/html', '<table>' + lignes.map((l) => '<tr>' + l.map((t) => '<td>' + esc(t) + '</td>').join('') + '</tr>').join('') + '</table>');
  };

  /* ---- pointeur : cellule, plage (glisser, Maj+clic) ---- */
  const tdSous = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const td = el && el.closest && el.closest('.btab-td');
    return td && ref.current && ref.current.contains(td) ? { i: +td.dataset.i, j: +td.dataset.j } : null;
  };
  const appuiCellule = (e) => {
    if (!edition || e.button > 0) return;
    if (e.target.closest && e.target.closest('.btab-marge, .btab-filet')) return;
    const c = tdSous(e.clientX, e.clientY);
    if (!c) return;
    if (e.shiftKey) {
      e.preventDefault();
      const a = ancreSel.current || (sel ? { i: sel.i0, j: sel.j0 } : c);
      choisir({ i0: a.i, j0: a.j, i1: c.i, j1: c.j }, a);
      return;
    }
    choisir({ i0: c.i, j0: c.j, i1: c.i, j1: c.j }, c);
    // clic dans le remplissage de la cellule (hors de son texte, cellule plus haute que son texte) : le curseur y va quand même
    if (!(e.target.closest && e.target.closest('.btab-cell'))) {
      e.preventDefault();
      const el = ref.current && ref.current.querySelector(`.btab-cell[data-i="${c.i}"][data-j="${c.j}"]`);
      if (el) placerCurseur(el);
    }
    // suivi SANS preventDefault (le clic doit garder son sens : curseur dans la cellule, sélection de texte)
    let plage = false;
    const pid = e.pointerId, x0 = e.clientX, y0 = e.clientY;
    const bouger = (ev) => {
      if (ev.pointerId !== pid || (!plage && Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 6)) return;
      const d = tdSous(ev.clientX, ev.clientY);
      if (!d || (!plage && d.i === c.i && d.j === c.j)) return;
      if (!plage) { plage = true; if (ref.current) ref.current.classList.add('en-plage'); }
      try { window.getSelection().removeAllRanges(); } catch (err) { /* ignore */ }
      choisir({ i0: c.i, j0: c.j, i1: d.i, j1: d.j }, c);
    };
    const lacher = (ev) => {
      if (ev.pointerId !== pid) return;
      window.removeEventListener('pointermove', bouger); window.removeEventListener('pointerup', lacher); window.removeEventListener('pointercancel', lacher);
      if (ref.current) ref.current.classList.remove('en-plage');
    };
    window.addEventListener('pointermove', bouger); window.addEventListener('pointerup', lacher); window.addEventListener('pointercancel', lacher);
  };
  const choisirMarge = (e, s) => {
    e.preventDefault(); e.stopPropagation();
    if (e.shiftKey && sel) { choisir({ i0: Math.min(sel.i0, s.i0), j0: Math.min(sel.j0, s.j0), i1: Math.max(sel.i1, s.i1), j1: Math.max(sel.j1, s.j1) }, ancreSel.current); return; }
    choisir(s, { i: s.i0, j: s.j0 });
  };

  /* ---- géométrie mesurée des lignes (marges de sélection, filets horizontaux) ---- */
  const [rangs, setRangs] = useState([]);
  useLayoutEffect(() => {
    const t = tableRef.current;
    if (!t) return undefined;
    const mesurer = () => {
      const trs = [...t.querySelectorAll(':scope > tbody > tr')];
      const r = trs.map((tr) => [tr.offsetTop, tr.offsetHeight]);
      setRangs((p) => (p.length === r.length && p.every((x, k) => x[0] === r[k][0] && x[1] === r[k][1]) ? p : r));
    };
    mesurer();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(mesurer);
    ro.observe(t);
    return () => ro.disconnect();
  }, [nl, nc, filets, edition]); // eslint-disable-line react-hooks/exhaustive-deps

  /* FILET VERTICAL : la frontière entre les colonnes c et c+1 suit le pointeur ; elles se partagent leur place */
  const glisserFilet = (e, c) => {
    const tab = ref.current;
    if (!tab) return;
    const L = tab.getBoundingClientRect().width;
    const base = [...g.cols], x0 = e.clientX, paire = base[c] + base[c + 1];
    let courant = null;
    suivrePointeur(e, {
      seuil: 1, arreter: true,
      move: (ev) => {
        const d = (ev.clientX - x0) / (L || 1);
        const a = Math.max(G.LIMITES_GRILLE.largeurMin, Math.min(paire - G.LIMITES_GRILLE.largeurMin, base[c] + d));
        courant = base.map((v, k) => (k === c ? a : k === c + 1 ? paire - a : v));
        setColsApercu(courant);
      },
      fin: (ev, { annule }) => { setColsApercu(null); if (!annule && courant) appliquer((x) => G.largeurColonnes(x, courant), 'Largeur de colonne'); },
    });
  };
  /* FILET HORIZONTAL : la hauteur (minimale) de la ligne i suit le pointeur */
  const glisserFiletH = (e, i) => {
    const t = tableRef.current, sonde = sondeRef.current;
    if (!t || !sonde || !rangs[i]) return;
    const k = t.getBoundingClientRect().height / (t.offsetHeight || 1) || 1; // écran / mise en page (zoom, caméra)
    const unitePx = (sonde.offsetWidth || 100) / 100; // px de mise en page d'une unité
    const h0 = rangs[i][1], y0 = e.clientY;
    let v = null;
    suivrePointeur(e, {
      seuil: 1, arreter: true,
      move: (ev) => { v = Math.max(G.LIMITES_GRILLE.hautMin, (h0 + (ev.clientY - y0) / k) / unitePx); setHautApercu({ i, h: v }); },
      fin: (ev, { annule }) => { setHautApercu(null); if (!annule && v != null) appliquer((x) => G.hauteurLigne(x, i, v), 'Hauteur de ligne'); },
    });
  };

  const bords = [];
  cols.reduce((x, c, k) => { if (k < cols.length - 1) bords.push(x + c); return x + c; }, 0);
  const carte = G.carteCellules(g);
  const lignesAff = g.lignes.map((_, i) => g.cols.map((__, j) => {
    const f = carte.get(i + ':' + j);
    if (f && (f.i !== i || f.j !== j)) return null;
    return f ? { i, j, rs: f.rs, cs: f.cs } : { i, j, rs: 1, cs: 1 };
  }).filter(Boolean));
  const hautDe = (i) => (hautApercu && hautApercu.i === i ? hautApercu.h : Array.isArray(g.hauts) && Number.isFinite(g.hauts[i]) ? g.hauts[i] : null);
  const montrerSel = (edition || filets) && sel;
  const tactile = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const prise = tactile ? 18 : 10; // px de mise en page
  const plage = montrerSel && G.taileSel(sel) > 1;
  const entete = !!g.entete;
  return (
    <div ref={ref} className={'btab' + (edition ? ' edition' : '') + (entete ? ' avec-entete' : '') + (g.alterne ? ' alterne' : '') + (plage ? ' avec-plage' : '') + (filets || edition ? ' avec-marges' : '')}
      style={{ '--btab-u': unite, ...(style || {}) }}
      onPointerDown={edition ? (e) => { e.stopPropagation(); appuiCellule(e); } : undefined} onCopy={edition ? copier : undefined}>
      <span ref={sondeRef} className="btab-sonde" aria-hidden="true" />
      <table ref={tableRef} className={'btab-table' + (g.bordures ? ' bord-perso' : '')}>
        <colgroup>{cols.map((c, k) => <col key={k} style={{ width: (c * 100).toFixed(3) + '%' }} />)}</colgroup>
        <tbody>
          {lignesAff.map((cellules, i) => {
            const h = hautDe(i);
            const impaire = g.alterne && (i - (entete ? 1 : 0)) % 2 === 1 && !(entete && i === 0);
            return (
              <tr key={i} className={(entete && i === 0 ? 'btab-tete' : '') + (impaire ? ' btab-impaire' : '') || undefined} style={h != null ? { height: `calc(var(--btab-u, 1px) * ${h})` } : undefined}>
                {cellules.map((c) => {
                  const choisie = montrerSel && G.dansSel(sel, c.i, c.j);
                  const texte = g.lignes[c.i][c.j] || '';
                  return (
                    <td key={c.j} className={'btab-td' + (choisie ? ' sel' : '')} data-i={c.i} data-j={c.j} colSpan={c.cs > 1 ? c.cs : undefined} rowSpan={c.rs > 1 ? c.rs : undefined}
                      style={choisie ? { ...styleCellule(g, c, nl, nc), boxShadow: contourSel(sel, c) } : styleCellule(g, c, nl, nc)}>
                      {edition ? (
                        <div className="btab-cell" data-i={c.i} data-j={c.j} data-propre="" contentEditable="plaintext-only" suppressContentEditableWarning spellCheck={false}
                          role="textbox" aria-label={`Cellule ligne ${c.i + 1}, colonne ${c.j + 1}`}
                          onFocus={() => { onCellule(c.i, c.j); if (!(sel && G.dansSel(sel, c.i, c.j) && G.taileSel(sel) > 1)) choisir({ i0: c.i, j0: c.j, i1: c.i, j1: c.j }, { i: c.i, j: c.j }); }}
                          onInput={(e) => {
                            const t = e.currentTarget.innerText;
                            valeurs.current.set(c.i + ':' + c.j, t);
                            if (t.replace(/\n$/, '') === texte) e.currentTarget.setAttribute('data-propre', ''); else e.currentTarget.removeAttribute('data-propre');
                          }}
                          onBlur={(e) => valider(c.i, c.j, e.currentTarget)}
                          onKeyDown={(e) => clavier(e, c.i, c.j)}
                          onPaste={(e) => coller(e, c.i, c.j)}>
                          {texte}
                        </div>
                      ) : <div className="btab-cell" data-i={c.i} data-j={c.j}>{texte || ' '}</div>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {(filets || edition) && (<>
        {/* marges de sélection : une colonne (en haut), une ligne (à gauche), tout le tableau (le coin) */}
        <span className="btab-marge btab-coin sel-zone" title="Sélectionner tout le tableau" onPointerDown={(e) => choisirMarge(e, G.toutLeTableau(g))} />
        {cols.map((c, k) => {
          const x = cols.slice(0, k).reduce((a, b) => a + b, 0);
          return <span key={'c' + k} className={'btab-marge btab-marge-col sel-zone' + (montrerSel && sel.j0 <= k && sel.j1 >= k && sel.i0 === 0 && sel.i1 === nl - 1 ? ' active' : '')} data-col={k}
            style={{ left: (x * 100).toFixed(3) + '%', width: (c * 100).toFixed(3) + '%' }} title={`Sélectionner la colonne ${k + 1}`}
            onPointerDown={(e) => choisirMarge(e, { i0: 0, j0: k, i1: nl - 1, j1: k })} />;
        })}
        {rangs.map(([top, h], i) => (
          <span key={'l' + i} className={'btab-marge btab-marge-lig sel-zone' + (montrerSel && sel.i0 <= i && sel.i1 >= i && sel.j0 === 0 && sel.j1 === nc - 1 ? ' active' : '')} data-lig={i}
            style={{ top, height: h }} title={`Sélectionner la ligne ${i + 1}`}
            onPointerDown={(e) => choisirMarge(e, { i0: i, j0: 0, i1: i, j1: nc - 1 })} />
        ))}
        {bords.map((x, c) => (
          <span key={'f' + c} className="btab-filet sel-zone" data-filet={c} style={{ left: (x * 100).toFixed(3) + '%' }}
            title="Glisser pour ajuster la largeur de la colonne" onPointerDown={(e) => { e.stopPropagation(); glisserFilet(e, c); }} />
        ))}
        {/* au doigt, les filets horizontaux n'existent que sous les lignes sélectionnées (marge de gauche) : sinon, sur un
            petit tableau, le doigt qui vise une cellule attrape un filet */}
        {rangs.map(([top, h], i) => (tactile && !(sel && sel.j0 === 0 && sel.j1 === nc - 1 && i >= sel.i0 && i <= sel.i1) ? null : (
          // prise bornée au tiers de la ligne : une petite ligne reste touchable (cellule) au doigt
          <span key={'h' + i} className="btab-filet-h sel-zone" data-filet-h={i} style={{ top: top + h, '--prise': Math.max(4, Math.min(prise, h * 0.34)) + 'px' }}
            title="Glisser pour ajuster la hauteur de la ligne" onPointerDown={(e) => { e.stopPropagation(); glisserFiletH(e, i); }} />
        )))}
      </>)}
    </div>
  );
}

/** la frappe est-elle au bord du texte de la cellule, dans la direction de la flèche ? */
function auBord(el, [di, dj]) {
  const s = window.getSelection();
  if (!s || !s.rangeCount) return true;
  const r = s.getRangeAt(0);
  if (!r.collapsed) return false;
  const texte = el.innerText.replace(/\n$/, '');
  if (!texte) return true;
  const avant = document.createRange();
  avant.selectNodeContents(el); avant.setEnd(r.startContainer, r.startOffset);
  const pos = avant.toString().length;
  if (dj < 0) return pos === 0;
  if (dj > 0) return pos >= texte.length;
  // haut / bas : sur la première / la dernière ligne affichée
  const rc = r.getClientRects()[0] || r.getBoundingClientRect(), rel = el.getBoundingClientRect();
  if (!rc || (!rc.height && !rc.top)) return di < 0 ? pos === 0 : pos >= texte.length;
  const lh = parseFloat(getComputedStyle(el).lineHeight) || rc.height || 16;
  const k = rel.height / (el.offsetHeight || rel.height || 1) || 1;
  return di < 0 ? rc.top - rel.top < lh * k * 0.8 : rel.bottom - rc.bottom < lh * k * 0.8;
}

function placerCurseur(el, fin = true) {
  el.focus({ preventScroll: true });
  try {
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(!fin ? true : false);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  } catch (e) { /* ignore */ }
}

/* ============================================================
   LE MENU « TABLEAU » — un bouton de la mini barre (lecteur et tableau Miro) qui ouvre un panneau regroupé :
     Sélection · Lignes et colonnes · Cellules · Bordures · Style
   Il agit sur la sélection du tableau (cellule, plage, ligne, colonne) ; sans sélection : la dernière cellule pour
   insérer, tout le tableau pour la mise en forme. Chaque action = une entrée d'Annuler.
   ============================================================ */
const MENU_SECTIONS = ['selection', 'lignes', 'cellules', 'bordures', 'style'];
export function BoutonMenuTableau({ api, grille, sel, onChange, uniteNom = 'px' }) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef(null), popRef = useRef(null);
  /* (25/10, docs/compte-rendu-apprentissage-v2-recherche-tags.md §4) le panneau s'ouvre À CÔTÉ de la boîte, jamais dessus :
     à droite, sinon à gauche, sinon en dessous (puis au-dessus) ; il reste dans l'écran et défile en interne s'il manque
     de hauteur. Posé sur la racine de l'app (position fixe) : ni la page, ni la mini barre, ni le zoom ne le coupent. */
  const [place, setPlace] = useState(null); // { left, top, maxHeight, width }
  const [tactile, setTactile] = useState(false);
  const boiteDe = () => {
    const el = (api && api.current && api.current.element && api.current.element()) || null;
    return (el && el.closest && el.closest('.note-box, .tb2-carte')) || el;
  };
  useLayoutEffect(() => {
    if (!ouvert) { setPlace(null); return undefined; }
    const placer = () => {
      const bx = boiteDe(), pop = popRef.current;
      if (!bx || !pop) return;
      setTactile(!!(ref.current && ref.current.closest('.mini-barre.tactile')));
      // la mini barre (au-dessus ou en dessous de la boîte) compte avec la boîte : le menu ne la recouvre pas non plus
      const r = bx.getBoundingClientRect(), mb = ref.current && ref.current.closest('.mini-barre, .nb-actions');
      const m = mb ? mb.getBoundingClientRect() : r;
      const obstacle = { left: Math.min(r.left, m.left), right: Math.max(r.right, m.right), top: Math.min(r.top, m.top), bottom: Math.max(r.bottom, m.bottom) };
      setPlace(placerACote(obstacle, { w: pop.offsetWidth || 292, h: pop.scrollHeight }, { W: window.innerWidth, H: window.innerHeight }));
    };
    placer();
    const raf = requestAnimationFrame(placer); // 2e mesure : contenu peint
    window.addEventListener('resize', placer); window.addEventListener('scroll', placer, true);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', placer); window.removeEventListener('scroll', placer, true); };
  }, [ouvert]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => { if (ref.current && !ref.current.contains(e.target) && !(popRef.current && popRef.current.contains(e.target)) && !(e.target.closest && e.target.closest('.sc-pop, .sc-fenetre, .scw-pipette, .btab'))) setOuvert(false); };
    const clavier = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOuvert(false); } };
    window.addEventListener('pointerdown', dehors, true);
    window.addEventListener('keydown', clavier, true);
    return () => { window.removeEventListener('pointerdown', dehors, true); window.removeEventListener('keydown', clavier, true); };
  }, [ouvert]);
  const g = G.estGrille(grille) ? grille : G.nouvelleGrille();
  const nl = g.lignes.length, nc = g.cols.length;
  const s = sel ? G.elargir(g, sel) : null;
  const cible = s || G.toutLeTableau(g); // mise en forme : la sélection, sinon tout le tableau
  const lieu = s || { i0: nl - 1, j0: nc - 1, i1: nl - 1, j1: nc - 1 }; // insertion : la sélection, sinon la fin
  const fraiche = () => (api && api.current ? api.current.valider() : g);
  const faire = (fn, lib, nouvelleSel = undefined) => {
    const g0 = fraiche(), g1 = fn(g0);
    if (g1 !== g0) onChange(g1, lib);
    if (nouvelleSel !== undefined && api && api.current) api.current.choisir(typeof nouvelleSel === 'function' ? nouvelleSel(g1) : nouvelleSel);
  };
  const fmt = (patch, lib) => faire((x) => G.formater(x, cible, patch), lib);
  const commun = (cle) => G.formatCommun(g, cible, cle);
  const tailleCommune = commun('taille');
  const [taille, setTaille] = useState('');
  useEffect(() => { setTaille(Number.isFinite(tailleCommune) ? String(Math.round(tailleCommune)) : ''); }, [tailleCommune, ouvert]); // (25/10) valeur arrondie
  const b = g.bordures || null;
  const [ep, setEp] = useState('1');
  useEffect(() => { setEp(String(b && Number.isFinite(b.ep) ? b.ep : 1).replace('.', ',')); }, [b && b.ep, ouvert]); // eslint-disable-line react-hooks/exhaustive-deps
  const lireNombre = (t) => { const v = parseFloat(String(t).replace(',', '.')); return Number.isFinite(v) && v > 0 ? v : null; };
  const arret = { onPointerDown: (e) => e.stopPropagation(), onMouseDown: (e) => { if (!(e.target.closest && e.target.closest('input'))) e.preventDefault(); } };
  const bt = (cle, icone, libelle, onClick, { actif, desactive, titre } = {}) => (
    <button key={cle} type="button" data-tab={cle} className={'mt-bt' + (actif ? ' actif' : '')} disabled={!!desactive} aria-pressed={actif === undefined ? undefined : !!actif}
      title={titre || libelle} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <IconeOutil nom={icone} size={16} /><span>{libelle}</span>
    </button>
  );
  const ic = (cle, icone, titre, onClick, { actif, desactive } = {}) => (
    <button key={cle} type="button" data-tab={cle} className={'mt-ic' + (actif ? ' actif' : '')} disabled={!!desactive} aria-pressed={actif === undefined ? undefined : !!actif}
      title={titre} aria-label={titre} onClick={(e) => { e.stopPropagation(); onClick(); }}><IconeOutil nom={icone} size={16} /></button>
  );
  const resume = s ? (G.taileSel(s) === nl * nc ? 'tout le tableau' : s.i0 === s.i1 && s.j0 === s.j1 ? `cellule L${s.i0 + 1} · C${s.j0 + 1}`
    : s.j0 === 0 && s.j1 === nc - 1 ? (s.i0 === s.i1 ? `ligne ${s.i0 + 1}` : `lignes ${s.i0 + 1}–${s.i1 + 1}`)
      : s.i0 === 0 && s.i1 === nl - 1 ? (s.j0 === s.j1 ? `colonne ${s.j0 + 1}` : `colonnes ${s.j0 + 1}–${s.j1 + 1}`)
        : `${s.i1 - s.i0 + 1} × ${s.j1 - s.j0 + 1} cellules`) : 'aucune (tout le tableau)';
  const sansLignes = s && s.i1 - s.i0 + 1 >= nl, sansCols = s && s.j1 - s.j0 + 1 >= nc;
  return (
    <span className="mt" ref={ref}>
      <button type="button" data-option="tableau" className={'nb-act avec-texte mt-bouton' + (ouvert ? ' actif' : '')} aria-haspopup="dialog" aria-expanded={ouvert}
        title="Tableau : lignes, colonnes, cellules, bordures, style" {...arret} onClick={(e) => { e.stopPropagation(); setOuvert((o) => !o); }}>
        <IconeOutil nom="grille" size={16} /><span>Tableau</span>
      </button>
      {ouvert && (
        createPortal(<div ref={popRef} role="dialog" aria-label="Tableau" className={'mb-pop mt-pop portail' + (tactile ? ' tactile' : '')} data-cote={place ? place.cote : ''}
          style={place ? { left: place.left, top: place.top, maxHeight: place.maxHeight, overflowY: 'auto' } : { left: -9999, top: 0 }} {...arret}>
          <div className="mt-section" data-section="selection">
            <div className="mt-titre">Sélection <span className="mt-resume" data-resume="">{resume}</span></div>
            <div className="mt-rangee">
              {bt('sel-cellule', 'selCellule', 'Cellule', () => api.current && api.current.choisir({ i0: lieu.i0, j0: lieu.j0, i1: lieu.i0, j1: lieu.j0 }))}
              {bt('sel-ligne', 'selLigne', 'Ligne', () => api.current && api.current.choisir({ i0: lieu.i0, j0: 0, i1: lieu.i1, j1: nc - 1 }))}
              {bt('sel-colonne', 'selColonne', 'Colonne', () => api.current && api.current.choisir({ i0: 0, j0: lieu.j0, i1: nl - 1, j1: lieu.j1 }))}
              {bt('sel-tout', 'grille', 'Tout', () => api.current && api.current.choisir(G.toutLeTableau(g)))}
            </div>
          </div>
          <div className="mt-section" data-section="lignes">
            <div className="mt-titre">Lignes et colonnes</div>
            <div className="mt-rangee">
              {bt('ins-dessus', 'ligneDessus', 'Au-dessus', () => faire((x) => G.insererLignes(x, lieu.i0), 'Ligne insérée au-dessus', { i0: lieu.i0, j0: 0, i1: lieu.i0, j1: nc - 1 }), { desactive: nl >= G.LIMITES_GRILLE.ligMax, titre: 'Insérer une ligne au-dessus' })}
              {bt('ins-dessous', 'ligneDessous', 'En dessous', () => faire((x) => G.insererLignes(x, lieu.i1 + 1), 'Ligne insérée en dessous', { i0: lieu.i1 + 1, j0: 0, i1: lieu.i1 + 1, j1: nc - 1 }), { desactive: nl >= G.LIMITES_GRILLE.ligMax, titre: 'Insérer une ligne en dessous' })}
              {bt('ins-gauche', 'colonneGauche', 'À gauche', () => faire((x) => G.insererColonnes(x, lieu.j0), 'Colonne insérée à gauche', { i0: 0, j0: lieu.j0, i1: nl - 1, j1: lieu.j0 }), { desactive: nc >= G.LIMITES_GRILLE.colMax, titre: 'Insérer une colonne à gauche' })}
              {bt('ins-droite', 'colonneDroite', 'À droite', () => faire((x) => G.insererColonnes(x, lieu.j1 + 1), 'Colonne insérée à droite', { i0: 0, j0: lieu.j1 + 1, i1: nl - 1, j1: lieu.j1 + 1 }), { desactive: nc >= G.LIMITES_GRILLE.colMax, titre: 'Insérer une colonne à droite' })}
            </div>
            <div className="mt-rangee">
              {bt('sup-ligne', 'ligneMoins', s && s.i1 > s.i0 ? 'Suppr. lignes' : 'Suppr. ligne', () => faire((x) => G.supprimerLignes(x, lieu.i0, lieu.i1), s && s.i1 > s.i0 ? 'Lignes supprimées' : 'Ligne supprimée', (g1) => { const i = Math.min(lieu.i0, g1.lignes.length - 1), j = Math.min(lieu.j0, g1.cols.length - 1); return { i0: i, j0: j, i1: i, j1: j }; }), { desactive: nl <= 1 || sansLignes, titre: 'Supprimer la ligne (ou les lignes de la sélection)' })}
              {bt('sup-colonne', 'colonneMoins', s && s.j1 > s.j0 ? 'Suppr. colonnes' : 'Suppr. colonne', () => faire((x) => G.supprimerColonnes(x, lieu.j0, lieu.j1), s && s.j1 > s.j0 ? 'Colonnes supprimées' : 'Colonne supprimée', (g1) => { const i = Math.min(lieu.i0, g1.lignes.length - 1), j = Math.min(lieu.j0, g1.cols.length - 1); return { i0: i, j0: j, i1: i, j1: j }; }), { desactive: nc <= 1 || sansCols, titre: 'Supprimer la colonne (ou les colonnes de la sélection)' })}
              {bt('repartir', 'repartir', 'Répartir', () => faire(G.repartir, 'Colonnes réparties'), { titre: 'Répartir uniformément : colonnes de même largeur, lignes à leur hauteur naturelle' })}
            </div>
          </div>
          <div className="mt-section" data-section="cellules">
            <div className="mt-titre">Cellules</div>
            <div className="mt-rangee">
              {bt('fusionner', 'fusionner', 'Fusionner', () => faire((x) => G.fusionner(x, s), 'Cellules fusionnées', (g1) => ({ i0: s.i0, j0: s.j0, i1: s.i1, j1: s.j1 })), { desactive: !G.peutFusionner(g, s) })}
              {bt('scinder', 'scinder', 'Scinder', () => faire((x) => G.scinder(x, s), 'Cellules scindées'), { desactive: !G.peutScinder(g, s) })}
              <span className="mt-couleur" data-tab="fond"><BoutonCouleur couleur={commun('fond')} aucune titre="Fond des cellules" icone={<IconeOutil nom="remplir" size={15} />}
                onCouleur={(c) => fmt({ fond: c === AUCUNE ? null : c }, 'Fond des cellules')} /></span>
            </div>
            <div className="mt-rangee">
              <span className="mt-couleur" data-tab="couleur"><BoutonCouleur couleur={commun('couleur')} aucune titre="Couleur du texte" icone={<span className="et-lettre" aria-hidden="true">A</span>}
                onCouleur={(c) => fmt({ couleur: c === AUCUNE ? null : c }, 'Couleur du texte des cellules')} /></span>
              {ic('gras', 'gras', 'Gras', () => fmt({ gras: !commun('gras') }, 'Gras des cellules'), { actif: !!commun('gras') })}
              {ic('italique', 'italique', 'Italique', () => fmt({ italique: !commun('italique') }, 'Italique des cellules'), { actif: !!commun('italique') })}
              <label className="mt-champ" title={`Taille du texte des cellules (${uniteNom})`}>
                <IconeOutil nom="tailleTexte" size={15} />
                <input type="text" inputMode="decimal" data-tab="taille" value={taille} placeholder="auto" aria-label={`Taille du texte des cellules en ${uniteNom}`}
                  onChange={(e) => setTaille(e.target.value)}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); const v = lireNombre(taille); fmt({ taille: v ? Math.max(4, Math.min(120, v)) : null }, 'Taille du texte des cellules'); } }}
                  onBlur={() => { const v = lireNombre(taille); if ((v || null) !== (Number.isFinite(tailleCommune) ? tailleCommune : null)) fmt({ taille: v ? Math.max(4, Math.min(120, v)) : null }, 'Taille du texte des cellules'); }} />
                <span className="mt-unite">{uniteNom}</span>
              </label>
            </div>
            <div className="mt-rangee">
              {ic('h-gauche', 'alignGauche', 'Aligner à gauche', () => fmt({ alignH: null }, 'Alignement des cellules'), { actif: !commun('alignH') })}
              {ic('h-centre', 'alignCentre', 'Centrer', () => fmt({ alignH: 'center' }, 'Alignement des cellules'), { actif: commun('alignH') === 'center' })}
              {ic('h-droite', 'alignDroite', 'Aligner à droite', () => fmt({ alignH: 'right' }, 'Alignement des cellules'), { actif: commun('alignH') === 'right' })}
              <span className="mt-sep" aria-hidden="true" />
              {ic('v-haut', 'alignHaut', 'En haut de la cellule', () => fmt({ alignV: null }, 'Alignement vertical'), { actif: !commun('alignV') })}
              {ic('v-milieu', 'alignMilieu', 'Au milieu de la cellule', () => fmt({ alignV: 'milieu' }, 'Alignement vertical'), { actif: commun('alignV') === 'milieu' })}
              {ic('v-bas', 'alignBas', 'En bas de la cellule', () => fmt({ alignV: 'bas' }, 'Alignement vertical'), { actif: commun('alignV') === 'bas' })}
            </div>
          </div>
          <div className="mt-section" data-section="bordures">
            <div className="mt-titre">Bordures</div>
            <div className="mt-rangee">
              {ic('b-toutes', 'bordToutes', 'Toutes les bordures', () => faire((x) => G.bordures(x, { mode: 'toutes' }), 'Bordures : toutes'), { actif: !!b && b.mode === 'toutes' })}
              {ic('b-interieures', 'bordInterieures', 'Bordures intérieures', () => faire((x) => G.bordures(x, { mode: 'interieures' }), 'Bordures : intérieures'), { actif: !b || b.mode === 'interieures' })}
              {ic('b-exterieures', 'bordExterieures', 'Bordures extérieures', () => faire((x) => G.bordures(x, { mode: 'exterieures' }), 'Bordures : extérieures'), { actif: !!b && b.mode === 'exterieures' })}
              {ic('b-aucune', 'bordAucune', 'Aucune bordure', () => faire((x) => G.bordures(x, { mode: 'aucune' }), 'Bordures : aucune'), { actif: !!b && b.mode === 'aucune' })}
              <span className="mt-sep" aria-hidden="true" />
              <span className="mt-couleur" data-tab="b-couleur"><BoutonCouleur couleur={(b && b.couleur) || null} aucune titre="Couleur des bordures (aucune = celle du texte)"
                onCouleur={(c) => faire((x) => G.bordures(x, { couleur: c === AUCUNE ? null : c }), 'Couleur des bordures')} /></span>
              <label className="mt-champ etroit" title={`Épaisseur des bordures (${uniteNom})`}>
                <input type="text" inputMode="decimal" data-tab="b-ep" value={ep} aria-label={`Épaisseur des bordures en ${uniteNom}`}
                  onChange={(e) => setEp(e.target.value)}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); const v = lireNombre(ep); if (v) faire((x) => G.bordures(x, { ep: Math.min(12, v) }), 'Épaisseur des bordures'); } }}
                  onBlur={() => { const v = lireNombre(ep); if (v && v !== (b && b.ep)) faire((x) => G.bordures(x, { ep: Math.min(12, v) }), 'Épaisseur des bordures'); }} />
                <span className="mt-unite">{uniteNom}</span>
              </label>
            </div>
          </div>
          <div className="mt-section" data-section="style">
            <div className="mt-titre">Style</div>
            <div className="mt-rangee">
              {bt('st-entete', 'entete', 'En-tête', () => faire((x) => G.style(x, 'entete'), 'En-tête du tableau'), { actif: !!g.entete, titre: 'Ligne d’en-tête (1re ligne en gras)' })}
              {bt('st-alterne', 'lignesAlternees', 'Alternées', () => faire((x) => G.style(x, 'alterne'), 'Lignes alternées'), { actif: !!g.alterne, titre: 'Lignes alternées (une sur deux teintée)' })}
              {bt('st-aucun', 'styleAucun', 'Aucun', () => faire((x) => G.style(x, 'aucun'), 'Style du tableau retiré'), { actif: !g.entete && !g.alterne, titre: 'Aucun style' })}
            </div>
          </div>
        </div>, document.querySelector('[data-app="medrevise"]') || document.body)
      )}
    </span>
  );
}

export { MENU_SECTIONS };
