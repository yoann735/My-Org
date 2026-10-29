// (29/10) File d'envoi : envoi par lots, retrait confirmé, purge des entrées déjà au cloud (docs/compte-rendu-statut-synchro.md).
// Faux client Supabase en mémoire (RPC medrevise_push conditionnelle + lecture paginée), IndexedDB simulé (fake-indexeddb).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const cloud = new Map(); // store:id → ligne
const appels = { rpc: [], panneAuLot: null, pendantVol: null };
const lire = (sel) => ({
  _f: [], select() { return this; }, order() { return this; }, not() { return this; }, eq(k, v) { this._f.push([k, v]); return this; },
  range(a, b) {
    const t = [...cloud.values()].filter((r) => this._f.every(([k, v]) => r[k] === v)).sort((x, y) => (x.store + x.record_id).localeCompare(y.store + y.record_id));
    return Promise.resolve({ data: t.slice(a, b + 1).map((r) => (sel ? { store: r.store, record_id: r.record_id, updated_at: r.updated_at, deleted: r.deleted } : r)), error: null });
  },
});
vi.mock('../../src/medrevise/data/supabaseClient.js', () => ({
  SYNC_ENABLED: true, RECORDS_TABLE: 'medrevise_records', BLOBS_BUCKET: 'b',
  supabase: {
    rpc: async (_n, { records }) => {
      appels.rpc.push(records.length);
      if (appels.panneAuLot === appels.rpc.length) return { error: { message: 'canceling statement due to statement timeout', code: '57014' } };
      if (appels.pendantVol) { const f = appels.pendantVol; appels.pendantVol = null; await f(); }
      for (const r of records) {
        const k = r.store + ':' + r.record_id, cur = cloud.get(k);
        if (!cur || Date.parse(r.updated_at) > Date.parse(cur.updated_at)) cloud.set(k, { ...r });
      }
      return { data: records.length, error: null };
    },
    from: () => ({ select: (s) => lire(!/data/.test(s)).select() }),
    storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) },
  },
}));

const sync = await import('../../src/medrevise/data/sync.js');
const storage = await import('../../src/medrevise/lib/storage.js');
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const T = '2026-10-28T17:43:00.000Z';

async function remplir(n, quand = T) {
  for (let i = 0; i < n; i++) sync.queuePush('questions', 'q' + i, { id: 'q' + i, updatedAt: quand }, quand);
  await attendre(50);
}
async function vider() { for (const [k] of await sync.outboxEntries()) await sync.retirerSiInchange([[k, (await sync.outboxEntries()).find(([x]) => x === k)[1]]]); }

beforeEach(async () => { cloud.clear(); appels.rpc = []; appels.panneAuLot = null; appels.pendantVol = null; await vider(); });

describe('file d’envoi', () => {
  it('4469 entrées : envoyées par lots de 200, progression publiée, file vide à la fin', async () => {
    await remplir(4469);
    const vus = []; const fin = sync.surProgressionEnvoi((p) => vus.push(p));
    const r = await sync.flushOutbox();
    fin();
    expect(r).toMatchObject({ ok: true, envoyes: 4469, restants: 0 });
    expect(appels.rpc.every((n) => n <= sync.TAILLE_LOT)).toBe(true);
    expect(appels.rpc.length).toBe(Math.ceil(4469 / sync.TAILLE_LOT));
    expect(vus[0]).toEqual({ faits: 0, total: 4469 });
    expect(vus).toContainEqual({ faits: 1200, total: 4469 });
    expect(vus.at(-1)).toBe(null);
    expect(await sync.outboxCount()).toBe(0);
    expect(cloud.size).toBe(4469);
  });
  it('échec serveur au 2ᵉ lot : le 1ᵉʳ lot est sorti, le reste attend ; erreur = serveur (pas réseau)', async () => {
    await remplir(450);
    appels.panneAuLot = 2;
    const r = await sync.flushOutbox();
    expect(r).toMatchObject({ ok: false, envoyes: 200, restants: 250, erreur: 'serveur' });
    expect(await sync.outboxCount()).toBe(250);
  });
  it('écriture faite PENDANT l’envoi : la nouvelle version reste en file (avant : effacée avec l’ancienne)', async () => {
    await remplir(3);
    appels.pendantVol = async () => { sync.queuePush('questions', 'q1', { id: 'q1' }, '2026-10-29T10:00:00.000Z'); await attendre(30); };
    await sync.flushOutbox();
    const reste = await sync.outboxEntries();
    expect(reste.map(([k, v]) => [k, v.updated_at])).toEqual([['questions:q1', '2026-10-29T10:00:00.000Z']]);
  });
});

describe('purge au démarrage (outbox alignée sur le cloud)', () => {
  it('entrées dont le cloud a la même version : retirées après sauvegarde ; vrais écarts : gardés', async () => {
    for (let i = 0; i < 5; i++) cloud.set('questions:q' + i, { store: 'questions', record_id: 'q' + i, data: {}, updated_at: '2026-10-28T17:43:00+00:00', deleted: false });
    await remplir(5);
    sync.queuePush('questions', 'q9', { id: 'q9' }, T); // absent du cloud → vrai écart
    sync.queuePush('questions', 'q4', { id: 'q4' }, '2026-10-29T08:00:00.000Z'); // plus récent que le cloud → vrai écart
    await attendre(50);
    const r = await storage.purgerOutboxAligne();
    expect(r).toMatchObject({ ok: true, retires: 4, restants: 2 });
    expect((await sync.outboxEntries()).map(([k]) => k).sort()).toEqual(['questions:q4', 'questions:q9']);
    const { keys, createStore } = await import('idb-keyval');
    const sauvegardes = await keys(createStore('medrevise-backups', 'v1'));
    expect(sauvegardes.some((k) => String(k).startsWith('pre-purge-outbox-'))).toBe(true);
  });
  it('fonction pure : même instant écrit différemment (Z / +00:00) = même version ; tombstone ≠ vivant', () => {
    const ob = [['questions:a', { store: 'questions', record_id: 'a', updated_at: '2026-10-28T17:43:00.800Z', deleted: false }],
      ['questions:b', { store: 'questions', record_id: 'b', updated_at: T, deleted: true }]];
    const meta = [{ store: 'questions', record_id: 'a', updated_at: '2026-10-28T17:43:00.8+00:00', deleted: false },
      { store: 'questions', record_id: 'b', updated_at: T, deleted: false }];
    expect(storage.entreesDejaAuCloud(ob, meta).map(([k]) => k)).toEqual(['questions:a']);
  });
});
