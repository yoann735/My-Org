/* ============================================================
   My Org — POST /api/backup-versions { ns } : les versions d'un document (annotations + surlignages) dans les copies
   quotidiennes GitHub, pour l'historique des versions de MedRevise (lib/historiqueDoc.js#importerVersionsGithub).
   LECTURE SEULE des copies (api/_lib/sauvegarde.js#retrouverVersionsDoc). Le jeton reste sur le serveur.
   Protection : origine de l'app + 20 appels / 10 min / IP (_protection.js).
   ============================================================ */
import { refuser, creerLimiteur } from './_protection.js';
import { retrouverVersionsDoc } from './_lib/sauvegarde.js';

const limite = creerLimiteur(20);

export default async function handler(req, res) {
  if (refuser(req, res, limite)) return undefined;
  try {
    const corps = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const r = await retrouverVersionsDoc({ ns: corps.ns });
    return res.status(r.ok ? 200 : (r.code === 'ns' ? 400 : 503)).json(r);
  } catch (e) {
    return res.status(502).json({ ok: false, code: 'github', message: 'Copies GitHub illisibles : ' + String((e && e.message) || e).replace(/(gh[pousr]_|github_pat_)[A-Za-z0-9_]+/g, '[jeton masqué]') });
  }
}
