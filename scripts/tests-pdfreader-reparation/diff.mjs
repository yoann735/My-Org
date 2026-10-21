// image des écarts entre deux captures de ../cap (rouge = pixel différent) → ../cap/<sortie>.png + boîtes englobantes
import { connecter } from '../tests-pdfreader-v2/cdp.mjs';
import fs from 'node:fs';
const [n1, n2, sortie = 'diff'] = process.argv.slice(2);
const c = await connecter();
const A = fs.readFileSync(`../cap/${n1}.png`).toString('base64'), B = fs.readFileSync(`../cap/${n2}.png`).toString('base64');
const r = await c.ev(`Promise.all(['${A}','${B}'].map(s=>new Promise(ok=>{const i=new Image();i.onload=()=>ok(i);i.src='data:image/png;base64,'+s}))).then(([a,b])=>{
  const W=a.width,H=a.height,k=document.createElement('canvas');k.width=W;k.height=H;const x=k.getContext('2d');
  x.drawImage(a,0,0);const p=x.getImageData(0,0,W,H);x.drawImage(b,0,0);const q=x.getImageData(0,0,W,H);
  const o=x.createImageData(W,H);const cell=new Map();
  for(let i=0;i<p.data.length;i+=4){const d=Math.max(Math.abs(p.data[i]-q.data[i]),Math.abs(p.data[i+1]-q.data[i+1]),Math.abs(p.data[i+2]-q.data[i+2]));
    const g=(p.data[i]+p.data[i+1]+p.data[i+2])/3;o.data[i]=d>2?255:g*0.3+170;o.data[i+1]=d>2?0:g*0.3+170;o.data[i+2]=d>2?0:g*0.3+170;o.data[i+3]=255;
    if(d>2){const px=(i/4)%W,py=Math.floor(i/4/W),key=Math.floor(px/40)+','+Math.floor(py/40);cell.set(key,(cell.get(key)||0)+1)}}
  x.putImageData(o,0,0);return JSON.stringify({png:k.toDataURL().split(',')[1],cellules:[...cell].sort((u,v)=>v[1]-u[1]).slice(0,12)})})`);
const j = JSON.parse(r);
fs.writeFileSync(`../cap/${sortie}.png`, Buffer.from(j.png, 'base64'));
console.log(JSON.stringify(j.cellules));
process.exit(0);
