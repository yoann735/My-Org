// Tag « À apprendre » (26/10) — champ additif sur la carte, filtre du mode Apprentissage, indépendance de la planification.
import { describe, it, expect, vi } from 'vitest';

const base = new Map();
vi.mock('../../src/medrevise/lib/storage.js', () => ({ getOne: async (_s, id) => base.get(id) }));

const { ecrireAApprendre, estAApprendre, garderTagEnBase } = await import('../../src/medrevise/lib/aApprendre.js');
const { filtrer, FILTRES_VIDES, filtresValides, filtresActifs } = await import('../../src/medrevise/apprentissageLibre/tableauBord.js');

const PLANIF = ['dueDate', 'interval', 'palier', 'nextReview', 'historique', 'fsrs', 'nouvelle', 'carnetAt', 'updatedAt'];

describe('ecrireAApprendre', () => {
  it("ne change QUE `aApprendre` sur la version enregistrée (planification identique)", async () => {
    const carte = { id: 'x', type: 'flashcard', recto: 'R', verso: 'V', dueDate: '2026-11-02', interval: 7, historique: [{ qualite: 4, date: '2026-10-20' }], fsrs: { s: 3.2, d: 5 }, updatedAt: 't0' };
    base.set('x', carte);
    const sauve = [];
    const rec = await ecrireAApprendre('x', true, async (c) => { sauve.push(c); });
    expect(sauve).toHaveLength(1);
    expect(rec.aApprendre).toBe(true);
    const { aApprendre, ...reste } = rec;
    expect(reste).toEqual(carte);
    for (const k of PLANIF) expect(rec[k]).toEqual(carte[k]);
    base.set('x', rec);
    const off = await ecrireAApprendre('x', false, async () => {});
    expect(off.aApprendre).toBe(false);
    expect(estAApprendre(off)).toBe(false);
  });
  it('refuse ce qui n’est pas une flashcard enregistrée', async () => {
    base.set('q', { id: 'q', type: 'qcm' });
    await expect(ecrireAApprendre('q', true, async () => {})).rejects.toThrow();
    base.set('e', { id: 'e', type: 'flashcard', ephemeral: true });
    await expect(ecrireAApprendre('e', true, async () => {})).rejects.toThrow();
  });
});

describe('filtre « À apprendre » du mode Apprentissage', () => {
  const db = {
    sources: [], matieres: [], fiches: [{ id: 'f1', titre: 'Rein' }],
    questions: [
      { id: 'a', type: 'flashcard', ficheId: 'f1', recto: 'Néphron', verso: 'unité', historique: [{ qualite: 4 }], nouvelle: false, aApprendre: true },
      { id: 'b', type: 'flashcard', ficheId: 'f1', recto: 'DFG', verso: '120', historique: [], aApprendre: true },
      { id: 'c', type: 'flashcard', ficheId: 'f1', recto: 'Débit', verso: 'VES', historique: [] },
    ],
  };
  const ids = (f) => filtrer(db, { ...FILTRES_VIDES, ...f }).map((q) => q.id).sort();
  it('seul et combiné (Nouvelles, recherche)', () => {
    expect(ids({ aApprendre: true })).toEqual(['a', 'b']);
    expect(ids({ aApprendre: true, nouvelles: true })).toEqual(['b']);
    expect(ids({ aApprendre: true, q: 'nephron' })).toEqual(['a']);
    expect(ids({})).toEqual(['a', 'b', 'c']);
  });
  it('mémoire des filtres et « filtres actifs »', () => {
    expect(filtresValides({ aApprendre: true }).aApprendre).toBe(true);
    expect(filtresValides({ aApprendre: 'oui' }).aApprendre).toBe(false);
    expect(filtresActifs({ ...FILTRES_VIDES, aApprendre: true })).toBe(true);
  });
});

describe('garderTagEnBase (note donnée sur une copie prise avant le tag)', () => {
  it('reprend SEULEMENT le tag de la version enregistrée', async () => {
    base.set('n', { id: 'n', type: 'flashcard', dueDate: '2026-10-20', aApprendre: true });
    const notee = { id: 'n', type: 'flashcard', dueDate: '2026-10-29', intervalDays: 3, historique: [{ qualite: 4 }] };
    expect(await garderTagEnBase(notee)).toEqual({ ...notee, aApprendre: true });
  });
  it('carte jamais taguée : rien n’est ajouté', async () => {
    base.set('m', { id: 'm', type: 'flashcard', dueDate: '2026-10-20' });
    const notee = { id: 'm', type: 'flashcard', dueDate: '2026-10-29' };
    expect(await garderTagEnBase(notee)).toBe(notee);
  });
});
