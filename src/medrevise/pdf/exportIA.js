/* ============================================================
   MedRevise — EXPORT SPÉCIAL IA (10/10 soir ; PDF unique le 11/10,
   docs/compte-rendu-images-surlignage-json.md « Export IA en PDF »).

   Pour faire corriger les textes des boîtes par une IA hors de l'app. Une SOURCE commune
   (preparerSourceIA) : le PDF annoté vectoriel (MÊME rendu que « Exporter en PDF annoté »,
   pdf/exportAnnote.js) avec le repère (ref) de chaque boîte dans un coin de la boîte, les
   boîtes { id, ref, text } et annotations.json. Puis, page par page (progression, annulable) :
   - pdfIA : UN fichier `<cours>-export-ia.pdf` — chaque page est l'IMAGE de la page annotée
     (150 dpi, JPEG qualité 85, au format de la page d'origine ; repli à 120 dpi si le poids
     dépasse 1 Mo par page ou 40 Mo par cours, signalé), avec une COUCHE TEXTE INVISIBLE (mode
     de rendu 3, comme l'OCR d'un scan) : « #k3f — texte de la boîte » à l'emplacement de la
     boîte, et le numéro de page en pied. Une IA qui lit le texte retrouve le lien repère ↔
     texte, une IA qui regarde l'image voit les étiquettes ; rien de visible en plus.
   - pngsIA : un PNG par page (2× la taille de page), comme avant.
   L'export PDF annoté normal et l'import ne changent pas ; les boîtes ne sont jamais modifiées.
   ============================================================ */
import { PDFDocument, StandardFonts, rgb, pushGraphicsState, popGraphicsState, setTextRenderingMode, TextRenderingMode } from 'pdf-lib';
import { exporterDepuisBlob, nettoyeur } from './exportAnnote.js';
import { openPdf } from './pdfjsSetup.js';
import { boitesOrdonnees, refsCourtes, construireExportIA, LISEZMOI_IA } from '../lib/textesAnnotations.js';
import { creerZip } from '../lib/zipSimple.js';

export const ECHELLE_PNG = 2; // 2× la taille de page
export const DPI_IA = 150;
export const DPI_REPLI = 120;
export const QUALITE_JPEG = 0.85;
export const MAX_OCTETS_PAGE = 1024 * 1024; // 1 Mo
export const MAX_OCTETS_COURS = 40 * 1024 * 1024; // 40 Mo

const nomFichier = (s) => String(s || 'cours').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'cours';
const deux = (n) => String(n).padStart(2, '0');
const pause = () => new Promise((r) => setTimeout(r, 0)); // rend la main à l'interface entre deux pages

export class ExportAnnule extends Error { constructor() { super('Export annulé.'); this.name = 'ExportAnnule'; } }
const verifier = (signal) => { if (signal && signal.aborted) throw new ExportAnnule(); };

/**
 * Source commune de l'export (rien n'est écrit).
 * @param {object} o
 * @param {string} o.titre        nom du cours
 * @param {string} o.pdfId        blob du PDF du cours (lu, jamais réécrit)
 * @param {object[]} o.highlights surlignages du cours
 * @param {object[]} o.annotations annotations du cours (texte en cours de frappe compris)
 * @param {Array} o.ordrePages     clés des pages affichées, dans l'ordre (= pages du PDF exporté)
 * @param {'page'|'cours'} o.portee
 * @param {number} o.pageIndex     0… (portée « page »)
 */
