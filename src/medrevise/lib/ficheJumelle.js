/* ============================================================
   MedRevise — FICHE JUMELLE d'un cours (15/10, docs/compte-rendu-fiche-jumelle.md).

   Un cours garde son PDF original (fiche.pdfId) comme document principal ; on peut y
   rattacher un second PDF, la « fiche » (résumé page à page, avec parfois des pages
   ajoutées ou fusionnées), et basculer de l'un à l'autre dans le même lecteur.

   DONNÉES — type additionnel synchronisé `companion_pdf`, UN enregistrement par cours :
     { id: 'cp:' + courseId, courseId, fileId, fileName, version, nsAnnot,
       nbPagesOrig, nbPagesFiche,
       pageMap: { versFiche: [f | null par page originale], versOrig: [o | null par page de fiche],
                  scores: [score de l'appariement par page de fiche], methode, manuel },
       versions: [{ version, fileId, fileName, nsAnnot, remplaceeLe }],   // anciennes fiches, gardées
       nonReplacees: [{ store, id, page, type, texte }],                   // dernier remplacement
       updatedAt }
   Le PDF de la fiche voyage par le canal des blobs (champ `fileId`). Ses annotations vivent
   dans `highlights` / `annotations` avec `ficheId = nsAnnot` ('<courseId>::fiche:<version>') :
   un calque à part, rien d'existant réécrit. Notions du panneau, flashcards et transcript
   restent rattachés au COURS.

   CORRESPONDANCE DES PAGES (correspondance()) — par similarité de texte :
   1. texte de chaque page : texte natif du PDF (pdf.js), sinon la couche OCR existante ;
      le TITRE = les lignes de la plus grande taille de police de la page ;
   2. mots normalisés (minuscules, sans accents, mots vides retirés), pondérés tf × idf sur
      l'ensemble des pages des deux documents (un mot rare compte beaucoup, un mot présent
      partout presque rien), mots du titre × 3 ;
   3. similarité cosinus de chaque page originale avec chaque page de fiche ;
   4. ALIGNEMENT MONOTONE (programmation dynamique, comme un alignement de séquences) : on
      garde l'ordre des deux documents et on maximise Σ (similarité − seuil) des paires ;
      une page de fiche laissée seule = « page ajoutée dans la fiche », une page originale
      laissée seule = « page sans équivalent » ;
   5. PAGES DÉPLACÉES : deux pages restées seules mais très semblables (≥ 0,5) sont appariées
      même hors de l'ordre ;
   6. FUSIONS : une page originale sans paire dont le texte se retrouve dans la page de fiche
      de sa voisine y est rattachée (deux diapositives résumées en une page).
   Sans aucun texte des deux côtés : page n ↔ page n.

   COURS « DOCUMENT » (créé dans l'app, flux ProseMirror paginé — 15/10 soir) : le document reste
   le principal. Sa pagination bouge quand on écrit : la correspondance y est donc stockée PAR
   BLOC (`pageMap.mode = 'bloc'`, `parBloc: [{ ancre, fiche }]`), l'ancre étant l'EMPREINTE du
   premier bloc non vide de la page au moment de l'import (type + empreinte du texte + rang parmi
   les blocs identiques) — calculée, jamais écrite dans le document. À l'affichage, chaque ancre
   est retrouvée dans le flux et sa page ACTUELLE lue dans la pagination (pageMapDocument) ; une
   ancre introuvable (bloc supprimé) ne mène nulle part : sa page de fiche n'a plus d'original.
   ============================================================ */
import { useEffect, useState } from 'react';
import { getAll, getOne, put, putMany, putBlob, getBlob, genId } from './storage.js';
import { openPdf } from '../pdf/pdfjsSetup.js';
import { coucheDuPdf } from '../ocr/service.js';

export const STORE = 'companion_pdf';
export const idJumelle = (courseId) => 'cp:' + courseId;
export const nsJumelle = (courseId, version = 1) => `${courseId}::fiche:${version}`;
const EVENEMENT = 'medrevise:jumelle';
const prevenir = () => { try { window.dispatchEvent(new Event(EVENEMENT)); } catch (e) { /* ignore */ } };

