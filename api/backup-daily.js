/* ============================================================
   My Org — GET /api/backup-daily : copie quotidienne de MedRevise vers le dépôt GitHub privé.
   Déclenchée par les crons Vercel (vercel.json) : « 30 1 * * * » et « 30 2 * * * » UTC = 03:30 à
   Bruxelles en heure d'été et en heure d'hiver (Vercel ne connaît que l'UTC). Le second passage du
   jour ne crée aucun commit si rien n'a changé (idempotent).
   PROTÉGÉE PAR CRON_SECRET : Vercel envoie « Authorization: Bearer <CRON_SECRET> » ; tout appel
   sans ce secret (ou si CRON_SECRET n'est pas défini) est refusé (401). Voir api/_lib/sauvegarde.js.
   ============================================================ */
import { executerCopie } from './_lib/sauvegarde.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, code: 'unauthorized', message: 'Appel refusé (CRON_SECRET absent ou invalide).' });
  }
  const r = await executerCopie();
  return res.status(r.ok ? 200 : r.code === 'non_configure' ? 503 : 502).json(r);
}
