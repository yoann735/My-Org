/* ============================================================
   MedRevise — FICHIERS D'UN COURS : un modèle simple et carré (16/10,
   docs/compte-rendu-fichiers-cours.md).

   Un cours (fiche) a AU PLUS :
   - UN document PRINCIPAL : un PDF importé (`pdfId`) OU un document créé dans l'app
     (`docNotes`) — une fiche HTML seule (`htmlId`, gabarit d'avant) reste son principal ;
   - UNE fiche jumelle (PDF, store `companion_pdf`, lib/ficheJumelle.js).
   Rien d'autre : plus d'« attacher un document », plus de « détacher », plus de PDF à côté
   d'un HTML. Les fichiers qui sortent du modèle (HTML en plus d'un PDF, principal remplacé,
   anciennes versions de fiche jumelle, fiche jumelle supprimée) ne sont JAMAIS effacés :
   ils restent en base et se lisent dans Réglages › Archives (`fichiersHorsModele`).

   Règles : un seul import à la fois (verrou) ; PDF (et images converties en PDF pour le
   principal) ; taille max TAILLE_MAX ; nom éditable ; jamais deux principaux ni deux fiches.
   Remplacer le principal / supprimer la fiche : putBackup AVANT, confirmation côté écran.
   ============================================================ */
import { getAll, getBlob, getOne, put, putMany, putBlob, remove, putBackup, genId } from './storage.js';
import { openPdf } from '../pdf/pdfjsSetup.js';
import { textesPages, correspondance, idJumelle } from './ficheJumelle.js';
import { estImage, ordonnerImages, imagesToPdf } from './imageToPdf.js';

