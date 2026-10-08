// Construction d'une entrée de la bibliothèque (partagée par generer.mjs et test-bibliotheque.mjs).
import { creerGabarits } from './gabarits.mjs';
export function construire(OCL, e) {
  const { Molecule } = OCL;
  const G = creerGabarits(OCL);
  let m;
  if (e.smiles) { m = Molecule.fromSmiles(e.smiles); m.inventCoordinates(); }
  else if (e.dessin.type === 'fischer') m = G.fischer(e.dessin);
  else m = G.haworth(e.dessin.unites, e.dessin.liens || []);
  return m;
}
/** copie « lourde » (H explicites retirés, stéréo conservée) — base de toute comparaison */
export function lourde(OCL, m) { const x = m.getCompactCopy(); x.removeExplicitHydrogens(); x.ensureHelperArrays(OCL.Molecule.cHelperCIP); return x; }
export function compterCIP(OCL, m) {
  const x = lourde(OCL, m);
  const n = { R: 0, S: 0 };
  for (let a = 0; a < x.getAtoms(); a++) { const p = x.getAtomCIPParity(a); if (p === 1) n.R++; else if (p === 2) n.S++; }
  return n;
}
export function compterEZ(OCL, m) {
  const x = lourde(OCL, m);
  const n = { E: 0, Z: 0 };
  for (let b = 0; b < x.getBonds(); b++) { const p = x.getBondCIPParity ? x.getBondCIPParity(b) : 0; if (p === 1) n.E++; else if (p === 2) n.Z++; }
  return n;
}
