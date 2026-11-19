// (19/11) TESTS DE LA FILE DE SYNCHRO — lancés par `npm run build` (le build échoue si l'un d'eux échoue).
// Chaque hypothèse du diagnostic des « 74 en attente » (docs/compte-rendu-74-en-attente.md) a son test :
// refus de contrainte avalé (la cause), confirmation perdue, doublon, app tuée en plein envoi, hors ligne puis retour,
// conflit, refus de droits (RLS), file alimentée deux fois, empreinte qui couvre le journal, garde-fou de réconciliation.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { creerFauxServeur } from './fauxClient.js';

globalThis.__faux = creerFauxServeur();
vi.mock('../../src/medrevise/data/supabaseClient.js', () => ({
  SYNC_ENABLED: true, RECORDS_TABLE: 'medrevise_records', BLOBS_BUCKET: 'b',
  get supabase() { return globalThis.__faux.client; },
}));

const journal = await import('../../src/medrevise/journal/journal.js');
const synchro = await import('../../src/medrevise/journal/synchro.js');
const storage = await import('../../src/medrevise/lib/storage.js');
const statut = await import('../../src/medrevise/lib/syncStatus.js');
const etat = await import('../../src/medrevise/lib/etatSynchro.js');
const conf = await import('../../src/medrevise/lib/confirmationServeur.js');
const { clear, createStore, keys } = await import('idb-keyval');

const S_JOURNAL = createStore('medrevise-review_log', 'v1');
const S_ENVOI = createStore('medrevise-review_log_outbox', 'v1');
const S_BACKUPS = createStore('medrevise-backups', 'v1');
let n = 0;
const note = (rating = 3, carte = 'q1') => ({ id: 'e-' + (++n) + '-' + Math.random().toString(36).slice(2, 8), card_id: carte, rating, reviewed_at: new Date(Date.UTC(2026, 10, 19, 20, 0, n)).toISOString(), jour: '2026-11-19', device: 'téléphone:test', planificateur: 'maison', state_before: null, state_after: null, details: {} });
const passage = (carte = 'q2') => ({ ...note(null, carte), rating: null, details: { evenement: 'passage_revision' } });
const enFile = async () => (await journal.idsEnAttente()).length;
const sync = () => synchro.synchroniserJournal(globalThis.__faux.client, { complete: true });

beforeEach(async () => {
  globalThis.__faux = creerFauxServeur();
  await clear(S_JOURNAL); await clear(S_ENVOI); await clear(S_BACKUPS);
});

describe('la cause : événement sans note refusé par la contrainte (rating NOT NULL)', () => {
  it('reproduction de l\'ancien comportement : le refus est avalé, la passe dit ok, l\'événement reste à vie', async () => {
    // l'ancien code envoyait les événements à part et IGNORAIT l'erreur : on rejoue exactement cet appel
    const f = globalThis.__faux;
    const e = passage();
    const r = await synchro.envoyerEntrees(f.client, [e]);
    expect(r.erreur).toMatch(/check constraint/);
    expect(r.contrainte).toBe(true);
    expect(f.journal.size).toBe(0); // rien n'est arrivé au serveur
  });

  it('après correction : 10 « Passer en révision » → 10 en attente → 0 après la synchro, via le canal de repli', async () => {
    for (let i = 0; i < 10; i++) await journal.ajouterAuJournal(passage('q' + i));
    expect(await enFile()).toBe(10);
    const r = await sync();
    expect(r.ok).toBe(true);
    expect(await enFile()).toBe(0);
    const f = globalThis.__faux;
    expect([...f.records.values()].filter((x) => x.store === synchro.STORE_EVENEMENTS)).toHaveLength(10);
    expect(await journal.compteJournal()).toBe(10); // la donnée locale est conservée
  });

  it('migration appliquée ensuite : les nouveaux événements vont dans la table, aucun doublon', async () => {
    await journal.ajouterAuJournal(passage());
    await sync();
    globalThis.__faux.appliquerMigration();
    await journal.ajouterAuJournal(passage());
    await sync();
    expect(await enFile()).toBe(0);
    expect(globalThis.__faux.journal.size).toBe(1);
    expect([...globalThis.__faux.records.values()].filter((x) => x.store === synchro.STORE_EVENEMENTS)).toHaveLength(1);
  });

  it('10 notes → 10 en attente → 0 après la synchro, sur les deux appareils (réception par l\'autre)', async () => {
    for (let i = 0; i < 10; i++) await journal.ajouterAuJournal(note());
    expect(await enFile()).toBe(10);
    expect((await sync()).ok).toBe(true);
    expect(await enFile()).toBe(0);
    expect(globalThis.__faux.journal.size).toBe(10);
    // « second appareil » : journal local vidé, il reçoit tout
    await clear(S_JOURNAL); await storage.setMeta('journal.curseur', null);
    await sync();
    expect(await journal.compteJournal()).toBe(10);
    expect(await enFile()).toBe(0);
  });
});

