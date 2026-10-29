// (29/10) Synchro incrémentale (docs/compte-rendu-synchro-rapide-surlignage-listes.md) : vérification légère, tirage de
// ce qui a changé seulement, fusion aux règles de reconcileAll ; porte : passe rapide / complète / vérification de fond.
// Faux client Supabase en mémoire (RPC conditionnelle, lecture avec filtres gte/not in, tri, nombre de lignes), IndexedDB simulé.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { creerPorte } from '../../src/medrevise/lib/synchroAffichage.js';

const cloud = new Map(); // store:id → ligne
const lectures = []; // { cols, lignes } : ce que chaque lecture a transporté
const requete = (cols, opts = {}) => {
  const q = { _f: [], _o: [], _lim: null,
    not(k, _op, v) { const vals = v.slice(1, -1).split(','); this._f.push((r) => !vals.includes(r[k])); return this; },
    eq(k, v) { this._f.push((r) => r[k] === v); return this; },
    gte(k, v) { this._f.push((r) => Date.parse(r[k]) >= Date.parse(v)); return this; },
    in(k, vals) { this._f.push((r) => vals.includes(r[k])); return this; },
    order(c, { ascending = true } = {}) { this._o.push([c, ascending ? 1 : -1]); return this; },
    limit(n) { this._lim = n; return this.executer(0, n - 1); },
    range(a, b) { return this.executer(a, b); },
    then(ok, ko) { return this.executer(0, 1e9).then(ok, ko); }, // requête attendue sans range/limit (in(...))
    executer(a, b) {
      let t = [...cloud.values()].filter((r) => this._f.every((f) => f(r)));
      const o = this._o.length ? this._o : [['store', 1], ['record_id', 1]];
      t.sort((x, y) => { for (const [c, k] of o) { const u = String(x[c]), v = String(y[c]); if (u !== v) return (u < v ? -1 : 1) * k; } return 0; });
      const n = t.length; t = t.slice(a, b + 1);
      const lignes = cols === '*' ? t : t.map((r) => Object.fromEntries(cols.split(',').map((c) => [c, r[c]])));
      lectures.push({ cols, n: lignes.length });
      return Promise.resolve({ data: lignes, error: null, count: opts.count ? n : null });
    } };
  return q;
};
vi.mock('../../src/medrevise/data/supabaseClient.js', () => ({
  SYNC_ENABLED: true, RECORDS_TABLE: 'medrevise_records', BLOBS_BUCKET: 'b',
  supabase: {
    rpc: async (_n, { records }) => {
      for (const r of records) { const k = r.store + ':' + r.record_id, cur = cloud.get(k); if (!cur || Date.parse(r.updated_at) > Date.parse(cur.updated_at)) cloud.set(k, { ...r }); }
      return { data: records.length, error: null };
    },
    from: () => ({ select: (cols, opts) => requete(cols.includes('data') ? '*' : cols, opts) }),
    storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) },
  },
}));
const S = await import('../../src/medrevise/lib/storage.js');
const Y = await import('../../src/medrevise/data/sync.js');
const T = await import('../../src/medrevise/lib/syncStatus.js');

const ligne = (store, id, iso, data = {}, deleted = false) => ({ store, record_id: id, data: { id, ...data, updatedAt: iso }, updated_at: iso, deleted });
const poserCloud = (...ls) => ls.forEach((l) => cloud.set(l.store + ':' + l.record_id, l));
const { clear, createStore } = await import('idb-keyval');
const viderLocal = async () => { for (const n of S.SYNCABLE_STORES) await clear(createStore('medrevise-' + n, 'v1')); await clear(createStore('medrevise-outbox', 'v1')); };

beforeEach(async () => {
  cloud.clear(); lectures.length = 0; await viderLocal();
});

