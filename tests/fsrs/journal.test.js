// Journal des révisions : fusion entre appareils, idempotence de l'envoi, file locale (IndexedDB simulé).
import { describe, it, expect } from 'vitest';
import { noterFlashcard } from '../../src/medrevise/scheduler/noter.js';
import { reconstruire, initialiser } from '../../src/medrevise/scheduler/fsrs.js';
import { midi, ajouterJours } from '../../src/medrevise/scheduler/jours.js';
import { fusionnerJournaux, versLigne, depuisLigne, memeBloc } from '../../src/medrevise/journal/fusion.js';
import { envoyerEntrees, recevoirEntrees } from '../../src/medrevise/journal/synchro.js';
import { ajouterAuJournal, integrerEntrees, entreesEnAttente, marquerEnvoyees, compteJournal } from '../../src/medrevise/journal/journal.js';

const ici = (jour, h = 10) => new Date(midi(jour).getTime() + (h - 12) * 3600000);
const carte = () => ({ id: 'c1', type: 'flashcard', recto: 'R', verso: 'V', dueDate: '2026-10-10', intervalDays: 5, capped: false, termine: false, missed: 0, historique: [{ date: '2026-10-05', qualite: 5 }] });

/** faux client Supabase : table en mémoire, upsert ignoreDuplicates = insert on conflict do nothing */
function fauxClient() {
  const table = new Map(); let seq = 0; const appels = [];
  return {
    table, appels,
    from() {
      return {
        upsert(lignes, opts) {
          appels.push({ n: lignes.length, opts });
          for (const l of lignes) if (!table.has(l.id) || !opts.ignoreDuplicates) table.set(l.id, { ...l, inserted_at: new Date(Date.UTC(2026, 9, 10, 12, 0, seq++)).toISOString() });
          return Promise.resolve({ error: null });
        },
        select() {
          let lignes = [...table.values()];
          const q = {
            gt(col, v) { lignes = lignes.filter((l) => l[col] > v); return q; },
            order(col) { lignes = lignes.slice().sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0)); return q; },
            range(a, b) { return Promise.resolve({ data: lignes.slice(a, b + 1), error: null }); },
          };
          return q;
        },
      };
    },
  };
}

describe('deux appareils hors ligne, même carte', () => {
  it('journal fusionné, état FSRS identique quel que soit l’ordre d’arrivée', () => {
    const c = { ...carte(), fsrs: initialiser(carte(), '2026-10-10') };
    // appareil A : Correct le 10/10 ; appareil B (hors ligne, n'a pas vu A) : À revoir le 12/10 puis Facile le 15/10
    const a1 = noterFlashcard(c, 3, { reglages: null, maintenant: ici('2026-10-10'), appareil: 'A' }).entree;
    const b1 = noterFlashcard(c, 1, { reglages: null, maintenant: ici('2026-10-12'), appareil: 'B' }).entree;
    const b2 = noterFlashcard(c, 4, { reglages: null, maintenant: ici('2026-10-15'), appareil: 'B' }).entree;
    const ordre1 = fusionnerJournaux([a1], [b1, b2]);
    const ordre2 = fusionnerJournaux([b2, b1], [a1], [b1]); // ordre inverse + doublon
    expect(ordre1.map((e) => e.id)).toEqual(ordre2.map((e) => e.id));
    expect(ordre1).toHaveLength(3);
    const s1 = reconstruire(c, ordre1);
    const s2 = reconstruire(c, [...ordre2].reverse());
    expect(memeBloc(s1, s2)).toBe(true);
    expect(s1.derniere).toBe('2026-10-15');
    expect(s1.reps).toBe((c.fsrs.reps || 0) + 3);
  });
  it('les répétitions de séance et les doublons du même jour ne comptent qu’une fois', () => {
    const c = { ...carte(), fsrs: initialiser(carte(), '2026-10-10') };
    const e1 = noterFlashcard(c, 1, { maintenant: ici('2026-10-10', 9) }).entree;
    const rep = noterFlashcard(c, 3, { maintenant: ici('2026-10-10', 9), relearn: true }).entree;
    const e2 = noterFlashcard(c, 3, { maintenant: ici('2026-10-10', 18) }).entree; // autre appareil, même jour
    const seul = reconstruire(c, [e1]);
    expect(memeBloc(reconstruire(c, [e1, rep, e2]), seul)).toBe(true);
  });
});

describe('envoi idempotent', () => {
  it('la même ligne envoyée deux fois ne crée pas de doublon', async () => {
    const client = fauxClient();
    const e = noterFlashcard(carte(), 3, { maintenant: ici('2026-10-10') }).entree;
    const r1 = await envoyerEntrees(client, [e]);
    const r2 = await envoyerEntrees(client, [e, e]);
    expect(r1.erreur).toBeNull(); expect(r2.erreur).toBeNull();
    expect(client.table.size).toBe(1);
    expect(client.appels.every((a) => a.opts.onConflict === 'id' && a.opts.ignoreDuplicates === true)).toBe(true);
    const rec = await recevoirEntrees(client, null);
    expect(rec.lignes.map(depuisLigne)).toEqual([{ ...depuisLigne(versLigne(e)) }]);
  });
  it('table absente côté cloud : erreur signalée, rien de marqué envoyé', async () => {
    const client = { from: () => ({ upsert: () => Promise.resolve({ error: { code: 'PGRST205', message: "Could not find the table 'public.medrevise_review_log'" } }) }) };
    const e = noterFlashcard(carte(), 3, { maintenant: ici('2026-10-10') }).entree;
    const r = await envoyerEntrees(client, [e]);
    expect(r.tableAbsente).toBe(true);
    expect(r.envoyees).toEqual([]);
  });
});

describe('file hors ligne locale (IndexedDB)', () => {
  it('une entrée ajoutée est en attente jusqu’à confirmation, jamais dupliquée', async () => {
    const e = noterFlashcard(carte(), 2, { maintenant: ici('2026-10-11') }).entree;
    const n0 = await compteJournal();
    expect(await ajouterAuJournal(e)).toBe(true);
    expect(await ajouterAuJournal(e)).toBe(false);
    expect((await entreesEnAttente()).map((x) => x.id)).toContain(e.id);
    await marquerEnvoyees([e.id]);
    expect((await entreesEnAttente()).map((x) => x.id)).not.toContain(e.id);
    // reçue d'un autre appareil : intégrée sans doublon ni remise en file
    const autre = noterFlashcard(carte(), 4, { maintenant: ici(ajouterJours('2026-10-11', 2)) }).entree;
    expect((await integrerEntrees([autre, e, autre])).map((x) => x.id)).toEqual([autre.id]);
    expect(await compteJournal()).toBe(n0 + 2);
    expect((await entreesEnAttente()).map((x) => x.id)).not.toContain(autre.id);
  });
});
