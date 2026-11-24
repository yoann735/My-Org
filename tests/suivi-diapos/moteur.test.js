// Suivi automatique des diapos (24/11/2026, docs/compte-rendu-suivi-auto-diapos.md) — moteur pur.
import { describe, it, expect } from 'vitest';
import {
  signatureDe, ressemblanceImage, decider, jetons, indexTexte, scoresTexte, trouverZone, pageAuTemps,
  signatureVersJson, signatureDepuisJson, differencesParCase, CX, CY,
} from '../../src/medrevise/transcription/diapos/moteur.js';

let graine = 1;
const alea = () => { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };

/** « photo d'histologie » synthétique : fond rosé, cellules (disques) violettes, positions tirées de `g` */
function photo(w, h, g, { fond = [235, 200, 215], noyau = [110, 60, 150], titre = true } = {}) {
  const px = new Uint8ClampedArray(w * h * 4);
  let s = g; const r = () => { s = (s * 48271) % 2147483647; return s / 2147483647; };
  const cellules = Array.from({ length: 40 }, () => [r() * w, (0.2 + r() * 0.8) * h, 3 + r() * w * 0.04]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c = fond;
    if (titre && y < h * 0.14) c = [255, 255, 255];
    if (titre && y > h * 0.04 && y < h * 0.1 && x > w * 0.1 && x < w * 0.6) c = [30, 30, 30]; // bandeau de titre
    for (const [cx, cy, rr] of cellules) if ((x - cx) ** 2 + (y - cy) ** 2 < rr * rr) { c = noyau; break; }
    const i = (y * w + x) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  }
  return px;
}
/** dégradation « vidéo » : bruit, léger voile, décalage de couleurs */
function degrader(px, { bruit = 14, voile = 0.06 } = {}) {
  const o = new Uint8ClampedArray(px.length);
  for (let i = 0; i < px.length; i += 4) for (let k = 0; k < 3; k++) o[i + k] = px[i + k] * (1 - voile) + 128 * voile + (alea() - 0.5) * bruit + (k === 2 ? 4 : 0);
  for (let i = 3; i < px.length; i += 4) o[i] = 255;
  return o;
}

describe('signature et ressemblance', () => {
  const W = 192, H = 108;
  const pages = [11, 22, 33, 44, 55].map((g) => signatureDe(photo(W, H, g), W, H));
  it('une capture dégradée ressemble le plus à sa propre page', () => {
    for (let k = 0; k < pages.length; k++) {
      const cap = signatureDe(degrader(photo(320, 180, [11, 22, 33, 44, 55][k])), 320, 180);
      const sc = pages.map((p) => ressemblanceImage(cap, p));
      const best = sc.indexOf(Math.max(...sc));
      expect(best).toBe(k);
      expect(sc[k]).toBeGreaterThan(0.75);
    }
  });
  it('même titre, photos différentes : la marge reste nette', () => {
    const cap = signatureDe(degrader(photo(320, 180, 22)), 320, 180);
    const sc = pages.map((p) => ressemblanceImage(cap, p)).sort((a, b) => b - a);
    expect(sc[0] - sc[1]).toBeGreaterThan(0.05);
  });
  it('le masque ignore une vignette caméra collée sur la capture', () => {
    const px = degrader(photo(320, 180, 33));
    for (let y = 120; y < 180; y++) for (let x = 230; x < 320; x++) { const i = (y * 320 + x) * 4; px[i] = 60; px[i + 1] = 90; px[i + 2] = 60; }
    const masque = new Uint8Array(CX * CY);
    for (let cy = 0; cy < CY; cy++) for (let cx = 0; cx < CX; cx++) if (cx >= Math.floor(230 / 20) && cy >= Math.floor(120 / 15)) masque[cy * CX + cx] = 1;
    const avec = ressemblanceImage(signatureDe(px, 320, 180), pages[2], masque);
    const sans = ressemblanceImage(signatureDe(px, 320, 180), pages[2]);
    expect(avec).toBeGreaterThan(sans);
  });
  it('signature sérialisable (IndexedDB, postMessage) sans perte utile', () => {
    const s = pages[0]; const s2 = signatureDepuisJson(JSON.parse(JSON.stringify(signatureVersJson(s))));
    expect(Math.abs(ressemblanceImage(s, pages[1]) - ressemblanceImage(s2, pages[1]))).toBeLessThan(0.002);
  });
});

