// (24/10) Trois catégories de flashcards, composition d'une séance, conversion « Nouvelles », passage
// en révision — docs/compte-rendu-seance-categories.md. Données réelles (copie en lecture seule) :
// FSRS_SAUVEGARDE=<export idb> npm test — absentes → ces tests-là sont sautés.
import { describe, it, expect } from 'vitest';
import { estNouvelle, categoriser, composerSeance, nombres, raccourci, choixValide, MAXIMUMS } from '../../src/medrevise/lib/categoriesFC.js';
import { convertirNouvelles } from '../../src/medrevise/lib/conversionNouvelles.js';
import { passerEnRevision, noterFlashcard } from '../../src/medrevise/scheduler/noter.js';
import { nextDate } from '../../src/medrevise/lib/planning.js';
import { sauvegardePresente, lireStore } from '../fsrs/donnees.js';

const T = '2026-10-24';
const fc = (id, o = {}) => ({ id, type: 'flashcard', ficheId: 'f1', recto: id, verso: '', intervalDays: 1, historique: [], ...o });
const vue = (date) => [{ date, qualite: 5 }];

describe('catégories', () => {
  const cartes = [
    fc('n1', { dueDate: '2026-09-01', j0Date: '2026-09-01' }), // jamais notée, date passée : Nouvelle, PAS en retard
    fc('n2', { dueDate: '2026-11-30', j0Date: '2026-11-30' }),
    fc('r1', { dueDate: T, historique: vue('2026-10-20') }),
    fc('l1', { dueDate: '2026-10-20', historique: vue('2026-10-10') }),
    fc('l2', { dueDate: '2026-10-01', historique: vue('2026-09-20') }),
    fc('l3', { dueDate: '2026-10-23', historique: vue('2026-10-20') }),
    fc('f1', { dueDate: '2026-10-30', historique: vue('2026-10-20') }),
    fc('p1', { dueDate: '2026-10-25', nouvelle: false }), // passée en révision hier : plus une Nouvelle
    fc('s1', { dueDate: T, historique: vue('2026-10-20'), skippedOn: T }),
    { id: 'q1', type: 'qcm', dueDate: T, historique: [] },
  ];
  const cats = categoriser(cartes, T, nextDate);
  it('Nouvelles : jamais notées, jamais en retard', () => {
    expect(cats.nouvelles.map((q) => q.id)).toEqual(['n1', 'n2']);
    expect(estNouvelle(cartes[7])).toBe(false);
  });
  it('Révisions = date du jour ; une carte sautée aujourd’hui n’est pas proposée', () => expect(cats.revisions.map((q) => q.id)).toEqual(['r1']));
  it('Retard trié du plus en retard au moins en retard', () => expect(cats.retard.map((q) => q.id)).toEqual(['l2', 'l1', 'l3']));
  it('séance : Retard → Révisions → Nouvelles, maximums', () => {
    const tout = { nouvelles: { coche: true, max: 'tout' }, revisions: { coche: true, max: 'tout' }, retard: { coche: true, max: 'tout' } };
    expect(composerSeance(cats, tout).ids).toEqual(['l2', 'l1', 'l3', 'r1', 'n1', 'n2']);
    const c = { nouvelles: { coche: true, max: 5 }, revisions: { coche: false, max: 'tout' }, retard: { coche: true, max: 5 } };
    expect(composerSeance(cats, c).ids).toEqual(['l2', 'l1', 'l3', 'n1', 'n2']);
    expect(nombres(cats, c)).toEqual({ par: { nouvelles: 2, revisions: 0, retard: 3 }, total: 5 });
  });
  it('chaque combinaison de cases et de maximums', () => {
    const grand = { nouvelles: Array.from({ length: 130 }, (_, i) => ({ id: 'n' + i })), revisions: Array.from({ length: 40 }, (_, i) => ({ id: 'r' + i })), retard: Array.from({ length: 70 }, (_, i) => ({ id: 'l' + i })) };
    for (let m = 0; m < 8; m++) {
      for (const max of MAXIMUMS) {
        const choix = { nouvelles: { coche: !!(m & 1), max }, revisions: { coche: !!(m & 2), max }, retard: { coche: !!(m & 4), max } };
        const { ids, categorie } = composerSeance(grand, choix);
        const att = (cle) => (choix[cle].coche ? (max === 'tout' ? grand[cle].length : Math.min(max, grand[cle].length)) : 0);
        expect(ids.length).toBe(att('nouvelles') + att('revisions') + att('retard'));
        expect(nombres(grand, choix).total).toBe(ids.length);
        // ordre des blocs
        const rang = { retard: 0, revisions: 1, nouvelles: 2 };
        const r = ids.map((id) => rang[categorie[id]]);
        expect(r).toEqual([...r].sort((a, b) => a - b));
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });
  it('raccourcis et choix mémorisé', () => {
    const c = choixValide({ nouvelles: { coche: false, max: 20 }, revisions: { coche: true, max: 15 }, retard: { coche: false, max: 'xx' } });
    expect(c.retard.max).toBe('tout'); // (26/10) le choix porte aussi « Regrouper par cours » (OFF par défaut)
    expect(raccourci('blocNouvelles', c)).toEqual({ nouvelles: { coche: true, max: 20 }, revisions: { coche: false, max: 15 }, retard: { coche: false, max: 'tout' }, parCours: false });
    expect(raccourci('revisionsJ', c)).toEqual({ nouvelles: { coche: false, max: 20 }, revisions: { coche: true, max: 15 }, retard: { coche: true, max: 'tout' }, parCours: false });
  });
});

describe('conversion Nouvelles', () => {
  const cartes = [fc('a', { dueDate: '2026-09-01' }), fc('b', { dueDate: T, historique: vue('2026-10-01') }), fc('c', { nouvelle: false, dueDate: '2026-10-25' }), { id: 'q', type: 'qcm', historique: [] }];
  it('seules les cartes jamais notées sont marquées, rien n’est retiré, idempotente', () => {
    const { maj, rapport } = convertirNouvelles(cartes, T);
    expect(maj.map((q) => q.id)).toEqual(['a']);
    expect(maj[0]).toEqual({ ...cartes[0], nouvelle: true, conversionNouvelles: { version: 1, le: T, dueDateAvant: '2026-09-01' } });
    expect(rapport.convertis).toBe(1);
    expect(rapport.gardentLeurDate).toBe(1);
    const apres = cartes.map((q) => maj.find((m) => m.id === q.id) || q);
    expect(convertirNouvelles(apres, T).maj).toEqual([]);
  });
  (sauvegardePresente ? it : it.skip)('vraies données : aucune carte perdue, les révisées gardent leur date', () => {
    const qs = lireStore('medrevise-questions');
    const { maj, rapport } = convertirNouvelles(qs, T);
    const apres = qs.map((q) => maj.find((m) => m.id === q.id) || q);
    expect(apres.length).toBe(qs.length);
    for (let i = 0; i < qs.length; i++) {
      const a = qs[i], b = apres[i];
      for (const k of Object.keys(a)) expect(b[k]).toEqual(a[k]); // aucun champ retiré ni modifié
      if (a.type === 'flashcard' && (a.historique || []).some((h) => h.qualite != null)) expect(b).toBe(a);
    }
    expect(convertirNouvelles(apres, T).maj.length).toBe(0);
    console.info('[vraies données] converties :', rapport.convertis, '· gardent leur date :', rapport.gardentLeurDate); // eslint-disable-line no-console
  });
});

describe('passage en révision', () => {
  const maintenant = new Date('2026-10-24T10:00:00+02:00');
  it('J0 = aujourd’hui, due au J suivant, FSRS ombre initialisé, journalisé, sans note', () => {
    const c = fc('n', { dueDate: '2026-09-01', j0Date: '2026-09-01', nouvelle: true, learningPresented: true, learningStreak: 2 }); // traces de l'ancien mode Apprentissage
    const { carte, entree } = passerEnRevision(c, { maintenant, today: T });
    expect(carte.nouvelle).toBe(false);
    expect(carte.j0Date).toBe(T);
    expect(carte.dueDate).toBe('2026-10-25');
    expect(carte.intervalDays).toBe(1);
    expect(carte.historique).toEqual([]);
    expect(carte.fsrs.state).toBe(0);
    expect(carte.fsrs.due).toBe('2026-10-25');
    expect(estNouvelle(carte)).toBe(false);
    expect(entree.rating).toBe(null);
    expect(entree.details.evenement).toBe('passage_revision');
    expect(entree.card_id).toBe('n');
    // le lendemain : une révision ordinaire, notée par les 4 boutons comme une carte vue pour la 1re fois
    const cats = categoriser([carte], '2026-10-25', nextDate);
    expect(cats.revisions.map((q) => q.id)).toEqual(['n']);
    const r = noterFlashcard(carte, 3, { maintenant: new Date('2026-10-25T10:00:00+02:00') });
    expect(r.carte.historique.length).toBe(1);
    expect(r.carte.fsrs.reps).toBe(1);
  });
});
