/* ============================================================
   MedRevise — CONFIRMATION PAR LE SERVEUR : LA seule règle de sortie de file (19/11/2026,
   docs/compte-rendu-74-en-attente.md).

   Une entrée ne quitte une file d'envoi (enregistrements `medrevise-outbox`, journal des révisions
   `medrevise-review_log_outbox`) QUE si le serveur, RELU, possède exactement cette version :
   - enregistrement : même (store, id), même instant `updated_at` (« Z » = « +00:00 »), même état supprimé ;
   - entrée du journal : même id, même carte, même note, même instant `reviewed_at` (une entrée est immuable).
   Ce module est PUR (aucune lecture, aucune écriture) : il compare ce qu'on a en file à ce que le serveur
   a renvoyé, et classe chaque entrée :
     'identique'      → le serveur l'a : l'entrée de FILE peut sortir (la donnée locale est gardée) ;
     'absent'         → le serveur ne l'a pas : elle part (ou repart) par le chemin normal ;
     'serveur_recent' → le serveur a une version PLUS RÉCENTE : rien n'est écrasé, l'entrée est signalée ;
     'different'      → même identifiant, contenu différent (journal) : rien n'est écrasé, l'entrée est signalée.
   Utilisé par la purge des enregistrements (lib/storage.js purgerOutboxAligne) ET par le journal
   (journal/synchro.js) : un seul code pour tous les types d'éléments.
   ============================================================ */

/** instant (ms) d'une date ISO, quelle que soit son écriture ; null si illisible */
export const instant = (v) => { const t = Date.parse(v || ''); return Number.isNaN(t) ? null : t; };

/** version comparable d'un ENREGISTREMENT (entrée d'outbox ou ligne de medrevise_records) */
export const versionEnregistrement = (r) => ({ t: instant(r && (r.updated_at ?? r.updatedAt)), suppr: !!(r && r.deleted) });

/** version comparable d'une ENTRÉE DU JOURNAL (entrée locale ou ligne du serveur) */
export const versionJournal = (e) => ({
  carte: (e && e.card_id) || null,
  note: e && e.rating != null ? Number(e.rating) : null,
  t: instant(e && e.reviewed_at),
});

/** classe UNE entrée locale face à la ligne du serveur (ou undefined si le serveur ne l'a pas) */
export function classer(genre, local, serveur) {
  if (!serveur) return 'absent';
  if (genre === 'journal') {
    const a = versionJournal(local), b = versionJournal(serveur);
    return a.carte === b.carte && a.note === b.note && a.t !== null && a.t === b.t ? 'identique' : 'different';
  }
  const a = versionEnregistrement(local), b = versionEnregistrement(serveur);
  if (a.t !== null && a.t === b.t && a.suppr === b.suppr) return 'identique';
  if (b.t !== null && (a.t === null || b.t > a.t)) return 'serveur_recent';
  return 'absent'; // le serveur a une version plus ANCIENNE : la nôtre doit partir
}

/**
 * Classe une liste d'entrées locales face aux lignes renvoyées par le serveur.
 * @param genre    'enregistrement' | 'journal'
 * @param locales  entrées en file (objets portant leur clé via `cleDe`)
 * @param serveur  lignes relues sur le serveur
 * @param cleDe    (entrée|ligne) → clé commune (ex. 'questions:q1' ou l'id du journal)
 * @returns {{ identique: object[], absent: object[], serveur_recent: object[], different: object[] }}
 */
export function classerContreServeur(genre, locales, serveur, cleDe) {
  const S = new Map((serveur || []).map((l) => [cleDe(l), l]));
  const out = { identique: [], absent: [], serveur_recent: [], different: [] };
  for (const e of locales || []) out[classer(genre, e, S.get(cleDe(e)))].push(e);
  return out;
}

/** raison lisible, en une ligne, d'un classement (liste « N en attente », diagnostic) */
export const RAISONS = {
  absent: 'absente du serveur : envoi au prochain passage',
  serveur_recent: 'le serveur a une version plus récente : rien n’est écrasé',
  different: 'le serveur a une autre version sous le même identifiant : rien n’est écrasé',
};
