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

// (31/10, soir) reconnaître une carte disparue : libellé gardé dans l'instantané, ou retrouvé dans les copies GitHub
import { retrouverCartes } from '../../api/_lib/sauvegarde.js';

describe('reconnaître les cartes disparues', () => {
  it('l’instantané garde recto + fiche ; l’alerte donne recto, type et cours', () => {
    const hier = base(); hier.questions[2] = { ...hier.questions[2], recto: '<b>Quel nerf</b> innerve le grand glutéal ?' };
    const r = controlerIntegrite({ db: sans(['c']), jour: '2026-10-31', precedent: instantane(hier.questions, '2026-10-30'), volontaires: new Set() });
    expect(r.baisse.details).toEqual([{ id: 'c', type: 'qcm', recto: 'Quel nerf innerve le grand glutéal ?', cours: 'Cours › Anat › Fiche' }]);
  });
  it('copies GitHub : dernière version vivante + date de la tombstone, lecture seule, plus récente d’abord', async () => {
    const ligne = (store, id, data, extra = {}) => JSON.stringify({ store, id, data, deleted: false, updated_at: '2026-10-27T10:00:00Z', ...extra });
    const noms = [ligne('sources', 's1', { nom: 'Helha' }), ligne('matieres', 'm1', { nom: 'Anat', sourceId: 's1' }), ligne('fiches', 'f1', { titre: 'Arthro', matiereId: 'm1' })];
    const copies = {
      c2: [...noms, ligne('questions', 'x', null, { deleted: true, updated_at: '2026-10-28T16:11:52Z' })].join('\n'),
      c1: [...noms, ligne('questions', 'x', { type: 'flashcard', recto: 'Les 4 synarthroses', verso: 'synostose…', ficheId: 'f1' })].join('\n'),
    };
    const appels = [];
    const fetchFn = async (url, opts) => {
      appels.push(opts.method + ' ' + url.replace(/^.*\/repos\/[^/]+\/[^/]+/, ''));
      const u = url.replace(/^.*\/repos\/[^/]+\/[^/]+/, '');
      let j;
      if (u.startsWith('/commits?')) j = [{ sha: 'c2', commit: { message: 'backup 2026-10-29', committer: { date: '' }, tree: { sha: 't2' } } }, { sha: 'c1', commit: { message: 'backup 2026-10-28', committer: { date: '' }, tree: { sha: 't1' } } }];
      else if (u.startsWith('/git/trees/')) j = { tree: [{ type: 'blob', path: 'data/records.jsonl', sha: 'b' + u[12] }, { type: 'blob', path: 'manifest.json', sha: 'm' }] };
      else if (u.startsWith('/git/blobs/')) j = { encoding: 'base64', content: Buffer.from(copies['c' + u.slice(12)]).toString('base64') };
      return { ok: true, status: 200, text: async () => JSON.stringify(j) };
    };
    const r = await retrouverCartes({ ids: ['x', 'absente', '../piege'], env: { GITHUB_BACKUP_TOKEN: 't', GITHUB_BACKUP_REPO: 'u/d' }, fetchFn });
    expect(r.cartes).toEqual([{ id: 'x', type: 'flashcard', recto: 'Les 4 synarthroses', verso: 'synostose…', cours: 'Helha › Anat › Arthro', copie: '2026-10-28', supprimeeLe: '2026-10-28T16:11:52Z' }]);
    expect(r.introuvables).toEqual(['absente']);
    expect(appels.every((a) => a.startsWith('GET '))).toBe(true); // lecture seule
  });
  it('sans configuration → message clair, aucun appel', async () => {
    expect(await retrouverCartes({ ids: ['x'], env: {}, fetchFn: () => { throw new Error('appel'); } })).toMatchObject({ ok: false, code: 'non_configure' });
  });
});
