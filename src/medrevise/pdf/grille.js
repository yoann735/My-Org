/* ============================================================
   MedRevise — LE MODÈLE DU TABLEAU D'UNE BOÎTE (25/10, docs/compte-rendu-boites-tableaux.md §5). Fonctions PURES :
   une grille entre, une nouvelle grille sort (une entrée d'Annuler par opération). Utilisé par la boîte-tableau
   (pdf/BoiteTableau.jsx : lecteur, document, fiche jumelle, tableau Miro), l'export PDF et « → Flashcard ».

   Champ `grille` d'une boîte ou d'une carte du tableau :
     v          1 (d'avant le 25/10) ou 2
     cols       [fractions de la largeur, somme 1]
     lignes     [[texte de chaque cellule]]                  (une cellule couverte par une fusion : '')
     entete     bool — 1re ligne en gras                       (déjà là le 22/10)
     alterne    bool — une ligne sur deux légèrement teintée   (facultatif)
     hauts      [hauteur minimale de chaque ligne | null]      (facultatif ; unité : px d'une page de 1000 px, comme
                                                                 `taille1000` ; dans le tableau Miro : px du monde)
     formats    [[{ fond, couleur, gras, italique, taille, alignH, alignV } | null]]   (facultatif, même forme que lignes)
     fusions    [{ i, j, rs, cs }]                              (facultatif ; cellule d'ancrage + étendue)
     bordures   { mode: 'toutes' | 'aucune' | 'exterieures' | 'interieures', couleur, ep }   (facultatif ; absent =
                filets intérieurs fins de la couleur du texte, le rendu du 22/10)
   Une grille d'avant (v 1, sans ces champs) s'affiche exactement comme avant : rien n'est réécrit à la lecture.
   Une sélection est un rectangle { i0, j0, i1, j1 } (bornes incluses), toujours élargi aux fusions qu'il touche.
   ============================================================ */

export const GRILLE_DEFAUT = { colonnes: 3, lignes: 4 };
export const LIMITES_GRILLE = { colMin: 1, colMax: 12, ligMin: 1, ligMax: 60, largeurMin: 0.04, hautMin: 8 };
export const MODES_BORDURE = ['toutes', 'interieures', 'exterieures', 'aucune'];

export function nouvelleGrille(nc = GRILLE_DEFAUT.colonnes, nl = GRILLE_DEFAUT.lignes) {
  return { v: 1, cols: Array.from({ length: nc }, () => +(1 / nc).toFixed(4)), lignes: Array.from({ length: nl }, () => Array.from({ length: nc }, () => '')), entete: true };
}
export const estGrille = (g) => !!(g && Array.isArray(g.cols) && Array.isArray(g.lignes) && g.cols.length);
export const normer = (cols) => { const s = cols.reduce((a, b) => a + b, 0) || 1; return cols.map((c) => +(c / s).toFixed(4)); };
const nL = (g) => g.lignes.length, nC = (g) => g.cols.length;
const copie = (x) => JSON.parse(JSON.stringify(x));