export async function preparerSourceIA({ titre, pdfId, highlights, annotations, ordrePages, portee, pageIndex = 0 }) {
  const toutes = boitesOrdonnees(annotations, ordrePages);
  const refs = refsCourtes(toutes); // repères calculés sur TOUT le cours : un même repère partout
  const cles = portee === 'page' ? [ordrePages[pageIndex]] : ordrePages;
  const boites = boitesOrdonnees(annotations, cles);
  const reperes = new Map(boites.map((b) => [b.id, refs.get(b.id)]));
  const { octets, bilan } = await exporterDepuisBlob(pdfId, highlights, annotations, { reperes });
  const indices = portee === 'page' ? [pageIndex] : ordrePages.map((_, i) => i); // pages du PDF vectoriel exportées
  const json = construireExportIA({ cours: titre, page: portee === 'page' ? pageIndex + 1 : null, boites, refs });
  const base = nomFichier(titre) + '-export-ia' + (portee === 'page' ? '-p' + deux(pageIndex + 1) : '');
  return { titre, octets, indices, etiquettes: bilan.reperes || [], json, base, nb: boites.length, portee };
}

/** page `numero` (1…) d'un document pdf.js → canvas à `echelle` × sa taille */
async function rendrePage(doc, numero, echelle) {
  const page = await doc.getPage(numero);
  const vp = page.getViewport({ scale: echelle });
  const cv = document.createElement('canvas');
  cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  page.cleanup();
  return cv;
}
const blobDe = (cv, type, qualite) => new Promise((ok) => cv.toBlob(ok, type, qualite));
// libère le document pdf.js et son worker (pdf.js 6 : par la tâche de chargement)
const fermer = (doc) => { try { if (doc.loadingTask) doc.loadingTask.destroy(); else if (doc.destroy) doc.destroy(); } catch (e) { /* ignore */ } };
const ouvrirVectoriel = (source) => openPdf(source.octets.slice ? source.octets.slice() : source.octets);

/** un PNG par page (2× la taille de page). onProgres(fait, total) ; signal : AbortSignal */
export async function pngsIA(source, { onProgres = null, signal = null } = {}) {
  const doc = await ouvrirVectoriel(source);
  const pngs = [];
  try {
    for (let k = 0; k < source.indices.length; k++) {
      verifier(signal);
      const i = source.indices[k];
      const cv = await rendrePage(doc, i + 1, ECHELLE_PNG);
      pngs.push({ nom: `page-${deux(i + 1)}.png`, numero: i + 1, blob: await blobDe(cv, 'image/png') });
      cv.width = cv.height = 0;
      if (onProgres) onProgres(k + 1, source.indices.length);
      await pause();
    }
  } finally { fermer(doc); }
  return pngs;
}

/* ---- couche texte invisible ---- */
const TAILLE_TEXTE = 6; // points : invisible, sert seulement à la recherche et à l'extraction
function couper(texte, font, taille, largeur) {
  const lignes = [];
  for (const para of String(texte).split('\n')) {
    let cour = '';
    for (const mot of para.split(/\s+/).filter(Boolean)) {
      const essai = cour ? cour + ' ' + mot : mot;
      if (cour && font.widthOfTextAtSize(essai, taille) > largeur) { lignes.push(cour); cour = mot; } else cour = essai;
    }
    lignes.push(cour);
  }
  return lignes.filter((l, i) => l || i === 0);
}

/**
 * LE fichier PDF de l'export IA. Chaque page = image JPEG de la page annotée, au format de la
 * page d'origine, + couche texte invisible. onProgres(fait, total) ; signal : AbortSignal.
 * @returns {{ octets: Uint8Array, dpi: number, pagesRepli: number[], repli: boolean, poidsPages: number[], nbPages: number }}
 *   dpi : 150, ou 120 si tout le cours a été refait ; pagesRepli : pages seules refaites à 120 dpi
 */
