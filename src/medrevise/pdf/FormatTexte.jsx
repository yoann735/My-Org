/* ============================================================
   MedRevise — LA MISE EN FORME DU TEXTE, en éléments de mini barre (22/10, docs/compte-rendu-simplification-outils.md).

   Remplace la grande barre de format posée au-dessus de la diapo (EditToolbar) : ses options vivent désormais dans la
   mini barre de l'objet (pdf/Selection.jsx) — boîte, post-it, boîte-tableau, texte libre, bloc de texte remplacé — et,
   pour un document créé dans l'app, dans une mini barre du même style au-dessus de la sélection de texte.

   Deux cibles, mêmes options :
     - un ÉDITEUR ouvert (TipTap, le moteur unique documents/lib/richtext.js) : la sélection s'il y en a une, sinon tout
       le texte de l'objet (`toutSiVide`, boîtes) — le curseur est remis où il était ;
     - un CONTENU enregistré (objet sélectionné, pas en édition) : tout le texte, transformé par un éditeur sans
       affichage, et rendu par `onContenu(json, libelle)` (une entrée d'Annuler du lecteur).
   ============================================================ */
import { useEffect, useState } from 'react';
import { Editor } from '@tiptap/core';
import { IconeOutil } from './IconesOutils.jsx';
import { AUCUNE } from './Couleurs.jsx';
import { couleurHex, FONT_FAMILIES, FONT_SIZES } from './pdfShared.js';
import { RICH_EXTENSIONS, EMPTY_DOC } from '../documents/lib/richtext.js';
import { MiniBarreFlottante } from './Selection.jsx';
import { Icon } from '../../shared/Icon.jsx';

/** re-rend le composant à chaque transaction de l'éditeur (état des boutons : gras actif…) */
export function useSuiviEditeur(editor) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!editor) return undefined;
    const f = () => force((v) => v + 1);
    editor.on('transaction', f);
    return () => editor.off('transaction', f);
  }, [editor]);
}

/** applique `fn(chain)` à TOUT le texte d'un contenu enregistré (JSON ProseMirror) ; rend le nouveau JSON */
export function transformerContenu(contenu, fn, extensions = RICH_EXTENSIONS) {
  const ed = new Editor({ extensions, content: contenu || EMPTY_DOC });
  try { fn(ed.chain().selectAll()).run(); return ed.getJSON(); } finally { ed.destroy(); }
}

/* ---- lecture de l'état d'un contenu enregistré (sans éditeur) ---- */
const textes = (doc) => { const out = []; const w = (n) => { if (!n) return; if (n.type === 'text' && n.text && n.text.trim()) out.push(n); (n.content || []).forEach(w); }; w(doc); return out; };
const marque = (t, nom) => (t.marks || []).find((m) => m.type === nom);
const toutAvec = (doc, nom) => { const ts = textes(doc); return ts.length > 0 && ts.every((t) => marque(t, nom)); };
const premierBloc = (doc) => { let b = null; const w = (n) => { if (b || !n) return; if (n.type === 'paragraph' || n.type === 'heading') { b = n; return; } (n.content || []).forEach(w); }; w(doc); return b; };
const attrTexte = (doc, cle) => { const t = textes(doc)[0]; const m = t && marque(t, 'textStyle'); return (m && m.attrs && m.attrs[cle]) || null; };
const contientNoeud = (doc, nom) => { let oui = false; const w = (n) => { if (oui || !n) return; if (n.type === nom) { oui = true; return; } (n.content || []).forEach(w); }; w(doc); return oui; };

export const ALIGNEMENTS = [
  { id: 'left', label: 'à gauche', icone: 'alignGauche' },
  { id: 'center', label: 'centré', icone: 'alignCentre' },
  { id: 'right', label: 'à droite', icone: 'alignDroite' },
  { id: 'justify', label: 'justifié', icone: 'alignJustifie' },
];

