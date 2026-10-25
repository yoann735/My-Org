/* ============================================================
   MedRevise — LISTE DES RÉSULTATS de la recherche du lecteur (25/10, docs/compte-rendu-apprentissage-v2-recherche-tags.md).
   Sous le champ de recherche (ordinateur et tablette) : « 3 sur 12 », puis chaque occurrence avec sa page et un extrait
   (la phrase trouvée en évidence). Un clic y va ; la courante est marquée et suit ↑ ↓ / Entrée.
   ============================================================ */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '../../styles/recherche-lecteur.css';

export const compteurRecherche = (searching, matches, activeMatch) => (searching ? '…' : matches.length ? `${activeMatch + 1} sur ${matches.length}` : 'Aucun résultat');

export function ResultatsRecherche({ matches, activeMatch, onAller, max = 300 }) {
  const ref = useRef(null), sonde = useRef(null);
  /* posée sur document.body, en position fixe sous le champ : ni la barre (overflow) ni le panneau latéral ne la coupent */
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const placer = () => {
      const a = sonde.current && sonde.current.parentElement;
      if (!a) return;
      const r = a.getBoundingClientRect(), L = Math.min(400, window.innerWidth - 16);
      setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.right - L, window.innerWidth - L - 8)), width: L, maxHeight: Math.max(160, Math.min(440, window.innerHeight - r.bottom - 20)) });
    };
    placer();
    window.addEventListener('resize', placer); window.addEventListener('scroll', placer, true);
    return () => { window.removeEventListener('resize', placer); window.removeEventListener('scroll', placer, true); };
  }, [matches.length]);
  useEffect(() => {
    const el = ref.current && ref.current.querySelector('.rch-item.actif');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeMatch]);
  if (!matches.length) return null;
  return (<>
    <span ref={sonde} className="rch-sonde" aria-hidden="true" />
    {pos && createPortal(
    <div ref={ref} className="rch-liste" role="listbox" style={pos} aria-label="Résultats de la recherche"
      onMouseDown={(e) => e.preventDefault() /* le champ garde le focus (Entrée continue) */}>
      {matches.slice(0, max).map((m, i) => (
        <button key={i} type="button" role="option" aria-selected={i === activeMatch} className={'rch-item' + (i === activeMatch ? ' actif' : '')}
          data-resultat={i} onClick={() => onAller(i)}>
          <span className="rch-page tnum">p. {m.pageAff || m.page || '?'}</span>
          <span className="rch-extrait">{m.extrait ? <>{m.extrait.avant}<mark>{m.extrait.trouve}</mark>{m.extrait.apres}</> : '…'}</span>
        </button>
      ))}
      {matches.length > max && <div className="rch-plus hint">… et {matches.length - max} autres (affine la recherche)</div>}
    </div>, document.body)}
  </>);
}
