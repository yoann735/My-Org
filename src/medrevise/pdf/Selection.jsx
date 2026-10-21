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
 *   { cle: 'supprimer', onClick, titre }                 toujours en dernier, en rouge
 */
export function MiniBarre({ ancre, pageWidth, pageHeight, items, classe = '' }) {
  const ref = useRef(null);
  const [place, setPlace] = useState(null);
  const tactile = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
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
  const arret = (fn) => ({ onPointerDown: (e) => e.stopPropagation(), onMouseDown: (e) => e.preventDefault(), onClick: (e) => { e.stopPropagation(); fn(); } });
  return (
    <div ref={ref} role="toolbar" className={'mini-barre nb-actions nb-barre' + (place && place.dessous ? ' dessous' : '') + (tactile ? ' tactile' : '') + (classe ? ' ' + classe : '')}
      style={{ left: place ? place.left : ancre.x, top: place ? place.top : ancre.y - 40, visibility: place ? 'visible' : 'hidden' }}
      onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      {items.filter(Boolean).map((it, i) => {
        if (it.cle === '|') return <span key={'s' + i} className="mb-sep" aria-hidden="true" />;
        if (it.element) return <span key={it.cle} className="mb-el">{it.element}</span>;
        if (it.couleur !== undefined) return <BoutonCouleur key={it.cle} couleur={it.couleur} titre={it.titre} onApercu={it.onApercu || null} onCouleur={it.onCouleur} />;
        if (it.libelle) return <button key={it.cle} type="button" className="nb-act vise" title={it.titre} {...arret(it.onClick)}>{it.libelle}</button>;
        const supprimer = it.cle === 'supprimer';
        return (
          <button key={it.cle} type="button" data-option={it.cle} aria-label={it.titre} title={it.titre} disabled={!!it.desactive}
            className={'nb-act' + (it.actif ? ' actif' : '') + (supprimer ? ' danger' : '')} {...arret(it.onClick)}>
            {supprimer ? <Icon name="trash" size={15} /> : it.icone}
          </button>
        );
      })}
    </div>
  );
}
