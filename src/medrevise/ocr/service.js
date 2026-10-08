/* ============================================================
   MedRevise — OCR : file d'attente et traitement en tâche de fond.

   - UNE page à la fois, tous PDF confondus. À chaque tour, la page choisie est :
     celle affichée dans le lecteur (et ses voisines, de proche en proche) si le
     cours ouvert n'est pas fini, sinon la première page restante du PDF en tête de file.
   - Chaque page est ENREGISTRÉE dès qu'elle est prête (une coupure ne perd rien) ;
     au démarrage, les couches incomplètes sont remises en file (reprise).
   - Déclencheurs : import d'un PDF (événement `medrevise:pdf-ajoute` de putBlob),
     ouverture d'un cours dont la couche manque ou est incomplète, traitement en
     masse « HELHa kiné » (une fois, au premier démarrage après déploiement), dossier
     choisi dans les Réglages, « Relancer ».
   - Jamais deux fois le même PDF : la couche est identifiée par l'empreinte SHA-256
     du fichier + la version du moteur (couches.js).
   - Mémoire : un seul PDF OCR ouvert à la fois (détruit à la fin), chaque bitmap fermé
     après reconnaissance (pipeline.js), moteur libéré après 60 s sans travail.
   - Mobile : désactivé par défaut (rendu ~300 dpi + modèle ~50 Mo de mémoire de
     travail : trop lourd pour un téléphone) ; les couches reçues par synchro servent.
   ============================================================ */
import { getAll, getBlob, putBackup } from '../lib/storage.js';
import { moteurOcr, libererMoteur, MOTEUR_PAR_DEFAUT } from './moteur.js';
import { traiterPage, ouvrirPdfOcr } from './pipeline.js';
import { idCouche, empreinteDe, lireCouche, ecrireCouche, pousserCouche, statsCouche, pageAFaire, aMettreANiveau, toutesLesCouches } from './couches.js';

/* ---------------- réglages ---------------- */
const CLE_AUTO = 'medrevise.ocr.auto';
const CLE_MASSE = 'medrevise.ocr.masse.helha.v1';
const CLE_FILE = 'medrevise.ocr.file';
export const estMobile = () => typeof window !== 'undefined'
  && ((window.matchMedia && window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 1000) || (navigator.deviceMemory && navigator.deviceMemory < 4));
export function ocrAutoActif() {
  try { const v = localStorage.getItem(CLE_AUTO); if (v != null) return v === '1'; } catch (e) { /* défaut */ }
  return !estMobile();
}
export function setOcrAuto(on) { try { localStorage.setItem(CLE_AUTO, on ? '1' : '0'); } catch (e) { /* bloqué */ } publier({}); }

/* ---------------- état observable ---------------- */
const CLE_PAUSE = 'medrevise.ocr.pause'; // une pause choisie survit au rechargement
const pauseMemorisee = () => { try { return localStorage.getItem(CLE_PAUSE) === '1'; } catch (e) { return false; } };
let etat = { pause: pauseMemorisee(), courant: null, file: [], masse: null, version: 0, derniereErreur: null };
const abonnes = new Set();
export const lireEtatOcr = () => etat;
export function abonnerOcr(fn) { abonnes.add(fn); return () => abonnes.delete(fn); }
function publier(p) { etat = { ...etat, ...p, version: etat.version + 1 }; abonnes.forEach((f) => f()); }

/* écouteurs par couche (le lecteur se met à jour page par page) */
const ecouteursCouche = new Map(); // pdfId → Set(fn(couche))
export function ecouterCouche(pdfId, fn) {
  if (!ecouteursCouche.has(pdfId)) ecouteursCouche.set(pdfId, new Set());
  ecouteursCouche.get(pdfId).add(fn);
  return () => { const s = ecouteursCouche.get(pdfId); if (s) { s.delete(fn); if (!s.size) ecouteursCouche.delete(pdfId); } };
}
const notifierCouche = (pdfId, couche) => { (ecouteursCouche.get(pdfId) || new Set()).forEach((f) => { try { f(couche); } catch (e) { /* écouteur fautif */ } }); };

/* ---------------- file ---------------- */
let focus = null; // { pdfId, page } — cours affiché dans le lecteur
const memoriserFile = () => { try { localStorage.setItem(CLE_FILE, JSON.stringify(etat.file.map(({ pdfId, courseId, titre, origine }) => ({ pdfId, courseId, titre, origine })))); } catch (e) { /* bloqué */ } };

