/* ============================================================
   MedRevise — TAILLE DU TEXTE (22/10, docs/compte-rendu-tableau-flashcards.md §4) : préréglages S / M / L / XL avec
   un aperçu, et un réglage fin. La valeur est un POURCENTAGE DE LA LARGEUR DE PAGE (pdfShared.js#TAILLES_TEXTE).
   Un bouton de la mini barre (pdf/Selection.jsx) ; le panneau s'ouvre dessous.
   ============================================================ */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TAILLES_TEXTE, TAILLE_TEXTE_MIN, TAILLE_TEXTE_MAX, presetTaille } from './pdfShared.js';

const fmt = (v) => (Math.round(v * 100) / 100).toLocaleString('fr-FR') + ' %';

export function BoutonTailleTexte({ valeur, onChange, onApercu = null }) {
  const [ouvert, setOuvert] = useState(false);
  const [fin, setFin] = useState(valeur);
  const ref = useRef(null);
  const popRef = useRef(null);
  const [decale, setDecale] = useState(0); // décalage horizontal : le panneau reste dans l'écran
  useEffect(() => { setFin(valeur); }, [valeur]);
  useLayoutEffect(() => {
    if (!ouvert || !popRef.current) { setDecale(0); return; }
    // dans la zone visible du lecteur (la zone de défilement rogne ce qui dépasse), sinon dans l'écran
    const r = popRef.current.getBoundingClientRect(), m = 8;
    const z = popRef.current.closest('.pdfr-scroll');
    const zr = z ? z.getBoundingClientRect() : { left: 0, right: window.innerWidth };
    const g = Math.max(0, zr.left) + m, dr = Math.min(window.innerWidth, zr.right) - m;
    const d = r.left < g ? g - r.left : r.right > dr ? dr - r.right : 0;
    if (d) setDecale((x) => x + d);
  }, [ouvert]);
  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOuvert(false); if (onApercu) onApercu(null); } };
    const clavier = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOuvert(false); if (onApercu) onApercu(null); } };
    window.addEventListener('pointerdown', dehors, true);
    window.addEventListener('keydown', clavier, true);
    return () => { window.removeEventListener('pointerdown', dehors, true); window.removeEventListener('keydown', clavier, true); };
  }, [ouvert, onApercu]);
  const p = presetTaille(valeur);
  const exact = TAILLES_TEXTE.some((t) => Math.abs(t.v - valeur) < 0.005);
  const choisir = (v) => { if (onApercu) onApercu(null); onChange(+v.toFixed(2)); };
  return (
    <span className="tt" ref={ref}>
      <button type="button" className={'nb-act tt-bouton' + (ouvert ? ' actif' : '')} data-option="taille" aria-label="Taille du texte"
        title={`Taille du texte : ${exact ? p.id + ' · ' : ''}${fmt(valeur)} de la largeur de la page`}
        onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); setOuvert((o) => !o); }}>
        <span className="tt-aa" aria-hidden="true">A<small>a</small></span>{exact && <span className="tt-id">{p.id}</span>}
      </button>
      {ouvert && (
        <div ref={popRef} style={decale ? { marginLeft: decale } : undefined} className="tt-pop mb-pop" role="dialog" aria-label="Taille du texte" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => { if (e.target.tagName !== 'INPUT') e.preventDefault(); }}>
          <div className="tt-presets">
            {TAILLES_TEXTE.map((t) => (
              <button key={t.id} type="button" data-taille={t.id} className={'tt-preset' + (Math.abs(t.v - valeur) < 0.005 ? ' actif' : '')}
                title={`${t.id} — ${fmt(t.v)} de la largeur de la page`} onClick={(e) => { e.stopPropagation(); choisir(t.v); }}>
                <span className="tt-apercu" style={{ fontSize: 9 + t.v * 9 }}>Aa</span><span className="tt-nom">{t.id}</span>
              </button>
            ))}
          </div>
          <label className="tt-fin">
            <input type="range" min={TAILLE_TEXTE_MIN} max={TAILLE_TEXTE_MAX} step="0.05" value={fin} aria-label="Réglage fin de la taille du texte"
              onChange={(e) => { const v = parseFloat(e.target.value); setFin(v); if (onApercu) onApercu(v); }}
              onPointerUp={() => choisir(fin)} onKeyUp={(e) => { if (/Arrow|Home|End|Page/.test(e.key)) choisir(fin); }} />
            <span className="tt-val tnum">{fmt(fin)}</span>
          </label>
          <div className="tt-aide">de la largeur de la page — la même proportion sur toutes les diapos</div>
        </div>
      )}
    </span>
  );
}
