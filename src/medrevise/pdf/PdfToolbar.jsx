/* ============================================================
   MedRevise — BARRE D'OUTILS DU LECTEUR PDF (étape 5 du refactor).

   L'ancienne barre alignait 21 contrôles sur UNE rangée à plat, sans
   regroupement ni hiérarchie : un export rare y pesait autant qu'un outil de
   travail, et deux boutons « Voir les prompts » se suivaient à l'identique.

   Nouveau découpage, celui des outils de dessin sérieux (Acrobat, Aperçu,
   Figma) : LES OUTILS AU CENTRE, tout le reste sur les bords.

     ┌──────────────────────────────────────────────────────────────────┐
     │ ← │ ◀ 3/48 ▶ │ ⊖ 160% ⊕ ⤢ │  ↖ 🖍 ✏ T ◇ ⊞  │ ↶ ↷ │ 🔍 │ ◫ 12 │ ⋯ │
     └──────────────────────────────────────────────────────────────────┘
       retour  page       zoom        OUTILS      annuler  rech. panneau menu

   Deuxième rangée : la BARRE CONTEXTUELLE, qui n'apparaît que si l'outil actif
   a des réglages (couleur, épaisseur, aimant). Elle évite d'encombrer la barre
   principale avec des contrôles qui ne servent qu'à un outil.

   Tout ce qui est rare ou propre à une fiche (exports, prompts, items) part
   dans le menu « ⋯ Document » : huit boutons de moins sur la barre.
   ============================================================ */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { ContextMenu } from '../components/ui.jsx';
import { IconeOutil } from './IconesOutils.jsx';
import { RACCOURCI } from './pdfShared.js';

/** Les outils, dans l'ordre d'apparition. `main` est le défaut et remplace à lui
    seul l'ancien couple « Lecture / Édition » : il sélectionne du texte, ouvre
    une annotation, déplace une boîte. Plus de mode global.
    (22/10, docs/compte-rendu-simplification-outils.md) SIX OUTILS, certains regroupant plusieurs « sous-outils »
    (le moteur garde ses outils internes : crayon, gomme, boite, texte, postit, boiteTableau) ; la sous-barre de
    l'outil actif propose ses sous-outils et ses réglages. */
export const OUTILS = [
  { id: 'main', label: 'Sélection', icone: 'selection', aide: 'Sélectionner du texte, ouvrir une annotation, déplacer un objet' },
  { id: 'surligneur', label: 'Surligneur', icone: 'surligneur', aide: 'Commencer sur du texte le surligne ; ailleurs, le geste trace un surlignage à main levée' },
  { id: 'dessin', label: 'Dessin', icone: 'dessin', sous: ['crayon', 'gomme'], aide: 'Crayon et gomme' },
  { id: 'ecrire', label: 'Texte', icone: 'texte', sous: ['boite', 'texte', 'postit', 'boiteTableau'], aide: 'Boîte, texte libre, post-it, boîte-tableau — cliquer sur la page pour poser · Échap pour arrêter' },
  { id: 'forme', label: 'Formes', icone: 'forme', aide: 'Choisir une forme, puis cliquer pour la poser ou glisser pour l’étirer · Maj : proportions · Échap pour arrêter' },
  { id: 'inserer', label: 'Insérer', icone: 'inserer', aide: 'Image, page blanche, dessins reçus du téléphone' },
];
/** l'outil de la barre (groupe) auquel appartient un outil interne du moteur */
export const groupeDe = (outil) => (OUTILS.find((o) => o.id === outil || (o.sous && o.sous.includes(outil))) || OUTILS[0]).id;
/* RACCOURCIS ⌘1 … ⌘6 (17/10, refaits le 22/10) : les outils dans l'ordre EXACT de la barre — 1 Sélection,
   2 Surligneur, 3 Dessin, 4 Texte, 5 Formes, 6 Insérer. Ctrl+1 … 6 hors Mac. Touche physique (e.code Digit1…6) :
   marche aussi en AZERTY, où ⌘1 est ⌘& pour `e.key`. */
