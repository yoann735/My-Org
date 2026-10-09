/* ============================================================
   MedRevise — MISE EN PAGE D'UN DOCUMENT (09/10, docs/compte-rendu-pdfreader-v2.md).

   - PanneauMiseEnPage : Fichier › « Mise en page… » — préréglages (Étroites / Normales /
     Larges) et les quatre marges en mm (champ + glissière). Panneau flottant SANS voile :
     on voit le document se repaginer en direct derrière.
   - ReglesMarges : en édition, une règle fine en haut et à gauche de la page courante ;
     glisser une poignée règle la marge en direct, comme dans Word.
   Les marges valent pour TOUTES les pages (zone utile du flux → pagination → export PDF).
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import {
  PREREGLAGES, COTES, MARGES_DEFAUT_MM, MARGE_MIN_MM, MARGE_MAX_MM, UNITES_PAR_MM, bornerMm, prereglageDe,
} from '../documents/lib/marges.js';

const fmt = (v) => String(Math.round(v * 10) / 10).replace('.', ',');

export function PanneauMiseEnPage({ marges, onChange, onFermer }) {
  const m = marges || MARGES_DEFAUT_MM;
  const actif = prereglageDe(marges);
  const ref = useRef(null);
  useEffect(() => {
    const touche = (e) => { if (e.key === 'Escape') onFermer(); };
    const dehors = (e) => { if (ref.current && !ref.current.contains(e.target) && !(e.target.closest && e.target.closest('.mf'))) onFermer(); };
    window.addEventListener('keydown', touche);
    window.addEventListener('pointerdown', dehors, true);
    return () => { window.removeEventListener('keydown', touche); window.removeEventListener('pointerdown', dehors, true); };
  }, [onFermer]);
  const changer = (cote, v, fin = true) => onChange({ ...m, [cote]: bornerMm(v) }, fin);
  return (
    <div ref={ref} className="mep-panneau" role="dialog" aria-label="Mise en page">
      <div className="mep-tete">
        <span className="mep-titre">Mise en page</span>
        <button type="button" className="icon-btn sm" onClick={onFermer} title="Fermer (Échap)" aria-label="Fermer"><Icon name="x" size={14} /></button>
      </div>
      <div className="mep-prereglages" role="group" aria-label="Préréglages">
        {PREREGLAGES.map((p) => (
          <button key={p.id} type="button" className={'mep-pre' + (actif === p.id ? ' actif' : '')} aria-pressed={actif === p.id}
            onClick={() => onChange({ ...p.marges }, true)} title={COTES.map(({ id, label }) => `${label} ${fmt(p.marges[id])} mm`).join(' · ')}>
            <span className={'mep-pre-ic ' + p.id} aria-hidden="true"><i /></span>{p.label}
          </button>
        ))}
      </div>
      <div className="mep-cotes">
        {COTES.map(({ id, label }) => (
          <label key={id} className="mep-cote">
            <span className="mep-cote-nom">{label}</span>
            <input type="range" min={MARGE_MIN_MM} max={MARGE_MAX_MM} step="0.5" value={m[id]} aria-label={`Marge ${label.toLowerCase()} (mm)`}
              onChange={(e) => changer(id, e.target.value, false)} onPointerUp={(e) => changer(id, e.target.value, true)} onKeyUp={(e) => changer(id, e.target.value, true)} />
            <span className="mep-champ">
              <input type="number" min={MARGE_MIN_MM} max={MARGE_MAX_MM} step="0.5" value={m[id]} aria-label={`Marge ${label.toLowerCase()} en millimètres`}
                onChange={(e) => { if (e.target.value !== '') changer(id, e.target.value, true); }} />
              <i>mm</i>
            </span>
          </label>
        ))}
      </div>
      <div className="mep-pied">Toutes les pages · mémorisé avec le document · repris par l’export PDF</div>
    </div>
  );
}

/** règles de la page en édition : `largeur` / `hauteur` en px affichés, `echelle` = px par unité */
export function ReglesMarges({ marges, largeur, hauteur, echelle, onChange }) {
  const m = marges || MARGES_DEFAUT_MM;
  const pxMm = UNITES_PAR_MM * echelle;
  const [geste, setGeste] = useState(null); // { cote, valeur }
  const glisser = (e, cote) => {
    if (e.button && e.button !== 0) return;
    e.preventDefault(); e.stopPropagation(); // le texte garde son curseur (la barre et les règles restent)
    const depart = { x: e.clientX, y: e.clientY, v: m[cote] };
    const sens = cote === 'droite' || cote === 'bas' ? -1 : 1;
    const horiz = cote === 'gauche' || cote === 'droite';
    let v = depart.v;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    const cible = e.currentTarget;
    const move = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      const d = ((horiz ? ev.clientX - depart.x : ev.clientY - depart.y) / pxMm) * sens;
      v = bornerMm(Math.round((depart.v + d) * 2) / 2); // pas de 0,5 mm
      setGeste({ cote, valeur: v });
      onChange({ ...m, [cote]: v }, false);
    };
    const fin = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      cible.removeEventListener('pointermove', move); cible.removeEventListener('pointerup', fin); cible.removeEventListener('pointercancel', fin);
      setGeste(null);
      onChange({ ...m, [cote]: v }, true);
    };
    cible.addEventListener('pointermove', move); cible.addEventListener('pointerup', fin); cible.addEventListener('pointercancel', fin);
  };
  const poignee = (cote, style, titre) => (
    <span className={'rg-poignee ' + cote + (geste && geste.cote === cote ? ' active' : '')} style={style}
      role="slider" aria-label={titre} aria-valuemin={MARGE_MIN_MM} aria-valuemax={MARGE_MAX_MM} aria-valuenow={m[cote]} tabIndex={-1}
      title={`${titre} : ${fmt(m[cote])} mm — glisser pour régler`} onPointerDown={(e) => glisser(e, cote)}>
      {geste && geste.cote === cote && <b className="rg-valeur">{fmt(geste.valeur)} mm</b>}
    </span>
  );
  const ticks = { '--pas': `${pxMm * 10}px` }; // une graduation par centimètre
  return (
    <div className="rg-regles" aria-label="Règles de la page">
      <div className="rg-regle rg-h" style={{ ...ticks }}>
        <i className="rg-marge" style={{ left: 0, width: m.gauche * pxMm }} />
        <i className="rg-marge" style={{ right: 0, width: m.droite * pxMm }} />
        {poignee('gauche', { left: m.gauche * pxMm }, 'Marge gauche')}
        {poignee('droite', { left: largeur - m.droite * pxMm }, 'Marge droite')}
      </div>
      <div className="rg-regle rg-v" style={{ ...ticks }}>
        <i className="rg-marge" style={{ top: 0, height: m.haut * pxMm }} />
        <i className="rg-marge" style={{ bottom: 0, height: m.bas * pxMm }} />
        {poignee('haut', { top: m.haut * pxMm }, 'Marge du haut')}
        {poignee('bas', { top: hauteur - m.bas * pxMm }, 'Marge du bas')}
      </div>
    </div>
  );
}
