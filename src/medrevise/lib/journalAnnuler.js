/* ============================================================
   MedRevise — ANNULER / RÉTABLIR : UN SEUL JOURNAL par document ouvert (08/10,
   docs/compte-rendu-undo-ocr-export.md).

   AVANT : deux sortes de piles se disputaient ⌘Z — celle des annotations
   (lib/annotHistory.js) et une pile ProseMirror PAR PAGE de texte d'un document. La
   fenêtre envoyait ⌘Z à la pile des annotations dès que le focus n'était pas dans le
   texte, et à la pile de la page focalisée sinon : ⌘Z défaisait « ce qui dépend du
   focus », pas la dernière action. Une page démontée (virtualisation) perdait sa pile ;
   une image déplacée d'une page à l'autre vivait dans deux piles (un ⌘Z n'en défaisait
   que la moitié) ; ⌘Y n'existait nulle part ; les boutons ne voyaient que les annotations.

   MAINTENANT : un journal CHRONOLOGIQUE unique. Chaque entrée est une liste d'éléments :
     { k: 'annot' }                         → une commande de la pile des annotations ;
     { k: 'page', pageId, avant, apres }    → l'état d'une page de texte avant / après
                                              (instantané JSON : survit au démontage).
   - frappe continue sur une même page (< 1 s) = UNE entrée ;
   - transactions « système » (débordement d'une page sur l'autre) : rattachées à
     l'entrée qui les a causées → un ⌘Z remet les DEUX pages en place ;
   - `groupe` (image déplacée d'une page à l'autre) : une seule entrée pour les deux pages.
   Les annotations gardent leur pile (commandes inversibles, effets locaux) : le journal
   ne fait que l'ORDONNER avec le texte.
   ============================================================ */
import { useCallback, useRef, useState } from 'react';

const DELAI_FRAPPE = 1000;
const DELAI_SYSTEME = 2500;
const MAX = 200;

export function creerJournal({ annot, restaurerPage, onChange }) {
  const pile = [];
  const refaire = [];
  let enRoutage = false;
  let file = Promise.resolve();

  const etat = () => {
    const a = pile[pile.length - 1], r = refaire[refaire.length - 1];
    return { peutAnnuler: !!a, peutRetablir: !!r, libelleAnnuler: a ? a.libelle : null, libelleRetablir: r ? r.libelle : null, profondeur: pile.length };
  };
  const signaler = () => onChange && onChange(etat());
  const nouvelle = (entree) => {
    pile.push(entree);
    if (pile.length > MAX) pile.shift();
    if (refaire.length) { refaire.length = 0; if (annot.oublierRetablir) annot.oublierRetablir(); }
    signaler();
  };

  /** une commande d'annotation : une entrée */
  function appliquer(cmd) {
    if (!cmd) return Promise.resolve();
    nouvelle({ libelle: cmd.libelle || 'Annotation', items: [{ k: 'annot' }], t: Date.now() });
    return annot.appliquer(cmd);
  }

  /** une page de texte a changé (appelé par PageTexte à chaque transaction) */
  function noterPage(pageId, avant, apres, { systeme = false, saisie = false, groupe = null, libelle = null } = {}) {
    if (enRoutage || !pageId) return;
    const maintenant = Date.now();
    const der = pile[pile.length - 1];
    const ajouter = (e) => {
      const it = e.items.find((x) => x.k === 'page' && x.pageId === pageId);
      if (it) it.apres = apres; else e.items.push({ k: 'page', pageId, avant, apres });
      e.t = maintenant;
    };
    if (systeme) { // conséquence d'une action (débordement…) : jointe à l'entrée qui l'a causée
      if (der && maintenant - der.t < DELAI_SYSTEME && der.items.some((x) => x.k === 'page')) ajouter(der);
      return;
    }
    if (groupe && der && der.groupe === groupe) { ajouter(der); return; }
    if (saisie && der && der.saisie && maintenant - der.t < DELAI_FRAPPE && der.items.length >= 1 && der.items[0].pageId === pageId) {
      ajouter(der);
      return;
    }
    nouvelle({ libelle: libelle || (saisie ? 'Saisie' : 'Modification du texte'), items: [{ k: 'page', pageId, avant, apres }], t: maintenant, saisie, groupe });
  }

  const enFile = (op) => { file = file.then(op).catch((e) => console.error('[journalAnnuler]', e)); return file; };

  function annuler() {
    const e = pile.pop();
    if (!e) return Promise.resolve();
    refaire.push(e);
    signaler();
    return enFile(async () => {
      enRoutage = true;
      try {
        for (const it of [...e.items].reverse()) {
          if (it.k === 'annot') await annot.annuler();
          else await restaurerPage(it.pageId, it.avant);
        }
      } finally { enRoutage = false; }
    });
  }

  function retablir() {
    const e = refaire.pop();
    if (!e) return Promise.resolve();
    pile.push(e);
    signaler();
    return enFile(async () => {
      enRoutage = true;
      try {
        for (const it of e.items) {
          if (it.k === 'annot') await annot.retablir();
          else await restaurerPage(it.pageId, it.apres);
        }
      } finally { enRoutage = false; }
    });
  }

  function vider() { pile.length = 0; refaire.length = 0; annot.vider(); signaler(); }
  return { appliquer, noterPage, annuler, retablir, vider, etat, enRoutage: () => enRoutage };
}

