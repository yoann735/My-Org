// Non-régression du chantier « surlignage aligné » (02/11) sur polices.pdf (Chrome) :
//   1. recherche ⌘F : occurrences trouvées (dont une à cheval sur deux lignes), rectangles sur les lettres ;
//   2. sélection → notion : le surlignage apparaît dans le panneau avec son texte exact ;
//   3. sélection → carte : outil Sélection, bulle « Ajouter au tableau », carte au texte exact ;
//   4. export PDF annoté : un surlignage récent ET un ancien aux rects enregistrés FAUX (couche décalée d'avant) sont
//      dessinés sur leurs lettres dans le PDF exporté (rendu du fichier exporté, couleur cherchée sous l'encre) ;
//   5. temps de construction de la couche (page dense du cours réel).
// CDP_PORT=9337 CDP_FILTRE=5302 FX=… node t-nonreg.mjs
import { banc, CAP } from './commun.mjs';
import fs from 'node:fs';
const b = await banc(1440, 900);
const erreurs = [];
await b.c.send('Runtime.enable');
b.c.on((m) => { if (m.method === 'Runtime.exceptionThrown') erreurs.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description.split('\n')[0] : m.params.exceptionDetails.text); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') erreurs.push(JSON.stringify(m.params.args.map((a) => a.value || a.description)).slice(0, 200)); });
let ok = 0, n = 0; const v = (c, m) => { n++; if (c) ok++; console.log(c ? '✅' : '❌', m); };
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
const ID = 'f-nonreg';
await b.semer(ID, 'Non-régression', 'polices.pdf');
await b.S(`for (const h of await S.getAll('highlights')) if (h.ficheId === '${ID}') await S.remove('highlights', h.id); await S.put('boards', { id: '${ID}', ficheId: '${ID}', objects: [] }).catch(() => 0); return 1;`).catch(() => 0);
// ancien surlignage : ancre juste, texte juste, rects ENREGISTRÉS décalés de 8 % de page vers la droite (comme une couche faussée)
await b.S(`await S.put('highlights', { id: 'h-ancien', ficheId: '${ID}', page: 1, couleur: 'jaune', texte: 'chronique modifie', anchor: { v: 1, start: { item: 1, char: 11 }, end: { item: 1, char: 28 } }, rects: [{ x: 0.36, y: 0.155, width: 0.17, height: 0.02 }], date: '2026-10-20' }); return 1;`);
await b.biblio({ recharger: true }); await b.ouvrir('Non-régression'); await b.dormir(2500);
await b.ev(`window.__mrZoom && window.__mrZoom(1); 1`); await b.dormir(2500);
const L = `document.querySelector('.pdfr-page[data-cle="1"] .pdfr-textlayer')`;
// boîtes (écran) du 1er et du dernier caractère d'un passage de la couche
const bornes = (passage) => b.ev(`(async () => { const P = await import('/src/medrevise/pdf/pdfShared.js'); const l = ${L};
  for (const sp of P.itemsCouche(l)) { const i = sp.textContent.indexOf(${JSON.stringify(passage)}); if (i < 0) continue;
    const bx = (c) => { const q = P.pointDeChar(sp, c); const r = document.createRange(); r.setStart(q.node, q.offset); r.setEnd(q.node, q.offset + 1); const z = r.getBoundingClientRect(); return [z.left, z.right, z.top, z.bottom]; };
    return { a: bx(i), z: bx(i + ${passage.length} - 1) }; } return null; })()`);
// vérifie l'ancre de « chronique modifie » utilisée par l'ancien surlignage
v((await b.ev(`(async () => { const P = await import('/src/medrevise/pdf/pdfShared.js'); const r = P.rangeFromAnchor(${L}, { v: 1, start: { item: 1, char: 11 }, end: { item: 1, char: 28 } }); return r && r.toString(); })()`)) === 'chronique modifie', 'ancien surlignage : son ancre désigne bien « chronique modifie »');
const bandeDe = (id) => b.ev(`[...document.querySelectorAll('.pdfr-hl-rect[data-hl="${id}"]')].map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.right]; })`);
let B = await bornes('chronique modifie'), hb = await bandeDe('h-ancien');
v(hb.length === 1 && hb[0][0] <= B.a[0] + 0.6 && hb[0][0] >= B.a[0] - 3 && hb[0][1] >= B.z[1] - 0.6 && hb[0][1] <= B.z[1] + 3, `ancien surlignage aux rects faux : affiché sur ses lettres (bande ${hb[0] ? (hb[0][0] - B.a[0]).toFixed(1) + ' / ' + (hb[0][1] - B.z[1]).toFixed(1) : '?'} px)`);

// ---- 1. recherche ⌘F
await b.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'f', code: 'KeyF', modifiers: 4, windowsVirtualKeyCode: 70 });
await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'f', code: 'KeyF', modifiers: 4, windowsVirtualKeyCode: 70 }); await b.dormir(500);
let focus = await b.ev(`document.activeElement && document.activeElement.placeholder || ''`);
if (!/Rechercher/.test(focus)) { await b.ev(`(() => { const x = [...document.querySelectorAll('button')].find((e) => /^Rechercher dans le document/.test(e.title || '')); x && x.click(); return 1; })()`); await b.dormir(400); focus = await b.ev(`document.activeElement && document.activeElement.placeholder || ''`); }
v(/Rechercher/.test(focus), `⌘F ouvre la recherche (champ « ${focus} » actif)`);
await b.c.send('Input.insertText', { text: 'exemple positif' }); await b.dormir(2500);
const occ = await b.ev(`[...document.querySelectorAll('.pdfr-page[data-cle="1"] .pdfr-match-rect')].map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom]; })`);
B = await bornes('exemple positif'); // occurrence en italique (une ligne)
const surLigne = occ.filter((r) => r[2] <= (B.a[2] + B.a[3]) / 2 && r[3] >= (B.a[2] + B.a[3]) / 2);
v(occ.length >= 3, `recherche « exemple positif » : ${occ.length} rectangles (italique + colonne à cheval sur deux lignes)`);
v(surLigne.length >= 1 && Math.min(...surLigne.map((r) => r[0])) <= B.a[0] + 0.6 && Math.min(...surLigne.map((r) => r[0])) >= B.a[0] - 0.6 && Math.max(...surLigne.map((r) => r[1])) >= B.z[1] - 0.6 && Math.max(...surLigne.map((r) => r[1])) <= B.z[1] + 0.6,
  'recherche : rectangle de l’occurrence italique = du bord du « e » au bord du « f », au pixel');
