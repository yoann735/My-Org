/* ============================================================
   My Org — POST /api/backup-now : « Lancer une copie maintenant » (Réglages → Sauvegardes).
   Même copie que le cron (api/_lib/sauvegarde.js), lancée par le serveur : le jeton GitHub et
   CRON_SECRET ne quittent jamais le serveur. Protection : origine de l'app + 6 appels / 10 min / IP
   (_protection.js). Une copie relancée sans changement ne crée aucun commit.
   ============================================================ */
import { refuser, creerLimiteur } from './_protection.js';
import { executerCopie } from './_lib/sauvegarde.js';

const limite = creerLimiteur(6);

export default async function handler(req, res) {
  if (refuser(req, res, limite)) return undefined;
  const r = await executerCopie();
  return res.status(r.ok ? 200 : r.code === 'non_configure' ? 503 : 502).json(r);
}