export async function lireJumelle(courseId) {
  if (!courseId) return null;
  try { const r = await getOne(STORE, idJumelle(courseId)); return r && r.fileId ? r : null; } catch (e) { return null; }
}

/** l'enregistrement de la fiche jumelle d'un cours, tenu à jour (synchro, autre onglet) */
export function useFicheJumelle(courseId) {
  const [rec, setRec] = useState(null);
  useEffect(() => {
    let vivant = true;
    const relire = () => { lireJumelle(courseId).then((r) => { if (vivant) setRec((o) => (JSON.stringify(o) === JSON.stringify(r) ? o : r)); }); };
    setRec(null); relire();
    window.addEventListener(EVENEMENT, relire);
    window.addEventListener('medrevise:recharge', relire);
    return () => { vivant = false; window.removeEventListener(EVENEMENT, relire); window.removeEventListener('medrevise:recharge', relire); };
  }, [courseId]);
  return rec;
}

/** l'ensemble des cours qui ont une fiche jumelle (marque de la Bibliothèque) */
export function useCoursAvecJumelle() {
  const [ids, setIds] = useState(() => new Set());
  useEffect(() => {
    let vivant = true;
    const relire = () => {
      getAll(STORE).then((l) => {
        if (!vivant) return;
        const n = new Set((l || []).filter((r) => r && r.fileId && r.courseId).map((r) => r.courseId));
        setIds((o) => (o.size === n.size && [...n].every((x) => o.has(x)) ? o : n));
      }).catch(() => {});
    };
    relire();
    window.addEventListener(EVENEMENT, relire);
    window.addEventListener('medrevise:recharge', relire);
    return () => { vivant = false; window.removeEventListener(EVENEMENT, relire); window.removeEventListener('medrevise:recharge', relire); };
  }, []);
  return ids;
}

/* ---------------- texte des pages ---------------- */
/** [{ texte, titre }] par page — texte natif, sinon la couche OCR du fichier si elle existe */
export async function textesPages(pdfDoc, pdfId = null) {
  const pages = [];
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const tc = await page.getTextContent();
    const items = tc.items.filter((it) => it.str && it.str.trim());
    const tailles = items.map((it) => Math.hypot(it.transform[2], it.transform[3]));
    const max = tailles.length ? Math.max(...tailles) : 0;
    const triees = [...tailles].sort((a, b) => a - b);
    const mediane = triees.length ? triees[Math.floor(triees.length / 2)] : 0;
    // titre : les plus grands caractères de la page, s'ils se distinguent du corps du texte
    const titre = max > mediane * 1.15 ? items.filter((_, k) => tailles[k] >= max * 0.85).map((it) => it.str).join(' ') : (items[0] ? items[0].str : '');
    pages.push({ texte: items.map((it) => it.str).join(' '), titre });
  }
  if (pdfId && pages.some((p) => p.texte.replace(/\s/g, '').length < 15)) {
    try {
      const couche = await coucheDuPdf(pdfId);
      (couche && couche.pages || []).forEach((p, i) => {
        if (!p || !pages[i] || pages[i].texte.replace(/\s/g, '').length >= 15) return;
        const mots = p.words || p.mots || [];
        const lignes = new Map();
        mots.forEach((m) => { const l = m.line ?? 0; if (!lignes.has(l)) lignes.set(l, []); lignes.get(l).push(m.t); });
        const tl = [...lignes.values()].map((l) => l.join(' '));
        pages[i] = { texte: tl.join(' '), titre: tl[0] || '', ocr: true };
      });
    } catch (e) { /* pas de couche OCR : la page reste sans texte */ }
  }
  return pages;
}

