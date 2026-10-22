/* ============================================================
   MedRevise — LA BOÎTE-TABLEAU (22/10, docs/compte-rendu-simplification-outils.md §4). UN composant, posé dans une
   boîte du lecteur (pdf/PdfPage.jsx, NoteBox) et dans une carte du tableau Miro (tableau/Board.jsx).

   Le tableau FAIT CORPS avec sa boîte : il en occupe toute la largeur intérieure, hérite de son fond, de ses marges,
   de ses arrondis et de sa typographie (taille, police, couleur) ; filets intérieurs fins de la couleur du texte à
   faible opacité, aucune bordure extérieure en plus de celle de la boîte ; ligne d'en-tête optionnelle, en gras.

   Modèle (champ `grille` de la boîte ou de la carte) :
     { v: 1, cols: [fractions de la largeur, somme 1], lignes: [[texte de chaque cellule]], entete: bool }
   Édition : clic dans une cellule, Tab / Maj+Tab d'une cellule à l'autre, Entrée = retour à la ligne dans la cellule,
   Échap pour sortir ; une cellule modifiée = une entrée d'Annuler (à sa sortie). Glisser un filet vertical = largeur
   de la colonne (ses deux voisines se partagent la place) ; redimensionner la boîte garde les proportions.
   ============================================================ */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { suivrePointeur } from './pointeur.js';

export const GRILLE_DEFAUT = { colonnes: 3, lignes: 4 };
export const LIMITES_GRILLE = { colMin: 1, colMax: 8, ligMin: 1, ligMax: 30, largeurMin: 0.06 };

export function nouvelleGrille(nc = GRILLE_DEFAUT.colonnes, nl = GRILLE_DEFAUT.lignes) {
  return { v: 1, cols: Array.from({ length: nc }, () => +(1 / nc).toFixed(4)), lignes: Array.from({ length: nl }, () => Array.from({ length: nc }, () => '')), entete: true };
}
export const estGrille = (g) => !!(g && Array.isArray(g.cols) && Array.isArray(g.lignes) && g.cols.length);
const normer = (cols) => { const s = cols.reduce((a, b) => a + b, 0) || 1; return cols.map((c) => +(c / s).toFixed(4)); };

/* ---- opérations pures (mini barre) ---- */
export const ajouterLigne = (g, apres = g.lignes.length - 1) => (g.lignes.length >= LIMITES_GRILLE.ligMax ? g
  : { ...g, lignes: [...g.lignes.slice(0, apres + 1), g.cols.map(() => ''), ...g.lignes.slice(apres + 1)] });
export const ajouterColonne = (g, apres = g.cols.length - 1) => {
  if (g.cols.length >= LIMITES_GRILLE.colMax) return g;
  const n = g.cols.length + 1;
  const cols = normer([...g.cols.slice(0, apres + 1).map((c) => c * (n - 1) / n), 1 / n, ...g.cols.slice(apres + 1).map((c) => c * (n - 1) / n)]);
  return { ...g, cols, lignes: g.lignes.map((l) => [...l.slice(0, apres + 1), '', ...l.slice(apres + 1)]) };
};
export const retirerLigne = (g, i = g.lignes.length - 1) => (g.lignes.length <= LIMITES_GRILLE.ligMin ? g : { ...g, lignes: g.lignes.filter((_, k) => k !== i) });
export const retirerColonne = (g, i = g.cols.length - 1) => (g.cols.length <= LIMITES_GRILLE.colMin ? g
  : { ...g, cols: normer(g.cols.filter((_, k) => k !== i)), lignes: g.lignes.map((l) => l.filter((_, k) => k !== i)) });
/** le tableau mis à plat (export, recherche, IA, ancienne version de l'app) : une ligne par rangée, cellules séparées par « | » */
export const texteGrille = (g) => (estGrille(g) ? g.lignes.map((l) => l.map((c) => String(c || '').replace(/\n/g, ' ')).join(' | ')).join('\n') : '');
/** même chose en document TipTap (champ `content` d'une boîte : lu par l'export PDF, l'export IA, les textes) */
export const contenuGrille = (g) => ({ type: 'doc', content: (estGrille(g) ? g.lignes : [[]]).map((l) => {
  const t = l.map((c) => String(c || '').replace(/\n/g, ' ')).join(' | ');
  return t.replace(/[|\s]/g, '') ? { type: 'paragraph', content: [{ type: 'text', text: t }] } : { type: 'paragraph' };
}) });

/**
 * <BoiteTableau grille edition onChange onFin cellule? style? />
 *   edition            cellules modifiables (sinon simple affichage, le pointeur passe à la boîte)
 *   onChange(g, lib)   une modification validée (cellule quittée, colonne ajustée)
 *   onFin()            Échap : sortir de l'édition
 *   onCellule(i, j)    la cellule qui a le curseur (la mini barre ajoute / retire à cet endroit)
 *   focus              { x, y } : point du clic d'activation — la cellule visée prend le curseur
 *   filets             glisser les filets verticaux (boîte sélectionnée ou en édition)
 */