/** Met un PDF en file (sans doublon). `devant` : en tête. */
export function enfiler(job, { devant = false } = {}) {
  if (!job || !job.pdfId) return;
  const sans = etat.file.filter((j) => j.pdfId !== job.pdfId);
  const ancien = etat.file.find((j) => j.pdfId === job.pdfId);
  const j = { ...(ancien || {}), ...job };
  publier({ file: devant ? [j, ...sans] : [...sans, j] });
  memoriserFile();
  reveiller();
}

/** Le lecteur affiche ce PDF à cette page (null en quittant). */
export function prioriser(pdfId, page = 1) {
  focus = pdfId ? { pdfId, page: Math.max(1, page || 1) } : null;
  if (pdfId) reveiller();
}

export function pause() { try { localStorage.setItem(CLE_PAUSE, '1'); } catch (e) { /* bloqué */ } publier({ pause: true }); }
export function reprendre() { try { localStorage.removeItem(CLE_PAUSE); } catch (e) { /* bloqué */ } publier({ pause: false }); reveiller(); }

/** Relance l'OCR d'un PDF (couche remise à zéro). */
export async function relancer(pdfId, infos = {}) {
  const hash = await empreinteDe(pdfId);
  if (!hash) return;
  const id = idCouche(hash);
  const ancienne = await lireCouche(id);
  await ecrireCouche(nouvelleCouche(id, hash, infos.courseId || (ancienne && ancienne.courseId) || null, 0, (ancienne && ancienne.createdAt) || null));
  ouverts.delete(pdfId);
  complets.delete(pdfId); indisponibles.delete(pdfId);
  notifierCouche(pdfId, await lireCouche(id));
  enfiler({ pdfId, ...infos, origine: 'relance' }, { devant: true });
}

function nouvelleCouche(id, hash, courseId, pageCount, createdAt = null) {
  const now = new Date().toISOString();
  return {
    id, courseId, fileHash: hash, engine: MOTEUR_PAR_DEFAUT.nom, engineVersion: MOTEUR_PAR_DEFAUT.version,
    langs: MOTEUR_PAR_DEFAUT.langues, status: 'en_cours', pageCount, pagesDone: 0, confidence: null,
    pages: [], createdAt: createdAt || now, updatedAt: now,
  };
}

/* ---------------- boucle ---------------- */
const ouverts = new Map(); // pdfId → { hash, id, couche, doc } (au plus 2 : focus + tête de file)
const complets = new Set();      // PDF dont la couche est finie (la priorité au cours ouvert les ignore)
const indisponibles = new Set(); // PDF absents de cet appareil cette session (retentés au prochain démarrage)
let enMarche = false;
let minuteurLiberer = null;

function reveiller() {
  if (enMarche) return;
  enMarche = true;
  clearTimeout(minuteurLiberer);
  boucle().finally(() => { enMarche = false; });
}

async function preparer(job) {
  if (ouverts.has(job.pdfId)) return ouverts.get(job.pdfId);
  const blob = await getBlob(job.pdfId);
  if (!blob) return null; // pas (encore) sur cet appareil : on réessaiera à la prochaine ouverture
  const hash = await empreinteDe(job.pdfId, blob);
  const id = idCouche(hash);
  let couche = await lireCouche(id);
  if (couche && couche.status === 'complete' && !aMettreANiveau(couche)) { ouverts.set(job.pdfId, { hash, id, couche, doc: null, fini: true }); return ouverts.get(job.pdfId); }
  const doc = await ouvrirPdfOcr(blob);
  if (!couche) couche = nouvelleCouche(id, hash, job.courseId || null, doc.numPages);
  couche = { ...couche, pageCount: doc.numPages, courseId: couche.courseId || job.courseId || null };
  const o = { hash, id, couche, doc, fini: false, titre: job.titre };
  ouverts.set(job.pdfId, o);
  return o;
}

function fermer(pdfId) {
  const o = ouverts.get(pdfId);
  if (o && o.doc) { try { o.doc.destroy(); } catch (e) { /* déjà détruit */ } }
  ouverts.delete(pdfId);
}

