/* ============================================================
   MedRevise — SÉLECTEUR DE COULEURS du surligneur et du crayon (02/10).

     ● ● ● ●   │  ● ● ●  ⊕
     4 couleurs « cours »   mes couleurs   roue chromatique

   - Les 4 couleurs « cours » sont toujours là (elles ont un SENS : prioritaire,
     cloze… — voir pdfShared.js#COLORS).
   - « Mes couleurs » : ajoutées depuis la roue, mémorisées (lib/couleursPerso.js),
     retirables d'un clic sur leur petite croix.
   - La roue : teinte autour, saturation vers le bord, luminosité au curseur, code
     hex éditable, aperçu « avant / après ». Fenêtre posée par-dessus tout
     (portail), fermée par Échap ou un clic à l'extérieur.

   UN SEUL SYSTÈME POUR TOUS LES OUTILS (02/10 soir) : surligneur, crayon, formes, boîtes,
   texte libre, bulle d'un surlignage, cartes du tableau, couleur du texte dans une
   boîte — tous passent par CE sélecteur (avant : 4 sélecteurs différents, dont une
   palette de 12 couleurs propre au crayon et l'input couleur du navigateur).
   Une couleur d'avant qui n'est ni « cours » ni perso (noir d'un texte libre, carte
   blanche…) reste affichée, sélectionnée, en tête : rien ne change sur la page.
   ============================================================ */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../shared/Icon.jsx';
import { COLORS, couleurHex } from './pdfShared.js';

/** éléments flottants du sélecteur : un « clic dehors » d'une bulle ou d'un panneau
    ne doit pas les compter comme extérieurs (sinon la roue fermerait sa bulle). */
export const SELECTEUR_FLOTTANT = '.sc-fenetre, .sc-pop';
export const dansSelecteurFlottant = (el) => !!(el && el.closest && el.closest(SELECTEUR_FLOTTANT));
import { useCouleursPerso, hsvVersHex, hexVersHsv } from '../lib/couleursPerso.js';

/** `enTete` (facultatif) : pastilles fixes placées AVANT les 4 couleurs « cours » —
    sert au dessin du téléphone, sur fond noir, pour l'ENCRE (blanc à l'écran, noir
    sur la page). Partout ailleurs le sélecteur est inchangé. */
export function SelecteurCouleurs({ couleur, onCouleur, titre = 'Couleur', enTete = [] }) {
  const [perso, ajouter, retirer] = useCouleursPerso();
  const [roue, setRoue] = useState(null); // { x, y } : position de la fenêtre
  const plusRef = useRef(null);
  const actuelleHorsListe = !!couleur && couleur !== 'off' && !COLORS.some((c) => c.id === couleur) && !perso.includes(String(couleur).toLowerCase()) && !enTete.some((c) => c.id === couleur);
  const ouvrir = () => {
    const r = plusRef.current.getBoundingClientRect();
    setRoue({ x: Math.min(r.left, window.innerWidth - 300), y: r.bottom + 8 });
  };
  return (
    <div className="sc-couleurs" role="group" aria-label={titre}>
      {actuelleHorsListe && (<>
        <button type="button" title="Couleur actuelle" className="sc-pastille actif" style={{ background: couleurHex(couleur, '#888888') }} onClick={() => onCouleur(couleur)} />
        <span className="sc-sep" aria-hidden="true" />
      </>)}
      {enTete.map((c) => (
        <button key={c.id} type="button" title={c.label} onClick={() => onCouleur(c.id)}
          className={'sc-pastille' + (couleur === c.id ? ' actif' : '')} style={{ background: c.hex }} />
      ))}
      {COLORS.map((c) => (
        <button key={c.id} type="button" title={`${c.label} — couleur « cours »`} onClick={() => onCouleur(c.id)}
          className={'sc-pastille' + (couleur === c.id ? ' actif' : '')} style={{ background: c.hex }} />
      ))}
      {perso.length > 0 && <span className="sc-sep" aria-hidden="true" />}
      {perso.map((hex) => (
        <span key={hex} className="sc-perso">
          <button type="button" title={`Ma couleur ${hex}`} onClick={() => onCouleur(hex)}
            className={'sc-pastille' + (couleur === hex ? ' actif' : '')} style={{ background: hex }} />
          <button type="button" className="sc-retirer" title="Retirer de mes couleurs" onClick={() => retirer(hex)}><Icon name="x" size={8} /></button>
        </span>
      ))}
      <button ref={plusRef} type="button" className={'sc-roue-btn' + (roue ? ' actif' : '')} title="Choisir une couleur sur la roue et l’ajouter à mes couleurs"
        onClick={() => (roue ? setRoue(null) : ouvrir())}>
        <span className="sc-roue-mini" /><Icon name="plus" size={10} />
      </button>
      {roue && createPortal(
        <FenetreRoue x={roue.x} y={roue.y} depart={couleurHex(couleur, '#e5383b')}
          onFermer={() => setRoue(null)}
          onValider={(hex) => { ajouter(hex); onCouleur(hex); setRoue(null); }} />,
        document.body,
      )}
    </div>
  );
}

