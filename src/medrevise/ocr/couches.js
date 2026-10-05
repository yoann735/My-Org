/* ============================================================
   MedRevise — OCR : couches de texte (store `ocr_layer`).

   Enregistrement (une couche = UN fichier PDF) :
     { id, courseId, fileHash, engine, engineVersion, langs, status ('en_cours' | 'complete'),
       pageCount, pagesDone, confidence, pagesGz, createdAt, updatedAt }
   `pagesGz` = JSON des pages compressé (gzip, CompressionStream) puis en base64 :
     pages[{ pageIndex, width, height, natif?, confidence, words[{ t, x, y, w, h, c, line, para }] }]
   Coordonnées en UNITÉS PDF (échelle 1, origine en haut à gauche) — normalisées par
   width/height, c'est le repère des annotations.

   IDENTIFIANT = empreinte SHA-256 du fichier + version du moteur : le même PDF (même
   rattaché à deux cours, ou reçu d'un autre appareil) n'est jamais traité deux fois,
   et un changement de moteur relance l'OCR.
   ============================================================ */
import { getOne, getAll, put, getBlob } from '../lib/storage.js';
import { creerSynchroIsolee } from '../lib/synchroIsolee.js';
import { MOTEUR_PAR_DEFAUT } from './moteur.js';

const STORE = 'ocr_layer';
const tagVersion = (v) => String(v).replace(/[^a-z0-9]+/gi, '-');
export const idCouche = (hash, version = MOTEUR_PAR_DEFAUT.version) => `ocr_${hash.slice(0, 32)}_${tagVersion(version)}`;

/* ---- empreinte, mémorisée par pdfId (un PDF n'est lu qu'une fois pour la calculer) ---- */
const CLE_HASH = 'medrevise.ocr.empreintes';
const lireHashs = () => { try { return JSON.parse(localStorage.getItem(CLE_HASH) || '{}'); } catch (e) { return {}; } };
export async function empreinteDe(pdfId, blob = null) {
  const m = lireHashs();
  if (m[pdfId]) return m[pdfId];
  const b = blob || await getBlob(pdfId);
  if (!b) return null;
  const buf = await crypto.subtle.digest('SHA-256', await b.arrayBuffer());
  const hex = [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
  try { m[pdfId] = hex; localStorage.setItem(CLE_HASH, JSON.stringify(m)); } catch (e) { /* stockage plein : on recalculera */ }
  return hex;
}

/* ---- compression ---- */
async function gzipBase64(obj) {
  const flux = new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream('gzip'));
  const octets = new Uint8Array(await new Response(flux).arrayBuffer());
  let bin = '';
  for (let i = 0; i < octets.length; i += 0x8000) bin += String.fromCharCode.apply(null, octets.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function base64Gunzip(b64) {
  const bin = atob(b64);
  const octets = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
  const flux = new Blob([octets]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(flux).text());
}

/* ---- lecture / écriture ---- */
const cachePages = new Map(); // id → { maj, pages } (évite de décompresser à chaque rendu)
export async function lireCouche(id) {
  const r = await getOne(STORE, id);
  if (!r) return null;
  const c = cachePages.get(id);
  if (c && c.maj === r.updatedAt) return { ...r, pages: c.pages };
  const pages = r.pagesGz ? await base64Gunzip(r.pagesGz) : (r.pages || []);
  cachePages.set(id, { maj: r.updatedAt, pages });
  return { ...r, pages };
}

/** Écrit la couche (pages en clair en entrée), compresse, met à jour le cache. */
export async function ecrireCouche(couche) {
  const { pages, ...meta } = couche;
  const pagesGz = await gzipBase64(pages);
  const rec = await put(STORE, { ...meta, pagesGz });
  cachePages.set(rec.id, { maj: rec.updatedAt, pages });
  return { ...rec, pages };
}

export async function toutesLesCouches() {
  return ((await getAll(STORE)) || []).filter((r) => r && r.id);
}

/** Statistiques d'une couche (pages OCR, natives, faible confiance). */
export function statsCouche(c) {
  const pages = (c && c.pages) || [];
  const ocr = pages.filter((p) => p && !p.natif);
  const faibles = ocr.filter((p) => p.confidence < 70).map((p) => p.pageIndex + 1);
  const conf = ocr.length ? Math.round(ocr.reduce((s, p) => s + (p.confidence || 0), 0) / ocr.length) : null;
  return { faites: pages.filter(Boolean).length, ocr: ocr.length, natives: pages.filter((p) => p && p.natif).length, faibles, confiance: conf };
}

/* ---- synchro : seules les couches COMPLÈTES voyagent (une couche partielle reste
   locale ; l'appareil qui la calcule la poussera une fois finie) ---- */
const sync = creerSynchroIsolee(STORE, { envoyable: (r) => r.status === 'complete' });
export const pousserCouche = sync.pousserMaintenant;
export const synchroOcr = sync.synchro;