/* ---------- lecture ---------- */
export const fusionsDe = (g) => (Array.isArray(g && g.fusions) ? g.fusions.filter((f) => f && f.rs >= 1 && f.cs >= 1 && (f.rs > 1 || f.cs > 1)) : []);
export const formatDe = (g, i, j) => (g && Array.isArray(g.formats) && g.formats[i] && g.formats[i][j]) || null;
/** ancre de la fusion qui contient (i, j), ou null */
export function fusionSous(g, i, j) {
  for (const f of fusionsDe(g)) if (i >= f.i && i < f.i + f.rs && j >= f.j && j < f.j + f.cs) return f;
  return null;
}
/** carte des cellules : pour chaque (i, j) « i:j » → { i, j, rs, cs } de la cellule affichée qui la couvre */
export function carteCellules(g) {
  const m = new Map();
  for (const f of fusionsDe(g)) for (let a = f.i; a < f.i + f.rs; a++) for (let b = f.j; b < f.j + f.cs; b++) m.set(a + ':' + b, f);
  return m;
}
/** les cellules AFFICHÉES, ligne par ligne : [{ i, j, rs, cs }] (une fusion = une cellule) */
export function cellulesAffichees(g) {
  const m = carteCellules(g), out = [];
  for (let i = 0; i < nL(g); i++) for (let j = 0; j < nC(g); j++) {
    const f = m.get(i + ':' + j);
    if (f && (f.i !== i || f.j !== j)) continue;
    out.push(f ? { i, j, rs: f.rs, cs: f.cs } : { i, j, rs: 1, cs: 1 });
  }
  return out;
}
/** ancre (cellule affichée) d'une position quelconque */
export function ancreDe(g, i, j) { const f = fusionSous(g, i, j); return f ? { i: f.i, j: f.j } : { i, j }; }
/** rectangle élargi aux fusions qu'il touche (bornes dans la grille) */
export function elargir(g, r) {
  let { i0, j0, i1, j1 } = { i0: Math.min(r.i0, r.i1), j0: Math.min(r.j0, r.j1), i1: Math.max(r.i0, r.i1), j1: Math.max(r.j0, r.j1) };
  i0 = Math.max(0, i0); j0 = Math.max(0, j0); i1 = Math.min(nL(g) - 1, i1); j1 = Math.min(nC(g) - 1, j1);
  for (let tour = 0; tour < 20; tour++) {
    let change = false;
    for (const f of fusionsDe(g)) {
      const touche = f.i <= i1 && f.i + f.rs - 1 >= i0 && f.j <= j1 && f.j + f.cs - 1 >= j0;
      if (!touche) continue;
      if (f.i < i0) { i0 = f.i; change = true; }
      if (f.j < j0) { j0 = f.j; change = true; }
      if (f.i + f.rs - 1 > i1) { i1 = f.i + f.rs - 1; change = true; }
      if (f.j + f.cs - 1 > j1) { j1 = f.j + f.cs - 1; change = true; }
    }
    if (!change) break;
  }
  return { i0, j0, i1, j1 };
}
export const toutLeTableau = (g) => ({ i0: 0, j0: 0, i1: nL(g) - 1, j1: nC(g) - 1 });
export const dansSel = (r, i, j) => !!r && i >= r.i0 && i <= r.i1 && j >= r.j0 && j <= r.j1;
export const taileSel = (r) => (r ? (r.i1 - r.i0 + 1) * (r.j1 - r.j0 + 1) : 0);

/* ---------- structure (lignes, colonnes) ---------- */
function avecTableaux(g) {
  // formats et hauts à la forme exacte de la grille (s'ils existent)
  const h = { ...g };
  if (Array.isArray(g.formats)) h.formats = g.lignes.map((l, i) => l.map((_, j) => formatDe(g, i, j)));
  if (Array.isArray(g.hauts)) h.hauts = g.lignes.map((_, i) => (Number.isFinite(g.hauts[i]) ? g.hauts[i] : null));
  return h;
}
/** réindexe les fusions par une table « ancien indice → nouveau indice | null » sur un axe ; une fusion réduite à une
    cellule disparaît ; le texte et le format d'une ancre supprimée passent à la nouvelle ancre */
