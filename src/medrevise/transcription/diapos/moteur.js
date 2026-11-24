/* ============================================================
   MedRevise — SUIVI AUTOMATIQUE DES DIAPOS : le moteur de reconnaissance (24/11/2026,
   docs/compte-rendu-suivi-auto-diapos.md).

   UN SEUL MOTEUR, fonctions pures (aucun DOM, aucun stockage) : il sert au Web Worker du
   direct (worker.js), à la « répartition après coup » (repartition.js, via le même worker)
   et aux tests unitaires (tests/suivi-diapos).

   1. SIGNATURE d'une image de diapo (capture recadrée OU rendu d'une page du PDF), à partir
      de ses pixels RGBA, quelle que soit sa taille :
        L   luminance moyenne sur une grille 32 × 24            (structure de la photo, mise en page)
        G   force des contours sur une grille 16 × 12           (où sont le texte, les bords des photos)
        C   couleur moyenne (deux axes opposés rouge-vert / jaune-bleu) sur 16 × 12
        H   histogramme de couleur 3 × 3 × 3 par case de 16 × 12 (teintes de la coloration)
      Une case peut être MASQUÉE (vignette caméra, curseur, bulle animée) : elle est ignorée.
   2. RESSEMBLANCE d'image (critère principal) :
        0,35 corr(L) + 0,25 corr(G) + 0,20 couleurs + 0,20 histogrammes   (0 … 1)
   3. TEXTE reconnu (OCR de la capture) contre le texte de chaque page : mots du PDF seulement
      (le bruit de l'OCR ne compte pas), pondérés par leur rareté dans le PDF — un titre répété
      sur 6 diapos pèse presque rien, une URL ou un sous-titre propre à une page pèse lourd.
   4. SCORE = image (+ texte quand l'OCR a été lancé) + petit bonus de proximité (page suivante,
      pages voisines, page actuelle). Une page n'est retenue que si son score dépasse SEUIL ET
      devance la deuxième d'au moins MARGE ; sinon on garde la diapo actuelle.
   5. ZONE de la diapo dans l'image de l'onglet (bandeaux Teams, vignettes caméra, bulle
      d'enregistrement autour) : le rectangle au format des pages du PDF dont les quatre bords
      ont les contours les plus nets (sommes cumulées : quelques millions de rectangles en ~50 ms).
   6. CHANGEMENT : comparaison de petites images (≈ 160 px) case par case ; les cases qui bougent
      sans cesse (vidéo de la caméra) sont apprises et ignorées.
   ============================================================ */

export const VERSION_SIGNATURE = 4; // 2 : pages rendues à 480 px · 3 : texture · 4 : image fine
export const GX = 48, GY = 36; // grille de luminance
export const CX = 16, CY = 12; // grille des contours, couleurs, histogrammes
export const FW = 160, FH = 90; // image fine en niveaux de gris (comparaison pixel à pixel)
const NB = 27; // histogramme 3 × 3 × 3 par case

/* Seuils retenus (réglés sur le banc, voir le compte rendu § 3) */
export const PARAMS = {
  SEUIL: 0.5, // score minimal d'une page retenue
  MARGE: 0.03, // avance minimale sur la deuxième page
  NON_RECONNU: 0.5, // sans page nette, un meilleur score sous cette valeur = la diapo affichée n'est pas dans le PDF
  POIDS_TEXTE: 0.3, // part du texte quand l'OCR a été lancé (l'image garde 0,7)
  BONUS_SUIVANTE: 0.02,
  BONUS_VOISINE: 0.01, // ± 2 pages
  BONUS_ACTUELLE: 0.012,
};

/* ---------------- signature ---------------- */
/**
 * @param {Uint8ClampedArray|Uint8Array} px pixels RGBA
 * @param {number} w @param {number} h
 * @returns {{ v, L: Float32Array, G: Float32Array, C: Float32Array, H: Float32Array, unie: boolean }}
 */
