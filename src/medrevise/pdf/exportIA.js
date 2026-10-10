/* ============================================================
   MedRevise — EXPORT SPÉCIAL IA (10/10 soir, docs/compte-rendu-images-surlignage-json.md).

   Pour faire corriger les textes des boîtes par une IA hors de l'app : l'IA reçoit
   - annotations.json : { course, page?, instructions, boxes: [{ id, ref, text }] } ;
   - un visuel par page : le PDF annoté (MÊME rendu que « Exporter en PDF annoté »,
     pdf/exportAnnote.js) avec, en plus, le repère (ref) de chaque boîte dans un coin
     de la boîte — visuel.pdf + page-XX.png (2× la taille de page) ;
   - LISEZMOI.txt : le format attendu en retour.
   Tout est rassemblé dans un .zip (lib/zipSimple.js). L'export PDF annoté normal et
   l'import existant ne changent pas ; les boîtes ne sont jamais modifiées.
   ============================================================ */
import { PDFDocument } from 'pdf-lib';
import { exporterDepuisBlob } from './exportAnnote.js';
import { openPdf } from './pdfjsSetup.js';
import { boitesOrdonnees, refsCourtes, construireExportIA, LISEZMOI_IA } from '../lib/textesAnnotations.js';
import { creerZip } from '../lib/zipSimple.js';

export const ECHELLE_PNG = 2; // 2× la taille de page

const nomFichier = (s) => String(s || 'cours').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'cours';
const deux = (n) => String(n).padStart(2, '0');

/** une page d'un PDF (octets) → PNG à `echelle` × sa taille */
async function pngDePage(doc, numero, echelle = ECHELLE_PNG) {
  const page = await doc.getPage(numero);
  const vp = page.getViewport({ scale: echelle });
  const cv = document.createElement('canvas');
  cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return new Promise((ok) => cv.toBlob(ok, 'image/png'));
}

/**
 * @param {object} o
 * @param {string} o.titre        nom du cours
 * @param {string} o.pdfId        blob du PDF du cours (lu, jamais réécrit)
 * @param {object[]} o.highlights surlignages du cours
 * @param {object[]} o.annotations annotations du cours (texte en cours de frappe compris)
 * @param {Array} o.ordrePages     clés des pages affichées, dans l'ordre (= pages du PDF exporté)
 * @param {'page'|'cours'} o.portee
 * @param {number} o.pageIndex     0… (portée « page »)
 */
export async function preparerExportIA({ titre, pdfId, highlights, annotations, ordrePages, portee, pageIndex = 0 }) {
  const toutes = boitesOrdonnees(annotations, ordrePages);
  const refs = refsCourtes(toutes); // repères calculés sur TOUT le cours : un même repère partout
  const cles = portee === 'page' ? [ordrePages[pageIndex]] : ordrePages;
  const boites = boitesOrdonnees(annotations, cles);
  const reperes = new Map(boites.map((b) => [b.id, refs.get(b.id)]));
  const { octets, bilan } = await exporterDepuisBlob(pdfId, highlights, annotations, { reperes });
  // portée « page » : le PDF exporté ne garde que cette page (copie, rien n'est réécrit)
  let pdfVisuel = octets, numeros = ordrePages.map((_, i) => i + 1);
  let etiquettes = bilan.reperes || [];
  if (portee === 'page') {
    const src = await PDFDocument.load(octets);
    const un = await PDFDocument.create();
    const [p] = await un.copyPages(src, [pageIndex]);
    un.addPage(p);
    pdfVisuel = await un.save();
    numeros = [pageIndex + 1];
    etiquettes = etiquettes.filter((e) => e.page === pageIndex).map((e) => ({ ...e, page: 0 }));
  }
  const doc = await openPdf(pdfVisuel.slice ? pdfVisuel.slice() : pdfVisuel);
  const pngs = [];
  for (let i = 0; i < doc.numPages; i++) {
    const blob = await pngDePage(doc, i + 1);
    pngs.push({ nom: `page-${deux(numeros[i])}.png`, numero: numeros[i], blob });
  }
  try { doc.destroy(); } catch (e) { /* ignore */ }
  const json = construireExportIA({ cours: titre, page: portee === 'page' ? pageIndex + 1 : null, boites, refs });
  const base = nomFichier(titre) + '-export-IA' + (portee === 'page' ? '-p' + deux(pageIndex + 1) : '');
  return { json, pdf: pdfVisuel, pngs, etiquettes, base, nb: boites.length };
}

/** l'archive : annotations.json, LISEZMOI.txt, visuel.pdf, page-XX.png */
export async function zipExportIA(e) {
  const fichiers = [
    { nom: 'annotations.json', donnees: JSON.stringify(e.json, null, 2) },
    { nom: 'LISEZMOI.txt', donnees: LISEZMOI_IA },
    { nom: 'visuel.pdf', donnees: e.pdf instanceof Uint8Array ? e.pdf : new Uint8Array(e.pdf) },
  ];
  for (const p of e.pngs) fichiers.push({ nom: p.nom, donnees: new Uint8Array(await p.blob.arrayBuffer()) });
  return creerZip(fichiers);
}