/* ---------------- similarité ---------------- */
const VIDES = new Set(('les des une est par pour dans sur avec aux que qui quoi son ses ces cette cet plus moins pas sont '
  + 'leur leurs elle ils elles mais donc car comme entre sous chez vers ont avoir etre fait faire tres peu bien aussi '
  + 'tout tous toute toutes autre autres meme selon lors apres avant chaque deux trois ainsi alors ici la le du de et '
  + 'en au un ou ne se ce sa on il fiche resume page pages diapositive slide retenir examen notes voir cours').split(' '));
export function mots(texte) {
  return String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => !VIDES.has(w) && (/^\d+$/.test(w) ? w.length >= 2 : w.length >= 3));
}
function vecteurs(pages, idf) {
  return pages.map((p) => {
    const v = new Map();
    for (const w of mots(p.texte)) v.set(w, (v.get(w) || 0) + 1);
    for (const w of mots(p.titre)) v.set(w, (v.get(w) || 0) + 3); // le titre pèse plus
    let n = 0;
    for (const [w, tf] of v) { const x = tf * (idf.get(w) || 0); v.set(w, x); n += x * x; }
    return { v, n: Math.sqrt(n) };
  });
}
function cosinus(a, b) {
  if (!a.n || !b.n) return 0;
  let s = 0;
  const [petit, grand] = a.v.size < b.v.size ? [a.v, b.v] : [b.v, a.v];
  for (const [w, x] of petit) { const y = grand.get(w); if (y) s += x * y; }
  return s / (a.n * b.n);
}
/** matrice de similarité [pageA][pageB] (0…1) */
export function similarites(pagesA, pagesB) {
  const tous = [...pagesA, ...pagesB];
  const df = new Map();
  tous.forEach((p) => { new Set([...mots(p.texte), ...mots(p.titre)]).forEach((w) => df.set(w, (df.get(w) || 0) + 1)); });
  const N = tous.length;
  const idf = new Map([...df].map(([w, d]) => [w, Math.log((N + 1) / d)]));
  const va = vecteurs(pagesA, idf), vb = vecteurs(pagesB, idf);
  return va.map((a) => vb.map((b) => cosinus(a, b)));
}

export const SEUIL = 0.15; // en dessous : pas la même page (pire vrai appariement des jeux de test : 0,33 ; pire page ajoutée : 0,19)
const SEUIL_FUSION = 0.1;
const SEUIL_DEPLACEE = 0.5;

/** correspondance A → B (ex. original → fiche) : { versB, versA, scores, methode } */
export function correspondance(pagesA, pagesB) {
  const n = pagesA.length, m = pagesB.length;
  const aDuTexte = (ps) => ps.some((p) => mots(p.texte).length >= 3);
  if (!aDuTexte(pagesA) || !aDuTexte(pagesB)) {
    // aucun texte d'un côté : page n ↔ page n
    return { versB: Array.from({ length: n }, (_, i) => (i < m ? i + 1 : null)), versA: Array.from({ length: m }, (_, j) => (j < n ? j + 1 : null)), scores: Array(m).fill(null), methode: 'ordre' };
  }
  const S = similarites(pagesA, pagesB);
  // alignement monotone : D[i][j] = meilleur score sur A[0..i) × B[0..j)
  const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const C = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1)); // 1 = paire, 2 = A seule, 3 = B seule
  for (let i = 1; i <= n; i++) C[i][0] = 2;
  for (let j = 1; j <= m; j++) C[0][j] = 3;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      let best = D[i - 1][j], c = 2;
      if (D[i][j - 1] > best) { best = D[i][j - 1]; c = 3; }
      const s = S[i - 1][j - 1];
      if (s >= SEUIL && D[i - 1][j - 1] + (s - SEUIL) > best) { best = D[i - 1][j - 1] + (s - SEUIL); c = 1; }
      D[i][j] = best; C[i][j] = c;
    }
  }
  const versB = Array(n).fill(null), versA = Array(m).fill(null), scores = Array(m).fill(null);
  for (let i = n, j = m; i > 0 || j > 0;) {
    const c = C[i][j];
    if (c === 1) { versB[i - 1] = j; versA[j - 1] = i; scores[j - 1] = +S[i - 1][j - 1].toFixed(3); i--; j--; } else if (c === 2) i--; else j--;
  }
  // pages DÉPLACÉES : une page A seule et une page B seule très semblables (≥ 0,5) sont appariées
  // même hors de l'ordre (ex. une page de fiche avancée dans une nouvelle version)
  const libresB = new Set(versA.map((x, j) => (x == null ? j : -1)).filter((j) => j >= 0));
  const candidats = [];
  versB.forEach((x, i) => { if (x == null) libresB.forEach((j) => { if (S[i][j] >= SEUIL_DEPLACEE) candidats.push([S[i][j], i, j]); }); });
  candidats.sort((a, b) => b[0] - a[0]).forEach(([s, i, j]) => {
    if (versB[i] != null || versA[j] != null) return;
    versB[i] = j + 1; versA[j] = i + 1; scores[j] = +s.toFixed(3);
  });
  // fusions : une page A seule rejoint la page B de sa voisine si son texte s'y retrouve
  for (let i = 0; i < n; i++) {
    if (versB[i] != null) continue;
    const voisins = [versB[i - 1], versB[i + 1]].filter((x) => x != null);
    let meilleur = null;
    for (const b of voisins) if (S[i][b - 1] >= SEUIL_FUSION && (!meilleur || S[i][b - 1] > S[i][meilleur - 1])) meilleur = b;
    if (meilleur) versB[i] = meilleur;
  }
  return { versB, versA, scores, methode: 'texte' };
}

