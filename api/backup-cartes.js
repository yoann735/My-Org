/* ============================================================
   My Org — POST /api/backup-cartes { ids } : ce qu'étaient des cartes disparues (écran Intégrité de MedRevise).
   LECTURE SEULE des copies GitHub (api/_lib/sauvegarde.js#retrouverCartes) : extraits courts (recto, verso,
   cours, type), jamais l'enregistrement complet ; 200 ids au plus. Le jeton reste sur le serveur.
   Protection : origine de l'app + 20 appels / 10 min / IP (_protection.js).
   ============================================================ */
import { refuser, creerLimiteur } from './_protection.js';
import { retrouverCartes } from './_lib/sauvegarde.js';

const limite = creerLimiteur(20);

export default async function handler(req, res) {
  if (refuser(req, res, limite)) return undefined;
  try {
    const corps = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const r = await retrouverCartes({ ids: corps.ids });
    return res.status(r.ok ? 200 : 503).json(r);
  } catch (e) {
    return res.status(502).json({ ok: false, code: 'github', message: 'Copies GitHub illisibles : ' + String((e && e.message) || e).replace(/(gh[pousr]_|github_pat_)[A-Za-z0-9_]+/g, '[jeton masqué]') });
  }
}
