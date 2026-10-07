/* ============================================================
   MedRevise — POSITION DE LECTURE d'un document de notes (07/10).

   Même principe que le PDF (lib/positionLecture.js), mais dans un flux de texte : on
   retient le BLOC (enfant direct du document ProseMirror) en haut de la zone visible et le
   décalage dans ce bloc (0–1 de sa hauteur) — indépendant de la largeur de l'écran.
   À l'ouverture, la zone reste masquée (`attente`) jusqu'à ce que la position soit posée.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';

export function usePositionDocument({ ficheId, editeur, conteneurRef, lirePosition, ecrirePosition }) {
  const [attente, setAttente] = useState(true);
  const pret = useRef(false);
  const minuteur = useRef(null);

  const blocs = () => (editeur && editeur.view && editeur.view.dom ? [...editeur.view.dom.children] : []);
  const sauver = () => {
    const el = conteneurRef.current;
    if (!pret.current || !el || !editeur) return;
    const top = el.scrollTop, haut = el.getBoundingClientRect().top;
    const l = blocs();
    let i = 0;
    for (let k = 0; k < l.length; k++) { if (l[k].getBoundingClientRect().top - haut + top <= top + 0.5) i = k; else break; }
    const b = l[i];
    if (!b) return;
    const debut = b.getBoundingClientRect().top - haut + top;
    const h = Math.max(1, b.getBoundingClientRect().height);
    ecrirePosition(ficheId, { kind: 'doc', bloc: i, fraction: +Math.max(0, Math.min(1, (top - debut) / h)).toFixed(4) });
  };
  const sauverRef = useRef(sauver); sauverRef.current = sauver;

  // restauration, une fois l'éditeur chargé
  useEffect(() => {
    if (!editeur) return undefined;
    let vivant = true;
    pret.current = false;
    setAttente(true);
    lirePosition(ficheId).then((p) => {
      if (!vivant) return;
      const el = conteneurRef.current;
      requestAnimationFrame(() => {
        if (!vivant) return;
        if (p && p.kind === 'doc' && el) {
          const l = blocs();
          const b = l[Math.min(l.length - 1, Math.max(0, Number(p.bloc) || 0))];
          if (b) {
            const haut = el.getBoundingClientRect().top;
            const debut = b.getBoundingClientRect().top - haut + el.scrollTop;
            el.scrollTop = Math.max(0, debut + (Number(p.fraction) || 0) * b.getBoundingClientRect().height);
          }
        }
        pret.current = true;
        setAttente(false);
      });
    });
    return () => { vivant = false; };
  }, [editeur, ficheId]); // eslint-disable-line react-hooks/exhaustive-deps

  // enregistrement : arrêt du défilement (500 ms), onglet caché, fermeture
  useEffect(() => {
    const el = conteneurRef.current;
    if (!el) return undefined;
    const planifier = () => { clearTimeout(minuteur.current); minuteur.current = setTimeout(() => sauverRef.current(), 500); };
    const cache = () => { if (document.visibilityState === 'hidden') { clearTimeout(minuteur.current); sauverRef.current(); } };
    el.addEventListener('scroll', planifier, { passive: true });
    document.addEventListener('visibilitychange', cache);
    window.addEventListener('pagehide', cache);
    return () => {
      el.removeEventListener('scroll', planifier);
      document.removeEventListener('visibilitychange', cache);
      window.removeEventListener('pagehide', cache);
      clearTimeout(minuteur.current);
      sauverRef.current();
    };
  }, [editeur, ficheId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { attente };
}
