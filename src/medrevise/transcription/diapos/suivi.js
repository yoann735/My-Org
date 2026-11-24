/* ============================================================
   MedRevise — SUIVI AUTOMATIQUE DES DIAPOS : pilote côté fil principal (24/11/2026,
   docs/compte-rendu-suivi-auto-diapos.md).

   - reçoit du moteur de transcription la piste VIDÉO du partage d'onglet déjà ouvert (aucune
     seconde demande de partage) et la passe au Web Worker (MediaStreamTrackProcessor, flux
     transféré : le fil principal ne touche jamais une image) ;
   - prépare les pages du PDF du cours (pagesCours.js), une fois ;
   - quand le worker hésite entre deux pages, lance l'OCR de l'app (même worker Tesseract,
     ocr/moteur.js) sur la capture et lui renvoie le texte ;
   - range chaque changement : l'heure, la page reconnue, la petite image recadrée (JPEG ≈ 480 px)
     dans le store LOCAL `meta` (clé `diapos.img:<session>:<n>`) — jamais envoyée ailleurs ;
   - publie un petit état pour l'interface (« Diapo 12 · auto », « Diapo non reconnue »).
   Le son n'est JAMAIS touché : le suivi peut démarrer, échouer ou s'arrêter sans effet sur la
   transcription.
   ============================================================ */
import { getMeta, setMeta } from '../../lib/storage.js';
import { moteurOcr } from '../../ocr/moteur.js';
import { preparerPages, numerotation, mesuresPreparation } from './pagesCours.js';

const CLE_ACTIF = 'medrevise.transcription.suiviDiapos'; // '0' = désactivé ; actif par défaut
export const suiviVoulu = () => { try { return localStorage.getItem(CLE_ACTIF) !== '0'; } catch (e) { return true; } };

/* ---------- état observable ---------- */
const ETAT0 = { disponible: false, actif: false, statut: 'arrete', page: null, nbPages: 0, nonReconnue: false, changements: 0 };
let etat = ETAT0;
const abonnes = new Set();
export const lireSuivi = () => etat;
export function abonnerSuivi(f) { abonnes.add(f); return () => abonnes.delete(f); }
function publier(p) { etat = { ...etat, ...p }; abonnes.forEach((f) => f()); }

/* mesures (banc, compte rendu) */
export const mesures = { principalMaxMs: 0, principalTotalMs: 0, appels: 0, delais: [], octets: 0, ocr: 0, preparation: mesuresPreparation };
const mesurer = (f) => { const t0 = performance.now(); try { return f(); } finally { const d = performance.now() - t0; mesures.principalMaxMs = Math.max(mesures.principalMaxMs, d); mesures.principalTotalMs += d; mesures.appels += 1; } };

/* ---------- un worker, partagé par le direct et la répartition après coup ---------- */
let worker = null;
const rpc = new Map(); let nRpc = 0;
let surMessage = null; // gestionnaire du direct
export function leWorker() {
  if (!worker) {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (ev) => {
      const m = ev.data || {};
      if ((m.type === 'signature' || m.type === 'scores' || m.type === 'prepare') && rpc.has(m.id)) { rpc.get(m.id)(m); rpc.delete(m.id); return; }
      if (surMessage) surMessage(m);
    };
  }
  return worker;
}
export function appelWorker(msg, transfert = []) {
  const id = 'r' + (++nRpc);
  return new Promise((resolve) => { rpc.set(id, resolve); leWorker().postMessage({ ...msg, id }, transfert); });
}
export const signer = (rgba, w, h) => appelWorker({ type: 'signerPage', rgba, w, h }).then((m) => m.sig);
/** rend les pages d'un PDF dans le worker (transfert des octets, aucun dessin sur le fil principal) */
export const rendrePdf = (pdf) => appelWorker({ type: 'preparer', pdf, largeur: 480 }, [pdf]);

/** texte d'une capture par l'OCR de l'app (même worker Tesseract que les PDF et les images) */
export async function lireTexte(bitmap) {
  mesures.ocr += 1;
  try {
    const r = await moteurOcr().recognizePage(bitmap);
    return r.mots.filter((m) => (m.c || 0) >= 40).map((m) => m.t).join(' ');
  } catch (e) { return ''; } finally { try { bitmap.close(); } catch (e) { /* transférée */ } }
}

/* ---------- direct ---------- */
let session = null; // { courseId, sessionId, tempsCours(ms) → s, surChangement(ch) }
let relecteur = null; // repli sans MediaStreamTrackProcessor
let nChangements = 0;

