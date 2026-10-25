// Choix des pages d'un export (25/10, src/medrevise/pdf/choixPages.js).
import { describe, it, expect } from 'vitest';
import { lirePagesPrecises, pagesDuChoix, resumePages, suffixePages } from '../../src/medrevise/pdf/choixPages.js';

describe('choix des pages', () => {
  it('pages précises « 1-3, 7, 10-12 »', () => {
    expect(lirePagesPrecises('1-3, 7, 10-12', 26).pages).toEqual([0, 1, 2, 6, 9, 10, 11]);
    expect(lirePagesPrecises('2-4, 7', 26).pages).toEqual([1, 2, 3, 6]);
    expect(lirePagesPrecises('7, 2-4; 3', 26).pages).toEqual([1, 2, 3, 6]);
    expect(lirePagesPrecises('5–8', 26).pages).toEqual([4, 5, 6, 7]);
  });
  it('validation', () => {
    expect(lirePagesPrecises('', 26).erreur).toMatch(/Indique/);
    expect(lirePagesPrecises('4-2', 26).erreur).toMatch(/envers/);
    expect(lirePagesPrecises('30', 26).erreur).toMatch(/n’existe pas/);
    expect(lirePagesPrecises('a', 26).erreur).toMatch(/n’est pas/);
    expect(lirePagesPrecises('0', 26).erreur).toMatch(/commencent à 1/);
  });
  it('modes', () => {
    expect(pagesDuChoix({ mode: 'toutes' }, 4).pages).toEqual([0, 1, 2, 3]);
    expect(pagesDuChoix({ mode: 'courante' }, 26, 9).pages).toEqual([8]);
    expect(pagesDuChoix({ mode: 'plage', de: '3', a: '5' }, 26).pages).toEqual([2, 3, 4]);
    expect(pagesDuChoix({ mode: 'plage', de: '', a: '5' }, 26).erreur).toBeTruthy();
  });
  it('résumé et suffixe', () => {
    expect(resumePages([1, 2, 3, 6])).toBe('2-4, 7');
    expect(suffixePages([1, 2, 3, 6], 26)).toBe('-p2-4_7');
    expect(suffixePages([0, 1], 2)).toBe('');
  });
});
