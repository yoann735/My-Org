/* ============================================================
   MedRevise — CHAMP DE RENOMMAGE de la Bibliothèque (arbre, grille, liste) — 08/10,
   docs/compte-rendu-undo-ocr-export.md.

   Le curseur sautait en fin de texte à chaque frappe : l'ancien champ était un composant
   DÉFINI DANS le rendu de la Bibliothèque (`const RenameInput = () => <input …/>`). Chaque
   frappe changeait l'état du parent → nouveau type de composant → React DÉMONTAIT puis
   remontait l'<input> : `autoFocus` le recréait curseur en fin de texte (et une synchro qui
   recharge la Bibliothèque faisait de même en pleine saisie). En grille, aucun champ
   n'était même affiché.

   Ici : composant de module (identité stable), texte LOCAL pendant l'édition — le parent
   et la synchro peuvent se re-rendre, le champ n'est pas touché ; le modèle n'est écrit
   qu'à la validation (Entrée ou perte du focus) ; Échap annule ; tout le texte est
   sélectionné UNE seule fois, à l'ouverture.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';

export function ChampRenommer({ initial = '', onValider, onAnnuler, className = 'srcmgr-input', ariaLabel = 'Nouveau nom' }) {
  const [texte, setTexte] = useState(initial);
  const ref = useRef(null);
  const fini = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.select(); // une seule fois, à l'ouverture
  }, []);
  const valider = () => {
    if (fini.current) return;
    fini.current = true;
    const t = texte.trim();
    if (t && t !== initial) onValider(t); else onAnnuler();
  };
  const annuler = () => { if (fini.current) return; fini.current = true; onAnnuler(); };
  return (
    <input ref={ref} className={className} value={texte} aria-label={ariaLabel} spellCheck={false}
      onChange={(e) => setTexte(e.target.value)}
      // le champ vit dans des lignes / cartes cliquables et glissables : rien ne doit remonter
      onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); valider(); }
        else if (e.key === 'Escape') { e.preventDefault(); annuler(); }
      }}
      onBlur={valider} />
  );
}
