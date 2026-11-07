/* ============================================================
   My Org — POST /api/backup-catchup : RATTRAPAGE de la copie quotidienne, appelé en silence à l'ouverture de
   MedRevise (07/11/2026, docs/compte-rendu-sauvegarde-et-statut-synchro.md).
   Le serveur vérifie lui-même la date de la dernière copie RÉUSSIE (dépôt GitHub) : moins de 24 h → rien ; sinon,
   la MÊME copie que le cron (api/_lib/sauvegarde.js → executerCopie). Idempotent, une seule copie à la fois, au plus
   une tentative toutes les 30 min (verrou atomique côté GitHub, voir `rattrapage`). Aucun secret côté client ;
   la réponse ne contient que des dates et un code d'action, jamais de données.
   Protection : origine de l’app + 30 appels / 10 min / IP (_protection.js).
   ============================================================ */
import { refuser, creerLimiteur } from './_protection.js';
import { rattrapage } from './_lib/sauvegarde.js';

const limite = creerLimiteur(30);

export default async function handler(req, res) {
  if (refuser(req, res, limite)) return undefined;
  try {
    const r = await rattrapage();
    return res.status(r.ok ? 200 : r.code === 'non_configure' ? 503 : 502).json(r);
  } catch (e) {
    return res.status(502).json({ ok: false, action: 'aucune', code: 'github', message: 'Vérification impossible (GitHub injoignable ou jeton refusé).' });
  }
}
