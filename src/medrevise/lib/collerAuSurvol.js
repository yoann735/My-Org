/* ============================================================
   MedRevise — COLLER UNE IMAGE À L'ENDROIT SURVOLÉ (11/10/2026,
   docs/compte-rendu-flashcards.md « Collage d'image au survol »).

   Un seul écouteur de collage par formulaire de carte. Les zones image sont déclarées dans le
   DOM, sans état React :
     data-zone-image="<clé>"   zone visée au SURVOL de la souris (et au dépôt d'un fichier) ;
     data-zone-focus="<clé>"   zone visée quand un champ qu'elle contient a le FOCUS.
   Quand le presse-papiers porte une image, la cible est, dans cet ordre :
     1) la zone survolée par la souris ;
     2) la zone dont un champ a le focus ;
     3) la zone par défaut (`defaut()`, ex. l'image générale d'une carte Muscle).
   Sans image dans le presse-papiers : aucune interception (collage de texte normal). Avec une
   image ET du texte, focus dans un champ et aucune zone survolée : le texte est collé (comme
   avant) — une image copiée depuis le web arrive souvent avec du texte.
   Remplacer une image existante est annulable : ⌘Z / Ctrl+Z (tant que l'on n'a pas retapé de
   texte dans un champ depuis — sinon ⌘Z annule le texte, comme d'habitude), ou « Annuler » dans
   le petit message qui s'affiche.
   Survol = souris seulement (pointerType 'mouse') : sur tablette / téléphone, règles 2 puis 3,
   et le bouton « Coller » de chaque zone (components/CollageImage.jsx BoutonColler).
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { imageDuPressePapier, texteDuPressePapier, imageDuDepot, glisseDesFichiers } from './collerImage.js';
import { cibleEditable } from './annotHistory.js';

export const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
export const RACCOURCI_COLLER = MAC ? '⌘V' : 'Ctrl+V';
const CLASSE_SURVOL = 'zi-survol';
const CLASSE_COLLAGE = 'zi-collage';
// zone survolée, tous formulaires confondus : un formulaire ne prend jamais un collage visé sur un AUTRE
// (deux formulaires peuvent être montés à la fois, ex. carte standard masquée + carte Muscle)
let survolGlobal = null;
const visible = (el) => !!(el && el.isConnected && el.getClientRects().length);

const zoneDe = (el, attr) => (el && el.closest ? el.closest(`[${attr}]`) : null);
// élément qui porte le contour et le libellé : la zone elle-même, ou son champ image [data-zone-visuel]
const visuelDe = (zone) => (!zone ? null : zone.hasAttribute('data-zone-visuel') ? zone : zone.querySelector('[data-zone-visuel]') || zone);

/**
 * @param racineRef  ref du formulaire (les zones doivent être dedans)
 * @param options
 *   actif            false → rien n'est écouté (formulaire caché, carte sans image…)
 *   appliquer(cle, fichier) → valeur PRÉCÉDENTE de la zone si elle avait déjà une image (pour ⌘Z), sinon null
 *   restaurer(cle, ancienne) remet la valeur précédente
 *   defaut()          clé de la zone par défaut (règle 3)
 *   libelle(cle)      nom lisible de la zone (message « Image collée dans … »)
 *   surDepotHorsZone(fichier, cleCalculee) facultatif : dépôt d'un fichier hors de toute zone
 * @returns { message, annuler, fermer, colleDans }  — `colleDans(cle, fichier)` sert au bouton « Coller » (tactile)
 */
