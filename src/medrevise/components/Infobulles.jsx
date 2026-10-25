/* ============================================================
   MedRevise — INFOBULLES (25/10, docs/compte-rendu-apprentissage-v2-recherche-tags.md §4). UN composant, monté une fois
   par shell (MedReviseApp.jsx) : au survol (souris ou stylet, jamais au doigt) de toute commande — icônes de la barre
   principale, des sous-barres, des mini barres d'objets, du menu Tableau, du dock de couleurs, du Transcript, du tableau
   Miro… — son nom s'affiche après 400 ms dans une bulle à la DA de l'app, avec le raccourci clavier s'il existe.
   Source du texte : l'attribut `title` (retiré le temps du survol pour que le navigateur n'affiche pas aussi le sien,
   puis remis tel quel), sinon `aria-label`. Aucune commande n'a donc besoin de code en plus : un `title` suffit.
   Le raccourci est lu à la fin du texte : « (⌘F) », « · ⌘1 », « (Échap) », « (Entrée) »…
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '../../styles/infobulles.css';
import { separerRaccourci } from '../lib/infobulles.js';
export { separerRaccourci };

export const DELAI_INFOBULLE = 400;
const CIBLES = 'button, [role="button"], [role="tab"], [role="radio"], [role="menuitem"], [role="option"], select, label, a[href], .sc-cellule, .scw-cellule';
const texteDe = (el) => (el.getAttribute('data-infobulle') || el.getAttribute('title') || el.getAttribute('aria-label') || '').trim();

export function Infobulles() {
  const [bulle, setBulle] = useState(null); // { texte, raccourci, x, y, dessous }
  const etat = useRef({ el: null, minuteur: 0 });
  useEffect(() => {
    const rendre = (el) => { // remet le title retiré
      if (el && el.hasAttribute('data-infobulle')) {
        if (!el.hasAttribute('title')) el.setAttribute('title', el.getAttribute('data-infobulle'));
        el.removeAttribute('data-infobulle');
      }
    };
    const cacher = () => {
      clearTimeout(etat.current.minuteur);
      rendre(etat.current.el);
      etat.current.el = null;
      setBulle(null);
    };
    const survol = (e) => {
      if (e.pointerType === 'touch') return;
      const el = e.target && e.target.closest ? e.target.closest(CIBLES) : null;
      if (el === etat.current.el) return;
      cacher();
      if (!el || el.matches('input, textarea') || el.closest('[data-sans-infobulle]')) return;
      const t = texteDe(el);
      if (!t) return;
      // le title du navigateur ne s'affiche pas en plus : il est mis de côté le temps du survol
      if (el.hasAttribute('title')) { el.setAttribute('data-infobulle', el.getAttribute('title')); el.removeAttribute('title'); }
      etat.current.el = el;
      etat.current.minuteur = setTimeout(() => {
        if (!el.isConnected || etat.current.el !== el) return;
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) return;
        const { texte, raccourci } = separerRaccourci(texteDe(el));
        const dessous = r.bottom + 44 < window.innerHeight;
        setBulle({ texte, raccourci, x: r.left + r.width / 2, y: dessous ? r.bottom + 6 : r.top - 6, dessous });
      }, DELAI_INFOBULLE);
    };
    const sortie = (e) => { if (etat.current.el && (!e.relatedTarget || !etat.current.el.contains(e.relatedTarget))) cacher(); };
    document.addEventListener('pointerover', survol, true);
    document.addEventListener('pointerout', sortie, true);
    document.addEventListener('pointerdown', cacher, true);
    document.addEventListener('keydown', cacher, true);
    window.addEventListener('scroll', cacher, true);
    window.addEventListener('blur', cacher);
    return () => {
      cacher();
      document.removeEventListener('pointerover', survol, true);
      document.removeEventListener('pointerout', sortie, true);
      document.removeEventListener('pointerdown', cacher, true);
      document.removeEventListener('keydown', cacher, true);
      window.removeEventListener('scroll', cacher, true);
      window.removeEventListener('blur', cacher);
    };
  }, []);
  // la bulle reste dans l'écran (mesurée une fois peinte)
  const ref = useRef(null);
  const [decal, setDecal] = useState(0);
  useEffect(() => {
    if (!bulle || !ref.current) { setDecal(0); return; }
    const r = ref.current.getBoundingClientRect();
    setDecal(r.left < 6 ? 6 - r.left : r.right > window.innerWidth - 6 ? window.innerWidth - 6 - r.right : 0);
  }, [bulle]);
  if (!bulle) return null;
  return createPortal(
    <div ref={ref} className={'infobulle' + (bulle.dessous ? ' dessous' : ' dessus')} role="tooltip" data-infobulle-visible=""
      style={{ left: bulle.x + decal, top: bulle.y }}>
      <span className="infobulle-texte">{bulle.texte}</span>
      {bulle.raccourci && <kbd className="infobulle-kbd">{bulle.raccourci}</kbd>}
    </div>, document.body);
}
