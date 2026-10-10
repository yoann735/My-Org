// Planificateur FSRS (scheduler/) — fuzz désactivé (config.js : VITEST), fuseau Europe/Brussels.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { noterFlashcard, intervallesPrevus, QUALITE_MAISON } from '../../src/medrevise/scheduler/noter.js';
import { initialiser, appliquer, previsualiser, Rating, State } from '../../src/medrevise/scheduler/fsrs.js';
import { midi, jourDeRevision, ajouterJours, ecartJours, heureMurale } from '../../src/medrevise/scheduler/jours.js';
import { configPlanificateur } from '../../src/medrevise/scheduler/config.js';
import { planDuJour } from '../../src/medrevise/lib/apprentissageFC.js';
import { nextDate } from '../../src/medrevise/lib/planning.js';

const ON = { planificateur: 'fsrs', fsrsMigration: { le: '2026-10-10' } };
const ici = (jour, heure = '10:00') => { const [h, m] = heure.split(':').map(Number); const t = midi(jour); return new Date(t.getTime() + ((h - 12) * 60 + m) * 60000); };
const neuve = (id = 'n1', dueDate = '2026-10-10') => ({ id, type: 'flashcard', recto: 'R', verso: 'V', dueDate, intervalDays: 1, capped: false, termine: false, historique: [], missed: 0 });
const revision = (I, dueDate, id = 'r1') => ({ id, type: 'flashcard', recto: 'R', verso: 'V', dueDate, intervalDays: I, capped: false, termine: false, missed: 0, historique: [{ date: ajouterJours(dueDate, -I), qualite: 5 }] });

// « aujourd'hui » du planificateur maison (todayISO) figé au 10/10/2026 10:00 à Bruxelles
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(ici('2026-10-10')); });
afterEach(() => vi.useRealTimers());

describe('4 notes', () => {
  it('carte neuve : À revoir / Difficile / Correct / Facile → 1 / 2 / 3 / 8 jours (FSRS-6 par défaut, pas vides)', () => {
    const t = ici('2026-10-10');
    const jours = [1, 2, 3, 4].map((n) => noterFlashcard(neuve(), n, { reglages: ON, maintenant: t }).carte.dueDate).map((d) => ecartJours('2026-10-10', d));
    expect(jours).toEqual([1, 2, 3, 8]);
    for (const n of [1, 2, 3, 4]) expect(noterFlashcard(neuve(), n, { reglages: ON, maintenant: t }).carte.fsrs.state).toBe(State.Review);
  });
  it('carte en révision : intervalles strictement croissants, À revoir = demain', () => {
    const c = initialiser(revision(8, '2026-10-10'), '2026-10-10');
    const p = previsualiser(c, ici('2026-10-10'));
    expect(p[Rating.Again].jours).toBe(1);
    expect(p[Rating.Again].jours).toBeLessThan(p[Rating.Hard].jours);
    expect(p[Rating.Hard].jours).toBeLessThan(p[Rating.Good].jours);
    expect(p[Rating.Good].jours).toBeLessThan(p[Rating.Easy].jours);
  });
  it('intervalle affiché sous chaque bouton = intervalle réellement appliqué (ON)', () => {
    const c = revision(5, '2026-10-10');
    const t = ici('2026-10-10');
    const prevus = intervallesPrevus(c, ON, t);
    for (const n of [1, 2, 3, 4]) expect(noterFlashcard(c, n, { reglages: ON, maintenant: t }).carte.dueDate).toBe(prevus[n].due);
  });
  it('OFF : correspondance vers le maison (À revoir→Raté, Difficile→Difficile, Correct et Facile→Facile)', () => {
    expect(QUALITE_MAISON).toEqual({ 1: 1, 2: 3, 3: 5, 4: 5 });
  });
});

describe('carte non révisée', () => {
  it('reste due sans perte (même dueDate, même état, toujours dans la séance les jours suivants)', () => {
    const c = revision(5, '2026-10-05');
    const avant = JSON.stringify(c);
    for (const j of ['2026-10-05', '2026-10-06', '2026-10-10', '2026-10-30']) {
      expect(planDuJour([c], j, nextDate).dues.map((x) => x.id)).toEqual(['r1']);
    }
    expect(JSON.stringify(c)).toBe(avant);
    expect(initialiser(c, '2026-10-30').due).toBe('2026-10-05');
  });
});

describe('réponse en retard', () => {
  it('Correct avec 9 jours de retard donne un intervalle plus long qu’à l’heure, compté depuis le jour de réponse', () => {
    const c = revision(5, '2026-10-01');
    const aLHeure = noterFlashcard(c, 3, { reglages: ON, maintenant: ici('2026-10-01') }).carte;
    const enRetard = noterFlashcard(c, 3, { reglages: ON, maintenant: ici('2026-10-10') }).carte;
    expect(ecartJours('2026-10-10', enRetard.dueDate)).toBeGreaterThan(ecartJours('2026-10-01', aLHeure.dueDate));
    expect(enRetard.fsrs.derniere).toBe('2026-10-10');
  });
});

