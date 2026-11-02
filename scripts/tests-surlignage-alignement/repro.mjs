// Reproduction (02/11) : glisser au Surligneur de l'ENCRE du 1er caractère à l'encre du dernier, comme l'utilisateur.
// CDP_PORT=9337 CDP_FILTRE=5302 FX=<dossier> node repro.mjs <pdf> <page> "<morceau>" "<passage>" [zoom] [dpr] [outil]
import { banc } from '../tests-pdfreader-v3/commun.mjs';
const [fichier, page, morceau, passage, zoom = '1', dpr = '1', outil = 'Surligneur'] = process.argv.slice(2);
const b = await banc(1440, 900);
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: +dpr, mobile: false });
await b.semer('f-sonde', 'Sonde', fichier);
await b.S(`for (const h of await S.getAll('highlights')) if (h.ficheId === 'f-sonde') await S.remove('highlights', h.id); return 1;`);
await b.biblio({ recharger: true }); await b.ouvrir('Sonde'); await b.dormir(2500);
await b.ev(`window.__mrZoom && window.__mrZoom(${+zoom}); 1`); await b.dormir(1500); for (let i = 0; i < 6 && !(await b.allerPage(+page)); i++); await b.dormir(3000);
for (let i = 0; i < 20 && !(await b.ev(`!![...document.querySelectorAll('.pdfr-page[data-cle="${page}"] .pdfr-textlayer span')].find((s) => s.textContent.includes(${JSON.stringify(morceau)}))`)); i++) await b.dormir(500);
await b.ev(`(() => { const sp = [...document.querySelectorAll('.pdfr-page[data-cle="${page}"] .pdfr-textlayer span')].find((s) => s.textContent.includes(${JSON.stringify(morceau)}));
  const sc = document.querySelector('.pdfr-scroll'); const r = sp.getBoundingClientRect(), q = sc.getBoundingClientRect();
  sc.scrollTop += r.top - (q.top + q.height / 2); sc.scrollLeft += r.left - (q.left + 80); return 1; })()`); await b.dormir(1500);
// encre du passage : colonnes sombres du canvas dans la bande du morceau ; on prend les runs qui correspondent aux lettres
const geo = await b.ev(`(() => {
  const pg = document.querySelector('.pdfr-page[data-cle="${page}"]'); const layer = pg.querySelector('.pdfr-textlayer');
  const cv = pg.querySelector('canvas.pdfr-tampon.devant'); const cr = cv.getBoundingClientRect(); const k = cv.width / cr.width;
  const sp = [...layer.querySelectorAll('span')].find((s) => s.textContent.includes(${JSON.stringify(morceau)}));
  const R = sp.getBoundingClientRect(); const g = cv.getContext('2d');
  const y0 = Math.round((R.top - cr.top) * k), y1 = Math.round((R.bottom - cr.top) * k), x0 = Math.round((R.left - cr.left) * k) - 30, x1 = Math.round((R.right - cr.left) * k) + 30;
  const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data, W = x1 - x0, H = y1 - y0;
  const col = []; for (let x = 0; x < W; x++) { let n = 0; for (let y = 0; y < H; y++) { const i = (y * W + x) * 4; if (Math.abs(d[i]-d[0]) + Math.abs(d[i+1]-d[1]) + Math.abs(d[i+2]-d[2]) > 120) n++; } col.push(n > 0); }
  const runs = []; for (let x = 0; x < W; x++) { if (col[x] && (x === 0 || !col[x-1])) runs.push([x, x]); if (col[x]) runs[runs.length-1][1] = x; }
  return { runs: runs.map(([a, z]) => [(a + x0) / k + cr.left, (z + 1 + x0) / k + cr.left]), y: (R.top + R.bottom) / 2, str: sp.textContent };
})()`);
// index de lettre (hors espaces) du début et de la fin du passage dans le morceau
const i0 = geo.str.indexOf(passage), lettres = (s) => s.replace(/\s/g, '').length;
const a = lettres(geo.str.slice(0, i0)), z = a + lettres(passage) - 1;
// une run peut couvrir deux lettres collées (« rt ») : on ne s'en sert que pour le 1er et le dernier caractère du passage
console.log('runs encre', geo.runs.length, 'lettres', lettres(geo.str));
const de = [geo.runs[a] ? geo.runs[a][0] + 1 : null, geo.y], fin = [geo.runs[Math.min(z, geo.runs.length - 1)][1] - 1, geo.y];
// le run du dernier caractère : si des lettres collées, prendre le run qui contient la fin (dernier run correspondant)
await b.outil(outil); await b.dormir(300);
const souris = (type, x, y, extra = {}) => b.c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
await souris('mouseMoved', de[0], de[1]); await souris('mousePressed', de[0], de[1]);
for (let k = 1; k <= 14; k++) { await souris('mouseMoved', de[0] + (fin[0] - de[0]) * k / 14, de[1], { buttons: 1 }); await b.dormir(25); }
await souris('mouseReleased', fin[0], fin[1]); await b.dormir(1200);
const h = await b.S(`return (await S.getAll('highlights')).filter((h) => h.ficheId === 'f-sonde').map((h) => ({ texte: h.texte, anchor: h.anchor }))`);
console.log('glisser', de.map(Math.round), '→', fin.map(Math.round), 'dpr', dpr, 'zoom', zoom);
console.log('enregistré', JSON.stringify(h));
process.exit(0);
