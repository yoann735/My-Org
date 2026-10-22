/* ============================================================
   MedRevise — LE SÉLECTEUR DE TAILLE (v1.1, docs/compte-rendu-tableau-flashcards.md « v1.1 — corrections »). LE MÊME
   pour tous les outils du lecteur et du tableau : taille du texte (boîtes, zones de texte, texte des formes), épaisseur
   du crayon, du surligneur, des formes, des flèches, bordure des boîtes. 3 préréglages et un champ en px, chacun avec un
   APERÇU RÉEL à l'échelle de la page (un trait, un « Aa ») ; pour le texte, la liste 10 → 40 px en plus.
   La valeur est en px d'une page de référence de 1000 px de large (pdfShared.js#GRILLE) : l'utilisateur ne voit que
   des px, rendus proportionnellement à la largeur réelle de la page.
   Un bouton (mini barre de pdf/Selection.jsx ou barre d'outils) ; le panneau s'ouvre dessous (dessus s'il manque la place) ;
   depuis la barre d'outils (`barre`), dans un portail en position fixe : la rangée de réglages, qui défile, le rognait.
   ============================================================ */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GRILLE, bornerTaille } from './pdfShared.js';

export const fmtPx = (v) => (Math.round(v * 10) / 10).toLocaleString('fr-FR') + ' px';
const TITRES = { texte: 'Taille du texte', crayon: 'Épaisseur du crayon', surligneur: 'Épaisseur du surligneur', fleche: 'Épaisseur de la flèche', forme: 'Épaisseur du trait', bordure: 'Épaisseur de la bordure' };
const APERCU_MAX = 44; // px : un aperçu plus grand est rogné (il reste à l'échelle)

/** l'aperçu à l'échelle : « Aa » (texte) ou un trait (épaisseurs) ; `echelle` = px à l'écran par px de référence */
function Apercu({ genre, v, echelle, couleur }) {
  const px = v * echelle;
  if (genre === 'texte') return <span className="ct-aa" style={{ fontSize: Math.max(4, px) }}>Aa</span>;
  const ep = Math.max(0.5, Math.min(APERCU_MAX - 4, px));
  return (
    <svg className="ct-trait" width="40" height={APERCU_MAX - 18} viewBox={`0 0 40 ${APERCU_MAX - 18}`} aria-hidden="true">
      <line x1={Math.min(8, ep / 2 + 2)} x2={40 - Math.min(8, ep / 2 + 2)} y1={(APERCU_MAX - 18) / 2} y2={(APERCU_MAX - 18) / 2}
        stroke={couleur || 'currentColor'} strokeWidth={ep} strokeLinecap="round" opacity={genre === 'surligneur' ? 0.55 : 1} />
    </svg>
  );
}

