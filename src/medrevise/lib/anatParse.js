/* ============================================================
   MedRevise — ANATOMIE THÉORIE : extraction STRUCTURÉE d'un texte collé.
   100 % LOCAL, AUCUNE IA, AUCUN RÉSEAU (règle absolue).

   Le texte décrit UNE structure et suit toujours le même format selon son
   TYPE : des étiquettes de champ « Origine : … Insertion : … ». On découpe
   sur ces étiquettes (insensible à la casse ET aux accents) et on récupère la
   valeur de chacune jusqu'à l'étiquette suivante.

   Champs attendus par type (l'ordre = l'ordre d'affichage) :
   - muscle           : origine, insertion, action, innervation, vascularisation
   - os               : emplacement, type_os, caracteristiques, articulations, vascularisation
   - nerf             : origine, trajectoire, rameaux, innervation
   - artere           : origine, trajectoire, rameaux, structures_vascularisees
   - veine            : origine, trajectoire, tributaires, drainage
   - tissu_conjonctif : description (texte libre, un seul champ)
   ============================================================ */

/* Définition des types : chaque champ a une clé, un libellé d'AFFICHAGE et une
   liste d'ALIAS (formes « repliées » — minuscules sans accents — reconnues dans
   le texte collé). Les alias les plus longs priment (tri à la construction). */
export const ANAT_TYPES = {
  muscle: {
    label: 'Muscle',
    champs: [
      { key: 'origine', label: 'Origine', alias: ['origine', 'origines'] },
      { key: 'insertion', label: 'Insertion', alias: ['insertion', 'insertions', 'terminaison'] },
      { key: 'action', label: 'Action', alias: ['action', 'actions', 'fonction'] },
      { key: 'innervation', label: 'Innervation', alias: ['innervation', 'innervation motrice'] },
      { key: 'vascularisation', label: 'Vascularisation artérielle', alias: ['vascularisation arterielle', 'vascularisation', 'vascularisation art'] },
    ],
  },
  os: {
    label: 'Os',
    champs: [
      { key: 'emplacement', label: 'Emplacement', alias: ['emplacement', 'localisation', 'situation'] },
      { key: 'type_os', label: "Type d'os", alias: ["type d'os", 'type d os', 'type os', "type d'  os", 'type'] },
      { key: 'caracteristiques', label: 'Caractéristiques principales', alias: ['caracteristiques principales', 'caracteristiques', 'particularites'] },
      { key: 'articulations', label: "S'articule avec", alias: ["s'articule avec", 's articule avec', 'articule avec', 'articulations', 'articulation'] },
      { key: 'vascularisation', label: 'Vascularisation artérielle', alias: ['vascularisation arterielle', 'vascularisation'] },
    ],
  },
  nerf: {
    label: 'Nerf',
    champs: [
      { key: 'origine', label: 'Origine', alias: ['origine', 'racines', 'racine'] },
      { key: 'trajectoire', label: 'Trajectoire', alias: ['trajectoire', 'trajet'] },
      { key: 'rameaux', label: 'Rameaux', alias: ['rameaux', 'branches', 'collaterales'] },
      { key: 'innervation', label: 'Innervation', alias: ['innervation', 'territoire', 'innerve'] },
    ],
  },
  artere: {
    label: 'Artère',
    champs: [
      { key: 'origine', label: 'Origine', alias: ['origine'] },
      { key: 'trajectoire', label: 'Trajectoire', alias: ['trajectoire', 'trajet'] },
      { key: 'rameaux', label: 'Rameaux', alias: ['rameaux', 'branches', 'collaterales'] },
      { key: 'structures_vascularisees', label: 'Structures vascularisées', alias: ['structures vascularisees', 'structures irriguees', 'territoire', 'vascularise'] },
    ],
  },
  veine: {
    label: 'Veine',
    champs: [
      { key: 'origine', label: 'Origine', alias: ['origine'] },
      { key: 'trajectoire', label: 'Trajectoire', alias: ['trajectoire', 'trajet'] },
      { key: 'tributaires', label: 'Vaisseaux tributaires', alias: ['vaisseaux tributaires', 'tributaires', 'affluents'] },
      { key: 'drainage', label: 'Drainage', alias: ['drainage', 'se draine dans', 'draine dans', 'terminaison'] },
    ],
  },
  tissu_conjonctif: {
    label: 'Tissu conjonctif',
    champs: [
      { key: 'description', label: 'Description', alias: ['description'] },
    ],
  },
};

/** libellés + clés d'un type (pour l'UI d'aperçu et le rendu). */
export function champsFor(type) {
  return (ANAT_TYPES[type] && ANAT_TYPES[type].champs) || [];
}

/* replie une chaîne en minuscules SANS accents, en préservant EXACTEMENT la
   longueur (indices alignés avec l'original) — donc PAS de NFD (qui change la
   longueur). Table char→char des diacritiques français courants. */
