/* ============================================================
   MedRevise — extraction du texte d'un PDF, côté navigateur (pdf.js).
   Permet de déposer un PDF et de générer les questions sans copier-coller.
   (PDF "texte". Un PDF scanné/image n'a pas de texte → retour vide.)
   ============================================================ */
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export async function extractPdfText(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it) => (it.str || '')).join(' '));
  }
  return pages.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
