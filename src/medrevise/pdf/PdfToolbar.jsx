/* ============================================================
   MedRevise — BARRE D'OUTILS DU LECTEUR PDF (étape 5 du refactor).

   L'ancienne barre alignait 21 contrôles sur UNE rangée à plat, sans
   regroupement ni hiérarchie : un export rare y pesait autant qu'un outil de
   travail, et deux boutons « Voir les prompts » se suivaient à l'identique.

   Nouveau découpage, celui des outils de dessin sérieux (Acrobat, Aperçu,
   Figma) : LES OUTILS AU CENTRE, tout le reste sur les bords.

     ┌──────────────────────────────────────────────────────────────────┐
     │ ← │ ◀ 3/48 ▶ │ ⊖ 160% ⊕ ⤢ │  ✋ 🖍 ▭ ✏ ⌫  │ ↶ ↷ │ 🔍 │ ◫ 12 │ ⋯ │
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
    une annotation, déplace une boîte. Plus de mode global. */
export const OUTILS = [
  { id: 'main', label: 'Sélection', icone: 'selection', aide: 'Sélectionner du texte, ouvrir une annotation, déplacer une boîte' },
  { id: 'surligneur', label: 'Surligneur', icone: 'surligneur', aide: 'Sélectionner du texte le surligne aussitôt, dans la couleur active' },
  { id: 'boite', label: 'Boîte', icone: 'boite', aide: 'Cliquer ou tracer pour poser une boîte — l’outil reste actif pour enchaîner · Échap ou re-clic sur l’outil pour arrêter' },
  { id: 'texte', label: 'Texte', icone: 'texte', aide: 'Cliquer sur la page pour y écrire du texte libre, sans cadre' },
  { id: 'forme', label: 'Forme', icone: 'forme', aide: 'Choisir une forme, puis cliquer pour la poser ou glisser pour l’étirer · Maj : proportions · Échap pour arrêter' },
  { id: 'question', label: '?', icone: 'question', aide: 'Un clic pose un « ? » : « je n’ai pas compris ce passage »' },
  { id: 'crayon', label: 'Crayon', icone: 'crayon', aide: 'Dessiner à main levée' },
  { id: 'gomme', label: 'Gomme', icone: 'gomme', aide: 'Efface les traits de crayon et les formes — cliquer, ou glisser pour en effacer plusieurs' },
];
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
  boutonTranscrire = null, // transcription en direct du cours (05/10)
  // TABLETTE (07/10, refaite l'après-midi — docs/compte-rendu-position-document-tablette.md) :
  // TOUS les outils visibles en permanence, rien dans un menu ; la barre passe sur deux
  // rangées compactes si la largeur manque, jamais de défilement
  tablette = false,
  /* RANGÉE TEXTE (09/10, docs/compte-rendu-pdfreader-v2.md) : la barre de mise en forme du texte
     (boîte active ou texte du document) prend la place de la barre contextuelle, sous les outils.
     `reserverRangee` (document) : la rangée garde sa hauteur même vide — rien ne saute quand la
     barre apparaît ou disparaît, seul son contenu passe en fondu. */
  rangeeTexte = null, reserverRangee = false,
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
  const [menuInserer, setMenuInserer] = useState(null);
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
  const outils = outilsDisponibles ? OUTILS.filter((o) => outilsDisponibles.includes(o.id)) : OUTILS;
  const outilActif = outils.find((o) => o.id === outil) || outils[0];

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
  const contenuRangee = rangeeTexte ? { cle: 'texte', el: <div className="pdfr-rangee-texte">{rangeeTexte}</div> }
    : outilsAnnotation && contexteSupplementaire ? { cle: 'outil:' + outilActif.id, el: (<>
      <span className="ptb-contexte-titre">{outilActif.label}</span>
      {contexteSupplementaire}
      {!tablette && <><span style={{ flex: 1 }} /><span className="hint ptb-contexte-aide">{outilActif.aide}</span></>}
    </>) }
    : outilsAnnotation && reserverRangee ? { cle: 'vide', el: <span className="hint ptb-contexte-aide">{outil === 'main' ? 'Cliquez dans le texte pour le mettre en forme' : outilActif.aide}</span> }
    : null;
  const rangee = contenuRangee && (
    <div className={'pdfr-contexte' + (tablette ? ' tab-contexte' : '') + (reserverRangee ? ' reservee' : '') + (contenuRangee.cle === 'texte' ? ' mode-texte' : '')}>
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
        <div ref={barreRef} className="pdfr-toolbar pdfr-barre tab-barre">
          {!sansPages && (
            <div className="tab-zone">
              <button type="button" className="tab-bt" disabled={pageCourante <= 1} onClick={() => onAllerPage(pageCourante - 1)} title="Page précédente" aria-label="Page précédente"><Icon name="chevU" size={16} /></button>
              <span className="tab-pages tnum" title="Page affichée">{numPages ? `${pageCourante}/${numPages}` : '—'}</span>
              <button type="button" className="tab-bt" disabled={!numPages || pageCourante >= numPages} onClick={() => onAllerPage(pageCourante + 1)} title="Page suivante" aria-label="Page suivante"><Icon name="chevD" size={16} /></button>
              <span className="ptb-sep" />
              <button type="button" className="tab-bt" onClick={() => onZoom(1 / 1.15)} title="Dézoomer" aria-label="Dézoomer"><Icon name="minus" size={16} /></button>
              <span className="tab-zoom tnum" title="Zoom">{Math.round(scale * 100)}%</span>
              <button type="button" className="tab-bt" onClick={() => onZoom(1.15)} title="Zoomer" aria-label="Zoomer"><Icon name="plus" size={16} /></button>
              <button type="button" className="tab-bt" onClick={onAjuster} title="Ajuster à la largeur" aria-label="Ajuster à la largeur"><Icon name="maximize" size={15} /></button>
            </div>
          )}
          {statut}
          {outilsAnnotation && (
            <div className="tab-zone tab-outils" role="group" aria-label="Outils d'annotation">
              {principaux.map((o) => (
                <button key={o.id} type="button" title={`${o.label} — ${o.aide}`} aria-label={o.label} aria-pressed={outil === o.id}
                  className={'tab-bt tab-outil' + (outil === o.id ? ' actif' : '')}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => setOutil(o.id)}>
                  <IconeOutil nom={o.icone} size={18} />
                </button>
              ))}
              {onAjouterImage && (
                <button type="button" className="tab-bt tab-outil" onClick={onAjouterImage} aria-label="Insérer une image"
                  title={imageDansTexte ? 'Image — l’insérer dans le texte, au curseur (ou la coller avec Cmd/Ctrl+V)' : 'Image — importer une image et la placer sur la page (ou la coller avec Cmd/Ctrl+V)'}><IconeOutil nom="image" size={18} /></button>
              )}
              {onAjouterPage && (
                <button type="button" className="tab-bt tab-outil" onClick={onAjouterPage} aria-label="Insérer une page blanche"
                  title="Page — insérer une page blanche juste après la page affichée"><IconeOutil nom="page" size={18} /></button>
              )}
              {boutonDessins}
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
      <div ref={barreRef} className={'pdfr-toolbar pdfr-barre' + classeLargeur}>
        {/* ---- ZONE GAUCHE : naviguer dans le document ---- */}
        <div className="ptb-zone">
          <button className="btn ghost sm" onClick={onClose} title="Revenir à la liste"><Icon name="chevL" size={14} /> Retour</button>
          {statut}
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
            <span className="hint tnum" style={{ minWidth: 42, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
            <button className="icon-btn sm" onClick={() => onZoom(1.15)} title="Zoomer"><Icon name="plus" size={14} /></button>
            <button className="icon-btn sm" onClick={onAjuster} title="Ajuster à la largeur"><Icon name="maximize" size={13} /></button>
          </div>
          </>)}
        </div>

        {/* ---- ZONE CENTRE : LES OUTILS. Le cœur du lecteur, donc au centre. ---- */}
        {outilsAnnotation && (
          <div className="ptb-outils" role="group" aria-label="Outils d'annotation">
            {outils.map((o) => (
              <button key={o.id} type="button" title={`${o.label} — ${o.aide}`}
                className={'ptb-outil' + (outil === o.id ? ' actif' : '')}
                onMouseDown={(e) => e.preventDefault()} /* garde la sélection de texte : Surligneur la surligne */
                onClick={() => setOutil(o.id)}>
                <IconeOutil nom={o.icone} size={16} />
                {o.id !== 'question' && <span className="ptb-outil-lbl">{o.label}</span>}
              </button>
            ))}
            {(onAjouterImage || onAjouterPage || boutonDessins) && <span className="ptb-sep" />}
            {compacte && (onAjouterImage || onAjouterPage) && (
              <button type="button" className="ptb-outil" title="Insérer une image ou une page"
                onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenuInserer({ x: Math.min(r.left, window.innerWidth - 260), y: r.bottom + 6 }); }}>
                <Icon name="plus" size={16} />
              </button>
            )}
            {!compacte && onAjouterImage && (
              <button type="button" className="ptb-outil" onClick={onAjouterImage}
                title={imageDansTexte ? 'Image — l’insérer dans le texte, au curseur (ou la coller avec Cmd/Ctrl+V)' : 'Image — importer une image et la placer sur la page (ou la coller avec Cmd/Ctrl+V)'}>
                <IconeOutil nom="image" size={16} /><span className="ptb-outil-lbl">Image</span>
              </button>
            )}
            {!compacte && onAjouterPage && (
              <button type="button" className="ptb-outil" onClick={onAjouterPage}
                title="Page — insérer une page blanche juste après la page affichée (ou avec le « + Page » entre deux pages)">
                <IconeOutil nom="page" size={16} /><span className="ptb-outil-lbl">Page</span>
              </button>
            )}
            {boutonDessins}
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
      {menuInserer && <ContextMenu x={menuInserer.x} y={menuInserer.y} onClose={() => setMenuInserer(null)} items={[
        onAjouterImage && { label: 'Image — importer et placer', icon: 'image', onClick: onAjouterImage },
        onAjouterPage && { label: 'Page blanche après la page affichée', icon: 'plus', onClick: onAjouterPage },
      ].filter(Boolean)} />}
    </>
  );
}
