/* ============================================================
   MedRevise — FLASHCARD « TABLEAU » (17/10, docs/compte-rendu-import-tableau-nettete.md).

   Une carte Tableau est une flashcard ORDINAIRE (type 'flashcard', mêmes J, même FSRS, même mode
   Apprentissage, même synchro) qui porte en plus :
     tableau: { v: 1, colonnes: [2 à 6 noms], lignes: [1 à 12 lignes de cellules (chaînes)] }
   Recto = le titre du tableau (« Muscles de la fesse — insertions ») ; verso = le tableau. Le verso
   TEXTE est rempli avec le tableau mis à plat : tout ce qui ne connaît pas encore ce type (ancien
   appareil, export, carnet d'erreurs, recherche) affiche une carte lisible. Ajout pur.
   (Sans rapport avec lib/tableau.js : le tableau « Miro » des fiches.)

   Ce module est PUR (aucun DOM) : modèle, validation, mise à plat, lecture d'un collage TSV.

   (31/10, docs/compte-rendu-flashcards.md « Tableau : choisir ce qui est masqué ») CHAMP ADDITIF
     tableau.masque = { cellules: [[booléen par case]] (true = masquée en révision), noms: [booléen par colonne] }
   ABSENT = le comportement d'avant : toutes les cases masquées, noms de colonnes visibles. Il n'est écrit que
   s'il diffère de ce défaut (une carte d'avant, ou un tableau laissé au défaut, ne change pas d'un octet).
   ============================================================ */
export const LIMITES = { colMin: 2, colMax: 6, ligMin: 1, ligMax: 12 };

export const estTableau = (item) => !!(item && item.tableau && typeof item.tableau === 'object'
  && Array.isArray(item.tableau.colonnes) && Array.isArray(item.tableau.lignes));

/** le masque par défaut d'un tableau nl × nc : toutes les cases masquées, noms de colonnes visibles */
export const masqueParDefaut = (nl, nc) => ({ cellules: Array.from({ length: nl }, () => Array(nc).fill(true)), noms: Array(nc).fill(false) });

/** le masque COMPLET d'un tableau (défaut là où rien n'est écrit), aux dimensions de ses lignes */
export function masqueDe(t) {
  const nl = t && Array.isArray(t.lignes) ? t.lignes.length : 0, nc = t && Array.isArray(t.colonnes) ? t.colonnes.length : 0;
  const m = t && t.masque && typeof t.masque === 'object' ? t.masque : {};
  const c = Array.isArray(m.cellules) ? m.cellules : [], n = Array.isArray(m.noms) ? m.noms : [];
  return {
    cellules: Array.from({ length: nl }, (_, r) => Array.from({ length: nc }, (_, k) => (Array.isArray(c[r]) && typeof c[r][k] === 'boolean' ? c[r][k] : true))),
    noms: Array.from({ length: nc }, (_, k) => (typeof n[k] === 'boolean' ? n[k] : false)),
  };
}

/** le masque est-il celui par défaut ? (alors on ne l'écrit pas) */
export const estMasqueParDefaut = (m) => !!m && m.cellules.every((l) => l.every((x) => x === true)) && m.noms.every((x) => x === false);

const booleen = (v) => (v === true || v === 1 ? true : v === false || v === 0 ? false : null);

const txt = (v) => (v == null ? '' : String(v)).replace(/\r\n?/g, '\n').trim();

/**
 * Valide un tableau venu d'un formulaire ou d'un import. Les lignes sont complétées / tronquées au
 * nombre de colonnes ; les lignes entièrement vides sont retirées.
 * @returns {{ ok: true, tableau } | { ok: false, raison }}
 */
