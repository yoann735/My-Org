/* ============================================================
   MedRevise — BOÎTE → FLASHCARD (25/10, docs/compte-rendu-boites-tableaux.md §2). Module PUR : le découpage d'une boîte
   du lecteur en carte (recto / verso), et la carte prête pour appendItemsToFiche.

   RÈGLE DE DÉCOUPAGE (texte de la boîte, document TipTap) :
     - le RECTO est le premier passage en GRAS s'il ouvre la boîte (« **Néphron** : unité… » → « Néphron ») ;
       sinon la PREMIÈRE LIGNE de la boîte ;
     - le VERSO est TOUT LE RESTE, dans l'ordre : la fin de la première ligne (sans le « : » / « — » qui suivait le
       gras), puis les lignes suivantes — explication, « Ex : », « Déf : », listes — mise en forme conservée en
       balisage léger (gras **…**, italique *…*, puces « - », listes numérotées « 1. », une ligne par ligne) ; la carte
       porte `versoFormat: 'leger'` (components/Tex.jsx l'affiche ainsi ; les cartes d'avant ne changent pas) ;
     - l'IMAGE de la boîte devient l'image de la carte (au recto si elle était au-dessus du texte, au verso sinon) ;
     - une BOÎTE-TABLEAU devient une carte de type Tableau : `tableau` (colonnes = ligne d'en-tête, 2 à 6 colonnes,
       12 lignes au plus, pour tout ce qui connaît déjà ce type) et `grille` (le tableau complet : couleurs, fusions,
       bordures — components/FlashcardTableau.jsx le révise tel quel).
   La carte garde un LIEN vers sa boîte : `source: { boiteId, ns, page, sorte }`.
   ============================================================ */
import { LIMITES, texteTableau } from './carteTableau.js';

const blocsInline = (n) => {
  // runs { t, gras, italique } d'un nœud de bloc ; hardBreak = retour à la ligne
  const out = [];
  const w = (x, marques = []) => {
    if (!x) return;
    if (x.type === 'text') {
      const m = [...marques, ...((x.marks || []).map((k) => k.type))];
      out.push({ t: x.text || '', gras: m.includes('bold'), italique: m.includes('italic') });
    } else if (x.type === 'hardBreak') out.push({ t: '\n' });
    else (x.content || []).forEach((c) => w(c, marques));
  };
  (n.content || []).forEach((c) => w(c));
  return out;
};
/** lignes [{ prefixe, runs }] d'un document TipTap (listes dépliées, une ligne par retour à la ligne) */
export function lignesDeContenu(content) {
  const lignes = [];
  const pousser = (runs, prefixe = '') => {
    let courante = [];
    const fin = () => { lignes.push({ prefixe, runs: courante }); courante = []; prefixe = prefixe ? ' '.repeat(prefixe.length) : ''; };
    for (const r of runs) {
      if (r.t === '\n') { fin(); continue; }
      courante.push(r);
    }
    fin();
  };
  /* (29/10, listes dans les cartes) une liste imbriquée garde son NIVEAU : deux espaces par niveau devant la marque ;
     2ᵉ niveau numéroté en lettres (« a. »). Lignes suivantes d'un élément : des espaces jusque sous son texte. */
  const bloc = (n, prefixe = '', niveau = 0) => {
    if (!n) return;
    if (n.type === 'paragraph' || n.type === 'heading') pousser(blocsInline(n), prefixe);
    else if (n.type === 'bulletList' || n.type === 'orderedList') {
      const debut = (n.attrs && n.attrs.start) || 1;
      const retrait = '  '.repeat(niveau);
      (n.content || []).forEach((li, i) => {
        const marque = n.type === 'bulletList' ? '- ' : niveau % 2 ? `${String.fromCharCode(96 + Math.min(26, debut + i))}. ` : `${debut + i}. `;
        (li.content || []).forEach((c, j) => {
          if (c.type === 'bulletList' || c.type === 'orderedList') bloc(c, '', niveau + 1);
          else bloc(c, retrait + (j === 0 ? marque : ' '.repeat(marque.length)), niveau);
        });
      });
    } else (n.content || []).forEach((c) => bloc(c, prefixe, niveau));
  };
  if (content && content.type === 'doc') (content.content || []).forEach((c) => bloc(c));
  return lignes;
}
const texteRuns = (runs) => runs.map((r) => r.t).join('');
/** balisage léger d'une suite de runs : **gras**, *italique* (les espaces restent hors des marques) */
export function balisage(runs) {
  return runs.map((r) => {
    if (!r.t || (!r.gras && !r.italique) || !r.t.trim()) return r.t;
    const m = r.t.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const d = r.gras && r.italique ? '***' : r.gras ? '**' : '*';
    return m[1] + d + m[2] + d + m[3];
  }).join('').replace(/\*\*\*\*/g, ''); // deux runs gras accolés : un seul passage
}

