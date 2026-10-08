/* ============================================================
   MedRevise — CHIMIE des cartes Molécule (08/10, docs/compte-rendu-flashcards-molecules.md).

   OpenChemLib JS (BSD-3) — chargé À LA DEMANDE (import dynamique) : l'app ne paie rien tant
   qu'aucune carte Molécule n'est ouverte. Tout tourne dans le navigateur, aucun appel réseau.

   COMPARAISON (une aide, jamais un juge du score) :
   - on compare des copies « lourdes » (H explicites retirés, stéréo conservée), charges
     neutralisées (canonizeCharge : COO⁻/NH3⁺ ≡ COOH/NH2 — l'état d'ionisation est signalé, pas
     compté comme une erreur) ;
   - « constitution » (défaut) : empreinte canonique SANS stéréo (CanonizerUtil.NOSTEREO) ;
   - « stéréo stricte » : empreinte canonique AVEC stéréo (D/L, R/S, cis/trans) ;
   - différences : plus grande sous-structure commune (MCS) ; tout atome / liaison hors de la
     MCS est « en trop » (dans mon dessin) ou « manquant » (dans la référence) ; en stéréo
     stricte, les centres (R/S) et doubles liaisons (E/Z) qui diffèrent ; formules brutes.
   Fonctions pures (OCL passé en paramètre) : testées sous Node (scripts/molecules/test-comparaison.mjs).
   ============================================================ */

let promesse = null;
/** OpenChemLib, chargé une fois (import dynamique : un fichier à part dans le build) */
export function chargerOCL() {
  if (!promesse) promesse = import('openchemlib').then((m) => m.default || m);
  return promesse;
}

/** molécule d'une carte / d'une entrée : molfile (le dessin) sinon SMILES */
export function lire(OCL, { molfile = null, smiles = null } = {}) {
  const { Molecule } = OCL;
  if (molfile) { try { const m = Molecule.fromMolfile(molfile); if (m.getAllAtoms()) return m; } catch (e) { /* SMILES ensuite */ } }
  if (smiles) { const m = Molecule.fromSmiles(smiles); m.inventCoordinates(); return m; }
  return new Molecule(0, 0);
}

/** copie de travail : sans H explicites, stéréo conservée, coordonnées gardées */
export function lourde(OCL, m) {
  const x = m.getCompactCopy();
  x.removeExplicitHydrogens();
  x.ensureHelperArrays(OCL.Molecule.cHelperCIP);
  return x;
}

function neutre(OCL, m) {
  const x = m.getCompactCopy();
  try { x.canonizeCharge(true); } catch (e) { /* charges non équilibrables : telles quelles */ }
  x.ensureHelperArrays(OCL.Molecule.cHelperCIP);
  return x;
}

const formule = (m) => { try { return m.getAllAtoms() ? m.getMolecularFormula().formula : ''; } catch (e) { return ''; } };
const empreinte = (OCL, m, stereo) => OCL.CanonizerUtil.getIDCode(m, stereo ? OCL.CanonizerUtil.NORMAL : OCL.CanonizerUtil.NOSTEREO);

/** SMILES isomérique + molfile + formule d'une molécule dessinée (pour l'enregistrement) */
export function exporter(OCL, m) {
  const l = lourde(OCL, m);
  return { smiles: l.getAllAtoms() ? l.toIsomericSmiles() : '', molfile: m.getAllAtoms() ? m.toMolfile() : '', formule: formule(l), atomes: l.getAllAtoms() };
}

/** correspondance (atome de `frag` → atome de `cible`), stéréo ignorée ; null si absent */
function placer(OCL, frag, cible) {
  const f = frag.getCompactCopy();
  f.stripStereoInformation();
  f.setFragment(true);
  const ss = new OCL.SSSearcher();
  ss.setMol(f, cible);
  const n = ss.findFragmentInMolecule({ countMode: 'firstMatch' });
  return n ? ss.getMatchList()[0] : null;
}

function differencesStructure(OCL, u, r) {
  const res = { atomesEnTrop: [], atomesManquants: [], liaisonsEnTrop: [], liaisonsManquantes: [] };
  const tous = (m) => [...Array(m.getAllAtoms()).keys()];
  const toutesL = (m) => [...Array(m.getAllBonds()).keys()];
  if (!u.getAllAtoms()) { res.atomesManquants = tous(r); res.liaisonsManquantes = toutesL(r); return res; }
  if (!r.getAllAtoms()) { res.atomesEnTrop = tous(u); res.liaisonsEnTrop = toutesL(u); return res; }
  const [grand, petit] = u.getAllBonds() >= r.getAllBonds() ? [u, r] : [r, u];
  let mcs = null;
  try { const c = new OCL.MCS(); c.set(grand, petit); mcs = c.getMCS(); } catch (e) { mcs = null; }
  const mu = mcs && mcs.getAllAtoms() ? placer(OCL, mcs, u) : null;
  const mr = mcs && mcs.getAllAtoms() ? placer(OCL, mcs, r) : null;
  if (!mu || !mr) { res.atomesEnTrop = tous(u); res.atomesManquants = tous(r); res.liaisonsEnTrop = toutesL(u); res.liaisonsManquantes = toutesL(r); return res; }
  const dansU = new Set(mu), dansR = new Set(mr);
  res.atomesEnTrop = tous(u).filter((a) => !dansU.has(a));
  res.atomesManquants = tous(r).filter((a) => !dansR.has(a));
  // une liaison est commune si ses deux atomes correspondent à une liaison de la MCS
  const liaisonsMcs = (m, map) => {
    const s = new Set();
    for (let b = 0; b < mcs.getAllBonds(); b++) {
      const a1 = map[mcs.getBondAtom(0, b)], a2 = map[mcs.getBondAtom(1, b)];
      const k = m.getBond(a1, a2);
      if (k >= 0) s.add(k);
    }
    return s;
  };
  const lu = liaisonsMcs(u, mu), lr = liaisonsMcs(r, mr);
  res.liaisonsEnTrop = toutesL(u).filter((b) => !lu.has(b));
  res.liaisonsManquantes = toutesL(r).filter((b) => !lr.has(b));
  return res;
}