export function signatureDe(px, w, h) {
  const L = new Float32Array(GX * GY), nL = new Float32Array(GX * GY);
  const C = new Float32Array(CX * CY * 2), nC = new Float32Array(CX * CY);
  const H = new Float32Array(CX * CY * NB);
  const T = new Float32Array(CX * CY), T2 = new Float32Array(CX * CY); // texture : écart-type de la luminance dans la case
  const Fs = new Float32Array(FW * FH), Fn = new Float32Array(FW * FH); // image fine (moyenne par boîte)
  // au plus ~ 260 000 pixels lus (pas d'échantillonnage régulier au-delà)
  const pas = Math.max(1, Math.floor(Math.sqrt((w * h) / 260000)));
  for (let y = 0; y < h; y += pas) {
    const gy = Math.min(GY - 1, Math.floor((y * GY) / h)), cy = Math.min(CY - 1, Math.floor((y * CY) / h));
    for (let x = 0; x < w; x += pas) {
      const i = (y * w + x) * 4;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const gx = Math.min(GX - 1, Math.floor((x * GX) / w)), cx = Math.min(CX - 1, Math.floor((x * CX) / w));
      const k = gy * GX + gx;
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      L[k] += lum; nL[k] += 1;
      const c = cy * CX + cx;
      T[c] += lum; T2[c] += lum * lum;
      const f = Math.min(FH - 1, Math.floor((y * FH) / h)) * FW + Math.min(FW - 1, Math.floor((x * FW) / w)); Fs[f] += lum; Fn[f] += 1;
      C[c * 2] += (r - g) / 255; C[c * 2 + 1] += ((r + g) / 2 - b) / 255; nC[c] += 1;
      H[c * NB + Math.min(2, (r * 3) >> 8) * 9 + Math.min(2, (g * 3) >> 8) * 3 + Math.min(2, (b * 3) >> 8)] += 1;
    }
  }
  for (let k = 0; k < L.length; k++) L[k] = nL[k] ? L[k] / nL[k] : 0;
  for (let c = 0; c < CX * CY; c++) {
    const n = nC[c] || 1;
    C[c * 2] /= n; C[c * 2 + 1] /= n;
    const m = T[c] / n; T[c] = Math.sqrt(Math.max(0, T2[c] / n - m * m));
    for (let j = 0; j < NB; j++) H[c * NB + j] /= n;
  }
  // contours : gradient de la grille L, regroupé 2 × 2
  const G = new Float32Array(CX * CY);
  for (let y = 0; y < GY; y++) for (let x = 0; x < GX; x++) {
    const v = L[y * GX + x];
    const dx = x + 1 < GX ? Math.abs(L[y * GX + x + 1] - v) : 0;
    const dy = y + 1 < GY ? Math.abs(L[(y + 1) * GX + x] - v) : 0;
    G[Math.floor((y * CY) / GY) * CX + Math.floor((x * CX) / GX)] += dx + dy;
  }
  let min = 1, max = 0; for (const v of L) { if (v < min) min = v; if (v > max) max = v; }
  const F = new Uint8Array(FW * FH); for (let i = 0; i < F.length; i++) F[i] = Fn[i] ? Math.round((Fs[i] / Fn[i]) * 255) : 0;
  return { v: VERSION_SIGNATURE, L, G, C, H, T, F, unie: max - min < 0.04 };
}

/** une signature → objet transférable/sérialisable (IndexedDB, postMessage) */
export const signatureVersJson = (s) => ({ v: s.v, unie: s.unie, L: Array.from(s.L, r4), G: Array.from(s.G, r4), C: Array.from(s.C, r4), H: Array.from(s.H, r4), T: Array.from(s.T, r4), F: s.F });
export const signatureDepuisJson = (j) => ({ v: j.v, unie: !!j.unie, L: Float32Array.from(j.L), G: Float32Array.from(j.G), C: Float32Array.from(j.C), H: Float32Array.from(j.H), T: Float32Array.from(j.T || []), F: j.F ? (j.F instanceof Uint8Array ? j.F : Uint8Array.from(Array.isArray(j.F) ? j.F : Object.values(j.F))) : null });
function r4(x) { return Math.round(x * 10000) / 10000; }

/* ---------------- ressemblance d'image ---------------- */
export const P_IMG = { L: 0.3, G: 0.15, T: 0.2, C: 0.15, H: 0.2, FIN: 0.4, COULEUR: 0.45 };
/** masque : Uint8Array(CX*CY) — 1 = case ignorée (vignette caméra, curseur…) */
function correlation(a, b, garder) {
  let n = 0, sa = 0, sb = 0;
  for (let i = 0; i < a.length; i++) if (garder(i)) { sa += a[i]; sb += b[i]; n++; }
  if (n < 8) return 0;
  const ma = sa / n, mb = sb / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) if (garder(i)) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
  if (da < 1e-6 || db < 1e-6) return da < 1e-6 && db < 1e-6 ? 1 : 0; // deux images unies : identiques ; une seule : rien en commun
  return num / Math.sqrt(da * db);
}
const caseDeL = (i) => Math.floor(Math.floor(i / GX) * CY / GY) * CX + Math.floor((i % GX) * CX / GX);

