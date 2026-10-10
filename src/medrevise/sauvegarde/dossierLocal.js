/* ============================================================
   MedRevise — COPIE DES FICHIERS ET DES DONNÉES DANS UN DOSSIER LOCAL (filet de sécurité, 11/10/2026).
   File System Access API (Chrome, Edge, Aside… ; absente sur Safari iOS → section masquée).
   - Le dossier est choisi UNE fois (Réglages → Sauvegardes) ; sa poignée est gardée dans `meta`
     (local à l'appareil). Permission persistante demandée (navigator.storage.persist) ; si Chrome
     la retire, une ligne discrète « Autoriser l'accès… » apparaît (jamais de fenêtre intempestive).
   - À l'ouverture, au plus UNE FOIS PAR SEMAINE : tous les PDF / images du cloud absents du
     dossier ou modifiés (empreinte du bucket) y sont écrits, sous « <cours>/<fichier> », puis
     l'export complet des données (le même que la copie serveur) dans « données/YYYY-MM-DD/ ».
   - Incrémental : un index caché (.medrevise-index.json) retient ce qui a déjà été écrit. Rien n'est
     jamais supprimé, SAUF les vieux exports de données au-delà des 8 derniers (« données/… »).
   - Lecture seule côté données : IndexedDB et cloud (GET) ; seul le dossier choisi est écrit.
   ============================================================ */
import { getMeta, setMeta, getOne } from '../lib/storage.js';
import { pullBlob } from '../data/sync.js';
import { lireCloud } from './lecture.js';
import { construireExport } from './export.js';

const CLE_POIGNEE = 'dossier.poignee';
const CLE_DERNIERE = 'dossier.derniereCopie';
const INDEX = '.medrevise-index.json';
export const JOURS_ENTRE_COPIES = 7;
export const EXPORTS_GARDES = 8;

export const dossierDisponible = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
const propre = (s, n = 80) => String(s || '').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) || 'sans-nom';
const extension = (type, nom) => (/\.[a-z0-9]{2,5}$/i.test(nom || '') ? '' : type === 'application/pdf' ? '.pdf' : type && type.startsWith('image/') ? '.' + type.split('/')[1].replace('jpeg', 'jpg') : type === 'text/html' ? '.html' : '');

/** état : { disponible, choisi, nom, permission: 'granted'|'prompt'|'denied', derniere } */
export async function etatDossier() {
  if (!dossierDisponible()) return { disponible: false };
  const poignee = await getMeta(CLE_POIGNEE);
  const derniere = (await getMeta(CLE_DERNIERE)) || null;
  if (!poignee) return { disponible: true, choisi: false, derniere };
  let permission = 'prompt';
  try { permission = await poignee.queryPermission({ mode: 'readwrite' }); } catch (e) { permission = 'prompt'; }
  return { disponible: true, choisi: true, nom: poignee.name, permission, derniere };
}

/** « Choisir le dossier des fichiers » (geste utilisateur) */
export async function choisirDossier() {
  const poignee = await window.showDirectoryPicker({ id: 'medrevise-sauvegarde', mode: 'readwrite' });
  await setMeta(CLE_POIGNEE, poignee);
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* facultatif */ }
  return poignee;
}

/** « Autoriser l'accès au dossier de sauvegarde » (geste utilisateur) */
export async function autoriserDossier() {
  const poignee = await getMeta(CLE_POIGNEE);
  if (!poignee) return 'absent';
  try { return await poignee.requestPermission({ mode: 'readwrite' }); } catch (e) { return 'denied'; }
}

async function sousDossier(racine, chemin) {
  let d = racine;
  for (const p of chemin) d = await d.getDirectoryHandle(p, { create: true });
  return d;
}
async function ecrire(racine, chemin, contenu) {
  const parties = chemin.split('/');
  const d = await sousDossier(racine, parties.slice(0, -1));
  const f = await d.getFileHandle(parties[parties.length - 1], { create: true });
  const w = await f.createWritable();
  await w.write(contenu); await w.close();
}
async function lireTexte(racine, nom) {
  try { const f = await racine.getFileHandle(nom); return await (await f.getFile()).text(); } catch (e) { return null; }
}
async function existe(racine, chemin) {
  try {
    const parties = chemin.split('/'); let d = racine;
    for (const p of parties.slice(0, -1)) d = await d.getDirectoryHandle(p);
    await d.getFileHandle(parties[parties.length - 1]); return true;
  } catch (e) { return false; }
}

