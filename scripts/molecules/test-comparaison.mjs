// Tests de la comparaison chimique des cartes Molécule (src/medrevise/molecule/chimie.js) —
// node scripts/molecules/test-comparaison.mjs
import fs from 'fs';
import OCL from 'openchemlib';
import { lire, comparer, svg, exporter } from '../../src/medrevise/molecule/chimie.js';
const { Molecule } = OCL;
const biblio = JSON.parse(fs.readFileSync(new URL('../../src/medrevise/molecule/bibliotheque.json', import.meta.url)));
let echecs = 0;
const ok = (c, m, d = '') => { console.log((c ? '✅' : '❌') + ' ' + m + (d ? ' — ' + d : '')); if (!c) echecs++; };
const ref = (id) => lire(OCL, biblio.entrees.find((e) => e.id === id));
const dessin = (smiles) => { const m = Molecule.fromSmiles(smiles); m.inventCoordinates(); return m; };

const ala = ref('ala');
let r = comparer(OCL, dessin('C[C@H](N)C(=O)O'), ala, 'constitution');
ok(r.identique && !r.ionisation, 'Alanine reconstruite correctement → identique');
r = comparer(OCL, dessin('C[C@H](N)C(=O)N'), ala, 'constitution');
ok(!r.identique && r.structure.atomesEnTrop.length === 1 && r.structure.atomesManquants.length === 1 && r.u.getAtomLabel(r.structure.atomesEnTrop[0]) === 'N' && r.r.getAtomLabel(r.structure.atomesManquants[0]) === 'O',
  'N à la place d’un O → 1 atome en trop (N, mon dessin), 1 manquant (O, référence)', `${r.formuleU} / ${r.formuleR}`);
ok(r.formuleU === 'C3H8N2O' && r.formuleR === 'C3H7NO2', 'formules brutes des deux', `${r.formuleU} vs ${r.formuleR}`);
r = comparer(OCL, dessin('C[C@@H](N)C(=O)O'), ala, 'stereo');
ok(!r.identique && r.stereoDiffere && r.stereo.centresU.length === 1, 'stéréo stricte : D-alanine refusée, 1 centre qui diffère', JSON.stringify(r.detailStereo));
r = comparer(OCL, dessin('C[C@H](N)C(=O)O'), ala, 'stereo');
ok(r.identique, 'stéréo stricte : L-alanine acceptée');
r = comparer(OCL, dessin('C[C@@H](N)C(=O)O'), ala, 'constitution');
ok(r.identique, 'constitution : D-alanine acceptée');
r = comparer(OCL, dessin('CC(N)C(=O)O'), ala, 'stereo');
ok(!r.identique && r.stereoDiffere, 'stéréo stricte : centre non défini refusé', JSON.stringify(r.detailStereo));
r = comparer(OCL, dessin('C[C@H]([NH3+])C(=O)[O-]'), ala, 'constitution');
ok(r.identique && r.ionisation, 'zwitterion contre forme neutre : même molécule, ionisation signalée');
r = comparer(OCL, dessin('CC(=O)O'), ala, 'constitution');
ok(!r.identique && r.structure.atomesManquants.length === 2, 'acide acétique contre alanine : 2 atomes manquants (C et N)', String(r.structure.atomesManquants.length));
r = comparer(OCL, new Molecule(0, 0), ala, 'constitution');
ok(!r.identique && r.vide && r.structure.atomesManquants.length === 6, 'dessin vide : tout manque');
// double liaison à la place d'une simple
r = comparer(OCL, dessin('C=C(N)C(=O)O'), ala, 'constitution');
ok(!r.identique && (r.structure.liaisonsEnTrop.length >= 1), 'liaison double au lieu de simple : liaison mise en évidence', JSON.stringify(r.structure));
// glucose : α contre β en stéréo stricte / constitution
r = comparer(OCL, ref('glucose-a'), ref('glucose-b'), 'stereo');
ok(!r.identique && r.stereo.centresU.length === 1, 'α-glucose contre β-glucose (stricte) : 1 centre (anomérique)', JSON.stringify(r.detailStereo));
r = comparer(OCL, ref('glucose-a'), ref('glucose-b'), 'constitution');
ok(r.identique, 'α contre β (constitution) : acceptés');
// rendu : surlignage présent
r = comparer(OCL, dessin('C[C@H](N)C(=O)N'), ala, 'constitution');
const s = svg(OCL, r.u, { atomes: r.structure.atomesEnTrop, liaisons: r.structure.liaisonsEnTrop });
ok(/class="event surligne"/.test(s), 'SVG : atome en trop surligné');
// exporter : SMILES + molfile + formule
const ex = exporter(OCL, ref('glucose-b'));
ok(ex.smiles && ex.molfile.includes('V2000') && ex.formule === 'C6H12O6', 'export SMILES + molfile + formule', ex.smiles);
// les 134 références se reconnaissent elles-mêmes (stéréo stricte), depuis le molfile ET depuis le SMILES
let n = 0;
for (const e of biblio.entrees) { const a = lire(OCL, { molfile: e.molfile }), b = lire(OCL, { smiles: e.smiles }); if (comparer(OCL, a, b, 'stereo').identique) n++; else console.log('   ✗', e.id); }
ok(n === biblio.entrees.length, `chaque entrée de la bibliothèque se reconnaît (dessin vs SMILES, stéréo stricte) : ${n}/${biblio.entrees.length}`);
console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est vert.');
process.exit(echecs ? 1 : 0);
