/* ============================================================
   MedRevise — REMPLACER UN DOCUMENT CRÉÉ DANS L'APP PAR LE PDF DU PROF (20/11/2026,
   docs/compte-rendu-police-duplication-remplacement-pdf.md §3).

   Cas : un document vierge créé pendant le cours (la diapo n'est pas encore publiée), annoté, puis le prof publie
   son PDF. Fichier › Document original › « Remplacer par un PDF… » : le FOND du document est entièrement remplacé
   par toutes les pages du PDF. MÊME cours (même fiche, même id) : cartes, liens des cartes vers leurs boîtes,
   notions, transcripts, séances restent rattachés.

   Les annotations ne sont PAS supprimées : chacune reste sur le MÊME NUMÉRO de page (n-ième page du document →
   page n du PDF), à la même position relative (x, y en fraction de la page) ; celles posées au-delà du nombre de
   pages du PDF vont sur la dernière page. Les pages du document (enregistrements `kind: 'page'`) ne s'affichent
   plus : elles passent, gardées, dans un calque d'archive `<cours>::retire:<n>`. Le texte écrit dans le flux du
   document (store `notes_doc`) n'est pas touché : il reste en base, et revient avec « Restaurer ».

   AVANT tout : putBackup (fiche, annotations, surlignages, texte du document) et une version dans l'Historique
   (lib/historiqueDoc.js) qui porte aussi la FICHE — « Restaurer cette version » remet le document exactement
   comme avant (fiche sans PDF, pages et annotations à leur place). Après : une seconde version.
   Le PDF est rangé comme tout principal importé (pdfId) : couche de texte et reconnaissance de texte (OCR) par
   le même chemin que n'importe quel PDF ouvert dans le lecteur.
   ============================================================ */
import { getAll, getOne, put, putMany, putBlob, putBackup, lireDocument } from './storage.js';
import { avecVerrou, principalDe, verifierFichiers, versPdf } from './fichiersCours.js';
import { garderVersion } from './historiqueDoc.js';
import { openPdf } from '../pdf/pdfjsSetup.js';

const triPages = (a, b) => (a.rang - b.rang) || String(a.createdAt).localeCompare(String(b.createdAt));
/** les pages d'un document créé, dans l'ordre d'affichage (pdf/PdfReader.jsx#pageSizes) */
export const pagesDuDocument = (annotations, ns) => annotations.filter((a) => a.ficheId === ns && a.kind === 'page').sort(triPages);

/**
 * PUR — le plan du remplacement : où va chaque enregistrement.
 * @returns {{ maj: { annotations: object[], highlights: object[] }, nAnnotations: number, nPagesDoc: number }}
 */
export function planRemplacement({ ns, annotations, highlights, nbPages, nsRetire }) {
  const pages = pagesDuDocument(annotations, ns);
  const rang = new Map(pages.map((p, i) => [p.id, i + 1]));
  const n = Math.max(1, nbPages);
  const vers = (p) => {
    if (rang.has(p)) return Math.min(rang.get(p), n);
    if (typeof p === 'number' && Number.isFinite(p)) return Math.max(1, Math.min(Math.round(p), n));
    return n; // page inconnue : la dernière (jamais perdue)
  };
  const maj = { annotations: [], highlights: [] };
  let nAnnotations = 0;
  for (const a of annotations) {
    if (a.ficheId !== ns) continue;
    if (a.kind === 'page') { maj.annotations.push({ ...a, ficheId: nsRetire, retireDe: ns }); continue; }
    nAnnotations++;
    maj.annotations.push({ ...a, page: vers(a.page) });
  }
  for (const h of highlights) {
    // un surlignage hors des pages (texte du flux, notions) n'a pas de page à suivre : il reste tel quel
    if (h.ficheId !== ns || !(rang.has(h.page) || typeof h.page === 'number')) continue;
    nAnnotations++;
    const r = { ...h, page: vers(h.page) };
    if (r.anchor) { delete r.anchor; r.replaceApprox = true; } // le texte de la page a changé : ancre approximative
    maj.highlights.push(r);
  }
  return { maj, nAnnotations, nPagesDoc: pages.length };
}

