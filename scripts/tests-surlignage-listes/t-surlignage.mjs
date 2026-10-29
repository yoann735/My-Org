// Banc « surlignage précis » (29/10, docs/compte-rendu-synchro-rapide-surlignage-listes.md). Vite :5199 SANS Supabase +
// Chrome headless 9333 (base locale seulement). Deux PDF fabriqués par Chrome (fx/) :
//   polices.pdf — polices EMBARQUÉES (Georgia, Avenir, Times, Gill Sans, texte justifié) : le cas où la couche de texte
//                 sans-serif dérivait de l'encre ;
//   scan.pdf    — la même matière en IMAGE seule : texte rendu par l'OCR de l'app (Tesseract local).
// Comme un utilisateur : outil Surligneur, glisser À LA SOURIS du bord gauche de l'encre du 1er mot au bord droit de
// l'encre du dernier (bords lus sur le canvas de la page), puis on vérifie :
//   - le texte enregistré = le passage visé, lettre pour lettre (blancs et ponctuation finale non comptés) ;
//   - la bande couvre l'encre de la 1ʳᵉ et de la dernière lettre (débord de 2 px compris) ;
//   - une bande par ligne ; rendu : coins de 4 px, 2 px de débord, multiply, opacité 45 %.
// 10 passages : 8 sur polices.pdf (dont « à quatre », qui commence par une lettre isolée, et un passage sur deux lignes),
// 2 sur la page OCR. node t-surlignage.mjs [etiquette] → captures docs/img/surlignage-listes/surlignage-<etiquette>-*.png
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { banc, FX } from '../tests-pdfreader-v3/commun.mjs';
process.env.FX = process.env.FX || FX;
const ETIQ = process.argv[2] || 'apres';
const CAP = fileURLToPath(new URL('../../docs/img/surlignage-listes/', import.meta.url)); fs.mkdirSync(CAP, { recursive: true });
const b = await banc(1440, 900);
let echecs = 0; const v = (c, m, d = '') => { b.ok(!!c, m, d); if (!c) echecs++; return c; };
const souris = (type, x, y, extra = {}) => b.c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
const glisser = async (de, a, pas = 12) => {
  await souris('mouseMoved', de[0], de[1]); await souris('mousePressed', de[0], de[1]);
  for (let k = 1; k <= pas; k++) { await souris('mouseMoved', de[0] + (a[0] - de[0]) * k / pas, de[1] + (a[1] - de[1]) * k / pas, { buttons: 1 }); await b.dormir(25); }
  await souris('mouseReleased', a[0], a[1]); await b.dormir(600);
};
const lettres = (t) => String(t || '').replace(/\s+/g, '').replace(/[,.;:!?]+$/, '');
// mots VISIBLES de la page avec les bords de leur ENCRE : chaque morceau de texte (span) découpé en paquets d'encre
// séparés par une espace ; si le nombre de paquets = le nombre de mots du morceau, le k-ième paquet est le k-ième mot
const motsEncre = () => b.ev(`(() => {
  const page = document.querySelector('.pdfr-page[data-cle="1"]'); const layer = page.querySelector('.pdfr-textlayer');
  const encrePart = (c) => { if (!c.width) return 0; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 64) if (d[i] < 128) n++; return n; };
  const canvas = [...page.querySelectorAll('canvas.pdfr-tampon')].sort((a, b) => encrePart(b) - encrePart(a))[0];
  const cr = canvas.getBoundingClientRect(); const kx = canvas.width / cr.width, ky = canvas.height / cr.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const encre = (x, y) => { const d = ctx.getImageData(Math.round((x - cr.left) * kx), Math.round((y - cr.top) * ky), 1, 1).data; return (d[0] + d[1] + d[2]) / 3 < 160; };
  const colonne = (x, y0, y1) => { for (let y = y0; y <= y1; y += 0.5) if (encre(x, y)) return true; return false; };
  const vu = document.querySelector('.pdfr-scroll').getBoundingClientRect();
  const out = []; let ligne = 0;
  for (const sp of layer.querySelectorAll('span')) {
    const t = sp.firstChild; if (!t || t.nodeType !== 3) continue;
    const mots = [...t.textContent.matchAll(/\\S+/gu)]; if (!mots.length) continue;
    const R = sp.getBoundingClientRect(); const em = R.height, y0 = R.top + em * 0.25, y1 = R.bottom - em * 0.2;
    const paquets = []; let cur = null, blanc = 0;
    for (let x = R.left - em * 0.12; x <= R.right + em * 0.12; x += 0.25) {
      if (colonne(x, y0, y1)) { if (cur && blanc < em * 0.18) cur[1] = x; else { cur = [x, x]; paquets.push(cur); } blanc = 0; } else blanc += 0.25;
    }
    ligne++;
    // mot OCR : son span couvre aussi l'espace qui le suit ; un paquet qui commence au-delà du mot est le mot suivant
    if (/\\s$/.test(t.textContent) && paquets.length === mots.length + 1) paquets.pop();
    if (paquets.length !== mots.length) continue;
    mots.forEach((m, k) => { if (paquets[k][0] > vu.left + 4 && paquets[k][1] < vu.right - 16 && R.top > vu.top && R.bottom < vu.bottom)
      out.push({ mot: m[0], ligne, k, g: paquets[k][0], d: paquets[k][1], y: (R.top + R.bottom) / 2, haut: R.top }); });
  }
  return out;
})()`);
// passages = suites de mots consécutifs d'un même morceau ; `deuxLignes` : + un passage à cheval sur deux lignes
const choisir = (MOTS, phrases, n, deuxLignes) => {
  const ps = [];
  for (const ph of phrases) {
    const i = MOTS.findIndex((m, j) => ph.every((w, q) => MOTS[j + q] && MOTS[j + q].mot === w && MOTS[j + q].ligne === m.ligne && MOTS[j + q].k === m.k + q));
    if (i >= 0 && ps.length < n) ps.push(MOTS.slice(i, i + ph.length));
  }
  if (deuxLignes) {
    const j = MOTS.findIndex((m, x) => MOTS[x + 1] && MOTS[x + 1].haut > m.haut + 5 && MOTS[x + 1].k === 0 && /^\p{L}/u.test(m.mot) && /^\p{L}/u.test(MOTS[x + 1].mot));
    if (j >= 0) ps.push([MOTS[j], MOTS[j + 1]]);
  }
  return ps;
};
const resultats = [];
async function jouer(ficheId, titre, passages, rang0) {
  for (const [n, p] of passages.entries()) {
    const num = rang0 + n + 1;
    const avant = await b.S(`return (await S.getAll('highlights')).filter((h) => h.ficheId === '${ficheId}').map((h) => h.id)`);
    const premier = p[0], dernier = p.at(-1);
    await glisser([Math.ceil(premier.g), premier.y], [Math.ceil(dernier.d), dernier.y]); // Chrome tronque au pixel entier
    const h = await b.S(`return (await S.getAll('highlights')).filter((h) => h.ficheId === '${ficheId}' && !${JSON.stringify(avant)}.includes(h.id)).map((h) => ({ id: h.id, texte: h.texte }))[0] || null`);
    const bandes = h ? await b.ev(`[...document.querySelectorAll('.pdfr-page[data-cle="1"] .pdfr-hl-rect[data-hl="${h.id}"]')].map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; })`) : [];
    const attendu = p.map((m) => m.mot).join(' ');
    const nLignes = [...new Set(p.map((m) => Math.round(m.haut)))].length;
    const bandeDe = (m) => bandes.find((x) => m.y >= x.t && m.y <= x.b);
    const g = bandeDe(premier), d = bandeDe(dernier);
    const ecartG = g ? +(g.l - premier.g).toFixed(1) : null, ecartD = d ? +(dernier.d - d.r).toFixed(1) : null;
    resultats.push({ titre, attendu, texte: h && h.texte, ecartG, ecartD });
    v(!!h && lettres(h.texte) === lettres(attendu), `${num}. « ${attendu} » (${titre}) : texte enregistré « ${h && h.texte} »`, process.env.DBG ? await b.ev(`JSON.stringify(window.__mrSurlDbg) + ' sel=' + getSelection().toString()`) + ' ' + JSON.stringify([premier.g, premier.y, dernier.d]) : '');
    v(g && d && ecartG <= 0 && ecartD <= 0, `${num}. encre couverte : 1ʳᵉ lettre (bord de la bande − encre : ${ecartG} px), dernière (encre − bord : ${ecartD} px)`);
    v(bandes.length === nLignes, `${num}. une bande par ligne (${bandes.length} pour ${nLignes} ligne${nLignes > 1 ? 's' : ''})`);
  }
}
const capturer = async (nom, p) => {
  const x0 = Math.min(...p.map((m) => m.g)) - 60, x1 = Math.max(...p.map((m) => m.d)) + 60, y0 = Math.min(...p.map((m) => m.y)) - 40, y1 = Math.max(...p.map((m) => m.y)) + 40;
  const s = await b.c.send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, x0), y: Math.max(0, y0), width: Math.min(1440, x1) - Math.max(0, x0), height: y1 - y0, scale: 2 } });
  fs.writeFileSync(CAP + `surlignage-${ETIQ}-${nom}.png`, Buffer.from(s.data, 'base64'));
};
const ouvrir = async (id, titre, fichier) => {
  await b.semer(id, titre, fichier);
  await b.S(`for (const h of await S.getAll('highlights')) if (h.ficheId === '${id}') await S.remove('highlights', h.id); return 1;`);
  await b.biblio({ recharger: true });
  await b.ouvrir(titre); await b.dormir(2000);
  await b.ev(`window.__mrZoom && window.__mrZoom(0.9); 1`); await b.dormir(1500);
  await b.allerPage(1); await b.dormir(2500);
};

