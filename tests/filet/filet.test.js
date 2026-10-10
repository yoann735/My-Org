// Filet de sécurité : export déterministe, découpage > 100 Mo, idempotence de la copie GitHub,
// contrôle d'intégrité (chaque anomalie injectée), restauration depuis une copie de test.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { construireExport, decouper, lignesRecords, sha256, lireJsonl } from '../../src/medrevise/sauvegarde/export.js';
import { executerCopie, lireStatut } from '../../api/_lib/sauvegarde.js';
import { controlerIntegrite, instantane } from '../../src/medrevise/integrite/controle.js';
import { fauxGithub, fauxSupabase, routeur } from './faux.js';
import { sauvegardePresente, lireStore } from '../fsrs/donnees.js';

const rec = (store, id, data, extra = {}) => ({ store, record_id: id, data, updated_at: '2026-10-10T10:00:00.5+00:00', deleted: false, ...extra });
const jeu = () => [
  rec('questions', 'q2', { type: 'flashcard', recto: 'B', verso: 'b', id: 'q2', ficheId: 'f1' }),
  rec('questions', 'q1', { verso: 'a', recto: 'A', id: 'q1', type: 'flashcard', ficheId: 'f1' }),
  rec('fiches', 'f1', { id: 'f1', titre: 'Cours', matiereId: 'm1' }),
  rec('questions', 'q3', {}, { deleted: true, data: {} }),
];

describe('export déterministe', () => {
  it('mêmes données (ordre des lignes et des clés différent) → mêmes octets', () => {
    const a = construireExport({ records: jeu(), jour: '2026-10-11' });
    const melange = jeu().reverse().map((r) => ({ ...r, data: Object.fromEntries(Object.entries(r.data).reverse()), updated_at: '2026-10-10T10:00:00.500Z' }));
    const b = construireExport({ records: melange, jour: '2026-10-11' });
    expect(b.fichiers.map((f) => f.contenu)).toEqual(a.fichiers.map((f) => f.contenu));
    expect(a.fichiers.map((f) => f.chemin)).toEqual(['data/records.jsonl', 'data/review_log.jsonl', 'data/files-index.json', 'manifest.json']);
    expect(a.manifeste.comptes).toMatchObject({ enregistrements: 3, questions: 2, flashcards: 2 });
    for (const f of a.manifeste.fichiers) expect(sha256(a.fichiers.find((x) => x.chemin === f.chemin).contenu)).toBe(f.sha256);
    // une ligne par enregistrement, triées (store, id), tombstone gardé
    expect(lireJsonl(a.fichiers[0].contenu).map((l) => l.store + '/' + l.id)).toEqual(['fiches/f1', 'questions/q1', 'questions/q2', 'questions/q3']);
  });
  it('seul le jour change d’un jour à l’autre : les fichiers de données restent identiques', () => {
    const a = construireExport({ records: jeu(), jour: '2026-10-11' }); const b = construireExport({ records: jeu(), jour: '2026-10-12' });
    expect(b.fichiers[0].contenu).toBe(a.fichiers[0].contenu);
    expect(b.fichiers.find((f) => f.chemin === 'manifest.json').contenu).not.toBe(a.fichiers.find((f) => f.chemin === 'manifest.json').contenu);
  });
});

describe('découpage au-delà de la limite de taille', () => {
  it('110 Mo de lignes → 3 fichiers de 40 Mo au plus, aucune ligne coupée, contenu intégral', () => {
    const gros = 'x'.repeat(100 * 1024);
    const lignes = lignesRecords(Array.from({ length: 1100 }, (_, i) => rec('ocr_layer', 'o' + String(i).padStart(5, '0'), { pages: gros })));
    const total = lignes.reduce((s, l) => s + l.length + 1, 0);
    expect(total).toBeGreaterThan(100 * 1024 * 1024);
    const parts = decouper('data/records', 'jsonl', lignes);
    expect(parts.map((p) => p.chemin)).toEqual(['data/records-001.jsonl', 'data/records-002.jsonl', 'data/records-003.jsonl']);
    for (const p of parts) expect(Buffer.byteLength(p.contenu)).toBeLessThanOrEqual(40 * 1024 * 1024);
    expect(parts.flatMap((p) => p.contenu.split('\n').filter(Boolean))).toEqual(lignes);
  }, 60000);
});

