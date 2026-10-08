// GÉNÈRE src/medrevise/molecule/bibliotheque.json depuis scripts/molecules/source.mjs —
// node scripts/molecules/generer.mjs  (puis node scripts/molecules/test-bibliotheque.mjs)
// Pour chaque entrée : SMILES isomérique (stéréo), formule brute, molfile du dessin de référence
// (Fischer / Haworth par gabarits, sinon coordonnées calculées par OpenChemLib). Rien n'est appelé
// en ligne : la bibliothèque est embarquée dans l'app.
import fs from 'fs';
import OCL from 'openchemlib';
import { entrees, CATEGORIES } from './source.mjs';
import { construire } from './chimie-commune.mjs';

const { Molecule } = OCL;
const sortie = [];
let erreurs = 0;
for (const e of entrees()) {
  const m = construire(OCL, e);
  const formule = m.getMolecularFormula().formula;
  if (formule !== e.formule) { console.log(`❌ ${e.id} : formule ${formule} ≠ ${e.formule}`); erreurs++; }
  const lourde = m.getCompactCopy(); lourde.removeExplicitHydrogens();
  const smiles = e.smiles || lourde.toIsomericSmiles();
  sortie.push({
    id: e.id, nom: e.nom, synonymes: e.synonymes, categorie: e.categorie, formule: e.formule,
    smiles, molfile: m.toMolfile(),
    dessin: e.dessin ? e.dessin.type : 'calcule', ...(e.forme ? { forme: e.forme } : {}), ...(e.bonus ? { bonus: true } : {}), ...(e.motif ? { motif: true } : {}),
  });
}
const json = { version: 1, genere: 'scripts/molecules/generer.mjs (OpenChemLib ' + (OCL.version || '9') + ')', categories: CATEGORIES, entrees: sortie };
fs.writeFileSync(new URL('../../src/medrevise/molecule/bibliotheque.json', import.meta.url), JSON.stringify(json));
console.log(`${sortie.length} entrées écrites${erreurs ? `, ${erreurs} erreur(s)` : ''}.`);
process.exit(erreurs ? 1 : 0);
