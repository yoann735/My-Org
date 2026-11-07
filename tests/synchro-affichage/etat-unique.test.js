// (07/11) ÉTAT DE SYNCHRO UNIQUE (lib/etatSynchro.js) et forme exacte d'un id de blob (lib/storage.js estIdDeBlob)
// — docs/compte-rendu-sauvegarde-et-statut-synchro.md. IndexedDB simulé (fake-indexeddb), faux Supabase en mémoire.
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const bucket = new Set();
vi.mock('../../src/medrevise/data/supabaseClient.js', () => ({
  SYNC_ENABLED: true, RECORDS_TABLE: 'medrevise_records', BLOBS_BUCKET: 'b',
  supabase: {
    rpc: async () => ({ error: { message: 'refusé', code: '42501', status: 403 } }),
    from: () => ({ select() { return this; }, order() { return this; }, range: async () => ({ data: [], error: null }) }),
    storage: { from: () => ({ list: async () => ({ data: [...bucket].map((name) => ({ name })), error: null }) }) },
  },
}));

const { calculerEtatSynchro, collecterEnAttente } = await import('../../src/medrevise/lib/etatSynchro.js');
const storage = await import('../../src/medrevise/lib/storage.js');
const sync = await import('../../src/medrevise/data/sync.js');

const porte = (phase, at = '2026-11-07T10:00:00.000Z') => ({ phase, at, depuis: at });
const liste = (n, le = '2026-11-07T10:00:01.000Z') => ({ elements: Array.from({ length: n }, (_, i) => ({ cle: 'x' + i })), le });

describe('calcul unique (en-tête = Réglages)', () => {
  it('« À jour » seulement si la passe est confirmée ET la liste, recalculée après, est vide', () => {
    expect(calculerEtatSynchro(porte('ajour'), liste(0))).toMatchObject({ code: 'ajour', n: 0 });
    expect(calculerEtatSynchro(porte('ajour'), liste(0)).libelle).toMatch(/^À jour · \d\d:\d\d$/);
    expect(calculerEtatSynchro(porte('ajour'), liste(19))).toMatchObject({ code: 'enattente', n: 19, libelle: '19 en attente' });
    // liste plus ancienne que la passe : pas encore de verdict → jamais un faux « À jour »
    expect(calculerEtatSynchro(porte('ajour'), liste(0, '2026-11-07T09:59:00.000Z')).code).toBe('attente');
    expect(calculerEtatSynchro(porte('ajour'), null).code).toBe('attente');
  });
  it('hors ligne / échec / incomplet : l’erreur réelle, avec le nombre en attente', () => {
    expect(calculerEtatSynchro(porte('horsligne'), liste(2)).libelle).toMatch(/^Hors ligne · dernière synchro .* · 2 en attente$/);
    expect(calculerEtatSynchro(porte('echec'), liste(1))).toMatchObject({ code: 'echec', libelle: 'Synchro en échec · 1 en attente' });
    expect(calculerEtatSynchro(porte('echec'), liste(0)).libelle).toBe('Synchro en échec');
    expect(calculerEtatSynchro(porte('attente'), liste(3)).code).toBe('attente');
    expect(calculerEtatSynchro({ phase: 'local' }, liste(3))).toMatchObject({ code: 'local', n: 0, libelle: null });
  });
});

describe('id de blob (cause des 19 faux « fichiers manquants »)', () => {
  it('genId(\'b\') est reconnu ; bfc… / bc… / bi… / bf… ne le sont pas', () => {
    expect(storage.estIdDeBlob(storage.genId('b'))).toBe(true);
    expect(storage.estIdDeBlob('bmvz7lnvw6uty')).toBe(true);
    for (const p of ['bfc', 'bc', 'bi', 'bf']) expect(storage.estIdDeBlob(storage.genId(p))).toBe(false);
    expect(storage.estIdDeBlob('bfcmvz7fo34z2na')).toBe(false);
    expect(storage.estIdDeBlob('biologie')).toBe(false);
  });
});

describe('liste des éléments en attente (lecture seule)', () => {
  beforeEach(async () => { bucket.clear(); });
  it('carte « Boîte → Flashcard » (srcId bfc…) : 0 élément ; image réellement absente du cloud : 1 élément', async () => {
    const img = storage.genId('b');
    await storage.put('questions', { id: 'q1', type: 'flashcard', recto: 'C’est quoi le RE', srcId: storage.genId('bfc'), imageId: img });
    bucket.add(img);
    let e = await collecterEnAttente({ avecCloud: true });
    expect(e.elements.filter((x) => x.type === 'fichier')).toHaveLength(0);
    const avant = (await sync.outboxEntries()).length;
    expect(e.elements.filter((x) => x.type === 'enregistrement').map((x) => x.titre)).toContain('C’est quoi le RE');
    bucket.clear(); // l'image n'est plus au cloud ni ici
    e = await collecterEnAttente({ avecCloud: true });
    const f = e.elements.filter((x) => x.type === 'fichier');
    expect(f).toHaveLength(1);
    expect(f[0].raison).toMatch(/ni sur cet appareil ni au cloud/);
    expect((await sync.outboxEntries()).length).toBe(avant); // AUCUNE entrée retirée par la collecte
  });
});