export function normaliserTableau(t) {
  if (!t || typeof t !== 'object') return { ok: false, raison: 'tableau manquant (objet { colonnes, lignes } attendu)' };
  if (!Array.isArray(t.colonnes)) return { ok: false, raison: 'tableau.colonnes manquant (liste de 2 à 6 noms)' };
  if (!Array.isArray(t.lignes)) return { ok: false, raison: 'tableau.lignes manquant (liste de 1 à 12 lignes)' };
  const colonnes = t.colonnes.map(txt);
  if (colonnes.length < LIMITES.colMin || colonnes.length > LIMITES.colMax) return { ok: false, raison: `tableau.colonnes : ${colonnes.length} colonne${colonnes.length > 1 ? 's' : ''} (de ${LIMITES.colMin} à ${LIMITES.colMax})` };
  const vide = colonnes.findIndex((c) => !c);
  if (vide >= 0) return { ok: false, raison: `tableau.colonnes : la colonne ${vide + 1} n’a pas de nom` };
  // (31/10) masque facultatif : { cellules: [[booléens]], noms: [booléens] } (true = masqué ; 1 / 0 acceptés)
  const m = t.masque;
  if (m != null && (typeof m !== 'object' || Array.isArray(m))) return { ok: false, raison: 'tableau.masque : objet { cellules, noms } attendu' };
  if (m != null) {
    const k = Object.keys(m).find((x) => !x.startsWith('_') && x !== 'cellules' && x !== 'noms');
    if (k) return { ok: false, raison: `tableau.masque.${k} : champ inconnu (attendus : cellules, noms)` };
    if (m.cellules != null && !Array.isArray(m.cellules)) return { ok: false, raison: 'tableau.masque.cellules : une liste de lignes de booléens est attendue' };
    if (m.noms != null && !Array.isArray(m.noms)) return { ok: false, raison: 'tableau.masque.noms : une liste de booléens (un par colonne) est attendue' };
    if (Array.isArray(m.cellules) && m.cellules.length > t.lignes.length) return { ok: false, raison: `tableau.masque.cellules : ${m.cellules.length} lignes pour ${t.lignes.length} lignes de tableau` };
    for (let i = 0; Array.isArray(m.cellules) && i < m.cellules.length; i++) {
      const l = m.cellules[i];
      if (!Array.isArray(l) || l.length > colonnes.length || l.some((x) => booleen(x) == null)) return { ok: false, raison: `tableau.masque.cellules[${i}] : ${colonnes.length} booléens au plus (true = masquée)` };
    }
    if (Array.isArray(m.noms) && (m.noms.length > colonnes.length || m.noms.some((x) => booleen(x) == null))) return { ok: false, raison: `tableau.masque.noms : ${colonnes.length} booléens au plus (true = nom masqué)` };
  }
  const lu = (r, k) => { const l = m && Array.isArray(m.cellules) ? m.cellules[r] : null; const b = Array.isArray(l) ? booleen(l[k]) : null; return b == null ? true : b; };
  const masqueCellules = [];
  const lignes = [];
  for (let i = 0; i < t.lignes.length; i++) {
    const l = t.lignes[i];
    const cellules = Array.isArray(l) ? l : l && typeof l === 'object' ? colonnes.map((c) => l[c]) : null;
    if (!cellules) return { ok: false, raison: `tableau.lignes[${i}] : une liste de cellules est attendue` };
    if (cellules.length > colonnes.length) return { ok: false, raison: `tableau.lignes[${i}] : ${cellules.length} cellules pour ${colonnes.length} colonnes` };
    const c = colonnes.map((_, k) => txt(cellules[k]));
    if (c.some(Boolean)) { lignes.push(c); masqueCellules.push(colonnes.map((_, k) => lu(i, k))); }
  }
  if (lignes.length < LIMITES.ligMin) return { ok: false, raison: 'tableau.lignes : au moins une ligne non vide' };
  if (lignes.length > LIMITES.ligMax) return { ok: false, raison: `tableau.lignes : ${lignes.length} lignes (${LIMITES.ligMax} au plus)` };
  const masque = { cellules: masqueCellules, noms: colonnes.map((_, k) => { const b = m && Array.isArray(m.noms) ? booleen(m.noms[k]) : null; return b == null ? false : b; }) };
  return { ok: true, tableau: { v: 1, colonnes, lignes, ...(estMasqueParDefaut(masque) ? {} : { masque }) } };
}

/** le tableau mis à plat (verso texte) : une ligne par rangée, « Colonne : valeur » séparés par « · » */
export function texteTableau(t) {
  if (!t) return '';
  return t.lignes.map((l) => t.colonnes.map((c, k) => `${c} : ${l[k] || '—'}`).join(' · ')).join('\n');
}

/** la carte complète, prête pour appendItemsToFiche (même chemin qu'une carte créée à la main) */
export function carteTableau({ titre, colonnes, lignes, masque = null, theme = '', indice = '', aRetenir = '', difficulte = 'intermediaire' }) {
  const r = normaliserTableau({ colonnes, lignes, ...(masque ? { masque } : {}) });
  if (!r.ok) throw new Error(r.raison);
  return {
    type: 'flashcard', theme: theme.trim(), concept: theme.trim(), difficulte,
    recto: String(titre || '').trim(), verso: texteTableau(r.tableau),
    indice: String(indice || '').trim() || null, a_retenir: String(aRetenir || '').trim(), cloze: [],
    tableau: r.tableau,
  };
}

/**
 * Collage depuis un tableur (TSV : tabulations entre cellules, retours à la ligne entre rangées ;
 * les cellules « entre guillemets » d'Excel / Numbers / Sheets, avec retours à la ligne, sont gérées).
 * `entetes` : la première rangée donne les noms de colonnes.
 * @returns {{ colonnes: string[] | null, lignes: string[][] }}
 */
export function lireTSV(texte, { entetes = true } = {}) {
  const s = String(texte || '').replace(/\r\n?/g, '\n');
  const rangees = [];
  let rangee = [], cellule = '', guillemets = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (guillemets) {
      if (c === '"' && s[i + 1] === '"') { cellule += '"'; i++; }
      else if (c === '"') guillemets = false;
      else cellule += c;
      continue;
    }
    if (c === '"' && cellule === '') { guillemets = true; continue; }
    if (c === '\t') { rangee.push(cellule); cellule = ''; continue; }
    if (c === '\n') { rangee.push(cellule); rangees.push(rangee); rangee = []; cellule = ''; continue; }
    cellule += c;
  }
  if (cellule !== '' || rangee.length) { rangee.push(cellule); rangees.push(rangee); }
  const propres = rangees.map((r) => r.map((x) => x.trim())).filter((r) => r.some(Boolean));
  if (!propres.length) return { colonnes: null, lignes: [] };
  return entetes ? { colonnes: propres[0], lignes: propres.slice(1) } : { colonnes: null, lignes: propres };
}

/** un collage ressemble-t-il à un tableau (au moins une tabulation) ? */
export const estTSV = (texte) => /\t/.test(String(texte || ''));
