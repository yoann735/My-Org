/* ============================================================
   MedRevise — SUIVI AUTOMATIQUE DES DIAPOS : Web Worker (24/11/2026,
   docs/compte-rendu-suivi-auto-diapos.md). Tout le calcul est ici : le fil principal ne fait
   que lui passer le flux vidéo de l'onglet (une seule fois) et ranger les résultats.

   Messages reçus
     { type: 'pages', sigs: [json], textes: [string], aspects: [number] }   pages du PDF (préparées une fois)
     { type: 'flux', readable }        ReadableStream<VideoFrame> (MediaStreamTrackProcessor) transféré
     { type: 'image', bitmap }         repli sans MediaStreamTrackProcessor : une image par seconde
     { type: 'actif', actif }          interrupteur « Suivre les diapos automatiquement »
     { type: 'courant', page }         la page actuelle (reprise de session)
     { type: 'texte', id, texte }      OCR d'une capture ambiguë (fait par le fil principal, worker de Tesseract)
     { type: 'arret' }
     { type: 'signerPage', id, rgba, w, h }                     rendu d'une page → signature
     { type: 'reconnaitre', id, bitmap, masque, courant, texte } capture gardée → scores (répartition après coup)
   Messages envoyés
     { type: 'etat', … }  { type: 'changement', … }  { type: 'ocr', id, bitmap }  { type: 'signature', id, sig }
     { type: 'scores', id, … }  { type: 'mesure', … }
   ============================================================ */
import {
  signatureDe, signatureDepuisJson, signatureVersJson, ressemblanceImage, indexTexte, scoresTexte, decider,
  trouverZones, differencesParCase, fondCommun, scoresPages, CX, CY,
} from './moteur.js';

const PETIT_W = 160; // image de détection du changement
const ZONE_W = 240; // image de recherche de la zone
const SIG_W = 320; // recadrage pour la signature
const MEMO_W = 480; // image gardée avec la session
const OCR_W = 1600;
const GRILLE_X = 32, GRILLE_Y = 18; // cases de détection (≈ 5 px)
const SEUIL_PX = 0.05; // écart d'un pixel (0…1, canal le plus changé) qui compte comme changé
const SEUIL_CASE = 0.2; // part des pixels d'une case qui ont changé : la case « bouge »
const DEBUT_CHANGEMENT = 0.04; // part des cases (hors cases vivantes) qui diffère de la diapo reconnue
const MOUVEMENT = 0.015; // part des cases qui bougent encore : pas stable
const STABLE_MS = 1500;
const ANIM_MAX_MS = 12000; // une diapo animée sans fin (vidéo) : reconnue quand même
// (26/11) contrôle au repos toutes les 500 ms (au lieu de 1 s) : délai changement → liaison ≤ 3 s (détection seule, ≈ 1 ms)
const PERIODE_REPOS = 500, PERIODE_TRANSITION = 250;
const PERIODE_APPRENTISSAGE_REPOS = 1000; // cases vivantes : cadence d'apprentissage d'avant, au repos
let tApprentissage = 0;
/* (26/11, docs/compte-rendu-suivi-diapos-continu-et-defilement.md) FONCTIONNEMENT CONTINU */
const GARDE_MS = 10000; // chien de garde : aucune image analysée depuis 10 s alors que le partage est actif → redémarrage
const IMAGE_MAX_MS = 10000; // aucune nouvelle image du partage depuis 10 s → flux relu (nouveau lecteur)
const OCR_MAX_MS = 8000; // OCR sans réponse : on décide à l'image seule (l'analyse ne reste jamais suspendue)

let pages = []; // signatures
let fond = null; // page moyenne du PDF (moteur.js#fondCommun)
let index = indexTexte([]);
let aspects = [16 / 9];
let actif = true;
let courant = null;
let image = null; // dernière VideoFrame / ImageBitmap reçue
let tImage = 0;
let lecteur = null;
let minuteur = null;
let fluxId = 0; // identifiant du flux en cours : les messages d'un flux remplacé sont ignorés
let fluxActif = false; // un flux d'images est branché
let enSession = false; // une session de transcription d'onglet est en cours (entre « flux » et « arret »)
let generation = 0; // analyse en cours : abandonnée si le chien de garde redémarre la boucle
let tGarde = 0, tRelance = 0, tFlux = 0;