// ---------- 1. PDF à polices embarquées : 8 passages
await ouvrir('f-surl', 'Surlignage précis', 'polices.pdf');
const MOTS = await motsEncre();
const P1 = choisir(MOTS, [['exemple', 'positif'], ['à', 'quatre'], ['conseil', 'par', 'téléphone'], ['demanderai'], ['collègue', 'de', 'confiance.'],
  ['soignants,'], ['patient'], ['un', 'kiné'], ['secret'], ['avec', 'qui,'], ['médecin']], 7, true);
v(P1.length === 8, `polices embarquées : 8 passages repérés sur l'encre (${P1.length})`, P1.map((p) => p.map((m) => m.mot).join(' ')).join(' | '));
await b.outil('Surligneur'); await b.dormir(300);
await jouer('f-surl', 'polices embarquées', P1, 0);
const style = await b.ev(`(() => { const e = document.querySelector('.pdfr-page[data-cle="1"] .pdfr-hl-rect'); if (!e) return null; const s = getComputedStyle(e); return { r: s.borderTopLeftRadius, ml: s.marginLeft, pl: s.paddingLeft, pr: s.paddingRight, blend: s.mixBlendMode, op: s.opacity }; })()`);
v(style && style.r === '4px' && style.ml === '-2px' && style.pl === '2px' && style.pr === '2px' && style.blend === 'multiply' && style.op === '0.45', 'rendu : coins de 4 px, 2 px de débord de chaque côté, multiply, opacité 45 %', JSON.stringify(style));
await b.outil('Sélection').catch(() => {}); await b.ev(`getSelection().removeAllRanges(); 1`); await b.dormir(400);
const lettreIsolee = P1.find((p) => p[0].mot === 'à');
await capturer('polices', P1.slice(0, 4).flat());
if (lettreIsolee) await capturer('lettre-isolee', lettreIsolee);
await capturer('deux-lignes', P1.at(-1));

