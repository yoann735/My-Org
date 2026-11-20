// Séance : Passer / Précédente / renotation (lib/retourSeance.js) — 20/11/2026,
// docs/compte-rendu-seance-passer-precedente-et-formulaire-fc.md. Fuseau Europe/Brussels, fuzz désactivé (VITEST).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { noterFlashcard, passerEnRevision } from '../../src/medrevise/scheduler/noter.js';
import { reconstruire } from '../../src/medrevise/scheduler/fsrs.js';
import { midi, ajouterJours } from '../../src/medrevise/scheduler/jours.js';
import { acteEcrit, acteSansEcriture, restaurer, entreeAnnulation, sansAnnulees, champsTouches, remplacerContribution, estAnnulable } from '../../src/medrevise/lib/retourSeance.js';
import { compterVues } from '../../src/medrevise/lib/vuesCartes.js';

const ON = { planificateur: 'fsrs', fsrsMigration: { le: '2026-10-10' } };
const ici = (jour, heure = '10:00') => { const [h, m] = heure.split(':').map(Number); const t = midi(jour); return new Date(t.getTime() + ((h - 12) * 60 + m) * 60000); };
const revision = (I, dueDate, id = 'r1') => ({ id, type: 'flashcard', recto: 'R', verso: 'V', dueDate, intervalDays: I, capped: false, termine: false, missed: 0, historique: [{ date: ajouterJours(dueDate, -I), qualite: 5 }], updatedAt: '2026-10-01T00:00:00.000Z' });
const nouvelle = (id = 'n1') => ({ id, type: 'flashcard', recto: 'R', verso: 'V', nouvelle: true, dueDate: '2026-10-10', historique: [] });

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(ici('2026-10-10')); });
afterEach(() => vi.useRealTimers());

/** notation telle que la séance la fait : carte écrite + acte gardé */
const noter = (carte, note, reglages, maintenant) => {
  const { carte: maj, entree } = noterFlashcard(carte, note, { reglages, maintenant });
  return { carte: maj, entree, acte: acteEcrit('note', carte, maj, { note, le: maintenant.toISOString(), entreeId: entree.id }) };
};

describe('renoter = noter directement', () => {
  for (const reglages of [ON, null]) {
    it(`Facile puis Difficile ≡ Difficile directement (${reglages ? 'FSRS ON' : 'OFF, ombre'})`, () => {
      const c0 = revision(5, '2026-10-10');
      const t = ici('2026-10-10', '09:12');
      const direct = noterFlashcard(c0, 2, { reglages, maintenant: t }).carte;
      const facile = noter(c0, 4, reglages, t);
      expect(facile.carte.dueDate).not.toBe(direct.dueDate);
      // 20 min plus tard : retour, annulation, nouvelle note à l'heure d'origine
      vi.setSystemTime(ici('2026-10-10', '09:32'));
      const remise = restaurer(facile.carte, facile.acte);
      expect(remise).toEqual(c0); // exactement comme avant la notation
      const renotee = noterFlashcard(remise, 2, { reglages, maintenant: new Date(facile.acte.le) }).carte;
      expect(renotee.dueDate).toBe(direct.dueDate);
      expect(renotee.fsrs).toEqual(direct.fsrs);
      expect(renotee.historique).toEqual(direct.historique);
      expect(renotee.intervalDays).toBe(direct.intervalDays);
    });
  }
  it('ce qui a été fait APRÈS la notation sur la carte (étoile, texte) est gardé par la restauration', () => {
    const c0 = revision(3, '2026-10-10');
    const n = noter(c0, 3, ON, ici('2026-10-10'));
    const apres = { ...n.carte, aApprendre: true, verso: 'V modifié', updatedAt: '2026-10-10T08:30:00.000Z' };
    const remise = restaurer(apres, n.acte);
    expect(remise.aApprendre).toBe(true);
    expect(remise.verso).toBe('V modifié');
    expect(remise.dueDate).toBe(c0.dueDate);
    expect(remise.fsrs).toBeUndefined(); // jamais notée par FSRS avant : bloc retiré
    expect(remise.historique).toEqual(c0.historique);
  });
  it('les champs d’affichage (_fiche…) ne sont ni comptés ni restaurés', () => {
    const c0 = { ...revision(3, '2026-10-10'), _fiche: { id: 'f' } };
    const n = noter(c0, 3, ON, ici('2026-10-10'));
    expect(n.acte.touches.some((k) => k.startsWith('_'))).toBe(false);
    expect('_fiche' in restaurer(n.carte, n.acte)).toBe(false);
  });
  it('Nouvelle : « Passer en révision » annulé → carte identique à avant (toujours Nouvelle)', () => {
    const c0 = nouvelle();
    const t = ici('2026-10-10');
    const { carte: maj, entree } = passerEnRevision(c0, { reglages: ON, maintenant: t });
    const acte = acteEcrit('passage', c0, maj, { le: t.toISOString(), entreeId: entree.id });
    expect(restaurer(maj, acte)).toEqual(c0);
  });
  it('Passer / Garder : rien à annuler, aucun champ touché', () => {
    const c0 = revision(3, '2026-10-10');
    for (const type of ['skip', 'garder']) {
      const a = acteSansEcriture(type);
      expect(estAnnulable(a)).toBe(false);
      expect(restaurer(c0, a)).toBe(c0);
    }
    expect(champsTouches(c0, { ...c0 })).toEqual([]);
  });
});