/* état de la détection */
let prec = null, ref = null, petitW = 0, petitH = 0;
const activite = new Float32Array(GRILLE_X * GRILLE_Y);
let mode = 'depart'; // depart | repos | transition | analyse
let tChangement = 0, tVu = 0, tMouvement = 0, dernierControle = 0;
let zone = null; // { x, y, w, h (fraction de l'image), score, bords, fw, fh }
let dernierChangement = 0; // instant du dernier changement analysé (relecture quand les pages arrivent)
let attenteOcr = null; // { id, resolve }
let nId = 0;

const now = () => Date.now();
/* JOURNAL HORODATÉ des analyses (26/11, docs/compte-rendu-suivi-diapos-continu-et-defilement.md) : chaque événement part au
   fil principal (suivi.js le garde, « Exporter un diagnostic » l'inclut). Aucune image. Pouls toutes les 5 s. */
let nTics = 0, nImages = 0, tVerif = 0, dernierPouls = 0, tVerifEnvoyee = 0;
const noterJ = (quoi, o = {}) => postMessage({ type: 'journal', e: { t: now(), quoi, ...o } });
const fermer = (x) => { try { if (x && x.close) x.close(); } catch (e) { /* déjà fermée */ } };
const temps = { max: 0, total: 0, n: 0 };
const chrono = (f) => { const t0 = performance.now(); const r = f(); const d = performance.now() - t0; temps.max = Math.max(temps.max, d); temps.total += d; temps.n += 1; return r; };

function dimensions(src) {
  return { w: src.displayWidth || src.codedWidth || src.width, h: src.displayHeight || src.codedHeight || src.height };
}
/** dessine (une partie de) l'image source dans un canvas de largeur `lw` → { ctx, w, h } */
function dessiner(src, lw, crop = null) {
  const { w: W, h: H } = dimensions(src);
  const sx = crop ? crop.x * W : 0, sy = crop ? crop.y * H : 0, sw = crop ? crop.w * W : W, sh = crop ? crop.h * H : H;
  const w = Math.max(1, Math.round(Math.min(lw, sw))), h = Math.max(1, Math.round((w * sh) / sw));
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
  return { c, ctx, w, h };
}
/** petite image de détection : la zone de la diapo (ou tout l'onglet), ≈ 160 px de large, canaux RVB 0…1 */
let zonePetite = null; // zone utilisée par la petite image courante
function petiteImage(src) {
  zonePetite = zone;
  const p = dessiner(src, PETIT_W, zone);
  const d = p.ctx.getImageData(0, 0, p.w, p.h).data;
  const out = new Float32Array(p.w * p.h * 3);
  for (let i = 0, j = 0; j < out.length; i += 4, j += 3) { out[j] = d[i] / 255; out[j + 1] = d[i + 1] / 255; out[j + 2] = d[i + 2] / 255; }
  return { petit: out, w: p.w, h: p.h };
}
function gris(ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
  return g;
}

/* ---------- flux ---------- */
/* Les images sont lues DIRECTEMENT depuis la piste vidéo (MediaStreamTrackProcessor → ReadableStream<VideoFrame> transféré
   ici) : aucun élément vidéo, aucun requestAnimationFrame, aucune minuterie de la page. Le RYTHME est piloté dans ce worker,
   par l'arrivée des images ET par sa propre minuterie (une diapo immobile peut ne plus produire d'image). */
async function lire(readable, id) {
  const r = readable.getReader();
  if (id === fluxId) lecteur = r;
  let premier = true;
  try {
    for (;;) {
      const { value, done } = await r.read();
      if (done) break;
      if (id !== fluxId) { fermer(value); break; } // flux remplacé
      fermer(image); image = value; tImage = now(); nImages++;
      if (premier) { premier = false; noterJ('premiere-image', { flux: id }); }
      tic(); // une image arrivée = un battement (tic ne fait rien avant sa période)
    }
  } catch (e) { if (id === fluxId) noterJ('flux-erreur', { flux: id, raison: String((e && e.message) || e).slice(0, 120) }); }
  try { r.releaseLock(); } catch (e) { /* déjà libéré */ }
  if (id !== fluxId) return; // un nouveau flux a pris la place : rien à signaler
  fermer(image); image = null; fluxActif = false;
  noterJ('flux-fini', { flux: id });
  postMessage({ type: 'etat', flux: 'fini', fluxId: id });
}

