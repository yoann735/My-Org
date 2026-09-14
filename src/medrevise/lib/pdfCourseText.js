/* ============================================================
   MedRevise — texte structuré + surlignages d'une FICHE PDF, au format EXACT des
   fiches HTML (gabarit) : même `texte_structure` que ficheToText, mêmes entrées
   `surlignages[]` que extractHighlights (lib/courseExport.js). Sert « Copier les
   notions » et « Tout exporter » du lecteur PDF, et l'export de chapitre.

   D'OÙ VIENT LA STRUCTURE. Un PDF n'a pas de <h2>/<table>/<ul> : on lit son arbre de
   balisage (PDF « tagged », ce que produit PowerPoint) — P, Table/TR/TD, L/LI,
   Figure… — relié au texte par les identifiants de contenu marqué de pdf.js. Un PDF
   non balisé retombe sur une ligne de texte par paragraphe (tableaux non reconstruits).

   RÈGLES DU GABARIT REPRODUITES (gabarit-fiche.html, applyHighlight / wrapTextNode) :
   - tout surlignage, quelle que soit sa couleur, devient [PRIORITAIRE]…[/PRIORITAIRE]
     dans le texte ; c'est `surlignages[]` qui porte le sens de la couleur ;
   - un surlignage ne franchit pas un bloc : un passage à cheval sur deux cellules
     (ou deux puces) donne un morceau par cellule, comme un <mark> par nœud texte ;
   - superposition : le NOUVEAU surlignage d'une autre couleur prend la portion
     commune et scinde l'ancien (jaune | rose | jaune) ; de même couleur, l'ancien
     reste. D'où `dans_notion` d'un rose = les jaunes qui le TOUCHENT (blancs ignorés).
   Les notes (champ `note` d'un surlignage) sortent en [NOTE PERSONNELLE — …] juste
   après le bloc où finit le passage, comme un encadré .note du gabarit.

   Aucune dépendance au DOM : fonctionne sans afficher le PDF (export de chapitre).
   ============================================================ */
import { legendeFiche, tableCellsToText } from './ficheToText.js';
import { SENS_PAR_COULEUR } from './courseExport.js';

const collapse = (s) => s.replace(/\s+/g, ' ').trim();

// Icônes de la bibliothèque PowerPoint : leur texte de remplacement est généré
// automatiquement (« Badge croix avec un remplissage uni ») et ne décrit pas une
// figure du cours — les laisser produirait une rafale de [IMAGE : …] vides de sens.
const ALT_ICONE_AUTO = /(avec un remplissage uni|avec contour|with solid fill|outline)\s*$/i;
const HEADING = { H: '\n## ', H1: '\n## ', H2: '\n## ', H3: '\n### ', H4: '\n### ', H5: '\n### ', H6: '\n### ' };

/* ---------- 1. modèle de texte d'une page ---------- */

/** items non vides (index = celui des <span> de la couche de texte, donc des ancres)
    + fin de ligne portée par l'item ou par un item vide qui le suit + contenu marqué. */
async function pageModel(page) {
  const tc = await page.getTextContent({ includeMarkedContent: true });
  const items = [];
  const mcItems = new Map(); // id de contenu marqué → [index d'item]
  const stack = [];
  for (const it of tc.items) {
    if (it.type === 'beginMarkedContentProps' || it.type === 'beginMarkedContent') { stack.push(it.id || null); continue; }
    if (it.type === 'endMarkedContent') { stack.pop(); continue; }
    if (!it.str) {
      if (it.hasEOL && items.length) items[items.length - 1].eol = true;
      continue;
    }
    const k = items.length;
    items.push({ str: it.str, eol: !!it.hasEOL });
    const mc = [...stack].reverse().find(Boolean);
    if (mc) { if (!mcItems.has(mc)) mcItems.set(mc, []); mcItems.get(mc).push(k); }
  }
  let tree = null;
  try { tree = await page.getStructTree(); } catch (e) { tree = null; }
  return { items, mcItems, blocks: buildBlocks(tree, items, mcItems) };
}