export const TAILLE_MAX = 100 * 1024 * 1024; // 100 Mo
export const mo = (o) => (o / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Mo';
export const taillePourAffichage = (o) => (o == null ? '—' : o < 1024 * 1024 ? Math.max(1, Math.round(o / 1024)) + ' Ko' : mo(o));
const estPdf = (f) => !!f && (/pdf$/i.test(f.type || '') || /\.pdf$/i.test(f.name || ''));

/* ---- le modèle ---- */
/** le document principal d'une fiche : { type: 'pdf'|'document'|'html'|null, fileId, nom } */
export function principalDe(f) {
  if (!f) return { type: null };
  if (f.pdfId) return { type: 'pdf', fileId: f.pdfId, nom: f.pdfName || 'cours.pdf' };
  if (f.docNotes) return { type: 'document', nom: f.titre };
  if (f.htmlId) return { type: 'html', fileId: f.htmlId, nom: f.htmlName || 'fiche.html' };
  return { type: null };
}
/** une fiche « hors modèle » : un HTML EN PLUS d'un PDF (le PDF est le principal) */
export const htmlEnTrop = (f) => !!(f && f.pdfId && f.htmlId);

/** vérifie un import ; rend un message d'erreur, ou null */
export function verifierFichiers(fichiers, { images = false } = {}) {
  const l = [...(fichiers || [])];
  if (!l.length) return 'Aucun fichier.';
  const pdfs = l.filter(estPdf), imgs = l.filter((f) => estImage(f));
  if (pdfs.length > 1) return 'Un seul PDF à la fois : un cours a un seul document principal.';
  if (pdfs.length && imgs.length) return 'Choisis soit un PDF, soit des images (converties en un seul PDF) — pas les deux.';
  if (!pdfs.length && !(images && imgs.length)) return images ? 'Format non accepté : un PDF, ou des images (converties en PDF).' : 'Format non accepté : un PDF seulement.';
  if (l.length !== pdfs.length + imgs.length) return images ? 'Seuls un PDF ou des images sont acceptés.' : 'Un PDF seulement.';
  const total = l.reduce((n, f) => n + (f.size || 0), 0);
  if (total > TAILLE_MAX) return `Fichier trop lourd : ${mo(total)} (maximum ${mo(TAILLE_MAX)}).`;
  return null;
}
/** un PDF prêt à importer (les images deviennent un PDF, une page par image) */
export async function versPdf(fichiers) {
  const l = [...fichiers];
  if (l.length === 1 && estPdf(l[0])) return l[0];
  const o = await imagesToPdf(ordonnerImages(l.filter((f) => estImage(f))));
  return o;
}

/* ---- un seul import à la fois ---- */
let enCours = null;
export const importEnCours = () => enCours;
export async function avecVerrou(quoi, fn) {
  if (enCours) throw new Error(`Un import est déjà en cours (${enCours}) : attends qu’il se termine.`);
  enCours = quoi;
  try { return await fn(); } finally { enCours = null; }
}

const nbPagesDe = async (blob) => { try { const d = await openPdf(await blob.arrayBuffer()); const n = d.numPages; try { d.destroy && d.destroy(); } catch (e) { /* ignore */ } return n; } catch (e) { return null; } };
/** infos affichées d'un fichier : nom, pages, date d'import, taille */
export async function infosFichier(fileId) {
  const b = fileId ? await getBlob(fileId) : null;
  if (!b) return { present: false };
  return { present: true, taille: b.size, pages: /pdf/i.test(b.type || '') || !b.type ? await nbPagesDe(b) : null };
}

/* ---- importer un PRINCIPAL sur un cours qui n'en a pas ---- */
export async function importerPrincipal({ fiche, fichiers }) {
  const p = principalDe(fiche);
  if (p.type) throw new Error('Ce cours a déjà un document principal : « Remplacer » depuis Fichier › Fichiers du cours.');
  const err = verifierFichiers(fichiers, { images: true }); if (err) throw new Error(err);
  return avecVerrou('document principal', async () => {
    const pdf = await versPdf(fichiers);
    const pdfId = await putBlob(pdf);
    return put('fiches', { ...fiche, pdfId, pdfName: pdf.name || 'cours.pdf', pdfImporteLe: new Date().toISOString(), pdfTaille: pdf.size || null });
  });
}

/* correspondance entre DEUX VERSIONS d'un même cours, plus stricte que celle de la fiche jumelle (faite
   pour une fiche résumée, très différente) : une page n'est replacée que sur une page au texte IDENTIQUE
   (normalisé), ou sur sa paire de l'alignement si la similarité est forte (≥ 0,5) — jamais par « fusion »
   avec une voisine. Une page supprimée n'a donc pas d'équivalent : ses annotations sont « non replacées ». */
const normPage = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
export function correspondanceVersions(tA, tN) {
  const libres = new Map();
  tN.forEach((p, j) => { const k = normPage(p.texte); if (!k) return; if (!libres.has(k)) libres.set(k, []); libres.get(k).push(j + 1); });
  const pris = new Set();
  const out = tA.map((p) => { const l = libres.get(normPage(p.texte)); const j = l && l.find((x) => !pris.has(x)); if (j) pris.add(j); return j || null; });
  const c = correspondance(tA, tN);
  out.forEach((j, i) => {
    if (j) return;
    const k = c.versB[i];
    if (k && !pris.has(k) && c.versA[k - 1] === i + 1 && (c.scores[k - 1] || 0) >= 0.5) { out[i] = k; pris.add(k); }
  });
  return out;
}

const typeDe = (store, a) => (store === 'highlights' ? 'surlignage' : a.kind === 'libre' ? (a.type === 'boite' ? 'boîte' : 'texte') : a.kind === 'trait' ? 'trait' : a.kind || 'annotation');
const texteDe = (a) => {
  if (a.texte) return String(a.texte).slice(0, 120);
  const m = a.content ? JSON.stringify(a.content).match(/"text":"([^"]{1,120})/g) : null;
  return m ? m.map((x) => x.slice(8)).join(' ').slice(0, 120) : '';
};

/* ---- REMPLACER le principal (PDF ou fiche HTML) par un nouveau PDF ----
   1. putBackup : la fiche et TOUTES les annotations du cours, telles qu'avant ;
   2. correspondance des pages ancien → nouveau par similarité de texte (lib/ficheJumelle.js) ;
   3. chaque annotation du calque du cours est replacée sur la page retrouvée (même
      enregistrement, page mise à jour ; l'ancre d'un surlignage n'est gardée que si le texte de
      la page est identique) ; celles dont la page n'est pas retrouvée passent dans un calque
      d'archive `<cours>::retire:<n>` — gardées, listées (« Annotations non replacées ») ;
   4. la fiche pointe sur le nouveau PDF ; l'ancien fichier est marqué retiré
      (`fichiersRetires`), PAS effacé. Cartes, notions, transcripts, sessions, position de
      lecture et fiche jumelle restent rattachés au cours (même id). */