export function useCollageAuSurvol(racineRef, options) {
  const opt = useRef(options); opt.current = options;
  const [message, setMessage] = useState(null); // { texte, annulable }
  const pile = useRef([]); // [{ cle, ancienne }]
  const texteDepuis = useRef(false);
  const survol = useRef(null); // élément [data-zone-image] sous la souris
  const dedans = useRef(true); // dernier geste dans le formulaire (il vient de s'ouvrir : oui)
  const minuterie = useRef(null);

  const annoncer = (texte, annulable) => {
    clearTimeout(minuterie.current);
    setMessage({ texte, annulable });
    minuterie.current = setTimeout(() => setMessage(null), annulable ? 6000 : 3500);
  };

  // pose l'image dans la zone `cle` : spinner court sur la zone, pile d'annulation, message
  const colleDans = (cle, fichier) => {
    const o = opt.current;
    if (!cle || !fichier) return;
    const racine = racineRef.current;
    const el = visuelDe(racine && racine.querySelector(`[data-zone-image="${cle}"], [data-zone-focus="${cle}"]`));
    if (el) {
      el.classList.add(CLASSE_COLLAGE);
      // spinner court : jusqu'au chargement de la vignette (load ne remonte pas : capture), au moins 300 ms
      // pour être perçu, au plus 1,2 s
      const debut = Date.now();
      let fini = false;
      const fin = () => { if (fini) return; fini = true; el.removeEventListener('load', charge, true); setTimeout(() => el.classList.remove(CLASSE_COLLAGE), Math.max(0, 300 - (Date.now() - debut))); };
      const charge = () => fin();
      el.addEventListener('load', charge, true);
      setTimeout(fin, 1200);
    }
    const ancienne = o.appliquer(cle, fichier);
    const nom = (o.libelle && o.libelle(cle)) || cle;
    if (ancienne) {
      pile.current.push({ cle, ancienne });
      texteDepuis.current = false;
      annoncer(`Image remplacée dans « ${nom} »`, true);
    } else annoncer(`Image collée dans « ${nom} »`, false);
  };

  const annuler = () => {
    const d = pile.current.pop();
    if (!d) return false;
    opt.current.restaurer(d.cle, d.ancienne);
    annoncer(`Image précédente rétablie dans « ${(opt.current.libelle && opt.current.libelle(d.cle)) || d.cle} »`, false);
    return true;
  };

  const cible = () => {
    const racine = racineRef.current;
    if (survol.current && racine && racine.contains(survol.current)) return survol.current.getAttribute('data-zone-image');
    const f = zoneDe(document.activeElement, 'data-zone-focus');
    if (f && racine && racine.contains(f)) return f.getAttribute('data-zone-focus');
    return opt.current.defaut ? opt.current.defaut() : null;
  };

  useEffect(() => {
    if (options.actif === false) return undefined;
    const racine = () => racineRef.current;
    const poserSurvol = (el) => {
      if (survol.current === el) return;
      if (survol.current) { const v = visuelDe(survol.current); v.classList.remove(CLASSE_SURVOL); delete v.dataset.astuce; }
      survol.current = el;
      if (el) { const v = visuelDe(el); v.classList.add(CLASSE_SURVOL); v.dataset.astuce = `${RACCOURCI_COLLER} pour coller`; }
    };
    const bouge = (e) => {
      const r = racine();
      if (!r || e.pointerType !== 'mouse') return; // pas de survol au doigt / au stylet
      const z = zoneDe(e.target, 'data-zone-image');
      survolGlobal = z;
      poserSurvol(z && r.contains(z) ? z : null);
    };
    const sort = (e) => { if (e.pointerType === 'mouse' && !e.relatedTarget) { poserSurvol(null); survolGlobal = null; } };
    const appui = (e) => { const r = racine(); dedans.current = !!(r && r.contains(e.target)); };
    const focus = (e) => { const r = racine(); if (r && r.contains(e.target)) dedans.current = true; };
    const saisie = (e) => { const r = racine(); if (r && r.contains(e.target)) texteDepuis.current = true; };

    const coller = (e) => {
      const r = racine();
      if (!r || e.defaultPrevented || !visible(r)) return;
      if (survolGlobal && survolGlobal.isConnected && !r.contains(survolGlobal)) return; // visé sur un autre formulaire
      const f = imageDuPressePapier(e.clipboardData);
      if (!f) return; // texte seul : collage normal
      const a = document.activeElement;
      const survolDedans = !!(survol.current && r.contains(survol.current));
      const focusDedans = !!(a && r.contains(a));
      const nullePart = !a || a === document.body || a === document.documentElement;
      if (!survolDedans && !focusDedans && !(dedans.current && nullePart)) return; // collage destiné à autre chose (lecteur PDF…)
      if (!survolDedans && cibleEditable(e.target) && texteDuPressePapier(e.clipboardData)) return; // image + texte dans un champ : le texte
      const cle = cible();
      if (!cle) return;
      e.preventDefault();
      e.stopImmediatePropagation(); // le lecteur PDF ne pose pas l'image sur la page en plus
      colleDans(cle, f);
    };

    const clavier = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || (e.key !== 'z' && e.key !== 'Z')) return;
      if (!pile.current.length) return;
      const r = racine(); const a = document.activeElement;
      if (!visible(r)) return;
      const concerne = (a && r && r.contains(a)) || (survol.current && r && r.contains(survol.current)) || (dedans.current && (!a || a === document.body));
      if (!concerne) return;
      if (cibleEditable(a) && texteDepuis.current) return; // du texte a été tapé depuis : ⌘Z annule le texte
      e.preventDefault(); e.stopImmediatePropagation();
      annuler();
    };

    // dépôt d'un fichier : la zone au-dessus de laquelle on le lâche ; hors zone → mêmes règles 2 et 3
    const survolDepot = (e) => {
      const r = racine();
      if (!r || !r.contains(e.target) || !glisseDesFichiers(e.dataTransfer)) return;
      const z = zoneDe(e.target, 'data-zone-image');
      poserSurvol(z && r.contains(z) ? z : null);
    };
    const depot = (e) => {
      const r = racine();
      if (!r || !r.contains(e.target) || e.defaultPrevented || !visible(r)) return;
      const f = glisseDesFichiers(e.dataTransfer) && imageDuDepot(e.dataTransfer);
      if (!f) return;
      const z = zoneDe(e.target, 'data-zone-image');
      e.preventDefault(); e.stopPropagation();
      poserSurvol(null);
      if (z && r.contains(z)) { colleDans(z.getAttribute('data-zone-image'), f); return; }
      const cle = cible();
      if (opt.current.surDepotHorsZone) opt.current.surDepotHorsZone(f, cle);
      else colleDans(cle, f);
    };

    window.addEventListener('pointermove', bouge, true);
    window.addEventListener('pointerout', sort, true);
    window.addEventListener('pointerdown', appui, true);
    window.addEventListener('focusin', focus, true);
    window.addEventListener('input', saisie, true);
    window.addEventListener('paste', coller, true);
    window.addEventListener('keydown', clavier, true);
    window.addEventListener('dragover', survolDepot, true);
    window.addEventListener('drop', depot, true);
    return () => {
      window.removeEventListener('pointermove', bouge, true);
      window.removeEventListener('pointerout', sort, true);
      window.removeEventListener('pointerdown', appui, true);
      window.removeEventListener('focusin', focus, true);
      window.removeEventListener('input', saisie, true);
      window.removeEventListener('paste', coller, true);
      window.removeEventListener('keydown', clavier, true);
      window.removeEventListener('dragover', survolDepot, true);
      window.removeEventListener('drop', depot, true);
      poserSurvol(null);
      clearTimeout(minuterie.current);
    };
  }, [options.actif]); // eslint-disable-line react-hooks/exhaustive-deps

  return { message, annuler, fermer: () => setMessage(null), colleDans };
}

/** lecture du presse-papiers par bouton (tactile) : un File image, ou une erreur explicite */
export async function lirePressePapierImage() {
  if (typeof navigator === 'undefined' || !navigator.clipboard || !navigator.clipboard.read) {
    return { erreur: 'Ce navigateur ne permet pas de lire le presse-papiers : utilise « Image » pour choisir le fichier.' };
  }
  let items;
  try { items = await navigator.clipboard.read(); } catch (e) {
    return { erreur: 'Le navigateur a refusé l’accès au presse-papiers. Autorise-le dans les réglages du site, ou utilise « Image ».' };
  }
  for (const it of items || []) {
    const type = (it.types || []).find((t) => /^image\//.test(t));
    if (type) {
      const blob = await it.getType(type);
      const ext = type.split('/')[1] || 'png';
      return { fichier: new File([blob], `colle-${Date.now()}.${ext}`, { type }) };
    }
  }
  return { erreur: 'Le presse-papiers ne contient pas d’image.' };
}