function demarrerMinuteur() {
  if (minuteur) return;
  minuteur = setInterval(() => { tic(); garde(); }, PERIODE_TRANSITION);
}

/** repart de zéro pour la détection (la diapo affichée est relue tout de suite) ; une analyse en cours est abandonnée */
function repartir() {
  generation++;
  if (attenteOcr) { const a = attenteOcr; attenteOcr = null; a.resolve(''); }
  mode = 'depart'; ref = null; prec = null; activite.fill(0);
}

/** CHIEN DE GARDE : partage actif mais plus aucune image analysée depuis 10 s → la reconnaissance redémarre seule */
function garde() {
  const t = now();
  if (!enSession || !actif || t - tGarde < 1000) return;
  tGarde = t;
  const depuis = t - Math.max(tVerif, tFlux);
  // le partage ne produit plus d'image (ou le lecteur s'est arrêté) : on relit la piste (nouvelle copie côté fil principal)
  if ((!fluxActif || t - Math.max(tImage, tFlux) > IMAGE_MAX_MS) && t - tRelance > IMAGE_MAX_MS) {
    tRelance = t;
    noterJ('chien-de-garde', { raison: !fluxActif ? 'lecteur du partage arrêté' : 'aucune image du partage depuis ' + Math.round((t - Math.max(tImage, tFlux)) / 1000) + ' s', mode, action: 'relire la piste' });
    postMessage({ type: 'relancerFlux', fluxId });
  }
  if (fluxActif && depuis > GARDE_MS) {
    noterJ('chien-de-garde', { raison: mode === 'analyse' ? 'analyse bloquée depuis ' + Math.round(depuis / 1000) + ' s' : !image ? 'aucune image disponible' : 'boucle arrêtée ' + Math.round(depuis / 1000) + ' s', mode, action: 'redémarrage' });
    repartir();
    tVerif = t; // une relance par période de garde au plus
  }
}