/** pageMap (original ↔ fiche) depuis une correspondance original → fiche */
const pageMapDe = (c, manuel = false) => ({ versFiche: c.versB, versOrig: c.versA, scores: c.scores, methode: c.methode, manuel });

/** texte des pages d'un fichier PDF (blob ou ArrayBuffer) */
async function ouvrir(source) {
  const buf = source instanceof ArrayBuffer ? source : await source.arrayBuffer();
  return openPdf(buf);
}

/* ---------------- import / remplacement / correction ---------------- */
/** importe la fiche d'un cours qui n'en a pas : fichier + correspondance automatique */
/** textes des pages de l'ORIGINAL : PDF (pdfIdOrig) ou document de l'app (`instantDoc`, voir pagesDocument) */
async function pagesOriginal({ pdfIdOrig, instantDoc }) {
  if (instantDoc) return pagesDocument(instantDoc);
  const blobOrig = await getBlob(pdfIdOrig);
  if (!blobOrig) throw new Error('PDF original indisponible sur cet appareil');
  return textesPages(await ouvrir(blobOrig), pdfIdOrig);
}
export async function importerJumelle({ courseId, fichier, pdfIdOrig = null, instantDoc = null }) {
  const tO = await pagesOriginal({ pdfIdOrig, instantDoc });
  const docF = await ouvrir(fichier);
  const tF = await textesPages(docF);
  const fileId = await putBlob(fichier);
  const c = correspondance(tO, tF);
  const pageMap = instantDoc ? { ...pageMapDe(c), mode: 'bloc', parBloc: parBlocDe(c.versB, tO) } : pageMapDe(c);
  const rec = {
    id: idJumelle(courseId), courseId, fileId, fileName: fichier.name || 'fiche.pdf', version: 1, nsAnnot: nsJumelle(courseId, 1),
    nbPagesOrig: tO.length, nbPagesFiche: docF.numPages, pageMap, versions: [], nonReplacees: [],
    importeLe: new Date().toISOString(),
  };
  const ecrit = await put(STORE, rec);
  prevenir();
  return ecrit;
}

