/* ============================================================
   MedRevise — ANNULER / RÉTABLIR les annotations d'un PDF (surlignages et
   boîtes de texte), pour le lecteur pdf/PdfReader.jsx.

   PRINCIPE. Une pile de COMMANDES INVERSIBLES, jamais un journal de diffs :
   chaque commande porte l'état COMPLET d'avant et d'après, et sait donc se
   défaire sans rien recalculer. Les trois formes couvrent tout :

     cmdCreer(store, rec)            faire: put(rec)     defaire: remove(id)
     cmdSupprimer(store, rec)        faire: remove(id)   defaire: put(rec)
     cmdModifier(store, avant, apres) faire: put(apres)  defaire: put(avant)

   UN SEUL POINT DE PASSAGE. Toutes les écritures d'annotation du lecteur
   passent par `appliquer()` : exécute, empile, vide la pile de rétablissement,
   recharge. C'est ce qui garantit qu'aucune action ne peut échapper à
   l'historique — y compris celles qu'on ajoutera plus tard (la boîte de texte
   libre naît annulable sans une ligne de plus).

   SYNCHRO. `faire`/`defaire` passent par put/remove de lib/storage.js, donc par
   queuePush : une annulation est une écriture NORMALE, horodatée maintenant, qui
   gagne donc le last-write-wins. Annuler une suppression réhabilite même un
   enregistrement déjà supprimé au cloud (reconcileAll : « local plus récent →
   réhabiliter »). Aucun chemin parallèle, aucun cas particulier côté synchro.

   NON PERSISTÉE, ET C'EST VOULU. La pile vit le temps d'une ouverture de
   document. Une pile rechargée le lendemain, appliquée sur des données qu'un
   autre appareil a pu changer entre-temps, ferait plus de dégâts qu'elle n'en
   répare.

   PAS LE TEXTE. Ce qu'on tape DANS une boîte relève de l'historique de TipTap
   (curseur dans la boîte → Cmd+Z va à l'éditeur). Cette pile-ci gère les
   actions sur les annotations elles-mêmes : pose, couleur, note, déplacement,
   redimension, suppression. Deux historiques, deux portées, jamais en conflit
   parce que le partage se fait sur la cible du clavier (voir PdfReader).
   ============================================================ */
import { useCallback, useRef, useState } from 'react';
import { put, remove } from './storage.js';

export const MAX_HISTORIQUE = 100;

/* ---- EFFETS LOCAUX (correctif « hallucinations », 02/10) ----
   CAUSE RACINE du flash parasite (un élément qui réapparaît ~0,5 s à son ancienne
   place) : à la fin d'un geste, l'aperçu local du composant (position pendant le
   glisser, boîte ouverte…) était effacé TOUT DE SUITE, alors que l'état React des
   annotations n'était mis à jour qu'APRÈS l'écriture IndexedDB puis une relecture
   complète des deux stores (`apres`). Entre les deux, on redessinait l'ancien
   enregistrement. Chaque commande décrit donc son EFFET (`effets` : avant/après
   par enregistrement), appliqué À L'ÉCRAN de façon synchrone par `local()` — dans
   le même rendu que la fin du geste —, puis persisté. La relecture finale ne fait
   plus que confirmer. */
const effet = (store, avant, apres) => ({ store, avant: avant || null, apres: apres || null });

export const cmdCreer = (store, rec, libelle) => ({
  libelle: libelle || 'Création',
  effets: [effet(store, null, rec)],
  faire: () => put(store, rec),
  defaire: () => remove(store, rec.id),
});

export const cmdSupprimer = (store, rec, libelle) => ({
  libelle: libelle || 'Suppression',
  effets: [effet(store, rec, null)],
  faire: () => remove(store, rec.id),
  defaire: () => put(store, rec),
});

export const cmdModifier = (store, avant, apres, libelle) => ({
  libelle: libelle || 'Modification',
  effets: [effet(store, avant, apres)],
  faire: () => put(store, apres),
  defaire: () => put(store, avant),
});

/** plusieurs commandes = UNE entrée d'annulation (gomme, retrait d'une page…). */
export const cmdGroupe = (libelle, cmds) => (cmds.length === 1 ? cmds[0] : {
  libelle,
  effets: cmds.flatMap((c) => c.effets || []),
  faire: async () => { for (const c of cmds) await c.faire(); },
  defaire: async () => { for (const c of [...cmds].reverse()) await c.defaire(); },
});

/** effets à appliquer à l'écran pour défaire : avant et après échangés, ordre inversé. */
const inverser = (effets) => [...(effets || [])].reverse().map((e) => ({ store: e.store, avant: e.apres, apres: e.avant }));

