// (21/10) Crayon refait simple (src/medrevise/pdf/crayon.js) — docs/compte-rendu-pdfreader-reparation.md
import { describe, it, expect } from 'vitest';
import { lisser3, cheminCatmull, cheminDroit, cheminTrait, densifier, morceauxHors, arrondirPoints, EPAISSEURS_CRAYON } from '../../src/medrevise/pdf/crayon.js';

const bruit = (i) => (i % 2 ? 1 : -1) * 0.004 * (1 + 0.3 * Math.sin(i)); // tremblement de la main (déterministe)
const ligne = Array.from({ length: 40 }, (_, i) => [0.1 + i * 0.01, 0.5 + bruit(i)]);
const rugosite = (p) => p.slice(2).reduce((s, q, i) => s + Math.abs(q[1] - 2 * p[i + 1][1] + p[i][1]), 0);

describe('crayon (21/10)', () => {
  it('moyenne mobile sur 3 points : extrémités gardées, tremblement réduit', () => {
    const l = lisser3(ligne);
    expect(l).toHaveLength(ligne.length);
    expect(l[0]).toEqual(ligne[0]);
    expect(l[l.length - 1]).toEqual(ligne[ligne.length - 1]); // le bout du trait reste sous le pointeur
    expect(l[5][1]).toBeCloseTo((ligne[4][1] + ligne[5][1] + ligne[6][1]) / 3, 10);
    expect(rugosite(l)).toBeLessThan(rugosite(ligne) * 0.6);
    expect(lisser3([[0, 0], [1, 1]])).toEqual([[0, 0], [1, 1]]);
  });
  it('trois épaisseurs par mode', () => {
    expect(EPAISSEURS_CRAYON.dessin.map((e) => e.id)).toEqual(['fin', 'moyen', 'epais']);
    expect(EPAISSEURS_CRAYON.surligneur).toHaveLength(3);
  });
  it('même chemin pour l’aperçu (pixels) et le trait posé (repère 0–100)', () => {
    expect(cheminCatmull(ligne)).toMatch(/^M[\d.]+ [\d.]+ C/);
    expect(cheminCatmull([[0.5, 0.5], [1, 1]], 200, 100)).toMatch(/^M100\.000 50\.000 C/);
    expect(cheminDroit([[0, 0], [1, 1]], 100, 50)).toBe('M0.000 0.000 L100.000 50.000');
    const ancien = () => 'ANCIEN';
    expect(cheminTrait({ points: ligne }, ancien)).toBe('ANCIEN'); // trait d'avant le 20/10 : ancien tracé
    expect(cheminTrait({ points: [[0, 0], [1, 1]], rendu: 'droit' }, ancien)).toBe('M0.000 0.000 L100.000 100.000');
    expect(arrondirPoints([[0.123456789, 0.5]])).toEqual([[0.12346, 0.5]]);
  });
  it('gomme de zone : le trait est coupé en deux morceaux', () => {
    const d = densifier([[0, 0.5], [1, 0.5]], 0.01);
    expect(d.length).toBe(101);
    const morceaux = morceauxHors(d, (q) => Math.abs(q[0] - 0.5) < 0.05);
    expect(morceaux).toHaveLength(2);
    expect(morceaux[0][morceaux[0].length - 1][0]).toBeLessThan(0.46);
    expect(morceaux[1][0][0]).toBeGreaterThan(0.54);
    expect(morceauxHors(d, () => true)).toEqual([]);
  });
});
