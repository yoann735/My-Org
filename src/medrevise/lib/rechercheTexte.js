/* ============================================================
   MedRevise — RECHERCHE DE TEXTE TOLÉRANTE (25/10, docs/compte-rendu-apprentissage-v2-recherche-tags.md).
   Fonctions PURES (tests/recherche/rechercheTexte.test.js), sans DOM. Un seul moteur pour :
   - la recherche ⌘F du lecteur (texte natif du PDF, mots reconnus par l'OCR, document éditable,
     fiche jumelle) : une PHRASE entière, même à cheval sur deux lignes ;
   - la barre de recherche du mode Apprentissage (recto, verso, thème).
   Comparaison insensible à la casse et aux accents, aux apostrophes et guillemets typographiques,
   aux ligatures (ﬁ, œ), aux tirets (césure en fin de ligne comprise) et à TOUS les blancs (retours à
   la ligne, espaces multiples, espaces perdus ou ajoutés par l'extraction du PDF) : les blancs et les
   tirets ne comptent pas dans la comparaison. Chaque caractère gardé se souvient d'où il vient
   (segment, position), pour surligner exactement la phrase trouvée.
   ============================================================ */

const APOSTROPHES = /[’‘‛ʼʹ´`′]/g;
const GUILLEMETS = /[“”„‟«»″]/g;
// tirets et traits d'union (césure comprise), et le trait d'union conditionnel
const TIRETS = /[-‐‑‒–—―−­]/;
const SPECIAUX = { 'œ': 'oe', 'æ': 'ae', 'ß': 'ss', 'ø': 'o', 'ł': 'l', 'đ': 'd' };

/** un caractère → sa forme comparable ('' s'il ne compte pas : blanc, tiret, accent seul) */
export function formeComparable(c) {
  if (!c || /\s/.test(c) || TIRETS.test(c)) return '';
  let t = c.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  t = t.replace(APOSTROPHES, "'").replace(GUILLEMETS, '"');
  let out = '';
  for (const x of t) {
    if (/\s/.test(x) || TIRETS.test(x)) continue;
    out += SPECIAUX[x] || x;
  }
  return out;
}

/** texte entier → forme comparable (pour une requête ou un filtre simple) */
export function normaliser(texte) {
  let out = '';
  for (const c of String(texte || '')) out += formeComparable(c);
  return out;
}

/** vrai si `texte` contient `requete` (même tolérance que la recherche du lecteur) */
export function contient(texte, requete) {
  const q = normaliser(requete);
  return !q || normaliser(texte).includes(q);
}

/**
 * Index de recherche sur une suite de SEGMENTS (morceaux de texte dans l'ordre de lecture : items d'une
 * page PDF, mots de l'OCR, nœuds texte d'un document). → { texte, origine } : `origine[i]` = [segment,
 * position dans le segment] du i-ème caractère comparable.
 */
export function indexer(segments) {
  let texte = '';
  const origine = [];
  (segments || []).forEach((seg, s) => {
    const str = String(seg || '');
    let i = 0;
    for (const c of str) { // for…of : un caractère hors BMP compte pour sa vraie longueur
      const f = formeComparable(c);
      for (let k = 0; k < f.length; k++) { texte += f[k]; origine.push([s, i, c.length]); }
      i += c.length;
    }
  });
  return { texte, origine };
}

/**
 * Toutes les occurrences de `requete` dans les segments. → [{ morceaux: [{ seg, debut, fin }], debut, fin }]
 * (`fin` exclusive ; un morceau par segment touché : une phrase sur deux lignes = deux morceaux).
 * Les occurrences ne se chevauchent pas.
 */
export function chercher(segments, requete, index = null) {
  const q = normaliser(requete);
  if (!q) return [];
  const { texte, origine } = index || indexer(segments);
  const out = [];
  let i = texte.indexOf(q);
  while (i !== -1) {
    const morceaux = [];
    for (let k = i; k < i + q.length; k++) {
      const [seg, pos, l] = origine[k];
      const der = morceaux[morceaux.length - 1];
      if (der && der.seg === seg) der.fin = Math.max(der.fin, pos + l);
      else morceaux.push({ seg, debut: pos, fin: pos + l });
    }
    out.push({ morceaux, debut: i, fin: i + q.length });
    i = texte.indexOf(q, i + q.length);
  }
  return out;
}

/** extrait lisible autour d'une occurrence : « … avant [trouvé] après … » → { avant, trouve, apres } */
export function extrait(segments, occ, marge = 42) {
  const segs = (segments || []).map((s) => String(s || ''));
  const premier = occ.morceaux[0], dernier = occ.morceaux[occ.morceaux.length - 1];
  // texte continu (segments séparés par un espace), avec la position de la phrase trouvée
  let plein = '', a = 0, b = 0;
  segs.forEach((s, k) => {
    if (k === premier.seg) a = plein.length + premier.debut;
    if (k === dernier.seg) b = plein.length + dernier.fin;
    plein += s + (/\s$/.test(s) ? '' : ' ');
  });
  const net = (t) => t.replace(/\s+/g, ' ');
  let avant = net(plein.slice(Math.max(0, a - marge * 2), a));
  let apres = net(plein.slice(b, b + marge * 2));
  if (avant.length > marge) avant = '…' + avant.slice(avant.length - marge).replace(/^\S*\s/, '');
  if (apres.length > marge) apres = apres.slice(0, marge).replace(/\s\S*$/, '') + '…';
  return { avant, trouve: net(plein.slice(a, b)), apres };
}
