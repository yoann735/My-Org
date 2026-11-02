// Sonde d'alignement (02/11) : pour un morceau de texte de la couche invisible, compare la position de chaque
// caractère dans le DOM (Range par caractère), dans le modèle (fractionsCaracteres) et l'ENCRE dessinée sur le canvas.
// Usage : CDP_PORT=9337 CDP_FILTRE=5302 FX=<dossier> node sonde.mjs <fichier.pdf> <page> "<texte du morceau>" [zoom] [dpr]
import { banc } from '../tests-pdfreader-v3/commun.mjs';
const [fichier, page, cible, zoom = '1', dpr = '1'] = process.argv.slice(2);
const b = await banc(1440, 900);
if (+dpr !== 1) await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: +dpr, mobile: false });
await b.semer('f-sonde', 'Sonde', fichier);
await b.biblio({ recharger: true }); await b.ouvrir('Sonde'); await b.dormir(2500);
await b.ev(`window.__mrZoom && window.__mrZoom(${+zoom}); 1`); await b.dormir(1500); await b.allerPage(+page); await b.dormir(3000);
const r = await b.ev(`(async () => {
  const P = await import('/src/medrevise/pdf/pdfShared.js');
  const pg = document.querySelector('.pdfr-page[data-cle="${page}"]'); const layer = pg.querySelector('.pdfr-textlayer');
  const cv = pg.querySelector('canvas.pdfr-tampon.devant'); const cr = cv.getBoundingClientRect(); const k = cv.width / cr.width;
  const sp = [...layer.querySelectorAll(':scope > span')].find((s) => s.textContent.includes(${JSON.stringify(cible)}));
  if (!sp) return { err: 'span introuvable' };
  const R = sp.getBoundingClientRect(), fr = P.fractionsCaracteres(layer, sp);
  const str = sp.textContent; const pt = (i) => P.pointDeChar(sp, i);
  // encre : colonnes du canvas, dans la bande verticale du span, plus sombres que le fond
  const g = cv.getContext('2d');
  const y0 = Math.round((R.top - cr.top) * k), y1 = Math.round((R.bottom - cr.top) * k);
  const x0 = Math.max(0, Math.round((R.left - cr.left) * k) - 40), x1 = Math.min(cv.width, Math.round((R.right - cr.left) * k) + 40);
  const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data, W = x1 - x0, H = y1 - y0;
  const fond = [d[0], d[1], d[2]];
  const col = []; for (let x = 0; x < W; x++) { let n = 0; for (let y = 0; y < H; y++) { const i = (y * W + x) * 4; if (Math.abs(d[i]-fond[0]) + Math.abs(d[i+1]-fond[1]) + Math.abs(d[i+2]-fond[2]) > 120) n++; } col.push(n > 0); }
  const runs = []; for (let x = 0; x < W; x++) { if (col[x] && (x === 0 || !col[x-1])) runs.push([x, x]); if (col[x]) runs[runs.length-1][1] = x; }
  const encre = runs.map(([a, z]) => [ (a + x0) / k + cr.left, (z + 1 + x0) / k + cr.left ]);
  const chars = [];
  for (let i = 0; i < str.length; i++) { const q = document.createRange(); const a = pt(i); q.setStart(a.node, a.offset); q.setEnd(a.node, a.offset + 1); const b = q.getBoundingClientRect();
    chars.push({ c: str[i], domG: +b.left.toFixed(1), domD: +b.right.toFixed(1), modG: fr ? +(R.left + R.width * fr[i]).toFixed(1) : null, modD: fr ? +(R.left + R.width * fr[i+1]).toFixed(1) : null }); }
  return { str, transform: sp.style.transform, font: sp.style.fontSize, R: [R.left, R.right].map(v=>+v.toFixed(1)), dpr: devicePixelRatio, k, encre: encre.map(([a,z])=>[+a.toFixed(1), +z.toFixed(1)]), chars };
})()`);
console.log(JSON.stringify(r, null, 1));
process.exit(0);