function reindexer(g, axe, carte, lignes, formats) {
  const out = [];
  for (const f of fusionsDe(g)) {
    const debut = axe === 'i' ? f.i : f.j, long = axe === 'i' ? f.rs : f.cs;
    const restants = [];
    for (let k = debut; k < debut + long; k++) if (carte[k] != null) restants.push(carte[k]);
    if (!restants.length) continue;
    const nf = axe === 'i' ? { i: restants[0], j: f.j, rs: restants.length, cs: f.cs } : { i: f.i, j: restants[0], rs: f.rs, cs: restants.length };
    if (carte[debut] == null && lignes) { // l'ancre est partie : son texte va à la nouvelle
      const t = axe === 'i' ? g.lignes[f.i][f.j] : g.lignes[f.i][f.j];
      if (t && !lignes[nf.i][nf.j]) lignes[nf.i][nf.j] = t;
      const fm = formatDe(g, f.i, f.j);
      if (fm && formats && !formats[nf.i][nf.j]) formats[nf.i][nf.j] = fm;
    }
    if (nf.rs > 1 || nf.cs > 1) out.push(nf);
  }
  return out;
}
/** insère `n` lignes vides à l'indice `a` (0 = tout en haut, nL = tout en bas) ; une fusion traversée s'allonge */
export function insererLignes(g, a, n = 1) {
  n = Math.min(n, LIMITES_GRILLE.ligMax - nL(g));
  if (n <= 0) return g;
  const h = avecTableaux(g);
  const vide = () => g.cols.map(() => '');
  h.lignes = [...g.lignes.slice(0, a), ...Array.from({ length: n }, vide), ...g.lignes.slice(a)];
  if (h.formats) h.formats = [...h.formats.slice(0, a), ...Array.from({ length: n }, () => g.cols.map(() => null)), ...h.formats.slice(a)];
  if (h.hauts) h.hauts = [...h.hauts.slice(0, a), ...Array(n).fill(null), ...h.hauts.slice(a)];
  if (fusionsDe(g).length) h.fusions = fusionsDe(g).map((f) => (f.i >= a ? { ...f, i: f.i + n } : f.i + f.rs > a ? { ...f, rs: f.rs + n } : f));
  return h;
}
export function insererColonnes(g, a, n = 1) {
  n = Math.min(n, LIMITES_GRILLE.colMax - nC(g));
  if (n <= 0) return g;
  const h = avecTableaux(g);
  const N = nC(g) + n;
  h.cols = normer([...g.cols.slice(0, a).map((c) => c * nC(g) / N), ...Array(n).fill(1 / N), ...g.cols.slice(a).map((c) => c * nC(g) / N)]);
  h.lignes = g.lignes.map((l) => [...l.slice(0, a), ...Array(n).fill(''), ...l.slice(a)]);
  if (h.formats) h.formats = h.formats.map((l) => [...l.slice(0, a), ...Array(n).fill(null), ...l.slice(a)]);
  if (fusionsDe(g).length) h.fusions = fusionsDe(g).map((f) => (f.j >= a ? { ...f, j: f.j + n } : f.j + f.cs > a ? { ...f, cs: f.cs + n } : f));
  return h;
}
/** supprime les lignes i0…i1 (au moins une ligne reste) */
export function supprimerLignes(g, i0, i1 = i0) {
  const a = Math.max(0, Math.min(i0, i1)), b = Math.min(nL(g) - 1, Math.max(i0, i1));
  if (b - a + 1 >= nL(g)) return g;
  const carte = []; let k = 0;
  for (let i = 0; i < nL(g); i++) carte[i] = i >= a && i <= b ? null : k++;
  const h = avecTableaux(g);
  const lignes = g.lignes.filter((_, i) => carte[i] != null).map((l) => [...l]);
  const formats = h.formats ? h.formats.filter((_, i) => carte[i] != null).map((l) => [...l]) : null;
  const fus = reindexer(g, 'i', carte, lignes, formats);
  h.lignes = lignes;
  if (formats) h.formats = formats;
  if (h.hauts) h.hauts = h.hauts.filter((_, i) => carte[i] != null);
  if (g.fusions) h.fusions = fus;
  return h;
}
export function supprimerColonnes(g, j0, j1 = j0) {
  const a = Math.max(0, Math.min(j0, j1)), b = Math.min(nC(g) - 1, Math.max(j0, j1));
  if (b - a + 1 >= nC(g)) return g;
  const carte = []; let k = 0;
  for (let j = 0; j < nC(g); j++) carte[j] = j >= a && j <= b ? null : k++;
  const h = avecTableaux(g);
  const lignes = g.lignes.map((l) => l.filter((_, j) => carte[j] != null));
  const formats = h.formats ? h.formats.map((l) => l.filter((_, j) => carte[j] != null)) : null;
  const fus = reindexer(g, 'j', carte, lignes, formats);
  h.cols = normer(g.cols.filter((_, j) => carte[j] != null));
  h.lignes = lignes;
  if (formats) h.formats = formats;
  if (g.fusions) h.fusions = fus;
  return h;
}
/** colonnes de même largeur, lignes à leur hauteur naturelle */
export function repartir(g) {
  const h = { ...g, cols: normer(g.cols.map(() => 1)) };
  delete h.hauts;
  return h;
}
export function largeurColonnes(g, cols) { return { ...g, cols: normer(cols) }; }
export function hauteurLigne(g, i, v) {
  const hauts = g.lignes.map((_, k) => (Array.isArray(g.hauts) && Number.isFinite(g.hauts[k]) ? g.hauts[k] : null));
  hauts[i] = v == null ? null : Math.max(LIMITES_GRILLE.hautMin, +(+v).toFixed(1));
  const h = { ...g, hauts };
  if (hauts.every((x) => x == null)) delete h.hauts;
  return h;
}

