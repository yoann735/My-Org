// (29/10) Plusieurs fiches de résumé par cours (docs/compte-rendu-plusieurs-fiches.md) : la fiche d'avant ne bouge pas,
// chaque fiche a son calque, supprimer une fiche ne touche que la sienne, supprimer le cours les retire toutes.
import { describe, it, expect, beforeEach, vi } from 'vitest';
// pdf.js et l'OCR ne servent pas ici (aucun PDF lu) : on ne les charge pas en Node
vi.mock('../../src/medrevise/pdf/pdfjsSetup.js', () => ({ openPdf: async () => null }));
vi.mock('../../src/medrevise/ocr/service.js', () => ({ coucheDuPdf: async () => null }));
// les fonctions préviennent l'écran par un événement de fenêtre : une fenêtre factice suffit en Node
vi.stubGlobal('window', { dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} });
import * as S from '../../src/medrevise/lib/storage.js';
import { lireFiches, nsDeVersion, prefixeCalques, idJumelle, idFicheEnPlus, modifierFiche, seanceProposee, nomFiche, nsJumelle } from '../../src/medrevise/lib/ficheJumelle.js';
import { supprimerJumelle } from '../../src/medrevise/lib/fichiersCours.js';

const C = 'cours-test';
const premiere = { id: idJumelle(C), courseId: C, fileId: 'b1', fileName: 'fiche-seance-1.pdf', version: 2, nsAnnot: nsJumelle(C, 2), nbPagesFiche: 4, pageMap: { versOrig: [1, 2, 3, null], versFiche: [] },
  versions: [{ version: 1, fileId: 'b0', fileName: 'v1.pdf', nsAnnot: nsJumelle(C, 1) }], importeLe: '2026-10-01T20:00:00Z' };
const enPlus = { id: idFicheEnPlus(C, 'k1'), cle: 'k1', courseId: C, fileId: 'b2', fileName: 'Clairances.pdf', version: 1, nsAnnot: `${C}::fiche-k1:1`, nbPagesFiche: 3,
  pageMap: { versOrig: [61, 62, 70], versFiche: [] }, versions: [], importeLe: '2026-10-08T21:00:00Z' };
const annot = (id, ns) => ({ id, ficheId: ns, page: 1, kind: 'libre' });

beforeEach(async () => {
  for (const st of ['companion_pdf', 'highlights', 'annotations', 'fiches', 'backups']) for (const r of (await S.getAll(st)) || []) await S.remove(st, r.id || r.key).catch(() => {});
  await S.put('fiches', { id: C, titre: 'Physiologie rénale', pdfId: 'bo' });
  await S.put('companion_pdf', enPlus); await S.put('companion_pdf', premiere);
  await S.putMany('annotations', [annot('a-orig', C), annot('a-v1', nsJumelle(C, 1)), annot('a-v2', nsJumelle(C, 2)), annot('a-plus', `${C}::fiche-k1:1`)]);
  await S.putMany('highlights', [{ id: 'h-v2', ficheId: nsJumelle(C, 2), page: 1 }, { id: 'h-plus', ficheId: `${C}::fiche-k1:1`, page: 1 }]);
});

describe('plusieurs fiches par cours', () => {
  it('la fiche d’avant garde son id et son calque ; une fiche en plus a les siens', () => {
    expect(nsDeVersion(premiere, 3)).toBe(`${C}::fiche:3`);
    expect(nsDeVersion(enPlus, 2)).toBe(`${C}::fiche-k1:2`);
    expect(prefixeCalques(premiere)).toBe(`${C}::fiche:`);
    expect(prefixeCalques(enPlus)).toBe(`${C}::fiche-k1:`);
    // les deux calques commencent par « <cours>::fiche » : la suppression du COURS les attrape tous
    expect(enPlus.nsAnnot.startsWith(C + '::fiche')).toBe(true);
  });
  it('lireFiches : la première d’abord, puis par date d’import ; seulement celles du cours', async () => {
    await S.put('companion_pdf', { ...enPlus, id: idFicheEnPlus('autre', 'z'), courseId: 'autre' });
    expect((await lireFiches(C)).map((r) => r.id)).toEqual([idJumelle(C), idFicheEnPlus(C, 'k1')]);
  });
  it('supprimer la fiche EN PLUS : seulement ses annotations ; la première et la diapo intactes', async () => {
    const n = await supprimerJumelle({ fiche: { id: C }, rec: enPlus });
    expect(n).toBe(2);
    const restent = [...(await S.getAll('annotations')), ...(await S.getAll('highlights'))].map((a) => a.id).sort();
    expect(restent).toEqual(['a-orig', 'a-v1', 'a-v2', 'h-v2']);
    expect((await lireFiches(C)).map((r) => r.id)).toEqual([idJumelle(C)]);
    const b = (await S.getAll('backups')).find((x) => String(x.key).startsWith('pre-supprime-jumelle-'));
    expect(b && b.data.annotations.length + b.data.highlights.length).toBe(2); // sauvegarde AVANT
  });
  it('supprimer la PREMIÈRE fiche : ses versions, pas la fiche en plus (avant ce correctif, le préfixe les aurait prises)', async () => {
    const n = await supprimerJumelle({ fiche: { id: C }, rec: premiere });
    expect(n).toBe(3);
    const restent = [...(await S.getAll('annotations')), ...(await S.getAll('highlights'))].map((a) => a.id).sort();
    expect(restent).toEqual(['a-orig', 'a-plus', 'h-plus']);
    expect((await lireFiches(C)).map((r) => r.id)).toEqual([idFicheEnPlus(C, 'k1')]);
  });
  it('supprimer le cours retire TOUTES ses fiches et leurs calques', async () => {
    await S.purgeFiche(C);
    expect(await lireFiches(C)).toEqual([]);
    expect([...(await S.getAll('annotations')), ...(await S.getAll('highlights'))].filter((a) => String(a.ficheId).startsWith(C))).toEqual([]);
  });
  it('modifierFiche : seuls titre et séance changent', async () => {
    const r = await modifierFiche(enPlus, { titre: 'Clairances : méthode', seance: { tagId: 't2', date: '2026-10-08', de: 59, a: 121 } });
    const lu = (await lireFiches(C)).find((x) => x.id === enPlus.id);
    expect(lu.titre).toBe('Clairances : méthode'); expect(lu.seance.de).toBe(59);
    expect({ ...lu, titre: undefined, seance: undefined, updatedAt: undefined }).toEqual({ ...enPlus, titre: undefined, seance: undefined, updatedAt: undefined });
    expect(nomFiche(r)).toBe('Clairances : méthode');
    await modifierFiche(lu, { seance: null });
    expect((await lireFiches(C)).find((x) => x.id === enPlus.id).seance).toBeUndefined();
  });
  it('séance proposée : celle qui contient le plus de pages reprises par la fiche', () => {
    const seances = [{ debut: { id: 't1' }, de: 1, a: 58 }, { debut: { id: 't2' }, de: 59, a: 121 }, { debut: { id: 't3' }, de: 122, a: null }];
    expect(seanceProposee(enPlus.pageMap, seances).debut.id).toBe('t2');
    expect(seanceProposee({ versOrig: [130, 140, null] }, seances).debut.id).toBe('t3'); // séance ouverte
    expect(seanceProposee({ versOrig: [null] }, seances)).toBe(null);
    // une fiche qui résume TOUT le diapo : aucune séance en particulier (moins de 60 % des pages dans la meilleure)
    expect(seanceProposee({ versOrig: [10, 20, 30, 70, 80, 90, 130, 140] }, seances)).toBe(null);
  });
});
