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

export const cmdCreer = (store, rec, libelle) => ({
  libelle: libelle || 'Création',
  faire: () => put(store, rec),
  defaire: () => remove(store, rec.id),
});

export const cmdSupprimer = (store, rec, libelle) => ({
  libelle: libelle || 'Suppression',
  faire: () => remove(store, rec.id),
  defaire: () => put(store, rec),
});

export const cmdModifier = (store, avant, apres, libelle) => ({
  libelle: libelle || 'Modification',
  faire: () => put(store, apres),
  defaire: () => put(store, avant),
});

/* ---- CŒUR PUR (sans React) : la pile elle-même. Séparé de l'enveloppe React
   juste en dessous pour être exécutable et VÉRIFIABLE hors navigateur — une pile
   d'annulation qui se trompe est exactement le genre de bogue qu'on ne veut pas
   découvrir en production. `apres` est rappelé après chaque faire/defaire
   (rechargement de l'UI), `onChange` à chaque variation de l'état des piles. ---- */
export function creerPile({ max = MAX_HISTORIQUE, apres = null, onChange = null } = {}) {
  const pileAnnuler = [];
  const pileRetablir = [];
  let occupe = false; // sérialise : deux Cmd+Z tenus n'entrelacent rien

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
  const finir = async () => { signaler(); if (apres) await apres(); };

  /** exécute une commande NEUVE : elle devient annulable, et toute pile de
      rétablissement en cours devient caduque (on a bifurqué). */
  async function appliquer(cmd) {
    if (!cmd || occupe) return;
    occupe = true;
    try {
      await cmd.faire();
      pileAnnuler.push(cmd);
      if (pileAnnuler.length > max) pileAnnuler.shift();
      pileRetablir.length = 0;
      await finir();
    } finally { occupe = false; }
  }

  async function annuler() {
    if (occupe) return;
    const cmd = pileAnnuler.pop();
    if (!cmd) return;
    occupe = true;
    try { await cmd.defaire(); pileRetablir.push(cmd); await finir(); }
    finally { occupe = false; }
  }

  async function retablir() {
    if (occupe) return;
    const cmd = pileRetablir.pop();
    if (!cmd) return;
    occupe = true;
    try { await cmd.faire(); pileAnnuler.push(cmd); await finir(); }
    finally { occupe = false; }
  }

  /** changement de document : la pile de l'ancien n'a plus de sens. */
  function vider() { pileAnnuler.length = 0; pileRetablir.length = 0; signaler(); }

  return { appliquer, annuler, retablir, vider, etat };
}

const ETAT_VIDE = { peutAnnuler: false, peutRetablir: false, libelleAnnuler: null, libelleRetablir: null, profondeur: 0 };

/**
 * Enveloppe React du cœur ci-dessus : une seule pile par montage, et un état
 * React qui suit sa profondeur (pour activer/désactiver les deux boutons).
 * @param {Function} onApres rappelé après chaque faire/defaire (rechargement de l'UI)
 */
export function useAnnotHistorique(onApres) {
  const [etat, setEtat] = useState(ETAT_VIDE);
  const apres = useRef(onApres);
  apres.current = onApres;

  const pile = useRef(null);
  if (!pile.current) {
    pile.current = creerPile({
      onChange: setEtat,
      apres: () => (apres.current ? apres.current() : undefined),
    });
  }
  const p = pile.current;

  return {
    appliquer: useCallback((cmd) => p.appliquer(cmd), [p]),
    annuler: useCallback(() => p.annuler(), [p]),
    retablir: useCallback(() => p.retablir(), [p]),
    vider: useCallback(() => p.vider(), [p]),
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
