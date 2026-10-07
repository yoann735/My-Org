/* ============================================================
   MedRevise — POSITION DE LECTURE (07/10, docs/compte-rendu-position-document-tablette.md).

   Un enregistrement par cours dans le store `reading_position` (synchronisé, écriture
   regroupée : local aussitôt, cloud au plus une fois toutes les 30 s — lib/storage.js
   ecrireRegroupe) :
     PDF      { id:'rp:'+ficheId, ficheId, kind:'pdf', cle, index, fraction, scale,
                zoomManuel, disposition, empreinte }
     document { id, ficheId, kind:'doc', bloc, fraction }
   `cle` = numéro de page du PDF (ou id d'une page ajoutée), `fraction` = décalage du HAUT
   de la zone visible dans cette page (0–1 de la hauteur de page, jamais des pixels : la
   position tient quel que soit l'écran et le zoom). `empreinte` = pdfId + nombre de pages :
   PDF remplacé ou nombre de pages différent → la position est ignorée (page 1, sans erreur).
   ============================================================ */
import { getOne, ecrireRegroupe } from './storage.js';

export const idPosition = (ficheId) => 'rp:' + ficheId;
export const empreintePdf = (pdfId, nbPages) => (pdfId && nbPages ? `${pdfId}:${nbPages}` : null);

export async function lirePosition(ficheId) {
  if (!ficheId) return null;
  try { return (await getOne('reading_position', idPosition(ficheId))) || null; } catch (e) { return null; }
}

export function ecrirePosition(ficheId, pos) {
  if (!ficheId || !pos) return Promise.resolve(null);
  return ecrireRegroupe('reading_position', { ...pos, id: idPosition(ficheId), ficheId }).catch(() => null);
}

/** Position du haut de la zone visible : { index, fraction } (fraction 0–1 dans la page). */
export function positionDepuisDefilement(scrollTop, offsets, hauteurs) {
  if (!offsets.length) return null;
  let i = 0;
  while (i + 1 < offsets.length && offsets[i + 1] <= scrollTop + 0.5) i += 1;
  const h = hauteurs[i] || 1;
  return { index: i, fraction: Math.max(0, Math.min(1, (scrollTop - offsets[i]) / h)) };
}
