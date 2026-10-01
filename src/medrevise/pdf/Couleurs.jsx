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
   ============================================================ */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../shared/Icon.jsx';
import { COLORS, couleurHex } from './pdfShared.js';
import { useCouleursPerso, hsvVersHex, hexVersHsv } from '../lib/couleursPerso.js';

export function SelecteurCouleurs({ couleur, onCouleur, titre = 'Couleur' }) {
  const [perso, ajouter, retirer] = useCouleursPerso();
  const [roue, setRoue] = useState(null); // { x, y } : position de la fenêtre
  const plusRef = useRef(null);
  const ouvrir = () => {
    const r = plusRef.current.getBoundingClientRect();
    setRoue({ x: Math.min(r.left, window.innerWidth - 300), y: r.bottom + 8 });
  };
  return (
    <div className="sc-couleurs" role="group" aria-label={titre}>
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

/** la roue elle-même, dans une petite fenêtre flottante */
function FenetreRoue({ x, y, depart, onFermer, onValider }) {
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
    <div ref={boiteRef} className="sc-fenetre" style={{ left: x, top: y }} role="dialog" aria-label="Roue chromatique">
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