function differencesStereo(OCL, u, r) {
  const map = placer(OCL, r, u); // atome de r → atome de u
  if (!map) return { centresU: [], centresR: [], liaisonsU: [], liaisonsR: [] };
  const centresU = [], centresR = [];
  for (let a = 0; a < r.getAllAtoms(); a++) {
    const pr = r.getAtomCIPParity(a), pu = u.getAtomCIPParity(map[a]);
    if ((pr === 1 || pr === 2 || pu === 1 || pu === 2) && pr !== pu) { centresR.push(a); centresU.push(map[a]); }
  }
  const liaisonsU = [], liaisonsR = [];
  for (let b = 0; b < r.getAllBonds(); b++) {
    const pr = r.getBondCIPParity(b);
    const k = u.getBond(map[r.getBondAtom(0, b)], map[r.getBondAtom(1, b)]);
    if (k < 0) continue;
    const pu = u.getBondCIPParity(k);
    if ((pr === 1 || pr === 2 || pu === 1 || pu === 2) && pr !== pu) { liaisonsR.push(b); liaisonsU.push(k); }
  }
  return { centresU, centresR, liaisonsU, liaisonsR };
}

const LIBELLE_CIP = { 1: 'R', 2: 'S' };
/**
 * Compare MON dessin à la référence.
 * @returns {{ identique, ionisation, mode, formuleU, formuleR, structure, stereo, vide, u, r, detailStereo }}
 *   u, r : copies lourdes (index des atomes / liaisons utilisés par les différences et le rendu)
 */
export function comparer(OCL, molU, molR, mode = 'constitution') {
  const u = lourde(OCL, molU), r = lourde(OCL, molR);
  const nu = neutre(OCL, u), nr = neutre(OCL, r);
  const strict = mode === 'stereo';
  const memeConstitution = !!u.getAllAtoms() && empreinte(OCL, nu, false) === empreinte(OCL, nr, false);
  const memeStereo = memeConstitution && empreinte(OCL, nu, true) === empreinte(OCL, nr, true);
  const identique = strict ? memeStereo : memeConstitution;
  const ionisation = memeConstitution && empreinte(OCL, u, false) !== empreinte(OCL, r, false);
  const res = {
    identique, ionisation, mode, vide: !u.getAllAtoms(),
    formuleU: formule(u), formuleR: formule(r), u, r,
    structure: { atomesEnTrop: [], atomesManquants: [], liaisonsEnTrop: [], liaisonsManquantes: [] },
    stereo: { centresU: [], centresR: [], liaisonsU: [], liaisonsR: [] },
    stereoDiffere: memeConstitution && !memeStereo,
    detailStereo: [],
  };
  if (!memeConstitution) res.structure = differencesStructure(OCL, nu, nr);
  else if (!memeStereo && strict) { // en « constitution », la stéréo n'est qu'une mention, jamais surlignée
    res.stereo = differencesStereo(OCL, u, r);
    res.detailStereo = res.stereo.centresR.map((a, i) => ({ atome: r.getAtomLabel(a), ref: LIBELLE_CIP[r.getAtomCIPParity(a)] || '?', moi: LIBELLE_CIP[u.getAtomCIPParity(res.stereo.centresU[i])] || 'non défini' }));
  }
  return res;
}

/* ---------------- rendu ---------------- */
let compteur = 0;
/** SVG (chaîne) d'une molécule, atomes / liaisons surlignés en option */
export function svg(OCL, m, { largeur = 320, hauteur = 220, atomes = [], liaisons = [], couleur = '#e5484d', recadrer = true } = {}) {
  const id = 'mol' + (++compteur).toString(36);
  if (!m || !m.getAllAtoms()) return '';
  let s = m.toSVG(largeur, hauteur, id, { autoCrop: recadrer, autoCropMargin: 12, suppressChiralText: true, suppressCIPParity: true, suppressESR: true, factorTextSize: 1.15, strokeWidth: 1.6 });
  const a = new Set(atomes), b = new Set(liaisons);
  s = s.replace(/<circle id="([^"]+):Atom:(\d+)" class="event"([^>]*?)opacity="0"\s*\/>/g, (t, p, n, reste) => (a.has(+n) ? `<circle id="${p}:Atom:${n}" class="event surligne"${reste.replace(/r="[\d.]+"/, 'r="11"')}fill="${couleur}" fill-opacity="0.38" stroke="${couleur}" stroke-width="2" />` : t));
  s = s.replace(/<line id="([^"]+):Bond:(\d+)" class="event"([^>]*?)opacity="0"\s*\/>/g, (t, p, n, reste) => (b.has(+n) ? `<line id="${p}:Bond:${n}" class="event surligne"${reste.replace(/stroke-width="[\d.]+"/, 'stroke-width="9"')}stroke="${couleur}" stroke-opacity="0.45" />` : t));
  return s;
}
