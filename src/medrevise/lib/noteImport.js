/* ============================================================
   MedRevise — PRISE DE NOTES : lecture d'un dépôt de fichiers → un document.

   Extrait de components/ImportNote.jsx pour que la PAGE puisse importer en
   ZÉRO CLIC : on glisse, ça s'ouvre. Le composant ne garde que le seul cas qui
   demande vraiment une confirmation — plusieurs images, dont il faut valider
   l'ordre des pages.

   Deux fonctions, une pure et une qui écrit :
     analyserFichiers(liste) → ce que c'est, ou pourquoi c'est refusé ;
     importerNote({...})     → putBlob (+ conversion image→PDF) puis createNote.
   ============================================================ */
import { putBlob } from './storage.js';
import { titreFromFilename } from './fileTitre.js';
import { createNote } from './notes.js';
import { estImage, ordonnerImages, imagesToPdf } from './imageToPdf.js';

export const estPdf = (f) => !!f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''));
export const estBureautique = (f) => /\.(docx?|pptx?|odt|odp|pages|key)$/i.test((f && f.name) || '');

/** Un .docx/.pptx ne se convertit pas proprement hors ligne dans un navigateur :
    on le REFUSE en le nommant et en disant quoi faire, plutôt que d'échouer à moitié.
    @returns {{ok:true, kind:'pdf'|'images', fichiers:File[], titre:string} | {ok:false, erreur:string}} */
export function analyserFichiers(liste) {
  const recus = [...(liste || [])].filter(Boolean);
  if (!recus.length) return { ok: false, erreur: 'Aucun fichier reçu.' };

  const bureau = recus.find(estBureautique);
  if (bureau) return { ok: false, erreur: `« ${bureau.name} » n'est pas lisible ici : ce format ne se convertit pas proprement hors ligne. Exporte-le en PDF (Fichier → Exporter au format PDF), puis dépose le PDF.` };

  const inconnu = recus.find((f) => !estPdf(f) && !estImage(f));
  if (inconnu) return { ok: false, erreur: `« ${inconnu.name} » n'est pas accepté. Formats : PDF, ou images (PNG, JPEG, WebP…).` };

  const pdfs = recus.filter(estPdf);
  const images = recus.filter((f) => !estPdf(f));
  if (pdfs.length && images.length) return { ok: false, erreur: 'Dépose soit un PDF, soit des images — pas les deux à la fois.' };
  if (pdfs.length > 1) return { ok: false, erreur: 'Un seul PDF à la fois.' };

  const fichiers = pdfs.length ? pdfs : ordonnerImages(images);
  return { ok: true, kind: pdfs.length ? 'pdf' : 'images', fichiers, titre: titreFromFilename(fichiers[0].name) };
}

/** Un dépôt demande-t-il une confirmation ? UNIQUEMENT plusieurs images, dont
    l'ordre des pages doit être validé. Tout le reste s'importe et s'ouvre seul. */
export const demandeConfirmation = (lu) => lu.ok && lu.kind === 'images' && lu.fichiers.length > 1;

export async function importerNote({ kind, fichiers, titre }) {
  if (kind === 'pdf') {
    const pdfId = await putBlob(fichiers[0]);
    return createNote({ titre, pdfId, pdfName: fichiers[0].name, origine: 'pdf' });
  }
  const blob = await imagesToPdf(fichiers);   // peut lever (image non décodable)
  const pdfId = await putBlob(blob);
  return createNote({ titre, pdfId, pdfName: `${(titre || 'document').trim()}.pdf`, origine: 'image' });
}