/* ---------- cellules ---------- */
export function texteCellule(g, i, j, t) {
  return { ...g, lignes: g.lignes.map((l, a) => (a === i ? l.map((c, b) => (b === j ? t : c)) : l)) };
}
/** fusionne le rectangle : le texte non vide de chaque cellule, dans l'ordre de lecture, va à la cellule d'ancrage */
export function fusionner(g, sel) {
  const r = elargir(g, sel);
  if (r.i0 === r.i1 && r.j0 === r.j1) return g;
  const h = avecTableaux(g);
  const textes = [];
  for (let i = r.i0; i <= r.i1; i++) for (let j = r.j0; j <= r.j1; j++) { const t = String(g.lignes[i][j] || '').trim(); if (t) textes.push(g.lignes[i][j]); }
  h.lignes = g.lignes.map((l, i) => l.map((c, j) => (dansSel(r, i, j) ? (i === r.i0 && j === r.j0 ? textes.join('\n') : '') : c)));
  if (h.formats) h.formats = h.formats.map((l, i) => l.map((f, j) => (dansSel(r, i, j) && !(i === r.i0 && j === r.j0) ? null : f)));
  h.fusions = [...fusionsDe(g).filter((f) => !(f.i >= r.i0 && f.i <= r.i1 && f.j >= r.j0 && f.j <= r.j1)), { i: r.i0, j: r.j0, rs: r.i1 - r.i0 + 1, cs: r.j1 - r.j0 + 1 }];
  return h;
}
/** scinde toutes les fusions dont l'ancre est dans le rectangle (le texte reste dans la cellule d'ancrage) */
export function scinder(g, sel) {
  const r = elargir(g, sel);
  const reste = fusionsDe(g).filter((f) => !dansSel(r, f.i, f.j));
  if (reste.length === fusionsDe(g).length) return g;
  const h = { ...g, fusions: reste };
  if (!reste.length) delete h.fusions;
  return h;
}
export const peutFusionner = (g, sel) => !!sel && taileSel(elargir(g, sel)) > 1 && !(fusionsDe(g).some((f) => { const r = elargir(g, sel); return f.i === r.i0 && f.j === r.j0 && f.rs === r.i1 - r.i0 + 1 && f.cs === r.j1 - r.j0 + 1; }));
export const peutScinder = (g, sel) => !!sel && fusionsDe(g).some((f) => dansSel(elargir(g, sel), f.i, f.j));
/** format des cellules du rectangle : `patch` fusionné à leur format (une valeur null retire la clé) */
export function formater(g, sel, patch) {
  const r = elargir(g, sel || toutLeTableau(g));
  const formats = g.lignes.map((l, i) => l.map((_, j) => {
    const f0 = formatDe(g, i, j);
    if (!dansSel(r, i, j)) return f0;
    const f = { ...(f0 || {}) };
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === false) delete f[k]; else f[k] = v; }
    return Object.keys(f).length ? f : null;
  }));
  const h = { ...g, formats };
  if (formats.every((l) => l.every((x) => !x))) delete h.formats;
  return h;
}
/** valeur commune d'un champ de format sur le rectangle (null si elles diffèrent ou sont absentes) */
export function formatCommun(g, sel, cle) {
  const r = elargir(g, sel || toutLeTableau(g));
  let v; let premier = true;
  for (const c of cellulesAffichees(g)) {
    if (!dansSel(r, c.i, c.j)) continue;
    const x = (formatDe(g, c.i, c.j) || {})[cle] ?? null;
    if (premier) { v = x; premier = false; } else if (x !== v) return null;
  }
  return premier ? null : v;
}
export function viderCellules(g, sel) {
  const r = elargir(g, sel);
  return { ...g, lignes: g.lignes.map((l, i) => l.map((c, j) => (dansSel(r, i, j) ? '' : c))) };
}

/* ---------- bordures et style ---------- */
export const BORDURE_DEFAUT = { couleur: null, ep: 1 }; // couleur null = celle du texte, à 24 %
export function bordures(g, patch) {
  const b = { mode: 'interieures', ...BORDURE_DEFAUT, ...(g.bordures || {}), ...patch };
  return { ...g, bordures: b };
}
export function style(g, quoi) {
  if (quoi === 'aucun') return { ...g, entete: false, alterne: false };
  if (quoi === 'entete') return { ...g, entete: !g.entete };
  if (quoi === 'alterne') return { ...g, alterne: !g.alterne };
  return g;
}