/* ---- CŒUR PUR (sans React) : la pile elle-même. Séparé de l'enveloppe React
   juste en dessous pour être exécutable et VÉRIFIABLE hors navigateur — une pile
   d'annulation qui se trompe est exactement le genre de bogue qu'on ne veut pas
   découvrir en production. `local(effets)` est appelé de façon SYNCHRONE avant
   toute écriture ; `apres` (relecture) seulement quand plus rien n'attend ;
   `onChange` à chaque variation de l'état des piles.
   FILE D'ATTENTE (02/10) : avant, une action arrivée pendant l'écriture d'une
   autre était IGNORÉE (`occupe`) — deux gestes rapides, et le second disparaissait
   au rechargement. Elles s'enchaînent désormais dans l'ordre. ---- */
export function creerPile({ max = MAX_HISTORIQUE, apres = null, onChange = null, local = null } = {}) {
  const pileAnnuler = [];
  const pileRetablir = [];
  let file = Promise.resolve();
  let enAttente = 0;

  const etat = () => {
    const a = pileAnnuler[pileAnnuler.length - 1] || null;
    const r = pileRetablir[pileRetablir.length - 1] || null;
    return {
      peutAnnuler: !!a, peutRetablir: !!r,
      libelleAnnuler: a ? a.libelle : null, libelleRetablir: r ? r.libelle : null,
      profondeur: pileAnnuler.length,
    };
  };
  const signaler = () => { if (onChange) onChange(etat()); };
  const montrer = (effets) => { if (local && effets && effets.length) local(effets); };
  // enchaîne une opération ; la relecture n'a lieu que quand la file est vide
  // (sinon elle lirait la base AVANT l'écriture suivante et ferait revenir en arrière)
  const enFile = (op) => {
    enAttente += 1;
    file = file.then(op).catch((e) => { console.error('[annotHistory]', e); }).then(async () => {
      enAttente -= 1;
      signaler();
      if (!enAttente && apres) await apres();
    });
    return file;
  };

  /** exécute une commande NEUVE : visible tout de suite, puis écrite. Elle devient
      annulable, et toute pile de rétablissement en cours devient caduque. */
  function appliquer(cmd) {
    if (!cmd) return Promise.resolve();
    montrer(cmd.effets);
    pileAnnuler.push(cmd);
    if (pileAnnuler.length > max) pileAnnuler.shift();
    pileRetablir.length = 0;
    signaler();
    return enFile(() => cmd.faire());
  }

  function annuler() {
    const cmd = pileAnnuler.pop();
    if (!cmd) return Promise.resolve();
    montrer(inverser(cmd.effets));
    pileRetablir.push(cmd);
    signaler();
    return enFile(() => cmd.defaire());
  }

  function retablir() {
    const cmd = pileRetablir.pop();
    if (!cmd) return Promise.resolve();
    montrer(cmd.effets);
    pileAnnuler.push(cmd);
    signaler();
    return enFile(() => cmd.faire());
  }

  /** changement de document : la pile de l'ancien n'a plus de sens. */
  function vider() { pileAnnuler.length = 0; pileRetablir.length = 0; signaler(); }
  /** une action NEUVE ailleurs (texte d'un document, lib/journalAnnuler.js) rend caduc ce
      qui attendait d'être rétabli ici — comme `appliquer` le fait pour ses propres actions */
  function oublierRetablir() { if (pileRetablir.length) { pileRetablir.length = 0; signaler(); } }

  return { appliquer, annuler, retablir, vider, oublierRetablir, etat };
}

const ETAT_VIDE = { peutAnnuler: false, peutRetablir: false, libelleAnnuler: null, libelleRetablir: null, profondeur: 0 };

/**
 * Enveloppe React du cœur ci-dessus : une seule pile par montage, et un état
 * React qui suit sa profondeur (pour activer/désactiver les deux boutons).
 * @param {Function} onApres rappelé après chaque faire/defaire (rechargement de l'UI)
 */
export function useAnnotHistorique(onApres, onLocal) {
  const [etat, setEtat] = useState(ETAT_VIDE);
  const apres = useRef(onApres);
  apres.current = onApres;
  const local = useRef(onLocal);
  local.current = onLocal;

  const pile = useRef(null);
  if (!pile.current) {
    pile.current = creerPile({
      onChange: setEtat,
      apres: () => (apres.current ? apres.current() : undefined),
      local: (effets) => (local.current ? local.current(effets) : undefined),
    });
  }
  const p = pile.current;

  return {
    appliquer: useCallback((cmd) => p.appliquer(cmd), [p]),
    annuler: useCallback(() => p.annuler(), [p]),
    retablir: useCallback(() => p.retablir(), [p]),
    vider: useCallback(() => p.vider(), [p]),
    oublierRetablir: useCallback(() => p.oublierRetablir(), [p]),
    ...etat,
  };
}

/** Cmd+Z / Cmd+Maj+Z doivent-ils être IGNORÉS ici ? Oui dès que la frappe vise
    un champ de saisie ou du contenu éditable : le texte a son propre historique
    (TipTap dans une boîte, la zone de note d'un surlignage). Même garde que
    pages/ImportAnatomieVisuel.jsx pour la touche Espace. */
export function cibleEditable(el) {
  return !!(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable));
}