/** Prochaine page à traiter d'une couche : la plus proche de `autour` (1-based), sinon la première restante. */
function pageSuivante(couche, autour) {
  const faites = new Set(couche.pages.filter((p) => p && !pageAFaire(p)).map((p) => p.pageIndex));
  const n = couche.pageCount;
  if (autour) {
    const c = autour - 1;
    for (let d = 0; d < n; d++) {
      for (const i of d ? [c + d, c - d] : [c]) if (i >= 0 && i < n && !faites.has(i)) return i;
    }
  }
  for (let i = 0; i < n; i++) if (!faites.has(i)) return i;
  return null;
}

async function boucle() {
  for (;;) {
    if (etat.pause) { publier({ courant: null }); return; }
    // 1) le cours affiché passe en premier ; 2) sinon la tête de file
    let job = null, autour = null;
    if (focus && !complets.has(focus.pdfId) && !indisponibles.has(focus.pdfId)) {
      const o = ouverts.get(focus.pdfId);
      if (!o || !o.fini) { job = etat.file.find((j) => j.pdfId === focus.pdfId) || { pdfId: focus.pdfId, origine: 'ouverture' }; autour = focus.page; }
    }
    if (!job) job = etat.file[0];
    if (!job) break;
    let o;
    try { o = await preparer(job); } catch (e) { o = null; publier({ derniereErreur: 'PDF illisible pour l’OCR.' }); }
    if (!o) { indisponibles.add(job.pdfId); await terminer(job.pdfId, null); continue; }
    if (o.fini) { await terminer(job.pdfId, o); continue; }
    const i = pageSuivante(o.couche, autour);
    if (i == null) { await terminer(job.pdfId, o); continue; }
    publier({ courant: { pdfId: job.pdfId, titre: job.titre || o.titre || null, page: i + 1, total: o.couche.pageCount, faites: o.couche.pages.filter(Boolean).length } });
    try {
      const res = await traiterPage(o.doc, i, moteurOcr());
      const pages = [...o.couche.pages];
      pages[i] = res;
      const faites = pages.filter((p) => p && !pageAFaire(p)).length;
      o.couche = await ecrireCouche({ ...o.couche, pages, pagesDone: faites });
      notifierCouche(job.pdfId, o.couche);
      if (etat.masse) publier({ masse: { ...etat.masse, pages: etat.masse.pages + 1 } });
    } catch (e) {
      // page illisible : réessayée UNE fois (au tour suivant), puis marquée en échec et
      // signalée dans Réglages → Reconnaissance de texte — sans bloquer la file
      const pages = [...o.couche.pages];
      const avant = pages[i];
      const essais = (avant && avant.erreur ? (avant.essais || 1) : 0) + 1;
      pages[i] = { pageIndex: i, width: 0, height: 0, confidence: 0, words: [], erreur: true, essais, message: String((e && e.message) || 'erreur').slice(0, 200) };
      o.couche = await ecrireCouche({ ...o.couche, pages, pagesDone: pages.filter((p) => p && !pageAFaire(p)).length });
      publier({ derniereErreur: 'Page ' + (i + 1) + ' : ' + ((e && e.message) || 'erreur') + (essais < 2 ? ' — nouvel essai' : '') });
    }
    await new Promise((r) => setTimeout(r, 25)); // laisse respirer l'interface entre deux pages
  }
  publier({ courant: null });
  // plus rien à faire : le moteur rend sa mémoire au bout d'une minute
  minuteurLiberer = setTimeout(() => { libererMoteur(); }, 60000);
}

async function terminer(pdfId, o) {
  if (o && !o.fini && o.couche) {
    const st = statsCouche(o.couche);
    o.couche = await ecrireCouche({ ...o.couche, status: 'complete', confidence: st.confiance });
    notifierCouche(pdfId, o.couche);
    pousserCouche(o.couche.id).catch(() => {}); // une couche complète voyage vers les autres appareils
  }
  if (o) complets.add(pdfId);
  fermer(pdfId);
  const restait = etat.file.find((j) => j.pdfId === pdfId);
  publier({ file: etat.file.filter((j) => j.pdfId !== pdfId) });
  memoriserFile();
  if (etat.masse && restait && restait.origine === 'masse') {
    const faits = etat.masse.coursFaits + 1;
    const masse = { ...etat.masse, coursFaits: faits, manquants: (etat.masse.manquants || 0) + (o ? 0 : 1) };
    if (faits >= masse.coursTotal) {
      masse.termine = true;
      // un PDF absent de cet appareil : la masse reprendra au prochain démarrage
      if (!masse.manquants) marquerMasse({ fait: true, fin: new Date().toISOString() });
    }
    publier({ masse });
  }
}