describe('copie quotidienne vers GitHub (faux GitHub et faux Supabase en mémoire)', () => {
  const env = { GITHUB_BACKUP_TOKEN: 'jeton-de-test', GITHUB_BACKUP_REPO: 'moi/medrevise-backups-test', VITE_SUPABASE_URL: 'https://faux.supabase.co', VITE_SUPABASE_ANON_KEY: 'cle' };
  it('premier passage : commit « backup YYYY-MM-DD » avec les 4 fichiers', async () => {
    const gh = fauxGithub();
    const r = await executerCopie({ env, fetchFn: routeur(gh.fetchFn, fauxSupabase(jeu(), { fichiers: [{ nom: 'b1', taille: 10, empreinte: 'e1', type: 'application/pdf' }] })), maintenant: new Date('2026-10-11T01:31:00Z'), pause: 0 });
    expect(r).toMatchObject({ ok: true, cree: true, jour: '2026-10-11' });
    expect(gh.commits()[0].message).toBe('backup 2026-10-11');
    expect(Object.keys(gh.fichiers()).sort()).toEqual(['README.md', 'data/files-index.json', 'data/records.jsonl', 'data/review_log.jsonl', 'manifest.json']);
    expect(JSON.parse(gh.fichiers()['manifest.json']).journalAbsent).toBe(true);
  });
  it('idempotence : relancer le même jour sans changement ne crée aucun commit ; le lendemain, un commit ; un changement, un commit', async () => {
    const gh = fauxGithub(); let donnees = jeu();
    const lancer = (iso) => executerCopie({ env, fetchFn: routeur(gh.fetchFn, fauxSupabase(donnees)), maintenant: new Date(iso), pause: 0 });
    await lancer('2026-10-11T01:31:00Z');
    const n1 = gh.commits().length;
    const r2 = await lancer('2026-10-11T02:31:00Z'); // second cron de la nuit
    expect(r2).toMatchObject({ ok: true, cree: false });
    expect(gh.commits().length).toBe(n1);
    donnees = [...donnees, rec('questions', 'q4', { type: 'qcm', id: 'q4', ficheId: 'f1' })];
    const r3 = await lancer('2026-10-11T09:00:00Z');
    expect(r3.cree).toBe(true);
    const r4 = await lancer('2026-10-12T01:31:00Z');
    expect(r4.cree).toBe(true);
    expect(gh.commits().map((c) => c.message).slice(0, 3)).toEqual(['backup 2026-10-12', 'backup 2026-10-11', 'backup 2026-10-11']);
    const statut = await lireStatut({ env, fetchFn: routeur(gh.fetchFn, () => null), maintenant: new Date('2026-10-12T08:00:00Z') });
    expect(statut).toMatchObject({ ok: true, configure: true, jour: '2026-10-12' });
    expect(statut.comptes.questions).toBe(3);
  });
  it('sans variables : erreur claire, aucun appel réseau', async () => {
    const r = await executerCopie({ env: {}, fetchFn: () => { throw new Error('ne doit pas être appelé'); } });
    expect(r).toMatchObject({ ok: false, code: 'non_configure' });
    expect(await lireStatut({ env: {} })).toMatchObject({ configure: false });
  });
  it('GitHub indisponible : 3 tentatives puis échec, jeton jamais dans le message', async () => {
    let appels = 0;
    const panne = async (url) => { if (String(url).includes('api.github.com')) { appels++; throw new Error('réseau coupé ghp_SECRETSECRET123'); } return fauxSupabase(jeu())(url); };
    const r = await executerCopie({ env, fetchFn: panne, pause: 0 });
    expect(r).toMatchObject({ ok: false, code: 'echec' });
    expect(appels).toBe(3);
    expect(r.message).not.toContain('SECRETSECRET');
  });
});

