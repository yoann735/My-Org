// (20/10) Zoom : AUCUN clignotement au relâchement — preuve image par image. Diapo IMAGE 4K avec annotations
// (boîtes + flèches, traits, forme), Retina simulé. 30 pincements (Ctrl + molette, petits deltas), 10 crans de
// molette (gros deltas), 10 zooms par boutons. Toutes les images peintes (Page.startScreencast) sont analysées :
//  - « blanche » : centre de la zone de lecture uniforme ;
//  - « transitoire » : une image qui s'écarte de ses deux voisines alors que celles-ci se ressemblent
//    (clignotement d'une image : page effacée, annotations qui sautent ou disparaissent un instant).
// Usage : node t-clignotement.mjs <etiquette> [ipad]
import { banc } from './commun.mjs';
import fs from 'node:fs';
const et = process.argv[2] || 'apres', ipad = process.argv[3] === 'ipad';
const [LW, LH] = ipad ? [1024, 1366] : [1440, 900];
const b = await banc(1440, 900, { tactile: ipad });
const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
await b.S(`for(const r of await S.getAll('reading_position'))if(String(r.id).startsWith('rp:f-v3-lourd'))await S.remove('reading_position',r.id);
  for(const a of await S.getAll('annotations'))if(a.ficheId==='f-v3-lourd')await S.remove('annotations',a.id);
  const box=(id,page,x,y,t,c,fl)=>({id,ficheId:'f-v3-lourd',page,x,y,width:0.16,height:0.05,kind:'libre',type:'boite',couleur:c,fond:'plein',content:${JSON.stringify(doc('X')).replace('"X"','t')},fleches:fl,createdAt:'2026-10-20T10:00:00.000Z'});
  for(const p of [1,3,5]){
    await S.put('annotations',box('an-c-'+p+'a',p,0.62,0.35,'Glomérule '+p,'ambre',[{id:'fa'+p,x:0.3,y:0.5,texte:null},{id:'fb'+p,x:0.45,y:0.8,texte:null}]));
    await S.put('annotations',box('an-c-'+p+'b',p,0.1,0.75,'Tubule '+p,'sauge',[{id:'fc'+p,x:0.5,y:0.6,texte:null}]));
    await S.put('annotations',{id:'an-c-'+p+'t',ficheId:'f-v3-lourd',page:p,kind:'trait',type:'trait',mode:'dessin',points:Array.from({length:40},(_,i)=>[0.15+i*0.012,0.3+0.05*Math.sin(i/3)]),couleur:'#111111',epaisseur:0.006,opacite:1,createdAt:'2026-10-20T10:00:00.000Z'});
    await S.put('annotations',{id:'an-c-'+p+'f',ficheId:'f-v3-lourd',page:p,kind:'forme',type:'forme',forme:'rectangle',x:0.7,y:0.6,width:0.2,height:0.15,couleur:'corail',epaisseur:0.0025,createdAt:'2026-10-20T10:00:00.000Z'});
  }return 1`);
