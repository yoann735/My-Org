/* ============================================================
   MedRevise — FLASHCARD « MUSCLE » (08/10, docs/compte-rendu-flashcards.md).

   Une carte Muscle est une flashcard ORDINAIRE (type 'flashcard', même notation,
   même cycle Apprendre / J, même synchro) qui porte en plus :
     muscle: { v: 1, lignes: { origine, trajet, insertion, action, innervation } }
   Le recto est le nom du muscle ; le verso TEXTE est rempli avec le tableau mis à
   plat (« Origine : … ») — ainsi tout ce qui ne connaît pas encore ce type (ancien
   appareil, export, carnet d'erreurs, recherche) affiche une carte lisible.
   Ajout pur : aucune carte existante n'est modifiée, aucun champ n'est retiré.

   Ce module est PUR (aucun DOM) : modèle, puces, mise à plat, lecture OCR du tableau.
   ============================================================ */

export const LIGNES_MUSCLE = [
  { id: 'origine', label: 'Origine' },
  { id: 'trajet', label: 'Direction des fibres / Trajet' },
  { id: 'insertion', label: 'Insertion' },
  { id: 'action', label: 'Action' },
  { id: 'innervation', label: 'Innervation' },
];

export const estMuscle = (item) => !!(item && item.muscle && typeof item.muscle === 'object' && item.muscle.lignes);

export const lignesVides = () => Object.fromEntries(LIGNES_MUSCLE.map((l) => [l.id, '']));

/** lignes d'une carte, toujours les 5 clés (chaînes) */
export function lignesDe(item) {
  const src = (item && item.muscle && item.muscle.lignes) || {};
  return Object.fromEntries(LIGNES_MUSCLE.map((l) => [l.id, typeof src[l.id] === 'string' ? src[l.id] : '']));
}

/* ---- puces ----
   Les slides collent leurs puces sous des formes variées : « • », « ◦ », « ▪ », « – »,
   « - », « * », le caractère privé de PowerPoint/Word (U+F0B7, U+F0A7, U+F076…),
   suivies d'un espace ou d'une tabulation. Tout devient « • » (ou « ◦ » en retrait). */
const PUCE = /^([ \t ]*)([•●◦○▪▫■□‣⁃∙·\-–—*➢➤►▶✓✔])[ \t ]+/;

