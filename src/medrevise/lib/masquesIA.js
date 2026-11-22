/* ============================================================
   MedRevise — MASQUES PRODUITS PAR UNE IA pour une flashcard image (22/11/2026,
   docs/format-masques-ia.md, docs/prompt-masques-ia.md, docs/compte-rendu-masques-ia.md).

   Trois fonctions PURES (aucun accès au stockage, aucun appel réseau) :
   - `lireMasquesIA(texte, { W, H })` : lecture TOLÉRANTE du JSON collé (texte autour, balises
     ```json, guillemets typographiques, virgules en trop), valeurs ramenées dans l'image ;
   - `recalerMasques(masques, ocr, { W, H })` : chaque masque prend le contour des mots que l'OCR
     existant (ocr/ocrImage.js) a lus pour son label, dans une zone autour de lui ;
   - le résultat devient des zones RECTANGULAIRES de l'éditeur, créées par la même fonction que
     les zones dessinées à la main (pages/ImportAnatomieVisuel.jsx#nouvelleZone) : rien de neuf
     n'est stocké.
   ============================================================ */

export const FORMAT_MASQUES = 'medrevise-masques';
export const VERSION_MASQUES = 1;
/** zone de recherche du recalage : le masque agrandi de 3 % de la taille de l'image */
export const MARGE_RECHERCHE = 0.03;
/** marge du masque recalé autour des mots, en pixels de l'image d'origine */
export const MARGE_PX = 4;

/* ------------------------------------------------------------------ PROMPT */
export const PROMPT_MASQUES_IA = `Tu prépares des flashcards à masques (occlusion d'image) à partir de l'image jointe : un schéma dont les étiquettes (les noms des structures) doivent être cachées par des rectangles.

RÉPONDS UNIQUEMENT AVEC LE JSON CI-DESSOUS : pas de phrase avant ou après, pas d'explication, pas de balise de code.

{"format":"medrevise-masques","version":1,"masques":[{"label":"Tubercule de Gerdy","x":0.012,"y":0.171,"w":0.180,"h":0.024}]}

COORDONNÉES
- Un masque = un rectangle : x, y = son coin HAUT-GAUCHE ; w = sa largeur ; h = sa hauteur.
- Toutes les valeurs sont des FRACTIONS de l'image entière, entre 0 et 1 : x et w divisés par la largeur de l'image, y et h divisés par sa hauteur. Origine en haut à gauche. 3 décimales.
- Exemple : une étiquette qui commence à 10 % de la largeur et à 50 % de la hauteur, large de 15 % et haute de 2 % → "x":0.100,"y":0.500,"w":0.150,"h":0.020.

QUOI MASQUER
1. Un masque par étiquette. Une étiquette = le nom d'UNE structure, relié en général à l'image par un trait (plein ou pointillé).
2. Une étiquette écrite sur plusieurs lignes (ex. « Gaines tibiales / pour les / ligaments croisés ») = UN SEUL masque qui couvre toutes ses lignes, de la première à la dernière.
3. Le rectangle couvre TOUT le texte de l'étiquette (première et dernière lettre, accents, lettres qui descendent comme p, g, q) avec une petite marge, sans couvrir le trait de rappel ni le dessin.
4. Une même étiquette présente à plusieurs endroits (ex. dans deux vues) = un masque à CHAQUE endroit, chacun à sa place.

NE MASQUE JAMAIS
- les titres et sous-titres (titre de la page, « Vue antérieure », « Vue postérieure »…) ;
- les repères d'orientation (Crânial, Caudal, Médial, Latéral, flèches…) ;
- les numéros de page, les légendes, les sources, les copyrights.

LABEL
- "label" = le texte EXACT de l'étiquette, recopié lettre par lettre tel qu'il est écrit sur l'image, même s'il contient une faute ; les lignes d'une étiquette sont réunies avec une espace.

AVANT DE RÉPONDRE
1. Compte toutes les étiquettes de l'image, zone par zone (de haut en bas, à gauche puis à droite de chaque dessin).
2. Vérifie que la liste "masques" contient exactement ce nombre d'éléments, qu'aucune étiquette n'est oubliée et qu'aucun titre ni repère n'a été pris.
3. Vérifie chaque rectangle : il contient tout le texte de son étiquette et rien d'autre.
Puis réponds UNIQUEMENT avec le JSON.`;