describe('jour de révision : bascule à 4 h', () => {
  it('une réponse entre minuit et 4 h compte pour la veille', () => {
    expect(jourDeRevision(ici('2026-10-11', '00:10'))).toBe('2026-10-10');
    expect(jourDeRevision(ici('2026-10-11', '03:59'))).toBe('2026-10-10');
    expect(jourDeRevision(ici('2026-10-11', '04:00'))).toBe('2026-10-11');
    const nuit = noterFlashcard(neuve(), 3, { reglages: ON, maintenant: ici('2026-10-11', '01:30') });
    const veille = noterFlashcard(neuve(), 3, { reglages: ON, maintenant: ici('2026-10-10', '20:00') });
    expect(nuit.entree.jour).toBe('2026-10-10');
    expect(nuit.carte.dueDate).toBe(veille.carte.dueDate);
  });
});

describe('changements d’heure (25/10/2026, 28/03/2027)', () => {
  it('midi reste midi heure de Bruxelles les jours de changement', () => {
    for (const j of ['2026-10-24', '2026-10-25', '2026-10-26', '2027-03-27', '2027-03-28', '2027-03-29']) {
      const w = heureMurale(midi(j));
      expect([w.h, w.mi]).toEqual([12, 0]);
      expect(midi(j).toISOString().slice(0, 10)).toBe(j);
    }
  });
  it('aucun décalage d’un jour : échéance = jour de révision + intervalle, à toute heure, autour des deux changements', () => {
    const jours = [];
    for (let i = -5; i <= 5; i++) jours.push(ajouterJours('2026-10-25', i), ajouterJours('2027-03-28', i));
    for (const j of jours) {
      for (const h of ['04:30', '10:00', '23:30']) {
        const r = noterFlashcard(neuve('x', j), 3, { reglages: ON, maintenant: ici(j, h) });
        expect(r.entree.jour).toBe(j);
        expect(r.carte.dueDate).toBe(ajouterJours(j, 3));
        const s = noterFlashcard(revision(10, j), 3, { reglages: ON, maintenant: ici(j, h) });
        expect(ecartJours(j, s.carte.dueDate)).toBe(s.carte.fsrs.intervalle);
      }
    }
  });
  it('révision le 24/10 à 00:30 (veille du changement) : jour de révision 23/10, échéance comptée en jours civils', () => {
    const r = noterFlashcard(neuve('x', '2026-10-23'), 3, { reglages: ON, maintenant: ici('2026-10-24', '00:30') });
    expect(r.entree.jour).toBe('2026-10-23');
    expect(r.carte.dueDate).toBe('2026-10-26');
  });
});

describe('plafond « Intervalle maximum »', () => {
  it('45 jours par défaut, jamais dépassé, même avec une très grande stabilité', () => {
    expect(configPlanificateur({}).intervalleMax).toBe(45);
    let c = revision(40, '2026-10-10');
    let t = '2026-10-10';
    for (let i = 0; i < 8; i++) {
      const r = noterFlashcard(c, 4, { reglages: ON, maintenant: ici(t) });
      expect(ecartJours(t, r.carte.dueDate)).toBeLessThanOrEqual(45);
      c = r.carte; t = r.carte.dueDate;
    }
  });
  it('réglage borné 7–365', () => {
    expect(configPlanificateur({ intervalleMax: 3 }).intervalleMax).toBe(7);
    expect(configPlanificateur({ intervalleMax: 9999 }).intervalleMax).toBe(365);
    const r = noterFlashcard(revision(20, '2026-10-10'), 4, { reglages: { ...ON, intervalleMax: 10 }, maintenant: ici('2026-10-10') });
    expect(ecartJours('2026-10-10', r.carte.dueDate)).toBeLessThanOrEqual(10);
  });
});

describe('mode ombre (OFF)', () => {
  it('FSRS calcule et écrit son bloc, sans jamais modifier la date du maison', () => {
    const c = revision(5, '2026-10-10');
    const r = noterFlashcard(c, 3, { reglages: null, maintenant: ici('2026-10-10') });
    expect(r.carte.dueDate).toBe('2026-10-23'); // maison : Facile ×2,5 → 13 j (aujourd'hui = date système, figée ci-dessous)
    expect(r.carte.fsrs.due).not.toBe(r.carte.dueDate);
    expect(r.entree.planificateur).toBe('maison');
    expect(r.entree.details.dueFsrs).toBe(r.carte.fsrs.due);
  });
});