/** enregistre une correspondance corrigée à la main */
export async function enregistrerCorrespondance(rec, versFiche, pagesDoc = null) {
  const nbF = rec.nbPagesFiche;
  const versOrig = Array(nbF).fill(null);
  versFiche.forEach((f, i) => { if (f != null && versOrig[f - 1] == null) versOrig[f - 1] = i + 1; });
  const scores = versOrig.map((o, j) => (o != null && rec.pageMap.versOrig[j] === o ? rec.pageMap.scores[j] : null));
  // document : les ancres des pages ACTUELLES (la pagination a pu bouger depuis l'import)
  const enPlus = rec.pageMap.mode === 'bloc' && pagesDoc ? { parBloc: parBlocDe(versFiche, pagesDoc), nbPagesOrig: pagesDoc.length } : {};
  const ecrit = await put(STORE, { ...rec, ...(enPlus.nbPagesOrig ? { nbPagesOrig: enPlus.nbPagesOrig } : {}), pageMap: { ...rec.pageMap, versFiche, versOrig, scores, manuel: true, ...(enPlus.parBloc ? { parBloc: enPlus.parBloc } : {}) } });
  prevenir();
  return ecrit;
}

const typeDe = (store, a) => (store === 'highlights' ? 'surlignage' : a.kind === 'libre' ? (a.type === 'boite' ? 'boîte' : 'texte') : a.kind === 'trait' ? 'trait' : a.kind || 'annotation');
const texteDe = (a) => {
  if (a.texte) return String(a.texte).slice(0, 120);
  const m = a.content ? JSON.stringify(a.content).match(/"text":"([^"]{1,120})/g) : null;
  return m ? m.map((x) => x.slice(8)).join(' ').slice(0, 120) : '';
};

/** REMPLACE la fiche par une nouvelle version : les annotations de l'ancienne sont recopiées
    (nouveaux enregistrements, dans le calque de la nouvelle version) sur la page retrouvée par
    la même similarité de texte ; celles dont la page n'est pas retrouvée sont LISTÉES. Les
    anciennes restent intactes dans le calque de l'ancienne version : rien n'est supprimé. */
