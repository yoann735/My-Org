// (20/10 soir) Crayon v4 (src/medrevise/pdf/crayon.js) — docs/compte-rendu-pdfreader-v4.md
import { describe, it, expect } from 'vitest';
import { reconnaitreForme, estGriffonnage, traitsDansLasso, chaikin, cheminCatmull, cheminTrait, forceStabilisation } from '../../src/medrevise/pdf/crayon.js';

const bruit = (i) => Math.sin(i * 12.9898) * 0.004; // tremblement déterministe
const ligne = Array.from({ length: 40 }, (_, i) => [0.1 + i * 0.01, 0.5 + bruit(i)]);
const cercle = Array.from({ length: 60 }, (_, i) => { const a = (2 * Math.PI * i) / 58; return [0.5 + 0.1 * Math.cos(a) + bruit(i), 0.5 + 0.1 * Math.sin(a) + bruit(i + 3)]; });
const cote = (a, b, n) => Array.from({ length: n }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n + bruit(i), a[1] + ((b[1] - a[1]) * i) / n + bruit(i + 7)]);
const rectangle = [...cote([0.2, 0.2], [0.6, 0.2], 15), ...cote([0.6, 0.2], [0.6, 0.45], 10), ...cote([0.6, 0.45], [0.2, 0.45], 15), ...cote([0.2, 0.45], [0.2, 0.2], 10), [0.2, 0.2]];
const triangle = [...cote([0.3, 0.6], [0.5, 0.2], 15), ...cote([0.5, 0.2], [0.7, 0.6], 15), ...cote([0.7, 0.6], [0.3, 0.6], 15), [0.3, 0.6]];
const fleche = [...cote([0.1, 0.5], [0.6, 0.5], 30), ...cote([0.6, 0.5], [0.55, 0.45], 5), ...cote([0.55, 0.45], [0.6, 0.5], 5), ...cote([0.6, 0.5], [0.55, 0.55], 5)];

describe('crayon v4', () => {
  it('redresse : ligne, cercle, rectangle, triangle, flèche', () => {
    expect(reconnaitreForme(ligne).type).toBe('ligne');
    expect(reconnaitreForme(ligne).points).toHaveLength(2);
    expect(reconnaitreForme(cercle).type).toBe('cercle');
    expect(reconnaitreForme(rectangle).type).toBe('rectangle');
    expect(reconnaitreForme(triangle).type).toBe('triangle');
    expect(reconnaitreForme(fleche).type).toBe('fleche');
  });
  it('un gribouillis libre n’est pas redressé', () => {
    const libre = Array.from({ length: 50 }, (_, i) => [0.2 + i * 0.006 + 0.03 * Math.sin(i / 2.3), 0.4 + 0.08 * Math.sin(i / 5) + 0.03 * Math.cos(i / 1.7)]);
    expect(reconnaitreForme(libre)).toBe(null);
  });
  it('griffonnage : zigzag serré reconnu, écriture normale non', () => {
    const zig = Array.from({ length: 40 }, (_, i) => [0.3 + (i % 2 ? 0.05 : 0) + i * 0.001, 0.3 + i * 0.002]);
    expect(estGriffonnage(zig)).toBe(true);
    expect(estGriffonnage(ligne)).toBe(false);
    expect(estGriffonnage(cercle)).toBe(false);
  });
  it('lasso : traits entourés à 60 % au moins', () => {
    const poly = [[0, 0.4], [0.3, 0.4], [0.3, 0.6], [0, 0.6]]; // « b » : la moitié de ses points seulement
    const pris = traitsDansLasso([{ id: 'a', points: ligne.slice(0, 20) }, { id: 'b', points: ligne }, { id: 'c', points: cercle }], poly).map((t) => t.id);
    expect(pris).toEqual(['a']);
  });
  it('lissage et rendu Catmull-Rom ; ancien trait inchangé', () => {
    expect(chaikin(ligne, 1).length).toBe(2 * (ligne.length - 1) + 2);
    expect(cheminCatmull(ligne)).toMatch(/^M[\d.]+ [\d.]+ C/);
    const ancien = () => 'ANCIEN';
    expect(cheminTrait({ points: ligne }, ancien)).toBe('ANCIEN');
    expect(cheminTrait({ points: [[0, 0], [1, 1]], rendu: 'droit' }, ancien)).toBe('M0.000 0.000 L100.000 100.000');
    expect(forceStabilisation(0)).toBe(0);
    expect(forceStabilisation(1)).toBeGreaterThan(forceStabilisation(0.3));
  });
});