describe('texte', () => {
  it('jetons : minuscules, sans accents, sans mots vides', () => {
    expect([...jetons('Épithélium pavimenteux des muqueuses – www.histo.fr/p12')]).toEqual(['epithelium', 'pavimenteux', 'muqueuses', 'histo', 'p12']);
  });
  it('un titre répété pèse peu, le mot propre à une page départage', () => {
    const idx = indexTexte(['Épithélium pavimenteux kératinisé', 'Épithélium pavimenteux non kératinisé muqueuse buccale', 'Tissu conjonctif lâche']);
    const sc = scoresTexte('Epithelium pavimenteux muqueuse buccale', idx);
    expect(sc[1]).toBeGreaterThan(sc[0]);
    expect(scoresTexte('blabla zzz', idx)).toBe(null);
  });
});

describe('décision', () => {
  it('retient une page nette, garde la diapo actuelle si deux pages se tiennent', () => {
    expect(decider([0.4, 0.82, 0.6], null, 1).page).toBe(2);
    const d = decider([0.70, 0.705, 0.3], null, null);
    expect(d.page).toBe(null); expect(d.ambigu).toBe(true);
  });
  it('rien qui ressemble : non reconnue', () => {
    const d = decider([0.3, 0.35, 0.32], null, 2);
    expect(d.nonReconnue).toBe(true); expect(d.page).toBe(null);
  });
  it('le texte de l’OCR départage deux photos proches', () => {
    expect(decider([0.70, 0.705], [1, 0.1], null).page).toBe(1);
  });
});

describe('zone de la diapo dans une image « Teams »', () => {
  it('trouve le rectangle 16:9 de la diapo malgré bandeaux et vignette', () => {
    const w = 240, h = 150; const g = new Float32Array(w * h).fill(0.12);
    for (let y = 0; y < 14; y++) for (let x = 0; x < w; x++) g[y * w + x] = 0.2; // bandeau du haut
    for (let y = 0; y < h; y++) for (let x = 0; x < 18; x++) g[y * w + x] = 0.17; // rail de gauche
    const zx = 40, zy = 30, zw = 160, zh = 90; // la diapo
    for (let y = zy; y < zy + zh; y++) for (let x = zx; x < zx + zw; x++) g[y * w + x] = 0.85 + ((x * 7 + y * 3) % 11) / 100;
    for (let y = 118; y < 145; y++) for (let x = 196; x < 236; x++) g[y * w + x] = 0.45; // vignette caméra
    const z = trouverZone(g, w, h, [16 / 9]);
    expect(Math.abs(z.x - zx)).toBeLessThanOrEqual(2); expect(Math.abs(z.y - zy)).toBeLessThanOrEqual(2);
    expect(Math.abs(z.w - zw)).toBeLessThanOrEqual(4);
  });
});

describe('changements et affectation', () => {
  it('différences par case', () => {
    const a = new Float32Array(100).fill(0.5), b = new Float32Array(100).fill(0.5); b[0] = 1;
    const d = differencesParCase(a, b, 10, 10, 2, 2);
    expect(d[0]).toBeGreaterThan(0); expect(d[3]).toBe(0);
  });
  it('page de chaque instant ; un changement non reconnu garde la diapo d’avant', () => {
    const f = pageAuTemps([{ t: 0, page: 1 }, { t: 30, page: 2 }, { t: 50, page: null }, { t: 80, page: 5, pageCle: 4 }]);
    expect(f(10).page).toBe(1); expect(f(30).page).toBe(2); expect(f(60).page).toBe(2);
    expect(f(90)).toEqual({ page: 5, pageCle: 4 });
    expect(pageAuTemps([{ t: 5, page: 3 }])(1)).toBe(null);
  });
});