describe('confirmation par le serveur', () => {
  it('confirmation perdue (envoyée, jamais retirée de la file) : retirée à la réconciliation, SANS renvoi', async () => {
    const e = note();
    await journal.ajouterAuJournal(e);
    const f = globalThis.__faux;
    await synchro.envoyerEntrees(f.client, [e]); // arrivé au serveur, mais la file n'a pas été touchée
    const avant = f.appels.upsertJournal;
    await sync();
    expect(await enFile()).toBe(0);
    expect(f.appels.upsertJournal).toBe(avant); // rien n'est reparti : la relecture a suffi
    const sauvegardes = (await keys(S_BACKUPS)).map(String);
    expect(sauvegardes.some((k) => k.startsWith('pre-confirmation-journal-'))).toBe(true); // putBackup AVANT le retrait
  });

  it('doublon refusé (23505, sans ignoreDuplicates) = succès si le serveur a la même version', async () => {
    const e = note();
    await journal.ajouterAuJournal(e);
    const f = globalThis.__faux;
    f.journal.set(e.id, { ...e, inserted_at: '2026-11-19T12:00:00Z' });
    f.pannes.doublonSansIgnore = true;
    expect((await synchro.envoyerEntrees(f.client, [e])).erreur).toBeNull();
    await sync();
    expect(await enFile()).toBe(0);
  });

  it('app tuée en plein envoi (le serveur a écrit, la réponse n\'arrive jamais) → rouvrir : aucun doublon, aucune perte, 0', async () => {
    const f = globalThis.__faux;
    for (let i = 0; i < 5; i++) await journal.ajouterAuJournal(note());
    f.pannes.tueeApresEcriture = 1;
    const r1 = await sync();
    expect(r1.ok).toBe(false);
    expect(await enFile()).toBe(5); // rien retiré sans preuve
    const r2 = await sync(); // réouverture
    expect(r2.ok).toBe(true);
    expect(await enFile()).toBe(0);
    expect(f.journal.size).toBe(5);
    expect(f.appels.lignesInserees).toBe(5); // aucun doublon
    expect(await journal.compteJournal()).toBe(5);
  });

  it('hors ligne → notations → retour en ligne → 0 en attente, tentatives et raison notées entre-temps', async () => {
    const f = globalThis.__faux;
    f.pannes.reseau = true;
    for (let i = 0; i < 3; i++) await journal.ajouterAuJournal(note());
    expect((await sync()).ok).toBe(false);
    expect(await enFile()).toBe(3);
    f.pannes.reseau = false;
    expect((await sync()).ok).toBe(true);
    expect(await enFile()).toBe(0);
    expect(f.journal.size).toBe(3);
  });

  it('conflit : le serveur a une autre version sous le même id → rien n\'est écrasé, élément signalé avec sa raison', async () => {
    const e = note(3);
    await journal.ajouterAuJournal(e);
    const f = globalThis.__faux;
    f.journal.set(e.id, { ...e, rating: 1, inserted_at: '2026-11-19T12:00:00Z' });
    await sync();
    expect(await enFile()).toBe(1);
    expect(f.journal.get(e.id).rating).toBe(1); // pas écrasé
    const [ligne] = await journal.fileEnvoiLecture();
    expect(ligne.raison).toBe(conf.RAISONS.different);
    expect(ligne.tentatives).toBe(1);
  });

  it('refus de droits (RLS 42501) : la passe est un ÉCHEC (plus jamais « ok » avec un refus avalé), raison visible', async () => {
    const f = globalThis.__faux;
    f.pannes.rls = true;
    await journal.ajouterAuJournal(note());
    const r = await sync();
    expect(r.ok).toBe(false);
    const [ligne] = await journal.fileEnvoiLecture();
    expect(ligne.tentatives).toBe(1);
    expect(ligne.raison).toMatch(/row-level security/);
    const liste = await etat.collecterEnAttente();
    const el = liste.elements.find((x) => x.type === 'revision');
    expect(el.raison).toMatch(/row-level security/);
    expect(el.tentatives).toBe(1);
  });

  it('file alimentée deux fois pour une même notation : une seule entrée, un seul envoi', async () => {
    const e = note();
    expect(await journal.ajouterAuJournal(e)).toBe(true);
    expect(await journal.ajouterAuJournal(e)).toBe(false);
    expect(await enFile()).toBe(1);
    await sync();
    expect(globalThis.__faux.appels.lignesInserees).toBe(1);
  });

  it('entrée de file orpheline (sans réponse locale) : sauvegardée puis retirée, rien n\'est envoyé', async () => {
    const { set } = await import('idb-keyval');
    await set('fantome', { id: 'fantome', depuis: '2026-11-19T10:00:00Z' }, S_ENVOI);
    await sync();
    expect(await enFile()).toBe(0);
    expect((await keys(S_BACKUPS)).map(String).some((k) => k.startsWith('pre-orphelines-journal-'))).toBe(true);
  });
});

