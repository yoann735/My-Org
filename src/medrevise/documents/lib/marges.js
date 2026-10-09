/* ============================================================
   MedRevise — MARGES D'UN DOCUMENT (09/10, docs/compte-rendu-pdfreader-v2.md).

   Mémorisées par document dans `notes_doc.marges` = { haut, bas, gauche, droite } en MILLIMÈTRES
   (synchronisé avec le document). Absent = marges d'avant : 56 unités de page (≈ 19,8 mm) de
   chaque côté — un document existant ne bouge pas d'un pixel.
   Le flux (pdf/DocumentFlux.jsx) travaille en UNITÉS DE PAGE : l'A4 fait 595 × 842 unités pour
   210 × 297 mm. Les marges définissent la zone utile, donc la pagination et l'export PDF.
   ============================================================ */
export const UNITES_PAR_MM = 595 / 210;
export const MARGE_DEFAUT_UNITES = 56;
export const MARGE_MIN_MM = 5;
export const MARGE_MAX_MM = 60;
const mm = (u) => Math.round((u / UNITES_PAR_MM) * 10) / 10;

export const PREREGLAGES = [
  { id: 'etroites', label: 'Étroites', marges: { haut: 12.7, bas: 12.7, gauche: 12.7, droite: 12.7 } },
  { id: 'normales', label: 'Normales', marges: { haut: mm(56), bas: mm(56), gauche: mm(56), droite: mm(56) } },
  { id: 'larges', label: 'Larges', marges: { haut: 25.4, bas: 25.4, gauche: 50.8, droite: 50.8 } },
];
export const MARGES_DEFAUT_MM = PREREGLAGES[1].marges;
export const COTES = [
  { id: 'haut', label: 'Haut' }, { id: 'bas', label: 'Bas' }, { id: 'gauche', label: 'Gauche' }, { id: 'droite', label: 'Droite' },
];

export const bornerMm = (v) => Math.max(MARGE_MIN_MM, Math.min(MARGE_MAX_MM, Math.round((Number(v) || 0) * 10) / 10));

/** marges (mm) d'un enregistrement notes_doc, complétées et bornées ; null = marges d'avant */
export function margesDe(rec) {
  const m = rec && rec.marges;
  if (!m) return null;
  return Object.fromEntries(COTES.map(({ id }) => [id, bornerMm(m[id] != null ? m[id] : MARGES_DEFAUT_MM[id])]));
}

/** marges en unités de page pour le flux (null → défaut d'avant, à l'unité près) */
export function margesUnites(margesMm) {
  if (!margesMm) return { haut: MARGE_DEFAUT_UNITES, bas: MARGE_DEFAUT_UNITES, gauche: MARGE_DEFAUT_UNITES, droite: MARGE_DEFAUT_UNITES };
  // arrondi à l'unité de page (≤ 0,18 mm) : pas de position fractionnaire, l'export imprimé
  // retombe exactement sur l'écran (test de conformité)
  return Object.fromEntries(COTES.map(({ id }) => [id, Math.round(margesMm[id] * UNITES_PAR_MM)]));
}

/** préréglage correspondant (ou null : marges personnalisées) */
export function prereglageDe(margesMm) {
  const m = margesMm || MARGES_DEFAUT_MM;
  const p = PREREGLAGES.find((x) => COTES.every(({ id }) => Math.abs(x.marges[id] - m[id]) < 0.05));
  return p ? p.id : null;
}