/**
 * @param {object} o
 * @param {MediaStreamTrack} o.track piste vidéo du partage d'onglet
 * @param {string} o.courseId @param {string} o.sessionId
 * @param {(dateMs: number) => number} o.tempsCours instant de cours (s) d'une date
 * @param {(ch) => void} o.surChangement changement reconnu (ou non) → le moteur de transcription
 * @param {number} [o.premier] numéro du prochain changement (reprise)
 * @param {number|null} [o.courant] page actuelle (reprise)
 */
export async function demarrerSuivi({ track, courseId, sessionId, tempsCours, surChangement, premier = 0, courant = null }) {
  arreterSuivi();
  if (!track || track.readyState !== 'live') return false;
  session = { courseId, sessionId, tempsCours, surChangement };
  nChangements = premier;
  const w = leWorker();
  surMessage = (m) => mesurer(() => recevoir(m));
  publier({ ...ETAT0, disponible: true, actif: suiviVoulu(), statut: 'preparation', changements: premier });
  try { await track.applyConstraints({ frameRate: { max: 5 } }); } catch (e) { /* contrainte refusée : sans effet */ }
  w.postMessage({ type: 'actif', actif: suiviVoulu() });
  if (courant) w.postMessage({ type: 'courant', page: courant });
  if (typeof MediaStreamTrackProcessor === 'function') {
    const proc = new MediaStreamTrackProcessor({ track });
    w.postMessage({ type: 'flux', readable: proc.readable }, [proc.readable]);
  } else {
    // repli : une image par 500 ms depuis un élément vidéo (jamais affiché)
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = new MediaStream([track]);
    v.play().catch(() => {});
    relecteur = setInterval(async () => { if (v.readyState >= 2) { try { const b = await createImageBitmap(v); w.postMessage({ type: 'image', bitmap: b }, [b]); } catch (e) { /* image pas prête */ } } }, 500);
    relecteur.video = v;
  }
  try {
    const prep = await preparerPages(courseId, rendrePdf);
    if (!session || session.sessionId !== sessionId) return true;
    session.numero = await numerotation(courseId);
    session.pdfId = prep.pdfId;
    w.postMessage({ type: 'pages', sigs: prep.sigs, textes: prep.textes, aspects: prep.aspects });
    publier({ statut: prep.sigs.length ? 'suivi' : 'sansPdf', nbPages: prep.sigs.length });
  } catch (e) {
    publier({ statut: 'sansPdf', nbPages: 0 });
  }
  return true;
}

export function arreterSuivi() {
  if (worker) worker.postMessage({ type: 'arret' });
  if (relecteur) { clearInterval(relecteur); try { relecteur.video.srcObject = null; } catch (e) { /* ignore */ } relecteur = null; }
  session = null; surMessage = null;
  publier({ ...ETAT0 });
}

/** interrupteur « Suivre les diapos automatiquement » (mémorisé sur l'appareil) */
export function activerSuivi(on) {
  try { localStorage.setItem(CLE_ACTIF, on ? '1' : '0'); } catch (e) { /* bloqué */ }
  if (worker && session) worker.postMessage({ type: 'actif', actif: !!on });
  publier({ actif: !!on, ...(on ? {} : { nonReconnue: false }) });
}

function recevoir(m) {
  if (!session) return;
  if (m.type === 'ocr') { lireTexte(m.bitmap).then((texte) => worker && worker.postMessage({ type: 'texte', id: m.id, texte })); return; }
  if (m.type === 'etat' && m.flux === 'fini') { publier({ statut: 'coupe' }); return; }
  if (m.type !== 'changement') return;
  const s = session;
  const n = nChangements++;
  const cleImg = `diapos.img:${s.sessionId}:${n}`;
  mesures.octets += m.jpeg ? m.jpeg.size : 0;
  if (m.jpeg) setMeta(cleImg, m.jpeg).catch(() => {});
  const delai = m.tDecide - m.tChangement;
  mesures.delais.push(delai);
  const page = m.page || null;
  const ch = {
    n, t: Math.round(s.tempsCours(m.tChangement) * 100) / 100, le: new Date(m.tChangement).toISOString(),
    page: page ? (s.numero ? s.numero(page) : page) : null, pageCle: page, nonReconnue: !!m.nonReconnue,
    score: m.score, marge: m.marge, delaiMs: delai, img: m.jpeg ? cleImg : null, masque: m.masque, zone: m.zone,
    ...(m.texte ? { texte: m.texte.slice(0, 400) } : {}),
  };
  // hésitation (deux pages trop proches) : on garde la diapo actuelle, l'indication ne change pas
  publier({ changements: nChangements, ...(page ? { page: ch.page, nonReconnue: false } : m.nonReconnue ? { nonReconnue: true } : {}) });
  s.surChangement(ch);
}

/** image gardée d'un changement (Blob JPEG) — local à l'appareil */
export const imageChangement = (cleImg) => (cleImg ? getMeta(cleImg) : Promise.resolve(null));
