/* ============================================================
   MedRevise — icône de l'onglet « Apprentissage » (entraînement en rafale) : un éclair,
   tracé Lucide « zap », mêmes attributs que shared/Icon.jsx (24 × 24, trait 2, bouts ronds).
   Locale à MedRevise : src/shared/ (commun aux deux apps) n'est pas modifié.
   ============================================================ */
export function IconeRafale({ size = 20, stroke = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 auto' }} aria-hidden="true">
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}
