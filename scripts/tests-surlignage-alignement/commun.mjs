// Banc du chantier « surlignage aligné » (02/11, docs/compte-rendu-surlignage-alignement.md).
// Vite :5302 SANS Supabase + Chrome headless 9337 (profil neuf), base LOCALE seulement.
import { banc as bancV3 } from '../tests-pdfreader-v3/commun.mjs';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
export const CAP = fileURLToPath(new URL('../../docs/img/surlignage-alignement/', import.meta.url));
fs.mkdirSync(CAP, { recursive: true });
export async function banc(W = 1440, H = 900, opts = {}) {
  const b = await bancV3(W, H, opts);
  b.sel = (page) => `document.querySelector('.pdfr-page[data-cle="${page}"]')`;
  // ouvre un cours semé, zoom donné, page donnée, morceau `texte` au centre de l'écran
  b.preparer = async ({ id, titre, fichier, page, texte, zoom = 1 }) => {
    await b.semer(id, titre, fichier);
    await b.S(`for (const h of await S.getAll('highlights')) if (h.ficheId === ${JSON.stringify(id)}) await S.remove('highlights', h.id); return 1;`);
    await b.biblio({ recharger: true }); await b.ouvrir(titre); await b.dormir(2500);
    await b.ev(`window.__mrZoom && window.__mrZoom(${zoom}); 1`); await b.dormir(1500);
    for (let i = 0; i < 6 && !(await b.allerPage(page)); i++);
    await b.dormir(2500);
    for (let i = 0; i < 30 && !(await b.ev(`!![...${b.sel(page)}.querySelectorAll('.pdfr-textlayer > span')].find((s) => s.textContent.includes(${JSON.stringify(texte)}))`)); i++) await b.dormir(400);
    await b.centrer(page, texte);
  };
  b.centrer = async (page, texte) => {
    await b.ev(`(() => { const sp = [...${b.sel(page)}.querySelectorAll('.pdfr-textlayer > span')].find((s) => s.textContent.includes(${JSON.stringify(texte)}));
      const sc = document.querySelector('.pdfr-scroll'); const r = sp.getBoundingClientRect(), q = sc.getBoundingClientRect();
      sc.scrollTop += r.top - (q.top + q.height / 2); sc.scrollLeft += (r.left + r.right) / 2 - (q.left + q.width / 2); return 1; })()`);
    await b.dormir(1200);
  };
  // ENCRE d'un passage : bandes de colonnes sombres du canvas sous le morceau ; renvoie le bord gauche de l'encre du
  // 1er caractère du passage et le bord droit de l'encre du dernier (lettres sans espaces, dans l'ordre)
  b.encre = (page, texte, passage) => b.ev(`(() => {
    const pg = ${b.sel(page)}; const layer = pg.querySelector('.pdfr-textlayer');
    const cv = pg.querySelector('canvas.pdfr-tampon.devant'); const cr = cv.getBoundingClientRect(); const k = cv.width / cr.width;
    const sp = [...layer.querySelectorAll(':scope > span')].find((s) => s.textContent.includes(${JSON.stringify(texte)}));
    const R = sp.getBoundingClientRect(); const g = cv.getContext('2d');
    const y0 = Math.max(0, Math.round((R.top - cr.top) * k)), y1 = Math.min(cv.height, Math.round((R.bottom - cr.top) * k));
    const x0 = Math.max(0, Math.round((R.left - cr.left) * k) - 30), x1 = Math.min(cv.width, Math.round((R.right - cr.left) * k) + 30);
    const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data, W = x1 - x0, H = y1 - y0;
    const col = []; for (let x = 0; x < W; x++) { let n = 0; for (let y = 0; y < H; y++) { const i = (y * W + x) * 4; if (Math.abs(d[i]-d[0]) + Math.abs(d[i+1]-d[1]) + Math.abs(d[i+2]-d[2]) > 120) n++; } col.push(n > 0); }
    // trous de moins d'un px réel ignorés (anticrénelage au milieu d'une lettre)
    const runs = []; for (let x = 0; x < W; x++) { if (col[x] && (x === 0 || !col[x-1])) runs.push([x, x]); if (col[x]) runs[runs.length-1][1] = x; }
    const ecran = runs.map(([a, z]) => [(a + x0) / k + cr.left, (z + 1 + x0) / k + cr.left]);
    const str = sp.textContent, i0 = str.indexOf(${JSON.stringify(passage)}); const lettres = (s) => s.replace(/\\s/g, '').length;
    const a = lettres(str.slice(0, i0)), z = a + lettres(${JSON.stringify(passage)}) - 1, tot = lettres(str);
    // lettres collées (« rt ») : une bande pour deux lettres ; on compte depuis la fin pour la dernière lettre
    const debut = ecran[a] ? ecran[a][0] : null, fin = ecran[ecran.length - (tot - z)] ? ecran[ecran.length - (tot - z)][1] : null;
    return { debut, fin, y: (R.top + R.bottom) / 2, bandes: ecran.length, lettres: tot };
  })()`);
  // points ÉCRAN du bord gauche du 1er caractère et du bord droit du dernier d'un passage, calculés depuis le PDF seul
  // (pdf.js : position du morceau + largeurs des glyphes de sa police) — indépendant de la couche de texte testée
  b.pointsPdf = (fiche, page, passage) => b.ev(`(async () => {
    const { openPdf, pdfjsLib } = await import('/src/medrevise/pdf/pdfjsSetup.js'); const S = await import('/src/medrevise/lib/storage.js');
    const f = await S.getOne('fiches', ${JSON.stringify(fiche)}); const d = await openPdf(new Uint8Array(await (await S.getBlob(f.pdfId)).arrayBuffer()));
    const pg = await d.getPage(${page}); await pg.getOperatorList(); const tc = await pg.getTextContent();
    const it = tc.items.find((x) => x.str.includes(${JSON.stringify(passage)})); const fo = pg.commonObjs.get(it.fontName);
    const inv = new Map(); const tu = fo.toUnicode; if (tu && Array.isArray(tu._map)) tu._map.forEach((u, c) => { if (typeof u === 'string' && u && !inv.has(u)) inv.set(u, c); });
    const corps = Math.hypot(it.transform[0], it.transform[1]), fm = (fo.fontMatrix && fo.fontMatrix[0]) || 0.001;
    const av = [...it.str].map((ch) => { const c = inv.get(ch); return c == null ? null : (fo.widths[c] != null ? fo.widths[c] : fo.defaultWidth || 0) * fm * corps; });
    const connus = av.reduce((a, w) => a + (w || 0), 0), nb = av.filter((w) => w == null).length; const pleins = av.map((w) => (w == null ? Math.max(0, it.width - connus) / Math.max(1, nb) : w));
    const tot = pleins.reduce((a, w) => a + w, 0); const x = [0]; pleins.forEach((w) => x.push(x[x.length - 1] + w * it.width / tot));
    const i = it.str.indexOf(${JSON.stringify(passage)}), j = i + ${passage.length};
    const cv = document.querySelector('.pdfr-page[data-cle="${page}"] canvas.pdfr-tampon.devant'); const cr = cv.getBoundingClientRect();
    const vp = pg.getViewport({ scale: cr.width / pg.getViewport({ scale: 1 }).width }); const tx = pdfjsLib.Util.transform(vp.transform, it.transform);
    const h = Math.hypot(tx[2], tx[3]);
    return { debut: cr.left + tx[4] + x[i] * vp.scale, fin: cr.left + tx[4] + x[j] * vp.scale, y: cr.top + tx[5] - h * 0.35 };
  })()`);
  const souris = (type, x, y, extra = {}) => b.c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
  b.glisser = async (de, a, pas = 14, extra = {}) => {
    await souris('mouseMoved', de[0], de[1], extra); await souris('mousePressed', de[0], de[1], extra);
    for (let k = 1; k <= pas; k++) { await souris('mouseMoved', de[0] + (a[0] - de[0]) * k / pas, de[1] + (a[1] - de[1]) * k / pas, { buttons: 1, ...extra }); await b.dormir(25); }
    await souris('mouseReleased', a[0], a[1], extra); await b.dormir(1000);
  };
  // pincement à deux doigts (événements tactiles) ; `tenir` : ms doigts posés à la fin (le geste reste ouvert)
  // `retour` : les doigts reviennent à l'écart de départ avant d'être levés (geste net nul : le zoom ne change pas)
  b.pincer = async (cx, cy, facteur, { pas = 10, tenir = 0, d0 = 120, retour = false } = {}) => {
    const pts = (d) => [{ x: cx - d / 2, y: cy, id: 1 }, { x: cx + d / 2, y: cy, id: 2 }];
    await b.c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(d0) });
    for (let k = 1; k <= pas; k++) { await b.c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d0 * (1 + (facteur - 1) * k / pas)) }); await b.dormir(30); }
    const fin = Date.now() + tenir; while (Date.now() < fin) { await b.c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d0 * facteur) }); await b.dormir(100); }
    if (retour) for (let k = pas - 1; k >= 0; k--) { await b.c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d0 * (1 + (facteur - 1) * k / pas)) }); await b.dormir(30); }
    await b.c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  // couche de texte rendue VISIBLE (rouge translucide, un cadre par caractère / morceau) par-dessus la page
  b.coucheVisible = (oui = true) => b.ev(`(() => { let s = document.getElementById('sonde-couche'); if (!${oui}) { s && s.remove(); return 1; }
    if (!s) { s = document.createElement('style'); s.id = 'sonde-couche'; document.head.appendChild(s); }
    s.textContent = '.pdfr-textlayer span{color:rgba(230,0,40,.75)!important;outline:1px solid rgba(0,120,255,.5)} .pdfr-textlayer > span > span{outline:1px solid rgba(0,160,80,.55)}'; return 1; })()`);
  b.capture = async (nom, page, texte, marge = 40) => {
    const r = await b.ev(`(() => { const sp = [...${b.sel(page)}.querySelectorAll('.pdfr-textlayer > span')].find((s) => s.textContent.includes(${JSON.stringify(texte)})); const q = sp.getBoundingClientRect(); return [q.left, q.top, q.width, q.height]; })()`);
    // cadre = morceau ∪ encre du texte (une couche fausse peut être bien plus étroite que l'encre)
    const e = await b.encre(page, texte, texte).catch(() => null);
    const g = Math.min(r[0], e && e.debut != null ? e.debut : r[0]), d = Math.max(r[0] + r[2], e && e.fin != null ? e.fin : 0);
    const clip = { x: Math.max(0, g - marge), y: Math.max(0, r[1] - marge), width: d - g + marge * 2, height: r[3] + marge * 2, scale: 1 };
    const s = await b.c.send('Page.captureScreenshot', { format: 'png', clip });
    fs.writeFileSync(CAP + nom + '.png', Buffer.from(s.data, 'base64'));
  };
  // écart de largeur de chaque morceau de la couche à sa largeur exacte (item.width × échelle), en %
  b.ecartLargeurs = (page) => b.ev(`(() => { const pg = ${b.sel(page)}; const l = pg.querySelector('.pdfr-textlayer'); const g = l.__mrGlyphes; if (!g || !g.page) return null;
    const k = l.getBoundingClientRect().width / l.offsetWidth, e = l.offsetWidth / (g.page.view[2] - g.page.view[0]); let pire = 0;
    for (const sp of l.querySelectorAll(':scope > span')) { const d = g.parSpan.get(sp); if (!d || !d.largeur || d.str.trim().length < 4) continue;
      // largeur de l'ENCRE de la couche : du 1er au dernier caractère (nœuds texte)
      const r = document.createRange(); r.selectNodeContents(sp); const qs = [...r.getClientRects()].filter((q) => q.width > 0);
      const w = (Math.max(...qs.map((q) => q.right)) - Math.min(...qs.map((q) => q.left))) / k;
      pire = Math.max(pire, Math.abs(w / (d.largeur * e) - 1)); }
    return +(pire * 100).toFixed(2); })()`);
  // outil Surligneur actif (recliquer un outil actif le désactive)
  b.surligneur = async () => {
    const actif = await b.ev(`(() => { const x = [...document.querySelectorAll('.ptb-outil, .tab-outil, [data-outil]')].find((e) => /^Surligneur/.test(e.getAttribute('aria-label') || e.title || '')); return !!x && x.getAttribute('aria-pressed') === 'true'; })()`);
    if (!actif) { await b.outil('Surligneur'); await b.dormir(300); }
  };
  b.surlignages = (id) => b.S(`return (await S.getAll('highlights')).filter((h) => h.ficheId === ${JSON.stringify(id)}).map((h) => ({ id: h.id, texte: h.texte, anchor: h.anchor }))`);
  return b;
}
