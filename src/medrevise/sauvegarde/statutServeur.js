/* ============================================================
   MedRevise — état de la COPIE SERVEUR (dépôt GitHub privé) vu depuis l'app (filet de sécurité).
   Appelle /api/backup-status et /api/backup-now : le jeton GitHub reste sur le serveur.
   ============================================================ */
/* (07/11) un seul seuil : avertissement « plus de 48 h sans copie réussie » (Réglages ET bandeau) */
export const HEURES_ALERTE = 48;

async function appeler(chemin, corps = {}) {
  try {
    const r = await fetch(chemin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    const j = await r.json().catch(() => null);
    if (!j) return { ok: false, code: 'reponse', message: `Réponse illisible du serveur (HTTP ${r.status}).` };
    return j;
  } catch (e) {
    return { ok: false, code: 'reseau', message: 'Serveur injoignable (hors ligne ?).' };
  }
}

export const statutCopieServeur = () => appeler('/api/backup-status');
export const lancerCopieServeur = () => appeler('/api/backup-now');
/** (07/11) rattrapage silencieux à l'ouverture : le SERVEUR décide (dernière copie réussie > 24 h → copie, sinon rien).
 *  Appelé une fois par chargement de page, jamais attendu par l'interface. */
let rattrapageLance = null;
export function lancerRattrapageSauvegarde() {
  if (!rattrapageLance) rattrapageLance = appeler('/api/backup-catchup');
  return rattrapageLance;
}
/** (31/10) ce qu'étaient des cartes disparues (recto, cours, date de suppression), lu dans les copies GitHub */
export const retrouverDansCopies = (ids) => appeler('/api/backup-cartes', { ids });

/** « hier 03:31 », « aujourd'hui 09:12 », « 08/10 03:30 » */
export function quandLisible(iso, maintenant = new Date()) {
  if (!iso) return '—';
  const d = new Date(iso);
  const h = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const jour = (x) => x.toLocaleDateString('fr-CA');
  const hier = new Date(maintenant); hier.setDate(hier.getDate() - 1);
  if (jour(d) === jour(maintenant)) return `aujourd’hui ${h}`;
  if (jour(d) === jour(hier)) return `hier ${h}`;
  return `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ${h}`;
}

/** nombre de jours sans copie (null si récente) */
export function joursSansCopie(statut, maintenant = new Date()) {
  if (!statut || !statut.ok || !statut.configure || !statut.date) return null;
  const h = (maintenant - new Date(statut.date)) / 3600000;
  return h > HEURES_ALERTE ? Math.max(1, Math.floor(h / 24)) : null;
}