const s1 = await b.c.send('Page.captureScreenshot', { format: 'png', clip: { x: B.a[0] - 120, y: B.a[2] - 40, width: 560, height: 360, scale: 1 } });
fs.writeFileSync(CAP + 'nonreg-recherche.png', Buffer.from(s1.data, 'base64'));
await b.ev(`(() => { const x = document.querySelector('[aria-label="Fermer la recherche"]'); x && x.click(); return 1; })()`); await b.dormir(600);

// ---- 2. sélection → notion (surligneur)
const souris = (type, x, y, extra = {}) => b.c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
const glisser = async (de, a) => { await souris('mouseMoved', de[0], de[1]); await souris('mousePressed', de[0], de[1]); for (let k = 1; k <= 12; k++) { await souris('mouseMoved', de[0] + (a[0] - de[0]) * k / 12, de[1], { buttons: 1 }); await b.dormir(25); } await souris('mouseReleased', a[0], a[1]); await b.dormir(1200); };
B = await bornes('perception du schéma');
await b.outil('Surligneur'); await b.dormir(300);
await glisser([B.a[0] + 1, (B.a[2] + B.a[3]) / 2], [B.z[1] - 1, (B.z[2] + B.z[3]) / 2]);
const hs = await b.surlignages(ID);
const recent = hs.find((h) => h.id !== 'h-ancien');
v(recent && recent.texte === 'perception du schéma', `surligneur → notion enregistrée « ${recent && recent.texte} »`);
const dansPanneau = await b.ev(`[...document.querySelectorAll('body *')].some((e) => !e.closest('.pdfr-textlayer') && !e.closest('.pdfr-page') && e.childElementCount === 0 && /perception du schéma/.test(e.textContent))`);
v(dansPanneau, 'la notion apparaît dans le panneau, texte exact');