/* ---------------- couches complètes / état d'un PDF ---------------- */
/** Couche d'un PDF (lue en base), ou null si jamais commencée. */
export async function coucheDuPdf(pdfId) {
  const hash = await empreinteDe(pdfId);
  if (!hash) return null;
  return lireCouche(idCouche(hash));
}

/* ---------------- traitement en masse ---------------- */
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Sections (sources) « HELHa kiné » — jamais « rattrapage ». */
export const estSectionHelha = (src) => { const n = norm(src.nom || src.titre); return n.includes('helha') && /kin[eé]?/.test(n) && !n.includes('rattrapage'); };

/** Cours (fiches avec PDF) d'un ensemble de sources / matières / dossiers. */
export async function coursDe({ sourceIds = null, matiereIds = null, dossierIds = null }) {
  const [matieres, fiches] = await Promise.all([getAll('matieres'), getAll('fiches')]);
  const mats = new Set((matieres || []).filter((m) => (sourceIds && sourceIds.includes(m.sourceId)) || (matiereIds && matiereIds.includes(m.id))).map((m) => m.id));
  return (fiches || []).filter((f) => f && f.pdfId && !f.archive && !f.deleted
    && (mats.has(f.matiereId) || (dossierIds && dossierIds.includes(f.dossierId))))
    .map((f) => ({ pdfId: f.pdfId, courseId: f.id, titre: f.titre }));
}

const lireMasse = () => { try { return JSON.parse(localStorage.getItem(CLE_MASSE) || 'null'); } catch (e) { return null; } };
const marquerMasse = (v) => { try { localStorage.setItem(CLE_MASSE, JSON.stringify({ ...(lireMasse() || {}), ...v })); } catch (e) { /* bloqué */ } };

/** Lance un traitement en masse sur une liste de cours (dédoublonnée par PDF). */
async function lancerListe(cours, { origine = 'masse', nom = '' } = {}) {
  const vus = new Set();
  const uniques = cours.filter((c) => (vus.has(c.pdfId) ? false : vus.add(c.pdfId)));
  // déjà faits (couche complète pour la même empreinte) : comptés, pas remis en file
  let dejaFaits = 0;
  const aFaire = [];
  for (const c of uniques) {
    const hashConnu = (() => { try { return JSON.parse(localStorage.getItem('medrevise.ocr.empreintes') || '{}')[c.pdfId]; } catch (e) { return null; } })();
    const couche = hashConnu ? await lireCouche(idCouche(hashConnu)) : null;
    if (couche && couche.status === 'complete') dejaFaits++; else aFaire.push(c);
  }
  // sauvegarde AVANT le traitement en masse : la liste des cours concernés et des couches présentes
  const couches = (await getAll('ocr_layer')) || [];
  await putBackup(`pre-ocr-${origine}-${Date.now()}`, { nom, cours: uniques, couchesExistantes: couches.map((c) => ({ id: c.id, status: c.status, updatedAt: c.updatedAt })) });
  publier({ masse: { nom, coursTotal: uniques.length, coursFaits: dejaFaits, pages: 0, termine: !aFaire.length } });
  aFaire.forEach((c) => enfiler({ ...c, origine }));
  return { total: uniques.length, aFaire: aFaire.length };
}

/** Section « HELHa kiné » et ses sous-dossiers (jamais « rattrapage »). */
export async function lancerMasseHelha() {
  const sources = (await getAll('sources')) || [];
  const helha = sources.filter((s) => s && !s.archive && estSectionHelha(s));
  if (!helha.length) { marquerMasse({ fait: true, aucuneSection: true }); publier({ masse: { nom: 'HELHa kiné', coursTotal: 0, coursFaits: 0, pages: 0, termine: true, aucuneSection: true } }); return { total: 0 }; }
  marquerMasse({ lance: new Date().toISOString(), sections: helha.map((s) => s.nom || s.titre) });
  return lancerListe(await coursDe({ sourceIds: helha.map((s) => s.id) }), { origine: 'masse', nom: helha.map((s) => s.nom || s.titre).join(', ') });
}

