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
  trouverZone, differencesParCase, CX, CY,
} from './moteur.js';

const PETIT_W = 160; // image de détection du changement
const ZONE_W = 240; // image de recherche de la zone
const SIG_W = 320; // recadrage pour la signature
const MEMO_W = 480; // image gardée avec la session
const OCR_W = 1600;
const GRILLE_X = 32, GRILLE_Y = 18; // cases de détection (≈ 5 px)
const SEUIL_CASE = 0.035; // différence moyenne d'une case qui « bouge »
const DEBUT_CHANGEMENT = 0.04; // part des cases (hors cases vivantes) qui diffère de la diapo reconnue
const MOUVEMENT = 0.015; // part des cases qui bougent encore : pas stable
const STABLE_MS = 1500;
const ANIM_MAX_MS = 12000; // une diapo animée sans fin (vidéo) : reconnue quand même
const PERIODE_REPOS = 1000, PERIODE_TRANSITION = 250;

let pages = []; // signatures
let index = indexTexte([]);
let aspects = [16 / 9];
let actif = true;
let courant = null;
let image = null; // dernière VideoFrame / ImageBitmap reçue
let tImage = 0;
let lecteur = null;
let minuteur = null;

/* état de la détection */
let prec = null, ref = null, petitW = 0, petitH = 0;
const activite = new Float32Array(GRILLE_X * GRILLE_Y);
let mode = 'depart'; // depart | repos | transition | analyse
let tChangement = 0, tVu = 0, tMouvement = 0, dernierControle = 0;
let zone = null; // { x, y, w, h (fraction de l'image), score, bords, fw, fh }
let attenteOcr = null; // { id, resolve }
let nId = 0;

const now = () => Date.now();
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
function gris(ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
  return g;
}

/* ---------- flux ---------- */
async function lire(readable) {
  lecteur = readable.getReader();
  try {
    for (;;) {
      const { value, done } = await lecteur.read();
      if (done) break;
      fermer(image); image = value; tImage = now();
    }
  } catch (e) { /* flux coupé */ }
  fermer(image); image = null;
  postMessage({ type: 'etat', flux: 'fini' });
}

function demarrerMinuteur() {
  if (minuteur) return;
  minuteur = setInterval(tic, PERIODE_TRANSITION);
}

/* ---------- boucle ---------- */
function tic() {
  if (!actif || !image || mode === 'analyse') return;
  const t = now();
  const periode = mode === 'transition' || mode === 'depart' ? PERIODE_TRANSITION : PERIODE_REPOS;
  if (t - dernierControle < periode - 20) return;
  const tAvant = dernierControle; dernierControle = t;
  const { petit, w, h } = chrono(() => { const p = dessiner(image, PETIT_W); return { petit: gris(p.ctx, p.w, p.h), w: p.w, h: p.h }; });
  if (w !== petitW || h !== petitH) { prec = null; ref = null; petitW = w; petitH = h; activite.fill(0); zone = null; }
  if (mode === 'depart') { mode = 'transition'; tChangement = t; tVu = t; tMouvement = t; prec = petit; return; }
  const cz = casesZone();
  // cases vivantes : apprises en permanence (la caméra bouge, la diapo non)
  let fracMvt = 0;
  if (prec) {
    const d = chrono(() => differencesParCase(prec, petit, w, h, GRILLE_X, GRILLE_Y));
    let n = 0, m = 0;
    for (let c = 0; c < d.length; c++) {
      const bouge = d[c] > SEUIL_CASE ? 1 : 0;
      activite[c] = activite[c] * 0.88 + bouge * 0.12;
      if (cz[c] && activite[c] < 0.3) { n++; m += bouge; }
    }
    fracMvt = n ? m / n : 0;
  }
  prec = petit;
  if (mode === 'repos') {
    if (!ref) return;
    const d = chrono(() => differencesParCase(ref, petit, w, h, GRILLE_X, GRILLE_Y));
    let n = 0, m = 0;
    for (let c = 0; c < d.length; c++) if (cz[c] && activite[c] < 0.3) { n++; if (d[c] > SEUIL_CASE) m++; }
    if (n && m / n > DEBUT_CHANGEMENT) {
      mode = 'transition';
      tChangement = tAvant ? Math.round((tAvant + t) / 2) : t; // le changement a eu lieu entre deux contrôles
      tVu = t; tMouvement = t;
      postMessage({ type: 'etat', transition: true });
    }
    return;
  }
  // transition : on attend que l'image reste stable 1,5 s
  if (fracMvt > MOUVEMENT) tMouvement = t;
  if (t - tMouvement >= STABLE_MS || t - tVu >= ANIM_MAX_MS) analyser(petit, t).catch((e) => { mode = 'repos'; ref = petit; postMessage({ type: 'etat', erreur: String(e && e.message || e) }); });
}