/**
 * Les éléments de mise en forme. `editor` (ouvert) ou `contenu` + `onContenu(json, libelle)` (enregistré).
 * Rend un objet d'éléments nommés, que chaque objet range dans SA mini barre (ordre et « … » propres à l'objet).
 *   toutSiVide   éditeur ouvert sans sélection : l'action vaut pour tout le texte (boîtes) — sinon pour le curseur
 *   document     ajoute titres, cases, citation, tableau, séparateur, lien (texte d'un document)
 */
export function elementsFormat({ editor = null, contenu = null, onContenu = null, toutSiVide = true, document: avecDoc = false }) {
  const ouvert = !!(editor && !editor.isDestroyed);
  const surSelection = ouvert && !editor.state.selection.empty;
  const run = (fn, libelle) => {
    if (ouvert) {
      if (surSelection || !toutSiVide) { fn(editor.chain().focus()).run(); return; }
      const { from } = editor.state.selection;
      fn(editor.chain().focus().selectAll()).setTextSelection(from).run();
      return;
    }
    if (onContenu) onContenu(transformerContenu(contenu, fn), libelle);
  };
  // état : celui de la sélection (éditeur ouvert), sinon celui de tout le texte
  const actif = (nom, attrs) => {
    if (ouvert) {
      if (surSelection || !toutSiVide) return editor.isActive(nom, attrs);
      const ts = textes(editor.getJSON());
      return ts.length > 0 && ts.every((t) => marque(t, nom));
    }
    return toutAvec(contenu, nom);
  };
  const align = (() => {
    if (ouvert) { const a = ALIGNEMENTS.find((x) => editor.isActive({ textAlign: x.id })); return a ? a.id : 'left'; }
    const b = premierBloc(contenu); return (b && b.attrs && b.attrs.textAlign) || 'left';
  })();
  const attr = (cle) => (ouvert ? editor.getAttributes('textStyle')[cle] || null : attrTexte(contenu, cle));
  const bascule = (nom, cmd, lib) => {
    const on = actif(nom);
    return () => run((c) => (on ? c[`unset${cmd}`]() : c[`set${cmd}`]()), on ? `${lib} retiré` : lib);
  };
  const iA = ALIGNEMENTS.findIndex((a) => a.id === align);
  const aSuivant = ALIGNEMENTS[(iA + 1) % ALIGNEMENTS.length];
  const ic = (n, s = 16) => <IconeOutil nom={n} size={s} />;
  const el = {
    gras: { cle: 'gras', icone: ic('gras', 15), titre: 'Gras (⌘B)', actif: actif('bold'), onClick: bascule('bold', 'Bold', 'Gras') },
    italique: { cle: 'italique', icone: ic('italique', 15), titre: 'Italique (⌘I)', actif: actif('italic'), onClick: bascule('italic', 'Italic', 'Italique') },
    souligne: { cle: 'souligne', icone: ic('souligne', 15), titre: 'Souligné (⌘U)', actif: actif('underline'), onClick: bascule('underline', 'Underline', 'Souligné') },
    barre: { cle: 'barre', icone: ic('barre', 15), titre: 'Barré', actif: actif('strike'), onClick: bascule('strike', 'Strike', 'Barré') },
    align: { cle: 'align', icone: ic(ALIGNEMENTS[iA].icone), titre: `Alignement : ${ALIGNEMENTS[iA].label} — cliquer pour « ${aSuivant.label} »`,
      onClick: () => run((c) => c.setTextAlign(aSuivant.id), 'Alignement') },
    couleur: { cle: 'couleur-texte', titre: 'Couleur du texte', couleur: attr('color'), icone: <span className="et-lettre" aria-hidden="true">A</span>,
      onCouleur: (c) => run((ch) => (c === AUCUNE || !c ? ch.unsetColor() : ch.setColor(couleurHex(c, '#1F1F24'))), 'Couleur du texte') },
    fond: { cle: 'fond-texte', titre: 'Surligneur de fond du texte', couleur: attr('backgroundColor'), aucune: true, icone: ic('fondTexte', 13),
      onCouleur: (c) => run((ch) => (c === AUCUNE ? ch.unsetBackgroundColor() : ch.setBackgroundColor(couleurHex(c))), 'Fond du texte') },
    police: { cle: 'police', titre: 'Police', element: (
      <select className="et-select mb-select" value="" aria-label="Police" onChange={(e) => { const v = e.target.value; e.target.value = ''; if (v) run((c) => (v === 'inherit' ? c.unsetFontFamily() : c.setFontFamily(v)), 'Police'); }}>
        <option value="" disabled>{attr('fontFamily') || 'Par défaut'}</option>
        {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f === 'inherit' ? 'Par défaut' : f}</option>)}
      </select>) },
    puces: { cle: 'puces', icone: ic('listePuces'), titre: 'Liste à puces', actif: ouvert ? editor.isActive('bulletList') : contientNoeud(contenu, 'bulletList'), onClick: () => run((c) => c.toggleBulletList(), 'Liste à puces') },
    numeros: { cle: 'numeros', icone: ic('listeNum'), titre: 'Liste numérotée', actif: ouvert ? editor.isActive('orderedList') : contientNoeud(contenu, 'orderedList'), onClick: () => run((c) => c.toggleOrderedList(), 'Liste numérotée') },
  };
  if (avecDoc && ouvert) {
    const r = (f) => () => f(editor.chain().focus()).run();
    Object.assign(el, {
      titre1: { cle: 'h1', icone: ic('titre1'), titre: 'Titre 1', actif: editor.isActive('heading', { level: 1 }), onClick: r((c) => c.toggleHeading({ level: 1 })) },
      titre2: { cle: 'h2', icone: ic('titre2'), titre: 'Titre 2', actif: editor.isActive('heading', { level: 2 }), onClick: r((c) => c.toggleHeading({ level: 2 })) },
      titre3: { cle: 'h3', icone: ic('titre3'), titre: 'Titre 3', actif: editor.isActive('heading', { level: 3 }), onClick: r((c) => c.toggleHeading({ level: 3 })) },
      cases: { cle: 'cases', icone: ic('cases'), titre: 'Cases à cocher (⌘⇧9)', actif: editor.isActive('taskList'), onClick: r((c) => c.toggleTaskList()) },
      citation: { cle: 'citation', icone: ic('citation'), titre: 'Citation', actif: editor.isActive('blockquote'), onClick: r((c) => c.toggleBlockquote()) },
      // (25/10) même icône de taille que partout, valeur arrondie à l'entier
      taille: { cle: 'taille-doc', titre: 'Taille du texte', element: (
        <span className="ct-select" title="Taille du texte"><IconeOutil nom="tailleTexte" size={15} />
        <select className="et-select mb-select" value="" aria-label="Taille du texte" onChange={(e) => { const v = e.target.value; e.target.value = ''; if (v) editor.chain().focus().setFontSize(v).run(); }}>
          <option value="" disabled>{attr('fontSize') ? String(Math.round(parseFloat(attr('fontSize')))) : '—'}</option>
          {FONT_SIZES.map((f) => <option key={f} value={f}>{String(Math.round(parseFloat(f)))}</option>)}
        </select></span>) },
      tableau: { cle: 'tableau', icone: ic('grille'), titre: 'Tableau (3 × 3)', actif: editor.isActive('table'), onClick: r((c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true })) },
      separateur: { cle: 'separateur', icone: ic('separateur'), titre: 'Séparateur', onClick: r((c) => c.setHorizontalRule()) },
      lien: { cle: 'lien', icone: ic('lien'), titre: editor.isActive('link') ? 'Retirer le lien' : 'Lien (adresse demandée)', actif: editor.isActive('link'), onClick: () => {
        if (editor.isActive('link')) { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
        const h = (window.prompt('Adresse du lien', 'https://') || '').trim();
        if (h && h !== 'https://') editor.chain().focus().extendMarkRange('link').setLink({ href: /^[a-z]+:/i.test(h) ? h : 'https://' + h }).run();
      } },
    });
    if (editor.isActive('table')) Object.assign(el, {
      tLigne: { cle: 't-ligne', icone: ic('ligneAjout'), titre: 'Tableau : ajouter une ligne', onClick: r((c) => c.addRowAfter()) },
      tColonne: { cle: 't-colonne', icone: ic('colonneAjout'), titre: 'Tableau : ajouter une colonne', onClick: r((c) => c.addColumnAfter()) },
      tLigneMoins: { cle: 't-ligne-moins', icone: ic('ligneMoins'), titre: 'Tableau : supprimer la ligne', onClick: r((c) => c.deleteRow()) },
      tColonneMoins: { cle: 't-colonne-moins', icone: ic('colonneMoins'), titre: 'Tableau : supprimer la colonne', onClick: r((c) => c.deleteColumn()) },
      tSupprimer: { cle: 't-supprimer', icone: ic('grille'), titre: 'Supprimer le tableau', onClick: r((c) => c.deleteTable()) },
    });
  }
  return el;
}

