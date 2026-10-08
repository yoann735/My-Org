// TEST AUTOMATISÉ de la bibliothèque de molécules — node scripts/molecules/test-bibliotheque.mjs
// Pour CHAQUE entrée de src/medrevise/molecule/bibliotheque.json :
//   1. le SMILES se lit par OpenChemLib sans erreur ;
//   2. la formule brute calculée = la formule attendue (scripts/molecules/source.mjs) ;
//   3. le dessin de référence (molfile) est la MÊME molécule que le SMILES, stéréo comprise ;
//   4. si une stéréo est attendue (nombre de centres R/S d'après le nom IUPAC, doubles liaisons E/Z),
//      elle est vérifiée ;
//   5. entrée à jour avec la source (le JSON a bien été régénéré).
// + contrôles indépendants sur des SMILES connus (α/β-D-glucopyranose, D-glucose, L-/D-alanine) et
//   sur la recherche (synonymes : « dextrose » → glucose).
import fs from 'fs';
import OCL from 'openchemlib';
import { entrees } from './source.mjs';
import { compterCIP, compterEZ } from './chimie-commune.mjs';

const { Molecule, CanonizerUtil } = OCL;
const biblio = JSON.parse(fs.readFileSync(new URL('../../src/medrevise/molecule/bibliotheque.json', import.meta.url)));
let echecs = 0, ok = 0;
const ko = (m) => { console.log('❌ ' + m); echecs++; };
const id = (m, t = CanonizerUtil.NORMAL) => { const x = m.getCompactCopy(); x.removeExplicitHydrogens(); return CanonizerUtil.getIDCode(x, t); };

const sources = new Map(entrees().map((e) => [e.id, e]));
if (biblio.entrees.length !== sources.size) ko(`bibliothèque : ${biblio.entrees.length} entrées, source : ${sources.size} (régénérer : node scripts/molecules/generer.mjs)`);
const ids = new Set();
for (const e of biblio.entrees) {
  if (ids.has(e.id)) ko(`${e.id} : identifiant en double`); ids.add(e.id);
  let mS, mM;
  try { mS = Molecule.fromSmiles(e.smiles); } catch (x) { ko(`${e.id} : SMILES illisible (${x.message})`); continue; }
  if (!mS.getAllAtoms()) { ko(`${e.id} : SMILES vide`); continue; }
  try { mM = Molecule.fromMolfile(e.molfile); } catch (x) { ko(`${e.id} : molfile illisible (${x.message})`); continue; }
  const f = mS.getMolecularFormula().formula;
  if (f !== e.formule) { ko(`${e.id} (${e.nom}) : formule ${f} ≠ attendue ${e.formule}`); continue; }
  if (mM.getMolecularFormula().formula !== f) { ko(`${e.id} : formule du dessin ${mM.getMolecularFormula().formula} ≠ ${f}`); continue; }
  // toute la stéréo dessinée doit être DÉFINIE (aucun centre « inconnu » : un coin manquant perdrait D/L, α/β…)
  const inconnus = (x) => { const y = x.getCompactCopy(); y.removeExplicitHydrogens(); y.ensureHelperArrays(Molecule.cHelperParities); let n = 0; for (let a = 0; a < y.getAtoms(); a++) if (y.getAtomicNo(a) === 6 && y.isAtomStereoCenter(a) && y.getAtomParity(a) === Molecule.cAtomParityUnknown) n++; return n; }; // le P d'un phosphate n'est pas un vrai centre (O équivalents par résonance)
  if (inconnus(mM) || inconnus(mS)) { ko(`${e.id} (${e.nom}) : ${inconnus(mM)} centre(s) stéréo sans configuration dans le dessin, ${inconnus(mS)} dans le SMILES`); continue; }
  if (id(mS) !== id(mM)) { ko(`${e.id} (${e.nom}) : le dessin de référence n'est pas la même molécule que le SMILES (stéréo ?)`); continue; }
  const src = sources.get(e.id);
  if (!src) { ko(`${e.id} : absent de la source`); continue; }
  if (src.formule !== e.formule || src.nom !== e.nom) { ko(`${e.id} : JSON pas à jour (régénérer)`); continue; }
  if (src.cycles) {
    mS.ensureHelperArrays(Molecule.cHelperRings);
    const n = mS.getRingSet().getSize();
    if (n !== src.cycles) { ko(`${e.id} (${e.nom}) : ${n} cycles, attendu ${src.cycles} (connectivité ?)`); continue; }
  }
  if (src.cip) {
    const n = compterCIP(OCL, mS);
    if ((src.cip.R || 0) !== n.R || (src.cip.S || 0) !== n.S) { ko(`${e.id} (${e.nom}) : stéréo ${n.R} R / ${n.S} S, attendu ${src.cip.R || 0} R / ${src.cip.S || 0} S`); continue; }
  }
  if (src.ez) {
    const n = compterEZ(OCL, mS);
    if ((src.ez.E || 0) !== n.E || (src.ez.Z || 0) !== n.Z) { ko(`${e.id} (${e.nom}) : doubles liaisons ${n.E} E / ${n.Z} Z, attendu ${src.ez.E || 0} E / ${src.ez.Z || 0} Z`); continue; }
  }
  ok++;
}

