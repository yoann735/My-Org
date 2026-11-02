// 15 cas du chantier « surlignage aligné » (02/11, docs/compte-rendu-surlignage-alignement.md). Comme un utilisateur :
// outil Surligneur, glisser de l'ENCRE du 1er caractère du passage (bord gauche, lu sur le canvas de la page) à l'encre
// de son dernier caractère (bord droit). Vérifié pour chaque cas :
//   1. texte enregistré = le passage, exactement ;
//   2. bande(s) affichée(s) : couvrent l'encre de la 1re et de la dernière lettre, sans toucher l'encre des lettres
//      voisines (2 px de débord voulus, pdfreader-v2.css).
// Modes : souris, stylet (pointerType pen, iPad + Apple Pencil), doigt (sélection système : curseur posé par le
// navigateur sous le doigt, caretRangeFromPoint, puis relâcher — c'est ce que fait la sélection tactile d'iPadOS).
// CDP_PORT=9337 CDP_FILTRE=5302 FX=<dossier des PDF> node t-cas.mjs [numéros…]
import { banc } from './commun.mjs';
import fs from 'node:fs';
const CAS = [
  { n: 1, nom: 'Titre gras 31 pt (cours réel, PowerPoint)', fichier: 'anthropo.pdf', page: 41, passage: 'corps virtuel' },
  { n: 2, nom: 'Texte courant 9,5 pt (fiche réelle, Word)', fichier: 'deonto.pdf', page: 3, passage: 'exemple positif' },
  { n: 3, nom: 'Titre gras 32 pt Georgia (Chrome)', fichier: 'polices.pdf', page: 1, passage: 'corps virtuel' },
  { n: 4, nom: 'Texte courant Georgia 12 pt', fichier: 'polices.pdf', page: 1, passage: 'perception du schéma' },
  { n: 5, nom: 'Italique Times 13 pt', fichier: 'polices.pdf', page: 1, passage: 'rééducation progressive' },
  { n: 6, nom: 'Petite police Avenir 7 pt', fichier: 'polices.pdf', page: 1, passage: 'proprioception lombaire' },
  { n: 7, nom: 'Monospace Courier 11 pt', fichier: 'polices.pdf', page: 1, passage: 'lombalgie basse' },
  { n: 8, nom: 'Deux lignes (colonne justifiée Gill Sans)', fichier: 'polices.pdf', page: 1, passage: 'reste un exemple' },
  { n: 9, nom: 'Début de ligne (italique)', fichier: 'polices.pdf', page: 1, passage: 'Un exemple' },
  { n: 10, nom: 'Fin de ligne', fichier: 'polices.pdf', page: 1, passage: 'patient lombalgique' },
  { n: 11, nom: 'Zoom 50 % (titre gras Avenir 20 pt)', fichier: 'polices.pdf', page: 1, passage: 'articulaire du genou', zoom: 0.5 },
  { n: 12, nom: 'Zoom 200 % (cours réel)', fichier: 'anthropo.pdf', page: 41, passage: 'corps virtuel', zoom: 2 },
  { n: 13, nom: 'Retina ×2, zoom 100 % (fiche réelle)', fichier: 'deonto.pdf', page: 3, passage: 'exemple positif', dpr: 2 },
  { n: 14, nom: 'Texte OCR (PDF image seule)', fichier: 'scan.pdf', page: 1, passage: 'chronique modifie', ocr: true },
  { n: 15, nom: 'iPad au doigt (1024×1366 tactile, Retina ×2)', fichier: 'polices.pdf', page: 1, passage: 'corps virtuel', mode: 'doigt', tablette: true },
  { n: 16, nom: 'iPad au stylet (Apple Pencil)', fichier: 'anthropo.pdf', page: 41, passage: 'corps virtuel', mode: 'stylet', tablette: true },
];
const choix = process.argv.slice(2).map(Number).filter(Boolean);
const b = await banc(1440, 900);
const resultats = [];
let precedent = null;
for (const cas of CAS.filter((c) => !choix.length || choix.includes(c.n))) {
  const { fichier, page, passage, zoom = 1, dpr = 1, mode = 'souris', tablette = false, ocr = false } = cas;
  const W = tablette ? 1024 : 1440, H = tablette ? 1366 : 900;
  await b.c.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: tablette ? 2 : dpr, mobile: false });
  await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: tablette, maxTouchPoints: tablette ? 5 : 1 });
  const id = 'f-cas-' + fichier.replace(/\W/g, '');
  const cle = [fichier, zoom, dpr, tablette].join('|');
  if (cle !== precedent) {
    await b.semer(id, 'Cas ' + fichier, fichier);
    await b.S(`for (const h of await S.getAll('highlights')) if (h.ficheId === ${JSON.stringify(id)}) await S.remove('highlights', h.id); return 1;`);
    await b.biblio({ recharger: true }); await b.ouvrir('Cas ' + fichier); await b.dormir(2500);
    await b.ev(`window.__mrZoom && window.__mrZoom(${zoom}); 1`); await b.dormir(1500);
    for (let i = 0; i < 6 && !(await b.allerPage(page)); i++);
    await b.dormir(2500);
    precedent = cle;
  }
  // couche prête (OCR : la reconnaissance tourne dans l'app, jusqu'à 2 min)
  for (let i = 0; i < (ocr ? 150 : 30); i++) {
    if (await b.ev(`(() => { const l = ${b.sel(page)} && ${b.sel(page)}.querySelector('.pdfr-textlayer'); return !!l && l.textContent.replace(/\\s+/g, ' ').includes(${JSON.stringify(passage)}); })()`)) break;
    await b.dormir(1000);
  }
  // géométrie du passage : caractères (couche), bandes d'encre de leur ligne (canvas) → points du glisser
  const geo = async () => b.ev(`(async () => {
    const P = await import('/src/medrevise/pdf/pdfShared.js');
    const pg = ${b.sel(page)}; const layer = pg.querySelector('.pdfr-textlayer');
    const cv = pg.querySelector('canvas.pdfr-tampon.devant'); const cr = cv.getBoundingClientRect(); const k = cv.width / cr.width; const g = cv.getContext('2d');
    const car = []; for (const sp of P.itemsCouche(layer)) { const s = sp.textContent; for (let i = 0; i < s.length; i++) car.push({ sp, i, c: s[i] }); car.push(null); }
    let S = '', idx = []; car.forEach((x, j) => { if (!x) { if (S && !/\\s$/.test(S)) { S += ' '; idx.push(-1); } return; } if (/\\s/.test(x.c) && /\\s$/.test(S)) return; S += /\\s/.test(x.c) ? ' ' : x.c; idx.push(j); });
    const p = S.indexOf(${JSON.stringify(passage)}); if (p < 0) return { err: 'passage introuvable' };
    const boite = (x) => { const q = P.pointDeChar(x.sp, x.i); const r = document.createRange(); r.setStart(q.node, q.offset); r.setEnd(q.node, q.offset + 1); return r.getBoundingClientRect(); };
    const bandes = (sp) => { const R = sp.getBoundingClientRect(); const y0 = Math.max(0, Math.round((R.top - cr.top) * k)), y1 = Math.min(cv.height, Math.round((R.bottom - cr.top) * k));
      const x0 = Math.max(0, Math.round((R.left - cr.left) * k) - 60), x1 = Math.min(cv.width, Math.round((R.right - cr.left) * k) + 60);
      const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data, W = x1 - x0, H = y1 - y0; const fond = [d[0], d[1], d[2]];
      const col = []; for (let x = 0; x < W; x++) { let n = 0; for (let y = 0; y < H; y++) { const i = (y * W + x) * 4; if (Math.abs(d[i]-fond[0]) + Math.abs(d[i+1]-fond[1]) + Math.abs(d[i+2]-fond[2]) > 150) n++; } col.push(n > 0); }
      const runs = []; for (let x = 0; x < W; x++) { if (col[x] && (x === 0 || !col[x-1])) runs.push([x, x]); if (col[x]) runs[runs.length-1][1] = x; }
      return { runs: runs.map(([a, z]) => [(a + x0) / k + cr.left, (z + 1 + x0) / k + cr.left]), y: (R.top + R.bottom) / 2 }; };
    const lettre = (j, cote) => { const x = car[idx[j]]; const q = boite(x); const B = bandes(x.sp); const cx = (q.left + q.right) / 2;
      // bande d'encre de la lettre : celle qui contient le centre de sa boîte, sinon la plus proche
      let r = B.runs.findIndex(([a, z]) => cx >= a && cx <= z); if (r < 0) { let dm = 1e9; B.runs.forEach(([a, z], i) => { const dd = Math.min(Math.abs(a - cx), Math.abs(z - cx)); if (dd < dm) { dm = dd; r = i; } }); }
      return { encre: B.runs[r], avant: B.runs[r - 1] || null, apres: B.runs[r + 1] || null, y: B.y, haut: q.top, bas: q.bottom }; };
    return { debut: lettre(p, 'debut'), fin: lettre(p + ${passage.length} - 1, 'fin') };
  })()`);
  let G = await geo();
  if (G.err) { resultats.push({ ...cas, ok: false, detail: G.err }); console.log('❌', cas.n, cas.nom, G.err); continue; }
  // passage visible au centre de l'écran
  await b.ev(`(() => { const sc = document.querySelector('.pdfr-scroll'); const q = sc.getBoundingClientRect(); sc.scrollTop += ${G.debut.y} - (q.top + q.height / 2); sc.scrollLeft += ${(G.debut.encre[0] + G.fin.encre[1]) / 2} - (q.left + q.width / 2); return 1; })()`);
  await b.dormir(1200); G = await geo();
  const de = [G.debut.encre[0] + 1, G.debut.y], a = [G.fin.encre[1] - 1, G.fin.y];
  const sous = await b.ev(`(() => { const e = document.elementFromPoint(${de[0]}, ${de[1]}); return e ? (e.closest('.pdfr-textlayer') ? 'couche' : (e.className && e.className.baseVal == null ? e.className : e.tagName)) : 'rien'; })()`);
  if (sous !== 'couche') console.log('   (sous le point de départ :', sous, ')');
  const avant = (await b.surlignages(id)).map((h) => h.id);
  const actif = await b.ev(`(() => { const x = [...document.querySelectorAll('.ptb-outil, .tab-outil, [data-outil]')].find((e) => /^Surligneur/.test(e.getAttribute('aria-label') || e.title || '')); return !!x && x.getAttribute('aria-pressed') === 'true'; })()`);
  if (!actif) { await b.outil('Surligneur'); await b.dormir(300); }
  if (mode === 'doigt') {
    // sélection SYSTÈME : le navigateur pose chaque borne sous le doigt (même calcul que les poignées d'iPadOS)
    await b.ev(`(() => { const p = document.caretRangeFromPoint(${de[0]}, ${de[1]}), q = document.caretRangeFromPoint(${a[0]}, ${a[1]});
      getSelection().setBaseAndExtent(p.startContainer, p.startOffset, q.startContainer, q.startOffset);
      const l = ${b.sel(page)}.querySelector('.pdfr-textlayer'); l.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: ${a[0]}, clientY: ${a[1]} })); return 1; })()`);
    await b.dormir(1000);
  } else await b.glisser(de, a, 14, mode === 'stylet' ? { pointerType: 'pen' } : {});
  const nouveaux = (await b.surlignages(id)).filter((h) => !avant.includes(h.id));
  const h = nouveaux[0];
  await b.ev(`getSelection().removeAllRanges(); 1`); await b.dormir(400);
  // bandes affichées de ce surlignage
  const bandesHl = h ? await b.ev(`[...document.querySelectorAll('.pdfr-hl-rect[data-hl="${h.id}"]')].map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom]; })`) : [];
  const ligneDe = (L) => bandesHl.find((r) => r[2] <= (L.haut + L.bas) / 2 && r[3] >= (L.haut + L.bas) / 2);
  const b0 = ligneDe(G.debut), b1 = ligneDe(G.fin);
  const T = 0.6, DEB = 2.6; // tolérance d'anticrénelage ; débord voulu de 2 px
  const couvreDebut = b0 && b0[0] <= G.debut.encre[0] + T && (!G.debut.avant || b0[0] >= G.debut.avant[1] - DEB - T);
  const couvreFin = b1 && b1[1] >= G.fin.encre[1] - T && (!G.fin.apres || b1[1] <= G.fin.apres[0] + DEB + T);
  const texteOk = h && h.texte === passage;
  const ok = !!(texteOk && couvreDebut && couvreFin);
  const detail = `enregistré « ${h ? h.texte : '—'} » ; bande ${b0 ? (b0[0] - G.debut.encre[0]).toFixed(1) : '?'} px / encre début, ${b1 ? (b1[1] - G.fin.encre[1]).toFixed(1) : '?'} px / encre fin`;
  resultats.push({ n: cas.n, nom: cas.nom, mode, zoom, dpr: tablette ? 2 : dpr, ok, detail });
  console.log(ok ? '✅' : '❌', cas.n, cas.nom, '—', detail);
  // capture : la zone du passage
  const x0 = Math.min(G.debut.encre[0], G.fin.encre[0]) - 50, x1 = Math.max(G.debut.encre[1], G.fin.encre[1]) + 50, y0 = Math.min(G.debut.haut, G.fin.haut) - 25, y1 = Math.max(G.debut.bas, G.fin.bas) + 25;
  const s = await b.c.send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, x0), y: Math.max(0, y0), width: x1 - x0, height: y1 - y0, scale: 1 } });
  fs.writeFileSync(`${(await import('./commun.mjs')).CAP}cas-${String(cas.n).padStart(2, '0')}.png`, Buffer.from(s.data, 'base64'));
}
await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: false }); await b.c.send('Emulation.clearDeviceMetricsOverride');
const fichierRes = new URL('./resultats-cas.json', import.meta.url);
fs.writeFileSync(fichierRes, JSON.stringify(resultats, null, 1));
console.log(`${resultats.filter((r) => r.ok).length}/${resultats.length} ✅`);
process.exit(0);