describe('garde-fou de réconciliation et empreinte', () => {
  it('une réponse présente ici, absente du serveur et absente de la file est remise en file puis envoyée', async () => {
    const { set } = await import('idb-keyval');
    const e = note();
    await set(e.id, e, S_JOURNAL); // dans le journal, pas dans la file (confirmation perdue à l'envers)
    expect(await enFile()).toBe(0);
    await sync();
    expect(globalThis.__faux.journal.has(e.id)).toBe(true);
    expect(await enFile()).toBe(0);
  });

  it('l\'empreinte couvre le journal : une réponse non envoyée la change, la même sur deux appareils une fois alignés', async () => {
    await journal.ajouterAuJournal(note());
    const l1 = await statut.etatLocal(); const c1 = await statut.etatCloud();
    expect(l1.nJournal).toBe(1); expect(c1.nJournal).toBe(0);
    expect(l1.hash).not.toBe(c1.hash); // AVANT : identique (le journal n'y entrait pas) — c'était le piège
    await sync();
    const l2 = await statut.etatLocal(); const c2 = await statut.etatCloud();
    expect(l2.hash).toBe(c2.hash);
    // second appareil : reçoit le journal → même empreinte
    await clear(S_JOURNAL); await storage.setMeta('journal.curseur', null);
    await sync();
    expect((await statut.etatLocal()).hash).toBe(c2.hash);
  });

  it('les événements du canal de repli entrent dans l\'empreinte des deux côtés', async () => {
    await journal.ajouterAuJournal(passage());
    await sync();
    const l = await statut.etatLocal(); const c = await statut.etatCloud();
    expect(c.nJournal).toBe(1);
    expect(l.hash).toBe(c.hash);
  });

  it('état affiché : jamais « À jour » avec une réponse en file', async () => {
    await journal.ajouterAuJournal(note());
    const liste = await etat.collecterEnAttente();
    const e = etat.calculerEtatSynchro({ phase: 'ajour', at: '2000-01-01T00:00:00Z' }, liste);
    expect(e.code).toBe('enattente');
    expect(e.elements[0].raison).toBeTruthy();
  });
});

describe('règle unique de classement (pure)', () => {
  it('enregistrements : identique / serveur plus récent / absent ; « Z » = « +00:00 »', () => {
    const k = (x) => x.store + ':' + x.record_id;
    const loc = [
      { store: 'questions', record_id: 'a', updated_at: '2026-11-19T10:00:00.000Z' },
      { store: 'questions', record_id: 'b', updated_at: '2026-11-19T10:00:00.000Z' },
      { store: 'questions', record_id: 'c', updated_at: '2026-11-19T10:00:00.000Z' },
      { store: 'questions', record_id: 'd', updated_at: '2026-11-19T10:00:00.000Z' },
    ];
    const srv = [
      { store: 'questions', record_id: 'a', updated_at: '2026-11-19T10:00:00+00:00' },
      { store: 'questions', record_id: 'b', updated_at: '2026-11-19T11:00:00+00:00' },
      { store: 'questions', record_id: 'c', updated_at: '2026-11-19T09:00:00+00:00' },
    ];
    const c = conf.classerContreServeur('enregistrement', loc, srv, k);
    expect(c.identique.map((x) => x.record_id)).toEqual(['a']);
    expect(c.serveur_recent.map((x) => x.record_id)).toEqual(['b']);
    expect(c.absent.map((x) => x.record_id).sort()).toEqual(['c', 'd']);
  });

  it('la purge des enregistrements utilise la même règle', () => {
    const out = storage.entreesDejaAuCloud(
      [['questions:a', { store: 'questions', record_id: 'a', updated_at: '2026-11-19T10:00:00.000Z', deleted: false }],
        ['questions:b', { store: 'questions', record_id: 'b', updated_at: '2026-11-19T10:00:00.000Z', deleted: false }]],
      [{ store: 'questions', record_id: 'a', updated_at: '2026-11-19T10:00:00+00:00', deleted: false },
        { store: 'questions', record_id: 'b', updated_at: '2026-11-19T10:00:00+00:00', deleted: true }],
    );
    expect(out.map(([k2]) => k2)).toEqual(['questions:a']);
  });
});