export function BoiteTableau({ grille, edition = false, onChange, onFin = () => {}, onCellule = () => {}, focus = null, filets = false, style = null, echelle = 1 }) {
  const g = estGrille(grille) ? grille : nouvelleGrille();
  const ref = useRef(null);
  const [colsApercu, setColsApercu] = useState(null);
  const cols = colsApercu || g.cols;
  const valeurs = useRef(new Map()); // texte en cours de frappe par cellule « i:j »
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
  /* SORTIE D'ÉDITION par un clic ailleurs : les cellules disparaissent sans toujours recevoir `blur` — le texte tapé
     et pas encore validé est écrit ici (une seule entrée d'Annuler) */
  const grilleRef = useRef(g); grilleRef.current = g;
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  useEffect(() => {
    if (edition || !valeurs.current.size) return;
    const g0 = grilleRef.current;
    const lignes = g0.lignes.map((l, i) => l.map((c, j) => { const v = valeurs.current.get(i + ':' + j); return v == null ? c : v.replace(/\n$/, ''); }));
    valeurs.current.clear();
    if (JSON.stringify(lignes) !== JSON.stringify(g0.lignes)) onChangeRef.current({ ...g0, lignes }, 'Cellule du tableau');
  }, [edition]);

  const valider = (i, j, el) => {
    const t = el.innerText.replace(/\n$/, '');
    valeurs.current.delete(i + ':' + j);
    if (t === (g.lignes[i][j] || '')) return;
    onChange({ ...g, lignes: g.lignes.map((l, a) => (a === i ? l.map((c, b) => (b === j ? t : c)) : l)) }, 'Cellule du tableau');
  };
  const clavier = (e, i, j) => {
    e.stopPropagation(); // ⌘1–6, Suppr… restent au texte
    if (e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur(); onFin(); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      const n = g.cols.length, k = i * n + j + (e.shiftKey ? -1 : 1);
      const total = g.lignes.length * n;
      if (k < 0 || k >= total) return;
      const el = ref.current && ref.current.querySelector(`.btab-cell[data-i="${Math.floor(k / n)}"][data-j="${k % n}"]`);
      if (el) placerCurseur(el);
    }
  };
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
        const a = Math.max(LIMITES_GRILLE.largeurMin, Math.min(paire - LIMITES_GRILLE.largeurMin, base[c] + d));
        courant = base.map((v, k) => (k === c ? a : k === c + 1 ? paire - a : v));
        setColsApercu(courant);
      },
      fin: (ev, { annule }) => { setColsApercu(null); if (!annule && courant) onChange({ ...g, cols: normer(courant) }, 'Largeur de colonne'); },
    });
  };
  const bords = [];
  cols.reduce((x, c, k) => { if (k < cols.length - 1) bords.push(x + c); return x + c; }, 0);
  return (
    <div ref={ref} className={'btab' + (edition ? ' edition' : '') + (g.entete ? ' avec-entete' : '')} style={style || undefined}
      onPointerDown={edition ? (e) => e.stopPropagation() : undefined}>
      <table className="btab-table">
        <colgroup>{cols.map((c, k) => <col key={k} style={{ width: (c * 100).toFixed(3) + '%' }} />)}</colgroup>
        <tbody>
          {g.lignes.map((l, i) => (
            <tr key={i} className={g.entete && i === 0 ? 'btab-tete' : undefined}>
              {g.cols.map((_, j) => (
                <td key={j} className="btab-td">
                  {edition ? (
                    <div className="btab-cell" data-i={i} data-j={j} contentEditable="plaintext-only" suppressContentEditableWarning spellCheck={false}
                      role="textbox" aria-label={`Cellule ligne ${i + 1}, colonne ${j + 1}`}
                      onFocus={() => onCellule(i, j)}
                      onInput={(e) => valeurs.current.set(i + ':' + j, e.currentTarget.innerText)}
                      onBlur={(e) => valider(i, j, e.currentTarget)}
                      onKeyDown={(e) => clavier(e, i, j)}
                      onPaste={(e) => { e.preventDefault(); const t = e.clipboardData.getData('text/plain'); document.execCommand('insertText', false, t); }}>
                      {l[j] || ''}
                    </div>
                  ) : <div className="btab-cell" data-i={i} data-j={j}>{l[j] || ' '}</div>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {filets && bords.map((x, c) => (
        <span key={c} className="btab-filet sel-zone" data-filet={c} style={{ left: (x * 100).toFixed(3) + '%', '--ech': 1 / (echelle || 1) }}
          title="Glisser pour ajuster la largeur de la colonne" onPointerDown={(e) => { e.stopPropagation(); glisserFilet(e, c); }} />
      ))}
    </div>
  );
}

function placerCurseur(el) {
  el.focus({ preventScroll: true });
  try {
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  } catch (e) { /* ignore */ }
}