describe('contrôle d’intégrité (anomalies injectées)', () => {
  const db0 = () => ({
    sources: [{ id: 's1', nom: 'Kiné', rappelsJ: true }], matieres: [{ id: 'm1', nom: 'Anatomie', sourceId: 's1' }],
    fiches: [{ id: 'f1', titre: 'Muscles', matiereId: 'm1' }],
    questions: [
      { id: 'a', type: 'flashcard', ficheId: 'f1', recto: 'ok', dueDate: '2026-10-12', historique: [] },
      { id: 'b', type: 'flashcard', ficheId: 'f1', recto: 'revue', dueDate: '2026-06-01', historique: [{ date: '2026-05-20', qualite: 5 }] },
      { id: 'c', type: 'qcm', ficheId: 'f1', recto: 'qcm' },
    ],
  });
  it('jeu sain → OK', () => expect(controlerIntegrite({ db: db0(), jour: '2026-10-11' }).ok).toBe(true));
  it('carte sans date → « sans-date », réparable', () => {
    const db = db0(); db.questions.push({ id: 'n', type: 'flashcard', ficheId: 'f1', recto: 'nue', dueDate: null, historique: [] });
    const r = controlerIntegrite({ db, jour: '2026-10-11' });
    expect(r.anomalies).toMatchObject([{ type: 'sans-date', carteId: 'n', reparable: true }]);
    expect(r.cartesAVerifier).toBe(1);
  });
  it('carte enterrée (due il y a plus de 60 jours, jamais revue) ; une carte revue ou d’un cours sans rappels n’en est pas une', () => {
    const db = db0(); db.questions.push({ id: 'e', type: 'flashcard', ficheId: 'f1', recto: 'oubliée', dueDate: '2026-07-01', historique: [] });
    expect(controlerIntegrite({ db, jour: '2026-10-11' }).anomalies.map((a) => a.type + ':' + a.carteId)).toEqual(['enterree:e']);
    db.sources[0].rappelsJ = false;
    expect(controlerIntegrite({ db, jour: '2026-10-11' }).ok).toBe(true);
  });
  it('id dupliqué → « doublon »', () => {
    const db = db0(); db.questions.push({ ...db.questions[0] });
    expect(controlerIntegrite({ db, jour: '2026-10-11' }).anomalies.find((a) => a.type === 'doublon').carteId).toBe('a');
  });
  it('carte orpheline (fiche supprimée) → « orpheline », non réparable', () => {
    const db = db0(); db.questions.push({ id: 'o', type: 'flashcard', ficheId: 'f-disparue', recto: 'seule', dueDate: '2026-10-12' });
    expect(controlerIntegrite({ db, jour: '2026-10-11' }).anomalies).toMatchObject([{ type: 'orpheline', carteId: 'o', reparable: false }]);
  });
  it('baisse du nombre de cartes depuis la veille → ids manquants listés', () => {
    const hier = db0(); hier.questions.push({ id: 'x1', type: 'flashcard', ficheId: 'f1', dueDate: '2026-10-12' }, { id: 'x2', type: 'qcm', ficheId: 'f1' });
    const precedent = instantane(hier.questions, '2026-10-10');
    const r = controlerIntegrite({ db: db0(), jour: '2026-10-11', precedent });
    expect(r.baisse).toMatchObject({ depuis: '2026-10-10', total: 2, parType: { flashcard: 1, qcm: 1 }, idsManquants: ['x1', 'x2'] });
    expect(r.ok).toBe(false);
  });
  it('écart d’empreinte avec le cloud et journal en attente depuis plus de 7 jours → anomalies globales', () => {
    const r = controlerIntegrite({ db: db0(), jour: '2026-10-11', cloud: { statut: 'ecart', empreinteLocale: 'aaa', empreinteCloud: 'bbb' }, journalPlusAncien: '2026-10-01T09:00:00Z' });
    expect(r.globales.map((g) => g.type)).toEqual(['empreinte', 'journal']);
  });
  it.skipIf(!sauvegardePresente)('vraies données (2 000 enregistrements environ) : < 300 ms, aucune anomalie', () => {
    const db = { sources: lireStore('medrevise-sources'), matieres: lireStore('medrevise-matieres'), fiches: lireStore('medrevise-fiches'), questions: lireStore('medrevise-questions') };
    const t0 = performance.now(); const r = controlerIntegrite({ db, jour: '2026-10-11' }); const ms = performance.now() - t0;
    expect(r.questions).toBe(1583); expect(r.flashcards).toBe(894);
    expect(r.ok).toBe(true);
    expect(ms).toBeLessThan(300);
  });
});

describe('restauration depuis une copie de test', () => {
  it('copie écrite sur disque → IndexedDB d’un Chrome isolé : comptes et empreintes identiques', () => {
    const dir = mkdtempSync(join(tmpdir(), 'filet-copie-')); const profil = mkdtempSync(join(tmpdir(), 'filet-profil-'));
    const donnees = [...jeu(), rec('matieres', 'm1', { id: 'm1', nom: 'Anatomie' }), rec('ocr_layer', 'o1', { id: 'o1', pages: [1, 2, 3] })];
    const { fichiers } = construireExport({ records: donnees, jour: '2026-10-11' });
    for (const f of fichiers) { mkdirSync(dirname(join(dir, f.chemin)), { recursive: true }); writeFileSync(join(dir, f.chemin), f.contenu); }
    const sortie = execFileSync('node', ['scripts/sauvegarde/restore-from-github.mjs', '--dossier', dir, '--profil', profil, '--origine', 'http://localhost:5199', '--port', '9377'], { encoding: 'utf8', timeout: 90000 });
    expect(sortie).toContain('RESTAURATION CONFORME');
    expect(sortie).toMatch(/medrevise-questions : 2\/2/);
  }, 120000);
});
