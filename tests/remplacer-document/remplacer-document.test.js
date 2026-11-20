// Remplacer un document créé par le PDF du prof (20/11, src/medrevise/lib/remplacerDocument.js) : le plan.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../src/medrevise/lib/storage.js', () => ({}));
vi.mock('../../src/medrevise/lib/fichiersCours.js', () => ({}));
vi.mock('../../src/medrevise/lib/historiqueDoc.js', () => ({}));
vi.mock('../../src/medrevise/pdf/pdfjsSetup.js', () => ({}));
const { planRemplacement, pagesDuDocument } = await import('../../src/medrevise/lib/remplacerDocument.js');

const pg = (id, rang, c = '2026-11-20T08:00:00Z') => ({ id, ficheId: 'd', kind: 'page', type: 'page', apres: 0, rang, createdAt: c });
const ob = (id, page, extra = {}) => ({ id, ficheId: 'd', page, kind: 'libre', type: 'boite', x: 0.3, y: 0.4, width: 0.2, height: 0.1, ...extra });

describe('remplacement : chaque annotation garde son numéro de page et sa position', () => {
  const annotations = [pg('p2', 1), pg('p1', 0), pg('p3', 2), ob('a', 'p1'), ob('b', 'p2'), ob('c', 'p3', { x: 0.9, y: 0.95 }), ob('z', 'p1', { ficheId: 'autre' })];
  it('ordre des pages = ordre d’affichage (rang)', () => {
    expect(pagesDuDocument(annotations, 'd').map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });
  it('12 pages : n-ième page → page n ; positions identiques ; pages du document à l’archive', () => {
    const { maj, nAnnotations, nPagesDoc } = planRemplacement({ ns: 'd', annotations, highlights: [], nbPages: 12, nsRetire: 'd::retire:1' });
    const par = Object.fromEntries(maj.annotations.map((a) => [a.id, a]));
    expect([par.a.page, par.b.page, par.c.page]).toEqual([1, 2, 3]);
    expect([par.c.x, par.c.y, par.c.ficheId]).toEqual([0.9, 0.95, 'd']);
    expect(['p1', 'p2', 'p3'].map((k) => [par[k].ficheId, par[k].retireDe])).toEqual([['d::retire:1', 'd'], ['d::retire:1', 'd'], ['d::retire:1', 'd']]);
    expect(par.z).toBeUndefined(); // un autre document : pas touché
    expect(nAnnotations).toBe(3); expect(nPagesDoc).toBe(3);
  });
  it('PDF plus court : les annotations au-delà vont sur la dernière page', () => {
    const { maj } = planRemplacement({ ns: 'd', annotations, highlights: [], nbPages: 2, nsRetire: 'r' });
    expect(maj.annotations.filter((a) => a.kind !== 'page').map((a) => [a.id, a.page])).toEqual([['a', 1], ['b', 2], ['c', 2]]);
  });
  it('surlignages : sur une page → suivent (ancre approximative) ; hors page (texte du flux) → intacts', () => {
    const hs = [{ id: 'h1', ficheId: 'd', page: 'p2', anchor: { a: 1 } }, { id: 'h2', ficheId: 'd', page: 'flux' }];
    const { maj, nAnnotations } = planRemplacement({ ns: 'd', annotations, highlights: hs, nbPages: 12, nsRetire: 'r' });
    expect(maj.highlights).toEqual([{ id: 'h1', ficheId: 'd', page: 2, replaceApprox: true }]);
    expect(nAnnotations).toBe(4);
  });
});
