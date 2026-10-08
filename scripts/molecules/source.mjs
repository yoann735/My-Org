// SOURCE de la bibliothèque de molécules (08/10, docs/compte-rendu-flashcards-molecules.md).
// Lue par generer.mjs (→ src/medrevise/molecule/bibliotheque.json) et par test-bibliotheque.mjs.
// Chaque entrée : id, nom (FR), synonymes, categorie, formule ATTENDUE (vérifiée par le test),
// et SOIT `smiles` (dessin calculé), SOIT `dessin` (gabarit Fischer / Haworth, scripts/molecules/gabarits.mjs).
// `cip` (facultatif) : nombre de centres R et S attendus (d'après le nom IUPAC) — contrôle indépendant de la stéréo.

export const CATEGORIES = ['Acides aminés', 'Oses', 'Disaccharides et polysaccharides', 'Bases, nucléosides et nucléotides', 'Coenzymes', 'Lipides', 'Métabolisme'];

const AA = [
  // [id, nom, code3, code1, chaîne latérale (SMILES de R dans N[C@@H](R)C(=O)O), formule, cip, synonymes]
  ['gly', 'Glycine', 'Gly', 'G', null, 'C2H5NO2', null, ['glycocolle']],
  ['ala', 'Alanine', 'Ala', 'A', 'C', 'C3H7NO2', { S: 1 }, []],
  ['val', 'Valine', 'Val', 'V', 'C(C)C', 'C5H11NO2', { S: 1 }, []],
  ['leu', 'Leucine', 'Leu', 'L', 'CC(C)C', 'C6H13NO2', { S: 1 }, []],
  ['ile', 'Isoleucine', 'Ile', 'I', '[C@@H](C)CC', 'C6H13NO2', { S: 2 }, []],
  ['pro', 'Proline', 'Pro', 'P', 'PRO', 'C5H9NO2', { S: 1 }, []],
  ['phe', 'Phénylalanine', 'Phe', 'F', 'Cc1ccccc1', 'C9H11NO2', { S: 1 }, ['phenylalanine']],
  ['trp', 'Tryptophane', 'Trp', 'W', 'Cc1c[nH]c2ccccc12', 'C11H12N2O2', { S: 1 }, ['tryptophan']],
  ['met', 'Méthionine', 'Met', 'M', 'CCSC', 'C5H11NO2S', { S: 1 }, ['methionine']],
  ['ser', 'Sérine', 'Ser', 'S', 'CO', 'C3H7NO3', { S: 1 }, ['serine']],
  ['thr', 'Thréonine', 'Thr', 'T', '[C@@H](C)O', 'C4H9NO3', { S: 1, R: 1 }, ['threonine']],
  ['cys', 'Cystéine', 'Cys', 'C', 'CS', 'C3H7NO2S', { R: 1 }, ['cysteine']],
  ['tyr', 'Tyrosine', 'Tyr', 'Y', 'Cc1ccc(O)cc1', 'C9H11NO3', { S: 1 }, []],
  ['asn', 'Asparagine', 'Asn', 'N', 'CC(N)=O', 'C4H8N2O3', { S: 1 }, []],
  ['gln', 'Glutamine', 'Gln', 'Q', 'CCC(N)=O', 'C5H10N2O3', { S: 1 }, []],
  ['asp', 'Acide aspartique', 'Asp', 'D', 'CC(=O)O', 'C4H7NO4', { S: 1 }, ['aspartate']],
  ['glu', 'Acide glutamique', 'Glu', 'E', 'CCC(=O)O', 'C5H9NO4', { S: 1 }, ['glutamate']],
  ['lys', 'Lysine', 'Lys', 'K', 'CCCCN', 'C6H14N2O2', { S: 1 }, []],
  ['arg', 'Arginine', 'Arg', 'R', 'CCCNC(=N)N', 'C6H14N4O2', { S: 1 }, []],
  ['his', 'Histidine', 'His', 'H', 'Cc1c[nH]cn1', 'C6H9N3O2', { S: 1 }, []],
  ['sec', 'Sélénocystéine', 'Sec', 'U', 'C[SeH]', 'C3H7NO2Se', { R: 1 }, ['selenocysteine'], true],
  ['pyl', 'Pyrrolysine', 'Pyl', 'O', 'PYL', 'C12H21N3O3', { S: 1, R: 2 }, [], true],
];

