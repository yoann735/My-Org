// Faux GitHub HTTP (:54398) pour le banc « sauvegarde + statut de synchro » (07/11, docs/compte-rendu-sauvegarde-et-statut-synchro.md).
// Même faux que les tests unitaires (tests/filet/faux.js), exposé en HTTP : Vite le joint par GITHUB_API_URL=http://localhost:54398.
// JAMAIS le vrai dépôt. Pilotage :
//   POST /__preparer?derniere=ISO   dépôt neuf + une copie RÉUSSIE datée ISO (vraie fonction executerCopie, faux Supabase :54399)
//   POST /__echec?le=ISO            une copie qui échoue à la date ISO (Supabase injoignable) → trace dans le manifest
//   GET  /__etat                    commits (message, date) + étiquettes de verrou
import http from 'node:http';
import { fauxGithub } from '../../tests/filet/faux.js';
import { executerCopie } from '../../api/_lib/sauvegarde.js';

const DEPOT = 'moi/medrevise-backups-test';
const env = { GITHUB_BACKUP_TOKEN: 'jeton-de-test', GITHUB_BACKUP_REPO: DEPOT, VITE_SUPABASE_URL: 'http://localhost:54399', VITE_SUPABASE_ANON_KEY: 'cle-de-test' };
let gh = fauxGithub(DEPOT);
let horlogeReelle = true; // les commits faits par l'app (rattrapage) prennent l'heure réelle
const versGh = (url, init) => { if (horlogeReelle) gh.regler(Date.now() - 60000); return gh.fetchFn(url, init); };
const lireCorps = async (req) => { let b = ''; for await (const m of req) b += m; return b; };
const out = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(obj == null ? '' : JSON.stringify(obj)); };

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  try {
    if (u.pathname === '/__preparer') {
      gh = fauxGithub(DEPOT); horlogeReelle = false;
      const t = Date.parse(u.searchParams.get('derniere')); gh.regler(t - 60000);
      const r = await executerCopie({ env, fetchFn: (x, i) => (String(x).startsWith('https://api.github.com') ? gh.fetchFn(x, i) : fetch(x, i)), maintenant: new Date(t), pause: 0 });
      horlogeReelle = true;
      return out(res, 200, { ok: r.ok, jour: r.jour, commits: gh.commits().map((c) => [c.message, c.date]) });
    }
    if (u.pathname === '/__echec') {
      horlogeReelle = false; const t = Date.parse(u.searchParams.get('le')); gh.regler(t - 60000);
      const panne = async (x, i) => (String(x).startsWith('https://api.github.com') ? gh.fetchFn(x, i) : { ok: false, status: 503, text: async () => '{"message":"service indisponible"}', json: async () => ({}) });
      const r = await executerCopie({ env, fetchFn: panne, maintenant: new Date(t), pause: 0, essais: 1 });
      horlogeReelle = true;
      return out(res, 200, { ok: r.ok, raison: r.raison, note: r.echecNote });
    }
    if (u.pathname === '/__etat') return out(res, 200, { commits: gh.commits().map((c) => ({ message: c.message, date: c.date })), etiquettes: gh.etiquettes() });
    // API GitHub : on rejoue la requête sur le faux en mémoire (mêmes chemins /repos/<dépôt>/…)
    const corps = req.method === 'GET' || req.method === 'DELETE' ? undefined : await lireCorps(req);
    const r = await versGh('https://api.github.com' + u.pathname + u.search, { method: req.method, body: corps || undefined });
    const texte = await r.text();
    res.writeHead(r.status, { 'Content-Type': 'application/json' }); res.end(texte);
  } catch (e) { out(res, 500, { message: String((e && e.message) || e) }); }
}).listen(54398, () => console.log('faux GitHub sur :54398'));