/** cases de détection couvertes par la zone de la diapo (toutes tant qu'elle est inconnue) */
function casesZone() {
  const z = new Uint8Array(GRILLE_X * GRILLE_Y);
  for (let y = 0; y < GRILLE_Y; y++) for (let x = 0; x < GRILLE_X; x++) {
    const fx = (x + 0.5) / GRILLE_X, fy = (y + 0.5) / GRILLE_Y;
    z[y * GRILLE_X + x] = !zone || (fx >= zone.x && fx <= zone.x + zone.w && fy >= zone.y && fy <= zone.y + zone.h) ? 1 : 0;
  }
  return z;
}
/** masque de la signature (CX × CY du recadrage) : cases du recadrage qui recouvrent une case vivante */
function masqueRecadrage(z) {
  const m = new Uint8Array(CX * CY);
  let n = 0;
  for (let cy = 0; cy < CY; cy++) for (let cx = 0; cx < CX; cx++) {
    const x0 = z.x + (cx / CX) * z.w, x1 = z.x + ((cx + 1) / CX) * z.w, y0 = z.y + (cy / CY) * z.h, y1 = z.y + ((cy + 1) / CY) * z.h;
    let viv = false;
    for (let gy = Math.floor(y0 * GRILLE_Y); gy <= Math.min(GRILLE_Y - 1, Math.floor(y1 * GRILLE_Y - 1e-9)) && !viv; gy++)
      for (let gx = Math.floor(x0 * GRILLE_X); gx <= Math.min(GRILLE_X - 1, Math.floor(x1 * GRILLE_X - 1e-9)); gx++) if (activite[gy * GRILLE_X + gx] >= 0.3) { viv = true; break; }
    if (viv) { m[cy * CX + cx] = 1; n++; }
  }
  return n > CX * CY * 0.6 ? null : m; // presque tout vivant (vidéo plein cadre) : pas de masque
}

/** zone de la diapo dans l'image (fractions) : nouvelle recherche, ou la précédente si les bords sont trop flous */
function chercherZone(src) {
  const p = dessiner(src, ZONE_W);
  const g = gris(p.ctx, p.w, p.h);
  const r = trouverZone(g, p.w, p.h, aspects);
  if (!r) return zone;
  const nz = { x: r.x / p.w, y: r.y / p.h, w: r.w / p.w, h: r.h / p.h, score: r.score, bords: r.bords };
  // bords nets (diapo claire sur le fond sombre de Teams) : on la retient ; sinon on garde la zone connue
  if (!zone || r.bords >= 0.05 || r.bords >= zone.bords * 0.8) return nz;
  return zone;
}