/* ------------------------------------------------------------------ LECTURE */
const nombre = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN);
const r4 = (v) => Math.round(v * 10000) / 10000;

/** position (ligne, colonne) d'un index dans un texte */
function ligneCol(texte, i) {
  const avant = texte.slice(0, i).split('\n');
  return { ligne: avant.length, col: avant[avant.length - 1].length + 1 };
}

/** extrait le bloc JSON : sans balises ```json, du premier { (ou [) jusqu'à l'accolade qui le ferme */
function extraireBloc(texte) {
  let t = String(texte || '').replace(/^﻿/, '');
  const balise = t.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (balise && /[{[]/.test(balise[1])) t = balise[1];
  const i0 = t.search(/[{[]/);
  if (i0 < 0) return null;
  const ouvre = t[i0], ferme = ouvre === '{' ? '}' : ']';
  let prof = 0, chaine = false, echap = false;
  for (let i = i0; i < t.length; i++) {
    const ch = t[i];
    if (chaine) { if (echap) echap = false; else if (ch === '\\') echap = true; else if (ch === '"') chaine = false; continue; }
    if (ch === '"') chaine = true;
    else if (ch === '{' || ch === '[') prof++;
    else if (ch === '}' || ch === ']') { prof--; if (prof === 0 && ch === ferme) return t.slice(i0, i + 1); }
  }
  return t.slice(i0); // pas refermé : JSON.parse dira où
}

/** réparations sûres : guillemets typographiques autour des clés/valeurs, virgules avant } ou ] */
function reparer(bloc) {
  return bloc
    .replace(/[“”„«»]/g, '"')
    .replace(/,\s*([}\]])/g, '$1');
}

function messageErreurJson(bloc, e) {
  const m = /position (\d+)/.exec((e && e.message) || '');
  let ou = '';
  if (m) {
    const i = Number(m[1]); const { ligne, col } = ligneCol(bloc, i);
    const extrait = bloc.slice(Math.max(0, i - 25), i + 25).replace(/\s+/g, ' ');
    ou = ` près de la ligne ${ligne}, colonne ${col} (« …${extrait}… »)`;
  } else if (/end of (JSON )?input|Unterminated/i.test((e && e.message) || '')) {
    ou = ' : il se termine trop tôt (accolade } ou crochet ] manquant à la fin ?)';
  }
  return `Le JSON est invalide${ou}. Vérifie : les guillemets droits " autour des textes, une virgule entre deux masques (et pas après le dernier), les accolades { } et crochets [ ] bien refermés.`;
}

/**
 * Lit le texte collé (réponse d'une IA) → { ok, masques: [{ label, x, y, w, h }], avertissements, erreur }.
 * `W`, `H` (facultatifs) = taille de l'image en pixels : des valeurs visiblement en pixels sont alors converties.
 */
export function lireMasquesIA(texte, { W = 0, H = 0 } = {}) {
  const avertissements = [];
  const echec = (erreur) => ({ ok: false, masques: [], avertissements, erreur });
  if (!String(texte || '').trim()) return echec('Rien à lire : colle la réponse de l’IA (le JSON) ou choisis un fichier .json.');
  const bloc = extraireBloc(texte);
  if (!bloc) return echec('Aucun JSON trouvé : la réponse doit contenir {"format":"medrevise-masques","version":1,"masques":[…]}.');
  let data;
  try { data = JSON.parse(bloc); } catch (e1) {
    try { data = JSON.parse(reparer(bloc)); avertissements.push('JSON réparé automatiquement (guillemets typographiques ou virgule en trop).'); } catch (e2) { return echec(messageErreurJson(bloc, e1)); }
  }
  let liste;
  if (Array.isArray(data)) { liste = data; avertissements.push('Liste de masques sans en-tête "format" : lue quand même.'); }
  else if (data && typeof data === 'object') {
    if (data.format !== FORMAT_MASQUES) avertissements.push(`"format" ${data.format == null ? 'absent' : `vaut "${data.format}"`} (attendu "${FORMAT_MASQUES}") : lu quand même.`);
    if (data.version != null && Number(data.version) !== VERSION_MASQUES) avertissements.push(`"version" ${data.version} inconnue (attendue ${VERSION_MASQUES}) : lue comme la version 1.`);
    liste = data.masques;
    if (!Array.isArray(liste)) return echec('Il manque la liste "masques" : le JSON doit avoir la forme {"format":"medrevise-masques","version":1,"masques":[{"label":…,"x":…,"y":…,"w":…,"h":…}]}.');
  } else return echec('Le JSON doit être un objet {"format":"medrevise-masques","version":1,"masques":[…]}.');
  if (!liste.length) return echec('La liste "masques" est vide : aucun masque à importer.');

  // valeurs en PIXELS (une IA qui oublie de diviser) : détectées si la plupart dépassent 1,5
  const brutes = liste.map((m) => (m && typeof m === 'object' ? ['x', 'y', 'w', 'h'].map((k) => nombre(m[k])) : []));
  const grandes = brutes.filter((v) => v.length && v.some((n) => n > 1.5)).length;
  const enPixels = W > 0 && H > 0 && grandes > liste.length / 2;
  if (enPixels) avertissements.push(`Coordonnées en pixels détectées : converties en fractions de l'image (${W} × ${H} px).`);

  const masques = []; const ignores = []; let rabotes = 0;
  liste.forEach((m, i) => {
    const n = i + 1;
    if (!m || typeof m !== 'object') { ignores.push(`n° ${n} : ce n'est pas un objet`); return; }
    const label = String(m.label ?? m.texte ?? m.nom ?? '').replace(/\s+/g, ' ').trim();
    let [x, y, w, h] = ['x', 'y', 'w', 'h'].map((k) => nombre(m[k]));
    if (![x, y, w, h].every(Number.isFinite)) { ignores.push(`n° ${n}${label ? ` (« ${label} »)` : ''} : x, y, w et h doivent être des nombres`); return; }
    if (enPixels) { x /= W; w /= W; y /= H; h /= H; }
    if (w <= 0 || h <= 0) { ignores.push(`n° ${n}${label ? ` (« ${label} »)` : ''} : largeur ou hauteur nulle`); return; }
    if (!label) avertissements.push(`Masque n° ${n} sans "label" : importé sans réponse ni recalage.`);
    // ramené DANS l'image (0..1)
    const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(1, x + w), y1 = Math.min(1, y + h);
    if (x1 - x0 <= 0.001 || y1 - y0 <= 0.001) { ignores.push(`n° ${n}${label ? ` (« ${label} »)` : ''} : entièrement hors de l'image`); return; }
    if (x0 !== x || y0 !== y || x1 !== x + w || y1 !== y + h) rabotes++;
    masques.push({ label, x: r4(x0), y: r4(y0), w: r4(x1 - x0), h: r4(y1 - y0) });
  });
  if (rabotes) avertissements.push(`${rabotes} masque${rabotes > 1 ? 's dépassaient' : ' dépassait'} de l'image : ramené${rabotes > 1 ? 's' : ''} dedans.`);
  if (ignores.length) avertissements.push(`${ignores.length} masque${ignores.length > 1 ? 's ignorés' : ' ignoré'} — ${ignores.join(' ; ')}.`);
  if (!masques.length) return echec('Aucun masque utilisable : ' + ignores.join(' ; ') + '.');
  avertissements.push(...signalerDoublons(masques));
  return { ok: true, masques, avertissements, erreur: null };
}

/* ------------------------------------------------------------ CHEVAUCHEMENTS */
export function recouvrement(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  return inter / Math.max(1e-9, Math.min(a.w * a.h, b.w * b.h)); // part de la plus petite
}

/** doublons (même label au même endroit) et chevauchements forts (> 60 % du plus petit) */
export function signalerDoublons(masques) {
  const doublons = [], chev = [];
  for (let i = 0; i < masques.length; i++) for (let j = i + 1; j < masques.length; j++) {
    const a = masques[i], b = masques[j], r = recouvrement(a, b);
    if (r <= 0.3) continue;
    if (a.label && normaliser(a.label) === normaliser(b.label)) doublons.push(`« ${a.label} » (n° ${i + 1} et ${j + 1})`);
    else if (r > 0.6) chev.push(`n° ${i + 1} « ${a.label || '?'} » et n° ${j + 1} « ${b.label || '?'} »`);
  }
  const out = [];
  if (doublons.length) out.push(`Doublon${doublons.length > 1 ? 's' : ''} probable${doublons.length > 1 ? 's' : ''} : ${doublons.join(', ')}.`);
  if (chev.length) out.push(`Chevauchement${chev.length > 1 ? 's' : ''} fort${chev.length > 1 ? 's' : ''} : ${chev.join(', ')}.`);
  return out;
}

/* -------------------------------------------------------------- RECALAGE OCR */
/** minuscules, sans accents ni ponctuation (apostrophes, tirets, points) */
export function normaliser(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[^a-z0-9]+/g, '');
}
const jetons = (label) => String(label || '').split(/\s+/).map(normaliser).filter(Boolean);

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length; if (!b.length) return a.length;
  let prec = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prec[j] + 1, cur[j - 1] + 1, prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prec = cur;
  }
  return prec[b.length];
}
/** fautes tolérées : 0 jusqu'à 2 lettres, 1 jusqu'à 5, puis ~1 sur 4 */
const tolerance = (n) => (n <= 2 ? 0 : n <= 5 ? 1 : Math.max(2, Math.floor(n / 4)));
/** distance « relative » (0 = identique) si acceptable, sinon Infinity */
function ecart(jeton, mot) {
  const d = levenshtein(jeton, mot);
  return d <= tolerance(Math.max(jeton.length, mot.length)) ? d / Math.max(1, jeton.length) : Infinity;
}
const centre = (m) => ({ x: m.x + m.w / 2, y: m.y + m.h / 2 });
const union = (l) => {
  const x0 = Math.min(...l.map((m) => m.x)), y0 = Math.min(...l.map((m) => m.y));
  return { x: x0, y: y0, w: Math.max(...l.map((m) => m.x + m.w)) - x0, h: Math.max(...l.map((m) => m.y + m.h)) - y0 };
};
const distRect = (p, r) => Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.w)), Math.max(r.y - p.y, 0, p.y - (r.y + r.h)));