/** blocs dans l'ordre de lecture. Un bloc = { kind, ... } dont les parties textuelles
    sont des « unités » : listes de paragraphes, chaque paragraphe = [index d'item]. */
function buildBlocks(tree, items, mcItems) {
  const used = new Set();
  const itemsOf = (node) => {
    const out = [];
    const walk = (n) => {
      if (!n) return;
      if (n.type === 'content') { (mcItems.get(n.id) || []).forEach((k) => { if (!used.has(k)) { used.add(k); out.push(k); } }); return; }
      (n.children || []).forEach(walk);
    };
    walk(node);
    return out;
  };
  const isPara = (n) => n.role === 'P' || HEADING[n.role] != null || (n.children || []).some((c) => c.type === 'content');
  // paragraphes d'un conteneur (cellule, corps de puce) — deux <P> dans une cellule restent séparés
  const parasOf = (node) => {
    if (!node || node.type === 'content') return [];
    if (isPara(node)) { const its = itemsOf(node); return its.length ? [its] : []; }
    return (node.children || []).flatMap(parasOf);
  };

  const blocks = [];
  const walk = (node) => {
    if (!node || node.type === 'content') return;
    const role = node.role;
    if (role === 'Table') {
      const rows = [];
      const findRows = (n) => {
        if (!n || n.type === 'content') return;
        if (n.role === 'TR') { rows.push((n.children || []).filter((c) => c.role === 'TD' || c.role === 'TH').map(parasOf)); return; }
        (n.children || []).forEach(findRows);
      };
      findRows(node);
      if (rows.length) blocks.push({ kind: 'table', rows });
      return;
    }
    if (role === 'L') {
      // la puce elle-même (Lbl : « • », « 1. ») est remplacée par le « - » du gabarit ;
      // on la consomme pour qu'elle ne ressorte pas en texte orphelin plus bas.
      (node.children || []).filter((c) => c.role === 'LI').forEach((li) => (li.children || []).filter((c) => c.role === 'Lbl').forEach(itemsOf));
      const lines = (node.children || []).filter((c) => c.role === 'LI')
        .map((li) => parasOf({ children: (li.children || []).filter((c) => c.role !== 'Lbl') }))
        .filter((u) => u.length);
      if (lines.length) blocks.push({ kind: 'list', lines });
      return;
    }
    if (role === 'Figure') {
      const its = itemsOf(node);
      if (its.length) blocks.push({ kind: 'p', unit: [its] });
      else if (node.alt && !ALT_ICONE_AUTO.test(node.alt)) blocks.push({ kind: 'image', alt: collapse(node.alt) });
      return;
    }
    if (isPara(node)) {
      const its = itemsOf(node);
      if (its.length) blocks.push({ kind: HEADING[role] != null ? 'heading' : 'p', prefix: HEADING[role], unit: [its] });
      return;
    }
    (node.children || []).forEach(walk);
  };
  if (tree) walk(tree);

  // texte hors balisage (PDF non balisé, ou morceaux oubliés par le logiciel) : une
  // ligne = un paragraphe, dans l'ordre du flux, pour ne JAMAIS perdre de texte.
  let line = [];
  items.forEach((it, k) => {
    if (used.has(k)) return;
    line.push(k);
    if (it.eol) { blocks.push({ kind: 'p', unit: [line] }); line = []; }
  });
  if (line.length) blocks.push({ kind: 'p', unit: [line] });
  return blocks;
}

/* ---------- 2. propriété de chaque caractère (qui le surligne) ---------- */