// ---- 3. sélection → carte du tableau (outil Sélection)
await b.outil('Sélection'); await b.dormir(300);
B = await bornes('rééducation progressive');
await glisser([B.a[0] + 1, (B.a[2] + B.a[3]) / 2], [B.z[1] - 1, (B.z[2] + B.z[3]) / 2]);
const sel = await b.ev(`getSelection().toString()`);
const bulle = await b.ev(`!!document.querySelector('.pdfr-vers-carte')`);
v(sel === 'rééducation progressive', `outil Sélection : sélection « ${sel} »`);
if (bulle) {
  await b.clic(await b.pos(`document.querySelector('.pdfr-vers-carte')`, false), { att: 1200 });
  const corps = await b.ev(`(async () => { const B = await import('/src/medrevise/lib/board.js'); const x = await B.lireBoard('${ID}'); return (x.objects || []).map((o) => o.corps || '').filter(Boolean); })()`);
  v(corps.includes('rééducation progressive'), `« Ajouter au tableau » : carte « ${corps.join(' | ')} »`);
} else v(false, 'bulle « Ajouter au tableau » absente');
await b.ev(`getSelection().removeAllRanges(); 1`);

// ---- 4. export PDF annoté
await b.ev(`(()=>{window.__dl=null;const o=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){window.__dl=this.href;return}return o.call(this)};return 1})()`);
await b.ev(`window.__mrExportTest = 1`);
const ouvert = await b.ev(`(() => { const x = document.querySelector('.mf-bouton'); if (!x) return false; x.click(); return true; })()`); await b.dormir(400);
await b.ev(`(() => { const x = [...document.querySelectorAll('.mf-item')].find((e) => /diapo annotée/.test(e.innerText)); x && x.click(); return !!x; })()`); await b.dormir(800);
// fenêtre du choix des pages : « Toutes » puis valider
await b.ev(`(() => { const ok = [...document.querySelectorAll('button')].find((e) => /^(Exporter|Valider|Télécharger)/.test(e.innerText.trim())); ok && ok.click(); return !!ok; })()`);
for (let i = 0; i < 40 && !(await b.ev(`!!window.__dl`)); i++) await b.dormir(500);
const dl = await b.ev(`!!window.__dl`);
v(ouvert && dl, 'export PDF annoté : fichier produit');
if (dl) {
  // le PDF exporté rendu à 2× ; colonnes JAUNES (surlignage) sous la ligne de chaque passage, comparées aux lettres
  const res = await b.ev(`(async () => {
    const P = await import('/src/medrevise/pdf/pdfShared.js'); const { openPdf } = await import('/src/medrevise/pdf/pdfjsSetup.js');
    const oct = new Uint8Array(await (await fetch(window.__dl)).arrayBuffer()); const d = await openPdf(oct); const pg = await d.getPage(1);
    const vp = pg.getViewport({ scale: 2 }); const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise; const g = cv.getContext('2d');
    const l = ${L}; const lr = l.getBoundingClientRect(); const fx = cv.width / lr.width, fy = cv.height / lr.height;
    const mesure = (passage) => { for (const sp of P.itemsCouche(l)) { const i = sp.textContent.indexOf(passage); if (i < 0) continue;
      const bx = (c) => { const q = P.pointDeChar(sp, c); const r = document.createRange(); r.setStart(q.node, q.offset); r.setEnd(q.node, q.offset + 1); return r.getBoundingClientRect(); };
      const a = bx(i), z = bx(i + passage.length - 1); const y0 = Math.round((a.top - lr.top) * fy), hh = Math.max(3, Math.round((a.bottom - a.top) * fy));
      // toute la hauteur de la ligne : sous une lettre épaisse le jaune reste visible au-dessus / au-dessous
      const row = g.getImageData(0, y0, cv.width, hh).data; const runs = [];
      for (let x = 0; x < cv.width; x++) { let jaune = false; for (let k = 0; k < hh; k++) { const j = (k * cv.width + x) * 4; if (row[j] > 150 && row[j + 1] > 120 && row[j + 2] < row[j] - 50) jaune = true; }
        if (jaune) { const r = runs[runs.length - 1]; if (r && x - r[1] <= 3) r[1] = x; else runs.push([x, x]); } }
      // la zone jaune de CE passage : celle qui recouvre le milieu du passage (deux surlignages sur la même ligne)
      const A = (a.left - lr.left) * fx, Z = (z.right - lr.left) * fx, m = (A + Z) / 2;
      const r = runs.find(([u, w]) => u <= m && w >= m) || [null, null];
      return { a: A, z: Z, x0: r[0], x1: r[1] + 1 }; } return null; };
    return { ancien: mesure('chronique modifie'), recent: mesure('perception du schéma') };
  })()`);
  const okExp = (m) => m && m.x0 != null && m.x0 <= m.a + 1.5 && m.x0 >= m.a - 6 && m.x1 >= m.z - 1.5 && m.x1 <= m.z + 6;
  v(okExp(res.recent), `export : surlignage récent sur ses lettres (début ${res.recent && (res.recent.x0 - res.recent.a).toFixed(1)} px, fin ${res.recent && (res.recent.x1 - res.recent.z).toFixed(1)} px à 2×)`);
  v(okExp(res.ancien), `export : ancien surlignage aux rects faux remis sur ses lettres (début ${res.ancien && (res.ancien.x0 - res.ancien.a).toFixed(1)} px, fin ${res.ancien && (res.ancien.x1 - res.ancien.z).toFixed(1)} px à 2×)`);
}