/* ---------- boucle ---------- */
function tic() {
  nTics++;
  if (now() - dernierPouls >= 5000) { dernierPouls = now(); noterJ('pouls', { mode, tVerif, tImage, tics: nTics, images: nImages, actif, image: !!image }); }
  if (!actif || !image || mode === 'analyse') return;
  const t = now();
  if (t - tVerifEnvoyee >= 1000 && tVerif) { tVerifEnvoyee = t; postMessage({ type: 'verif', tVerif, tImage }); } // « vérifiée il y a 3 s »
  const periode = mode === 'transition' || mode === 'depart' ? PERIODE_TRANSITION : PERIODE_REPOS;
  if (t - dernierControle < periode - 20) return;
  const tAvant = dernierControle; dernierControle = t;
  // petite image (≈ 160 px) de la ZONE de la diapo quand elle est connue (sinon de tout l'onglet), en couleur
  const { petit, w, h } = chrono(() => petiteImage(image));
  tVerif = t;
  if (w !== petitW || h !== petitH) { prec = null; ref = null; petitW = w; petitH = h; activite.fill(0); }
  if (mode === 'depart') { mode = 'transition'; tChangement = t; tVu = t; tMouvement = t; prec = petit; return; }
  const cz = casesZone();
  // cases vivantes : apprises en permanence (la caméra bouge, la diapo non). (26/11) Au repos, l'apprentissage garde sa
  // cadence d'avant (une fois par seconde) même si la diapo est contrôlée toutes les 500 ms : la détection reste identique.
  let fracMvt = 0;
  const apprendre = () => {
    if (prec) {
      const d = chrono(() => differencesParCase(prec, petit, w, h, GRILLE_X, GRILLE_Y, SEUIL_PX, 3));
      let n = 0, m = 0;
      for (let c = 0; c < d.length; c++) {
        const bouge = d[c] > SEUIL_CASE ? 1 : 0;
        activite[c] = activite[c] * 0.88 + bouge * 0.12;
        if (cz[c] && activite[c] < 0.3) { n++; m += bouge; }
      }
      fracMvt = n ? m / n : 0;
    }
    prec = petit; tApprentissage = t;
  };
  if (mode !== 'repos' || t - tApprentissage >= PERIODE_APPRENTISSAGE_REPOS - 20) apprendre();
  if (mode === 'repos') {
    if (!ref) return;
    const d = chrono(() => differencesParCase(ref, petit, w, h, GRILLE_X, GRILLE_Y, SEUIL_PX, 3));
    let n = 0, m = 0;
    for (let c = 0; c < d.length; c++) if (cz[c] && activite[c] < 0.3) { n++; if (d[c] > SEUIL_CASE) m++; }
    if (n && m / n > DEBUT_CHANGEMENT) {
      if (tApprentissage !== t) apprendre(); // comme avant : le contrôle qui voit le changement apprend aussi
      mode = 'transition';
      tChangement = tAvant ? Math.round((tAvant + t) / 2) : t; // le changement a eu lieu entre deux contrôles
      tVu = t; tMouvement = t;
      noterJ('changement-vu', { tChangement });
      postMessage({ type: 'etat', transition: true });
    }
    return;
  }
  // transition : on attend que l'image reste stable 1,5 s
  if (fracMvt > MOUVEMENT) { if (t - tVu > 300) noterJ('stabilite-relancee', { apresMs: t - tVu, mvt: Math.round(fracMvt * 1000) / 1000 }); tMouvement = t; }
  if (t - tMouvement >= STABLE_MS || t - tVu >= ANIM_MAX_MS) analyser(petit, t).catch((e) => { mode = 'repos'; ref = petit; noterJ('erreur', { raison: String((e && e.message) || e).slice(0, 120) }); postMessage({ type: 'etat', erreur: String(e && e.message || e) }); });
}

/** cases de détection couvertes par la zone de la diapo (toutes tant qu'elle est inconnue) */
function casesZone() {
  if (zonePetite) return new Uint8Array(GRILLE_X * GRILLE_Y).fill(1); // la petite image EST la zone
  const z = new Uint8Array(GRILLE_X * GRILLE_Y);
  for (let y = 0; y < GRILLE_Y; y++) for (let x = 0; x < GRILLE_X; x++) {
    const fx = (x + 0.5) / GRILLE_X, fy = (y + 0.5) / GRILLE_Y;
    z[y * GRILLE_X + x] = !zone || (fx >= zone.x && fx <= zone.x + zone.w && fy >= zone.y && fy <= zone.y + zone.h) ? 1 : 0;
  }
  return z;
}
/** case de détection « vivante » (vidéo, curseur) — ou voisine d'une case vivante (la vignette déborde un peu) */
function vivante(gx, gy) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = gx + dx, y = gy + dy;
    if (x >= 0 && y >= 0 && x < GRILLE_X && y < GRILLE_Y && activite[y * GRILLE_X + x] >= 0.2) return true;
  }
  return false;
}
/** masque de la signature (CX × CY du recadrage) : cases du recadrage qui recouvrent une case vivante */
function masqueRecadrage(zCible) {
  // les cases d'activité couvrent la petite image : la zone (zonePetite) ou tout l'onglet — on se ramène à leur repère
  const zp = zonePetite || { x: 0, y: 0, w: 1, h: 1 };
  const z = { x: (zCible.x - zp.x) / zp.w, y: (zCible.y - zp.y) / zp.h, w: zCible.w / zp.w, h: zCible.h / zp.h };
  const m = new Uint8Array(CX * CY);
  let n = 0;
  for (let cy = 0; cy < CY; cy++) for (let cx = 0; cx < CX; cx++) {
    const x0 = z.x + (cx / CX) * z.w, x1 = z.x + ((cx + 1) / CX) * z.w, y0 = z.y + (cy / CY) * z.h, y1 = z.y + ((cy + 1) / CY) * z.h;
    let viv = false;
    for (let gy = Math.max(0, Math.floor(y0 * GRILLE_Y)); gy <= Math.min(GRILLE_Y - 1, Math.floor(y1 * GRILLE_Y - 1e-9)) && !viv; gy++)
      for (let gx = Math.max(0, Math.floor(x0 * GRILLE_X)); gx <= Math.min(GRILLE_X - 1, Math.floor(x1 * GRILLE_X - 1e-9)); gx++) if (vivante(gx, gy)) { viv = true; break; }
    if (viv) { m[cy * CX + cx] = 1; n++; }
  }
  return n > CX * CY * 0.6 ? null : m; // presque tout vivant (vidéo plein cadre) : pas de masque
}

