/* ============================================================
   My Org — COPIE QUOTIDIENNE de MedRevise vers le dépôt GitHub privé (serveur seulement).
   Commune à /api/backup-daily (cron, CRON_SECRET) et /api/backup-now (bouton de Réglages).

   1. lecture SEULE de tout Supabase (src/medrevise/sauvegarde/lecture.js) ;
   2. export déterministe (src/medrevise/sauvegarde/export.js) ;
   3. un commit « backup YYYY-MM-DD » si quelque chose a changé (jour compris : manifest.json),
      rien sinon (idempotent) ; jusqu'à 2 nouvelles tentatives en cas d'échec.
   Variables : GITHUB_BACKUP_TOKEN, GITHUB_BACKUP_REPO (« <user>/medrevise-backups »), et pour lire
   Supabase VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (déjà présentes sur le projet). Rien n'est
   jamais écrit dans Supabase. Aucun secret dans les messages renvoyés.
   ============================================================ */
import { lireCloud } from '../../src/medrevise/sauvegarde/lecture.js';
import { construireExport, MAX_OCTETS_DEFAUT } from '../../src/medrevise/sauvegarde/export.js';
import { clientGithub } from './github.js';

/** jour civil à Bruxelles */
export function jourBruxelles(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export function configuration(env = process.env) {
  return {
    token: env.GITHUB_BACKUP_TOKEN || '',
    depot: env.GITHUB_BACKUP_REPO || '',
    branche: env.GITHUB_BACKUP_BRANCH || 'main',
    supabaseUrl: env.SUPABASE_URL || env.VITE_SUPABASE_URL || '',
    supabaseCle: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '',
    maxOctets: Number(env.BACKUP_MAX_OCTETS) || MAX_OCTETS_DEFAUT,
  };
}

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

export async function executerCopie({ env = process.env, maintenant = new Date(), fetchFn = fetch, essais = 3, pause = 2000 } = {}) {
  const cfg = configuration(env);
  if (!cfg.token || !cfg.depot) return { ok: false, code: 'non_configure', message: 'Copie serveur non configurée : variables GITHUB_BACKUP_TOKEN et GITHUB_BACKUP_REPO absentes sur Vercel.' };
  if (!cfg.supabaseUrl || !cfg.supabaseCle) return { ok: false, code: 'supabase_absent', message: 'Supabase non configuré côté serveur (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).' };
  const jour = jourBruxelles(maintenant);
  let derniere = null;
  for (let i = 0; i < essais; i++) {
    try {
      const cloud = await lireCloud({ url: cfg.supabaseUrl, cle: cfg.supabaseCle, fetchFn });
      const { fichiers, manifeste } = construireExport({ ...cloud, jour, maxOctets: cfg.maxOctets });
      const gh = clientGithub({ token: cfg.token, depot: cfg.depot, branche: cfg.branche, fetchFn });
      // anciens morceaux devenus inutiles (ex. records-003.jsonl quand le fichier a rétréci)
      const r = await gh.commit({ fichiers, message: `backup ${jour}`, supprimer: (c) => /^data\/(records|review_log)(-\d{3})?\.jsonl$/.test(c) });
      return { ok: true, jour, commit: r.sha, cree: r.cree, raison: r.raison || null, comptes: manifeste.comptes, fichiers: manifeste.fichiers.length, essai: i + 1 };
    } catch (e) {
      derniere = e;
      if (e && e.code === 'non_configure') break;
      if (i < essais - 1) await attendre(pause * (i + 1));
    }
  }
  return { ok: false, code: 'echec', message: 'Copie échouée après ' + essais + ' tentatives : ' + String((derniere && derniere.message) || derniere).replace(/(gh[pousr]_|github_pat_)[A-Za-z0-9_]+/g, '[jeton masqué]') };
}

export async function lireStatut({ env = process.env, fetchFn = fetch, maintenant = new Date() } = {}) {
  const cfg = configuration(env);
  if (!cfg.token || !cfg.depot) return { ok: false, configure: false, code: 'non_configure', message: 'Copie serveur non configurée.' };
  const gh = clientGithub({ token: cfg.token, depot: cfg.depot, branche: cfg.branche, fetchFn });
  const d = await gh.dernier();
  if (!d || !d.manifeste) return { ok: true, configure: true, aucune: true, message: 'Aucune copie pour l’instant.' };
  return {
    ok: true, configure: true, date: d.date, message: d.message, commit: d.sha.slice(0, 7), jour: d.manifeste.jour,
    ageHeures: Math.round(((maintenant - new Date(d.date)) / 3600000) * 10) / 10,
    comptes: d.manifeste.comptes, journalAbsent: !!d.manifeste.journalAbsent, fichiersBucket: d.manifeste.fichiersBucket,
  };
}
