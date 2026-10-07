/* ============================================================
   MedRevise — MENU « FICHIER » du lecteur, façon Word / Google Docs (02/10).

   Sous le nom du document, en haut à gauche. Il regroupe les actions sur le
   DOCUMENT (et non sur une annotation) qui étaient éparpillées entre la barre
   d'outils et le menu « ⋯ » : exporter (en tête, c'est la plus importante),
   renommer, insérer, items de la fiche, détacher le PDF.

   `groupes` : [{ titre, items: [{ label, icon, onClick, aide?, principal?, danger? }] }]
   Les entrées falsy sont ignorées (actions propres à une vraie fiche, etc.).
   Fermeture : Échap, clic à l'extérieur, ou après une action.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';

/* `compact` (tablette, 07/10) : le déclencheur est un bouton « … » de 44 px, et le menu
   regroupe aussi ce que l'en-tête compact n'affiche plus (disposition, thème, apps). */
export function MenuFichier({ groupes, compact = false }) {
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef(null);
  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => { if (racine.current && !racine.current.contains(e.target)) setOuvert(false); };
    const touche = (e) => { if (e.key === 'Escape') setOuvert(false); };
    window.addEventListener('pointerdown', dehors);
    window.addEventListener('keydown', touche);
    return () => { window.removeEventListener('pointerdown', dehors); window.removeEventListener('keydown', touche); };
  }, [ouvert]);
  const visibles = (groupes || []).map((g) => ({ ...g, items: (g.items || []).filter(Boolean) })).filter((g) => g.items.length);
  if (!visibles.length) return null;
  return (
    <div className="mf" ref={racine}>
      <button type="button" className={'mf-bouton' + (compact ? ' mf-compact' : '') + (ouvert ? ' ouvert' : '')} aria-haspopup="menu" aria-expanded={ouvert}
        aria-label={compact ? 'Plus — fichier, disposition, affichage' : undefined}
        onClick={() => setOuvert((v) => !v)} title={compact ? 'Fichier, disposition, affichage…' : 'Fichier — exporter, renommer, insérer…'}>
        {compact ? <Icon name="more" size={18} /> : 'Fichier'}
      </button>
      {ouvert && (
        <div className="mf-menu" role="menu">
          {visibles.map((g, gi) => (
            <div key={gi} className="mf-groupe">
              {g.titre && <div className="mf-titre">{g.titre}</div>}
              {g.items.map((it, i) => (
                <button key={i} type="button" role="menuitem"
                  className={'mf-item' + (it.principal ? ' principal' : '') + (it.danger ? ' danger' : '') + (it.actif ? ' actif' : '')}
                  onClick={() => { setOuvert(false); it.onClick(); }}>
                  <span className="mf-ic">{it.icon && <Icon name={it.icon} size={14} />}</span>
                  <span className="mf-texte">
                    <span className="mf-label">{it.label}</span>
                    {it.aide && <span className="mf-aide">{it.aide}</span>}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