// ---------- 1 bis. tablette tactile (1024×1366) : les surlignages posés, recalculés depuis leur ancre, couvrent l'encre
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1366, deviceScaleFactor: 2, mobile: true });
await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await b.biblio({ recharger: true }); await b.ouvrir('Surlignage précis'); await b.dormir(2000);
await b.ev(`window.__mrZoom && window.__mrZoom(0.9); 1`); await b.dormir(1500); await b.allerPage(1); await b.dormir(2500);
{
  const M = await motsEncre();
  const hs = await b.S(`return (await S.getAll('highlights')).filter((h) => h.ficheId === 'f-surl').map((h) => ({ id: h.id, texte: h.texte }))`);
  let couverts = 0, vus = 0; const rates = [];
  for (const h of hs) {
    const mots = h.texte.split(/\s+/);
    const bandes = await b.ev(`[...document.querySelectorAll('.pdfr-page[data-cle="1"] .pdfr-hl-rect[data-hl="${h.id}"]')].map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; })`);
    const de = (m) => bandes.find((x) => m.y >= x.t && m.y <= x.b && m.d > x.l && m.g < x.r);
    // le mot peut revenir plusieurs fois sur la page : l'occurrence surlignée est celle sous la bande
    const i = M.findIndex((m, j) => mots.every((w, q) => M[j + q] && lettres(M[j + q].mot) === lettres(w)) && de(m));
    if (i < 0) continue;
    const p = M.slice(i, i + mots.length); vus++;
    if (de(p[0]) && de(p.at(-1)) && de(p[0]).l <= p[0].g && de(p.at(-1)).r >= p.at(-1).d) couverts++;
    else rates.push(`${h.texte} : ${de(p[0]) ? (de(p[0]).l - p[0].g).toFixed(1) : '—'} / ${de(p.at(-1)) ? (p.at(-1).d - de(p.at(-1)).r).toFixed(1) : '—'} px`);
  }
  v(vus >= 5 && couverts === vus, `tablette : ${couverts}/${vus} surlignages couvrent l'encre de leur 1ʳᵉ et dernière lettre`, rates.join(' | '));
  await capturer('tablette', P1.slice(0, 3).flat().length ? M.filter((m) => P1.slice(0, 3).flat().some((x) => x.mot === m.mot)).slice(0, 6) : M.slice(0, 4));
}
await b.c.send('Emulation.clearDeviceMetricsOverride'); await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: false });

