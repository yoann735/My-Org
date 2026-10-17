// (17/10 soir) Netteté des PDF : à 100 / 150 / 200 %, sur écran Retina (1440 × 900, ×2) et iPad simulé (1024 × 1366,
// ×2, tactile) — canvas aux pixels réels, affiché 1 pour 1, calé au pixel ; capture de la même zone et indice de
// netteté (énergie des gradients) ; fluidité du défilement (images rAF, tâches longues).
// Usage : node t-nettete.mjs <avant|apres> <retina|ipad> — base LOCALE du banc.
import { banc } from './commun.mjs';
import fs from 'node:fs';
const etiquette = process.argv[2] || 'apres', appareil = process.argv[3] || 'retina';
const [W, H, mobile] = appareil === 'ipad' ? [1024, 1366, true] : [1440, 900, false];
const b = await banc(1440, 900, { tactile: mobile });
await b.c.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile });
// position de lecture effacée (base de test) : le cours s'ouvre au zoom PAR DÉFAUT, ajusté à la largeur
await b.S(`for(const r of await S.getAll('reading_position'))if(String(r.id).startsWith('rp:f-fj'))await S.remove('reading_position',r.id);return 1`);
await b.biblio({ recharger: true });
await b.ouvrir('Physiologie rénale (jumelle)'); await b.dormir(1500);
if ((await b.ev(`(document.querySelector('.pdfr-jumelle-bascule .seg-btn.active')||{}).innerText`)) === 'Fiche') { await b.ev(`[...document.querySelectorAll('.pdfr-jumelle-bascule .seg-btn')].find(x=>x.innerText.trim()==='Original').click();1`); await b.dormir(1800); }
const res = { etiquette, appareil, zooms: {} };
const nettete = (png) => b.ev(`new Promise(ok=>{const i=new Image();i.onload=()=>{const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);const d=x.getImageData(0,0,c.width,c.height).data;const g=new Float32Array(c.width*c.height);for(let k=0;k<g.length;k++)g[k]=0.299*d[4*k]+0.587*d[4*k+1]+0.114*d[4*k+2];
  let s=0,n=0,fort=0;for(let y=1;y<c.height-1;y++)for(let X=1;X<c.width-1;X++){const k=y*c.width+X;const gx=g[k+1]-g[k-1],gy=g[k+c.width]-g[k-c.width];const m=gx*gx+gy*gy;s+=m;n++;if(Math.sqrt(m)>120)fort++;}ok({tenengrad:Math.round(s/n),bordsNets:+(1000*fort/n).toFixed(2)})};i.src='data:image/png;base64,${'${png}'}'})`.replace('${png}', png));
for (const z of ['ajuste', 1, 1.5, 2]) {
  // « ajuste » : le zoom PAR DÉFAUT à l'ouverture (ajusté à la largeur, valeur non ronde)
  if (z !== 'ajuste') { await b.ev(`window.__mrZoom(${z});1`); await b.dormir(1600); }
  await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0;1`); await b.dormir(900);
  const al = await b.ev(`(()=>{const c=[...document.querySelectorAll('.pdfr-scroll canvas')].find(c=>c.dataset.rendu&&c.getBoundingClientRect().top>=0);const r=c.getBoundingClientRect();const d=devicePixelRatio;
    return {canvas:[c.width,c.height],affiche:[+(r.width*d).toFixed(2),+(r.height*d).toFixed(2)],x:+(r.left*d).toFixed(3),y:+(r.top*d).toFixed(3),densite:+(c.width/r.width).toFixed(3),clip:{x:Math.round(r.left)+40,y:Math.round(r.top)+30,width:Math.min(420,Math.round(r.width)-80),height:Math.min(260,Math.round(r.height)-60)}}})()`);
  const cap = await b.c.send('Page.captureScreenshot', { format: 'png', clip: { ...al.clip, scale: 1 } });
  const nomZ = z === 'ajuste' ? 'ajuste' : z * 100;
  fs.writeFileSync(`../cap/net-${etiquette}-${appareil}-${nomZ}.png`, Buffer.from(cap.data, 'base64'));
  const n = await nettete(cap.data);
  const unPourUn = Math.abs(al.canvas[0] - al.affiche[0]) < 0.01 && Math.abs(al.canvas[1] - al.affiche[1]) < 0.01;
  const cale = Math.abs(al.x - Math.round(al.x)) < 0.01 && Math.abs(al.y - Math.round(al.y)) < 0.01;
  res.zooms[nomZ] = { ...al, clip: undefined, unPourUn, cale, ...n, zoom: await b.ev(`(document.querySelector('.tab-zoom, .pdfr-v2 .hint.tnum')||{}).innerText||''`) };
  if (etiquette === 'apres') {
    b.ok(al.densite >= 1.99, `${appareil} ${nomZ}${z === 'ajuste' ? '' : ' %'} : canvas à la densité de l’écran (×2)`, String(al.densite));
    b.ok(unPourUn && cale, `${appareil} ${nomZ}${z === 'ajuste' ? '' : ' %'} : affiché 1 pour 1, calé au pixel réel (aucun ré-échantillonnage)`, `canvas ${al.canvas} / affiché ${al.affiche}, x ${al.x}, y ${al.y}`);
  }
}
// défilement : 3 s, 14 px par image
await b.ev(`(()=>{window.__img=[];window.__lt=[];try{new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__lt.push(Math.round(e.duration)))).observe({entryTypes:['longtask']})}catch(e){};return 1})()`);
const fl = await b.ev(`new Promise(ok=>{const el=document.querySelector('.pdfr-scroll');el.scrollTop=0;let t0=0,der=0;const dts=[];const f=(t)=>{if(!t0)t0=t;if(der)dts.push(t-der);der=t;el.scrollTop+=14;if(t-t0<3000)requestAnimationFrame(f);else ok({images:dts.length,max:Math.round(Math.max(...dts)),sautees:dts.filter(x=>x>25).length,fps:+(dts.length/((t-t0)/1000)).toFixed(1)})};requestAnimationFrame(f)})`);
fl.longues = await b.ev(`window.__lt.length`);
res.defilement = fl;
b.ok(etiquette !== 'apres' || (fl.sautees <= 2 && fl.longues === 0), `${appareil} : défilement fluide (3 s)`, JSON.stringify(fl));
fs.writeFileSync(`../cap/nettete-${etiquette}-${appareil}.json`, JSON.stringify(res, null, 1));
console.log('MESURE', JSON.stringify(res));
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' / '));
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
process.exit(0);