describe('journal : annulation en ajout seul', () => {
  it('entrée d’annulation : rating null, référence la ligne annulée ; sansAnnulees la retire, rien n’est modifié', () => {
    const c0 = revision(5, '2026-10-10');
    const t = ici('2026-10-10');
    const facile = noter(c0, 4, ON, t);
    const remise = restaurer(facile.carte, facile.acte);
    const annul = entreeAnnulation(facile.carte, remise, facile.acte, { reglages: ON, maintenant: ici('2026-10-10', '10:05') });
    expect(annul.rating).toBeNull();
    expect(annul.details).toMatchObject({ evenement: 'annulation', annule: facile.entree.id, acte: 'note', noteAnnulee: 4 });
    const difficile = noterFlashcard(remise, 2, { reglages: ON, maintenant: t }).entree;
    const journal = [facile.entree, annul, difficile];
    const gele = JSON.stringify(journal);
    const effectif = sansAnnulees(journal);
    expect(effectif.map((e) => e.id)).toEqual([annul.id, difficile.id]);
    expect(JSON.stringify(journal)).toBe(gele); // aucune entrée modifiée
    // reconstruction FSRS depuis le journal effectif = la note Difficile seule
    const bloc = reconstruire(c0, effectif.filter((e) => e.card_id === c0.id));
    const direct = noterFlashcard(c0, 2, { reglages: ON, maintenant: t }).carte.fsrs;
    expect(bloc.due).toBe(direct.due);
    expect(bloc.stability).toBeCloseTo(direct.stability, 6);
  });
  it('compteur de vues : une carte renotée compte UNE fois, quel que soit l’ordre d’arrivée', () => {
    const c0 = revision(5, '2026-10-10');
    const t = ici('2026-10-10');
    const facile = noter(c0, 4, ON, t);
    const remise = restaurer(facile.carte, facile.acte);
    const annul = entreeAnnulation(facile.carte, remise, facile.acte, { reglages: ON });
    const difficile = noterFlashcard(remise, 2, { reglages: ON, maintenant: t }).entree;
    const ordres = [[facile.entree, annul, difficile], [annul, difficile, facile.entree], [difficile, facile.entree, annul]];
    for (const o of ordres) expect(compterVues(o).get(c0.id)).toBe(1);
    // incrémental : entrée par entrée (comme les abonnés du journal), doublons ignorés
    const comptes = new Map(); const vus = new Set(); const annulees = new Set();
    for (const e of [facile.entree, facile.entree, annul, annul, difficile]) compterVues([e], comptes, vus, annulees);
    expect(comptes.get(c0.id)).toBe(1);
  });
});

describe('compteurs de la séance', () => {
  const z = { revisions: 0, rates: 0, notees: 0, passees: 0, gardees: 0, sautees: 0 };
  it('passer, renoter, changer de choix : chaque carte compte une fois', () => {
    let f = { ...z };
    const note1 = { type: 'note', note: 1 }, note3 = { type: 'note', note: 3 };
    f = remplacerContribution(f, null, acteSansEcriture('skip'));
    expect(f).toMatchObject({ revisions: 0, sautees: 1 });
    f = remplacerContribution(f, acteSansEcriture('skip'), note1); // carte passée, retrouvée puis notée
    expect(f).toMatchObject({ revisions: 1, notees: 1, rates: 1, sautees: 0 });
    f = remplacerContribution(f, note1, note3); // renotée
    expect(f).toMatchObject({ revisions: 1, notees: 1, rates: 0 });
    f = remplacerContribution(f, null, { type: 'garder' });
    f = remplacerContribution(f, { type: 'garder' }, { type: 'passage' });
    expect(f).toMatchObject({ revisions: 2, gardees: 0, passees: 1 });
  });
});