/* BOUTON COULEUR COMPACT (02/10 soir) : une pastille de la couleur courante ; un clic
   ouvre, dans un petit panneau flottant, LE MÊME sélecteur (4 couleurs « cours »,
   mes couleurs, roue). Pour les barres où la place manque (mise en forme du texte
   d'une boîte). `onMouseDown` empêché : la sélection de texte de l'éditeur reste. */
export function BoutonCouleur({ couleur, onCouleur, titre = 'Couleur', icone = null }) {
  const [pop, setPop] = useState(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  useEffect(() => {
    if (!pop) return undefined;
    const dehors = (e) => {
      if (popRef.current && popRef.current.contains(e.target)) return;
      if (btnRef.current && btnRef.current.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.sc-fenetre')) return;
      setPop(null);
    };
    const touche = (e) => { if (e.key === 'Escape') setPop(null); };
    window.addEventListener('pointerdown', dehors);
    window.addEventListener('keydown', touche);
    return () => { window.removeEventListener('pointerdown', dehors); window.removeEventListener('keydown', touche); };
  }, [pop]);
  return (
    <>
      <button ref={btnRef} type="button" className={'sc-bouton' + (pop ? ' actif' : '')} title={titre}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (pop) { setPop(null); return; }
          const r = btnRef.current.getBoundingClientRect();
          setPop({ x: Math.max(8, Math.min(r.left, window.innerWidth - 330)), y: r.bottom + 6 });
        }}>
        {icone}
        <span className="sc-bouton-pastille" style={{ background: couleur ? couleurHex(couleur, '#888888') : 'transparent' }} />
      </button>
      {pop && createPortal(
        <div ref={popRef} className="sc-pop" style={{ left: pop.x, top: pop.y }} onMouseDown={(e) => e.preventDefault()}>
          <SelecteurCouleurs couleur={couleur} titre={titre} onCouleur={(c) => { onCouleur(c); setPop(null); }} />
        </div>,
        document.body,
      )}
    </>
  );
}