function acidesAmines() {
  const out = [];
  for (const [id, nom, c3, c1, r, formule, cip, syn, bonus] of AA) {
    let neutre, zwit;
    if (r === 'PRO') { neutre = 'OC(=O)[C@@H]1CCCN1'; zwit = '[O-]C(=O)[C@@H]1CCC[NH2+]1'; }
    else if (r === 'PYL') { neutre = 'C[C@@H]1CC=N[C@H]1C(=O)NCCCC[C@H](N)C(=O)O'; zwit = 'C[C@@H]1CC=N[C@H]1C(=O)NCCCC[C@H]([NH3+])C(=O)[O-]'; }
    else if (r === null) { neutre = 'NCC(=O)O'; zwit = '[NH3+]CC(=O)[O-]'; }
    else { neutre = `N[C@@H](${r})C(=O)O`; zwit = `[NH3+][C@@H](${r})C(=O)[O-]`; }
    const synonymes = [c3, c1 + ' (code 1 lettre)', ...syn, ...(id === 'gly' ? [] : ['L-' + nom.toLowerCase()])];
    const etiq = id === 'gly' ? '' : 'L-';
    out.push({ id: id, nom: `${nom}`, synonymes: [...synonymes, `${etiq}${nom.toLowerCase()} forme neutre`], categorie: 'Acides aminés', formule, smiles: neutre, cip, forme: 'neutre', bonus: !!bonus });
    out.push({ id: id + '-zw', nom: `${nom} – zwitterion`, synonymes: [...synonymes, 'zwitterion', 'forme ionisée', 'amphion'], categorie: 'Acides aminés', formule, smiles: zwit, cip, forme: 'zwitterion', bonus: !!bonus });
  }
  return out;
}

/* ---------- oses ---------- */
// Fischer : côtés des OH de C2 à C(n-1), de haut en bas (R = droite, L = gauche)
const OSES = [
  { id: 'glyceraldehyde-d', nom: 'D-Glycéraldéhyde', syn: ['glyceraldehyde', 'glycéraldéhyde', 'aldotriose', 'trioses'], formule: 'C3H6O3', fischer: { centres: ['R'] }, cip: { R: 1 } },
  { id: 'glyceraldehyde-l', nom: 'L-Glycéraldéhyde', syn: ['glyceraldehyde', 'glycéraldéhyde'], formule: 'C3H6O3', fischer: { centres: ['L'] }, cip: { S: 1 } },
  { id: 'ribose', nom: 'Ribose', syn: ['D-ribose', 'aldopentose'], formule: 'C5H10O5', fischer: { centres: ['R', 'R', 'R'] }, cip: { R: 3 },
    haworth: { cycle: 'furanose', subs: (a) => ({ C1: a, C2: ['H', 'OH'], C3: ['H', 'OH'], C4: ['CH2OH', 'H'] }) }, nomCycle: 'D-ribofuranose', cipCycle: { b: { R: 3, S: 1 } } },
  { id: 'desoxyribose', nom: 'Désoxyribose', syn: ['désoxyribose', 'desoxyribose', '2-désoxy-D-ribose', 'deoxyribose', 'désoxy-ribose'], formule: 'C5H10O4', fischer: { centres: ['H2', 'R', 'R'] }, cip: { R: 1, S: 1 },
    haworth: { cycle: 'furanose', subs: (a) => ({ C1: a, C2: ['H', 'H'], C3: ['H', 'OH'], C4: ['CH2OH', 'H'] }) }, nomCycle: '2-désoxy-D-ribofuranose', cipCycle: { b: { R: 2, S: 1 } } },
  { id: 'xylose', nom: 'Xylose', syn: ['D-xylose', 'sucre de bois'], formule: 'C5H10O5', fischer: { centres: ['R', 'L', 'R'] }, cip: { R: 2, S: 1 },
    haworth: { cycle: 'pyranose', subs: (a) => ({ C1: a, C2: ['H', 'OH'], C3: ['OH', 'H'], C4: ['H', 'OH'], C5: ['H', 'H'] }) }, nomCycle: 'D-xylopyranose', cipCycle: { b: { R: 3, S: 1 } } },
  { id: 'arabinose', nom: 'Arabinose', serie: 'L', syn: ['L-arabinose', 'arabinose'], formule: 'C5H10O5', fischer: { centres: ['R', 'L', 'L'] }, cip: { R: 1, S: 2 },
    haworth: { cycle: 'pyranose', subs: (a) => ({ C1: a, C2: ['H', 'OH'], C3: ['OH', 'H'], C4: ['OH', 'H'], C5: ['H', 'H'] }) }, nomCycle: 'L-arabinopyranose' },
  { id: 'glucose', nom: 'Glucose', syn: ['D-glucose', 'dextrose', 'sucre de raisin', 'glycémie', 'aldohexose'], formule: 'C6H12O6', fischer: { centres: ['R', 'L', 'R', 'R'] }, cip: { R: 3, S: 1 },
    haworth: { cycle: 'pyranose', subs: (a) => ({ C1: a, C2: ['H', 'OH'], C3: ['OH', 'H'], C4: ['H', 'OH'], C5: ['CH2OH', 'H'] }) }, nomCycle: 'D-glucopyranose', cipCycle: { a: { R: 2, S: 3 }, b: { R: 3, S: 2 } } },
  { id: 'mannose', nom: 'Mannose', syn: ['D-mannose'], formule: 'C6H12O6', fischer: { centres: ['L', 'L', 'R', 'R'] }, cip: { R: 2, S: 2 },
    haworth: { cycle: 'pyranose', subs: (a) => ({ C1: a, C2: ['OH', 'H'], C3: ['OH', 'H'], C4: ['H', 'OH'], C5: ['CH2OH', 'H'] }) }, nomCycle: 'D-mannopyranose', cipCycle: { b: { R: 2, S: 3 } } },
  { id: 'galactose', nom: 'Galactose', syn: ['D-galactose'], formule: 'C6H12O6', fischer: { centres: ['R', 'L', 'L', 'R'] }, cip: { R: 2, S: 2 },
    haworth: { cycle: 'pyranose', subs: (a) => ({ C1: a, C2: ['H', 'OH'], C3: ['OH', 'H'], C4: ['OH', 'H'], C5: ['CH2OH', 'H'] }) }, nomCycle: 'D-galactopyranose', cipCycle: { b: { R: 4, S: 1 } } },
  { id: 'fructose', nom: 'Fructose', syn: ['D-fructose', 'lévulose', 'levulose', 'sucre des fruits', 'cétohexose'], formule: 'C6H12O6', fischer: { haut: 'CH2OH', centres: ['CO', 'L', 'R', 'R'] }, cip: { R: 2, S: 1 },
    haworth: { cycle: 'furanose', noms: ['O5', 'C2', 'C3', 'C4', 'C5'], subs: (a) => ({ C2: a === 'a' ? ['CH2OH', 'OH'] : ['OH', 'CH2OH'], C3: ['OH', 'H'], C4: ['H', 'OH'], C5: ['CH2OH', 'H'] }), anomere: true }, nomCycle: 'D-fructofuranose', cipCycle: { b: { R: 2, S: 2 } } },
];