// ---------- 2. PDF image : texte de l'OCR, 2 passages
await ouvrir('f-scan', 'Surlignage OCR', 'scan.pdf');
let nOcr = 0;
for (let i = 0; i < 120 && nOcr < 10; i++) { nOcr = await b.ev(`document.querySelectorAll('.pdfr-page[data-cle="1"] .pdfr-ocr-mot').length`); if (nOcr < 10) await b.dormir(1000); }
v(nOcr >= 10, `page scannée : couche OCR prête (${nOcr} mots)`);
await b.dormir(1500);
const MOTS2 = (await motsEncre()); if (process.env.DBG) console.log('MOTS2', JSON.stringify(MOTS2.slice(0, 12).map((m) => m.mot + '@' + Math.round(m.g))));
// deux mots NON voisins : deux passages contigus de même couleur sont fusionnés (comportement de l'app)
const P2 = choisir(MOTS2, ['exemple', 'quatre', 'secret', 'partagé', 'soignants,', 'positif', 'conditions', 'partager,', 'médecin', 'kiné', 'conseil', 'Seulement', 'nécessaire', 'entorse,', 'patient'].map((w) => [w]), 2, false);
v(P2.length === 2, `OCR : 2 passages repérés sur l'encre (${P2.length})`, P2.map((p) => p.map((m) => m.mot).join(' ')).join(' | '));
await b.outil('Surligneur'); await b.dormir(300);
await jouer('f-scan', 'OCR', P2, 8);
await b.outil('Sélection').catch(() => {}); await b.ev(`getSelection().removeAllRanges(); 1`); await b.dormir(400);
if (P2.length) await capturer('ocr', P2.flat());
if (process.env.DBG) console.log('surlignages OCR', await b.S(`return (await S.getAll('highlights')).filter((h) => h.ficheId === 'f-scan').map((h) => h.texte)`));

fs.writeFileSync(fileURLToPath(new URL(`./surlignage-${ETIQ}.json`, import.meta.url)), JSON.stringify(resultats, null, 2));
v(!b.erreurs.filter((e) => !/Failed to load resource/.test(e)).length, 'aucune erreur console', b.erreurs.join(' | ').slice(0, 300));
console.log(echecs ? `❌ ${echecs} échec(s)` : '✅ tout est vert');
b.c.fermer(); process.exit(0);