/**
 * LA MINI BARRE DU TEXTE D'UN DOCUMENT (texte du flux, ou d'une page) : au-dessus de la sélection (et dans un tableau du
 * document), même composant et même style que celle des objets. Remplace la barre de format permanente et la bulle
 * de sélection d'avant (Notion · Flashcard, gardés en fin de barre).
 *   rect   rectangle de la sélection à l'écran ; notion : la sélection est-elle déjà une notion ?
 */
export function BarreTexteDocument({ editor, rect: rect0, notion = false, onNotion, onRetirerNotion, onFlashcard }) {
  useSuiviEditeur(editor);
  // la barre suit la sélection : mise en forme (un titre grandit), défilement de la page
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((v) => v + 1);
    window.addEventListener('scroll', f, true);
    return () => window.removeEventListener('scroll', f, true);
  }, []);
  if (!editor || editor.isDestroyed || !rect0) return null;
  let rect = rect0;
  try { rect = rectSelection(editor); } catch (e) { /* repli : le rectangle donné */ }
  const f = elementsFormat({ editor, toutSiVide: false, document: true });
  const vide = editor.state.selection.empty;
  const items = [
    f.gras, f.italique, f.souligne,
    { cle: '|' },
    f.titre1, f.titre2, f.puces, f.numeros, f.align,
    { cle: '|' },
    f.couleur,
    ...(f.tLigne ? [{ cle: '|' }, f.tLigne, f.tColonne] : []),
    { cle: '…', plus: [f.barre, f.titre3, f.taille, f.police, f.fond, { cle: '|' }, f.cases, f.citation, f.tableau,
      ...(f.tLigne ? [f.tLigneMoins, f.tColonneMoins, f.tSupprimer] : []), f.separateur, f.lien] },
    ...(!vide ? [
      { cle: '|' },
      notion ? { cle: 'notion', texte: 'Retirer la notion', icone: <Icon name="x" size={13} />, titre: 'Ce passage n’est plus une notion', onClick: onRetirerNotion }
        : { cle: 'notion', texte: 'Notion', icone: <Icon name="edit" size={13} />, titre: 'Faire de ce passage une notion (mode Notions du panneau)', onClick: onNotion },
      { cle: 'flashcard', texte: 'Flashcard', icone: <Icon name="cards" size={13} />, titre: 'Créer une flashcard à partir de ce passage', onClick: onFlashcard },
    ] : []),
  ];
  return <MiniBarreFlottante rect={rect} items={items} classe="barre-texte-doc pt-bulle" />;
}

/** rectangle à l'écran de la sélection d'un éditeur (ou du curseur), pour poser la mini barre */
export function rectSelection(ed) {
  const { from, to } = ed.state.selection;
  const a = ed.view.coordsAtPos(from), b = ed.view.coordsAtPos(to);
  const left = Math.min(a.left, b.left), right = Math.max(a.right, b.right), top = Math.min(a.top, b.top), bottom = Math.max(a.bottom, b.bottom);
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}