function oses() {
  const out = [];
  for (const o of OSES) {
    const serie = o.serie || 'D';
    const lin = o.id.startsWith('glyceraldehyde') ? '' : ' – forme linéaire (Fischer)';
    out.push({ id: o.id + (o.id.startsWith('glyceraldehyde') ? '' : '-lin'), nom: o.nom + lin, synonymes: [...o.syn, 'forme ouverte', 'Fischer', 'linéaire', 'chaîne ouverte'], categorie: 'Oses', formule: o.formule, dessin: { type: 'fischer', ...o.fischer }, cip: o.cip });
    if (!o.haworth) continue;
    for (const an of ['a', 'b']) {
      const lettre = an === 'a' ? 'α' : 'β';
      const subs = o.haworth.subs(o.haworth.anomere ? an : (an === 'a') === (serie === 'D') ? ['H', 'OH'] : ['OH', 'H']);
      out.push({
        id: `${o.id}-${an}`, nom: `${o.nom} – forme cyclique ${lettre}-${o.nomCycle} (Haworth)`,
        synonymes: [...o.syn, `${lettre}-${o.nomCycle}`, `${an === 'a' ? 'alpha' : 'beta'} ${o.nom.toLowerCase()}`, `${o.nom.toLowerCase()} ${lettre}`, 'forme cyclique', 'Haworth', o.haworth.cycle],
        categorie: 'Oses', formule: o.formule,
        dessin: { type: 'haworth', unites: [{ cycle: o.haworth.cycle, noms: o.haworth.noms, subs }] },
        cip: o.cipCycle && o.cipCycle[an],
      });
    }
  }
  return out;
}