const FOLD = {
  à: 'a', â: 'a', ä: 'a', á: 'a', ã: 'a', å: 'a',
  ç: 'c',
  è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i',
  ñ: 'n',
  ò: 'o', ó: 'o', ô: 'o', ö: 'o', õ: 'o',
  ù: 'u', ú: 'u', û: 'u', ü: 'u',
  ý: 'y', ÿ: 'y',
  œ: 'oe', æ: 'ae', // (rares ici ; longueur 2 — évités dans les alias)
};
function fold(s) {
  let out = '';
  for (const ch of String(s || '')) {
    const low = ch.toLowerCase();
    out += (FOLD[low] != null ? FOLD[low] : low);
  }
  return out;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** vrai si le texte replié contient une étiquette « alias : » pour l'un des alias. */
function foldedHasLabel(folded, aliases) {
  return aliases.some((a) => new RegExp('(?:^|[\\s.;,])' + escapeRe(fold(a)) + '\\s*:', 'i').test(folded));
}

/**
 * Détecte le TYPE probable d'après les ÉTIQUETTES présentes dans le texte collé
 * (marqueurs discriminants). Résultat PRÉ-SÉLECTIONNÉ, à confirmer par l'utilisateur.
 * Ordre = du plus spécifique au plus générique.
 */
export function detectType(text) {
  const f = fold(text || '');
  const has = (al) => foldedHasLabel(f, al);
  if (has(['structures vascularisees', 'structures irriguees'])) return 'artere';
  if (has(['vaisseaux tributaires', 'tributaires', 'affluents']) || has(['drainage', 'se draine dans'])) return 'veine';
  if (has(["s'articule avec", 's articule avec', 'articule avec', 'articulations']) || has(["type d'os", 'type d os', 'type os'])) return 'os';
  if (has(['insertion', 'insertions'])) return 'muscle';
  if (has(['rameaux', 'branches', 'collaterales']) || has(['innervation']) || has(['trajectoire', 'trajet'])) return 'nerf';
  return 'tissu_conjonctif';
}

/**
 * Parse un texte collé pour un TYPE donné.
 * @returns {{ champs: Record<string,string>, missing: string[], found: string[] }}
 *   champs  : { cléChamp: valeur } pour tous les champs du type (vide si absent).
 *   missing : libellés des champs attendus non trouvés.
 *   found   : libellés des champs trouvés.
 */
export function parseStructure(text, type) {
  const defs = champsFor(type);
  const champs = {};
  defs.forEach((d) => { champs[d.key] = ''; });
  const raw = String(text || '');

  // tissu conjonctif : champ libre unique. Si une étiquette « Description : »
  // existe on prend ce qui suit, sinon TOUT le texte est la description.
  if (type === 'tissu_conjonctif') {
    const m = fold(raw).match(/(?:^|[\s.;,])description\s*:/);
    champs.description = (m ? raw.slice(m.index + m[0].length) : raw).trim();
    const missing = champs.description ? [] : ['Description'];
    return { champs, missing, found: champs.description ? ['Description'] : [] };
  }

  // (alias, field) triés par longueur d'alias décroissante (les libellés longs
  // priment : « vascularisation arterielle » avant « vascularisation »).
  const pairs = [];
  defs.forEach((d) => d.alias.forEach((a) => pairs.push({ field: d.key, alias: fold(a) })));
  pairs.sort((x, y) => y.alias.length - x.alias.length);
  const alts = pairs.map((p) => escapeRe(p.alias)).join('|');
  if (!alts) return { champs, missing: defs.map((d) => d.label), found: [] };

  // une étiquette = début/espace/ponctuation, puis un alias, puis « : »
  const re = new RegExp('(?:^|[\\s.;,])(' + alts + ')\\s*:', 'gi');
  const folded = fold(raw); // même longueur que raw → indices réutilisables
  const marks = [];
  let m;
  while ((m = re.exec(folded)) !== null) {
    const aliasFolded = m[1].toLowerCase();
    const pair = pairs.find((p) => p.alias === aliasFolded);
    if (!pair) continue;
    marks.push({ field: pair.field, valueStart: m.index + m[0].length, labelStart: m.index });
    // autoriser des étiquettes adjacentes (ne pas sauter la suivante)
    re.lastIndex = m.index + m[0].length;
  }
  marks.sort((a, b) => a.valueStart - b.valueStart);

  for (let i = 0; i < marks.length; i++) {
    const mk = marks[i];
    const end = i + 1 < marks.length ? marks[i + 1].labelStart : raw.length;
    const val = raw.slice(mk.valueStart, end).trim().replace(/^[:•\-–\s]+/, '').trim();
    if (champs[mk.field] === '' && val) champs[mk.field] = val; // 1re occurrence gagne
  }

  const found = defs.filter((d) => champs[d.key]).map((d) => d.label);
  const missing = defs.filter((d) => !champs[d.key]).map((d) => d.label);
  return { champs, missing, found };
}