/** nombre d'annotations (objets + surlignages) d'un document créé — pour la fenêtre de confirmation */
export async function compterAnnotations(ns) {
  const d = await lireDocument(ns);
  return planRemplacement({ ns, annotations: d.annotations, highlights: d.highlights, nbPages: 1e6, nsRetire: '-' }).nAnnotations;
}
/** nombre de pages d'un fichier PDF (ou d'images converties) choisi — pour la fenêtre de confirmation */
export async function pagesDuFichier(fichiers) {
  const pdf = await versPdf(fichiers);
  const d = await openPdf(await pdf.arrayBuffer());
  const n = d.numPages;
  try { d.destroy && d.destroy(); } catch (e) { /* ignore */ }
  return { pdf, n };
}

/** le remplacement lui-même ; rend { fiche, nAnnotations, nPages } */
export async function remplacerDocumentParPdf({ fiche, fichiers, pdfPrepare = null }) {
  if (!fiche || principalDe(fiche).type !== 'document') throw new Error('Seul un document créé dans l’app se remplace par un PDF ici.');
  const err = verifierFichiers(fichiers, { images: true }); if (err) throw new Error(err);
  return avecVerrou('remplacement du document par un PDF', async () => {
    const ns = fiche.id;
    const actuelle = (await getOne('fiches', ns)) || fiche;
    const { pdf, n } = pdfPrepare || await pagesDuFichier(fichiers);
    if (!n) throw new Error('Ce PDF n’a aucune page lisible.');
    const avant = await lireDocument(ns);
    // 1. sauvegarde AVANT, et version dans l'Historique (avec la fiche : la restauration remet le document tel quel)
    await putBackup(`pre-remplace-document-${ns}-${Date.now()}`, { fiche: actuelle, annotations: avant.annotations, highlights: avant.highlights, notes_doc: avant.notes_doc });
    await garderVersion(ns, `Avant remplacement par « ${pdf.name || 'cours.pdf'} »`, { force: true, contenu: { ...avant, fiche: actuelle } });
    // 2. le PDF, rangé comme tout principal importé
    const pdfId = await putBlob(pdf);
    // 3. les annotations : même numéro de page, même position relative ; les pages du document à l'archive
    const k = (actuelle.fichiersRetires || []).length + 1;
    const nsRetire = `${ns}::retire:${k}`;
    const [ans, hs] = [await getAll('annotations'), await getAll('highlights')];
    const { maj, nAnnotations, nPagesDoc } = planRemplacement({ ns, annotations: ans, highlights: hs, nbPages: n, nsRetire });
    // 4. la fiche : même id, le PDF comme principal ; puis les annotations (le texte du document reste en base, `docNotes` compris)
    const le = new Date().toISOString();
    const neuve = {
      ...actuelle, pdfId, pdfName: pdf.name || 'cours.pdf', pdfImporteLe: le, pdfTaille: pdf.size || null,
      fichiersRetires: [...(actuelle.fichiersRetires || []), { type: 'document', fileId: null, fileName: actuelle.titre || 'Document', retireLe: le, importeLe: actuelle.dateImport || null,
        remplacePar: pdfId, nsAnnot: nsRetire, pagesDocument: nPagesDoc, replacees: nAnnotations, nonReplacees: [] }],
    };
    // la fiche D'ABORD : un document affiché sans ses pages en recréerait une (pdf/PdfReader.jsx, création de la 1re page)
    await put('fiches', neuve);
    if (maj.annotations.length) await putMany('annotations', maj.annotations);
    if (maj.highlights.length) await putMany('highlights', maj.highlights);
    await garderVersion(ns, `Après remplacement par « ${pdf.name || 'cours.pdf'} » (${n} page${n > 1 ? 's' : ''})`, { force: true, contenu: { ...(await lireDocument(ns)), fiche: neuve } });
    return { fiche: neuve, nAnnotations, nPages: n };
  });
}