/* ---------- disaccharides et motifs de polysaccharides (Haworth assemblés) ---------- */
const GLC = (c1) => ({ C1: c1, C2: ['H', 'OH'], C3: ['OH', 'H'], C4: ['H', 'OH'], C5: ['CH2OH', 'H'] });
const GLC4 = (c1) => ({ ...GLC(c1), C4: ['H', null] }); // O4 apporté par l'unité précédente
const GAL = (c1) => ({ C1: c1, C2: ['H', 'OH'], C3: ['OH', 'H'], C4: ['OH', 'H'], C5: ['CH2OH', 'H'] });
const L = { lien: true };
const DISACC = [
  { id: 'maltose', nom: 'Maltose', syn: ['α-D-glucopyranosyl-(1→4)-D-glucopyranose', 'sucre de malt', 'α(1→4)'], formule: 'C12H22O11',
    unites: [{ cycle: 'pyranose', subs: GLC(['H', L]) }, { cycle: 'pyranose', subs: GLC4(['OH', 'H']), dx: 4.7 }], liens: [{ de: [0, 'C1', 'bas'], vers: [1, 'C4'] }] },
  { id: 'cellobiose', nom: 'Cellobiose', syn: ['β-D-glucopyranosyl-(1→4)-D-glucopyranose', 'β(1→4)'], formule: 'C12H22O11',
    unites: [{ cycle: 'pyranose', subs: GLC([L, 'H']) }, { cycle: 'pyranose', subs: GLC4(['OH', 'H']), dx: 4.7, h3: 1.7 }], liens: [{ de: [0, 'C1', 'haut'], vers: [1, 'C4'] }] },
  { id: 'lactose', nom: 'Lactose', syn: ['β-D-galactopyranosyl-(1→4)-D-glucopyranose', 'sucre du lait', 'galactose-glucose'], formule: 'C12H22O11',
    unites: [{ cycle: 'pyranose', subs: GAL([L, 'H']) }, { cycle: 'pyranose', subs: GLC4(['OH', 'H']), dx: 4.7, h3: 1.7 }], liens: [{ de: [0, 'C1', 'haut'], vers: [1, 'C4'] }] },
  { id: 'saccharose', nom: 'Saccharose', syn: ['sucrose', 'sucre de table', 'α-D-glucopyranosyl-(1→2)-β-D-fructofuranoside', 'glucose-fructose'], formule: 'C12H22O11',
    unites: [{ cycle: 'pyranose', subs: GLC(['H', L]) },
      { cycle: 'furanose', noms: ['O5', 'C2', 'C3', 'C4', 'C5'], retourne: true, dx: 7.3, dy: -1.7, h3: -1.7, subs: { C2: [null, 'CH2OH'], C3: ['OH', 'H'], C4: ['H', 'OH'], C5: ['CH2OH', 'H'] } }],
    liens: [{ de: [0, 'C1', 'bas'], vers: [1, 'C2'] }] },
  { id: 'amylose', nom: 'Amidon (amylose) – motif de 3 glucoses', syn: ['amidon', 'amylose', 'α(1→4)', 'polysaccharide', 'réserve végétale'], formule: 'C18H32O16', cat: 'poly',
    unites: [{ cycle: 'pyranose', subs: GLC(['H', L]) }, { cycle: 'pyranose', subs: GLC4(['H', L]), dx: 4.7 }, { cycle: 'pyranose', subs: GLC4(['H', 'OH']), dx: 9.4 }],
    liens: [{ de: [0, 'C1', 'bas'], vers: [1, 'C4'] }, { de: [1, 'C1', 'bas'], vers: [2, 'C4'] }] },
  { id: 'cellulose', nom: 'Cellulose – motif de 3 glucoses', syn: ['cellulose', 'β(1→4)', 'polysaccharide', 'fibre végétale'], formule: 'C18H32O16', cat: 'poly',
    unites: [{ cycle: 'pyranose', subs: GLC([L, 'H']) }, { cycle: 'pyranose', subs: GLC4([L, 'H']), dx: 4.7, h3: 1.7 }, { cycle: 'pyranose', subs: GLC4(['OH', 'H']), dx: 9.4, h3: 3.4 }],
    liens: [{ de: [0, 'C1', 'haut'], vers: [1, 'C4'] }, { de: [1, 'C1', 'haut'], vers: [2, 'C4'] }] },
  { id: 'glycogene', nom: 'Glycogène – motif ramifié (α1→4 et α1→6)', syn: ['glycogène', 'glycogene', 'α(1→6)', 'ramification', 'polysaccharide', 'réserve animale', 'amylopectine'], formule: 'C18H32O16', cat: 'poly',
    unites: [{ cycle: 'pyranose', subs: GLC(['H', L]) },
      { cycle: 'pyranose', subs: { ...GLC4(['H', 'OH']), C5: ['CH2-lien', 'H'] }, dx: 4.7 },
      { cycle: 'pyranose', subs: GLC(['H', L]), dx: 2.2, dy: 3.3, h3: 3.3 }],
    liens: [{ de: [0, 'C1', 'bas'], vers: [1, 'C4'] }, { de: [2, 'C1', 'bas'], vers: [1, 'C6'] }] },
];