/** { recto, verso } d'une boîte de texte selon la règle ci-dessus */
export function decouperBoite(content) {
  const lignes = lignesDeContenu(content).filter((l, i, a) => texteRuns(l.runs).trim() || (i > 0 && i < a.length - 1));
  while (lignes.length && !texteRuns(lignes[0].runs).trim()) lignes.shift();
  if (!lignes.length) return { recto: '', verso: '' };
  const [premiere, ...reste] = lignes;
  const runs = premiere.runs.filter((r) => r.t);
  let recto, finLigne = [];
  const k = runs.findIndex((r) => r.t.trim());
  if (k >= 0 && runs[k].gras) {
    let j = k; while (j < runs.length && (runs[j].gras || !runs[j].t.trim())) j++;
    recto = texteRuns(runs.slice(0, j)).trim();
    finLigne = runs.slice(j);
    // le séparateur qui suivait le passage en gras (« : », « — », « - », « = ») ne va pas au verso
    if (finLigne.length) finLigne = [{ ...finLigne[0], t: finLigne[0].t.replace(/^\s*[:：—–=-]?\s*/, '') }, ...finLigne.slice(1)];
  } else recto = (premiere.prefixe.trim() ? '' : '') + texteRuns(runs).trim();
  recto = recto.replace(/\s*[:：]\s*$/, '');
  const versoLignes = [];
  if (texteRuns(finLigne).trim()) versoLignes.push(balisage(finLigne).trim());
  for (const l of reste) versoLignes.push((l.prefixe + balisage(l.runs)).replace(/\s+$/, ''));
  while (versoLignes.length && !versoLignes[versoLignes.length - 1].trim()) versoLignes.pop();
  return { recto, verso: versoLignes.join('\n') };
}

/** une boîte-tableau → { colonnes, lignes } d'une carte Tableau (limites du type) */
export function tableauDeGrille(g) {
  const nc = Math.min(LIMITES.colMax, Math.max(LIMITES.colMin, g.cols.length));
  const plat = (t) => String(t || '').replace(/\n/g, ' ').trim();
  const rangees = g.lignes.map((l) => Array.from({ length: nc }, (_, j) => plat(l[j])));
  const colonnes = (g.entete ? rangees[0] : rangees[0].map((_, j) => '')).map((c, j) => c || `Colonne ${j + 1}`);
  const lignes = (g.entete ? rangees.slice(1) : rangees).filter((l) => l.some(Boolean)).slice(0, LIMITES.ligMax);
  return { v: 1, colonnes, lignes: lignes.length ? lignes : [colonnes.map(() => '—')] };
}

/** la carte (brute, pour appendItemsToFiche) : `recto`, `verso` (balisage léger), `theme`, `imagePlace` viennent de l'aperçu */
export function carteDeBoite(boite, { recto, verso, theme = '', imagePlace = null, ns = null, id }) {
  const source = { boiteId: boite.id, ns: ns || boite.ficheId || null, page: boite.page, sorte: boite.grille ? 'boite-tableau' : 'boite' };
  const image = boite.image && boite.image.blobId ? { imageId: boite.image.blobId, imagePlace: imagePlace || (boite.image.position === 'dessous' ? 'verso' : 'recto') } : { imageId: null, imagePlace: null };
  const base = { id, type: 'flashcard', theme: String(theme || '').trim(), concept: String(theme || '').trim(), difficulte: 'intermediaire', recto: String(recto || '').trim(), indice: null, a_retenir: '', cloze: [], ...image, source };
  if (boite.grille && Array.isArray(boite.grille.lignes)) {
    const tableau = tableauDeGrille(boite.grille);
    return { ...base, verso: texteTableau(tableau), tableau, grille: JSON.parse(JSON.stringify(boite.grille)) };
  }
  return { ...base, verso: String(verso || '').replace(/\s+$/, ''), versoFormat: 'leger' };
}