describe('synchro incrémentale (storage.js#syncRapide)', () => {
  it('vérification légère : nombre de lignes + updated_at max, sans `data`', async () => {
    poserCloud(ligne('questions', 'q1', '2026-10-29T08:00:00.000Z'), ligne('questions', 'q2', '2026-10-29T09:00:00.000Z'), ligne('transcript_session', 't1', '2026-10-29T10:00:00.000Z'));
    poserCloud(ligne('questions', 'q0', '2026-10-28T08:00:00.000Z', {}, true)); // tombstone : compte dans n, pas dans les vivantes
    expect(await Y.etatLegerCloud(S.SYNCABLE_STORES)).toEqual({ n: 3, maxMaj: '2026-10-29T09:00:00.000Z', vivants: 2 }); // stores isolés exclus
    expect(lectures.slice(-2).map((l) => l.n)).toEqual([1, 1]); // une ligne par requête, aucun contenu
    expect(lectures.every((l) => l.cols !== '*')).toBe(true);
  });
  it('rien n’a changé depuis le curseur : aucune ligne téléchargée', async () => {
    poserCloud(ligne('questions', 'q1', '2026-10-29T08:00:00.000Z'));
    await S.reconcileAll();
    lectures.length = 0;
    const r = await S.syncRapide({ n: 1, maxMaj: '2026-10-29T08:00:00.000Z' });
    expect(r.status).toBe('ok'); expect(r.recues).toBe(0); expect(r.stores.size).toBe(0);
    expect(lectures.filter((l) => l.cols === '*')).toEqual([]); // aucun contenu transporté
  });
  it('réponses données ailleurs : seules les lignes modifiées sont tirées et appliquées', async () => {
    for (let i = 0; i < 50; i++) poserCloud(ligne('questions', 'q' + i, i === 49 ? '2026-10-28T08:00:00.000Z' : '2026-10-27T08:00:00.000Z', { n: 0 }));
    await S.reconcileAll();
    const cur = { n: 50, maxMaj: '2026-10-28T08:00:00.000Z' };
    for (let i = 0; i < 10; i++) poserCloud(ligne('questions', 'q' + i, '2026-10-29T12:00:0' + i + '.000Z', { n: 1 })); // 10 réponses sur l'autre appareil
    lectures.length = 0;
    const r = await S.syncRapide(cur);
    expect(r.status).toBe('ok');
    expect(r.recues).toBe(10); // q49, dans la marge sous le curseur, n'est relue qu'en MÉTADONNÉES (déjà à jour ici)
    expect(lectures.filter((l) => l.cols === '*').reduce((a, l) => a + l.n, 0)).toBe(10); // contenu des 10 seulement
    expect([...r.stores]).toEqual(['questions']); expect(r.cartes.length).toBe(10);
    expect((await S.getOne('questions', 'q3')).n).toBe(1);
    expect((await S.getOne('questions', 'q30')).n).toBe(0);
    expect(r.leger).toEqual({ n: 50, maxMaj: '2026-10-29T12:00:09.000Z', vivants: 50 });
    expect(r.ecart).toBe(false);
  });
  it('ligne arrivée avec une date ANCIENNE (horloge en retard) : hors du tirage, mais le nombre de lignes vivantes la trahit', async () => {
    for (let i = 0; i < 5; i++) poserCloud(ligne('questions', 'q' + i, '2026-10-29T08:00:00.000Z'));
    await S.reconcileAll();
    poserCloud(ligne('fiches', 'f-retard', '2026-10-20T08:00:00.000Z', { titre: 'écrite par un appareil en retard' }));
    const r = await S.syncRapide({ n: 5, maxMaj: '2026-10-29T08:00:00.000Z' });
    expect(r.status).toBe('ok');
    expect(await S.getOne('fiches', 'f-retard')).toBeUndefined(); // échappe au tirage incrémental…
    expect(r.ecart).toBe(true); // … mais la passe le sait : synchro complète, pas « À jour »
  });
  it('mêmes règles que reconcileAll : tombstone plus récent supprime, local plus récent repart au cloud, nouveau ajouté', async () => {
    poserCloud(ligne('questions', 'a', '2026-10-28T08:00:00.000Z'), ligne('questions', 'b', '2026-10-28T08:00:00.000Z'));
    await S.reconcileAll();
    await S.put('questions', { id: 'b', n: 'local', updatedAt: '2026-10-29T13:00:00.000Z' }); // local plus récent
    await Y.flushOutbox();
    poserCloud(ligne('questions', 'a', '2026-10-29T12:00:00.000Z', {}, true), ligne('questions', 'b', '2026-10-29T12:30:00.000Z', { n: 'cloud-ancien' }), ligne('fiches', 'f9', '2026-10-29T12:00:00.000Z', { titre: 'nouvelle' }));
    const r = await S.syncRapide({ n: 2, maxMaj: '2026-10-28T08:00:00.000Z' });
    expect(r.status).toBe('ok');
    expect(await S.getOne('questions', 'a')).toBeUndefined();
    expect((await S.getOne('fiches', 'f9')).titre).toBe('nouvelle');
    expect((await S.getOne('questions', 'b')).n).toBe('local');
    expect(cloud.get('questions:b').data.n).toBe('local'); // remis en file puis envoyé dans la passe
    expect(await Y.outboxCount()).toBe(0);
  });
  it('empreinte cloud : métadonnées seules (aucun contenu téléchargé)', async () => {
    poserCloud(ligne('questions', 'q1', '2026-10-29T08:00:00.000Z', { gros: 'x'.repeat(1000) }));
    lectures.length = 0;
    const c = await T.etatCloud();
    expect(c.n).toBe(1);
    expect(lectures.every((l) => l.cols !== '*')).toBe(true);
  });
  it('curseur rangé avec les données (IndexedDB `meta`)', async () => {
    await T.ecrireCurseur({ n: 3, maxMaj: '2026-10-29T08:00:00.000Z', hash: 'abc' });
    expect(await T.lireCurseur()).toMatchObject({ n: 3, hash: 'abc' });
  });
});