/* ---------- bases, nucléosides, nucléotides ---------- */
const BASES = { A: 'Nc1ncnc2c1ncn2', G: 'O=c1[nH]c(N)nc2c1ncn2', C: 'O=c1nc(N)ccn1', U: 'O=c1[nH]c(=O)ccn1', T: 'O=c1[nH]c(=O)c(C)cn1' };
const RIBO = (x = 'O') => `[C@@H]1O[C@H](C${x})[C@@H](O)[C@H]1O`; // β-D-ribofuranosyle (ordre : C1', O4', C4'(C5'), C3', C2')
const DRIBO = (x = 'O') => `[C@@H]1O[C@H](C${x})[C@@H](O)C1`;     // 2'-désoxy
const P1 = 'OP(=O)(O)O', P2 = 'OP(=O)(O)OP(=O)(O)O', P3 = 'OP(=O)(O)OP(=O)(O)OP(=O)(O)O';
const NUCL = [
  ['adenine', 'Adénine', ['A', 'base purique', 'adenine'], 'C5H5N5', 'Nc1ncnc2[nH]cnc12'],
  ['guanine', 'Guanine', ['G', 'base purique'], 'C5H5N5O', 'Nc1nc2[nH]cnc2c(=O)[nH]1'],
  ['cytosine', 'Cytosine', ['C', 'base pyrimidique'], 'C4H5N3O', 'Nc1cc[nH]c(=O)n1'],
  ['thymine', 'Thymine', ['T', 'base pyrimidique', '5-méthyluracile'], 'C5H6N2O2', 'Cc1c[nH]c(=O)[nH]c1=O'],
  ['uracile', 'Uracile', ['U', 'uracil', 'base pyrimidique'], 'C4H4N2O2', 'O=c1cc[nH]c(=O)[nH]1'],
  ['adenosine', 'Adénosine', ['nucléoside', 'adenosine'], 'C10H13N5O4', BASES.A + RIBO(), { R: 3, S: 1 }],
  ['guanosine', 'Guanosine', ['nucléoside'], 'C10H13N5O5', BASES.G + RIBO(), { R: 3, S: 1 }],
  ['cytidine', 'Cytidine', ['nucléoside'], 'C9H13N3O5', BASES.C + RIBO(), { R: 3, S: 1 }],
  ['uridine', 'Uridine', ['nucléoside'], 'C9H12N2O6', BASES.U + RIBO(), { R: 3, S: 1 }],
  ['thymidine', 'Thymidine', ['désoxythymidine', 'dT', 'nucléoside'], 'C10H14N2O5', BASES.T + DRIBO(), { R: 2, S: 1 }],
  ['desoxyadenosine', 'Désoxyadénosine', ['dA', "2'-désoxyadénosine", 'nucléoside'], 'C10H13N5O3', BASES.A + DRIBO(), { R: 2, S: 1 }],
  ['desoxyguanosine', 'Désoxyguanosine', ['dG', "2'-désoxyguanosine", 'nucléoside'], 'C10H13N5O4', BASES.G + DRIBO(), { R: 2, S: 1 }],
  ['desoxycytidine', 'Désoxycytidine', ['dC', "2'-désoxycytidine", 'nucléoside'], 'C9H13N3O4', BASES.C + DRIBO(), { R: 2, S: 1 }],
  ['amp', 'AMP', ['adénosine monophosphate', 'acide adénylique', 'nucléotide'], 'C10H14N5O7P', BASES.A + RIBO(P1), { R: 3, S: 1 }],
  ['adp', 'ADP', ['adénosine diphosphate', 'nucléotide'], 'C10H15N5O10P2', BASES.A + RIBO(P2), { R: 3, S: 1 }],
  ['atp', 'ATP', ['adénosine triphosphate', 'nucléotide', 'énergie', 'monnaie énergétique'], 'C10H16N5O13P3', BASES.A + RIBO(P3), { R: 3, S: 1 }],
  ['gtp', 'GTP', ['guanosine triphosphate', 'nucléotide'], 'C10H16N5O14P3', BASES.G + RIBO(P3), { R: 3, S: 1 }],
  ['datp', 'dATP', ['désoxyadénosine triphosphate', 'dNTP', 'nucléotide'], 'C10H16N5O12P3', BASES.A + DRIBO(P3), { R: 2, S: 1 }],
  ['dgtp', 'dGTP', ['désoxyguanosine triphosphate', 'dNTP', 'nucléotide'], 'C10H16N5O13P3', BASES.G + DRIBO(P3), { R: 2, S: 1 }],
  ['dctp', 'dCTP', ['désoxycytidine triphosphate', 'dNTP', 'nucléotide'], 'C9H16N3O13P3', BASES.C + DRIBO(P3), { R: 2, S: 1 }],
  ['dttp', 'dTTP', ['désoxythymidine triphosphate', 'thymidine triphosphate', 'dNTP', 'nucléotide'], 'C10H17N2O14P3', BASES.T + DRIBO(P3), { R: 2, S: 1 }],
];

