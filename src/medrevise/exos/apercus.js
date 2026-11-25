/* ============================================================
   MedRevise — Exos : APERÇUS des cartes (25/11/2026, docs/compte-rendu-section-exos.md).
   Aperçu d'une notion = 1re page de la fiche PDF, sinon du premier fichier d'exercices PDF ; un fichier HTML
   donne une vignette neutre portant son titre (<title> ou premier <h1>). Rendu UNE fois par fichier (pdf.js, petite
   taille, JPEG), mis en cache dans le store LOCAL `meta` (clé 'exoApercu:<fileId>', jamais synchronisé : chaque
   appareil le refait au besoin). File d'attente d'un seul rendu à la fois, lancée hors du rendu de la page : la
   grille s'affiche tout de suite avec la vignette neutre, l'image arrive ensuite.
   ============================================================ */
import { getMeta, setMeta, getBlob } from '../lib/storage.js';

const CLE = (fileId) => 'exoApercu:v1:' + fileId;
const memoire = new Map(); // fileId → { kind:'image', src } | { kind:'html', titre } | { kind:'aucun' }
const abonnes = new Set();
const enCours = new Map();
let file = Promise.resolve();

export const apercuEnMemoire = (fileId) => memoire.get(fileId) || null;
export function surApercu(f) { abonnes.add(f); return () => abonnes.delete(f); }
const publier = (fileId, a) => { memoire.set(fileId, a); abonnes.forEach((f) => { try { f(fileId, a); } catch (e) { /* ignore */ } }); };

async function rendrePdf(blob) {
  const [{ openPdf }] = await Promise.all([import('../pdf/pdfjsSetup.js')]);
  const doc = await openPdf(new Uint8Array(await blob.arrayBuffer()));
  try {
    const page = await doc.getPage(1);
    const v1 = page.getViewport({ scale: 1 });
    const scale = 440 / v1.width; // ~440 px de large : net sur une carte de 260 px en Retina
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width); canvas.height = Math.round(Math.min(vp.height, vp.width * 1.42));
    const c = canvas.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: c, viewport: vp }).promise;
    return canvas.toDataURL('image/jpeg', 0.78);
  } finally { try { doc.destroy(); } catch (e) { /* ignore */ } }
}
async function titreHtml(blob) {
  const t = await blob.text();
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(t) || /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(t);
  const brut = m ? m[1].replace(/<[^>]+>/g, ' ') : '';
  const el = document.createElement('textarea'); el.innerHTML = brut; // entités HTML → texte (jamais exécuté)
  return el.value.replace(/\s+/g, ' ').trim().slice(0, 80);
}

/** demande l'aperçu d'un fichier de notion ({ fileId, type }) ; rend la valeur en cache tout de suite si connue */
export function demanderApercu(fichier) {
  if (!fichier || !fichier.fileId) return null;
  const id = fichier.fileId;
  if (memoire.has(id)) return memoire.get(id);
  if (enCours.has(id)) return null;
  const p = (async () => {
    const cache = await getMeta(CLE(id)).catch(() => null);
    if (cache) { publier(id, cache); return; }
    file = file.then(async () => {
      try {
        const blob = await getBlob(id);
        if (!blob) { publier(id, { kind: 'aucun' }); return; } // hors ligne, fichier pas encore là : réessai plus tard
        const a = fichier.type === 'html' ? { kind: 'html', titre: await titreHtml(blob) } : { kind: 'image', src: await rendrePdf(blob) };
        await setMeta(CLE(id), a).catch(() => {});
        publier(id, a);
      } catch (e) { publier(id, { kind: 'aucun' }); }
    }).catch(() => {});
    await file;
  })().finally(() => enCours.delete(id));
  enCours.set(id, p);
  return null;
}
/** oublie l'aperçu « aucun » (fichier arrivé depuis) pour qu'il soit redemandé */
export function oublierEchecs() { [...memoire.entries()].forEach(([k, v]) => { if (v.kind === 'aucun') memoire.delete(k); }); }

/** fichier qui donne l'aperçu d'une notion : la fiche PDF, sinon le premier PDF d'exercices, sinon le premier fichier */
export function fichierApercu(n) {
  if (n.fiche) return n.fiche;
  const ex = n.exercices || [];
  return ex.find((f) => f.type === 'pdf') || ex[0] || null;
}

/** HORS LIGNE : copie locale de tous les fichiers des notions (téléchargés une fois, en tâche de fond) */
let prechargement = null;
export function prechargerFichiers(notions) {
  if (prechargement) return prechargement;
  prechargement = (async () => {
    for (const n of notions) for (const f of [...(n.fiche ? [n.fiche] : []), ...(n.exercices || [])]) {
      try { await getBlob(f.fileId); } catch (e) { /* réseau absent : au prochain passage */ }
    }
  })().finally(() => { setTimeout(() => { prechargement = null; }, 30000); });
  return prechargement;
}
