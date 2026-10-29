/* ============================================================
   MedRevise — SYNCHRO COMPLÈTE AVANT AFFICHAGE (28/10/2026, docs/compte-rendu-synchro-avant-affichage.md).
   Origine : docs/diagnostic-retard-26.md — un appareil ouvert le matin a montré « 26 en retard » calculés sur son
   état local, avant d'avoir reçu les réponses données la veille sur un autre appareil.
   On change QUAND on affiche, jamais COMMENT on fusionne : la passe réutilise telles quelles `syncNow` (outbox →
   tirage complet paginé → fusion LWW gardée par updated_at → envoi) et `synchroniserJournal` (envoi de la file,
   réception, application aux cartes), puis recharge l'état (plan du jour recalculé).
   Ce module ne contient que l'ORCHESTRATION (porte) et des fonctions pures ; les écrans lisent la phase par
   SynchroContext (components/Chiffre.jsx).

   (29/10, docs/compte-rendu-statut-synchro.md) RÈGLES DE STATUT — le délai de 8 s qui basculait en « Hors ligne »
   pendant une passe simplement longue est SUPPRIMÉ, et la dernière synchro réussie n'est plus écrite sur un écart.
   Phases :
     'attente'   — passe en cours, AUSSI LONGTEMPS QUE NÉCESSAIRE : chiffres remplacés par un indicateur, Démarrer /
                   Lancer désactivés, bandeau « Synchronisation… » (+ « 1200 / 4469 » pendant un gros envoi) ;
     'ajour'     — SEULEMENT si envoi terminé, tirage complet terminé, empreinte locale = empreinte cloud et file
                   d'envoi vide : « À jour · 18:42 », puis fondu. Seul cas où la dernière synchro réussie est notée ;
     'horsligne' — VRAIE absence de réseau : navigator.onLine faux, ou deux erreurs réseau de suite. Affiche l'heure
                   de la DERNIÈRE SYNCHRO RÉUSSIE ; nouvel essai toutes les 30 s et au retour du réseau ;
     'echec'     — le serveur a répondu par une erreur : « Synchro en échec » + Réessayer (nouvel essai en fond) ;
     'incomplet' — passes réussies mais empreintes encore différentes après MAX_PASSES : « Synchro incomplète » +
                   Réessayer ;
     'local'     — synchro non configurée sur ce déploiement : rien à attendre, rien à afficher.
   ============================================================ */

export const REESSAI_MS = 30000;
/** une 1ʳᵉ erreur réseau alors que l'appareil se dit en ligne : on réessaie vite, sans rien afficher d'alarmant */
export const REESSAI_RESEAU_MS = 3000;
/** passes enchaînées tant que les empreintes diffèrent (un autre appareil peut écrire pendant la passe) */
export const MAX_PASSES = 3;

const deux = (n) => String(n).padStart(2, '0');

/** « 18:42 » (heure locale) */
export function heureCourte(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${deux(d.getHours())}:${deux(d.getMinutes())}`;
}

/** « 27 oct. 22:10 » (heure locale) — date de la dernière synchro réussie */
export function dateDonnees(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ${heureCourte(iso)}`;
}

/** libellé du bandeau pour une phase (null = rien à afficher) */
export function libelleBandeau(porte) {
  if (!porte) return null;
  switch (porte.phase) {
    case 'attente': {
      const p = porte.progression;
      return p && p.total ? `Synchronisation… ${p.faits} / ${p.total}` : 'Synchronisation…';
    }
    case 'ajour': return `À jour · ${heureCourte(porte.at)}`;
    case 'horsligne': return porte.depuis ? `Hors ligne · dernière synchro ${dateDonnees(porte.depuis)}` : 'Hors ligne · jamais synchronisé';
    case 'echec': return 'Synchro en échec';
    case 'incomplet': return 'Synchro incomplète';
    default: return null;
  }
}

/** empreintes comparées : identiques ET rien en attente d'envoi → la passe a vraiment tout aligné */
export const empreintesOk = (v) => !!v && !!v.local && !!v.cloud && v.local === v.cloud && !v.enAttente;

