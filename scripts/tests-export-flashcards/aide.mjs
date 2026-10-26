// Outils partagés des scénarios : ouverture du .zip (unzip du système, indépendant du lecteur de l'app), empreintes,
// capture d'une carte en vue agrandie, comparaison au pixel.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
export const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
export function ouvrirZip(chemin) {
  const test = execFileSync('unzip', ['-t', chemin], { encoding: 'utf8' });
  const noms = execFileSync('unzip', ['-Z1', chemin], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const lire = (n) => execFileSync('unzip', ['-p', chemin, n], { maxBuffer: 1 << 28 });
  let doc = null, jsonOk = true;
  try { doc = JSON.parse(lire('flashcards.json').toString('utf8')); } catch (e) { jsonOk = false; }
  return { integre: /No errors detected/.test(test), noms, lire, doc, jsonOk, readme: noms.includes('README.txt') ? lire('README.txt').toString('utf8') : '' };
}
// empreintes des blobs (dans la page) : id → sha256 (16 hex)
export const empreintesBlobs = (b, ids) => b.S(`const out={};for(const id of ${JSON.stringify(ids)}){const x=await S.getBlob(id);if(!x){out[id]=null;continue}const d=await crypto.subtle.digest('SHA-256',await x.arrayBuffer());out[id]=[...new Uint8Array(d)].map(v=>v.toString(16).padStart(2,'0')).join('').slice(0,16)}return out`);
// capture du cadre de la carte agrandie (recto puis verso), images et molécule chargées
export async function capturerCarte(b, id, prefixe) {
  await b.ev(`(()=>{const x=document.querySelector('.pis-item[data-item="${id}"] [data-act="agrandir"]');x.scrollIntoView({block:'center'});x.click();return 1})()`);
  await b.attendre(`!!document.querySelector('.va [data-carte="${id}"]')`, 8000);
  const pret = `(()=>{const im=[...document.querySelectorAll('.va img')];return im.every(i=>i.complete&&i.naturalWidth>0)})()`;
  const sorties = {};
  for (const cote of ['recto', 'verso']) {
    if (cote === 'verso') { await b.ev(`document.querySelector('.va [data-va="retourner"]').click()`); await b.attendre(`!!document.querySelector('.va [data-cote="verso"]')`, 5000); }
    await b.dormir(400); await b.attendre(pret, 8000); await b.dormir(900);
    const r = await b.rect(`document.querySelector('.va .sfc-carte-cadre')`);
    const images = await b.ev(`[...document.querySelectorAll('.va img')].map(i=>i.naturalWidth+'x'+i.naturalHeight).join(',')`);
    // zones des photos dans la capture (le rééchantillonnage d'une photo réduite varie d'une capture à l'autre)
    const zones = await b.ev(`[...document.querySelectorAll('.va .sfc-carte-cadre img')].map(i=>{const q=i.getBoundingClientRect();return [Math.floor(q.x-${r.x}),Math.floor(q.y-${r.y}),Math.ceil(q.right-${r.x}),Math.ceil(q.bottom-${r.y})]})`);
    const s = await b.send('Page.captureScreenshot', { format: 'png', clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 } });
    const f = `${prefixe}-${cote}.png`;
    fs.writeFileSync(f, Buffer.from(s.data, 'base64'));
    sorties[cote] = { f, images, zones };
  }
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await b.attendre(`!document.querySelector('.va')`, 5000);
  return sorties;
}
// nombre de pixels différents entre deux PNG (décodés dans la page)
export async function pxDiff(b, fa, fb, zones = []) {
  const d = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
  return b.ev(`(async()=>{const ld=(s)=>new Promise(ok=>{const i=new Image();i.onload=()=>ok(i);i.src=s});const [x,y]=await Promise.all([ld(${JSON.stringify(d(fa))}),ld(${JSON.stringify(d(fb))})]);
    if(x.width!==y.width||x.height!==y.height)return {n:-1,taille:x.width+'×'+x.height+' / '+y.width+'×'+y.height};
    const px=(im)=>{const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);return g.getImageData(0,0,c.width,c.height).data};
    // photos (marge de 3 px : l'anticrénelage de leurs coins arrondis) et coins arrondis du cadre (12 px)
    const Z=${JSON.stringify(zones)}.map(z=>[z[0]-3,z[1]-3,z[2]+3,z[3]+3]);const W=x.width,H=x.height;
    const coin=(X,Y)=>(X<12||X>=W-12)&&(Y<12||Y>=H-12);const dans=(X,Y)=>coin(X,Y)||Z.some(z=>X>=z[0]&&X<z[2]&&Y>=z[1]&&Y<z[3]);
    const p=px(x),q=px(y);let n=0,max=0,nHors=0,maxHors=0,maxDans=0;for(let k=0;k<p.length;k+=4){const e=Math.max(Math.abs(p[k]-q[k]),Math.abs(p[k+1]-q[k+1]),Math.abs(p[k+2]-q[k+2]));if(e){n++;max=Math.max(max,e);const X=(k/4)%x.width,Y=Math.floor(k/4/x.width);if(dans(X,Y))maxDans=Math.max(maxDans,e);else{nHors++;maxHors=Math.max(maxHors,e)}}}return {n,max,nHors,maxHors,maxDans,taille:x.width+'×'+x.height}})()`);
}
