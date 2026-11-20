// Copier / coller / dupliquer les objets (20/11, src/medrevise/lib/copieObjets.js).
import { describe, it, expect } from 'vitest';
import { copiable, copies, cadreGroupe, decalage, translater, memoriser, presseObjets, oublier, htmlJeton, jetonDe, texteObjets } from '../../src/medrevise/lib/copieObjets.js';

let n = 0; const genId = (p) => `${p}x${++n}`;
const T = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const boite = { id: 'b1', ficheId: 'c1', page: 2, kind: 'libre', type: 'boite', x: 0.1, y: 0.2, width: 0.3, height: 0.1, couleur: 'bleu', taille1000: 20, content: T('Rein'), updatedAt: 'x',
  formeId: 'f9', fleche: true, ancre: { x: 0.5, y: 0.5 }, surlignageId: 'h1', fleches: [{ id: 'fl1', x: 0.7, y: 0.7, boiteCible: 'b2', points: [{ x: 0.6, y: 0.6 }] }] };

describe('ce qui se copie', () => {
  it('objets oui ; pages, blocs de remplacement non', () => {
    for (const k of ['libre', 'texte', 'forme', 'image', 'trait', 'question']) expect(copiable({ kind: k })).toBe(true);
    expect(copiable({ kind: 'page' })).toBe(false);
    expect(copiable({ type: 'bloc' })).toBe(false);
    expect(copiable(null)).toBe(false);
  });
});

describe('une copie = un nouvel objet, même contenu, même style, sans lien', () => {
  it('nouvel id, même contenu et style, liens retirés, décalage appliqué', () => {
    const [c] = copies([boite], { ficheId: 'c1', page: 2, dx: 0.016, dy: 0.028, genId, maintenant: 'T' });
    expect(c.id).not.toBe('b1');
    expect(c.content).toEqual(boite.content);
    expect(c.content).not.toBe(boite.content); // copie profonde
    expect([c.couleur, c.taille1000, c.width, c.height]).toEqual(['bleu', 20, 0.3, 0.1]);
    expect([c.x, c.y]).toEqual([0.116, 0.228]);
    expect(c.formeId).toBeUndefined(); expect(c.surlignageId).toBeUndefined(); expect(c.updatedAt).toBeUndefined();
    expect(c.createdAt).toBe('T');
    expect(c.ancre).toEqual({ x: 0.516, y: 0.528 });
    expect(c.fleches[0].boiteCible).toBeUndefined();
    expect(c.fleches[0].id).not.toBe('fl1');
    expect(c.fleches[0].points).toEqual([{ x: 0.616, y: 0.628 }]);
  });
  it('collage au pointeur : le coin haut-gauche du groupe va au point ; autre page, autre document', () => {
    const t = { id: 't1', ficheId: 'c1', page: 2, kind: 'trait', points: [[0.2, 0.3], [0.4, 0.5]] };
    const cs = copies([boite, t], { ficheId: 'c2', page: 'pgX', point: { x: 0.5, y: 0.5 }, genId });
    expect(cs.map((c) => [c.ficheId, c.page])).toEqual([['c2', 'pgX'], ['c2', 'pgX']]);
    const g = cadreGroupe(cs);
    expect(g.x).toBeCloseTo(0.5, 5); expect(g.y).toBeCloseTo(0.5, 5);
    expect(cs[1].points[0][0]).toBeCloseTo(0.6, 5);
  });
  it('reste dans la page (bord droit / bas)', () => {
    const [c] = copies([{ ...boite, x: 0.69, y: 0.89 }], { ficheId: 'c1', page: 2, dx: 0.1, dy: 0.1, genId });
    expect(c.x).toBeCloseTo(0.7, 5); expect(c.y).toBeCloseTo(0.9, 5);
  });
  it('images : passent au-dessus des autres', () => {
    const cs = copies([{ id: 'i', kind: 'image', x: 0, y: 0, width: 0.1, height: 0.1, z: 1, blobId: 'B' }], { ficheId: 'c', page: 1, genId, zMax: 4 });
    expect(cs[0].z).toBe(5); expect(cs[0].blobId).toBe('B');
  });
  it('décalage de 16 px d’une page de 1000 px (diapo 16:9 : y plus grand)', () => {
    expect(decalage(960, 540)).toEqual({ dx: 0.016, dy: 0.016 * (960 / 540) });
    expect(translater({ kind: 'question', x: 0.5, y: 0.5 }, 0.1, 0)).toMatchObject({ x: 0.6, y: 0.5 });
  });
});

describe('presse-papiers', () => {
  it('jeton : écrit dans le HTML, relu au collage ; texte des objets', () => {
    const p = memoriser([boite], texteObjets([boite]));
    expect(presseObjets()).toBe(p);
    expect(p.texte).toBe('Rein');
    expect(jetonDe(htmlJeton(p))).toBe(p.jeton);
    expect(jetonDe('<p>autre chose</p>')).toBeNull();
    oublier(); expect(presseObjets()).toBeNull();
  });
});