/* ---------- collage d'un tableau (Excel, Sheets, Word, Numbers) ---------- */
/** texte TSV (guillemets d'Excel compris : retours à la ligne dans une cellule, "" pour un guillemet) → matrice */
export function lireTSV(texte) {
  const t = String(texte || '').replace(/\r\n?/g, '\n').replace(/\n$/, '');
  const lignes = []; let ligne = []; let cell = ''; let guil = false;
  for (let k = 0; k < t.length; k++) {
    const ch = t[k];
    if (guil) {
      if (ch === '"') { if (t[k + 1] === '"') { cell += '"'; k++; } else guil = false; } else cell += ch;
    } else if (ch === '"' && cell === '') guil = true;
    else if (ch === '\t') { ligne.push(cell); cell = ''; }
    else if (ch === '\n') { ligne.push(cell); lignes.push(ligne); ligne = []; cell = ''; }
    else cell += ch;
  }
  ligne.push(cell); lignes.push(ligne);
  return lignes;
}
/** HTML d'un presse-papiers → matrice du premier <table> (null s'il n'y en a pas) ; fusions (rowspan/colspan) dépliées */
export function lireTableHTML(html) {
  if (!html || !/<table/i.test(html) || typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return null;
  const out = [];
  [...table.querySelectorAll('tr')].forEach((tr, i) => {
    out[i] = out[i] || [];
    let j = 0;
    for (const td of tr.querySelectorAll('td, th')) {
      while (out[i][j] != null) j++;
      const txt = (td.innerText != null ? td.innerText : td.textContent || '').replace(/ /g, ' ').replace(/\n{2,}/g, '\n').trim();
      const rs = Math.max(1, +td.getAttribute('rowspan') || 1), cs = Math.max(1, +td.getAttribute('colspan') || 1);
      for (let a = 0; a < rs; a++) for (let b = 0; b < cs; b++) { out[i + a] = out[i + a] || []; out[i + a][j + b] = a === 0 && b === 0 ? txt : ''; }
      j += cs;
    }
  });
  const larg = Math.max(0, ...out.map((l) => (l ? l.length : 0)));
  return out.filter(Boolean).map((l) => Array.from({ length: larg }, (_, j) => (l[j] == null ? '' : l[j])));
}
/** matrice collée depuis le presse-papiers, ou null si ce n'est pas un tableau (une seule cellule = du texte) */
export function matriceCollee(html, texte) {
  const m = lireTableHTML(html) || (/\t/.test(texte || '') ? lireTSV(texte) : null);
  if (!m || !m.length || (m.length === 1 && m[0].length === 1)) return null;
  return m;
}
/** pose la matrice à partir de (i, j) ; la grille s'agrandit si besoin (dans ses limites) */
export function collerMatrice(g, i, j, m) {
  let h = g;
  const manqueL = i + m.length - nL(h);
  if (manqueL > 0) h = insererLignes(h, nL(h), manqueL);
  const larg = Math.max(...m.map((l) => l.length));
  const manqueC = j + larg - nC(h);
  if (manqueC > 0) h = insererColonnes(h, nC(h), manqueC);
  const lignes = h.lignes.map((l) => [...l]);
  m.forEach((l, a) => l.forEach((t, b) => { if (i + a < lignes.length && j + b < lignes[0].length) lignes[i + a][j + b] = String(t); }));
  return { ...h, lignes };
}

/* ---------- textes à plat ---------- */
/** le tableau mis à plat (export, recherche, IA, ancienne version de l'app) : une ligne par rangée, cellules séparées par « | » */
export const texteGrille = (g) => (estGrille(g) ? g.lignes.map((l) => l.map((c) => String(c || '').replace(/\n/g, ' ')).join(' | ')).join('\n') : '');
/** même chose en document TipTap (champ `content` d'une boîte : lu par l'export PDF, l'export IA, les textes) */
export const contenuGrille = (g) => ({ type: 'doc', content: (estGrille(g) ? g.lignes : [[]]).map((l) => {
  const t = l.map((c) => String(c || '').replace(/\n/g, ' ')).join(' | ');
  return t.replace(/[|\s]/g, '') ? { type: 'paragraph', content: [{ type: 'text', text: t }] } : { type: 'paragraph' };
}) });

/* ---------- compatibilité : opérations du 22/10 (mini barre d'avant, tableau Miro) ---------- */
export const ajouterLigne = (g, apres = nL(g) - 1) => insererLignes(g, apres + 1);
export const ajouterColonne = (g, apres = nC(g) - 1) => insererColonnes(g, apres + 1);
export const retirerLigne = (g, i = nL(g) - 1) => supprimerLignes(g, i);
export const retirerColonne = (g, i = nC(g) - 1) => supprimerColonnes(g, i);
export { copie as copieGrille };