await b.biblio({ recharger: true });
await b.ouvrir('Diapo lourde (zoom)'); await b.dormir(2500);
await b.c.send('Emulation.setDeviceMetricsOverride', { width: LW, height: LH, deviceScaleFactor: 2, mobile: ipad });
await b.dormir(1500);
await b.ev(`window.__mrZoom(1);1`); await b.dormir(1500);
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0;1`); await b.dormir(1500);
const zone = await b.ev(`(()=>{const r=document.querySelector('.pdfr-scroll').getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height}})()`);
const cx = zone.x + zone.w / 2, cy = zone.y + Math.min(zone.h * 0.35, 260);
// étiquette posée sur chaque nœud d'annotation et chaque canvas de la page 1 : un nœud re-monté ne l'aurait plus
await b.ev(`(()=>{const p=document.querySelector('.pdfr-page[data-cle="1"]');window.__noeuds=[...p.querySelectorAll('.note-box, .nb-fleche, .nb-ancre, .pdfr-inklayer, .pdfr-forme, canvas.pdfr-tampon')];window.__noeuds.forEach(n=>{n.__v4=1});
  window.__fondus=0;new MutationObserver(l=>l.forEach(m=>{if(m.target.matches&&m.target.matches('canvas.pdfr-tampon')&&/opacity 80ms/.test(m.target.style.transition))window.__fondus++})).observe(document.querySelector('.pdfr-pages'),{subtree:true,attributes:true,attributeFilter:['style']});return window.__noeuds.length})()`);
const images = [];
b.c.on((m) => { if (m.method === 'Page.screencastFrame') { images.push({ t: m.params.metadata.timestamp, data: m.params.data }); b.c.send('Page.screencastFrameAck', { sessionId: m.params.sessionId }).catch(() => {}); } });
await b.c.send('Page.enable');
await b.c.send('Page.startScreencast', { format: 'jpeg', quality: 70, maxWidth: LW / 2, everyNthFrame: 1 });
await b.dormir(400);
const molette = (d) => b.c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: d, modifiers: 2 });
const reperes = [];
const marquer = async (nom) => {
  reperes.push({ nom, t: await b.ev(`Date.now()/1000`) });
  // contrôle du détecteur (FLASH=1) : on efface volontairement la page pendant UNE image, 120 ms après le geste
  if (process.env.FLASH) await b.ev(`setTimeout(()=>{const p=document.querySelector('.pdfr-pages');p.style.opacity='0';requestAnimationFrame(()=>requestAnimationFrame(()=>{p.style.opacity=''}))},120);1`);
};
for (let k = 0; k < 30; k++) { // pincements
  const s = k % 2 ? 1 : -1;
  if (ipad) {
    const tp = (type, e) => b.c.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: cx - e, y: cy, id: 1 }, { x: cx + e, y: cy, id: 2 }] });
    const e0 = s < 0 ? 80 : 150, e1 = s < 0 ? 150 : 80;
    await tp('touchStart', e0); for (let i = 1; i <= 14; i++) { tp('touchMove', e0 + (e1 - e0) * i / 14); await b.dormir(16); }
    await b.dormir(50); await marquer('relache-' + k); await tp('touchEnd', e1);
  } else { for (let i = 0; i < 14; i++) { molette(s * 6); await b.dormir(16); } await marquer('relache-' + k); }
  await b.dormir(650);
}
for (let k = 0; k < 10; k++) { await marquer('molette-' + k); molette(k % 2 ? 100 : -100); await b.dormir(650); } // gros crans
for (let k = 0; k < 10; k++) { const titre = k % 2 ? 'Dézoomer' : 'Zoomer'; await marquer('bouton-' + k); await b.clic(await b.pos(`[...document.querySelectorAll('button')].find(x=>(x.title||x.getAttribute('aria-label')||'')===${JSON.stringify(titre)})`, false), { att: 650 }); }
await b.c.send('Page.stopScreencast');
fs.mkdirSync(`../cap/clign-${et}${ipad ? '-ipad' : ''}`, { recursive: true });
// --- analyse : vignettes 120 px en niveaux de gris de la zone de lecture ---
const ech = 0.5, bx = { x: Math.round(zone.x * ech), y: Math.round(zone.y * ech), w: Math.round(zone.w * ech), h: Math.round(Math.min(zone.h, LH - zone.y) * ech) };
const vign = [];
for (let i = 0; i < images.length; i += 25) {
  const lot = images.slice(i, i + 25).map((x) => x.data);
  vign.push(...await b.ev(`Promise.all(${JSON.stringify(lot)}.map(d=>new Promise(ok=>{const im=new Image();im.onload=()=>{const W=160,H=Math.round(160*${bx.h}/${bx.w});const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.drawImage(im,${bx.x},${bx.y},${bx.w},${bx.h},0,0,W,H);const p=x.getImageData(0,0,W,H).data;const g=[];let sm=0,sq=0;for(let k=0;k<p.length;k+=4){const l=0.3*p[k]+0.59*p[k+1]+0.11*p[k+2];g.push(Math.round(l));sm+=l;sq+=l*l}const n=g.length,m=sm/n;ok({g,sd:Math.sqrt(Math.max(0,sq/n-m*m))})};im.src='data:image/jpeg;base64,'+d})))`));
}
const diff = (a, c) => { let s = 0; for (let k = 0; k < a.g.length; k++) s += Math.abs(a.g[k] - c.g[k]); return s / a.g.length; };
// par blocs de 8 × 8 px de vignette : un détail qui saut un instant (flèche, boîte, trait) est vu aussi
const blocs = (a, c, W) => { const H = a.g.length / W, out = []; for (let by = 0; by < H; by += 8) for (let bx2 = 0; bx2 < W; bx2 += 8) { let sm = 0, n = 0; for (let y = by; y < Math.min(H, by + 8); y++) for (let x = bx2; x < Math.min(W, bx2 + 8); x++) { sm += Math.abs(a.g[y * W + x] - c.g[y * W + x]); n++; } out.push(sm / n); } return out; };
const transitoiresBlocs = [];
for (let i = 1; i < vign.length - 1; i++) {
  const A = blocs(vign[i - 1], vign[i], 160), C = blocs(vign[i], vign[i + 1], 160), AC = blocs(vign[i - 1], vign[i + 1], 160);
  const n = A.filter((a, k) => a > 30 && C[k] > 30 && AC[k] < Math.min(a, C[k]) * 0.4).length;
  // seulement quand la page doit être IMMOBILE : de 100 à 650 ms après un relâchement (pose du zoom, rendu net)
  const r = [...reperes].reverse().find((x) => x.t <= images[i].t), dt = r ? images[i].t - r.t : 9;
  if (n >= 1 && dt >= 0.1 && dt <= 0.65) transitoiresBlocs.push({ i, blocs: n });
}
const transitoires = [], blanches = [];
for (let i = 0; i < vign.length; i++) {
  if (vign[i].sd < 10) blanches.push(i);
  if (i > 0 && i < vign.length - 1) {
    const a = diff(vign[i - 1], vign[i]), c = diff(vign[i], vign[i + 1]), ac = diff(vign[i - 1], vign[i + 1]);
    if (a > 6 && c > 6 && ac < Math.min(a, c) * 0.4) transitoires.push({ i, a: +a.toFixed(1), c: +c.toFixed(1), ac: +ac.toFixed(1), t: images[i].t });
  }
}
const pres = (t) => { const r = [...reperes].reverse().find((x) => x.t <= t + 0.05); return r ? r.nom + '+' + Math.round((t - r.t) * 1000) + 'ms' : '?'; };
transitoires.slice(0, 12).forEach((x, n) => { for (const j of [x.i - 1, x.i, x.i + 1]) fs.writeFileSync(`../cap/clign-${et}${ipad ? '-ipad' : ''}/t${n}-${j - x.i + 1}.jpg`, Buffer.from(images[j].data, 'base64')); });
// planche témoin : 12 images consécutives autour du relâchement n°5
const r5 = reperes.find((x) => x.nom === 'relache-5'), i5 = images.findIndex((x) => x.t >= r5.t);
for (let j = 0; j < 12; j++) if (images[i5 - 2 + j]) fs.writeFileSync(`../cap/clign-${et}${ipad ? '-ipad' : ''}/relache5-${String(j).padStart(2, '0')}.jpg`, Buffer.from(images[i5 - 2 + j].data, 'base64'));
const res = { et, appareil: ipad ? 'ipad' : 'retina', images: images.length, blanches: blanches.length, transitoires: transitoires.length, transitoiresLocaux: transitoiresBlocs.length, locaux: transitoiresBlocs.slice(0, 10).map((x) => ({ ...x, quand: pres(images[x.i].t) })), details: transitoires.slice(0, 12).map((x) => ({ ...x, quand: pres(x.t) })) };
fs.writeFileSync(`../cap/clign-${et}${ipad ? '-ipad' : ''}.json`, JSON.stringify(res, null, 1));
const noeuds = await b.ev(`(()=>{const p=document.querySelector('.pdfr-page[data-cle="1"]');if(!p)return null;const l=[...p.querySelectorAll('.note-box, .nb-fleche, .nb-ancre, .pdfr-inklayer, .pdfr-forme, canvas.pdfr-tampon')];return {total:window.__noeuds.length,maintenant:l.length,remontes:l.filter(n=>!n.__v4).length,perdus:window.__noeuds.filter(n=>!n.isConnected).length}})()`);
res.noeuds = noeuds; res.fondus = await b.ev(`window.__fondus`);
console.log('MESURE', JSON.stringify(res));
b.ok(noeuds && noeuds.remontes === 0 && noeuds.perdus === 0, 'page 1 : annotations et canvas jamais re-montés (mêmes nœuds DOM après 50 zooms)', JSON.stringify(noeuds));
b.ok(res.fondus >= 20, 'passage au rendu net en fondu croisé de 80 ms', `${res.fondus} fondus`);
b.ok(blanches.length === 0, 'aucune image avec la page blanche', `${blanches.length} / ${images.length}`);
b.ok(transitoires.length === 0, 'aucune image transitoire (clignotement) sur 50 zooms', JSON.stringify(res.details.slice(0, 4)));
b.ok(transitoiresBlocs.length === 0, 'aucun détail transitoire (bloc de 8 px qui saute une image)', JSON.stringify(res.locaux.slice(0, 4)));
transitoiresBlocs.slice(0, 8).forEach((x, n) => { for (const j of [x.i - 1, x.i, x.i + 1]) fs.writeFileSync(`../cap/clign-${et}${ipad ? '-ipad' : ''}/b${n}-${j - x.i + 1}.jpg`, Buffer.from(images[j].data, 'base64')); });
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' / '));
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
process.exit(0);
