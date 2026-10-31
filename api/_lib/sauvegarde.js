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

/* ============================================================
   (31/10) RETROUVER DES CARTES DISPARUES dans les copies (écran Intégrité, docs/diagnostic-elements-manquants.md).
   LECTURE SEULE du dépôt : on remonte les copies de la plus récente à la plus ancienne (au plus `profondeur`)
   jusqu'à trouver, pour chaque id, sa DERNIÈRE version vivante. Les noms (fiche › matière › cours) viennent
   de la même copie. La tombstone la plus récente donne la date de suppression. Seuls des extraits courts
   sont renvoyés (recto, verso, cours), jamais l'enregistrement complet.
   ============================================================ */
const MAX_IDS = 200;
const court = (v, n) => String(v == null ? '' : v).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
export async function retrouverCartes({ ids, env = process.env, fetchFn = fetch, profondeur = 14, enParallele = 4 } = {}) {
  const cfg = configuration(env);
  if (!cfg.token || !cfg.depot) return { ok: false, configure: false, code: 'non_configure', message: 'Copie serveur non configurée.' };
  const voulus = new Set((Array.isArray(ids) ? ids : []).filter((x) => typeof x === 'string' && /^[\w:.-]{1,80}$/.test(x)).slice(0, MAX_IDS));
  if (!voulus.size) return { ok: true, cartes: [], introuvables: [], copiesLues: 0 };
  const gh = clientGithub({ token: cfg.token, depot: cfg.depot, branche: cfg.branche, fetchFn });
  // une copie → ses questions voulues (vivantes / supprimées) et les noms fiche › matière › cours
  const lire = async (c) => {
    const vivants = new Map(); const supprimees = new Map(); const noms = new Map();
    for (const f of await gh.fichiers(c.arbre, (p) => /^data\/records(-\d{3})?\.jsonl$/.test(p))) {
      for (const ligne of (await gh.blob(f.sha)).split('\n')) {
        if (!ligne) continue;
        let r; try { r = JSON.parse(ligne); } catch { continue; }
        if (['fiches', 'matieres', 'sources'].includes(r.store) && r.data) noms.set(r.store + ':' + r.id, r.data);
        else if (r.store === 'questions' && voulus.has(r.id)) { if (r.deleted || !r.data) supprimees.set(r.id, r.updated_at || null); else vivants.set(r.id, r.data); }
      }
    }
    return { c, vivants, supprimees, noms };
  };
  const trouvees = new Map(); const supprimeesLe = new Map();
  const commits = (await gh.historique(profondeur)).filter((c) => /^backup /.test(c.message));
  let lues = 0;
  // copies lues par paquets en parallèle, puis examinées de la plus récente à la plus ancienne
  for (let i = 0; i < commits.length && trouvees.size < voulus.size; i += enParallele) {
    for (const { c, vivants, supprimees, noms } of await Promise.all(commits.slice(i, i + enParallele).map(lire))) {
      lues++;
      for (const [id, t] of supprimees) if (!trouvees.has(id) && !supprimeesLe.has(id)) supprimeesLe.set(id, t);
      for (const [id, q] of vivants) {
        if (trouvees.has(id)) continue;
        const f = noms.get('fiches:' + q.ficheId); const m = f && noms.get('matieres:' + f.matiereId); const s = m && noms.get('sources:' + m.sourceId);
        trouvees.set(id, {
          id, type: q.type || null, recto: court(q.recto || q.question || q.consigne || q.concept, 160), verso: court(q.verso || q.reponse, 120),
          cours: [s && (s.nom || s.titre), m && (m.nom || m.name), f && (f.titre || f.title)].filter(Boolean).join(' › ') || null,
          copie: c.message.replace(/^backup /, ''), supprimeeLe: supprimeesLe.get(id) || null,
        });
      }
    }
  }
  return { ok: true, cartes: [...trouvees.values()], introuvables: [...voulus].filter((id) => !trouvees.has(id)), copiesLues: lues };
}