/** Réglages : « Lancer l'OCR sur un dossier… » (source, matière ou dossier). */
export async function lancerDossier(cible) {
  const cours = await coursDe(cible.type === 'source' ? { sourceIds: [cible.id] } : cible.type === 'matiere' ? { matiereIds: [cible.id] } : { dossierIds: [cible.id] });
  return lancerListe(cours, { origine: 'masse', nom: cible.nom || '' });
}

/* ---------------- démarrage ---------------- */
let demarre = false;
/** Appelé une fois au démarrage de MedRevise (shell bureau). */
export async function demarrerOcr() {
  if (demarre || typeof window === 'undefined') return;
  demarre = true;
  window.addEventListener('medrevise:pdf-ajoute', (e) => {
    if (ocrAutoActif() && e.detail && e.detail.id) enfiler({ pdfId: e.detail.id, origine: 'import' });
  });
  if (estMobile() && !ocrAutoActif()) return;
  // reprise : file laissée par la session précédente + couches incomplètes
  try { (JSON.parse(localStorage.getItem(CLE_FILE) || '[]') || []).forEach((j) => enfiler(j)); } catch (e) { /* file illisible : ignorée */ }
  const empreintes = (() => { try { return JSON.parse(localStorage.getItem('medrevise.ocr.empreintes') || '{}'); } catch (e) { return {}; } })();
  const parHash = Object.fromEntries(Object.entries(empreintes).map(([pdfId, h]) => [h, pdfId]));
  for (const c of (await getAll('ocr_layer')) || []) {
    if (c.status === 'en_cours' && c.fileHash && parHash[c.fileHash]) enfiler({ pdfId: parHash[c.fileHash], courseId: c.courseId, origine: 'reprise' });
  }
  // (08/10) couches faites avec l'ancien traitement « page entière » : leurs pages « natives »
  // sont revérifiées par zone (seules les pages mixtes repassent par l'OCR) — en fond, après le reste
  if (ocrAutoActif()) {
    for (const r of await toutesLesCouches()) {
      if (!r || r.status !== 'complete' || !r.fileHash || !parHash[r.fileHash]) continue;
      const c = await lireCouche(r.id).catch(() => null);
      if (aMettreANiveau(c)) enfiler({ pdfId: parHash[r.fileHash], courseId: r.courseId, origine: 'mise-a-niveau' });
    }
  }
  // traitement en masse initial « HELHa kiné » (une fois ; tant qu'il n'est pas fini, il reprend)
  if (ocrAutoActif()) {
    const m = lireMasse();
    if (!m || !m.fait) await lancerMasseHelha();
  }
}

/** Pages en échec (après le nouvel essai), par cours — Réglages → Reconnaissance de texte. */
export async function pagesEnEchec() {
  const fiches = (await getAll('fiches')) || [];
  const empreintes = (() => { try { return JSON.parse(localStorage.getItem('medrevise.ocr.empreintes') || '{}'); } catch (e) { return {}; } })();
  const out = [];
  for (const r of await toutesLesCouches()) {
    const c = await lireCouche(r.id).catch(() => null);
    const st = c ? statsCouche(c) : null;
    if (!st || !st.echecs.length) continue;
    // la couche d'un PDF importé ne connaît pas toujours son cours : on le retrouve par l'empreinte
    const pdfConnu = Object.entries(empreintes).find(([, h]) => h === c.fileHash);
    const f = fiches.find((x) => x && x.id === c.courseId) || (pdfConnu && fiches.find((x) => x && x.pdfId === pdfConnu[0] && !x.deleted));
    const pdfId = (f && f.pdfId) || (pdfConnu && pdfConnu[0]) || null;
    out.push({ coucheId: c.id, courseId: (f && f.id) || c.courseId, pdfId, titre: (f && f.titre) || 'Cours', pages: st.echecs, message: (c.pages.find((p) => p && p.erreur) || {}).message || '' });
  }
  return out;
}

/* accès de test (banc CDP) */
if (typeof window !== 'undefined') window.__ocr = { lireEtatOcr, enfiler, pause, reprendre, coucheDuPdf, relancer, lancerMasseHelha };
