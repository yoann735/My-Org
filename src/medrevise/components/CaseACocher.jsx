/* ============================================================
   MedRevise — CASE À COCHER UNIQUE (29/10/2026, docs/compte-rendu-statut-synchro.md).
   Une seule case pour toute l'app (Apprentissage, listes de flashcards, export, séance, réglages, sélection
   multiple…) : 18 px, coins 5 px, filet de la DA ; cochée = fond d'accent + coche blanche tracée en 120 ms ;
   état partiel (tiret) ; survol et focus clavier visibles ; zone de clic ≥ 40 px sur téléphone (styles/case-a-cocher.css).
   La vraie <input type="checkbox"> reste dans le DOM (masquée visuellement) : clavier, lecteurs d'écran,
   formulaires et bancs de test la lisent comme avant (checked / indeterminate).
   ============================================================ */
import { useEffect, useRef } from 'react';
import '../../styles/case-a-cocher.css';

/** la boîte seule (décor) — pour une case DANS un bouton qui gère déjà le clic (critères d'exercice mobile) */
export function BoiteCase({ checked = false, partiel = false }) {
  return (
    <span className={'mr-case-boite' + (checked ? ' coche' : '') + (partiel && !checked ? ' partiel' : '')} aria-hidden="true" data-coche={checked ? '1' : partiel ? 'partiel' : '0'}>
      <svg viewBox="0 0 12 12" className="mr-case-coche"><path d="M2.4 6.3 4.9 8.7 9.6 3.4" /></svg>
      <span className="mr-case-tiret" />
    </span>
  );
}

/**
 * @param {{ checked: boolean, partiel?: boolean, onChange?: (coche: boolean, e) => void, disabled?: boolean,
 *   children?: any, className?: string, title?: string, ariaLabel?: string, haut?: boolean, inputProps?: object }} p
 *   `haut` : case alignée sur la 1ʳᵉ ligne d'un libellé multiligne (sinon centrée) ;
 *   `texteAvant` : libellé à gauche, case à droite (lignes de réglage).
 */
export function CaseACocher({ checked, partiel = false, onChange, disabled = false, children, className = '', title, ariaLabel, haut = false, texteAvant = false, inputProps = {}, onClick, ...data }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!partiel && !checked; }, [partiel, checked]);
  return (
    <label className={'mr-case' + (haut ? ' haut' : '') + (disabled ? ' inactive' : '') + (children ? '' : ' seule') + (className ? ' ' + className : '')} title={title} onClick={onClick} {...data}>
      <input ref={ref} type="checkbox" {...inputProps} className={'mr-case-input' + (inputProps.className ? ' ' + inputProps.className : '')} checked={!!checked} disabled={disabled} aria-label={ariaLabel}
        onChange={(e) => onChange && onChange(e.target.checked, e)} />
      {texteAvant && children}
      <BoiteCase checked={!!checked} partiel={partiel} />
      {!texteAvant && children != null && children !== false && <span className="mr-case-texte">{children}</span>}
    </label>
  );
}