/* ---------- coenzymes ---------- */
const ADO_PP = `OP(=O)(O)OP(=O)(O)OC[C@H]7O[C@@H](n8cnc9c(N)ncnc89)[C@H](O)[C@@H]7O`; // chiffres 7-9 : jamais ouverts ailleurs (FAD garde 1 et 2 ouverts) // …-PP-adénosine
const COA = 'CC(C)(COP(=O)(O)OP(=O)(O)OC[C@H]1O[C@@H](n2cnc3c(N)ncnc32)[C@H](O)[C@@H]1OP(=O)(O)O)[C@@H](O)C(=O)NCCC(=O)NCCS';
const COENZ = [
  ['nad', 'NAD⁺', ['nicotinamide adénine dinucléotide', 'NAD+', 'NAD oxydé', 'coenzyme', 'oxydoréduction'], 'C21H28N7O14P2', `NC(=O)c1ccc[n+](c1)[C@@H]1O[C@H](C${ADO_PP})[C@@H](O)[C@H]1O`],
  ['nadh', 'NADH', ['NAD réduit', 'NADH,H+', 'coenzyme', 'oxydoréduction'], 'C21H29N7O14P2', `NC(=O)C1=CN(C=CC1)[C@@H]1O[C@H](C${ADO_PP})[C@@H](O)[C@H]1O`],
  ['fad', 'FAD', ['flavine adénine dinucléotide', 'coenzyme', 'riboflavine', 'oxydoréduction'], 'C27H33N9O15P2', `Cc1cc2nc3c(=O)[nH]c(=O)nc-3n(C[C@H](O)[C@H](O)[C@H](O)C${ADO_PP})c2cc1C`],
  ['coa', 'Coenzyme A (motif)', ['CoA', 'CoA-SH', 'coenzyme A', 'acide pantothénique'], 'C21H36N7O16P3S', COA, { R: 4, S: 1 }],
  ['acetyl-coa', 'Acétyl-CoA (motif)', ['acetyl-CoA', 'acétyl coenzyme A', 'Krebs', 'β-oxydation'], 'C23H38N7O17P3S', COA + 'C(C)=O', { R: 4, S: 1 }],
  ['succinyl-coa', 'Succinyl-CoA', ['succinyl coenzyme A', 'Krebs'], 'C25H40N7O19P3S', COA + 'C(=O)CCC(=O)O', { R: 4, S: 1 }],
];