export async function remplacerPrincipal({ fiche, fichiers }) {
  const ancien = principalDe(fiche);
  if (ancien.type !== 'pdf' && ancien.type !== 'html') throw new Error('Un document créé dans l’app se modifie directement : il n’a pas de fichier à remplacer.');
  const err = verifierFichiers(fichiers, { images: true }); if (err) throw new Error(err);
  return avecVerrou('remplacement du document principal', async () => {
    const [hs, ans] = [await getAll('highlights'), await getAll('annotations')];
    const anciens = [...hs.filter((h) => h.ficheId === fiche.id).map((a) => ['highlights', a]), ...ans.filter((a) => a.ficheId === fiche.id).map((a) => ['annotations', a])];
    await putBackup(`pre-remplace-principal-${fiche.id}-${Date.now()}`, { fiche, highlights: anciens.filter(([s]) => s === 'highlights').map(([, a]) => a), annotations: anciens.filter(([s]) => s === 'annotations').map(([, a]) => a) });
    const pdf = await versPdf(fichiers);
    const docN = await openPdf(await pdf.arrayBuffer());
    const tN = await textesPages(docN);
    // pages de l'ancien : son texte s'il s'agit d'un PDF lisible ici ; une fiche HTML n'a pas de pages
    let versNouv = [], tA = [];
    if (ancien.type === 'pdf') {
      const blobA = await getBlob(ancien.fileId);
      if (blobA) { tA = await textesPages(await openPdf(await blobA.arrayBuffer()), ancien.fileId); versNouv = correspondanceVersions(tA, tN); }
    }
    const pdfId = await putBlob(pdf);
    const n = (fiche.fichiersRetires || []).length + 1;
    const nsRetire = `${fiche.id}::retire:${n}`;
    const pageNouv = (p) => (typeof p === 'number' ? versNouv[p - 1] ?? null : null);
    const memeTexte = (p, q) => tA[p - 1] && tN[q - 1] && tA[p - 1].texte === tN[q - 1].texte;
    const maj = { highlights: [], annotations: [] }, nonReplacees = [];
    const pagesPlacees = new Set();
    const ordre = [...anciens].sort(([, a], [, b]) => (a.kind === 'page' ? 0 : 1) - (b.kind === 'page' ? 0 : 1));
    for (const [store, a] of ordre) {
      const champ = a.kind === 'page' ? 'apres' : 'page';
      const p = a[champ];
      const q = a.kind === 'page' ? (p === 0 ? 0 : pageNouv(p)) : typeof p === 'number' ? pageNouv(p) : (pagesPlacees.has(p) ? p : null);
      if (q == null) {
        nonReplacees.push({ store, id: a.id, page: typeof p === 'number' ? p : 'ajoutée', type: typeDe(store, a), texte: texteDe(a) });
        maj[store].push({ ...a, ficheId: nsRetire, retireDe: fiche.id });
        continue;
      }
      if (a.kind === 'page') pagesPlacees.add(a.id);
      const r = { ...a, [champ]: q };
      if (store === 'highlights' && r.anchor && !(typeof p === 'number' && memeTexte(p, q))) { delete r.anchor; r.replaceApprox = true; }
      maj[store].push(r);
    }
    if (maj.highlights.length) await putMany('highlights', maj.highlights);
    if (maj.annotations.length) await putMany('annotations', maj.annotations);
    const retire = {
      type: ancien.type, fileId: ancien.fileId, fileName: ancien.nom, retireLe: new Date().toISOString(), importeLe: fiche.pdfImporteLe || fiche.dateImport || null,
      remplacePar: pdfId, nsAnnot: nsRetire, nonReplacees, replacees: anciens.length - nonReplacees.length,
    };
    const neuve = {
      ...fiche, pdfId, pdfName: pdf.name || 'cours.pdf', pdfImporteLe: new Date().toISOString(), pdfTaille: pdf.size || null,
      ...(ancien.type === 'html' ? { htmlId: null, htmlName: null } : {}),
      fichiersRetires: [...(fiche.fichiersRetires || []), retire],
    };
    await put('fiches', neuve);
    try { docN.destroy && docN.destroy(); } catch (e) { /* ignore */ }
    return { fiche: neuve, retire };
  });
}

/* ---- SUPPRIMER la fiche jumelle : la fiche et ses annotations propres (calques
   `<cours>::fiche:<v>`), après putBackup. Le fichier n'est pas effacé : il est listé dans
   `fichiersRetires` du cours (Réglages › Archives). Le cours revient « sans fiche ». ---- */
