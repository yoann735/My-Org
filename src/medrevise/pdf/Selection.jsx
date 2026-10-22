/* ============================================================
   MedRevise — SÉLECTION ET MINI BARRE, une seule implémentation pour tous les objets du lecteur
   (21/10, docs/compte-rendu-pdfreader-harmonisation.md).

   Règle unique (outil Sélection) : un clic sélectionne ; cliquer-glisser N'IMPORTE OÙ sur l'objet le déplace ;
   boîte / zone de texte : double-clic (ou clic quand elle est déjà sélectionnée) = édition, Échap = sortie.
     CadreSelection   contour 1,5 px d'accent + 4 poignées d'angle — les mêmes pour boîte, zone de texte, « ? »,
                      forme, image, trait de crayon
     redimRect        géométrie d'une redimension par un coin (coin opposé fixe, minimum, proportions)
     MiniBarre        la barre d'options : un composant, une grammaire d'icônes, l'ordre apparence → actions →
                      supprimer ; posée au-dessus de l'objet, en dessous s'il n'y a pas la place, jamais dessus
   ============================================================ */
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../shared/Icon.jsx';
import { BoutonCouleur } from './Couleurs.jsx';
import { suivrePointeur, rectPage } from './pointeur.js';

export const COINS = ['nw', 'ne', 'sw', 'se'];
/** classe à poser sur tout ce qui fait partie de la sélection (cadre, poignées, mini barre) : un clic dessus ne désélectionne pas */
export const ZONE_SELECTION = '.sel-zone, .sel-cadre, .mini-barre, .sc-pop, .sc-fenetre, .scw-pipette, .mb-pop';

/** cadre de sélection : à poser DANS l'élément de l'objet (inset 0). `contre` : facteur qui annule la mise à l'échelle
    de l'objet pour garder des poignées de taille constante à l'écran ; `onCoin(e, coin)` absent = pas de poignées. */
export function CadreSelection({ onCoin = null, contre = 1, rond = false }) {
  const s = contre !== 1 ? { scale: String(contre) } : undefined;
  return (
    <span className={'sel-cadre' + (rond ? ' rond' : '')} aria-hidden="true">
      {onCoin && COINS.map((c) => (
        <span key={c} className={'sel-coin sel-' + c} style={s} data-coin={c}
          onPointerDown={(e) => { e.stopPropagation(); onCoin(e, c); }} />
      ))}
    </span>
  );
}

/**
 * Redimension par le coin `coin` d'un rectangle { x, y, width, height } (fractions de page) de `dx`, `dy` (fractions) :
 * le coin opposé reste fixe ; `min` { width, height } ; `ratio` (hauteur / largeur en fractions) : proportions gardées.
 */
export function redimRect(base, coin, dx, dy, { min = { width: 0.01, height: 0.01 }, ratio = null } = {}) {
  const est = coin.includes('e'), sud = coin.includes('s');
  let w = base.width + (est ? dx : -dx), h = base.height + (sud ? dy : -dy);
  if (ratio) { const w2 = Math.max(w, h / ratio); w = w2; h = w2 * ratio; }
  w = Math.max(min.width, w); h = Math.max(min.height, h);
  if (ratio) { if (w * ratio < min.height) w = min.height / ratio; h = w * ratio; }
  return { x: est ? base.x : base.x + base.width - w, y: sud ? base.y : base.y + base.height - h, width: w, height: h };
}

/** geste de redimension par un coin : `base()` donne le rectangle de départ (fractions), `appliquer(rect)` l'aperçu,
    `fin(rect)` l'écriture ; tout passe par le gestionnaire de pointeur unique */
export function redimensionner(e, coin, { base, min, ratio = null, onGeste = () => {}, apercu, fin }) {
  const r = rectPage(e.currentTarget);
  if (!r || !r.width) return;
  const b0 = base(), x0 = e.clientX, y0 = e.clientY;
  let courant = null;
  const suivi = suivrePointeur(e, {
    seuil: 2, arreter: true,
    move: (ev) => { courant = redimRect(b0, coin, (ev.clientX - x0) / r.width, (ev.clientY - y0) / r.height, { min, ratio }); apercu(courant); },
    fin: (ev, { annule }) => { onGeste(false); apercu(null); if (!annule && courant) fin(courant); },
  });
  if (suivi) onGeste(true);
}

/**
 * La MINI BARRE. `ancre` : rectangle de l'objet en px de la page { x, y, w, h } ; `items` : liste de
 *   { cle, icone, titre, onClick, actif?, desactive? }  bouton (icône seule)
 *   { cle, couleur, onCouleur, onApercu?, titre }       la couleur (sélecteur commun)
 *   { cle, element }                                     un contrôle déjà construit (taille du texte…)
 *   { cle: '|' }                                         séparateur de groupe
 *   { cle: '…', plus: [items] }                          (22/10) le reste, dans un menu « … » (icône + libellé)
 *   { cle: 'supprimer', onClick, titre }                 toujours en dernier, en rouge
 * (22/10, docs/compte-rendu-simplification-outils.md) LA barre de tous les objets : boîte, post-it, boîte-tableau,
 * texte libre, bloc de texte remplacé, forme, flèche, image, trait, et (MiniBarreFlottante) le texte d'un document.
 */
