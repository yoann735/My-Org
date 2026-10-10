// Tests sur une COPIE EN MÉMOIRE de la sauvegarde pre-fsrs-2026-10-10 (vraies cartes, lecture seule).
// « Avant installation » = le code du tag git pre-fsrs-2026-10-10, extrait dans un dossier temporaire.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sauvegardePresente, chargerDb } from './donnees.js';
import { convertirApprentissage } from '../../src/medrevise/lib/conversionApprentissage.js';
import * as planning from '../../src/medrevise/lib/planning.js';
import { advanceQuestion } from '../../src/medrevise/lib/sm2.js';
import { noterFlashcard } from '../../src/medrevise/scheduler/noter.js';
import { migrerVersFSRS, basculerVersFSRS, filetEtalement, chargeParJour, contenuCanonique, SEUIL_FILET } from '../../src/medrevise/scheduler/migration.js';
import { midi, ajouterJours } from '../../src/medrevise/scheduler/jours.js';

const JOUR = '2026-10-10';
const ici = (jour, h = 10) => new Date(midi(jour).getTime() + (h - 12) * 3600000);
let ancien; // modules du code d'avant (tag pre-fsrs-2026-10-10)

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'medrevise-avant-'));
  for (const f of ['sm2.js', 'planning.js', 'apprentissageFC.js']) {
    writeFileSync(join(dir, f), execSync(`git show pre-fsrs-2026-10-10:src/medrevise/lib/${f}`, { encoding: 'utf8', maxBuffer: 1 << 26 }));
  }
  ancien = { planning: await import(join(dir, 'planning.js')), sm2: await import(join(dir, 'sm2.js')) };
});
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(ici(JOUR)); });
afterEach(() => vi.useRealTimers());

const planifieeDe = (db) => { const ix = planning.index(db); return (q) => planning.isFicheScheduled(db, ix.fById[q.ficheId], ix); };

describe.skipIf(!sauvegardePresente)('conversion du mode Apprentissage (copie de la sauvegarde)', () => {
  it('297 cartes converties, 77 dans la séance du jour, 0 dans le rattrapage, rien d’autre touché', () => {
    const db = chargerDb();
    const avant = JSON.parse(JSON.stringify(db.questions));
    const { maj, rapport } = convertirApprentissage(db.questions, planifieeDe(db), JOUR);
    expect(rapport.enApprentissage).toBe(297);
    expect(rapport.converties).toBe(297);
    expect(rapport.seanceDuJour).toBe(77);
    expect(rapport.enRattrapageApres).toBe(0);
    const parId = Object.fromEntries(maj.map((q) => [q.id, q]));
    const apres = { ...db, questions: db.questions.map((q) => parId[q.id] || q) };
    // rattrapage : aucune carte convertie
    const retard = new Set(planning.overdueQuestions(apres).map((q) => q.id));
    expect(maj.filter((q) => retard.has(q.id))).toHaveLength(0);
    // séance du jour : les 77 y sont, avec les 39 révisions déjà dues
    const dues = new Set(planning.dueToday(apres).map((q) => q.id));
    expect(maj.filter((q) => q.conversionApprentissage.seanceDuJour && dues.has(q.id))).toHaveLength(77);
    // seuls dueDate et le champ ajouté changent ; les autres cartes sont intactes
    for (const q of maj) {
      const o = avant.find((x) => x.id === q.id);
      const { dueDate, conversionApprentissage, ...reste } = q; // eslint-disable-line no-unused-vars
      const { dueDate: d0, ...reste0 } = o; // eslint-disable-line no-unused-vars
      expect(reste).toEqual(reste0);
      expect(dueDate >= JOUR).toBe(true);
    }
    // idempotente
    expect(convertirApprentissage(apres.questions, planifieeDe(apres), ajouterJours(JOUR, 3)).maj).toHaveLength(0);
  });
  it('avant que la migration n’écrive, la lecture des dates donne déjà le résultat converti (jamais de rattrapage)', () => {
    const db = chargerDb();
    const retard = planning.overdueQuestions(db).filter((q) => q.type === 'flashcard' && q.learnState === 'learning');
    expect(retard).toHaveLength(0);
  });
});

