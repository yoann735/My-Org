// Tags « Début / Fin de cours » (25/10) — appariement des séances, liseré, dates.
import { describe, it, expect } from 'vitest';
import { seances, pagesEnSeance, dateCourte, libelleTag, tagsDe, pageDuTag } from '../../src/medrevise/lib/tagsPages.js';

const t = (id, kind, page, extra = {}) => ({ id, courseId: 'c', document: 'original', kind, page, date: '2026-10-22', ...extra });
describe('séances', () => {
  it('deux séances : début → fin la plus proche, pages couvertes', () => {
    const s = seances([t('a', 'debut', 2), t('b', 'fin', 5), t('c', 'debut', 6, { date: '2026-10-24', transcriptSessionId: 'ts1' }), t('d', 'fin', 9)]);
    expect(s.map((x) => [x.de, x.a, x.date])).toEqual([[2, 5, '2026-10-22'], [6, 9, '2026-10-24']]);
    expect(s[1].transcriptSessionId).toBe('ts1');
    expect([...pagesEnSeance(s)]).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });
  it('début sans fin = séance ouverte ; fin orpheline ignorée ; tag retiré ignoré ; même page', () => {
    expect(seances([t('x', 'fin', 1), t('a', 'debut', 3)]).map((x) => [x.de, x.a])).toEqual([[3, null]]);
    expect(seances([t('a', 'debut', 3), t('b', 'fin', 4, { supprime: true })]).map((x) => x.a)).toEqual([null]);
    expect(seances([t('a', 'debut', 3), t('b', 'fin', 3)]).map((x) => [x.de, x.a])).toEqual([[3, 3]]);
  });
  it('clé stable de page (pages ajoutées / déplacées)', () => {
    const sizes = [{ cle: 1 }, { cle: 'pa' }, { cle: 2 }];
    expect(pageDuTag(t('a', 'debut', 2, { pageCle: '2' }), sizes)).toBe(3);
  });
});
describe('affichage', () => {
  it('« ▶ Début · 22 oct. » / « ■ Fin · 22 oct. »', () => {
    expect(dateCourte('2026-10-22')).toBe('22 oct.');
    expect(libelleTag(t('a', 'debut', 1))).toBe('▶ Début · 22 oct.');
    expect(libelleTag(t('a', 'fin', 1))).toBe('■ Fin · 22 oct.');
  });
  it('tags d’un cours et d’un document, triés', () => {
    const l = [t('b', 'fin', 5), t('a', 'debut', 2), t('z', 'debut', 1, { courseId: 'autre' }), t('f', 'debut', 1, { document: 'fiche' })];
    expect(tagsDe(l, 'c', 'original').map((x) => x.id)).toEqual(['a', 'b']);
  });
});