const horloge = () => { const m = []; return { maintenant: () => '2026-10-29T17:00:00.000Z', attendre: (ms, fn) => { const x = { fn, actif: true }; m.push(x); setTimeout(() => { if (x.actif) fn(); }, 0); return () => { x.actif = false; }; } }; };
describe('porte : passe rapide / complète', () => {
  it('curseur vérifié : passe rapide seulement → À jour, la passe complète n’est pas lancée', async () => {
    let completes = 0; const phases = [];
    const p = creerPorte({ passe: async () => { completes++; return { ok: true }; }, verifier: async () => ({ local: 'a', cloud: 'a', enAttente: 0 }),
      passeRapide: async () => ({ ok: true }), poser: (e) => phases.push(e.phase), enLigne: () => true, horloge: horloge() });
    expect((await p.lancer()).phase).toBe('ajour'); expect(completes).toBe(0); expect(phases).toEqual(['attente', 'ajour']);
  });
  it('pas de curseur (premier démarrage) : passe complète', async () => {
    let completes = 0;
    const p = creerPorte({ passe: async () => { completes++; return { ok: true }; }, verifier: async () => ({ local: 'a', cloud: 'a', enAttente: 0 }),
      passeRapide: async () => ({ ok: false, complet: true }), poser: () => {}, enLigne: () => true, horloge: horloge() });
    expect((await p.lancer()).phase).toBe('ajour'); expect(completes).toBe(1);
  });
  it('après une erreur du serveur, le lancement suivant est complet ; « Forcer » aussi', async () => {
    let rapides = 0, completes = 0, panne = true;
    const p = creerPorte({ passe: async () => { completes++; return panne ? { ok: false, erreur: 'serveur' } : { ok: true }; }, verifier: async () => ({ local: 'a', cloud: 'a', enAttente: 0 }),
      passeRapide: async () => { rapides++; return panne ? { ok: false, erreur: 'serveur' } : { ok: true }; }, poser: () => {}, enLigne: () => true, horloge: { maintenant: () => 'x', attendre: () => () => {} } });
    expect((await p.lancer()).phase).toBe('echec'); expect([rapides, completes]).toEqual([1, 0]);
    panne = false;
    expect((await p.lancer()).phase).toBe('ajour'); expect([rapides, completes]).toEqual([1, 1]);
    expect((await p.lancer()).phase).toBe('ajour'); expect([rapides, completes]).toEqual([2, 1]); // de nouveau rapide
    await p.lancer({ complet: true }); expect(completes).toBe(2);
  });
  it('coupure réseau : « Hors ligne », puis reprise toujours incrémentale', async () => {
    let rapides = 0, completes = 0, coupe = true;
    const p = creerPorte({ passe: async () => { completes++; return { ok: true }; }, verifier: async () => ({ local: 'a', cloud: 'a', enAttente: 0 }),
      passeRapide: async () => { rapides++; return coupe ? { ok: false, erreur: 'reseau' } : { ok: true }; }, poser: () => {}, enLigne: () => !coupe, horloge: { maintenant: () => 'x', attendre: () => () => {} } });
    expect((await p.lancer()).phase).toBe('horsligne');
    coupe = false;
    expect((await p.lancer()).phase).toBe('ajour'); expect(completes).toBe(0);
  });
  it('vérification de fond en écart : passe complète relancée aussitôt', async () => {
    let completes = 0; let fin;
    const relance = new Promise((r) => { fin = r; });
    const p = creerPorte({ passe: async () => { completes++; fin(); return { ok: true }; }, verifier: async () => ({ local: 'a', cloud: 'a', enAttente: 0 }),
      passeRapide: async () => ({ ok: true, aVerifier: true }), verifierFond: async () => 'ecart', poser: () => {}, enLigne: () => true, horloge: horloge() });
    expect((await p.lancer()).phase).toBe('ajour');
    await relance; expect(completes).toBe(1);
  });
});