/**
 * Cherche, parmi les mots OCR (relatifs, { t, x, y, w, h, line }) proches du masque, ceux qui forment son label.
 * → { mots: [...], manquants: [jetons non trouvés] } ou null si les mots significatifs (≥ 3 lettres) n'y sont pas tous.
 */
export function trouverMots(masque, mots, { W = 1000, H = 1000 } = {}) {
  const T = jetons(masque.label);
  if (!T.length) return null;
  const zone = { x: masque.x - MARGE_RECHERCHE, y: masque.y - MARGE_RECHERCHE, w: masque.w + 2 * MARGE_RECHERCHE, h: masque.h + 2 * MARGE_RECHERCHE };
  const cand = mots.map((m, i) => ({ ...m, i, n: normaliser(m.t) })).filter((m) => {
    if (!m.n) return false;
    const c = centre(m);
    return c.x >= zone.x && c.x <= zone.x + zone.w && c.y >= zone.y && c.y <= zone.y + zone.h;
  });
  if (!cand.length) return null;
  // mots voisins (même ligne à droite, ou début de la ligne suivante) : un mot coupé « tibio- / fibulaire »
  const hMoy = cand.reduce((s, m) => s + m.h, 0) / cand.length;
  const suivants = (a) => cand.filter((b) => b !== a && (
    (Math.abs(centre(b).y - centre(a).y) < hMoy * 0.6 && b.x > a.x && b.x - (a.x + a.w) < hMoy * 1.5)
    || (b.y > a.y + a.h * 0.5 && b.y - (a.y + a.h) < hMoy * 1.2 && Math.abs(b.x - a.x) < hMoy * 8)));
  const cible = { x: masque.x, y: masque.y, w: masque.w, h: masque.h };
  /* ORDRE DE LECTURE : le mot du jeton k suit celui du jeton k-1 (à droite sur la même ligne, ou au début d'une ligne
     en dessous) et précède celui du jeton k+1. Coût (en hauteurs de ligne) d'un mot par rapport au jeton déjà placé
     le plus proche dans le label — sans lui, deux étiquettes voisines (« Malléole interne » des deux vues, l'une au-dessus
     de l'autre) se mélangeaient : « Malléole » de l'une, « interne » de l'autre. */
  const ordreLecture = (box, k, places) => {
    let j = null;
    for (const x of places.keys()) if (j === null || Math.abs(x - k) < Math.abs(j - k)) j = x;
    if (j === null) return distRect(centre(box), cible) / hMoy;
    const p = places.get(j), apres = j < k, ecartK = Math.abs(j - k);
    const [a, b] = apres ? [p, box] : [box, p]; // a doit précéder b
    const memeLigne = Math.abs(centre(a).y - centre(b).y) < hMoy * 0.6;
    let c;
    if (memeLigne && b.x >= a.x + a.w - hMoy * 0.3) c = Math.max(0, b.x - (a.x + a.w)) / hMoy * 0.5;
    else if (b.y >= a.y + a.h * 0.5) c = 1 + Math.max(0, b.y - (a.y + a.h)) / hMoy + Math.abs(centre(b).x - centre(a).x) / (hMoy * 10);
    else c = 10 + distRect(centre(box), p) / hMoy;
    return c / ecartK;
  };
  /** une affectation complète des jetons, à partir d'un ANCRAGE (le mot choisi pour le plus long jeton) */
  const ordre = T.map((t, k) => ({ t, k })).sort((a, b) => b.t.length - a.t.length);
  const options = (t, k, couverts, pris) => {
    const out = [];
    for (const m of cand) {
      if (pris.has(m.i)) continue;
      out.push({ e: ecart(t, m.n), liste: [m], ks: [k] });
      // un jeton du label collé au suivant par l'OCR (« Facelaterale ») : le mot couvre deux jetons
      if (m.n.length > t.length + 1) {
        if (k + 1 < T.length && !couverts.has(k + 1)) out.push({ e: ecart(t + T[k + 1], m.n), liste: [m], ks: [k, k + 1] });
        if (k > 0 && !couverts.has(k - 1)) out.push({ e: ecart(T[k - 1] + t, m.n), liste: [m], ks: [k - 1, k] });
      }
      // un jeton coupé en deux mots par l'OCR (retour à la ligne, trait d'union)
      if (m.n.length < t.length) for (const b of suivants(m)) if (!pris.has(b.i)) out.push({ e: ecart(t, m.n + b.n), liste: [m, b], ks: [k] });
    }
    return out.filter((o) => Number.isFinite(o.e)).map((o) => ({ ...o, box: union(o.liste) }));
  };
  const affecter = (ancre) => {
    const pris = new Set(), couverts = new Set(), places = new Map(), choisis = [];
    let cout = 0;
    const placer = (o) => { o.liste.forEach((m) => pris.add(m.i)); o.ks.forEach((x) => { couverts.add(x); places.set(x, o.box); }); choisis.push(o); };
    placer(ancre); cout += ancre.e * 2;
    for (const { t, k } of ordre) {
      if (couverts.has(k)) continue;
      let best = null;
      for (const o of options(t, k, couverts, pris)) {
        const sc = o.e * 2 + ordreLecture(o.box, k, places);
        if (!best || sc < best.sc) best = { ...o, sc };
      }
      if (best) { placer(best); cout += best.sc; }
    }
    const manquants = T.map((t, k) => ({ t, k })).filter((x) => !couverts.has(x.k));
    const tous = choisis.flatMap((c) => c.liste);
    const b = union(tous);
    // le bloc trouvé doit recouper le rectangle de l'IA (sinon : une autre étiquette du voisinage)
    const ix = Math.max(0, Math.min(b.x + b.w, cible.x + cible.w) - Math.max(b.x, cible.x)), iy = Math.max(0, Math.min(b.y + b.h, cible.y + cible.h) - Math.max(b.y, cible.y));
    const iou = (ix * iy) / Math.max(1e-9, b.w * b.h + cible.w * cible.h - ix * iy);
    cout += (1 - iou) * 3 + manquants.reduce((s, m) => s + (m.t.length >= 3 ? 50 : 2), 0);
    return { tous, b, manquants, couverts, cout };
  };
  const t0 = ordre[0];
  const ancres = options(t0.t, t0.k, new Set(), new Set()).sort((a, b) => a.e - b.e || distRect(centre(a.box), cible) - distRect(centre(b.box), cible)).slice(0, 6);
  if (!ancres.length) return null;
  const meilleure = ancres.map(affecter).sort((a, b) => a.cout - b.cout)[0];
  const { tous, b, manquants, couverts } = meilleure;
  // cohérence : une étiquette tient dans un bloc compact (pas des mots épars dans toute la zone)
  if (b.w > Math.max(masque.w * 1.8, 0.25) || b.h > Math.max(masque.h * 2.5, hMoy * (T.length + 1) * 1.6)) return null;
  /* PARTIEL : un mot significatif (≥ 3 lettres) n'a pas été lu (collé à un trait, par ex.). Si au moins la moitié des
     lettres du label est trouvée, le résultat sert à AGRANDIR le masque de l'IA (recalerMasques), qui reste « à vérifier ». */
  const partiel = manquants.some((m) => m.t.length >= 3);
  if (partiel) {
    const lettres = T.join('').length, trouvees = T.filter((_, k) => couverts.has(k)).join('').length;
    if (trouvees < lettres * 0.5) return null;
  }
  return { mots: tous, manquants: manquants.map((m) => m.t), indices: [...couverts], partiel };
}