export function MiniBarre({ ancre, pageWidth, pageHeight, items, classe = '' }) {
  const ref = useRef(null);
  const [place, setPlace] = useState(null);
  const tactile = estTactile();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const mesurer = () => {
      const page = el.closest('.pdfr-page'), zone = page && (page.closest('.pdfr-scroll') || page.parentElement);
      const bw = el.offsetWidth, bh = el.offsetHeight;
      let visL = 0, visR = pageWidth, visT = 0, visB = pageHeight;
      if (page && zone) {
        const rp = page.getBoundingClientRect(), rz = zone.getBoundingClientRect();
        visL = Math.max(rz.left, 0) - rp.left; visR = Math.min(rz.right, window.innerWidth) - rp.left;
        visT = Math.max(rz.top, 0) - rp.top; visB = Math.min(rz.bottom, window.innerHeight) - rp.top;
      }
      const left = Math.max(Math.max(0, visL) + 4, Math.min(ancre.x + ancre.w / 2 - bw / 2, Math.min(pageWidth, visR) - bw - 4));
      const marge = 8;
      const dessus = ancre.y - bh - marge;
      const enDessous = dessus < Math.max(4, visT + 4) && ancre.y + ancre.h + marge + bh <= Math.max(visB, pageHeight);
      const top = enDessous ? ancre.y + ancre.h + marge : dessus;
      setPlace((p) => (p && Math.abs(p.left - left) < 0.5 && Math.abs(p.top - top) < 0.5 && p.dessous === enDessous ? p : { left, top, dessous: enDessous }));
    };
    mesurer();
    const zone = el.closest('.pdfr-scroll');
    let raf = null;
    const planifier = () => { if (!raf) raf = requestAnimationFrame(() => { raf = null; mesurer(); }); };
    if (zone) zone.addEventListener('scroll', planifier, { passive: true });
    window.addEventListener('resize', planifier);
    return () => { if (zone) zone.removeEventListener('scroll', planifier); window.removeEventListener('resize', planifier); if (raf) cancelAnimationFrame(raf); };
  }, [ancre.x, ancre.y, ancre.w, ancre.h, pageWidth, pageHeight, items.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={ref} role="toolbar" className={'mini-barre nb-actions nb-barre' + (place && place.dessous ? ' dessous' : '') + (tactile ? ' tactile' : '') + (classe ? ' ' + classe : '')}
      style={{ left: place ? place.left : ancre.x, top: place ? place.top : ancre.y - 40, visibility: place ? 'visible' : 'hidden' }}
      onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <ContenuBarre items={items} />
    </div>
  );
}

const estTactile = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const arret = (fn) => ({ onPointerDown: (e) => e.stopPropagation(), onMouseDown: (e) => e.preventDefault(), onClick: (e) => { e.stopPropagation(); fn(); } });

/** les boutons d'une mini barre (communs à MiniBarre et MiniBarreFlottante) */
function ContenuBarre({ items }) {
  return items.filter(Boolean).map((it, i) => {
    if (it.cle === '|') return <span key={'s' + i} className="mb-sep" aria-hidden="true" />;
    if (it.plus) return <BoutonPlus key={it.cle} items={it.plus} titre={it.titre} />;
    if (it.element) return <span key={it.cle} className="mb-el" data-mb={it.cle}>{it.element}</span>;
    if (it.couleur !== undefined) return <span key={it.cle} className="mb-el" data-mb={it.cle}><BoutonCouleur couleur={it.couleur} titre={it.titre} icone={it.icone || null} aucune={!!it.aucune} onApercu={it.onApercu || null} onCouleur={it.onCouleur} /></span>;
    if (it.libelle && !it.icone) return <button key={it.cle} type="button" className="nb-act vise" title={it.titre} {...arret(it.onClick)}>{it.libelle}</button>;
    if (it.texte) return <button key={it.cle} type="button" data-option={it.cle} className="nb-act avec-texte" title={it.titre} {...arret(it.onClick)}>{it.icone}{it.texte}</button>;
    const supprimer = it.cle === 'supprimer';
    return (
      <button key={it.cle} type="button" data-option={it.cle} aria-label={it.titre} title={it.titre} disabled={!!it.desactive} aria-pressed={it.actif === undefined ? undefined : !!it.actif}
        className={'nb-act' + (it.actif ? ' actif' : '') + (supprimer ? ' danger' : '')} {...arret(it.onClick)}>
        {supprimer ? <Icon name="trash" size={15} /> : it.icone}
      </button>
    );
  });
}