/* ---------- lipides ---------- */
const LIPIDES = [
  ['palmitique', 'Acide palmitique', ['palmitate', 'C16:0', 'acide hexadécanoïque', 'acide gras saturé'], 'C16H32O2', 'CCCCCCCCCCCCCCCC(=O)O'],
  ['stearique', 'Acide stéarique', ['stéarate', 'C18:0', 'acide octadécanoïque', 'acide gras saturé'], 'C18H36O2', 'CCCCCCCCCCCCCCCCCC(=O)O'],
  ['oleique', 'Acide oléique', ['oléate', 'C18:1', 'oméga-9', 'cis-9', 'acide gras insaturé'], 'C18H34O2', 'CCCCCCCC/C=C\\CCCCCCCC(=O)O', null, { Z: 1 }],
  ['linoleique', 'Acide linoléique', ['linoléate', 'C18:2', 'oméga-6', 'acide gras essentiel'], 'C18H32O2', 'CCCCC/C=C\\C/C=C\\CCCCCCCC(=O)O', null, { Z: 2 }],
  ['arachidonique', 'Acide arachidonique', ['arachidonate', 'C20:4', 'oméga-6', 'eicosanoïdes'], 'C20H32O2', 'CCCCC/C=C\\C/C=C\\C/C=C\\C/C=C\\CCCC(=O)O', null, { Z: 4 }],
  ['glycerol', 'Glycérol', ['glycérine', 'propane-1,2,3-triol', 'glycerol'], 'C3H8O3', 'OCC(O)CO'],
  ['triglyceride', 'Triglycéride type (tripalmitine)', ['triacylglycérol', 'triglycéride', 'TG', 'graisse neutre', 'tripalmitine'], 'C51H98O6', 'CCCCCCCCCCCCCCCC(=O)OCC(COC(=O)CCCCCCCCCCCCCCC)OC(=O)CCCCCCCCCCCCCCC'],
  ['phosphatidylcholine', 'Phospholipide type (phosphatidylcholine)', ['phospholipide', 'lécithine', 'phosphatidylcholine', 'DPPC', 'glycérophospholipide', 'membrane'], 'C40H80NO8P', 'CCCCCCCCCCCCCCCC(=O)OC[C@H](COP(=O)([O-])OCC[N+](C)(C)C)OC(=O)CCCCCCCCCCCCCCC', { R: 1 }],
  ['cholesterol', 'Cholestérol', ['cholesterol', 'stérol', 'stéroïde', 'membrane'], 'C27H46O', 'C[C@H](CCCC(C)C)[C@H]1CC[C@H]2[C@@H]3CC=C4C[C@@H](O)CC[C@]4(C)[C@H]3CC[C@]12C', { R: 4, S: 4 }],
];

/* ---------- métabolisme ---------- */
const METAB = [
  ['pyruvate', 'Pyruvate', ['acide pyruvique', 'glycolyse', 'pyruvic'], 'C3H4O3', 'CC(=O)C(=O)O'],
  ['lactate', 'Lactate (L)', ['acide lactique', 'L-lactate', 'fermentation lactique'], 'C3H6O3', 'C[C@H](O)C(=O)O', { S: 1 }],
  ['g6p', 'Glucose-6-phosphate', ['G6P', 'glucose 6-phosphate', 'glycolyse', 'β-D-glucopyranose 6-phosphate'], 'C6H13O9P', 'HAW:G6P'],
  ['f6p', 'Fructose-6-phosphate', ['F6P', 'fructose 6-phosphate', 'glycolyse'], 'C6H13O9P', 'HAW:F6P'],
  ['f16bp', 'Fructose-1,6-bisphosphate', ['F1,6BP', 'fructose 1,6-bisphosphate', 'fructose 1,6-diphosphate', 'glycolyse'], 'C6H14O12P2', 'HAW:F16BP'],
  ['dhap', 'Dihydroxyacétone phosphate', ['DHAP', 'phosphodihydroxyacétone', 'glycolyse'], 'C3H7O6P', 'OCC(=O)COP(=O)(O)O'],
  ['gap', 'Glycéraldéhyde-3-phosphate', ['G3P', 'GAP', '3-phosphoglycéraldéhyde', 'glycolyse'], 'C3H7O6P', 'O=C[C@H](O)COP(=O)(O)O', { R: 1 }],
  ['bpg13', '1,3-Bisphosphoglycérate', ['1,3-BPG', '1,3-diphosphoglycérate', 'glycolyse'], 'C3H8O10P2', 'O=C(OP(=O)(O)O)[C@H](O)COP(=O)(O)O', { R: 1 }],
  ['pg3', '3-Phosphoglycérate', ['3-PG', 'acide 3-phosphoglycérique', 'glycolyse'], 'C3H7O7P', 'OC(=O)[C@H](O)COP(=O)(O)O', { R: 1 }],
  ['pg2', '2-Phosphoglycérate', ['2-PG', 'acide 2-phosphoglycérique', 'glycolyse'], 'C3H7O7P', 'OC[C@@H](OP(=O)(O)O)C(=O)O', { R: 1 }],
  ['pep', 'Phosphoénolpyruvate', ['PEP', 'phosphoenolpyruvate', 'glycolyse'], 'C3H5O6P', 'C=C(OP(=O)(O)O)C(=O)O'],
  ['citrate', 'Citrate', ['acide citrique', 'cycle de Krebs', 'Krebs'], 'C6H8O7', 'OC(=O)CC(O)(CC(=O)O)C(=O)O'],
  ['isocitrate', 'Isocitrate', ['acide isocitrique', 'Krebs', '(2R,3S)-isocitrate'], 'C6H8O7', 'OC(=O)C[C@H](C(=O)O)[C@@H](O)C(=O)O', { R: 1, S: 1 }],
  ['akg', 'α-Cétoglutarate', ['alpha-cétoglutarate', 'oxoglutarate', '2-oxoglutarate', 'acide α-cétoglutarique', 'Krebs'], 'C5H6O5', 'OC(=O)CCC(=O)C(=O)O'],
  ['succinate', 'Succinate', ['acide succinique', 'Krebs'], 'C4H6O4', 'OC(=O)CCC(=O)O'],
  ['fumarate', 'Fumarate', ['acide fumarique', 'Krebs', 'trans'], 'C4H4O4', 'OC(=O)/C=C/C(=O)O', null, { E: 1 }],
  ['malate', 'Malate (L)', ['acide malique', 'L-malate', 'Krebs'], 'C4H6O5', 'OC(=O)C[C@H](O)C(=O)O', { S: 1 }],
  ['oxaloacetate', 'Oxaloacétate', ['acide oxaloacétique', 'OAA', 'Krebs', 'néoglucogenèse'], 'C4H4O5', 'OC(=O)CC(=O)C(=O)O'],
  ['uree', 'Urée', ['uree', 'carbamide', 'cycle de l’urée'], 'CH4N2O', 'NC(N)=O'],
  ['creatine', 'Créatine', ['creatine', 'muscle'], 'C4H9N3O2', 'CN(CC(=O)O)C(=N)N'],
  ['creatinine', 'Créatinine', ['creatinine', 'fonction rénale'], 'C4H7N3O', 'CN1CC(=O)NC1=N'],
];