export async function pdfIA(source, { onProgres = null, signal = null, dpi = DPI_IA } = {}) {
  const doc = await ouvrirVectoriel(source);
  const vect = await PDFDocument.load(source.octets.slice ? source.octets.slice() : source.octets);
  const pagesVect = vect.getPages();
  const sortie = await PDFDocument.create();
  sortie.setTitle(`${source.titre || 'Cours'} — export IA`);
  sortie.setSubject('MedRevise — export spécial IA : chaque boîte porte son repère (#…), aussi écrit dans annotations.json');
  sortie.setCreator('MedRevise');
  sortie.setProducer('MedRevise (pdf-lib)');
  const font = await sortie.embedFont(StandardFonts.Helvetica);
  const propre = nettoyeur(font);
  const textes = new Map(source.json.boxes.map((b) => [b.ref, b.text]));
  const poidsPages = [];
  const pagesRepli = []; // pages refaites à 120 dpi (plus de 1 Mo à 150 dpi)
  const n = source.indices.length;
  try {
    for (let k = 0; k < n; k++) {
      verifier(signal);
      const i = source.indices[k];
      const { width: W, height: H } = pagesVect[i].getSize();
      // image de la page : 150 dpi (repli 120 dpi si > 1 Mo), JPEG qualité 85
      let jpeg = null;
      for (const d of dpi === DPI_IA ? [DPI_IA, DPI_REPLI] : [dpi]) {
        const cv = await rendrePage(doc, i + 1, d / 72);
        jpeg = await blobDe(cv, 'image/jpeg', QUALITE_JPEG);
        cv.width = cv.height = 0;
        if (jpeg.size <= MAX_OCTETS_PAGE) break;
        if (d === DPI_IA) pagesRepli.push(i + 1);
      }
      verifier(signal);
      const image = await sortie.embedJpg(new Uint8Array(await jpeg.arrayBuffer()));
      poidsPages.push(jpeg.size);
      const page = sortie.addPage([W, H]);
      page.drawImage(image, { x: 0, y: 0, width: W, height: H });
      // couche texte INVISIBLE (Tr 3) : « #ref — texte » dans le cadre de chaque boîte, puis le pied de page
      page.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible));
      for (const e of source.etiquettes.filter((x) => x.page === i)) {
        const t = `${e.ref} — ${textes.has(e.ref) ? textes.get(e.ref) : ''}`.trim();
        const lignes = couper(propre(t), font, TAILLE_TEXTE, Math.max(30, e.cadre.w - 4));
        const haut = e.cadre.y + e.cadre.h;
        lignes.forEach((l, j) => page.drawText(l, { x: e.cadre.x + 2, y: Math.max(1, haut - 2 - TAILLE_TEXTE * (j + 1) * 1.15), size: TAILLE_TEXTE, font, color: rgb(0, 0, 0) }));
      }
      page.drawText(propre(`Page ${i + 1} / ${pagesVect.length} — ${source.titre || 'Cours'}`), { x: 24, y: 10, size: TAILLE_TEXTE, font, color: rgb(0, 0, 0) });
      page.pushOperators(popGraphicsState());
      if (onProgres) onProgres(k + 1, n);
      await pause();
    }
  } finally { fermer(doc); }
  verifier(signal);
  const octets = await sortie.save();
  // tout le cours au-delà de 40 Mo : on refait à 120 dpi (signalé)
  if (octets.length > MAX_OCTETS_COURS && dpi === DPI_IA) {
    return pdfIA(source, { onProgres, signal, dpi: DPI_REPLI });
  }
  return { octets, dpi, pagesRepli, repli: dpi !== DPI_IA || pagesRepli.length > 0, poidsPages, nbPages: n };
}

/** LISEZMOI.txt accompagnant le PDF */
export const lisezmoiIA = (nomPdf) => LISEZMOI_IA.replace('{PDF}', nomPdf);

/** « PNG par page » : archive annotations.json, LISEZMOI.txt, page-XX.png */
export async function zipPngsIA(source, pngs) {
  const fichiers = [
    { nom: 'annotations.json', donnees: JSON.stringify(source.json, null, 2) },
    { nom: 'LISEZMOI.txt', donnees: lisezmoiIA(source.base + '.pdf') },
  ];
  for (const p of pngs) fichiers.push({ nom: p.nom, donnees: new Uint8Array(await p.blob.arrayBuffer()) });
  return creerZip(fichiers);
}