/** zones candidates de la diapo dans l'image (fractions) : la zone connue d'abord, puis les meilleurs rectangles */
function zonesCandidates(src) {
  const p = dessiner(src, ZONE_W);
  const g = gris(p.ctx, p.w, p.h);
  const l = trouverZones(g, p.w, p.h, aspects).map((r) => ({ x: r.x / p.w, y: r.y / p.h, w: r.w / p.w, h: r.h / p.h, score: r.score, bords: r.bords }));
  return zone ? [zone, ...l] : l;
}
/** signature et scores d'une zone */
function evaluer(src, z) {
  const masque = masqueRecadrage(z);
  const p = dessiner(src, SIG_W, z);
  const s = signatureDe(p.ctx.getImageData(0, 0, p.w, p.h).data, p.w, p.h);
  const img = scoresPages(s, pages, masque, fond);
  return { z, masque, img, meilleur: img.length ? Math.max(...img) : 0 };
}

async function analyser(petit, t) {
  mode = 'analyse';
  const gen = generation;
  dernierChangement = tChangement;
  // copie de l'image : le flux peut fermer la VideoFrame courante pendant l'analyse (OCR, encodage)
  const src = await createImageBitmap(image);
  try { await analyserImage(src, petit, t, gen); } finally { fermer(src); }
}
async function analyserImage(src, petit, t, gen) {
  const abandonnee = () => gen !== generation; // le chien de garde a redémarré la boucle entre-temps
  const tStable = t;
  /* ZONE : parmi la zone connue et les meilleurs rectangles, celle qui ressemble le plus à une page du PDF (une photo nette
     dans une diapo noire a souvent des bords plus francs que la diapo elle-même). Sans PDF : le plus net. */
  const cands = chrono(() => zonesCandidates(src));
  if (!cands.length) cands.push({ x: 0, y: 0, w: 1, h: 1, score: 0, bords: 0 });
  let ev = null;
  if (pages.length) {
    /* la mise en page de Teams est stable : la zone connue reste, sauf si elle ne reconnaît rien et qu'un autre rectangle
       (jamais nettement plus petit : une photo DANS la diapo ressemblerait à une diapo « photo seule ») fait bien mieux */
    const aire = (z) => z.w * z.h;
    const admis = zone ? cands.filter((c) => c === zone || aire(c) >= aire(zone) * 0.75) : cands;
    for (const c of admis) {
      if (ev && ev.z === zone && ev.meilleur >= 0.6) break; // la zone connue reconnaît une page : inutile de chercher ailleurs
      const e = chrono(() => evaluer(src, c));
      if (!ev) { ev = e; continue; }
      const marge = ev.z === zone ? 0.12 : (aire(e.z) < aire(ev.z) * 0.75 ? 0.08 : 0.01); // plus petit : doit faire nettement mieux
      if (e.meilleur > ev.meilleur + marge) ev = e;
    }
  } else {
    const c = zone && cands[1] && cands[1].bords < zone.bords * 0.8 ? zone : (cands[zone ? 1 : 0] || cands[0]);
    ev = chrono(() => evaluer(src, c));
  }
  const z = ev.z; const masque = ev.masque; const img = ev.img;
  if (pages.length ? ev.meilleur >= 0.5 : true) zone = z; // une zone reconnue devient la zone connue
  let dec = decider(img, null, courant);
  let texte = null;
  const memo = dessiner(src, MEMO_W, z);
  const jpeg = await memo.c.convertToBlob({ type: 'image/jpeg', quality: 0.72 });
  if (abandonnee()) return;
  if (dec.ambigu && pages.length) {
    // ambigu à l'image : l'OCR (worker de Tesseract de l'app, via le fil principal) départage par le texte
    const o = dessiner(src, OCR_W, z);
    const bitmap = o.c.transferToImageBitmap();
    const id = ++nId;
    noterJ('ocr-demande', { id });
    let delai = null;
    texte = await new Promise((resolve) => {
      attenteOcr = { id, resolve };
      delai = setTimeout(() => { if (attenteOcr && attenteOcr.id === id) { noterJ('ocr-sans-reponse', { id, ms: OCR_MAX_MS }); attenteOcr = null; resolve(''); } }, OCR_MAX_MS);
      postMessage({ type: 'ocr', id, bitmap }, [bitmap]);
    });
    clearTimeout(delai);
    if (attenteOcr && attenteOcr.id === id) attenteOcr = null;
    if (abandonnee()) return;
    noterJ('ocr-reponse', { id, lettres: (texte || '').length });
    if (texte) dec = decider(img, scoresTexte(texte, index), courant);
  }
  if (dec.page) courant = dec.page;
  if (zone !== zonePetite) { const n = petiteImage(src); ref = n.petit; prec = n.petit; petitW = n.w; petitH = n.h; activite.fill(0); } else ref = petit;
  mode = 'repos';
  noterJ('analyse', { page: dec.page || null, score: r3(dec.score), marge: r3(dec.marge), nonReconnue: !!dec.nonReconnue, ambigu: !!dec.ambigu, tChangement, delaiMs: now() - tChangement });
  postMessage({
    type: 'changement', tChangement, tVu, tStable, tDecide: now(), page: dec.page, nonReconnue: dec.nonReconnue, ambigu: dec.ambigu,
    score: r3(dec.score), deuxieme: r3(dec.deuxieme), marge: r3(dec.marge), classement: dec.classement.map(([p, v]) => [p, r3(v)]),
    texte: texte || null, masque: masque ? Array.from(masque) : null, zone: { x: r3(z.x), y: r3(z.y), w: r3(z.w), h: r3(z.h) },
    jpeg, w: memo.w, h: memo.h, image: dimensions(src), calcul: { max: r3(temps.max), moyen: r3(temps.total / Math.max(1, temps.n)) },
  });
}
const r3 = (x) => Math.round(x * 1000) / 1000;