/**
 * Recale chaque masque sur les mots OCR de son label. `ocr` = résultat de ocrImage ({ mots } relatifs).
 * → [{ label, x, y, w, h, recale: bool }] : recalé = contour des mots + 4 px ; sinon position de l'IA (« à vérifier »).
 */
export function recalerMasques(masques, ocr, { W = 1000, H = 1000 } = {}) {
  const mots = ((ocr && ocr.mots) || []).filter((m) => m && m.t && m.w > 0 && m.h > 0);
  const mx = MARGE_PX / Math.max(1, W), my = MARGE_PX / Math.max(1, H);
  const out = masques.map((m) => {
    const res = mots.length && m.label ? trouverMots(m, mots, { W, H }) : null;
    if (!res) return { ...m, recale: false };
    let b = union(res.mots);
    // petits mots que l'OCR n'a pas lus (« de », « la ») : on élargit du côté où ils se trouvent
    if (res.manquants.length) {
      const lettres = res.mots.reduce((s, w) => s + normaliser(w.t).length, 0) || 1;
      const lignes = new Set(res.mots.map((w) => w.line)).size || 1;
      const parLettre = (b.w * lignes) / lettres;
      const T = jetons(m.label); const kMin = Math.min(...res.indices), kMax = Math.max(...res.indices);
      const avant = T.slice(0, kMin).reduce((s, t) => s + t.length + 1, 0);
      const apres = T.slice(kMax + 1).reduce((s, t) => s + t.length + 1, 0);
      b = { x: b.x - avant * parLettre, y: b.y, w: b.w + (avant + apres) * parLettre, h: b.h };
    }
    let x0 = Math.max(0, b.x - mx), y0 = Math.max(0, b.y - my);
    let x1 = Math.min(1, b.x + b.w + mx), y1 = Math.min(1, b.y + b.h + my);
    // partiel : le masque de l'IA, agrandi pour couvrir aussi les mots lus — et toujours « à vérifier »
    if (res.partiel) { x0 = Math.min(x0, m.x); y0 = Math.min(y0, m.y); x1 = Math.max(x1, m.x + m.w); y1 = Math.max(y1, m.y + m.h); }
    return { ...m, x: r4(x0), y: r4(y0), w: r4(x1 - x0), h: r4(y1 - y0), recale: !res.partiel, ...(res.partiel ? { partiel: true } : {}) };
  });
  // deux masques recalés sur les MÊMES mots : le second est douteux
  for (let i = 0; i < out.length; i++) for (let j = 0; j < i; j++) {
    if ((out[i].recale || out[i].partiel) && (out[j].recale || out[j].partiel) && recouvrement(out[i], out[j]) > 0.8) { out[i] = { ...masques[i], recale: false, conflit: true }; break; }
  }
  return out;
}

/** résumé en une ligne : « 40 masques importés · 37 recalés · 3 à vérifier » */
export function resumeImport(liste) {
  const n = liste.length, r = liste.filter((m) => m.recale).length, v = n - r;
  const pl = (k, s, p = s + 's') => `${k} ${k > 1 ? p : s}`;
  return `${pl(n, 'masque importé', 'masques importés')} · ${pl(r, 'recalé')} · ${v} à vérifier`;
}
