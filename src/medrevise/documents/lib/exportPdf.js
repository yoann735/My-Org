/* ============================================================
   MedRevise — export d'un transcript en PDF (texte + images) via pdf-lib
   (deja present, aucune nouvelle dependance / aucun reseau). Rendu lisible :
   titres/paragraphes en Helvetica, images incrustees a la largeur utile.
   Le formatage riche fin (couleurs, gras inline) est approxime — l'objectif
   est un PDF « a joindre au chat », pas une reproduction pixel du doc.
   ============================================================ */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getBlob } from '../../lib/storage.js';

function blockText(node) {
  let s = '';
  (node.content || []).forEach((ch) => { if (ch.type === 'text') s += ch.text || ''; });
  return s.trim();
}
function deepText(node) {
  let s = '';
  const w = (n) => { if (!n) return; if (n.type === 'text') s += (n.text || '') + ' '; (n.content || []).forEach(w); };
  (node.content || []).forEach(w);
  return s.replace(/\s+/g, ' ').trim();
}

export async function exportTranscriptPdf(fiche, doc) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const M = 56, pageW = 595.28, pageH = 841.89, maxW = pageW - 2 * M;
  let page = pdf.addPage([pageW, pageH]);
  let y = pageH - M;
  const ensure = (h) => { if (y - h < M) { page = pdf.addPage([pageW, pageH]); y = pageH - M; } };

  const drawPara = (text, { size = 11, f = font, gap = 6 } = {}) => {
    if (!text) { y -= gap; return; }
    const lh = size * 1.42;
    const words = text.split(/\s+/);
    let line = '';
    const flush = () => { ensure(lh); page.drawText(line, { x: M, y: y - size, size, font: f, color: rgb(0.11, 0.11, 0.14) }); y -= lh; line = ''; };
    for (const wd of words) {
      const test = line ? line + ' ' + wd : wd;
      if (f.widthOfTextAtSize(test, size) > maxW && line) { flush(); line = wd; } else line = test;
    }
    if (line) flush();
    y -= gap;
  };

  drawPara(fiche.titre || 'Transcript', { size: 18, f: bold, gap: 10 });

  for (const b of (doc.content || [])) {
    if (b.type === 'heading') drawPara(blockText(b), { size: 14, f: bold, gap: 6 });
    else if (b.type === 'paragraph') drawPara(blockText(b), { size: 11, gap: 6 });
    else if (b.type === 'image' && b.attrs && b.attrs.blobId) {
      const blob = await getBlob(b.attrs.blobId);
      if (!blob) continue;
      const bytes = await blob.arrayBuffer();
      let img = null;
      try { img = (blob.type || '').includes('png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes); }
      catch (e) { try { img = await pdf.embedPng(bytes); } catch (e2) { img = null; } }
      if (img) {
        const scale = Math.min(1, maxW / img.width);
        const w = img.width * scale, h = img.height * scale;
        ensure(h + 10); page.drawImage(img, { x: M, y: y - h, width: w, height: h }); y -= h + 12;
      }
    } else {
      drawPara(deepText(b), { size: 11, gap: 6 });
    }
  }

  const out = await pdf.save();
  return new Blob([out], { type: 'application/pdf' });
}
