// Contrôle d'intégrité : une suppression faite depuis l'interface n'est jamais une « baisse » ;
// une disparition que rien n'explique (synchro, migration, copie de données) reste une alerte.
import { describe, it, expect } from 'vitest';
import { controlerIntegrite, instantane } from '../../src/medrevise/integrite/controle.js';
import { idsVolontaires, SUPPRESSIONS_CONFIRMEES } from '../../src/medrevise/integrite/suppressions.js';

const base = () => ({
  sources: [{ id: 's1', nom: 'Cours' }], matieres: [{ id: 'm1', sourceId: 's1', nom: 'Anat' }], fiches: [{ id: 'f1', matiereId: 'm1', titre: 'Fiche' }],
  questions: [
    { id: 'a', type: 'flashcard', ficheId: 'f1', dueDate: '2026-11-02' },
    { id: 'b', type: 'flashcard', ficheId: 'f1', dueDate: '2026-11-02' },
    { id: 'c', type: 'qcm', ficheId: 'f1' },
  ],
});
const veille = () => instantane(base().questions, '2026-10-30');
const sans = (ids) => { const db = base(); db.questions = db.questions.filter((q) => !ids.includes(q.id)); return db; };

describe('suppressions volontaires', () => {
  it('carte supprimée à la main (dans le registre) → aucune alerte, comptée comme volontaire', () => {
    const r = controlerIntegrite({ db: sans(['a']), jour: '2026-10-31', precedent: veille(), volontaires: idsVolontaires([{ entrees: { a: { type: 'flashcard' } } }]) });
    expect(r.baisse).toBeNull();
    expect(r.suppressionsVolontaires).toBe(1);
    expect(r.ok).toBe(true);
  });
  it('disparition non expliquée (copie de données sans la carte) → alerte, type nommé', () => {
    const r = controlerIntegrite({ db: sans(['b', 'c']), jour: '2026-10-31', precedent: veille(), volontaires: idsVolontaires([]) });
    expect(r.baisse).toMatchObject({ depuis: '2026-10-30', total: 2, parType: { flashcard: 1, qcm: 1 }, idsManquants: ['b', 'c'] });
    expect(r.ok).toBe(false);
  });
  it('mélange : seule la disparition non expliquée est signalée', () => {
    const r = controlerIntegrite({ db: sans(['a', 'b']), jour: '2026-10-31', precedent: veille(), volontaires: new Set(['a']) });
    expect(r.baisse).toMatchObject({ total: 1, idsManquants: ['b'], parType: { flashcard: 1 } });
    expect(r.suppressionsVolontaires).toBe(1);
  });
  it('perte masquée par une création du jour → toujours signalée (les comptes ne baissent pas)', () => {
    const db = sans(['b']); db.questions.push({ id: 'nouvelle', type: 'flashcard', ficheId: 'f1', dueDate: '2026-11-02' });
    expect(controlerIntegrite({ db, jour: '2026-10-31', precedent: veille(), volontaires: new Set() }).baisse).toMatchObject({ total: 1, idsManquants: ['b'] });
  });
  it('registres de plusieurs appareils fusionnés + les 12 suppressions confirmées du 26–28/10', () => {
    const ids = idsVolontaires([{ entrees: { x: {} } }, { entrees: { y: {} } }, null]);
    expect(ids.has('x') && ids.has('y')).toBe(true);
    for (const id of SUPPRESSIONS_CONFIRMEES.ids) expect(ids.has(id)).toBe(true);
    expect(SUPPRESSIONS_CONFIRMEES.ids).toHaveLength(12);
  });
  it('instantané d’avant le 31/10 (sans idsParType) → alerte quand même, type « inconnu »', () => {
    const ancien = { ...veille() }; delete ancien.idsParType;
    expect(controlerIntegrite({ db: sans(['c']), jour: '2026-10-31', precedent: ancien, volontaires: new Set() }).baisse).toMatchObject({ total: 1, parType: { inconnu: 1 } });
  });
  it('même jour que l’instantané → pas de comparaison', () => {
    expect(controlerIntegrite({ db: sans(['a']), jour: '2026-10-30', precedent: veille(), volontaires: new Set() }).baisse).toBeNull();
  });
});