const FRU = (c2) => ({ cycle: 'furanose', noms: ['O5', 'C2', 'C3', 'C4', 'C5'], subs: { C2: c2, C3: ['OH', 'H'], C4: ['H', 'OH'], C5: ['CH2OP', 'H'] } });
const HAWS = {
  G6P: { unites: [{ cycle: 'pyranose', subs: { ...GLC(['OH', 'H']), C5: ['CH2OP', 'H'] } }], cip: { R: 3, S: 2 } },
  F6P: { unites: [FRU(['OH', 'CH2OH'])], cip: { R: 2, S: 2 } },
  F16BP: { unites: [FRU(['OH', 'CH2OP'])], cip: { R: 2, S: 2 } },
};

export function entrees() {
  const out = [...acidesAmines(), ...oses()];
  for (const d of DISACC) out.push({ id: d.id, nom: d.nom, synonymes: d.syn, categorie: 'Disaccharides et polysaccharides', formule: d.formule, dessin: { type: 'haworth', unites: d.unites, liens: d.liens }, cip: d.cip, motif: d.cat === 'poly' });
  // cycles attendus : purine 2, pyrimidine 1, (désoxy)ribose 1
  const cyclesNucl = (smiles) => (/^(Nc1ncnc2c1ncn2|O=c1\[nH\]c\(N\)nc2c1ncn2)/.test(smiles) ? 3 : smiles.includes('[C@@H]1O') ? 2 : null);
  for (const [id, nom, syn, formule, smiles, cip] of NUCL) out.push({ id, nom, synonymes: syn, categorie: 'Bases, nucléosides et nucléotides', formule, smiles, cip, cycles: cyclesNucl(smiles) });
  const CYCLES_COENZ = { nad: 5, nadh: 5, fad: 6, coa: 3, 'acetyl-coa': 3, 'succinyl-coa': 3 };
  for (const [id, nom, syn, formule, smiles, cip] of COENZ) out.push({ id, nom, synonymes: syn, categorie: 'Coenzymes', formule, smiles, cip, cycles: CYCLES_COENZ[id] });
  for (const [id, nom, syn, formule, smiles, cip, ez] of LIPIDES) out.push({ id, nom, synonymes: syn, categorie: 'Lipides', formule, smiles, cip, ez });
  for (const [id, nom, syn, formule, smiles, cip, ez] of METAB) {
    if (smiles.startsWith('HAW:')) { const h = HAWS[smiles.slice(4)]; out.push({ id, nom, synonymes: syn, categorie: 'Métabolisme', formule, dessin: { type: 'haworth', unites: h.unites }, cip: h.cip }); }
    else out.push({ id, nom, synonymes: syn, categorie: 'Métabolisme', formule, smiles, cip, ez });
  }
  return out;
}