/** texte d'une ancre, tel que l'enregistre le lecteur (retours à la ligne entre items). */
function anchorText(items, a) {
  let s = '';
  for (let k = a.start.item; k <= a.end.item; k++) {
    const it = items[k];
    if (!it) return null;
    const from = k === a.start.item ? a.start.char : 0;
    const to = k === a.end.item ? a.end.char : it.str.length;
    s += it.str.slice(from, to);
    if (k < a.end.item && it.eol) s += '\n';
  }
  return s;
}

/** peint les caractères dans l'ordre de création (règle de superposition du gabarit).
    Renvoie les surlignages non plaçables (sans ancre, ou ancre qui ne correspond plus). */
function paint(items, highlights, normalize) {
  const owner = items.map((it) => new Array(it.str.length).fill(null));
  const unplaced = [];
  [...highlights].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).forEach((h) => {
    const a = h.anchor;
    const txt = a && anchorText(items, a);
    if (txt == null || collapse(normalize(txt)) !== h.texte) { unplaced.push(h); return; }
    for (let k = a.start.item; k <= a.end.item; k++) {
      const from = k === a.start.item ? a.start.char : 0;
      const to = k === a.end.item ? a.end.char : items[k].str.length;
      for (let c = from; c < to; c++) {
        const cur = owner[k][c];
        if (!cur || cur.couleur !== h.couleur) owner[k][c] = h;
      }
    }
  });
  return { owner, unplaced };
}

/* ---------- 3. rendu d'une unité (paragraphe, cellule, puce) ---------- */

/** unité → { text (avec [PRIORITAIRE]), marks: [{ h, text }], nodes (marks et blancs,
    pour l'adjacence) }. Les blancs entre deux items (fin de ligne, deux paragraphes
    d'une même cellule) appartiennent au surlignage s'il est de part et d'autre. */
function renderUnit(unit, items, owner) {
  const seq = [];
  unit.forEach((para, pi) => {
    para.forEach((k, ii) => {
      const it = items[k];
      for (let c = 0; c < it.str.length; c++) seq.push({ ch: it.str[c], h: owner[k][c] });
      const lastOfPara = ii === para.length - 1;
      if ((!lastOfPara && it.eol) || (lastOfPara && pi < unit.length - 1)) seq.push({ ch: ' ', h: undefined });
    });
  });
  seq.forEach((s, i) => {
    if (s.h !== undefined) return;
    const prev = seq[i - 1] && seq[i - 1].h, next = seq[i + 1] && seq[i + 1].h;
    s.h = prev && prev === next ? prev : null;
  });
  let text = '';
  const nodes = []; // { mark: {h, text} } | { gap: string }
  let cur = null;
  for (const s of seq) {
    if (s.h !== cur) {
      if (cur) text += '[/PRIORITAIRE]';
      if (s.h) { text += '[PRIORITAIRE]'; nodes.push({ mark: { h: s.h, text: '' } }); } else nodes.push({ gap: '' });
      cur = s.h;
    } else if (!nodes.length) nodes.push({ gap: '' });
    text += s.ch;
    const last = nodes[nodes.length - 1];
    if (last.mark) last.mark.text += s.ch; else last.gap += s.ch;
  }
  if (cur) text += '[/PRIORITAIRE]';
  return { text, nodes };
}

/** entrées surlignages[] d'une unité — portage de extractHighlights (courseExport.js). */
function highlightEntries(nodes, normalize) {
  const out = [];
  nodes.forEach((n, i) => {
    if (!n.mark) return;
    const couleur = n.mark.h.couleur || 'jaune';
    const texte = collapse(normalize(n.mark.text));
    if (couleur !== 'rose') { out.push({ couleur, sens: SENS_PAR_COULEUR[couleur] || 'surligne', texte }); return; }
    const touching = (step) => {
      const texts = [];
      for (let j = i + step; j >= 0 && j < nodes.length; j += step) {
        const m = nodes[j];
        if (m.gap !== undefined) { if (/^\s*$/.test(m.gap)) continue; break; }
        if ((m.mark.h.couleur || 'jaune') !== 'jaune') break;
        texts.push(normalize(m.mark.text));
      }
      return step < 0 ? texts.reverse() : texts;
    };
    const before = touching(-1), after = touching(1);
    const dans_notion = (before.length || after.length) ? collapse([...before, texte, ...after].join(' ')) : null;
    out.push({ couleur: 'rose', sens: 'cloze', texte, dans_notion });
  });
  return out;
}