/** nom lisible de chaque fichier du cloud : « <cours>/<fichier> » d'après les fiches et les cartes */
export function nommerFichiers(records, fichiersBucket) {
  const vivants = (store) => records.filter((r) => r.store === store && !r.deleted && r.data);
  const fiches = new Map(vivants('fiches').map((r) => [String(r.record_id), r.data]));
  const noms = new Map();
  const poser = (id, cours, nom) => { if (id && !noms.has(id)) noms.set(id, { cours: propre(cours), nom: propre(nom, 120) }); };
  for (const f of fiches.values()) {
    const cours = f.titre || f.title || 'cours';
    if (f.pdfId) poser(f.pdfId, cours, f.pdfName || `${cours}.pdf`);
    if (f.htmlId) poser(f.htmlId, cours, f.htmlName || `${cours}.html`);
    if (f.imageId) poser(f.imageId, cours, `${cours}-image`);
  }
  for (const r of vivants('notes')) { const n = r.data; if (n.pdfId) poser(n.pdfId, 'Prise de notes', n.pdfName || n.titre || n.id); }
  const blobsConnus = new Set(fichiersBucket.map((f) => f.nom));
  for (const r of [...vivants('questions'), ...vivants('dessins'), ...vivants('annotations')]) {
    const q = r.data; const f = fiches.get(String(q.ficheId)) || {};
    const cours = f.titre || f.title || (r.store === 'questions' ? 'cartes sans cours' : r.store);
    const visiter = (v) => {
      if (typeof v === 'string') { if (blobsConnus.has(v)) poser(v, cours, `images/${propre(q.recto || q.titre || r.store, 40)}-${v}`); return; }
      if (Array.isArray(v)) v.forEach(visiter); else if (v && typeof v === 'object') Object.values(v).forEach(visiter);
    };
    visiter(q);
  }
  return noms;
}

/** la copie elle-même. `force` : sans attendre la semaine. */
export async function copierDansDossier({ force = false, url = import.meta.env.VITE_SUPABASE_URL, cle = import.meta.env.VITE_SUPABASE_ANON_KEY, jour = new Date().toLocaleDateString('fr-CA'), surProgression = () => {} } = {}) {
  const etat = await etatDossier();
  if (!etat.disponible || !etat.choisi) return { ok: false, raison: 'aucun dossier' };
  if (etat.permission !== 'granted') return { ok: false, raison: 'permission' };
  if (!force && etat.derniere && Date.now() - Date.parse(etat.derniere.le) < JOURS_ENTRE_COPIES * 86400000) return { ok: true, raison: 'récente', saute: true };
  const racine = await getMeta(CLE_POIGNEE);
  surProgression('Lecture du cloud…');
  const cloud = await lireCloud({ url, cle });
  const index = JSON.parse((await lireTexte(racine, INDEX)) || '{}');
  const noms = nommerFichiers(cloud.records, cloud.fichiersBucket);
  const pris = new Set(Object.values(index).map((x) => x.chemin));
  const stats = { nouveaux: 0, misAJour: 0, inchanges: 0, introuvables: 0 };
  let i = 0;
  for (const f of cloud.fichiersBucket) {
    i++;
    const deja = index[f.nom];
    if (deja && deja.empreinte === f.empreinte && deja.taille === f.taille && (await existe(racine, deja.chemin))) { stats.inchanges++; continue; }
    surProgression(`Fichiers : ${i} / ${cloud.fichiersBucket.length}`);
    let blob = await getOne('blobs', f.nom).catch(() => null);
    if (!(blob instanceof Blob)) blob = await pullBlob(f.nom);
    if (!(blob instanceof Blob)) { stats.introuvables++; continue; }
    const n = noms.get(f.nom) || { cours: '_autres', nom: f.nom };
    let chemin = deja ? deja.chemin : `${n.cours}/${n.nom}${extension(blob.type || f.type, n.nom)}`;
    if (!deja && pris.has(chemin)) chemin = chemin.replace(/(\.[a-z0-9]{2,5})?$/i, `-${f.nom}$1`);
    await ecrire(racine, chemin, blob);
    pris.add(chemin);
    index[f.nom] = { chemin, taille: f.taille, empreinte: f.empreinte, ecritLe: new Date().toISOString() };
    if (deja) stats.misAJour++; else stats.nouveaux++;
  }
  surProgression('Export des données…');
  const { fichiers, manifeste } = construireExport({ ...cloud, jour });
  for (const x of fichiers) await ecrire(racine, `données/${jour}/${x.chemin}`, x.contenu);
  // garder les 8 derniers exports de données (seuls dossiers jamais supprimés : tout le reste est conservé)
  const exports = [];
  const dDonnees = await racine.getDirectoryHandle('données', { create: true });
  for await (const [nom, h] of dDonnees.entries()) if (h.kind === 'directory' && /^\d{4}-\d{2}-\d{2}$/.test(nom)) exports.push(nom);
  exports.sort();
  for (const vieux of exports.slice(0, Math.max(0, exports.length - EXPORTS_GARDES))) await dDonnees.removeEntry(vieux, { recursive: true });
  await ecrire(racine, INDEX, JSON.stringify(index, null, 1));
  const derniere = { le: new Date().toISOString(), jour, ...stats, fichiers: cloud.fichiersBucket.length, enregistrements: manifeste.comptes.enregistrements, exportsGardes: Math.min(exports.length, EXPORTS_GARDES) };
  await setMeta(CLE_DERNIERE, derniere);
  return { ok: true, ...derniere };
}
