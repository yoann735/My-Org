// Surlignages EXISTANTS (02/11) : posés avec l'ANCIEN code (couche à un nœud texte par morceau), puis relus par le
// nouveau. Étape « poser » sur le banc de l'ancien code (Vite :5303 depuis un worktree de cf5acd6^, Chrome 9338) ;
// étape « relire » sur le banc courant (:5302, Chrome 9337). Le format des ancres { item, char } n'a pas changé : chaque
// surlignage doit se réafficher sur ses caractères (texte identique, bandes sur l'encre de sa 1re et dernière lettre).
//   CDP_PORT=9338 CDP_FILTRE=5303 FX=… node t-anciens.mjs poser   → anciens-surlignages.json
//   CDP_PORT=9337 CDP_FILTRE=5302 FX=… node t-anciens.mjs relire
import { banc } from './commun.mjs';
import fs from 'node:fs';
const etape = process.argv[2];
const FICHIER = new URL('./anciens-surlignages.json', import.meta.url);
const PASSAGES = [['polices.pdf', 1, 'corps virtuel'], ['polices.pdf', 1, 'schéma corporel'], ['polices.pdf', 1, 'diminue après'], ['anthropo.pdf', 41, 'corps virtuel'], ['deonto.pdf', 3, 'exemple positif']];
const b = await banc(1440, 900);
const ouvrir = async (fichier, page, vider) => {
  const id = 'f-anc-' + fichier.replace(/\W/g, '');
  await b.semer(id, 'Anciens ' + fichier, fichier);
  if (vider) await b.S(`for (const h of await S.getAll('highlights')) if (h.ficheId === ${JSON.stringify(id)}) await S.remove('highlights', h.id); return 1;`);
  return id;
};
const charger = async (fichier, page) => {
  await b.biblio({ recharger: true }); await b.ouvrir('Anciens ' + fichier); await b.dormir(2500);
  await b.ev(`window.__mrZoom && window.__mrZoom(1); 1`); await b.dormir(1500);
  for (let i = 0; i < 6 && !(await b.allerPage(page)); i++);
  await b.dormir(3000);
};
if (etape === 'poser') {
  const tous = [];
  for (const fichier of [...new Set(PASSAGES.map((p) => p[0]))]) {
    const page = PASSAGES.find((p) => p[0] === fichier)[1];
    const id = await ouvrir(fichier, page, true); await charger(fichier, page);
    await b.outil('Surligneur'); await b.dormir(300);
    for (const [, , passage] of PASSAGES.filter((p) => p[0] === fichier)) {
      // ancien code : un nœud texte par morceau ; sélection posée sur les caractères du passage, puis relâcher
      await b.ev(`(() => { const l = ${b.sel(page)}.querySelector('.pdfr-textlayer'); const sp = [...l.querySelectorAll('span')].find((s) => s.textContent.includes(${JSON.stringify(passage)}));
        sp.scrollIntoView({ block: 'center' }); const t = sp.firstChild, i = t.data.indexOf(${JSON.stringify(passage)});
        getSelection().setBaseAndExtent(t, i, t, i + ${passage.length}); const r = sp.getBoundingClientRect();
        l.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: r.right, clientY: r.bottom })); return 1; })()`);
      await b.dormir(1200);
    }
    const hs = await b.S(`return (await S.getAll('highlights')).filter((h) => h.ficheId === ${JSON.stringify(id)})`);
    tous.push(...hs.map((h) => ({ ...h, __fichier: fichier, __page: page })));
    console.log(fichier, hs.map((h) => h.texte));
  }
  fs.writeFileSync(FICHIER, JSON.stringify(tous));
} else {
  const anciens = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
  let ok = 0;
  for (const fichier of [...new Set(anciens.map((h) => h.__fichier))]) {
    const lot = anciens.filter((h) => h.__fichier === fichier), page = lot[0].__page;
    const id = await ouvrir(fichier, page, true);
    for (const h of lot) { const { __fichier, __page, ...rec } = h; await b.S(`await S.put('highlights', ${JSON.stringify({ ...rec, ficheId: id })}); return 1;`); }
    await charger(fichier, page);
    for (const h of lot) {
      const r = await b.ev(`(async () => {
        const P = await import('/src/medrevise/pdf/pdfShared.js');
        const pg = ${b.sel(page)}; const l = pg.querySelector('.pdfr-textlayer');
        const rg = P.rangeFromAnchor(l, ${JSON.stringify(h.anchor)}); if (!rg) return { err: 'ancre introuvable' };
        const texte = P.cleanSelectedText(P.texteDeRange(rg), { inline: true });
        const its = P.itemsCouche(l); const sp0 = its[${h.anchor.start.item}], sp1 = its[${h.anchor.end.item}];
        sp0.scrollIntoView({ block: 'center' }); await new Promise((ok) => setTimeout(ok, 900));
        const boite = (sp, c) => { const q = P.pointDeChar(sp, c); const r = document.createRange(); r.setStart(q.node, q.offset); r.setEnd(q.node, q.offset + 1); return r.getBoundingClientRect(); };
        const cv = pg.querySelector('canvas.pdfr-tampon.devant'); const cr = cv.getBoundingClientRect(); const k = cv.width / cr.width; const g = cv.getContext('2d');
        const encre = (q) => { const y0 = Math.round((q.top - cr.top) * k), y1 = Math.round((q.bottom - cr.top) * k), x0 = Math.round((q.left - cr.left) * k), x1 = Math.round((q.right - cr.left) * k);
          const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data, W = x1 - x0, H = y1 - y0; let a = null, z = null;
          for (let x = 0; x < W; x++) { let n = 0; for (let y = 0; y < H; y++) { const i = (y * W + x) * 4; if (d[i] + d[i+1] + d[i+2] < 450) n++; } if (n) { if (a == null) a = x; z = x; } }
          return a == null ? null : [(a + x0) / k + cr.left, (z + 1 + x0) / k + cr.left]; };
        const q0 = boite(sp0, ${h.anchor.start.char}), q1 = boite(sp1, ${h.anchor.end.char} - 1);
        const e0 = encre(q0), e1 = encre(q1);
        const bandes = [...pg.querySelectorAll('.pdfr-hl-rect[data-hl="${h.id}"]')].map((e) => e.getBoundingClientRect());
        const sur = (q) => bandes.find((b) => b.top <= (q.top + q.bottom) / 2 && b.bottom >= (q.top + q.bottom) / 2);
        const b0 = sur(q0), b1 = sur(q1);
        return { texte, q0: [q0.left, q0.right], q1: [q1.left, q1.right], e0, e1, b0: b0 && [b0.left, b0.right], b1: b1 && [b1.left, b1.right] };
      })()`);
      // la bande va du bord gauche de la 1re lettre au bord droit de la dernière (+ 2 px de débord voulus), et l'encre
      // de ces lettres est bien dans leur boîte (la couche est sur l'encre)
      const bon = r && !r.err && r.texte === h.texte && r.b0 && r.b1 && r.e0 && r.e1
        && r.b0[0] <= r.q0[0] + 0.6 && r.b0[0] >= r.q0[0] - 3 && r.b1[1] >= r.q1[1] - 0.6 && r.b1[1] <= r.q1[1] + 3
        && r.b0[0] <= r.e0[0] + 0.6 && r.b1[1] >= r.e1[1] - 0.6;
      if (bon) ok++;
      console.log(bon ? '✅' : '❌', fichier, `« ${h.texte} »`, r.err || `relu « ${r.texte} », bande ${r.b0 ? (r.b0[0] - r.e0[0]).toFixed(1) : '?'} / ${r.b1 ? (r.b1[1] - r.e1[1]).toFixed(1) : '?'} px de l'encre`);
    }
    if (fichier === 'polices.pdf') {
      const s = await b.c.send('Page.captureScreenshot', { format: 'png', clip: await b.ev(`(() => { const r = ${b.sel(page)}.getBoundingClientRect(); return { x: Math.max(0, r.left), y: Math.max(0, r.top), width: Math.min(760, r.width), height: Math.min(430, r.height), scale: 1 }; })()`) });
      fs.writeFileSync((await import('./commun.mjs')).CAP + 'anciens-relus.png', Buffer.from(s.data, 'base64'));
    }
  }
  console.log(`${ok}/${anciens.length} ✅`);
}
process.exit(0);