const noteBlock = (h, normalize) => {
  const court = collapse(normalize(h.texte || ''));
  const tag = '« ' + (court.length > 60 ? court.slice(0, 60).trim() + '…' : court) + ' »';
  return '[NOTE PERSONNELLE — ' + tag + ']\n' + collapse(normalize(h.note)) + '\n[/NOTE PERSONNELLE]';
};

/**
 * @param {object} pdfDoc — document pdf.js ouvert (pdf/pdfjsSetup.js#openPdf)
 * @param {object[]} highlights — enregistrements du store `highlights` de CETTE fiche
 * @param {{ normalize?: (s: string) => string }} opts — pdfjsLib.normalizeUnicode, pour
 *   des textes identiques à ceux que le lecteur enregistre
 * @returns {Promise<{ texteStructure: string, surlignages: object[] }>}
 */
export async function pdfCourseParts(pdfDoc, highlights, { normalize = (s) => s } = {}) {
  const out = [];
  const surlignages = [];
  let nMarks = 0;
  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const { items, blocks } = await pageModel(await pdfDoc.getPage(p));
    const { owner, unplaced } = paint(items, (highlights || []).filter((h) => h.page === p), normalize);
    const unit = (u) => {
      const r = renderUnit(u, items, owner);
      r.nodes.forEach((n) => { if (n.mark) nMarks++; });
      surlignages.push(...highlightEntries(r.nodes, normalize));
      r.nodes.forEach((n) => { if (n.mark && n.mark.h.note) lastBlockOf.set(n.mark.h, blockIdx); });
      return collapse(normalize(r.text));
    };
    const lastBlockOf = new Map(); // surlignage annoté → index du dernier bloc où il apparaît
    let blockIdx = 0;
    const pageOut = [];
    for (const b of blocks) {
      let t = '';
      if (b.kind === 'table') t = tableCellsToText(b.rows.map((row) => row.map((cell) => unit(cell))), null);
      else if (b.kind === 'list') t = b.lines.map((l) => '- ' + unit(l)).join('\n');
      else if (b.kind === 'image') t = '[IMAGE : ' + normalize(b.alt) + ']';
      else { const s = unit(b.unit); t = s ? (b.prefix || '') + s : ''; }
      pageOut.push(t);
      blockIdx++;
    }
    // notes : juste après le dernier bloc de leur passage (ordre de lecture conservé)
    const notesAfter = new Map();
    lastBlockOf.forEach((idx, h) => { if (!notesAfter.has(idx)) notesAfter.set(idx, []); notesAfter.get(idx).push(h); });
    pageOut.forEach((t, i) => {
      if (t) out.push(t);
      (notesAfter.get(i) || []).forEach((h) => out.push(noteBlock(h, normalize)));
    });
    // anciens surlignages sans ancre exploitable : absents du texte (on ne sait pas où
    // les placer), mais jamais perdus — listés dans surlignages[], leur note en fin de page.
    unplaced.forEach((h) => {
      const couleur = h.couleur || 'jaune';
      const texte = collapse(normalize(h.texte || ''));
      surlignages.push(couleur === 'rose' ? { couleur, sens: 'cloze', texte, dans_notion: null } : { couleur, sens: SENS_PAR_COULEUR[couleur] || 'surligne', texte });
      if (h.note) out.push(noteBlock(h, normalize));
    });
  }
  return { texteStructure: legendeFiche(nMarks) + out.join('\n\n'), surlignages };
}