export function BoutonTaille({ genre = 'texte', valeur, echelle = 1, couleur = null, onChange, onApercu = null, option = null, titre = null, barre = false }) {
  const g = GRILLE[genre] || GRILLE.texte;
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState(String(Math.round(valeur * 10) / 10));
  const [liste, setListe] = useState(false);
  const ref = useRef(null), popRef = useRef(null);
  const [decale, setDecale] = useState({ x: 0, dessus: false });
  useEffect(() => { setSaisie(String(Math.round(valeur * 10) / 10).replace('.', ',')); }, [valeur, ouvert]);
  const [fixe, setFixe] = useState(null); // position du panneau en portail (barre d'outils)
  useLayoutEffect(() => {
    if (!barre || !ouvert || !ref.current) { setFixe(null); return; }
    const r = ref.current.getBoundingClientRect(), L = 252, m = 8;
    const left = Math.max(m, Math.min(r.left, window.innerWidth - L - m));
    const dessous = window.innerHeight - r.bottom > 300 || r.top < 300;
    setFixe(dessous ? { left, top: r.bottom + 8 } : { left, bottom: window.innerHeight - r.top + 8 });
  }, [ouvert, barre]);
  useLayoutEffect(() => {
    if (barre || !ouvert || !popRef.current) { setDecale({ x: 0, dessus: false }); return; }
    // dans la zone visible du lecteur (sa zone de défilement rogne ce qui dépasse), sinon dans l'écran
    const r = popRef.current.getBoundingClientRect(), m = 8;
    const z = popRef.current.closest('.pdfr-scroll');
    const zr = z ? z.getBoundingClientRect() : { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight };
    const gch = Math.max(0, zr.left) + m, dr = Math.min(window.innerWidth, zr.right) - m;
    const d = r.left < gch ? gch - r.left : r.right > dr ? dr - r.right : 0;
    const bas = Math.min(window.innerHeight, zr.bottom) - m;
    setDecale((x) => ({ x: x.x + d, dessus: r.bottom > bas && r.height < r.top - Math.max(0, zr.top) }));
  }, [ouvert]);
  useEffect(() => {
    if (!ouvert) return undefined;
    const fermer = () => { setOuvert(false); setListe(false); if (onApercu) onApercu(null); };
    const dehors = (e) => { if (ref.current && !ref.current.contains(e.target) && !(popRef.current && popRef.current.contains(e.target))) fermer(); };
    const clavier = (e) => { if (e.key === 'Escape') { e.stopPropagation(); fermer(); } };
    window.addEventListener('pointerdown', dehors, true);
    window.addEventListener('keydown', clavier, true);
    return () => { window.removeEventListener('pointerdown', dehors, true); window.removeEventListener('keydown', clavier, true); };
  }, [ouvert, onApercu]);
  const choisir = (v) => { const b = bornerTaille(genre, v); if (onApercu) onApercu(null); onChange(b); setSaisie(String(b).replace('.', ',')); setListe(false); };
  const lu = parseFloat(String(saisie).replace(',', '.'));
  const valide = Number.isFinite(lu) && lu > 0;
  const nom = titre || TITRES[genre] || 'Taille';
  const arret = (e) => e.stopPropagation();
  return (
    <span className={'ct' + (barre ? ' ct-barre' : '')} ref={ref}>
      <button type="button" className={(barre ? 'ptb-bascule ' : 'nb-act ') + 'ct-bouton' + (ouvert ? ' actif' : '')} data-option={option || (genre === 'texte' ? 'taille' : genre === 'bordure' ? 'bordure' : 'epaisseur')}
        data-genre={genre} aria-label={`${nom} : ${fmtPx(valeur)}`} title={`${nom} : ${fmtPx(valeur)}`} aria-expanded={ouvert}
        onPointerDown={arret} onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); setOuvert((o) => !o); }}>
        {genre === 'texte' ? <span className="ct-bt-aa" aria-hidden="true">A<small>a</small></span>
          : <span className="ct-bt-trait" aria-hidden="true" style={{ height: Math.max(1.5, Math.min(7, valeur * echelle)) }} />}
        <span className="ct-bt-val tnum">{Math.round(valeur * 10) / 10}</span>
      </button>
      {ouvert && (!barre || fixe) && enPortail(barre,
        <div ref={popRef} className={'ct-pop mb-pop' + (decale.dessus ? ' dessus' : '') + (barre ? ' fixe' : '')} style={barre ? fixe : decale.x ? { marginLeft: decale.x } : undefined} role="dialog" aria-label={nom}
          onPointerDown={arret} onMouseDown={(e) => { if (e.target.tagName !== 'INPUT') e.preventDefault(); }} onClick={arret}>
          <div className="ct-titre">{nom}</div>
          <div className="ct-presets">
            {g.presets.map((v) => (
              <button key={v} type="button" data-px={v} className={'ct-preset' + (Math.abs(v - valeur) < 0.01 ? ' actif' : '')} title={fmtPx(v)} onClick={() => choisir(v)}>
                <span className="ct-ap"><Apercu genre={genre} v={v} echelle={echelle} couleur={couleur} /></span><span className="ct-nom tnum">{fmtPx(v)}</span>
              </button>
            ))}
          </div>
          <div className="ct-champ">
            <span className="ct-ap ct-ap-champ" title="Aperçu à l’échelle de la page">{valide ? <Apercu genre={genre} v={bornerTaille(genre, lu)} echelle={echelle} couleur={couleur} /> : null}</span>
            <label className="ct-saisie">
              <input type="text" inputMode="decimal" value={saisie} aria-label={`${nom} en px`} data-champ="px"
                onChange={(e) => { setSaisie(e.target.value); const v = parseFloat(e.target.value.replace(',', '.')); if (onApercu && Number.isFinite(v) && v > 0) onApercu(bornerTaille(genre, v)); }}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && valide) { e.preventDefault(); choisir(lu); } if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const v = bornerTaille(genre, (valide ? lu : valeur) + (e.key === 'ArrowUp' ? 1 : -1) * g.pas); setSaisie(String(v).replace('.', ',')); if (onApercu) onApercu(v); } }}
                onBlur={() => { if (valide && Math.abs(bornerTaille(genre, lu) - valeur) > 0.001) choisir(lu); }} />
              <span className="ct-unite">px</span>
            </label>
            {g.liste && <button type="button" className={'ct-liste-bt' + (liste ? ' actif' : '')} aria-expanded={liste} title="Toutes les tailles" onClick={() => setListe((x) => !x)}>▾</button>}
          </div>
          {g.liste && liste && (
            <div className="ct-liste" role="listbox" aria-label="Tailles">
              {g.liste.map((v) => <button key={v} type="button" role="option" aria-selected={Math.abs(v - valeur) < 0.01} data-px={v} className={Math.abs(v - valeur) < 0.01 ? 'actif' : ''} onClick={() => choisir(v)}>{v}</button>)}
            </div>
          )}
        </div>,
      )}
    </span>
  );
}
const enPortail = (oui, el) => (oui && typeof document !== 'undefined' ? createPortal(el, document.querySelector('[data-app="medrevise"]') || document.body) : el);
