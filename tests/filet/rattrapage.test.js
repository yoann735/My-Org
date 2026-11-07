// (07/11) Rattrapage de la copie GitHub à l'ouverture de l'app, réussite vérifiée, trace des échecs
// (docs/compte-rendu-sauvegarde-et-statut-synchro.md). Faux GitHub + faux Supabase en mémoire, aucun réseau.
import { describe, it, expect } from 'vitest';
import { executerCopie, lireStatut, rattrapage, raisonCourte } from '../../api/_lib/sauvegarde.js';
import { fauxGithub, fauxSupabase, routeur } from './faux.js';

const env = { GITHUB_BACKUP_TOKEN: 'jeton-de-test', GITHUB_BACKUP_REPO: 'moi/medrevise-backups-test', VITE_SUPABASE_URL: 'https://faux.supabase.co', VITE_SUPABASE_ANON_KEY: 'cle' };
const rec = (store, id, data) => ({ store, record_id: id, data, updated_at: '2026-10-10T10:00:00.000Z', deleted: false });
const jeu = () => [rec('fiches', 'f1', { id: 'f1', titre: 'Cœur' }), rec('questions', 'q1', { id: 'q1', type: 'flashcard', ficheId: 'f1' })];
const H = 3600000;

/** dépôt avec une copie réussie faite à `iso` */
async function depotAvecCopie(iso) {
  const gh = fauxGithub(); gh.regler(Date.parse(iso) - 60000);
  const r = await executerCopie({ env, fetchFn: routeur(gh.fetchFn, fauxSupabase(jeu())), maintenant: new Date(iso), pause: 0 });
  expect(r.ok).toBe(true);
  return gh;
}
const compteur = () => { let n = 0; const executer = async (o) => { n++; return executerCopie({ ...o, pause: 0 }); }; return { executer, n: () => n }; };

describe('rattrapage (/api/backup-catchup)', () => {
  it('dernière copie de plus de 24 h → la copie se lance UNE fois ; 5 ouvertures de suite → une seule copie', async () => {
    const gh = await depotAvecCopie('2026-11-03T02:05:00Z');
    const fetchFn = routeur(gh.fetchFn, fauxSupabase(jeu()));
    const c = compteur();
    const maintenant = new Date('2026-11-07T15:40:00Z'); gh.regler(maintenant.getTime());
    const r1 = await rattrapage({ env, fetchFn, maintenant, executer: c.executer });
    expect(r1).toMatchObject({ ok: true, action: 'lancee', resultat: { ok: true, jour: '2026-11-07' } });
    const actions = [];
    for (let i = 1; i <= 4; i++) actions.push((await rattrapage({ env, fetchFn, maintenant: new Date(maintenant.getTime() + i * 60000), executer: c.executer })).action);
    expect(c.n()).toBe(1);
    expect(actions).toEqual(['rien', 'rien', 'rien', 'rien']); // la copie vient de réussir : moins de 24 h
    expect(gh.commits()[0].message).toBe('backup 2026-11-07');
  });
  it('copie récente (< 24 h) → rien, aucune étiquette, aucune copie', async () => {
    const gh = await depotAvecCopie('2026-11-07T02:05:00Z');
    const c = compteur();
    const r = await rattrapage({ env, fetchFn: routeur(gh.fetchFn, fauxSupabase(jeu())), maintenant: new Date('2026-11-07T15:40:00Z'), executer: c.executer });
    expect(r).toMatchObject({ ok: true, action: 'rien' });
    expect(r.ageHeures).toBeCloseTo(13.6, 0);
    expect(c.n()).toBe(0);
    expect(gh.etiquettes()).toEqual([]);
  });
  it('copie en échec : au plus une tentative toutes les 30 min, l’échec est noté (date + raison) et n’est pas une réussite', async () => {
    const gh = await depotAvecCopie('2026-11-03T02:05:00Z');
    const panneSb = async () => ({ ok: false, status: 503, text: async () => '{"message":"Supabase en panne"}', json: async () => ({}) });
    const fetchFn = routeur(gh.fetchFn, panneSb);
    const c = compteur();
    const t0 = Date.parse('2026-11-07T15:40:00Z'); gh.regler(t0);
    const actions = [];
    for (const min of [0, 1, 2, 20, 35, 50, 95]) actions.push((await rattrapage({ env, fetchFn, maintenant: new Date(t0 + min * 60000), executer: c.executer })).action);
    // 15:40 lancée (créneau 15:30) ; 15:41 → 16:15 trop tôt ; 16:30 (créneau 16:30, 50 min après) lancée ; 17:15 trop tôt
    expect(actions).toEqual(['lancee', 'trop_tot', 'trop_tot', 'trop_tot', 'trop_tot', 'lancee', 'trop_tot']);
    expect(c.n()).toBe(2);
    const s = await lireStatut({ env, fetchFn, maintenant: new Date(t0 + 100 * 60000) });
    expect(s.date).toBe(gh.commits().find((x) => x.message === 'backup 2026-11-03').date); // la dernière RÉUSSIE
    expect(s.ageHeures).toBeGreaterThan(48);
    expect(s.dernierEchec).toMatchObject({ le: new Date(t0 + 50 * 60000).toISOString() });
    expect(s.dernierEchec.raison).toMatch(/Supabase/i);
    expect(gh.commits()[0].message).toBe('backup-echec 2026-11-07');
  });
  it('ouvertures simultanées : une seule copie (verrou atomique)', async () => {
    const gh = await depotAvecCopie('2026-11-03T02:05:00Z');
    const fetchFn = routeur(gh.fetchFn, fauxSupabase(jeu()));
    const c = compteur();
    const m = new Date('2026-11-07T15:40:00Z');
    const rs = await Promise.all([1, 2, 3, 4, 5].map(() => rattrapage({ env, fetchFn, maintenant: m, executer: c.executer })));
    expect(c.n()).toBe(1);
    expect(rs.filter((r) => r.action === 'lancee')).toHaveLength(1);
  });
  it('réussite = les 4 fichiers relus avec le bon contenu ; jeton refusé → raison claire, sans secret', async () => {
    const gh = await depotAvecCopie('2026-11-06T02:05:00Z');
    expect(Object.keys(gh.fichiers()).sort()).toEqual(['README.md', 'data/files-index.json', 'data/records.jsonl', 'data/review_log.jsonl', 'manifest.json']);
    expect(raisonCourte(Object.assign(new Error('GitHub GET /git/ref : HTTP 401 — Bad credentials ghp_ABCDEF123'), { status: 401 }))).toMatch(/jeton GitHub refusé/);
    expect(raisonCourte(new Error('x ghp_ABCDEF123'))).not.toContain('ABCDEF');
  });
});