async function analyser(petit, t) {
  mode = 'analyse';
  const src = image;
  const tStable = t;
  const z = chrono(() => chercherZone(src)) || { x: 0, y: 0, w: 1, h: 1, score: 0, bords: 0 };
  zone = z;
  const masque = masqueRecadrage(z);
  const s = chrono(() => { const p = dessiner(src, SIG_W, z); return signatureDe(p.ctx.getImageData(0, 0, p.w, p.h).data, p.w, p.h); });
  const img = chrono(() => pages.map((pg) => ressemblanceImage(s, pg, masque)));
  let dec = decider(img, null, courant);
  let texte = null;
  const memo = dessiner(src, MEMO_W, z);
  const jpeg = await memo.c.convertToBlob({ type: 'image/jpeg', quality: 0.72 });
  if (dec.ambigu && pages.length) {
    // ambigu à l'image : l'OCR (worker de Tesseract de l'app, via le fil principal) départage par le texte
    const o = dessiner(src, OCR_W, z);
    const bitmap = o.c.transferToImageBitmap();
    const id = ++nId;
    texte = await new Promise((resolve) => { attenteOcr = { id, resolve }; postMessage({ type: 'ocr', id, bitmap }, [bitmap]); });
    attenteOcr = null;
    if (texte) dec = decider(img, scoresTexte(texte, index), courant);
  }
  if (dec.page) courant = dec.page;
  ref = petit; mode = 'repos';
  postMessage({
    type: 'changement', tChangement, tVu, tStable, tDecide: now(), page: dec.page, nonReconnue: dec.nonReconnue, ambigu: dec.ambigu,
    score: r3(dec.score), deuxieme: r3(dec.deuxieme), marge: r3(dec.marge), classement: dec.classement.map(([p, v]) => [p, r3(v)]),
    texte: texte || null, masque: masque ? Array.from(masque) : null, zone: { x: r3(z.x), y: r3(z.y), w: r3(z.w), h: r3(z.h) },
    jpeg, w: memo.w, h: memo.h, image: dimensions(src), calcul: { max: r3(temps.max), moyen: r3(temps.total / Math.max(1, temps.n)) },
  });
}
const r3 = (x) => Math.round(x * 1000) / 1000;

/* ---------- messages ---------- */
self.onmessage = async (ev) => {
  const m = ev.data || {};
  switch (m.type) {
    case 'pages':
      pages = (m.sigs || []).map(signatureDepuisJson);
      index = indexTexte(m.textes || []);
      if (m.aspects && m.aspects.length) aspects = m.aspects;
      postMessage({ type: 'etat', pages: pages.length });
      break;
    case 'flux': lire(m.readable); demarrerMinuteur(); break;
    case 'image': fermer(image); image = m.bitmap; tImage = now(); demarrerMinuteur(); break;
    case 'actif':
      actif = !!m.actif;
      if (actif) { mode = 'depart'; ref = null; prec = null; } // on relit la diapo affichée tout de suite
      break;
    case 'courant': courant = m.page || null; break;
    case 'texte': if (attenteOcr && attenteOcr.id === m.id) attenteOcr.resolve(m.texte || ''); break;
    case 'arret':
      clearInterval(minuteur); minuteur = null;
      try { if (lecteur) await lecteur.cancel(); } catch (e) { /* déjà fermé */ }
      fermer(image); image = null;
      postMessage({ type: 'etat', arrete: true });
      break;
    case 'signerPage': {
      const s = signatureDe(m.rgba, m.w, m.h);
      postMessage({ type: 'signature', id: m.id, sig: signatureVersJson(s) });
      break;
    }
    case 'reconnaitre': {
      // RÉPARTITION APRÈS COUP : la même signature et la même décision, sur une capture gardée
      const p = dessiner(m.bitmap, SIG_W);
      const s = signatureDe(p.ctx.getImageData(0, 0, p.w, p.h).data, p.w, p.h);
      fermer(m.bitmap);
      const masque = m.masque ? Uint8Array.from(m.masque) : null;
      const img = pages.map((pg) => ressemblanceImage(s, pg, masque));
      const dec = decider(img, m.texte ? scoresTexte(m.texte, index) : null, m.courant || null);
      postMessage({ type: 'scores', id: m.id, page: dec.page, nonReconnue: dec.nonReconnue, ambigu: dec.ambigu, score: r3(dec.score), marge: r3(dec.marge), classement: dec.classement.map(([q, v]) => [q, r3(v)]) });
      break;
    }
    default: break;
  }
};
