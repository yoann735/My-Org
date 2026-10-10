/* ============================================================
   My Org — POST /api/backup-status : état de la dernière copie (Réglages → Sauvegardes, bandeau).
   Lu directement sur le dépôt GitHub (dernier commit de la branche + manifest.json) : aucune
   écriture nulle part. Sans configuration : { configure: false } (« Copie serveur non configurée »).
   ============================================================ */
import { refuser, creerLimiteur } from './_protection.js';
import { lireStatut } from './_lib/sauvegarde.js';

const limite = creerLimiteur(120);

export default async function handler(req, res) {
  if (refuser(req, res, limite)) return undefined;
  try {
    return res.status(200).json(await lireStatut());
  } catch (e) {
    return res.status(502).json({ ok: false, configure: true, code: 'github', message: 'GitHub injoignable ou dépôt inaccessible : ' + String((e && e.message) || e).replace(/(gh[pousr]_|github_pat_)[A-Za-z0-9_]+/g, '[jeton masqué]') });
  }
}
