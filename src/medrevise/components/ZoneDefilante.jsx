/* ============================================================
   MedRevise — zone défilante d'une flashcard (06/10, docs/compte-rendu-flashcards-mobile.md).
   Une carte ne coupe JAMAIS son contenu : si le texte dépasse la hauteur
   disponible, il défile À L'INTÉRIEUR de la carte, avec un dégradé discret en bas
   tant qu'il reste quelque chose à lire. Contenu court : centré verticalement
   (marges automatiques — un contenu long commence en haut, jamais rogné au-dessus,
   contrairement à `justify-content: center`).
   Un défilement au doigt ne déclenche pas le retournement : le navigateur
   n'émet pas de `click` après un geste de défilement.
   ============================================================ */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export function ZoneDefilante({ className = '', children }) {
  const ref = useRef(null);
  const [plus, setPlus] = useState(false);
  const mesurer = () => {
    const el = ref.current;
    if (el) setPlus(el.scrollHeight - el.scrollTop - el.clientHeight > 2);
  };
  // mesure immédiate (un onglet caché gèle ResizeObserver), puis à chaque changement de taille
  useLayoutEffect(mesurer);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);
  return (
    <div className={'zd' + (plus ? ' zd-plus' : '') + (className ? ' ' + className : '')}>
      <div className="zd-defil" ref={ref} onScroll={mesurer}>
        <div className="zd-contenu">{children}</div>
      </div>
    </div>
  );
}

/* taille de police selon la longueur du texte : court → grand, long → taille
   confortable (jamais sous 16 px sur mobile, voir medrevise-mobile.css). */
export function classeLongueur(...textes) {
  const n = textes.reduce((s, t) => s + (typeof t === 'string' ? t.length : 0), 0);
  return n <= 90 ? 'lg-court' : n <= 260 ? 'lg-moyen' : 'lg-long';
}