const enLigneNavigateur = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

/**
 * PORTE : orchestration d'une passe complète, une seule à la fois.
 * Dépendances injectées (testables sans réseau) :
 *   passe()      → Promise<{ ok: boolean, erreur?: 'reseau'|'serveur' }> : envoyer, tirer tout, appliquer le journal, recharger ;
 *   verifier()   → Promise<{ local, cloud, enAttente } | { erreur } | null> : empreintes (null = cloud illisible, réseau) ;
 *   poser(etat)  : publie l'état de la porte ; derniere() → ISO de la dernière synchro réussie ;
 *   marquer(iso) : retient la dernière synchro réussie (appelé UNIQUEMENT sur « à jour ») ;
 *   enLigne()    : navigator.onLine ; horloge : { maintenant, attendre(ms, fn) → annuler }.
 */
export function creerPorte({ passe, verifier, poser, derniere = () => null, marquer = () => {}, enLigne = enLigneNavigateur, horloge = horlogeReelle, reessai = REESSAI_MS, reessaiReseau = REESSAI_RESEAU_MS, maxPasses = MAX_PASSES }) {
  let enVol = null;
  let etat = { phase: 'attente', at: null, depuis: derniere(), progression: null };
  let annulerReessai = null;
  let echecsReseau = 0;
  const publier = (p) => { etat = { ...etat, ...p }; poser(etat); };
  const pause = (ms) => new Promise((r) => { horloge.attendre(ms, r); });

  /** 'ok' | 'ecart' | 'reseau' | 'serveur' */
  async function unePasse() {
    const r = await passe();
    if (!r || !r.ok) return (r && r.erreur) === 'serveur' ? 'serveur' : 'reseau';
    const v = await verifier();
    if (!v) return 'reseau';
    if (v.erreur) return v.erreur === 'serveur' ? 'serveur' : 'reseau';
    return empreintesOk(v) ? 'ok' : 'ecart';
  }

  const programmerReessai = () => { annulerReessai = horloge.attendre(reessai, () => { annulerReessai = null; lancer(); }); };
  const horsLigne = () => { publier({ phase: 'horsligne', depuis: derniere(), progression: null }); programmerReessai(); };

  function lancer() {
    if (enVol) return enVol;
    if (annulerReessai) { annulerReessai(); annulerReessai = null; }
    if (!enLigne()) { horsLigne(); return Promise.resolve(etat); } // pas de réseau du tout : inutile d'essayer
    publier({ phase: 'attente', progression: null });
    enVol = (async () => {
      let res = 'reseau';
      try {
        for (let n = 0; n < maxPasses; n++) {
          res = await unePasse();
          if (res === 'reseau' && enLigne() && echecsReseau === 0) { echecsReseau = 1; await pause(reessaiReseau); n--; continue; }
          if (res !== 'ecart') break;
        }
      } catch (e) { res = 'serveur'; }
      const at = horloge.maintenant();
      if (res === 'ok') { echecsReseau = 0; marquer(at); publier({ phase: 'ajour', at, depuis: at, progression: null }); }
      else if (res === 'reseau') { echecsReseau = 2; horsLigne(); }
      else {
        echecsReseau = 0;
        publier({ phase: res === 'ecart' ? 'incomplet' : 'echec', at, depuis: derniere(), progression: null });
        programmerReessai();
      }
      return etat;
    })().finally(() => { enVol = null; });
    return enVol;
  }

  /** progression d'un gros envoi ({ faits, total } ou null) — affichée seulement pendant la passe */
  function progression(p) { if (etat.phase === 'attente') publier({ progression: p }); }

  return { lancer, progression, etat: () => etat, arreter: () => { if (annulerReessai) annulerReessai(); annulerReessai = null; } };
}

const horlogeReelle = {
  maintenant: () => new Date().toISOString(),
  attendre: (ms, fn) => { const t = setTimeout(fn, ms); return () => clearTimeout(t); },
};
