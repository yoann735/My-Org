// Mode Apprentissage libre (11/10) — logique pure de la session et de la liste.
import { describe, it, expect } from 'vitest';
import { nouvelleSession, carteCourante, repondre, passer, finir, bilan } from '../../src/medrevise/apprentissageLibre/session.js';
import { ajouter, retirer, grouperParCours, idsDesCours } from '../../src/medrevise/apprentissageLibre/liste.js';

describe('session en rafale', () => {
  it('2 « Su » d’affilée = sue ; la carte sort de la file mais l’ordre des autres est gardé', () => {
    let s = nouvelleSession(['a', 'b', 'c']);
    expect(carteCourante(s)).toBe('a');
    s = repondre(s, true); // a : 1 Su → revient après les autres
    expect(s.file).toEqual(['b', 'c', 'a']);
    s = repondre(s, true); s = repondre(s, true); // b, c : 1 Su chacune
    expect(s.file).toEqual(['a', 'b', 'c']);
    s = repondre(s, true); // a : 2e Su → sue
    expect(s.sues).toEqual(['a']);
    expect(s.file).toEqual(['b', 'c']);
  });
  it('« Pas su » remet la suite à zéro et la carte revient plus loin', () => {
    let s = nouvelleSession(['a', 'b']);
    s = repondre(s, true); // a 1
    s = repondre(s, true); // b 1
    s = repondre(s, false); // a → 0
    expect(s.suites.a).toBe(0);
    expect(s.file).toEqual(['b', 'a']);
    s = repondre(s, true); // b sue
    s = repondre(s, true); // a 1
    expect(s.sues).toEqual(['b']);
    expect(s.file).toEqual(['a']);
    s = repondre(s, true); // a sue
    expect(s.fin).toBe(true);
    expect(bilan(s)).toEqual({ vues: 2, sues: 2, aRetravailler: 0 });
  });
  it('Skip : en fin de file, rien n’est noté', () => {
    let s = nouvelleSession(['a', 'b', 'c']);
    s = passer(s);
    expect(s.file).toEqual(['b', 'c', 'a']);
    expect(s.vues).toEqual([]);
    expect(s.suites).toEqual({});
  });
  it('Finir : bilan vues / sues / à retravailler', () => {
    let s = nouvelleSession(['a', 'b', 'c']);
    s = repondre(s, true); s = repondre(s, false); s = repondre(s, true); // a1 b0 c1
    s = repondre(s, true); // a sue
    s = finir(s);
    expect(s.fin).toBe(true);
    expect(bilan(s)).toEqual({ vues: 3, sues: 1, aRetravailler: 2 });
  });
});

describe('liste learning_set', () => {
  it('ajouter / retirer sans doublon', () => {
    expect(ajouter(['a'], ['a', 'b'])).toEqual(['a', 'b']);
    expect(retirer(['a', 'b', 'c'], ['b'])).toEqual(['a', 'c']);
  });
  it('rangée par cours (ordre de la Bibliothèque) puis cartes (ordre de la fiche)', () => {
    const db = {
      fiches: [{ id: 'f1', titre: 'Cours 1' }, { id: 'f2', titre: 'Cours 2' }],
      questions: [
        { id: 'q3', ficheId: 'f2', type: 'flashcard' }, { id: 'q1', ficheId: 'f1', type: 'flashcard' },
        { id: 'q2', ficheId: 'f1', type: 'flashcard' }, { id: 'qx', ficheId: 'f1', type: 'qcm' },
      ],
    };
    const g = grouperParCours(db, ['q2', 'q3', 'q1', 'qx', 'supprimee']);
    expect(g.map((x) => [x.fiche.id, x.cartes.map((c) => c.id)])).toEqual([['f1', ['q1', 'q2']], ['f2', ['q3']]]);
    expect(idsDesCours(g, new Set(['f2', 'f1']))).toEqual(['q1', 'q2', 'q3']);
    expect(idsDesCours(g, new Set(['f2']))).toEqual(['q3']);
  });
});