/** « … » : le reste des options, en liste (icône + libellé) ; un clic sur une option la lance et referme le menu
    (sauf les contrôles intégrés : couleur, taille, qui ont leur propre panneau) */
function BoutonPlus({ items, titre = 'Plus d’options' }) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef(null), popRef = useRef(null);
  const [dessus, setDessus] = useState(false);
  useLayoutEffect(() => {
    if (!ouvert || !popRef.current) return;
    const r = popRef.current.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 8 && r.top - r.height - 48 > 0) setDessus(true);
  }, [ouvert]);
  useLayoutEffect(() => {
    if (!ouvert) { setDessus(false); return undefined; }
    const dehors = (e) => { if (ref.current && !ref.current.contains(e.target) && !(e.target.closest && e.target.closest('.sc-pop, .sc-fenetre, .ct-pop, .scw-pipette'))) setOuvert(false); };
    const clavier = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOuvert(false); } };
    window.addEventListener('pointerdown', dehors, true);
    window.addEventListener('keydown', clavier, true);
    return () => { window.removeEventListener('pointerdown', dehors, true); window.removeEventListener('keydown', clavier, true); };
  }, [ouvert]);
  return (
    <span className="mb-plus" ref={ref}>
      <button type="button" data-option="plus" aria-label={titre} title={titre} aria-expanded={ouvert} className={'nb-act' + (ouvert ? ' actif' : '')}
        {...arret(() => setOuvert((o) => !o))}>
        <Icon name="more" size={16} />
      </button>
      {ouvert && (
        <div ref={popRef} role="menu" className={'mb-pop mb-plus-pop' + (dessus ? ' dessus' : '')} onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => { if (!(e.target.closest && e.target.closest('input, select'))) e.preventDefault(); }}>
          {items.filter(Boolean).map((it, i) => {
            if (it.cle === '|') return <span key={'s' + i} className="mb-plus-sep" aria-hidden="true" />;
            if (it.element) return <div key={it.cle} className="mb-plus-ligne avec-el" data-option={it.cle}><span className="mb-plus-lib">{it.titre}</span><span className="mb-plus-el">{it.element}</span></div>;
            if (it.couleur !== undefined) return <div key={it.cle} className="mb-plus-ligne avec-el" data-option={it.cle}><span className="mb-plus-lib">{it.titre}</span><BoutonCouleur couleur={it.couleur} titre={it.titre} icone={it.icone || null} aucune={!!it.aucune} onApercu={it.onApercu || null} onCouleur={it.onCouleur} /></div>;
            return (
              <button key={it.cle} type="button" role="menuitem" data-option={it.cle} disabled={!!it.desactive} aria-pressed={it.actif === undefined ? undefined : !!it.actif}
                className={'mb-plus-ligne' + (it.actif ? ' actif' : '') + (it.cle === 'supprimer' ? ' danger' : '')} title={it.titre}
                {...arret(() => { it.onClick(); if (!it.garder) setOuvert(false); })}>
                <span className="mb-plus-ic">{it.icone}</span><span className="mb-plus-lib">{it.libelle || String(it.titre || '').replace(/ \(.*\)$/, '')}</span>
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}

/**
 * La même barre, posée AU-DESSUS D'UNE SÉLECTION DE TEXTE (document créé dans l'app) : `rect` = rectangle de la
 * sélection à l'écran (getBoundingClientRect) ; portail en position fixe, dessous s'il manque la place en haut.
 */
export function MiniBarreFlottante({ rect, items, classe = '' }) {
  const ref = useRef(null);
  const [place, setPlace] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !rect) return;
    const bw = el.offsetWidth, bh = el.offsetHeight, m = 8;
    const left = Math.max(m, Math.min(rect.left + rect.width / 2 - bw / 2, window.innerWidth - bw - m));
    const dessous = rect.top - bh - m < 56;
    const top = dessous ? rect.bottom + m : rect.top - bh - m;
    setPlace((p) => (p && Math.abs(p.left - left) < 0.5 && Math.abs(p.top - top) < 0.5 && p.dessous === dessous ? p : { left, top, dessous }));
  });
  if (!rect || typeof document === 'undefined') return null;
  return createPortal(
    <div ref={ref} role="toolbar" className={'mini-barre nb-actions nb-barre flottante' + (place && place.dessous ? ' dessous' : '') + (estTactile() ? ' tactile' : '') + (classe ? ' ' + classe : '')}
      style={{ left: place ? place.left : rect.left, top: place ? place.top : rect.top - 44, visibility: place ? 'visible' : 'hidden' }}
      onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => { if (!(e.target.closest && e.target.closest('input, select'))) e.preventDefault(); }}>
      <ContenuBarre items={items} />
    </div>,
    document.querySelector('[data-app="medrevise"]') || document.body,
  );
}