/* ---------- préparation des pages (une fois par PDF) ---------- */
class FabriqueCanvas { // pdf.js dans un worker : ses canvas de travail sont des OffscreenCanvas
  create(w, h) { const canvas = new OffscreenCanvas(Math.max(1, w), Math.max(1, h)); return { canvas, context: canvas.getContext('2d') }; }
  reset(cc, w, h) { cc.canvas.width = w; cc.canvas.height = h; }
  destroy(cc) { cc.canvas.width = 0; cc.canvas.height = 0; cc.canvas = null; cc.context = null; }
}
async function preparerPdf(octets, largeur = 480) {
  const { openPdf } = await import('../../pdf/pdfjsSetup.js');
  const doc = await openPdf(octets, { disableFontFace: true, isOffscreenCanvasSupported: true, useWorkerFetch: true, CanvasFactory: FabriqueCanvas }); // useWorkerFetch : pas de document.baseURI dans un worker
  const sigs = [], textes = [], ratios = []; let maxMs = 0, totalMs = 0;
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const v1 = page.getViewport({ scale: 1 });
      ratios.push(v1.width / v1.height);
      const vp = page.getViewport({ scale: largeur / v1.width });
      const c = new OffscreenCanvas(Math.round(vp.width), Math.round(vp.height));
      const g = c.getContext('2d', { willReadFrequently: true });
      const t0 = performance.now();
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: g, viewport: vp, intent: 'print' }).promise;
      sigs.push(signatureVersJson(signatureDe(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height)));
      const d = performance.now() - t0; maxMs = Math.max(maxMs, d); totalMs += d;
      let texte = '';
      try { texte = (await page.getTextContent()).items.map((i) => i.str).join(' '); } catch (e) { /* page sans texte */ }
      textes.push(texte);
      page.cleanup();
    }
  } finally { try { doc.destroy(); } catch (e) { /* déjà détruit */ } }
  return { sigs, textes, aspects: [...new Set(ratios.map((r) => Math.round(r * 100) / 100))].slice(0, 3), mesure: { pages: sigs.length, maxMs, totalMs } };
}