// contrôles indépendants (SMILES connus, écrits à part de la bibliothèque)
const par = (k) => biblio.entrees.find((e) => e.id === k);
const memeQue = (k, smiles, t = CanonizerUtil.NORMAL) => id(Molecule.fromSmiles(par(k).smiles), t) === id(Molecule.fromSmiles(smiles), t);
const CONNUS = [
  ['glucose-b', 'OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O', 'β-D-glucopyranose'],
  ['glucose-a', 'OC[C@H]1O[C@H](O)[C@H](O)[C@@H](O)[C@@H]1O', 'α-D-glucopyranose'],
  ['glucose-lin', 'OC[C@@H](O)[C@@H](O)[C@H](O)[C@@H](O)C=O', 'D-glucose (chaîne ouverte)'],
  ['ala', 'C[C@H](N)C(=O)O', 'L-alanine'],
];
for (const [k, s, nom] of CONNUS) { if (memeQue(k, s)) ok++; else ko(`${k} n'est pas ${nom} (SMILES connu)`); }
if (!memeQue('glucose-a', 'OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O')) ok++; else ko('α et β-glucose confondus');
if (!memeQue('ala', 'C[C@@H](N)C(=O)O')) ok++; else ko('L-alanine = D-alanine en stéréo stricte ?!');
if (memeQue('ala', 'C[C@@H](N)C(=O)O', CanonizerUtil.NOSTEREO)) ok++; else ko('D- et L-alanine différentes en constitution ?!');

// recherche (même code que l'app) : synonyme
const { rechercher } = await import('../../src/medrevise/molecule/recherche.js');
const r = rechercher(biblio.entrees, 'dextrose');
if (r.length && r[0].id.startsWith('glucose')) ok++; else ko(`recherche « dextrose » → ${r.slice(0, 3).map((x) => x.id).join(', ') || 'rien'}`);
const r2 = rechercher(biblio.entrees, 'alanine');
if (r2.length && r2[0].id === 'ala') ok++; else ko(`recherche « alanine » → ${r2.slice(0, 3).map((x) => x.id).join(', ')}`);
const r3 = rechercher(biblio.entrees, 'glucose haworth β');
if (r3.length && r3[0].id === 'glucose-b') ok++; else ko(`recherche « glucose haworth β » → ${r3.slice(0, 3).map((x) => x.id).join(', ')}`);

const parCat = {};
biblio.entrees.forEach((e) => { parCat[e.categorie] = (parCat[e.categorie] || 0) + 1; });
console.log('\nEntrées par catégorie :', JSON.stringify(parCat), '— total', biblio.entrees.length);
console.log(echecs ? `\n${echecs} échec(s), ${ok} contrôles verts` : `\nTout est vert : ${ok} contrôles.`);
process.exit(echecs ? 1 : 0);