/** « page moyenne » du PDF (L, G, T) : ce que toutes les pages ont en commun (bandeau de titre, fond, logo) */
export function fondCommun(sigs) {
  if (!sigs.length) return null;
  const moy = (k) => { const o = new Float32Array(sigs[0][k].length); for (const s of sigs) for (let i = 0; i < o.length; i++) o[i] += s[k][i] / sigs.length; return o; };
  return { L: moy('L'), G: moy('G'), T: sigs[0].T && sigs[0].T.length ? moy('T') : null, F: sigs[0].F ? moy('F') : null };
}

/** ressemblance FINE (0 … 1) : corrélation pixel à pixel des images 160 × 90 (en écart à la page moyenne), meilleur des
 *  décalages de ± 1 pixel. Deux photos du même tissu ont la même « allure » mais pas leurs cellules aux mêmes endroits. */
export function ressemblanceFine(a, b, masque = null, fond = null) {
  if (!a.F || !b.F) return null;
  const libre = new Uint8Array(FW * FH);
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) libre[y * FW + x] = !masque || !masque[Math.floor((y * CY) / FH) * CX + Math.floor((x * CX) / FW)] ? 1 : 0;
  const va = new Float32Array(FW * FH), vb = new Float32Array(FW * FH);
  for (let i = 0; i < va.length; i++) { const f = fond && fond.F ? fond.F[i] : 0; va[i] = a.F[i] - f; vb[i] = b.F[i] - f; }
  let best = -1;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (let y = 1; y < FH - 1; y++) for (let x = 1; x < FW - 1; x++) {
      const i = y * FW + x; if (!libre[i]) continue;
      const u = va[i], v = vb[(y + dy) * FW + x + dx];
      n++; sa += u; sb += v; saa += u * u; sbb += v * v; sab += u * v;
    }
    if (n < 100) continue;
    const cov = sab - (sa * sb) / n, da = saa - (sa * sa) / n, db = sbb - (sb * sb) / n;
    if (da > 1e-6 && db > 1e-6) best = Math.max(best, cov / Math.sqrt(da * db));
  }
  return Math.max(0, best);
}
const ecart = (x, f) => { if (!f) return x; const o = new Float32Array(x.length); for (let i = 0; i < x.length; i++) o[i] = x[i] - f[i]; return o; };

/** ressemblance d'image (0 … 1) entre la capture `a` et la page `b`. `fond` : la page moyenne du PDF — la structure est
 *  comparée en ÉCART à cette page moyenne, pour que deux diapos au même titre ne se ressemblent que par leurs photos. */
export function ressemblanceImage(a, b, masque = null, fond = null) {
  const libre = (c) => !masque || !masque[c];
  const rL = correlation(ecart(a.L, fond && fond.L), ecart(b.L, fond && fond.L), (i) => libre(caseDeL(i)));
  const rG = correlation(ecart(a.G, fond && fond.G), ecart(b.G, fond && fond.G), libre);
  const rT = a.T && b.T && a.T.length === b.T.length ? correlation(ecart(a.T, fond && fond.T), ecart(b.T, fond && fond.T), libre) : rG;
  let dC = 0, sH = 0, n = 0;
  for (let c = 0; c < CX * CY; c++) {
    if (!libre(c)) continue;
    const d1 = a.C[c * 2] - b.C[c * 2], d2 = a.C[c * 2 + 1] - b.C[c * 2 + 1];
    dC += Math.sqrt(d1 * d1 + d2 * d2);
    let inter = 0; for (let j = 0; j < NB; j++) inter += Math.min(a.H[c * NB + j], b.H[c * NB + j]);
    sH += inter; n++;
  }
  if (!n) return 0;
  const sC = Math.exp(-(dC / n) / 0.06);
  const grossier = P_IMG.L * Math.max(0, rL) + P_IMG.G * Math.max(0, rG) + P_IMG.T * Math.max(0, rT) + P_IMG.C * sC + P_IMG.H * (sH / n);
  const fin = ressemblanceFine(a, b, masque, fond);
  const brut = fin == null ? grossier : (1 - P_IMG.FIN) * grossier + P_IMG.FIN * fin;
  // GARDE-FOU DE COULEUR : une galerie de visages grise ne « ressemble » pas à une coupe rose, même si leurs formes se tiennent
  const couleur = 0.5 * sC + 0.5 * (sH / n);
  return brut * (1 - P_IMG.COULEUR + P_IMG.COULEUR * couleur);
}

/* ---------------- texte ---------------- */
const VIDES = new Set(('les des une est dans pour par sur avec aux qui que son ses ces cette leur leurs plus pas sont ont '
  + 'entre sous mais elle ils elles nous vous du de la le un et ou en au the and for with from are this that www http https com').split(' '));
