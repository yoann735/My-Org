// Modèle du tableau d'une boîte (25/10, src/medrevise/pdf/grille.js) — opérations pures.
import { describe, it, expect } from 'vitest';
import * as G from '../../src/medrevise/pdf/grille.js';

const g34 = () => ({ ...G.nouvelleGrille(3, 4), lignes: [['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i'], ['j', 'k', 'l']] });

describe('grille', () => {
  it('insère et supprime lignes / colonnes en gardant le texte', () => {
    let g = G.insererLignes(g34(), 1);
    expect(g.lignes.map((l) => l[0])).toEqual(['a', '', 'd', 'g', 'j']);
    g = G.insererColonnes(g, 0);
    expect(g.lignes[0]).toEqual(['', 'a', 'b', 'c']);
    expect(g.cols.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
    g = G.supprimerColonnes(g, 0);
    g = G.supprimerLignes(g, 1);
    expect(g.lignes).toEqual(g34().lignes);
  });
  it('fusionne (texte concaténé), décale la fusion à l’insertion, scinde', () => {
    let g = G.fusionner(g34(), { i0: 0, j0: 0, i1: 1, j1: 1 });
    expect(g.fusions).toEqual([{ i: 0, j: 0, rs: 2, cs: 2 }]);
    expect(g.lignes[0][0]).toBe('a\nb\nd\ne');
    expect(g.lignes[1][1]).toBe('');
    expect(G.cellulesAffichees(g).length).toBe(12 - 3);
    const ins = G.insererLignes(g, 1); // au milieu de la fusion : elle s'allonge
    expect(ins.fusions).toEqual([{ i: 0, j: 0, rs: 3, cs: 2 }]);
    const ins2 = G.insererLignes(g, 0); // au-dessus : elle descend
    expect(ins2.fusions).toEqual([{ i: 1, j: 0, rs: 2, cs: 2 }]);
    const sup = G.supprimerLignes(g, 0); // l'ancre part : la fusion se réduit et garde son texte
    expect(sup.fusions).toEqual([{ i: 0, j: 0, rs: 1, cs: 2 }]);
    expect(sup.lignes[0][0]).toBe('a\nb\nd\ne');
    expect(G.elargir(g, { i0: 1, j0: 1, i1: 1, j1: 2 })).toEqual({ i0: 0, j0: 0, i1: 1, j1: 2 });
    expect(G.scinder(g, { i0: 0, j0: 0, i1: 0, j1: 0 }).fusions).toBeUndefined();
  });
  it('formats, bordures, style', () => {
    let g = G.formater(g34(), { i0: 0, j0: 0, i1: 0, j1: 2 }, { fond: 'bleu-franc', gras: true });
    expect(G.formatDe(g, 0, 1)).toEqual({ fond: 'bleu-franc', gras: true });
    expect(G.formatCommun(g, { i0: 0, j0: 0, i1: 0, j1: 2 }, 'fond')).toBe('bleu-franc');
    expect(G.formatCommun(g, G.toutLeTableau(g), 'fond')).toBe(null);
    g = G.formater(g, { i0: 0, j0: 0, i1: 0, j1: 2 }, { fond: null, gras: false });
    expect(g.formats).toBeUndefined();
    expect(G.bordures(g34(), { mode: 'toutes' }).bordures).toEqual({ mode: 'toutes', couleur: null, ep: 1 });
    expect(G.style({ ...g34(), alterne: true }, 'aucun')).toMatchObject({ entete: false, alterne: false });
  });
  it('collage TSV (guillemets d’Excel) et HTML', () => {
    expect(G.lireTSV('a\tb\n"c\nd"\t"e ""x"""\n')).toEqual([['a', 'b'], ['c\nd', 'e "x"']]);
    const g = G.collerMatrice(g34(), 3, 2, [['1', '2'], ['3', '4']]);
    expect(g.lignes.length).toBe(5); expect(g.cols.length).toBe(4);
    expect(g.lignes[4][3]).toBe('4');
    expect(G.matriceCollee('', 'un mot')).toBe(null);
  });
  it('hauteur de ligne et répartition', () => {
    let g = G.hauteurLigne(g34(), 2, 40);
    expect(g.hauts).toEqual([null, null, 40, null]);
    g = G.largeurColonnes(g, [0.5, 0.25, 0.25]);
    g = G.repartir(g);
    expect(g.hauts).toBeUndefined();
    expect(g.cols).toEqual([0.3333, 0.3333, 0.3333]);
  });
});