const VIDE = { peutAnnuler: false, peutRetablir: false, libelleAnnuler: null, libelleRetablir: null, profondeur: 0 };

/** Enveloppe React : même interface que useAnnotHistorique (le lecteur et la barre n'y voient
 *  aucune différence), plus `noterPage` pour les pages de texte d'un document. */
export function useJournalAnnuler(annot, restaurerPage) {
  const [etat, setEtat] = useState(VIDE);
  const restaurer = useRef(restaurerPage); restaurer.current = restaurerPage;
  const annotRef = useRef(annot); annotRef.current = annot;
  const j = useRef(null);
  if (!j.current) {
    j.current = creerJournal({
      annot: {
        appliquer: (c) => annotRef.current.appliquer(c), annuler: () => annotRef.current.annuler(),
        retablir: () => annotRef.current.retablir(), vider: () => annotRef.current.vider(),
        oublierRetablir: () => annotRef.current.oublierRetablir && annotRef.current.oublierRetablir(),
      },
      restaurerPage: (id, json) => restaurer.current(id, json),
      onChange: setEtat,
    });
  }
  const p = j.current;
  return {
    appliquer: useCallback((cmd) => p.appliquer(cmd), [p]),
    annuler: useCallback(() => p.annuler(), [p]),
    retablir: useCallback(() => p.retablir(), [p]),
    vider: useCallback(() => p.vider(), [p]),
    noterPage: useCallback((...a) => p.noterPage(...a), [p]),
    ...etat,
  };
}

/* ROUTAGE DES RACCOURCIS (règle unique) :
   - ⌘Z / Ctrl+Z = annuler ; ⌘⇧Z, Ctrl+Maj+Z ET ⌘Y / Ctrl+Y = rétablir ;
   - champ de formulaire (input, textarea) → historique NATIF du navigateur (⌘Y y est
     traduit en « rétablir » natif par installerRetablirChamps) ;
   - autre texte éditable qui a SON historique (boîte de texte d'un PDF, notes, transcript)
     → son éditeur ;
   - tout le reste — texte d'une page de document, image, annotation, rien de focalisé
     → le journal du document. */
export function raccourciAnnuler(e) {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null;
  const k = String(e.key).toLowerCase();
  if (k === 'z') return e.shiftKey ? 'retablir' : 'annuler';
  if (k === 'y' && !e.shiftKey) return 'retablir';
  return null;
}

let installe = false;
/** ⌘Y / Ctrl+Y dans un champ de saisie : rétablir NATIF (sinon Chrome ouvre l'historique sur
 *  Mac, ou rien ne se passe). Installé une fois pour toute l'app. */
export function installerRetablirChamps() {
  if (installe || typeof window === 'undefined') return;
  installe = true;
  window.addEventListener('keydown', (e) => {
    if (raccourciAnnuler(e) !== 'retablir' || String(e.key).toLowerCase() !== 'y') return;
    const t = e.target;
    if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return;
    e.preventDefault();
    try { document.execCommand('redo'); } catch (x) { /* navigateur sans execCommand */ }
  }, true);
}