export async function supprimerJumelle({ fiche, rec }) {
  return avecVerrou('suppression de la fiche jumelle', async () => {
    const pref = `${fiche.id}::fiche:`;
    const [hs, ans] = [await getAll('highlights'), await getAll('annotations')];
    const siens = [...hs.filter((h) => String(h.ficheId).startsWith(pref)).map((a) => ['highlights', a]), ...ans.filter((a) => String(a.ficheId).startsWith(pref)).map((a) => ['annotations', a])];
    await putBackup(`pre-supprime-jumelle-${fiche.id}-${Date.now()}`, { companion: rec, highlights: siens.filter(([s]) => s === 'highlights').map(([, a]) => a), annotations: siens.filter(([s]) => s === 'annotations').map(([, a]) => a) });
    for (const [store, a] of siens) await remove(store, a.id);
    await remove('companion_pdf', idJumelle(fiche.id));
    const f = (await getOne('fiches', fiche.id)) || fiche;
    await put('fiches', { ...f, fichiersRetires: [...(f.fichiersRetires || []), { type: 'jumelle', fileId: rec.fileId, fileName: rec.fileName, retireLe: new Date().toISOString(), importeLe: rec.importeLe || null, annotationsSupprimees: siens.length, versions: (rec.versions || []).map((v) => ({ fileId: v.fileId, fileName: v.fileName })) }] });
    window.dispatchEvent(new Event('medrevise:jumelle'));
    return siens.length;
  });
}

/* ---- (17/10) SUPPRIMER LA DIAPO ORIGINALE (PDF principal) d'un cours SANS fiche jumelle :
   putBackup de la fiche, puis la fiche ne pointe plus sur le PDF (cours « à cartes seules »,
   « Importer » le rattache de nouveau). Le fichier n'est pas effacé : il est listé dans
   `fichiersRetires` (Réglages › Archives). Annotations (calque du cours), flashcards, notions,
   transcripts et sessions restent attachés au cours. Refusé s'il y a une fiche jumelle : elle
   dépend de l'original (correspondance des pages). ---- */
export async function supprimerPrincipal({ fiche, jumelle = null }) {
  const p = principalDe(fiche);
  if (jumelle) throw new Error('Une fiche est rattachée à cette diapo : importe d’abord un autre document principal ou remplace-le.');
  if (p.type !== 'pdf') throw new Error('Seule une diapo (PDF importé) peut être supprimée ici.');
  return avecVerrou('suppression de la diapo originale', async () => {
    const f = (await getOne('fiches', fiche.id)) || fiche;
    await putBackup(`pre-supprime-principal-${fiche.id}-${Date.now()}`, { fiche: f });
    const retire = { type: 'pdf', fileId: p.fileId, fileName: p.nom, retireLe: new Date().toISOString(), importeLe: f.pdfImporteLe || f.dateImport || null, supprime: true, nsAnnot: f.id };
    return put('fiches', { ...f, pdfId: null, pdfName: null, pdfImporteLe: null, pdfTaille: null, fichiersRetires: [...(f.fichiersRetires || []), retire] });
  });
}

/* ---- noms éditables ---- */
export const renommerPrincipal = (fiche, nom) => put('fiches', { ...fiche, pdfName: String(nom || '').trim() || fiche.pdfName });
export async function renommerJumelle(rec, nom) {
  const r = await put('companion_pdf', { ...rec, fileName: String(nom || '').trim() || rec.fileName });
  window.dispatchEvent(new Event('medrevise:jumelle'));
  return r;
}

/** télécharge un fichier du cours tel quel */
export async function exporterFichier(fileId, nom) {
  const b = await getBlob(fileId);
  if (!b) throw new Error('Fichier indisponible sur cet appareil.');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = nom || 'fichier.pdf';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---- Réglages › Archives : tout fichier de cours qui sort du modèle, en LECTURE ---- */
export async function fichiersHorsModele(fiches) {
  const jumelles = await getAll('companion_pdf');
  const out = [];
  for (const f of fiches || []) {
    if (htmlEnTrop(f)) out.push({ ficheId: f.id, cours: f.titre, quoi: 'Fiche HTML en plus du PDF principal', fileId: f.htmlId, nom: f.htmlName || 'fiche.html', html: true });
    for (const r of f.fichiersRetires || []) {
      out.push({ ficheId: f.id, cours: f.titre, quoi: r.type === 'jumelle' ? 'Fiche jumelle supprimée' : r.supprime ? 'Diapo originale supprimée' : 'Document principal remplacé', fileId: r.fileId, nom: r.fileName, le: r.retireLe, html: r.type === 'html' });
      for (const v of r.versions || []) out.push({ ficheId: f.id, cours: f.titre, quoi: 'Ancienne version de fiche jumelle (supprimée)', fileId: v.fileId, nom: v.fileName });
    }
  }
  const titres = new Map((fiches || []).map((f) => [f.id, f.titre]));
  for (const j of jumelles) for (const v of j.versions || []) out.push({ ficheId: j.courseId, cours: titres.get(j.courseId) || '—', quoi: 'Ancienne version de la fiche jumelle', fileId: v.fileId, nom: v.fileName, le: v.remplaceeLe });
  return out;
}
export const nouvelId = () => genId('f');