export async function remplacerJumelle({ rec, fichier, pdfIdOrig = null, instantDoc = null }) {
  const blobAncien = await getBlob(rec.fileId);
  if (!blobAncien) throw new Error('fichiers indisponibles sur cet appareil');
  const tO = await pagesOriginal({ pdfIdOrig, instantDoc });
  const [docA, docN] = [await ouvrir(blobAncien), await ouvrir(fichier)];
  const [tA, tN] = [await textesPages(docA, rec.fileId), await textesPages(docN)];
  const versNouv = correspondance(tA, tN).versB; // ancienne page → nouvelle
  const fileId = await putBlob(fichier);
  // correspondance original ↔ nouvelle fiche : recomposée si elle avait été corrigée à la main
  let pageMap;
  if (rec.pageMap && rec.pageMap.manuel && rec.pageMap.mode === 'bloc') {
    // document corrigé à la main : chaque ancre garde sa page de fiche, suivie dans la nouvelle version
    const parBloc = (rec.pageMap.parBloc || []).map((e) => ({ ...e, fiche: e.fiche != null ? versNouv[e.fiche - 1] ?? null : null }));
    pageMap = { ...pageMapDe(correspondance(tO, tN), true), mode: 'bloc', parBloc };
  } else if (rec.pageMap && rec.pageMap.manuel) {
    const versFiche = rec.pageMap.versFiche.map((f) => (f != null ? versNouv[f - 1] ?? null : null));
    const versOrig = Array(docN.numPages).fill(null);
    versFiche.forEach((f, i) => { if (f != null && versOrig[f - 1] == null) versOrig[f - 1] = i + 1; });
    pageMap = { versFiche, versOrig, scores: Array(docN.numPages).fill(null), methode: 'texte', manuel: true };
  } else {
    const c = correspondance(tO, tN);
    pageMap = instantDoc ? { ...pageMapDe(c), mode: 'bloc', parBloc: parBlocDe(c.versB, tO) } : pageMapDe(c);
  }
  // recopie des annotations de l'ancienne version
  const version = (rec.version || 1) + 1;
  const ns = nsJumelle(rec.courseId, version);
  const [hs, ans] = [await getAll('highlights'), await getAll('annotations')];
  const anciens = [...hs.filter((h) => h.ficheId === rec.nsAnnot).map((a) => ['highlights', a]), ...ans.filter((a) => a.ficheId === rec.nsAnnot).map((a) => ['annotations', a])];
  const idMap = new Map(anciens.map(([store, a]) => [a.id, genId(store === 'highlights' ? 'h' : 'an')]));
  const pageNouv = (p) => (typeof p === 'number' ? versNouv[p - 1] ?? null : idMap.get(p) || null);
  const memeTexte = (p, q) => tA[p - 1] && tN[q - 1] && tA[p - 1].texte === tN[q - 1].texte;
  const copies = { highlights: [], annotations: [] }, nonReplacees = [];
  // les pages ajoutées d'abord : une annotation posée sur l'une d'elles la suit
  const ordre = [...anciens].sort(([, a], [, b]) => (a.kind === 'page' ? 0 : 1) - (b.kind === 'page' ? 0 : 1));
  const placees = new Set();
  for (const [store, a] of ordre) {
    const champ = a.kind === 'page' ? 'apres' : 'page';
    const p = a[champ];
    const q = a.kind === 'page' ? (p === 0 ? 0 : pageNouv(p)) : (typeof p === 'number' ? pageNouv(p) : (placees.has(p) ? idMap.get(p) : null));
    if (q == null) { nonReplacees.push({ store, id: a.id, page: typeof p === 'number' ? p : 'ajoutée', type: typeDe(store, a), texte: texteDe(a) }); continue; }
    if (a.kind === 'page') placees.add(a.id);
    const copie = { ...a, id: idMap.get(a.id), ficheId: ns, [champ]: q, copieDe: a.id };
    for (const k of ['surlignageId', 'formeId', 'imageId']) if (copie[k] && idMap.has(copie[k])) copie[k] = idMap.get(copie[k]);
    // surlignage : son ancre (index des morceaux de texte de la page) ne vaut que si le texte de la page est le même
    if (store === 'highlights' && copie.anchor && !(typeof p === 'number' && memeTexte(p, q))) { delete copie.anchor; copie.replaceApprox = true; }
    delete copie.updatedAt;
    copies[store].push(copie);
  }
  if (copies.highlights.length) await putMany('highlights', copies.highlights);
  if (copies.annotations.length) await putMany('annotations', copies.annotations);
  const ecrit = await put(STORE, {
    ...rec, fileId, fileName: fichier.name || 'fiche.pdf', version, nsAnnot: ns, nbPagesFiche: docN.numPages, nbPagesOrig: tO.length, pageMap,
    versions: [...(rec.versions || []), { version: rec.version || 1, fileId: rec.fileId, fileName: rec.fileName, nsAnnot: rec.nsAnnot, remplaceeLe: new Date().toISOString() }],
    nonReplacees, replacees: copies.highlights.length + copies.annotations.length,
  });
  prevenir();
  return ecrit;
}

/* ---------------- document éditable : ancres par bloc ---------------- */
const texteNoeud = (n) => (!n ? '' : n.type === 'text' ? n.text || '' : (n.content || []).map(texteNoeud).join(n.type === 'paragraph' || n.type === 'heading' ? '' : ' '));
const normTexte = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
function empreinte(t) { let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); }
/** blocs de premier niveau du flux : [{ type, texte, cle }] — `cle` = ancre stable du bloc */
export function blocsDuFlux(json) {
  const vus = new Map();
  return ((json && json.content) || []).map((n) => {
    const texte = texteNoeud(n).trim();
    const base = `${n.type}:${empreinte(normTexte(texte).slice(0, 300))}`;
    const k = vus.get(base) || 0; vus.set(base, k + 1);
    return { type: n.type, texte, cle: `${base}#${k}` };
  });
}
/** pages d'un document : [{ texte, titre, ancre }] — `instant` = { blocs, pag: [{ page }], nb } */
export function pagesDocument(instant) {
  const nb = Math.max(1, instant.nb || 1);
  const pages = Array.from({ length: nb }, () => ({ morceaux: [], titre: '', ancre: null }));
  instant.blocs.forEach((b, i) => {
    const p = pages[Math.max(0, Math.min(nb - 1, (instant.pag[i] && instant.pag[i].page) || 0))];
    if (!b.texte) return;
    p.morceaux.push(b.texte);
    if (!p.ancre) p.ancre = b.cle;
    if (!p.titre && /^heading/.test(b.type)) p.titre = b.texte;
  });
  return pages.map((p) => ({ texte: p.morceaux.join(' '), titre: p.titre || p.morceaux[0] || '', ancre: p.ancre }));
}
/** correspondance ACTUELLE d'un cours « document » : les ancres retrouvées dans le flux, leur page lue
    dans la pagination. { versFiche (par page du document), versOrig (par page de fiche), perdues } */
