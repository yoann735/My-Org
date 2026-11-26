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
import { signalerDiapo, oublierCible } from './defilement.js';

const CLE_ACTIF = 'medrevise.transcription.suiviDiapos'; // '0' = désactivé ; actif par défaut
export const suiviVoulu = () => { try { return localStorage.getItem(CLE_ACTIF) !== '0'; } catch (e) { return true; } };

/* ---------- état observable ---------- */
const ETAT0 = { disponible: false, actif: false, statut: 'arrete', page: null, pageCle: null, nbPages: 0, nonReconnue: false, changements: 0, verifieeA: 0, imageA: 0, raison: null, courseId: null };
let etat = ETAT0;
const abonnes = new Set();
export const lireSuivi = () => etat;
export function abonnerSuivi(f) { abonnes.add(f); return () => abonnes.delete(f); }
function publier(p) { etat = { ...etat, ...p }; abonnes.forEach((f) => f()); }

/* journal horodaté des analyses (worker.js#noterJ) : 3 000 derniers événements, sans image — « Exporter un diagnostic » */
export const journalSuivi = [];
const garderJ = (e) => { journalSuivi.push(e); if (journalSuivi.length > 3000) journalSuivi.shift(); };
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => garderJ({ t: Date.now(), quoi: 'visibilite', etat: document.visibilityState }));

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
      if (m.type === 'journal') { garderJ(m.e); return; }
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
/* (26/11, docs/compte-rendu-suivi-diapos-continu-et-defilement.md) LE SUIVI VIT AVEC LA SESSION DE TRANSCRIPTION (engine.js,
   au même niveau que la capture audio) : aucun écran de l'app ne le démarre ni ne l'arrête. Le worker lit une COPIE de la
   piste vidéo (track.clone()) : le chien de garde peut la relire (nouvelle copie, nouveau lecteur) sans jamais toucher à la
   piste du partage ni au son. Aucune minuterie de cette page ne cadence la lecture des images. */
let session = null; // { courseId, sessionId, tempsCours(ms) → s, surChangement(ch), track, copie, fluxId }
let relecteur = null; // repli sans MediaStreamTrackProcessor (Safari) : jamais utilisé dans Chrome
let nChangements = 0;
let nFlux = 0;

const raisonPiste = (t) => (t.readyState === 'ended' ? 'partage arrêté' : t.muted ? 'partage en pause (aucune image)' : null);

/** branche une (nouvelle) copie de la piste vidéo sur le worker */
function brancherFlux(relance = false) {
  const s = session; if (!s || !worker) return false;
  const t = s.track;
  if (!t || t.readyState !== 'live' || Date.now() < bloqueBanc) return false;
  if (s.copie) { try { s.copie.stop(); } catch (e) { /* déjà arrêtée */ } }
  if (typeof MediaStreamTrackProcessor === 'function') {
    s.copie = t.clone();
    s.fluxId = ++nFlux;
    const proc = new MediaStreamTrackProcessor({ track: s.copie });
    worker.postMessage({ type: 'flux', readable: proc.readable, fluxId: s.fluxId, relance }, [proc.readable]);
    return true;
  }
  if (relecteur) return true;
  // repli : une image par 500 ms depuis un élément vidéo (jamais affiché)
  const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = new MediaStream([t]);
  v.play().catch(() => {});
  relecteur = setInterval(async () => { if (v.readyState >= 2) { try { const b = await createImageBitmap(v); worker.postMessage({ type: 'image', bitmap: b }, [b]); } catch (e) { /* image pas prête */ } } }, 500);
  relecteur.video = v;
  return true;
}

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
  const s = { courseId, sessionId, tempsCours, surChangement, track, copie: null, fluxId: 0 };
  session = s;
  nChangements = premier;
  const w = leWorker();
  surMessage = (m) => mesurer(() => recevoir(m));
  publier({ ...ETAT0, disponible: true, actif: suiviVoulu(), statut: 'preparation', changements: premier, courseId });
  garderJ({ t: Date.now(), quoi: 'demarrage', session: sessionId, visibilite: typeof document !== 'undefined' ? document.visibilityState : null });
  try { await track.applyConstraints({ frameRate: { max: 5 } }); } catch (e) { /* contrainte refusée : sans effet */ }
  if (session !== s) return false;
  // état de la piste du partage : pause / reprise / fin, notés et affichés (jamais un faux « OK »)
  const surPiste = (ev) => {
    if (session !== s) return;
    garderJ({ t: Date.now(), quoi: 'piste-' + ev.type });
    const r = raisonPiste(track);
    if (r) publier({ statut: track.readyState === 'ended' ? 'coupe' : 'pause', raison: r });
    else { publier({ statut: etat.nbPages ? 'suivi' : (etat.statut === 'preparation' ? 'preparation' : 'sansPdf'), raison: null }); brancherFlux(true); }
  };
  ['mute', 'unmute', 'ended'].forEach((e) => track.addEventListener(e, surPiste));
  s.retirer = () => ['mute', 'unmute', 'ended'].forEach((e) => track.removeEventListener(e, surPiste));
  w.postMessage({ type: 'actif', actif: suiviVoulu() });
  if (courant) w.postMessage({ type: 'courant', page: courant });
  brancherFlux(false);
  try {
    const prep = await preparerPages(courseId, rendrePdf);
    if (session !== s) return true;
    s.numero = await numerotation(courseId);
    s.pdfId = prep.pdfId;
    w.postMessage({ type: 'pages', sigs: prep.sigs, textes: prep.textes, aspects: prep.aspects });
    publier({ statut: raisonPiste(track) ? etat.statut : (prep.sigs.length ? 'suivi' : 'sansPdf'), nbPages: prep.sigs.length });
  } catch (e) {
    publier({ statut: 'sansPdf', nbPages: 0 });
  }
  return true;
}