/* ---------- messages ---------- */
self.onmessage = async (ev) => {
  const m = ev.data || {};
  switch (m.type) {
    case 'pages':
      pages = (m.sigs || []).map(signatureDepuisJson);
      fond = fondCommun(pages);
      index = indexTexte(m.textes || []);
      if (m.aspects && m.aspects.length) aspects = m.aspects;
      postMessage({ type: 'etat', pages: pages.length });
      // pages prêtes après la première diapo : on relit la diapo affichée, à l'instant du dernier changement
      if (pages.length && mode === 'repos' && dernierChangement) { mode = 'transition'; tChangement = dernierChangement; tVu = now(); tMouvement = now() - STABLE_MS; }
      break;
    case 'flux': {
      // nouveau flux (démarrage, relance du chien de garde) : l'ancien lecteur est abandonné
      const ancien = lecteur; lecteur = null;
      fluxId = m.fluxId || fluxId + 1; fluxActif = true; enSession = true; tFlux = now();
      if (ancien) ancien.cancel().catch(() => {});
      noterJ('flux', { flux: fluxId, mode, relance: !!m.relance });
      if (!m.relance) repartir(); else if (mode === 'analyse') repartir();
      lire(m.readable, fluxId); demarrerMinuteur();
      break;
    }
    case 'image': fermer(image); image = m.bitmap; tImage = now(); fluxActif = true; demarrerMinuteur(); tic(); break;
    case 'actif':
      actif = !!m.actif;
      if (actif) repartir(); // on relit la diapo affichée tout de suite
      noterJ(actif ? 'interrupteur-actif' : 'interrupteur-coupe');
      break;
    case 'courant': courant = m.page || null; break;
    case 'texte': if (attenteOcr && attenteOcr.id === m.id) attenteOcr.resolve(m.texte || ''); break;
    case 'arret': {
      // fin de session : tout l'état de la détection repart de zéro (une session suivante ne reprend rien de bloqué)
      clearInterval(minuteur); minuteur = null;
      const l = lecteur; lecteur = null; fluxId++; fluxActif = false; enSession = false;
      noterJ('arret', { mode });
      repartir(); zone = null; zonePetite = null; courant = null; dernierChangement = 0; tVerif = 0; tImage = 0;
      fermer(image); image = null;
      try { if (l) await l.cancel(); } catch (e) { /* déjà fermé */ }
      postMessage({ type: 'etat', arrete: true });
      break;
    }
    case 'signerPage': {
      const s = signatureDe(m.rgba, m.w, m.h);
      postMessage({ type: 'signature', id: m.id, sig: signatureVersJson(s) });
      break;
    }
    case 'preparer': {
      // PAGES DU PDF, rendues ICI (pdf.js de l'app sur OffscreenCanvas) : le fil principal ne dessine rien
      try { postMessage({ type: 'prepare', id: m.id, ...(await preparerPdf(m.pdf, m.largeur)) }); } catch (e) { postMessage({ type: 'prepare', id: m.id, erreur: String((e && e.stack) || e).slice(0, 900) }); }
      break;
    }
    case 'reconnaitre': {
      // RÉPARTITION APRÈS COUP : la même signature et la même décision, sur une capture gardée
      const p = dessiner(m.bitmap, SIG_W);
      const s = signatureDe(p.ctx.getImageData(0, 0, p.w, p.h).data, p.w, p.h);
      fermer(m.bitmap);
      const masque = m.masque ? Uint8Array.from(m.masque) : null;
      const img = scoresPages(s, pages, masque, fond);
      const dec = decider(img, m.texte ? scoresTexte(m.texte, index) : null, m.courant || null);
      postMessage({ type: 'scores', id: m.id, page: dec.page, nonReconnue: dec.nonReconnue, ambigu: dec.ambigu, score: r3(dec.score), marge: r3(dec.marge), classement: dec.classement.map(([q, v]) => [q, r3(v)]) });
      break;
    }
    default: break;
  }
};