export function pageMapDocument(pm, instant, nbFiche) {
  const nb = Math.max(1, instant.nb || 1);
  const pageDeCle = new Map(instant.blocs.map((b, i) => [b.cle, (instant.pag[i] && instant.pag[i].page) || 0]));
  const versFiche = Array(nb).fill(null), versOrig = Array(nbFiche).fill(null), perdues = [];
  (pm.parBloc || []).forEach((e) => {
    if (!e || e.fiche == null || !e.ancre) return;
    const p = pageDeCle.get(e.ancre);
    if (p == null) { perdues.push(e.fiche); return; } // bloc supprimé : sans équivalent, sans erreur
    if (versFiche[p] == null) versFiche[p] = e.fiche;
    if (versOrig[e.fiche - 1] == null) versOrig[e.fiche - 1] = p + 1;
  });
  return { ...pm, versFiche, versOrig, perdues };
}
/** parBloc depuis une correspondance « par page » du document actuel */
export const parBlocDe = (versFiche, pages) => versFiche.map((f, i) => ({ ancre: pages[i] ? pages[i].ancre : null, fiche: f == null ? null : f })).filter((e) => e.ancre);

/* ---------------- navigation ---------------- */
/** page correspondante dans l'autre document : { page, exacte, raison }. `deFiche` : on part
    de la fiche. Une page sans équivalent renvoie la plus proche qui en a un (avant, sinon après). */
export function pageCorrespondante(pageMap, page, deFiche) {
  const table = deFiche ? pageMap.versOrig : pageMap.versFiche;
  const direct = table[page - 1];
  if (direct != null) return { page: direct, exacte: true };
  for (let d = 1; d < table.length; d++) {
    if (table[page - 1 - d] != null) return { page: table[page - 1 - d], exacte: false, raison: deFiche ? 'ajoutee' : 'sansEquivalent' };
    if (table[page - 1 + d] != null) return { page: table[page - 1 + d], exacte: false, raison: deFiche ? 'ajoutee' : 'sansEquivalent' };
  }
  return { page: 1, exacte: false, raison: deFiche ? 'ajoutee' : 'sansEquivalent' };
}

/* vue affichée (original / fiche) : préférence de l'appareil, par cours */
const cleVue = (courseId) => 'medrevise.jumelle.vue.' + courseId;
/* (15/10 soir) le mode « Les deux » (côte à côte) est RETIRÉ : son ancien réglage d'appareil
   (`medrevise.jumelle.lesDeux`) est effacé et l'on retombe sur « Original », sans message. */
const ANCIEN_COTE_A_COTE = 'medrevise.jumelle.lesDeux';
function oublierCoteACote() {
  if (localStorage.getItem(ANCIEN_COTE_A_COTE) === null) return false;
  localStorage.removeItem(ANCIEN_COTE_A_COTE);
  Object.keys(localStorage).filter((k) => k.startsWith('medrevise.jumelle.vue.')).forEach((k) => localStorage.removeItem(k));
  return true;
}
export function lireVue(courseId) {
  try {
    if (oublierCoteACote()) return 'original';
    return localStorage.getItem(cleVue(courseId)) === 'fiche' ? 'fiche' : 'original';
  } catch (e) { return 'original'; }
}
export function ecrireVue(courseId, v) { try { localStorage.setItem(cleVue(courseId), v); } catch (e) { /* ignore */ } }
