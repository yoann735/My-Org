// Compteur de vues par carte (07/11, docs/compte-rendu-compteur-vues-et-zoom-image.md) : calcul, tranches, tri, filtre.
import { describe, it, expect } from 'vitest';
import { estVue, compterVues, vuesDe, trancheDe, dansTranches, TRANCHES_VUES } from '../../src/medrevise/lib/vuesCartes.js';
import { filtrer, grouper, idsAffiches, appliquerTri, filtresValides, filtresActifs, FILTRES_VIDES, ordreSelection } from '../../src/medrevise/apprentissageLibre/tableauBord.js';

const e = (id, card, rating, details = {}) => ({ id, card_id: card, rating, details });

describe('définition d’une vue', () => {
  it('une notation aux 4 boutons (rating 1..4) compte, répétition de séance comprise', () => {
    expect([1, 2, 3, 4].map((r) => estVue(e('x', 'a', r)))).toEqual([true, true, true, true]);
    expect(estVue(e('x', 'a', 3, { relearn: true }))).toBe(true);
  });
  it('« Passer en révision » (rating null), une note hors 1..4, une entrée sans carte : ne comptent pas', () => {
    expect(estVue(e('x', 'a', null, { evenement: 'passage_revision' }))).toBe(false);
    expect(estVue(e('x', 'a', 0))).toBe(false);
    expect(estVue(e('x', 'a', 5))).toBe(false);
    expect(estVue(e('x', null, 3))).toBe(false);
    expect(estVue(null)).toBe(false);
  });
});

describe('calcul', () => {
  it('une passe, puis incrémental ; un même id n’est compté qu’une fois', () => {
    const vus = new Set();
    const c = compterVues([e('1', 'a', 3), e('2', 'a', 1), e('3', 'b', 4), e('4', 'b', null)], new Map(), vus);
    expect([vuesDe(c, 'a'), vuesDe(c, 'b'), vuesDe(c, 'z')]).toEqual([2, 1, 0]);
    compterVues([e('2', 'a', 1), e('5', 'a', 2)], c, vus); // '2' déjà vu (reçu deux fois du cloud)
    expect(vuesDe(c, 'a')).toBe(3);
  });
  it('tranches 0 · 1–2 · 3–5 · 6–10 · >10', () => {
    expect([0, 1, 2, 3, 5, 6, 10, 11, 40].map(trancheDe)).toEqual(['0', '1-2', '1-2', '3-5', '3-5', '6-10', '6-10', '10+', '10+']);
    expect(TRANCHES_VUES.map((t) => t.libelle)).toEqual(['0', '1–2', '3–5', '6–10', '>10']);
    const c = new Map([['a', 4]]);
    expect(dansTranches(c, 'a', [])).toBe(true);
    expect(dansTranches(c, 'a', ['3-5'])).toBe(true);
    expect(dansTranches(c, 'a', ['0', '10+'])).toBe(false);
    expect(dansTranches(c, 'b', ['0'])).toBe(true);
  });
});

const db = {
  sources: [{ id: 's1', nom: 'Bloc' }],
  matieres: [{ id: 'm1', nom: 'Physio', sourceId: 's1' }],
  fiches: [{ id: 'f1', titre: 'Rein', matiereId: 'm1', ordre: 1 }, { id: 'f2', titre: 'Cœur', matiereId: 'm1', ordre: 2 }],
  questions: ['a', 'b', 'c', 'd'].map((id, i) => ({ id, type: 'flashcard', ficheId: i < 3 ? 'f1' : 'f2', recto: id, verso: '', historique: [] })),
};
const vues = new Map([['a', 7], ['b', 0], ['c', 2], ['d', 12]]);

describe('filtre et tri dans le panneau Apprendre', () => {
  it('filtre par tranches (plusieurs), combinable avec un filtre de cours', () => {
    expect(filtrer(db, { ...FILTRES_VIDES, vues: ['0', '1-2'] }, vues).map((q) => q.id)).toEqual(['b', 'c']);
    expect(filtrer(db, { ...FILTRES_VIDES, vues: ['6-10', '10+'] }, vues).map((q) => q.id)).toEqual(['a', 'd']);
    expect(filtrer(db, { ...FILTRES_VIDES, vues: ['6-10', '10+'], coursInclus: ['f1'] }, vues).map((q) => q.id)).toEqual(['a']);
    expect(filtrer(db, FILTRES_VIDES, vues).length).toBe(4);
  });
  it('les tranches sont mémorisées proprement et comptent comme filtre actif', () => {
    expect(filtresValides({ vues: ['0', 'n’importe', '10+', 3] }).vues).toEqual(['0', '10+']);
    expect(filtresValides({}).vues).toEqual([]);
    expect(filtresActifs({ ...FILTRES_VIDES, vues: ['0'] })).toBe(true);
  });
  it('tris « Moins vues → plus vues » et « Plus vues → moins vues » dans chaque cours, stables', () => {
    const g = grouper(db, filtrer(db, FILTRES_VIDES, vues));
    expect(idsAffiches(appliquerTri(g, 'vues-asc', { vues }))).toEqual(['b', 'c', 'a', 'd']);
    expect(idsAffiches(appliquerTri(g, 'vues-desc', { vues }))).toEqual(['a', 'c', 'b', 'd']);
    expect(idsAffiches(appliquerTri(g, '', { vues }))).toEqual(['a', 'b', 'c', 'd']);
    expect(idsAffiches(appliquerTri(g, 'passages', { passages: { a: 3 } }))).toEqual(['b', 'c', 'a', 'd']);
  });
  it('« Lancer » la sélection suit le même tri', () => {
    expect(ordreSelection(db, ['a', 'b', 'c'], null, (g) => appliquerTri(g, 'vues-desc', { vues }))).toEqual(['a', 'c', 'b']);
    expect(ordreSelection(db, ['a', 'b', 'c'], null, { a: 2 })).toEqual(['b', 'c', 'a']); // ancien appel (passages)
  });
});