/** mots utiles d'un texte : minuscules, sans accents, ≥ 3 caractères (chiffres : ≥ 2), hors mots vides */
export function jetons(texte) {
  const s = String(texte || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const out = new Set();
  for (const m of s.split(/[^a-z0-9]+/)) {
    if (!m || VIDES.has(m)) continue;
    if (/^\d+$/.test(m) ? m.length >= 2 : m.length >= 3) out.add(m);
  }
  return out;
}
/** index du texte des pages : { jetons: Set[], idf: Map } */
export function indexTexte(textes) {
  const pages = textes.map((t) => jetons(t));
  const df = new Map();
  pages.forEach((s) => s.forEach((m) => df.set(m, (df.get(m) || 0) + 1)));
  const N = Math.max(1, pages.length);
  const idf = new Map([...df].map(([m, d]) => [m, Math.log(1 + N / d)]));
  return { pages, idf };
}
/** ressemblance de texte (0 … 1) : part des mots reconnus (connus du PDF), pondérés par leur rareté, présents sur la page.
 *  null quand l'OCR n'a rien lu d'utile. */
export function scoresTexte(texteCapture, index) {
  const cap = [...jetons(texteCapture)].filter((m) => index.idf.has(m));
  const total = cap.reduce((s, m) => s + index.idf.get(m), 0);
  if (cap.length < 2 || total <= 0) return null;
  return index.pages.map((p) => cap.reduce((s, m) => s + (p.has(m) ? index.idf.get(m) : 0), 0) / total);
}

/* ---------------- décision ---------------- */
/**
 * @param {number[]} img ressemblance d'image par page (index 0 = page 1)
 * @param {number[]|null} txt ressemblance de texte par page (OCR) ou null
 * @param {number|null} courant page actuelle (1…n) ou null
 * @returns {{ page: number|null, score, deuxieme, marge, nonReconnue: boolean, ambigu: boolean, classement: [page, score][] }}
 */
export function decider(img, txt, courant, P = PARAMS) {
  const sc = img.map((s, i) => {
    let v = txt ? (1 - P.POIDS_TEXTE) * s + P.POIDS_TEXTE * txt[i] : s;
    const p = i + 1;
    if (courant) {
      if (p === courant + 1) v += P.BONUS_SUIVANTE;
      else if (p === courant) v += P.BONUS_ACTUELLE;
      else if (Math.abs(p - courant) <= 2) v += P.BONUS_VOISINE;
    }
    return v;
  });
  const classement = sc.map((v, i) => [i + 1, v]).sort((a, b) => b[1] - a[1]);
  const [p1, s1] = classement[0] || [null, 0];
  const s2 = classement[1] ? classement[1][1] : 0;
  const marge = s1 - s2;
  const net = !!p1 && s1 >= P.SEUIL && marge >= P.MARGE;
  // sans page nette : deux pages fortes qui se tiennent = hésitation (on garde la diapo) ; rien de fort = hors du PDF
  const nonReconnue = !net && s1 < P.NON_RECONNU;
  return { page: net ? p1 : null, score: s1, deuxieme: s2, marge, nonReconnue, ambigu: !net, classement: classement.slice(0, 5) };
}

/* ---------------- zone de la diapo ---------------- */
/**
 * Rectangle au format `aspects` (largeur/hauteur) dont les bords ont les contours les plus nets.
 * @param {Float32Array} gris luminance 0…1, w × h (≈ 240–320 px de large)
 * @returns {{ x, y, w, h, score } | null} en pixels de `gris`
 */
export function trouverZone(gris, w, h, aspects = [16 / 9], o = {}) {
  const l = trouverZones(gris, w, h, aspects, o);
  return l[0] || null;
}
const recouvrement = (a, b) => {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return (ix * iy) / Math.min(a.w * a.h, b.w * b.h);
};
/** les `k` meilleurs rectangles bien distincts (une photo dans une diapo sombre peut avoir des bords plus nets que la diapo :
 *  le choix final se fait sur la reconnaissance, voir worker.js) */
export function trouverZones(gris, w, h, aspects = [16 / 9], { tailleMin = 0.28, k = 5 } = {}) {
  // contours horizontaux (|dy|) cumulés le long des lignes, verticaux (|dx|) le long des colonnes
  const ligne = new Float32Array((w + 1) * h); // ligne[y*(w+1)+x] = Σ_{x'<x} |dy(x', y)|
  const col = new Float32Array((h + 1) * w); // col[x*(h+1)+y] = Σ_{y'<y} |dx(x, y')|
  for (let y = 0; y < h; y++) {
    let acc = 0; const ya = Math.max(0, y - 1), yb = Math.min(h - 1, y + 1);
    for (let x = 0; x < w; x++) { acc += Math.abs(gris[yb * w + x] - gris[ya * w + x]); ligne[y * (w + 1) + x + 1] = acc; }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0; const xa = Math.max(0, x - 1), xb = Math.min(w - 1, x + 1);
    for (let y = 0; y < h; y++) { acc += Math.abs(gris[y * w + xb] - gris[y * w + xa]); col[x * (h + 1) + y + 1] = acc; }
  }
  const bordH = (y, x0, x1) => (ligne[y * (w + 1) + x1] - ligne[y * (w + 1) + x0]) / (x1 - x0);
  const bordV = (x, y0, y1) => (col[x * (h + 1) + y1] - col[x * (h + 1) + y0]) / (y1 - y0);
  const tops = []; // [{…, score}] triés, bien distincts
  const garder = (r) => {
    if (tops.length >= k && r.score <= tops[tops.length - 1].score) return;
    const i = tops.findIndex((t) => recouvrement(t, r) > 0.8 && Math.abs(t.w - r.w) < w * 0.12);
    if (i >= 0) { if (r.score > tops[i].score) { tops[i] = r; tops.sort((a, b) => b.score - a.score); } return; }
    tops.push(r); tops.sort((a, b) => b.score - a.score); if (tops.length > k) tops.pop();
  };
  const wMin = Math.max(24, Math.floor(w * tailleMin));
  for (const a of aspects) {
    for (const k of [0.985, 1, 1.015]) {
      const asp = a * k;
      for (let rw = wMin; rw <= w; rw++) {
        const rh = Math.round(rw / asp);
        if (rh < 12 || rh > h) continue;
        const taille = Math.pow((rw * rh) / (w * h), 0.12);
        for (let y0 = 0; y0 + rh <= h; y0++) {
          const y1 = Math.min(h - 1, y0 + rh - 1);
          for (let x0 = 0; x0 + rw <= w; x0++) {
            const x1 = Math.min(w - 1, x0 + rw - 1);
            const t = bordH(y0, x0, x1 + 1), b = bordH(y1, x0, x1 + 1), l = bordV(x0, y0, y1 + 1), r = bordV(x1, y0, y1 + 1);
            const mn = Math.min(t, b, l, r);
            const s = ((t + b + l + r) / 4) * 0.5 + mn * 0.5;
            const sc = s * taille;
            if (tops.length < k || sc > tops[tops.length - 1].score) garder({ x: x0, y: y0, w: rw, h: rh, score: sc, bords: mn });
          }
        }
      }
    }
  }
  return tops;
}

/* ---------------- changement ---------------- */
/** changement par case de deux petites images grises (w × h), grille gx × gy → Float32Array : la PART des pixels de la case
 *  qui ont changé de plus de `seuilPx` (une photo remplacée par une autre de même teinte moyenne change quand même ses pixels) */
export function differencesParCase(a, b, w, h, gx, gy, seuilPx = 0.06, canaux = 1) {
  const d = new Float32Array(gx * gy), n = new Float32Array(gx * gy);
  for (let y = 0; y < h; y++) {
    const cy = Math.min(gy - 1, Math.floor((y * gy) / h));
    for (let x = 0; x < w; x++) {
      const c = cy * gx + Math.min(gx - 1, Math.floor((x * gx) / w));
      const i = (y * w + x) * canaux;
      let m = 0; for (let k = 0; k < canaux; k++) { const v = Math.abs(a[i + k] - b[i + k]); if (v > m) m = v; }
      if (m > seuilPx) d[c] += 1;
      n[c] += 1;
    }
  }
  for (let c = 0; c < d.length; c++) d[c] = n[c] ? d[c] / n[c] : 0;
  return d;
}

/* ---------------- affectation des lignes aux diapos ---------------- */
/**
 * Page de chaque instant de cours d'après la suite des changements reconnus.
 * @param {{ t: number, page: number|null, pageCle?: any }[]} changements triés par t
 * @returns {(t: number) => { page, pageCle } | null} — un changement « non reconnu » (page nulle) garde la diapo d'avant
 */
export function pageAuTemps(changements) {
  const ch = (changements || []).filter((c) => Number.isFinite(c.page) && c.page >= 1).sort((a, b) => a.t - b.t);
  return (t) => {
    let r = null;
    for (const c of ch) { if (c.t <= t + 1e-6) r = c; else break; }
    return r ? { page: r.page, pageCle: r.pageCle != null ? r.pageCle : r.page } : null;
  };
}
