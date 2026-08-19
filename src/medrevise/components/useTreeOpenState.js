/* ============================================================
   MedRevise — état DÉPLIÉ / REPLIÉ de l'arbre (unités, chapitres, cours), MÉMORISÉ.

   Il était jusqu'ici purement local à chaque écran : quitter Réviser (ouvrir un
   cours, passer en Bibliothèque, recharger la page) démontait le composant et tout
   se refermait — il fallait re-déplier son unité et son chapitre à chaque retour.

   Persisté dans le store `stats`, c'est-à-dire le MÊME canal que les autres
   préférences d'affichage (largeur de la liste, voir Reviser.jsx#treeColWidth) :
   IndexedDB via lib/storage.js, jamais localStorage, et synchronisé comme le reste.

   Ce qui est écrit : la LISTE des dossiers OUVERTS et celle des cours REPLIÉS —
   donc uniquement les écarts au défaut (un dossier est fermé par défaut, un cours
   est ouvert). Deux conséquences voulues : la clé reste minuscule, et un dossier
   supprimé disparaît de lui-même de l'état sans nettoyage particulier.

   Réviser et Bibliothèque partagent la MÊME clé : un chapitre est le même objet
   dans les deux écrans (même store `dossiers`, même id), l'ouvrir d'un côté le
   laisse ouvert de l'autre — c'est le sens de « tout est là où je m'attends ».
   ============================================================ */
import { useEffect, useState } from 'react';

const OPEN_KEY = 'treeOpenDossiers';
const CLOSED_SRC_KEY = 'treeClosedSources';

const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
/** ids dont l'état vaut `valeur` — triés, pour que deux états égaux se comparent égaux. */
const idsWhere = (map, valeur) => Object.keys(map).filter((id) => !!map[id] === valeur).sort();

/**
 * @param ctx            contexte MedRevise (db, stats, saveStats)
 * @param opts.sources   true = cet écran gère AUSSI le repli des cours (Réviser).
 *                       Laissé à false (Bibliothèque), `openSrc` n'est ni lu ni
 *                       écrit : un écran qui n'affiche pas les cours ne doit pas
 *                       effacer la liste des cours repliés de l'autre.
 * @param opts.alsoOpen  ids de dossiers à ouvrir D'OFFICE au montage, en plus de
 *                       l'état mémorisé (jamais à refermer) — typiquement les
 *                       ancêtres de la fiche sélectionnée, voir ancestorDossierIds.
 *                       Passé à l'INITIALISATION pour que l'arbre soit déjà déplié
 *                       au premier rendu : le défilement vers la sélection a besoin
 *                       que sa ligne existe déjà dans le DOM.
 */
export function useTreeOpenState(ctx, { sources = false, alsoOpen = [] } = {}) {
  const st = ctx.stats || {};
  const [openDossier, setOpenDossier] = useState(() => Object.fromEntries(
    [...(st[OPEN_KEY] || []), ...alsoOpen].map((id) => [id, true]),
  ));
  const [openSrc, setOpenSrc] = useState(() => {
    const replies = new Set(st[CLOSED_SRC_KEY] || []);
    return Object.fromEntries(((ctx.db && ctx.db.sources) || []).map((s) => [s.id, !replies.has(s.id)]));
  });

  // Écriture uniquement quand l'état CHANGE vraiment (comparaison de listes triées) :
  // saveStats reposant `ctx.stats`, une écriture inconditionnelle rejouerait en boucle.
  useEffect(() => {
    if (!ctx.stats) return;
    const patch = {};
    const ouverts = idsWhere(openDossier, true);
    if (!sameList(ouverts, [...(ctx.stats[OPEN_KEY] || [])].sort())) patch[OPEN_KEY] = ouverts;
    if (sources) {
      const replies = idsWhere(openSrc, false);
      if (!sameList(replies, [...(ctx.stats[CLOSED_SRC_KEY] || [])].sort())) patch[CLOSED_SRC_KEY] = replies;
    }
    if (Object.keys(patch).length) ctx.saveStats({ ...ctx.stats, ...patch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDossier, openSrc, ctx.stats, sources]);

  return { openDossier, setOpenDossier, openSrc, setOpenSrc };
}

/**
 * Dossiers ANCÊTRES d'une fiche : son chapitre, puis l'unité qui le contient.
 * Sert à garantir que la fiche sélectionnée au montage est VISIBLE — restaurer la
 * sélection sans déplier ce qui la contient ne servirait à rien (et le défilement
 * vers elle n'aurait aucune ligne à viser). Rien n'est jamais refermé.
 * @returns {string[]} 0, 1 ou 2 ids
 */
export function ancestorDossierIds(fiche, dossiers) {
  if (!fiche || !fiche.dossierId) return [];
  const dos = (dossiers || []).find((d) => d.id === fiche.dossierId);
  if (!dos) return [];
  return dos.parentId ? [dos.id, dos.parentId] : [dos.id];
}