// ---- 5. temps de construction de la couche (page dense du cours réel)
await b.semer('f-perf', 'Perf', 'anthropo.pdf');
const t = await b.ev(`(async () => { const P = await import('/src/medrevise/pdf/pdfShared.js'); const { openPdf } = await import('/src/medrevise/pdf/pdfjsSetup.js'); const S = await import('/src/medrevise/lib/storage.js');
  const f = await S.getOne('fiches', 'f-perf'); const blob = await S.getBlob(f.pdfId); const d = await openPdf(new Uint8Array(await blob.arrayBuffer()));
  const out = []; for (const n of [3, 12, 35]) { const pg = await d.getPage(n); const vp = pg.getViewport({ scale: 1.5 }); await pg.getOperatorList();
    const c = document.createElement('div'); c.className = 'pdfr-textlayer'; Object.assign(c.style, { position: 'fixed', left: '-99999px', top: 0, width: vp.width + 'px', height: vp.height + 'px', inset: 'auto' }); document.body.appendChild(c);
    const t0 = performance.now(); await P.buildTextLayer(pg, vp, c); const ms = performance.now() - t0; out.push({ page: n, car: c.textContent.length, spans: c.querySelectorAll('span').length, ms: Math.round(ms) }); c.remove(); }
  return out; })()`);
v(t.every((x) => x.ms < 250), 'construction de la couche : ' + t.map((x) => `p.${x.page} ${x.car} car. ${x.ms} ms`).join(' · '));
v(!erreurs.length, `console : ${erreurs.length} erreur(s)${erreurs.length ? ' — ' + erreurs.slice(0, 3).join(' | ') : ''}`);
console.log(`${ok}/${n} ✅`);
process.exit(0);