export function normaliserPuces(texte) {
  return String(texte || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => {
      const m = l.match(PUCE);
      if (!m) return l.replace(/[ \t ]+$/, '');
      const retrait = m[1].replace(/\t/g, '    ').length >= 2 || /[◦○▫□]/.test(m[2]);
      return (retrait ? '  ◦ ' : '• ') + l.slice(m[0].length).trim();
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

/** contenu d'une ligne → blocs à afficher : { kind: 'puces', items: [{ texte, niveau }] } | { kind: 'texte', texte } */
export function blocsContenu(texte) {
  const blocs = [];
  normaliserPuces(texte).split('\n').forEach((l) => {
    const t = l.trim();
    if (!t) return;
    const puce = t.match(/^([•◦])\s*(.*)$/);
    if (puce) {
      const der = blocs[blocs.length - 1];
      const item = { texte: puce[2], niveau: puce[1] === '◦' ? 1 : 0 };
      if (der && der.kind === 'puces') der.items.push(item); else blocs.push({ kind: 'puces', items: [item] });
    } else {
      blocs.push({ kind: 'texte', texte: t });
    }
  });
  return blocs;
}

/** le tableau mis à plat (verso texte, copie, export) */
export function versoMuscle(lignes) {
  return LIGNES_MUSCLE.map((l) => {
    const v = normaliserPuces(lignes[l.id] || '').trim();
    if (!v) return `${l.label} : —`;
    return v.includes('\n') ? `${l.label} :\n${v.split('\n').map((x) => '  ' + x.trim()).join('\n')}` : `${l.label} : ${v}`;
  }).join('\n');
}

/** texte structuré complet d'une carte (Copier) : le nom, puis chaque ligne */
export function texteMuscle(item) {
  return `${(item.recto || '').trim()}\n${versoMuscle(lignesDe(item))}`;
}

/** enregistrement d'une carte Muscle à partir du formulaire */
export function carteMuscle({ nom, lignes, theme = '', indice = '', aRetenir = '', difficulte = 'intermediaire' }) {
  const propres = Object.fromEntries(LIGNES_MUSCLE.map((l) => [l.id, normaliserPuces(lignes[l.id] || '').trim()]));
  return {
    type: 'flashcard', theme: theme.trim(), concept: theme.trim(), difficulte,
    recto: nom.trim(), verso: versoMuscle(propres),
    indice: indice.trim() || null, a_retenir: aRetenir.trim(), cloze: [],
    imageId: null, imagePlace: null,
    muscle: { v: 1, lignes: propres },
  };
}

/* ============================================================
   PRÉ-REMPLISSAGE DEPUIS UNE CAPTURE (OCR existant, ocr/ocrImage.js).
   Entrée : les mots reconnus, positions RELATIVES (0–1) : { t, x, y, w, h, c, line }.
   Sortie : { lignes: {…}, trouvees: [ids], nom } — une étiquette introuvable laisse sa
   ligne vide ; aucune exception ne sort d'ici (le pire = tout vide).

   Trois mises en page reconnues :
   - tableau à 2 colonnes (étiquettes à gauche, contenu à droite), étiquettes en haut
     de cellule OU centrées verticalement ;
   - étiquettes en titres (« Origine : » puis le texte, dessous ou à la suite) ;
   - tableau horizontal (5 étiquettes côte à côte en en-tête, contenu dessous).
   ============================================================ */
const sansAccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const motNorm = (t) => sansAccent(String(t || '').toLowerCase()).replace(/[^a-z/]/g, '');

const ANCRES = {
  origine: /^origines?$/,
  trajet: /^(trajets?|direction|directions)$/,
  insertion: /^(insertions?|terminaisons?)$/,
  action: /^(actions?|fonctions?)$/,
  innervation: /^(innervations?|innerve|innervee)$/,
};
const VOCAB_ETIQUETTE = /^(origines?|direction|directions|des|de|fibres?|trajets?|insertions?|terminaisons?|actions?|fonctions?|innervations?|et|\/)$/;
// première « lettre » d'une ligne lue par l'OCR à la place d'une puce
const PUCE_OCR = /^([•●◦○▪■□‣·*\-–—»«>©®°➢➤►]|e|o|O|¢|\+)$/;

export function lignesDepuisMots(motsBruts, ratio = 16 / 9) { // ratio = largeur / hauteur de l'image
  const vide = { lignes: lignesVides(), trouvees: [], nom: '' };
  try {
    const mots = (motsBruts || []).filter((m) => m && typeof m.t === 'string' && m.t.trim())
      .map((m, i) => ({ ...m, t: m.t.trim(), i, cy: m.y + m.h / 2, n: motNorm(m.t) }));
    if (!mots.length) return vide;

    // lignes OCR (id `line`) — ordre de lecture, premier mot de chaque ligne
    const parLigne = new Map();
    mots.forEach((m) => { if (!parLigne.has(m.line)) parLigne.set(m.line, []); parLigne.get(m.line).push(m); });
    parLigne.forEach((l) => l.sort((a, b) => a.x - b.x));
    const hauteur = mediane(mots.map((m) => m.h)) || 0.02;

    // 1. ancres : un mot-clé, de préférence en DÉBUT de ligne et le plus à gauche
    const ancres = {};
    Object.entries(ANCRES).forEach(([id, re]) => {
      const cands = mots.filter((m) => re.test(m.n.replace(/\//g, '')));
      if (!cands.length) return;
      const score = (m) => {
        const l = parLigne.get(m.line);
        const debut = l[0] === m || (l[0].n === '' && l[1] === m);
        const deuxPoints = /:$/.test(m.t) || (l[l.indexOf(m) + 1] || {}).t === ':';
        return (debut ? 0 : 1) * 10 + (deuxPoints ? 0 : 1) * 2 + m.x * 3 + m.y * 0.1;
      };
      ancres[id] = cands.sort((a, b) => score(a) - score(b))[0];
    });
    // « direction » ET « trajet » : l'ancre est le premier des deux (haut de l'étiquette)
    const trouvees = LIGNES_MUSCLE.map((l) => l.id).filter((id) => ancres[id]);
    if (!trouvees.length) return vide;

    // 2. mots d'étiquette : l'ancre + ses voisins du vocabulaire d'étiquette (même colonne)
    const etiquette = new Set();
    let bordEtiquettes = 0;
    trouvees.forEach((id) => {
      const a = ancres[id];
      etiquette.add(a.i);
      const ligne = parLigne.get(a.line);
      // à droite de l'ancre, sur sa ligne, tant que c'est du vocabulaire d'étiquette collé
      let k = ligne.indexOf(a), droite = a.x + a.w;
      while (ligne[k + 1] && (VOCAB_ETIQUETTE.test(ligne[k + 1].n) || ligne[k + 1].t === ':') && ligne[k + 1].x - droite < 0.03) {
        k++; etiquette.add(ligne[k].i); droite = ligne[k].x + ligne[k].w;
      }
      bordEtiquettes = Math.max(bordEtiquettes, droite);
    });
    // étiquette sur plusieurs lignes (« Direction des / fibres / / Trajet ») : vocabulaire proche, même colonne
    trouvees.forEach((id) => {
      const a = ancres[id];
      mots.forEach((m) => {
        if (etiquette.has(m.i) || !VOCAB_ETIQUETTE.test(m.n)) return;
        if (Math.abs(m.cy - a.cy) < hauteur * 4 && m.x + m.w <= bordEtiquettes + 0.01 && Math.abs(m.x - a.x) < 0.08) etiquette.add(m.i);
      });
    });
    // « Trajet » sous « Direction des fibres / » : l'ancre de la ligne reste le haut de l'étiquette
    const ys = trouvees.map((id) => ancres[id].cy);
    const contenu = mots.filter((m) => !etiquette.has(m.i));

    // 3. mise en page
    const horizontal = trouvees.length >= 3 && Math.max(...ys) - Math.min(...ys) < hauteur * 2.5;
    let groupes;
    if (horizontal) {
      groupes = parColonnes(trouvees, ancres, contenu);
    } else {
      const aDroite = contenu.filter((m) => m.x >= bordEtiquettes - 0.005).length;
      const deuxColonnes = trouvees.length >= 2 && aDroite >= 0.8 * contenu.filter((m) => m.cy > Math.min(...ys) - hauteur * 6).length;
      const utiles = deuxColonnes ? contenu.filter((m) => m.x >= bordEtiquettes - 0.005) : contenu;
      groupes = parBandes(trouvees, ancres, utiles, hauteur);
    }

    // repères des cellules : bord gauche du texte sans puce, bord droit le plus loin (retours à la ligne automatiques)
    const hX = hauteur / ratio; // une hauteur de mot, en unités de largeur
    const tous = Object.values(groupes).flat();
    const reperes = (ms) => {
      const ls = lignesVisuelles(ms, hauteur);
      return { gauche: Math.min(...ls.map((l) => l.mots[0].x)), droite: Math.max(...ls.map((l) => { const d = l.mots[l.mots.length - 1]; return d.x + d.w; })), hX };
    };
    const global = tous.length ? reperes(tous) : null;
    const lignes = lignesVides();
    trouvees.forEach((id) => { const g = groupes[id] || []; lignes[id] = texteDesMots(g, hauteur, horizontal && g.length ? reperes(g) : global); });
    // nom : au-dessus de la première étiquette, une ligne qui ressemble à un nom de muscle
    const yMin = Math.min(...ys) - hauteur * 0.6;
    const dejaPris = new Set(Object.values(groupes).flat().map((m) => m.i));
    const lignesHaut = [...parLigne.values()]
      .filter((l) => l.every((m) => m.cy < yMin && !dejaPris.has(m.i)))
      .map((l) => l.map((m) => m.t).join(' ').trim())
      .filter((t) => t.length > 2);
    const nom = lignesHaut.find((t) => /^(m\.|muscle\b|mm\.)/i.test(t)) || '';
    return { lignes, trouvees, nom };
  } catch (e) {
    return vide;
  }
}

function quantile(v, q) {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
}

function mediane(v) {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** regroupe des mots en lignes visuelles (même hauteur), triées haut → bas */
function lignesVisuelles(mots, hauteur) {
  const tries = [...mots].sort((a, b) => a.cy - b.cy || a.x - b.x);
  const lignes = [];
  tries.forEach((m) => {
    const l = lignes.find((x) => x.line === m.line && Math.abs(x.cy - m.cy) < hauteur * 0.8)
      || lignes.find((x) => Math.abs(x.cy - m.cy) < hauteur * 0.45);
    if (l) { l.mots.push(m); l.cy = (l.cy * (l.mots.length - 1) + m.cy) / l.mots.length; } else lignes.push({ line: m.line, cy: m.cy, mots: [m] });
  });
  lignes.forEach((l) => l.mots.sort((a, b) => a.x - b.x));
  return lignes.sort((a, b) => a.cy - b.cy);
}

/* tableau vertical : chaque ligne visuelle de contenu va à une étiquette. Entre deux
   étiquettes consécutives, la frontière est le PLUS GRAND écart vertical entre lignes
   de contenu (marche pour des étiquettes en haut de cellule comme centrées). */
function parBandes(ids, ancres, mots, hauteur) {
  const ordre = [...ids].sort((a, b) => ancres[a].cy - ancres[b].cy);
  const lignes = lignesVisuelles(mots, hauteur);
  const groupes = Object.fromEntries(ordre.map((id) => [id, []]));
  if (!lignes.length) return groupes;
  const ecarts = [];
  for (let k = 1; k < lignes.length; k++) ecarts.push(lignes[k].cy - lignes[k - 1].cy);
  // interligne dans une cellule : le quart inférieur des écarts (la médiane serait tirée par les écarts entre lignes du tableau)
  const pas = quantile(ecarts.filter((e) => e > hauteur * 0.5), 0.25) || hauteur * 1.4;

  // frontières (indices de ligne : la ligne k commence le groupe suivant)
  const frontieres = [];
  for (let j = 0; j + 1 < ordre.length; j++) {
    const yA = ancres[ordre[j]].cy, yB = ancres[ordre[j + 1]].cy;
    let meilleur = -1, ecartMax = -1;
    for (let k = 1; k < lignes.length; k++) {
      const milieu = (lignes[k].cy + lignes[k - 1].cy) / 2;
      if (milieu <= yA || milieu > yB + hauteur * 0.5) continue;
      const e = lignes[k].cy - lignes[k - 1].cy;
      if (e > ecartMax + 1e-6) { ecartMax = e; meilleur = k; }
    }
    if (meilleur < 0) meilleur = lignes.findIndex((l) => l.cy > (yA + yB) / 2 + hauteur * 0.2);
    frontieres.push(meilleur < 0 ? lignes.length : meilleur);
  }
  // bornes de la première et de la dernière bande : on remonte / descend tant que les lignes se suivent
  const premiere = lignes.findIndex((l) => l.cy >= ancres[ordre[0]].cy - hauteur * 0.6);
  let debut = premiere < 0 ? lignes.length : premiere;
  while (debut > 0 && lignes[debut].cy - lignes[debut - 1].cy <= pas * 1.35 && (frontieres[0] ?? lignes.length) > debut - 1) debut--;
  let fin = lignes.length;
  const derniere = lignes.findIndex((l) => l.cy > ancres[ordre[ordre.length - 1]].cy + hauteur * 0.6);
  if (derniere >= 0) {
    let k = derniere;
    while (k < lignes.length && lignes[k].cy - lignes[k - 1].cy <= pas * 1.8) k++;
    fin = Math.max(k, frontieres[frontieres.length - 1] ?? 0);
  }
  let d = debut;
  ordre.forEach((id, j) => {
    const f = j < frontieres.length ? Math.max(d, frontieres[j]) : fin;
    lignes.slice(d, f).forEach((l) => groupes[id].push(...l.mots.map((m) => ({ ...m, _l: l.cy }))));
    d = f;
  });
  return groupes;
}

/* tableau horizontal : colonnes délimitées à mi-chemin entre étiquettes voisines */
function parColonnes(ids, ancres, mots) {
  const ordre = [...ids].sort((a, b) => ancres[a].x - ancres[b].x);
  const yEntete = Math.max(...ordre.map((id) => ancres[id].y + ancres[id].h));
  const groupes = Object.fromEntries(ordre.map((id) => [id, []]));
  mots.filter((m) => m.y >= yEntete - 0.002).forEach((m) => {
    const cx = m.x + m.w / 2;
    let k = 0;
    while (k + 1 < ordre.length && cx > (ancres[ordre[k]].x + ancres[ordre[k + 1]].x) / 2 + 0.01) k++;
    groupes[ordre[k]].push(m);
  });
  return groupes;
}

/* mots d'une cellule → texte. Une ligne visuelle commence une nouvelle ligne de texte,
   sauf si la précédente allait jusqu'au bord droit (retour à la ligne automatique du slide).
   Puces : le « • » lu par l'OCR (souvent « e », « « », « » ») OU, quand il a été raté,
   un texte en RETRAIT par rapport au texte sans puce (le retrait d'une puce de slide). */
function texteDesMots(mots, hauteur, rep) {
  if (!mots.length) return '';
  const lignes = lignesVisuelles(mots, hauteur).map((l) => {
    const p = l.mots[0];
    const puceLue = l.mots.length > 1 && PUCE_OCR.test(p.t) && l.mots[1].x - (p.x + p.w) > hauteur * 0.15 / 2;
    const reste = (puceLue ? l.mots.slice(1) : l.mots).filter((m) => !/^[|_]+$/.test(m.t));
    const d = reste[reste.length - 1] || p;
    return { puceLue, texte: reste.map((m) => m.t).join(' ').replace(/\s+([,.;:)])/g, '$1').replace(/\(\s+/g, '(').trim(), x: (reste[0] || p).x, droite: d.x + d.w };
  }).filter((l) => l.texte);
  if (!lignes.length) return '';
  const hX = rep ? rep.hX : hauteur;
  const gauche = rep ? rep.gauche : Math.min(...lignes.map((l) => l.x));
  const droite = rep ? rep.droite : Math.max(...lignes.map((l) => l.droite));
  // texte d'une puce : à droite du bord gauche d'au moins ~0,5 hauteur de mot (et pas un alinéa énorme)
  const xPuces = lignes.filter((l) => l.puceLue).map((l) => l.x);
  const enRetrait = (l) => l.x - gauche > hX * 0.5 && l.x - gauche < hX * 4;
  const auBord = (l) => droite - l.droite < hX * 2.5;
  const sortie = [];
  lignes.forEach((l, k) => {
    const prec = lignes[k - 1];
    const suite = prec && auBord(prec) && !l.puceLue && Math.abs(l.x - (prec.puceLue || prec.puce ? prec.x : l.x)) < hX * 0.8;
    l.puce = l.puceLue || (!suite && enRetrait(l) && (xPuces.length === 0 || xPuces.some((x) => Math.abs(x - l.x) < hX * 0.8)));
    if (suite && sortie.length) {
      const der = sortie[sortie.length - 1];
      sortie[sortie.length - 1] = (der.endsWith('-') ? der.slice(0, -1) : der + ' ') + l.texte;
    } else {
      sortie.push((l.puce ? '• ' : '') + l.texte);
    }
  });
  return sortie.join('\n');
}