const SUR_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
export const MOD_OUTILS = SUR_MAC ? '⌘' : 'Ctrl+';
export const RACCOURCIS_OUTILS = OUTILS.map((o, i) => ({ id: o.id, label: o.label, touche: String(i + 1) }));
/** champ de saisie où ⌘1–9 n'est JAMAIS intercepté : formulaire, boîte de texte, notes… Le texte
    d'un DOCUMENT (flux continu .pt-flux-cadre, ou page .pt-zone) n'en est pas un : c'est le document
    lui-même, où les outils servent aussi. */
function champDeSaisie(el) {
  if (!el || !el.tagName) return false;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  return !!el.isContentEditable && !(el.closest && el.closest('.pt-flux-cadre, .pt-zone'));
}

/* Les couleurs de TOUS les outils (boîte comprise) se règlent par le même sélecteur
   (pdf/Couleurs.jsx), fourni par le lecteur dans `contexteSupplementaire` (02/10 soir). */

export function PdfToolbar({
  onClose, pageCourante, numPages, onAllerPage,
  scale, onZoom, onAjuster,
  outil, setOutil, couleurActive, setCouleurActive,
  hist,
  search, setSearch, matches, activeMatch, searching, onPrecedent, onSuivant, onFermerRecherche,
  panelOpen, setPanelOpen, nbNotions,
  actionsDocument, outilsAnnotation = true, contexteSupplementaire = null,
  // MÊME BARRE pour les fiches HTML (nuit du 30/09) : un document HTML n'a ni pages
  // ni zoom propre, et seuls les outils qui ont un sens sur lui y sont proposés.
  sansPages = false, sansRecherche = false, outilsDisponibles = null, statut = null,
  // INSÉRER (01/10) : une page blanche, une image — absents = boutons masqués
  onAjouterPage = null, onAjouterImage = null,
  imageDansTexte = false, // document (10/10) : l'image s'insère dans le texte, jamais flottante
  avantPanneau = null, // bascule de disposition PDF / Les deux / Tableau (04/10)
  boutonDessins = null, // menu des dessins reçus du téléphone (02/10 soir)
  basculeDocument = null, // segment « Original · Fiche » de la fiche jumelle (15/10) — absent sans fiche
  boutonTranscrire = null, // transcription en direct du cours (05/10)
  // TABLETTE (07/10, refaite l'après-midi — docs/compte-rendu-position-document-tablette.md) :
  // TOUS les outils visibles en permanence, rien dans un menu ; la barre passe sur deux
  // rangées compactes si la largeur manque, jamais de défilement
  tablette = false,
  /* RANGÉE (20/10, docs/compte-rendu-pdfreader-v3.md) : `reserverRangee` — la rangée de la sous-barre garde sa hauteur
     même vide : choisir un outil ne décale jamais le document. `aideVide` : le texte de la rangée avec l'outil Sélection.
     (22/10) La grande barre de mise en forme du texte qui occupait cette rangée a disparu : la mise en forme vit dans la
     mini barre de l'objet sélectionné (pdf/FormatTexte.jsx). */
  reserverRangee = false, aideVide = 'Sélectionnez un objet : ses réglages s’affichent au-dessus de lui',
  nbDessinsNouveaux = 0, pulseInserer = 0, boutonInsererRef = null, // pastille « nouveau dessin » sur Insérer (22/10)
}) {
  const [menu, setMenu] = useState(null);
  /* LARGEUR RÉELLE de la barre (01/10) : dans un panneau étroit (Apprentissage,
     liste de la Bibliothèque ouverte), la fin de la barre — annuler, recherche,
     panneau, menu ⋯ — sortait de l'écran. Les @media ne voient que la fenêtre ;
     on mesure donc la barre elle-même : d'abord les libellés des outils
     disparaissent, puis la barre passe sur deux lignes. */
  const barreRef = useRef(null);
  /* 03-04/10 : ce n'est plus un seuil de largeur fixe (il a suffi d'ajouter un outil
     pour que la barre déborde à 1 262 px) mais le DÉBORDEMENT RÉEL qui décide :
     niveau 1 = libellés des outils masqués, niveau 2 = deux lignes. Remis à zéro à
     chaque changement de largeur, puis remonté tant que ça déborde. */
  /* 05/10 (refonte du panneau) : niveau 2 = insertions dans « ⋯ » et recherche en
     loupe dépliable, AVANT de passer sur deux lignes (niveau 3). */
  const [niveau, setNiveau] = useState(0);
  const [rechercheOuverte, setRechercheOuverte] = useState(false);
  const [, setMesure] = useState(0); // force une nouvelle mesure même si le niveau était déjà 0
  useEffect(() => {
    const el = barreRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    let dernier = el.clientWidth;
    const ro = new ResizeObserver(() => { if (Math.abs(el.clientWidth - dernier) > 2) { dernier = el.clientWidth; setNiveau(0); setMesure((m) => m + 1); } });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    const el = barreRef.current;
    if (el && niveau < 3 && el.scrollWidth > el.clientWidth + 1) setNiveau((n) => Math.min(3, n + 1));
  });
  const classeLargeur = niveau >= 3 ? ' etroite compacte repliee' : niveau === 2 ? ' etroite compacte' : niveau === 1 ? ' etroite' : '';
  const compacte = niveau >= 2;
  const rechercheVisible = !compacte || rechercheOuverte || !!search;
  const actions = (actionsDocument || []).filter(Boolean);
  const outils = (outilsDisponibles ? OUTILS.filter((o) => outilsDisponibles.includes(o.id)) : OUTILS)
    .filter((o) => o.id !== 'inserer' || onAjouterImage || onAjouterPage || boutonDessins);
  const groupe = groupeDe(outil);
  const outilActif = outils.find((o) => o.id === groupe) || outils[0];

  /* ⌘1 … ⌘6 — numérotés dans l'ordre affiché (une barre réduite, fiche HTML, garde une
     numérotation continue). Interceptés SEULEMENT quand le lecteur a le focus (rien de
     focalisé, ou un élément du lecteur) et jamais dans un champ de saisie : là, le
     navigateur garde son comportement. Maintenir ⌘ affiche les chiffres (fondu 150 ms). */
  const entreesRaccourcis = outilsAnnotation ? outils.map((o) => ({ id: o.id, label: o.label })).slice(0, 9) : [];
  const numero = (id) => { const i = entreesRaccourcis.findIndex((e) => e.id === id); return i >= 0 ? i + 1 : null; };
  const infobulle = (label, id, aide) => { const n = numero(id); return `${label}${n ? ` · ${MOD_OUTILS}${n}` : ''}${aide ? ` — ${aide}` : ''}`; };
  const [chiffres, setChiffres] = useState(false);
  const raccourcisRef = useRef(null);
  raccourcisRef.current = { entrees: entreesRaccourcis, groupe, setOutil };
  useEffect(() => {
    if (!outilsAnnotation) return undefined;
    const leLecteurALeFocus = () => {
      const a = document.activeElement;
      if (champDeSaisie(a)) return false;
      if (!a || a === document.body || a === document.documentElement) return true;
      const racine = barreRef.current && (barreRef.current.closest('.pdfr-v2') || barreRef.current.parentElement);
      return !!(racine && racine.contains(a));
    };
    const modifie = (e) => (SUR_MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey) && !e.altKey && !e.shiftKey;
    const bas = (e) => {
      if (!barreRef.current || !barreRef.current.isConnected) return;
      if (e.key === (SUR_MAC ? 'Meta' : 'Control')) { if (leLecteurALeFocus()) setChiffres(true); return; }
      const m = /^Digit([1-9])$/.exec(e.code || '') || /^Numpad([1-9])$/.exec(e.code || '');
      if (!m || !modifie(e)) return;
      if (champDeSaisie(e.target) || !leLecteurALeFocus()) return;
      const r = raccourcisRef.current;
      const entree = r.entrees[Number(m[1]) - 1];
      e.preventDefault(); // ⌘1–9 = changement d'onglet du navigateur : pas quand le lecteur a le focus
      if (!entree || e.repeat) return;
      if (r.groupe !== entree.id) r.setOutil(entree.id); // sélectionne, ne bascule jamais
    };
    const haut = (e) => { if (e.key === (SUR_MAC ? 'Meta' : 'Control') || !(SUR_MAC ? e.metaKey : e.ctrlKey)) setChiffres(false); };
    const cacher = () => setChiffres(false);
    window.addEventListener('keydown', bas, true);
    window.addEventListener('keyup', haut, true);
    window.addEventListener('blur', cacher);
    document.addEventListener('visibilitychange', cacher);
    return () => {
      window.removeEventListener('keydown', bas, true); window.removeEventListener('keyup', haut, true);
      window.removeEventListener('blur', cacher); document.removeEventListener('visibilitychange', cacher);
    };
  }, [outilsAnnotation]);
  const chiffre = (id) => { const n = numero(id); return n ? <span className="ptb-num" aria-hidden="true">{n}</span> : null; };

  /* Cmd/Ctrl+F = la recherche DU LECTEUR, pas celle du navigateur (qui ne voit ni
     le texte des pages pdf.js hors écran, ni les occurrences numérotées) : tant que
     le lecteur est affiché, le raccourci place le curseur dans son champ, texte
     sélectionné. Cmd/Ctrl+G et Maj+Cmd/Ctrl+G = occurrence suivante / précédente,
     comme dans un navigateur. Rien n'est intercepté si la recherche n'existe pas
     (vue HTML : le Cmd+F du navigateur y cherche déjà dans le cours). */
  const champRecherche = useRef(null);
  const suivantRef = useRef(onSuivant); suivantRef.current = onSuivant;
  const precedentRef = useRef(onPrecedent); precedentRef.current = onPrecedent;
  useEffect(() => {
    if (sansRecherche) return undefined;
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const k = String(e.key).toLowerCase();
      if (k === 'f' && !e.shiftKey) {
        e.preventDefault();
        const champ = champRecherche.current;
        if (!champ) { setRechercheOuverte(true); setTimeout(() => champRecherche.current && champRecherche.current.focus(), 0); return; }
        champ.focus(); champ.select();
      } else if (k === 'g' && champRecherche.current && champRecherche.current.value) {
        e.preventDefault();
        if (e.shiftKey) precedentRef.current(); else suivantRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sansRecherche]);
  const raccourciF = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘F' : 'Ctrl+F';

  /* rangée trop longue pour la largeur (tablette, fenêtre étroite) : elle défile à l'horizontale ;
     un fondu sur le bord qui déborde le signale (classes deborde-g / deborde-d) */
  const rangeeRef = useRef(null);
  const majDebord = () => {
    const el = rangeeRef.current;
    if (!el) return;
    const g = el.scrollLeft > 2, d = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    el.classList.toggle('deborde-g', g); el.classList.toggle('deborde-d', d);
  };
  useLayoutEffect(majDebord);
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => majDebord());
    if (rangeeRef.current) ro.observe(rangeeRef.current);
    return () => ro.disconnect();
  });
  /* INSÉRER (22/10) : sa sous-barre — image, page blanche, dessins reçus du téléphone */
  const sousInserer = groupe === 'inserer' ? (
    <div className="ptb-segment ptb-inserer" role="group" aria-label="Insérer">
      {onAjouterImage && (
        <button type="button" data-inserer="image" onClick={onAjouterImage}
          title={imageDansTexte ? 'Image — l’insérer dans le texte, au curseur (ou la coller avec Cmd/Ctrl+V)' : 'Image — importer une image et la placer sur la page (ou la coller avec Cmd/Ctrl+V)'}>
          <IconeOutil nom="image" size={15} /> Image
        </button>
      )}
      {onAjouterPage && (
        <button type="button" data-inserer="page" onClick={onAjouterPage} title="Page — insérer une page blanche juste après la page affichée (ou avec le « + » entre deux pages)">
          <IconeOutil nom="page" size={15} /> Page
        </button>
      )}
      {boutonDessins}
    </div>
  ) : null;
  const contexte = sousInserer || contexteSupplementaire;
  const contenuRangee = outilsAnnotation && contexte ? { cle: 'outil:' + outilActif.id, el: (<>
      <span className="ptb-contexte-titre">{outilActif.label}</span>
      {contexte}
      {!tablette && <><span style={{ flex: 1 }} /><span className="hint ptb-contexte-aide">{outilActif.aide}</span></>}
    </>) }
    : outilsAnnotation && reserverRangee ? { cle: 'vide', el: <span className="hint ptb-contexte-aide">{groupe === 'main' ? aideVide : outilActif.aide}</span> }
    : null;
  const rangee = contenuRangee && (
    <div className={'pdfr-contexte' + (tablette ? ' tab-contexte' : '') + (reserverRangee ? ' reservee' : '')}>
      <div key={contenuRangee.cle} ref={rangeeRef} className="pdfr-rangee-contenu" onScroll={majDebord}>{contenuRangee.el}</div>
    </div>
  );

  if (tablette) {
    /* Ordre de priorité des outils en cours : lire/sélectionner, surligner, écrire à la
       main, gommer, puis le reste. L'outil actif reste visible : s'il est secondaire, il
       prend la place du bouton « Plus d'outils » (icône de l'outil, état actif). */
    const principaux = outils;
    const rechercheOuv = !sansRecherche && (rechercheOuverte || !!search);
    return (
      <>
        <div ref={barreRef} className={'pdfr-toolbar pdfr-barre tab-barre' + (chiffres ? ' raccourcis-visibles' : '')}>
          {basculeDocument && <div className="tab-zone">{basculeDocument}</div>}
          {!sansPages && (
            <div className="tab-zone">
              <button type="button" className="tab-bt" disabled={pageCourante <= 1} onClick={() => onAllerPage(pageCourante - 1)} title="Page précédente" aria-label="Page précédente"><Icon name="chevU" size={16} /></button>
              <span className="tab-pages tnum" title="Page affichée">{numPages ? `${pageCourante}/${numPages}` : '—'}</span>
              <button type="button" className="tab-bt" disabled={!numPages || pageCourante >= numPages} onClick={() => onAllerPage(pageCourante + 1)} title="Page suivante" aria-label="Page suivante"><Icon name="chevD" size={16} /></button>
              <span className="ptb-sep" />
              <button type="button" className="tab-bt" onClick={() => onZoom(1 / 1.15)} title="Dézoomer" aria-label="Dézoomer"><Icon name="minus" size={16} /></button>
              <span className="tab-zoom tnum" title="Zoom" data-zoom-libelle>{Math.round(scale * 100)}%</span>
              <button type="button" className="tab-bt" onClick={() => onZoom(1.15)} title="Zoomer" aria-label="Zoomer"><Icon name="plus" size={16} /></button>
              <button type="button" className="tab-bt" onClick={onAjuster} title="Ajuster à la largeur" aria-label="Ajuster à la largeur"><Icon name="maximize" size={15} /></button>
            </div>
          )}
          {statut}
          {outilsAnnotation && (
            <div className="tab-zone tab-outils" role="group" aria-label="Outils d'annotation">
              {principaux.map((o) => (
                <button key={o.id + (o.id === 'inserer' ? ':' + pulseInserer : '')} ref={o.id === 'inserer' ? boutonInsererRef : undefined} type="button" title={infobulle(o.label, o.id, o.aide)} aria-label={o.label} aria-pressed={groupe === o.id}
                  aria-keyshortcuts={numero(o.id) ? `${SUR_MAC ? 'Meta' : 'Control'}+${numero(o.id)}` : undefined} data-outil={o.id}
                  className={'tab-bt tab-outil' + (groupe === o.id ? ' actif' : '') + (o.id === 'inserer' && pulseInserer ? ' pulse' : '')}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => setOutil(o.id)}>
                  <IconeOutil nom={o.icone} size={18} />{chiffre(o.id)}
                  {o.id === 'inserer' && nbDessinsNouveaux > 0 && <span className="ptb-pastille-n">{nbDessinsNouveaux}</span>}
                </button>
              ))}
            </div>
          )}
          <div className="tab-zone tab-droite">
            {outilsAnnotation && hist && (<>
              <button type="button" className="tab-bt" onClick={hist.annuler} disabled={!hist.peutAnnuler} aria-label="Annuler"
                title={hist.peutAnnuler ? `Annuler — ${hist.libelleAnnuler} (${RACCOURCI}Z)` : `Annuler (${RACCOURCI}Z)`}>
                <IconeOutil nom="annuler" size={17} />
              </button>
              <button type="button" className="tab-bt" onClick={hist.retablir} disabled={!hist.peutRetablir} aria-label="Rétablir"
                title={hist.peutRetablir ? `Rétablir — ${hist.libelleRetablir} (${RACCOURCI}Maj+Z)` : `Rétablir (${RACCOURCI}Maj+Z)`}>
                <IconeOutil nom="retablir" size={17} />
              </button>
            </>)}
            {!sansRecherche && (
              <button type="button" className={'tab-bt' + (rechercheOuv ? ' actif' : '')} title={`Rechercher dans le document (${raccourciF})`} aria-label="Rechercher"
                onClick={() => { setRechercheOuverte(true); setTimeout(() => champRecherche.current && champRecherche.current.focus(), 0); }}>
                <Icon name="search" size={17} />
              </button>
            )}
            {avantPanneau}
            {!!actions.length && (
              <button type="button" className="tab-bt" title="Actions sur le document" aria-label="Actions sur le document"
                onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: Math.min(r.left, window.innerWidth - 260), y: r.bottom + 6 }); }}>
                <Icon name="more" size={18} />
              </button>
            )}
          </div>
          {/* recherche : un champ qui recouvre la barre (la place manque pour le garder ouvert) */}
          {rechercheOuv && (
            <div className="tab-recherche">
              <Icon name="search" size={16} className="ic" />
              <input ref={champRecherche} placeholder="Rechercher dans le cours" value={search} enterKeyHint="search"
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) onPrecedent(); else onSuivant(); } if (e.key === 'Escape') { onFermerRecherche(); setRechercheOuverte(false); } }} />
              {!!search && <span className="hint tnum">{searching ? '…' : matches.length ? `${activeMatch + 1}/${matches.length}` : '0'}</span>}
              <button type="button" className="tab-bt" disabled={!matches.length} onClick={onPrecedent} aria-label="Résultat précédent"><Icon name="chevU" size={16} /></button>
              <button type="button" className="tab-bt" disabled={!matches.length} onClick={onSuivant} aria-label="Résultat suivant"><Icon name="chevD" size={16} /></button>
              <button type="button" className="tab-bt" onClick={() => { onFermerRecherche(); setRechercheOuverte(false); }} aria-label="Fermer la recherche"><Icon name="x" size={16} /></button>
            </div>
          )}
        </div>
        {rangee}
        {menu && <ContextMenu x={menu.x} y={menu.y} items={actions} onClose={() => setMenu(null)} />}

      </>
    );
  }

  return (
    <>
      <div ref={barreRef} className={'pdfr-toolbar pdfr-barre' + classeLargeur + (chiffres ? ' raccourcis-visibles' : '')}>
        {/* ---- ZONE GAUCHE : naviguer dans le document ---- */}
        <div className="ptb-zone">
          <button className="btn ghost sm" onClick={onClose} title="Revenir à la liste"><Icon name="chevL" size={14} /> Retour</button>
          {statut}
          {basculeDocument && (<><span className="ptb-sep" />{basculeDocument}</>)}
          {!sansPages && (<>
          <span className="ptb-sep" />
          <div className="ptb-pages" title="Page affichée">
            <button className="icon-btn sm" disabled={pageCourante <= 1} onClick={() => onAllerPage(pageCourante - 1)} title="Page précédente"><Icon name="chevU" size={13} /></button>
            <span className="tnum">{numPages ? `${pageCourante} / ${numPages}` : '—'}</span>
            <button className="icon-btn sm" disabled={!numPages || pageCourante >= numPages} onClick={() => onAllerPage(pageCourante + 1)} title="Page suivante"><Icon name="chevD" size={13} /></button>
          </div>
          <span className="ptb-sep" />
          <div className="ptb-zoom">
            <button className="icon-btn sm" onClick={() => onZoom(1 / 1.15)} title="Dézoomer"><Icon name="minus" size={14} /></button>
            <span className="hint tnum" style={{ minWidth: 42, textAlign: 'center' }} data-zoom-libelle>{Math.round(scale * 100)}%</span>
            <button className="icon-btn sm" onClick={() => onZoom(1.15)} title="Zoomer"><Icon name="plus" size={14} /></button>
            <button className="icon-btn sm" onClick={onAjuster} title="Ajuster à la largeur"><Icon name="maximize" size={13} /></button>
          </div>
          </>)}
        </div>

        {/* ---- ZONE CENTRE : LES OUTILS. Le cœur du lecteur, donc au centre. ---- */}
        {outilsAnnotation && (
          <div className="ptb-outils" role="group" aria-label="Outils d'annotation">
            {outils.map((o) => (
              <button key={o.id + (o.id === 'inserer' ? ':' + pulseInserer : '')} ref={o.id === 'inserer' ? boutonInsererRef : undefined} type="button" title={infobulle(o.label, o.id, o.aide)}
                aria-keyshortcuts={numero(o.id) ? `${SUR_MAC ? 'Meta' : 'Control'}+${numero(o.id)}` : undefined} aria-pressed={groupe === o.id} data-outil={o.id}
                className={'ptb-outil' + (groupe === o.id ? ' actif' : '') + (o.id === 'inserer' && pulseInserer ? ' pulse' : '')}
                onMouseDown={(e) => e.preventDefault()} /* garde la sélection de texte : Surligneur la surligne */
                onClick={() => setOutil(o.id)}>
                <IconeOutil nom={o.icone} size={16} />{chiffre(o.id)}
                <span className="ptb-outil-lbl">{o.label}</span>
                {o.id === 'inserer' && nbDessinsNouveaux > 0 && <span className="ptb-pastille-n">{nbDessinsNouveaux}</span>}
              </button>
            ))}
            <span className="ptb-sep" />
            <button className="icon-btn sm" onClick={hist.annuler} disabled={!hist.peutAnnuler}
              title={hist.peutAnnuler ? `Annuler — ${hist.libelleAnnuler} (${RACCOURCI}Z)` : `Annuler (${RACCOURCI}Z)`}>
              <IconeOutil nom="annuler" size={15} />
            </button>
            <button className="icon-btn sm" onClick={hist.retablir} disabled={!hist.peutRetablir}
              title={hist.peutRetablir ? `Rétablir — ${hist.libelleRetablir} (${RACCOURCI}Maj+Z)` : `Rétablir (${RACCOURCI}Maj+Z)`}>
              <IconeOutil nom="retablir" size={15} />
            </button>
          </div>
        )}

        {/* ---- ZONE DROITE : chercher, lire ses notions, agir sur le document ---- */}
        <div className="ptb-zone ptb-droite">
          {!sansRecherche && !rechercheVisible && (
            <button type="button" className="icon-btn sm" title={`Rechercher dans le document (${raccourciF})`} onClick={() => { setRechercheOuverte(true); setTimeout(() => champRecherche.current && champRecherche.current.focus(), 0); }}>
              <Icon name="search" size={15} />
            </button>
          )}
          {!sansRecherche && rechercheVisible && (<>
          <div className="search ptb-recherche">
            <Icon name="search" size={14} className="ic" />
            <input ref={champRecherche} placeholder="Rechercher" onBlur={() => { if (!search) setRechercheOuverte(false); }} title={`Rechercher dans le document (${raccourciF}) · Entrée : suivant · Maj+Entrée : précédent`} value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) onPrecedent(); else onSuivant(); } if (e.key === 'Escape') onFermerRecherche(); }} />
            {search && <button className="icon-btn sm" onClick={onFermerRecherche} title="Fermer la recherche"><Icon name="x" size={13} /></button>}
          </div>
          {!!search && (
            <div className="ptb-resultats">
              <span className="hint tnum">{searching ? '…' : matches.length ? `${activeMatch + 1}/${matches.length}` : '0'}</span>
              <button className="icon-btn sm" disabled={!matches.length} onClick={onPrecedent} title="Précédent (Maj+Entrée)"><Icon name="chevU" size={13} /></button>
              <button className="icon-btn sm" disabled={!matches.length} onClick={onSuivant} title="Suivant (Entrée)"><Icon name="chevD" size={13} /></button>
            </div>
          )}
          </>)}
          {avantPanneau}
          {/* (05/10) plus de bouton « Panneau » ni « Transcrire » ici : la poignée du
              panneau l'ouvre et le replie (audit M4), la transcription vit dans son mode */}
          {!!actions.length && (
            <button className="icon-btn sm" title="Actions sur le document"
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: Math.min(r.left, window.innerWidth - 260), y: r.bottom + 6 }); }}>
              <Icon name="more" size={16} />
            </button>
          )}
        </div>
      </div>

      {/* ---- BARRE CONTEXTUELLE : seulement si l'outil actif a des réglages ---- */}
      {rangee}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={actions} onClose={() => setMenu(null)} />}
    </>
  );
}