export function arreterSuivi() {
  if (worker) worker.postMessage({ type: 'arret' });
  if (relecteur) { clearInterval(relecteur); try { relecteur.video.srcObject = null; } catch (e) { /* ignore */ } relecteur = null; }
  if (session) {
    garderJ({ t: Date.now(), quoi: 'arret-session', session: session.sessionId });
    if (session.retirer) session.retirer();
    if (session.copie) { try { session.copie.stop(); } catch (e) { /* déjà arrêtée */ } }
  }
  session = null; surMessage = null;
  oublierCible();
  publier({ ...ETAT0 });
}

/** interrupteur « Suivre les diapos automatiquement » (mémorisé sur l'appareil) */
export function activerSuivi(on) {
  try { localStorage.setItem(CLE_ACTIF, on ? '1' : '0'); } catch (e) { /* bloqué */ }
  if (worker && session) worker.postMessage({ type: 'actif', actif: !!on });
  publier({ actif: !!on, ...(on ? {} : { nonReconnue: false }) });
}

/* (banc seulement) coupe la COPIE de la piste lue par le worker, comme si le partage cessait de fournir des images :
   le chien de garde doit le voir et relire la piste. Le partage, le son et la transcription ne sont pas touchés. */
let bloqueBanc = 0;
export function couperImagesPourBanc(ms = 0) {
  if (!session || !session.copie) return false;
  bloqueBanc = Date.now() + ms; // pendant `ms`, la piste ne peut pas être relue (un partage qui ne donne plus d'image)
  garderJ({ t: Date.now(), quoi: 'banc-coupe-images', ms });
  session.copie.stop();
  return true;
}

function recevoir(m) {
  const s = session;
  if (!s) {
    // session terminée pendant une lecture OCR : on répond quand même (l'analyse du worker ne reste jamais suspendue)
    if (m.type === 'ocr' && worker) { try { m.bitmap.close(); } catch (e) { /* ignore */ } worker.postMessage({ type: 'texte', id: m.id, texte: '' }); }
    return;
  }
  if (m.type === 'ocr') { lireTexte(m.bitmap).then((texte) => worker && worker.postMessage({ type: 'texte', id: m.id, texte })); return; }
  if (m.type === 'verif') {
    publier({ verifieeA: m.tVerif, imageA: m.tImage, ...(etat.statut === 'pause' && !raisonPiste(s.track) ? { statut: etat.nbPages ? 'suivi' : 'sansPdf', raison: null } : {}) });
    return;
  }
  if (m.type === 'relancerFlux') {
    // le chien de garde du worker : plus aucune image du partage → nouvelle copie de la piste (si le partage est vivant)
    const ok = (m.fluxId == null || m.fluxId === s.fluxId) && brancherFlux(true);
    garderJ({ t: Date.now(), quoi: 'relance-flux', ok, raison: ok ? null : (raisonPiste(s.track) || 'piste indisponible') });
    if (!ok) publier({ statut: s.track.readyState === 'ended' ? 'coupe' : 'pause', raison: raisonPiste(s.track) || 'partage arrêté (aucune image)' });
    else if (etat.statut === 'coupe' || etat.statut === 'pause') publier({ statut: etat.nbPages ? 'suivi' : 'sansPdf', raison: null });
    return;
  }
  if (m.type === 'etat' && m.flux === 'fini') {
    if (m.fluxId != null && m.fluxId !== s.fluxId) return; // ancien flux remplacé
    // le lecteur s'est arrêté : partage fini, ou simple coupure de la copie → on la relit
    if (brancherFlux(true)) { garderJ({ t: Date.now(), quoi: 'relance-flux', ok: true, raison: 'lecteur arrêté' }); return; }
    garderJ({ t: Date.now(), quoi: 'relance-flux', ok: false, raison: raisonPiste(s.track) || 'partage arrêté' });
    publier({ statut: s.track.readyState === 'ended' ? 'coupe' : 'pause', raison: raisonPiste(s.track) || 'partage arrêté' }); // le chien de garde du worker réessaie
    return;
  }
  if (m.type !== 'changement') return;
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
  publier({ changements: nChangements, verifieeA: m.tDecide, ...(page ? { page: ch.page, pageCle: page, nonReconnue: false } : m.nonReconnue ? { nonReconnue: true } : {}) });
  s.surChangement(ch);
  // DÉFILEMENT (option) : une nouvelle diapo reconnue devient la cible du lecteur du cours (defilement.js)
  if (page && etat.actif) signalerDiapo({ courseId: s.courseId, page: ch.page, pageCle: page, n });
}

/** image gardée d'un changement (Blob JPEG) — local à l'appareil */
export const imageChangement = (cleImg) => (cleImg ? getMeta(cleImg) : Promise.resolve(null));
