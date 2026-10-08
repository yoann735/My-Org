// Gabarits de dessin des oses (08/10, docs/compte-rendu-flashcards-molecules.md) — OUTIL DE GÉNÉRATION,
// jamais chargé par l'app. Produit des molécules OpenChemLib dont le dessin 2D est une projection de
// Fischer ou de Haworth ET dont la stéréochimie est juste :
//   - Fischer : chaîne verticale, substituants horizontaux en coins pleins (vers le lecteur), la
//     convention même de la projection — OpenChemLib en déduit les R/S ;
//   - Haworth : on construit le MODÈLE 3D réel (cycle dans un plan horizontal, substituants « haut »
//     au-dessus, « bas » au-dessous), OpenChemLib calcule les parités en 3D, puis on pose le dessin 2D
//     (la perspective de Haworth) et on lui demande les coins qui expriment ces parités.
// Règles des oses (validées par le test sur α/β-D-glucopyranose, SMILES connus) :
//   Fischer « à droite » → Haworth « en bas » ; série D : CH2OH terminal en haut ;
//   α = OH anomérique du même côté (Fischer) que l'O de l'atome de référence → en bas pour un D.

export function creerGabarits(OCL) {
  const { Molecule } = OCL;
  const Z = { H: 1, C: 6, N: 7, O: 8, P: 15, S: 16 };
  const TYPE = { S: Molecule.cBondTypeSingle, D: Molecule.cBondTypeDouble, U: Molecule.cBondTypeUp, W: Molecule.cBondTypeDown };

  function plan() {
    const m = new Molecule(0, 0);
    const p3 = [];
    // le numéro de mappage suit l'atome même quand OpenChemLib range les H explicites en fin de liste
    const at = (el, X, Y, x3 = X, y3 = Y, z3 = 0) => { const i = m.addAtom(Z[el]); m.setAtomX(i, X); m.setAtomY(i, -Y); p3.push([x3, y3, z3, X, Y]); m.setAtomMapNo(i, p3.length, false); return i; };
    const li = (a, b, t = 'S') => { const k = m.addBond(a, b); m.setBondType(k, TYPE[t]); return k; };
    return { m, p3, at, li };
  }

  /* ---------------- FISCHER ----------------
     haut : 'CHO' (aldose) ou 'CH2OH' (cétose : C1) ; centres : liste de C2… de haut en bas, chacun
     'R' (OH à droite) | 'L' (à gauche) | 'H2' (CH2, désoxy) | 'CO' (cétone) ; bas : CH2OH terminal. */
  function fischer({ haut = 'CHO', centres, phosphate = null }) {
    const { m, at, li } = plan();
    let y = 0;
    let prec;
    if (haut === 'CHO') { prec = at('C', 0, y); const o = at('O', 0.87, y + 0.5); li(prec, o, 'D'); const h = at('H', -0.87, y + 0.5); li(prec, h); }
    else { prec = at('C', 0, y); const o = at('O', 0, y + 1); li(prec, o); }
    for (const cfg of centres) {
      y -= 1;
      const c = at('C', 0, y); li(prec, c);
      if (cfg === 'CO') { const o = at('O', 1, y); li(c, o, 'D'); }
      else if (cfg === 'H2') { const h1 = at('H', 1, y), h2 = at('H', -1, y); li(c, h1); li(c, h2); }
      else {
        const xo = cfg === 'R' ? 1 : -1;
        const o = at('O', xo, y), h = at('H', -xo, y);
        li(c, o, 'U'); li(c, h, 'U'); // horizontaux = vers le lecteur (projection de Fischer)
      }
      prec = c;
    }
    y -= 1;
    const cn = at('C', 0, y); li(prec, cn);
    const on = at('O', 0, y - 1); li(cn, on);
    if (phosphate) ajouterPhosphate(m, at, li, on, 0, y - 1, 'bas');
    return nettoyer(m);
  }

  function ajouterPhosphate(m, at, li, o, X, Y, sens = 'bas') {
    const dy = sens === 'bas' ? -1 : 1;
    const p = at('P', X, Y + dy); li(o, p);
    const o1 = at('O', X + 0.9, Y + dy), o2 = at('O', X - 0.9, Y + dy), o3 = at('O', X, Y + 2 * dy);
    li(p, o1, 'D'); li(p, o2); li(p, o3);
    return p;
  }

  /* ---------------- HAWORTH ----------------
     Une unité = un cycle + ses substituants. Position (dx, dy) du dessin, et hauteur 3D du plan. */
  const CYCLES = {
    // ordre du cycle (sens horaire vu de dessus), positions papier [X, Y] et profondeur z (+1 = devant)
    // cycle large et profond, substituants courts : les étiquettes ne se chevauchent pas
    pyranose: { atomes: ['O', 'C', 'C', 'C', 'C', 'C'], noms: ['O5', 'C1', 'C2', 'C3', 'C4', 'C5'],
      pos: [[2.3, 0.9, -1], [3.4, 0, 0], [2.3, -0.9, 1], [0.9, -0.9, 1], [-0.2, 0, 0], [0.9, 0.9, -1]] },
    furanose: { atomes: ['O', 'C', 'C', 'C', 'C'], noms: ['O4', 'C1', 'C2', 'C3', 'C4'],
      pos: [[1.3, 0.95, -1], [2.7, 0, 0], [2.0, -0.95, 1], [0.6, -0.95, 1], [-0.1, 0, 0]] },
  };
  const LONG = 0.75, LONG_H = 0.55;

  /** unités : [{ cycle, noms?: renommage des positions, subs: { pos: [haut, bas] }, dx, dy, h3 }]
      groupes : 'OH' | 'H' | 'CH2OH' | 'CH3' | { lien: 'id' } (O partagé) | 'O-' etc.
      liens : [{ de: [unité, pos, 'haut'|'bas'], vers: [unité, pos, 'haut'|'bas'], id }] */
  function haworth(unites, liens = []) {
    const { m, p3, at, li } = plan();
    const reperes = []; // par unité : { pos → index atome, sub: { 'pos:haut' → { atome, porteur } } }
    unites.forEach((u, iu) => {
      const g = CYCLES[u.cycle];
      const noms = u.noms || g.noms;
      const dx = u.dx || 0, dy = u.dy || 0, h3 = u.h3 || 0;
      const idx = {};
      const posU = g.pos.map(([X, Y, z]) => (u.retourne ? [-X, -Y, -z] : [X, Y, z]));
      posU.forEach(([X, Y, z], k) => { idx[noms[k]] = at(g.atomes[k], X + dx, Y + dy, X + dx, h3, z); });
      noms.forEach((n, k) => li(idx[n], idx[noms[(k + 1) % noms.length]]));
      const sub = {};
      for (const [pos, [haut, bas]] of Object.entries(u.subs || {})) {
        const k = noms.indexOf(pos);
        const [X, Y, z] = posU[k];
        for (const [grp, sgn, cote] of [[haut, 1, 'haut'], [bas, -1, 'bas']]) {
          if (!grp) continue;
          const L = grp === 'H' ? LONG_H : LONG;
          const P = [X + dx, Y + dy + sgn * L, X + dx, h3 + sgn * L, z];
          const c = idx[pos];
          let a;
          if (grp === 'H') { a = at('H', P[0], P[1], P[2], P[3], P[4]); li(c, a); }
          else if (grp === 'OH' || (grp && grp.lien)) { a = at('O', P[0], P[1], P[2], P[3], P[4]); li(c, a); }
          else if (grp === 'CH3') { a = at('C', P[0], P[1], P[2], P[3], P[4]); li(c, a); }
          else if (grp === 'CH2-lien') { a = at('C', P[0], P[1], P[2], P[3], P[4]); li(c, a); }
          else if (grp === 'CH2OH' || grp === 'CH2OP') {
            // le OH du CH2OH part vers l'EXTÉRIEUR du cycle (à gauche pour un carbone de gauche)
            const centre = posU.reduce((t, p) => t + p[0], 0) / posU.length;
            const sx = X < centre ? -1 : 1;
            a = at('C', P[0], P[1], P[2], P[3], P[4]); li(c, a);
            const o = at('O', P[0] + sx * 0.65, P[1] + sgn * 0.45, P[2] + sx * 0.65, P[3] + sgn * 0.45, P[4]); li(a, o);
            sub[pos + ':' + cote + ':O'] = o;
            if (grp === 'CH2OP') ajouterPhosphate(m, at, li, o, P[0] + sx * 0.65, P[1] + sgn * 0.45, sgn > 0 ? 'haut' : 'bas');
          }
          sub[pos + ':' + cote] = a;
        }
      }
      reperes[iu] = { idx, sub };
    });
    // liaisons osidiques : l'O de « de » est relié au carbone porteur de « vers » (dont l'OH n'est pas créé)
    for (const l of liens) {
      const o = reperes[l.de[0]].sub[l.de[1] + ':' + l.de[2]];
      const cible = l.vers[1] === 'C6' ? reperes[l.vers[0]].sub['C5:haut'] : reperes[l.vers[0]].idx[l.vers[1]];
      li(o, cible);
    }
    return finaliser3D(m, p3);
  }

  /** parités calculées sur le modèle 3D, puis exprimées par des coins sur le dessin 2D.
      Chaque atome retrouve ses coordonnées par son numéro de mappage (pas par son index). */
  function finaliser3D(m, p3) {
    const k = (a) => m.getAtomMapNo(a) - 1;
    for (let a = 0; a < m.getAllAtoms(); a++) { const c = p3[k(a)]; m.setAtomX(a, c[0]); m.setAtomY(a, -c[1]); m.setAtomZ(a, -c[2]); } // repère OpenChemLib : y vers le bas → profondeur inversée
    m.ensureHelperArrays(Molecule.cHelperParities);
    const parites = new Map();
    for (let a = 0; a < m.getAllAtoms(); a++) parites.set(m.getAtomMapNo(a), m.getAtomParity(a));
    for (let a = 0; a < m.getAllAtoms(); a++) { const c = p3[k(a)]; m.setAtomX(a, c[3]); m.setAtomY(a, -c[4]); m.setAtomZ(a, 0); }
    for (let a = 0; a < m.getAllAtoms(); a++) m.setAtomParity(a, parites.get(m.getAtomMapNo(a)), false);
    m.setParitiesValid(0);
    m.setStereoBondsFromParity();
    return nettoyer(m);
  }

  function nettoyer(m) { for (let a = 0; a < m.getAllAtoms(); a++) m.setAtomMapNo(a, 0, false); return m; }

  return { fischer, haworth, ajouterPhosphate, plan };
}