describe.skipIf(!sauvegardePresente)('interrupteur OFF = dates strictement identiques à avant l’installation', () => {
  it('200 cartes : même prochaine date que l’ancien code, même résultat de notation que l’ancien moteur', () => {
    const db = chargerDb();
    const cartes = db.questions.filter((q) => q.type === 'flashcard' && q.learnState !== 'learning').slice(0, 200);
    expect(cartes).toHaveLength(200);
    expect(cartes.filter((q) => q.skippedOn).length).toBeGreaterThan(0);
    const anciennes = { fail: 1, hard: 3, easy: 5 };
    const nouvelles = { fail: 1, hard: 2, easy: 4 };
    for (const c of cartes) {
      expect(planning.nextDate(c)).toBe(ancien.planning.nextDate(c));
      for (const b of ['fail', 'hard', 'easy']) {
        const vieux = ancien.sm2.advanceQuestion(c, anciennes[b]);
        const { carte } = noterFlashcard(c, nouvelles[b], { reglages: null, maintenant: ici(JOUR) });
        const { fsrs, ...sansFsrs } = carte; // eslint-disable-line no-unused-vars
        expect(sansFsrs).toEqual(vieux);
      }
      // Correct (nouveau bouton) = ancien « Facile »
      expect(noterFlashcard(c, 3, { reglages: null, maintenant: ici(JOUR) }).carte.dueDate).toBe(advanceQuestion(c, 5).dueDate);
    }
  });
  it('calendrier, série du jour et rattrapage sur 30 jours : identiques pour toutes les cartes non concernées par la conversion', () => {
    const db = chargerDb();
    const horsConversion = (l) => l.filter((q) => !(q.type === 'flashcard' && q.learnState === 'learning')).map((q) => q.id).sort();
    for (let i = 0; i < 30; i++) {
      const d = ajouterJours(JOUR, i);
      expect(horsConversion(planning.dueOn(db, d))).toEqual(horsConversion(ancien.planning.dueOn(db, d)));
    }
    expect(horsConversion(planning.overdueQuestions(db))).toEqual(horsConversion(ancien.planning.overdueQuestions(db)));
    const ix = planning.index(db);
    for (const f of db.fiches) expect(planning.ficheJ(db, f.id, ix).jLabel).toBeTypeOf('string');
  });
});

describe.skipIf(!sauvegardePresente)('migration FSRS sur copie = rapport parfait', () => {
  it('total avant = après, 0 écart de date par carte, charge sur 30 jours identique, contenu identique', () => {
    const db = chargerDb();
    const fc = db.questions.filter((q) => q.type === 'flashcard');
    const { maj, rapport } = migrerVersFSRS(db.questions, JOUR, null);
    expect(maj).toHaveLength(fc.length);
    expect(rapport.migrees).toBe(894);
    expect(rapport.ecartsDueDate).toBe(0);
    expect(rapport.ecartsContenu).toBe(0);
    expect(rapport.parSource.historique).toBe(582);
    const parId = Object.fromEntries(maj.map((q) => [q.id, q]));
    for (const c of fc) { expect(parId[c.id].dueDate ?? null).toBe(c.dueDate ?? null); expect(parId[c.id].fsrs.due).toBe(c.dueDate ?? null); expect(contenuCanonique(parId[c.id])).toBe(contenuCanonique(c)); }
    const av = chargeParJour(fc, planning.nextDate, JOUR); const ap = chargeParJour(fc.map((c) => parId[c.id]), planning.nextDate, JOUR);
    expect(ap).toEqual(av);
    expect(migrerVersFSRS(maj, JOUR, null).maj).toHaveLength(0); // idempotente
  });
  it('ON juste après la migration : aucune date modifiée, pas d’étalement', () => {
    const db = chargerDb();
    const { maj } = migrerVersFSRS(db.questions, JOUR, null);
    const parId = Object.fromEntries(maj.map((q) => [q.id, q]));
    const migrees = db.questions.map((q) => parId[q.id] || q);
    const b = basculerVersFSRS(migrees, JOUR, { planificateur: 'fsrs', fsrsMigration: {} }, planifieeDe(db));
    expect(b.rapport.datesModifiees).toBe(0);
    expect(b.rapport.etalement).toHaveLength(0);
    for (const q of b.maj) expect(q.dueDate).toBe(db.questions.find((x) => x.id === q.id).dueDate);
  });
});

describe('filet de la bascule', () => {
  it('si une bascule mettait plus de 80 cartes dues le même jour, l’excédent est étalé sur 7 jours', () => {
    const avant = Array.from({ length: 150 }, (_, i) => ({ id: 'k' + i, type: 'flashcard', dueDate: i < 30 ? '2026-10-15' : ajouterJours('2026-10-16', i % 20), fsrs: { due: null } }));
    // afflux simulé : 120 cartes déplacées vers le 15/10 (30 y étaient déjà) → 150 ce jour-là
    const apres = avant.slice(30).map((c) => ({ ...c, dueDate: '2026-10-15', fsrs: { due: '2026-10-15' } }));
    const { maj, etalement } = filetEtalement(avant, apres);
    expect(etalement).toHaveLength(150 - SEUIL_FILET);
    const final = new Map(avant.map((c) => [c.id, c])); maj.forEach((c) => final.set(c.id, c));
    const le15 = [...final.values()].filter((c) => c.dueDate === '2026-10-15').length;
    expect(le15).toBe(SEUIL_FILET);
    expect(new Set(etalement.map((e) => e.vers))).toEqual(new Set(Array.from({ length: 7 }, (_, i) => ajouterJours('2026-10-15', i + 1))));
    for (const c of maj) expect(c.fsrs.due).toBe(c.dueDate);
    expect([...final.values()].filter((c) => c.id < 'k30' && c.id.length === 3 && c.dueDate !== '2026-10-15')).toHaveLength(0);
  });
  it('aucun ajout au-delà du seuil (cas réel : dates conservées) → rien n’est étalé', () => {
    const cartes = Array.from({ length: 120 }, (_, i) => ({ id: 'k' + i, type: 'flashcard', dueDate: '2026-10-15', intervalDays: 3, historique: [], fsrs: null }));
    expect(basculerVersFSRS(cartes, JOUR, { planificateur: 'fsrs', fsrsMigration: {} }).rapport.etalement).toHaveLength(0);
  });
});