/** la roue elle-même, dans une petite fenêtre flottante */
export function FenetreRoue({ x, y, depart, onFermer, onValider, classe = '' }) {
  const [hsv, setHsv] = useState(() => hexVersHsv(depart));
  const [saisie, setSaisie] = useState(depart);
  const hex = hsvVersHex(hsv.h, hsv.s, hsv.v);
  useEffect(() => { setSaisie(hex); }, [hex]);

  const boiteRef = useRef(null);
  useEffect(() => {
    const dehors = (e) => { if (boiteRef.current && !boiteRef.current.contains(e.target) && !(e.target.closest && e.target.closest('.sc-roue-btn'))) onFermer(); };
    const touche = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onFermer(); } };
    window.addEventListener('pointerdown', dehors);
    window.addEventListener('keydown', touche, true);
    return () => { window.removeEventListener('pointerdown', dehors); window.removeEventListener('keydown', touche, true); };
  }, [onFermer]);

  // dessin de la roue (teinte × saturation) pour la luminosité courante
  const TAILLE = 176;
  const canvasRef = useRef(null);
  useLayoutEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const n = Math.round(TAILLE * dpr);
    c.width = n; c.height = n;
    const g = c.getContext('2d');
    const img = g.createImageData(n, n);
    const r0 = n / 2;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const dx = i - r0 + 0.5, dy = j - r0 + 0.5, d = Math.hypot(dx, dy);
        const k = (j * n + i) * 4;
        if (d > r0) { img.data[k + 3] = 0; continue; }
        const h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        const col = hsvVersHex(h, d / r0, hsv.v);
        const v = parseInt(col.slice(1), 16);
        img.data[k] = (v >> 16) & 255; img.data[k + 1] = (v >> 8) & 255; img.data[k + 2] = v & 255;
        img.data[k + 3] = d > r0 - 1 ? Math.round(255 * (r0 - d)) : 255; // bord lissé
      }
    }
    g.putImageData(img, 0, 0);
  }, [hsv.v]);

  const viser = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const s = Math.min(1, Math.hypot(dx, dy) / (r.width / 2));
    setHsv((p) => ({ ...p, h: (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360, s }));
  };
  const glisser = (e) => {
    e.preventDefault();
    viser(e);
    const move = (ev) => viser(ev);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const angle = (hsv.h * Math.PI) / 180;
  const repere = { left: TAILLE / 2 + Math.cos(angle) * hsv.s * TAILLE / 2, top: TAILLE / 2 + Math.sin(angle) * hsv.s * TAILLE / 2 };
  const hexVif = hsvVersHex(hsv.h, hsv.s, 1);

  return (
    <div ref={boiteRef} className={'sc-fenetre' + (classe ? ' ' + classe : '')} style={{ left: x, top: y }} role="dialog" aria-label="Roue chromatique">
      <div className="sc-roue" style={{ width: TAILLE, height: TAILLE }} onPointerDown={glisser}>
        <canvas ref={canvasRef} style={{ width: TAILLE, height: TAILLE }} />
        <span className="sc-repere" style={{ left: repere.left, top: repere.top, background: hex }} />
      </div>
      <label className="sc-lum" title="Luminosité">
        <input type="range" min="0" max="100" value={Math.round(hsv.v * 100)}
          onChange={(e) => setHsv((p) => ({ ...p, v: Number(e.target.value) / 100 }))}
          style={{ background: `linear-gradient(90deg, #000, ${hexVif})` }} />
      </label>
      <div className="sc-ligne">
        <span className="sc-apercu" title="Avant / après">
          <i style={{ background: depart }} /><i style={{ background: hex }} />
        </span>
        <input className="sc-hex" value={saisie} spellCheck={false} maxLength={7} aria-label="Code hexadécimal"
          onChange={(e) => {
            const v = e.target.value.trim();
            setSaisie(v);
            const h = v.startsWith('#') ? v : `#${v}`;
            if (/^#[0-9a-f]{6}$/i.test(h)) setHsv(hexVersHsv(h));
          }} />
      </div>
      <div className="sc-actions">
        <button type="button" className="btn ghost sm" onClick={onFermer}>Annuler</button>
        <button type="button" className="btn primary sm" title="Ajouter à mes couleurs et l’utiliser" onClick={() => onValider(hex)}><Icon name="plus" size={12} /> Ajouter</button>
      </div>
    </div>
  );
}

/* ============================================================
   RÉGLAGES DU TRAIT (crayon, 03/10) : deux curseurs fins, TAILLE et OPACITÉ, et
   un aperçu du trait tel qu'il sera posé (couleur, épaisseur réelle à ce zoom,
   transparence). Bornes propres à chaque mode : un surligneur est plus épais.
   ============================================================ */
const BORNES = { dessin: { min: 0.001, max: 0.016 }, surligneur: { min: 0.006, max: 0.04 } };
export function ReglagesTrait({ mode, reglage, couleur, hauteurPage = 1000, onChange }) {
  const b = BORNES[mode] || BORNES.dessin;
  const pct = Math.round(((reglage.taille - b.min) / (b.max - b.min)) * 100);
  const px = Math.max(1, Math.min(22, reglage.taille * hauteurPage));
  return (
    <div className="rt" aria-label="Réglages du trait">
      <span className="rt-apercu" title="Aperçu du trait">
        <svg width="34" height="24" viewBox="0 0 34 24" aria-hidden="true">
          <path d="M3 17 C 10 4, 20 22, 31 7" fill="none" stroke={couleur} strokeOpacity={reglage.opacite} strokeWidth={px} strokeLinecap="round" />
        </svg>
      </span>
      <label className="rt-curseur" title="Taille du trait">
        <span>Taille</span>
        <input type="range" min="0" max="100" value={Math.max(0, Math.min(100, pct))}
          onChange={(e) => onChange({ taille: b.min + ((b.max - b.min) * Number(e.target.value)) / 100 })} />
      </label>
      <label className="rt-curseur" title="Opacité du trait">
        <span>Opacité</span>
        <input type="range" min="10" max="100" value={Math.round(reglage.opacite * 100)}
          onChange={(e) => onChange({ opacite: Number(e.target.value) / 100 })} />
        <i className="rt-valeur">{Math.round(reglage.opacite * 100)} %</i>
      </label>
    </div>
  );
}
