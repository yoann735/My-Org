/* ============================================================
   MedRevise — SYNCHRO COMPLÈTE AVANT AFFICHAGE (28/10/2026, docs/compte-rendu-synchro-avant-affichage.md).
   Origine : docs/diagnostic-retard-26.md — un appareil ouvert le matin a montré « 26 en retard » calculés sur son
   état local, avant d'avoir reçu les réponses données la veille sur un autre appareil.
   On change QUAND on affiche, jamais COMMENT on fusionne : la passe réutilise telles quelles `syncNow` (outbox →
   tirage complet paginé → fusion LWW gardée par updated_at → envoi) et `synchroniserJournal` (envoi de la file,
   réception, application aux cartes), puis recharge l'état (plan du jour recalculé).
   Ce module ne contient que l'ORCHESTRATION (porte) et des fonctions pures ; les écrans lisent la phase par
   SynchroContext (components/Chiffre.jsx).
   Phases :
     'attente'   — passe en cours (ouverture, retour au premier plan, retour du réseau), moins de 8 s : les chiffres
                   calculés sont remplacés par un indicateur, Démarrer / Lancer désactivés, bandeau « Synchronisation… » ;
     'ajour'     — passe complète réussie ET empreinte locale = empreinte cloud : « À jour · 18:42 », puis fondu ;
     'horsligne' — échec, ou plus de 8 s : données locales affichées avec « Hors ligne · données du 27 oct. 22:10 »,
                   nouvel essai en fond (toutes les 30 s et au retour du réseau), mise à jour dès que c'est fait ;
     'incomplet' — passe réussie mais empreintes différentes, même après une 2ᵉ passe : « Synchro incomplète » + Réessayer ;
     'local'     — synchro non configurée sur ce déploiement : rien à attendre, rien à afficher.
   ============================================================ */

export const DELAI_MAX_MS = 8000;
export const REESSAI_MS = 30000;

const deux = (n) => String(n).padStart(2, '0');

/** « 18:42 » (heure locale) */
export function heureCourte(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${deux(d.getHours())}:${deux(d.getMinutes())}`;
}

/** « 27 oct. 22:10 » (heure locale) — date des données affichées hors ligne */
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
    case 'attente': return 'Synchronisation…';
    case 'ajour': return `À jour · ${heureCourte(porte.at)}`;
    case 'horsligne': return porte.depuis ? `Hors ligne · données du ${dateDonnees(porte.depuis)}` : 'Hors ligne · données de cet appareil';
    case 'incomplet': return 'Synchro incomplète';
    default: return null;
  }
}

/** empreintes comparées : identiques ET rien en attente d'envoi → la passe a vraiment tout aligné */
export const empreintesOk = (v) => !!v && !!v.local && !!v.cloud && v.local === v.cloud && !v.enAttente;

/**
 * PORTE : orchestration d'une passe complète, une seule à la fois.
 * Dépendances injectées (testables sans réseau) :
 *   passe()      → Promise<{ ok: boolean }>  : envoyer, tirer tout, appliquer le journal, recharger ;
 *   verifier()   → Promise<{ local, cloud, enAttente } | null> : empreintes (null = cloud illisible) ;
 *   poser(etat)  : publie l'état de la porte ; derniere() → ISO de la dernière synchro réussie ;
 *   marquer(iso) : retient la dernière synchro réussie ; horloge : { maintenant, attendre(ms, fn) → annuler }.
 */
export function creerPorte({ passe, verifier, poser, derniere = () => null, marquer = () => {}, horloge = horlogeReelle, delaiMax = DELAI_MAX_MS, reessai = REESSAI_MS }) {
  let enVol = null;
  let etat = { phase: 'attente', at: null, depuis: derniere() };
  let annulerReessai = null;
  const publier = (p) => { etat = { ...etat, ...p }; poser(etat); };

  async function unePasse() {
    const r = await passe();
    if (!r || !r.ok) return 'echec';
    const v = await verifier();
    if (!v) return 'echec';
    return empreintesOk(v) ? 'ok' : 'ecart';
  }

  function lancer() {
    if (enVol) return enVol;
    if (annulerReessai) { annulerReessai(); annulerReessai = null; }
    // déjà hors ligne : on garde le marqueur (les données locales restent affichées) pendant le nouvel essai
    if (etat.phase !== 'horsligne') publier({ phase: 'attente' });
    const annulerDelai = horloge.attendre(delaiMax, () => { if (etat.phase === 'attente') publier({ phase: 'horsligne', depuis: derniere() }); });
    enVol = (async () => {
      let res;
      try {
        res = await unePasse();
        if (res === 'ecart') res = await unePasse(); // une seule relance
      } catch (e) { res = 'echec'; }
      annulerDelai();
      const at = horloge.maintenant();
      if (res === 'ok') { marquer(at); publier({ phase: 'ajour', at, depuis: at }); }
      else if (res === 'ecart') { marquer(at); publier({ phase: 'incomplet', at, depuis: at }); }
      else {
        publier({ phase: 'horsligne', depuis: derniere() });
        annulerReessai = horloge.attendre(reessai, () => { annulerReessai = null; lancer(); });
      }
      return etat;
    })().finally(() => { enVol = null; });
    return enVol;
  }

  return { lancer, etat: () => etat, arreter: () => { if (annulerReessai) annulerReessai(); annulerReessai = null; } };
}

const horlogeReelle = {
  maintenant: () => new Date().toISOString(),
  attendre: (ms, fn) => { const t = setTimeout(fn, ms); return () => clearTimeout(t); },
};
