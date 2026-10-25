/* ============================================================
   MedRevise — RECHERCHE DANS UN DOCUMENT AFFICHÉ (25/10, docs/compte-rendu-apprentissage-v2-recherche-tags.md).
   Le même moteur que le lecteur PDF (lib/rechercheTexte.js), appliqué aux NŒUDS TEXTE d'un éditeur (document
   créé dans l'app, page de texte ajoutée) : une phrase est trouvée même à cheval sur deux paragraphes, deux
   lignes, ou dans le texte reconnu d'une image (calque OCR = nœuds texte). Le surlignage passe par la CSS Custom
   Highlight API : toutes les occurrences (::highlight(recherche-doc-toutes)) et la courante (::highlight(recherche-doc)),
   sans toucher au texte ni au focus.
   ============================================================ */
import { indexer, chercher, extrait } from '../lib/rechercheTexte.js';

const rejete = (n) => !!(n.parentElement && n.parentElement.closest('.pt-saut-page'));

/** nœuds texte de `racine`, dans l'ordre du DOM (les sauts de page ne comptent pas) */
export function noeudsTexte(racine) {
  const out = [];
  if (!racine) return out;
  const w = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (rejete(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  let n;
  while ((n = w.nextNode())) out.push(n);
  return out;
}

/** occurrences de `q` dans `racine` → [{ range, extrait: { avant, trouve, apres } }] */
export function occurrencesDom(racine, q) {
  const noeuds = noeudsTexte(racine);
  const segs = noeuds.map((n) => n.nodeValue || '');
  const idx = indexer(segs);
  return chercher(segs, q, idx).map((occ) => {
    const a = occ.morceaux[0], z = occ.morceaux[occ.morceaux.length - 1];
    const r = document.createRange();
    r.setStart(noeuds[a.seg], a.debut); r.setEnd(noeuds[z.seg], z.fin);
    return { range: r, extrait: extrait(segs, occ) };
  });
}

/** surligne toutes les occurrences, la n-ième en « courante » */
export function surlignerOccurrences(ranges, courante = -1) {
  try {
    if (!(window.CSS && CSS.highlights && window.Highlight)) return;
    const autres = ranges.filter((_, i) => i !== courante);
    if (autres.length) CSS.highlights.set('recherche-doc-toutes', new window.Highlight(...autres)); else CSS.highlights.delete('recherche-doc-toutes');
    if (ranges[courante]) CSS.highlights.set('recherche-doc', new window.Highlight(ranges[courante])); else CSS.highlights.delete('recherche-doc');
  } catch (e) { /* navigateur ancien : pas de surlignage */ }
}
