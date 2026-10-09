// boîte englobante des pixels différents entre deux PNG (décodés dans la page)
import { connecter } from './cdp.mjs';
import fs from 'fs';
const [a, z] = process.argv.slice(2);
const c = await connecter();
const A = fs.readFileSync(a).toString('base64'), Z = fs.readFileSync(z).toString('base64');
console.log(await c.ev(`(async()=>{const ld=(s)=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src='data:image/png;base64,'+s});const [i1,i2]=await Promise.all([ld(${JSON.stringify(A)}),ld(${JSON.stringify(Z)})]);const W=i1.width,H=i1.height;const g=(i)=>{const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.drawImage(i,0,0);return x.getImageData(0,0,W,H).data};const d1=g(i1),d2=g(i2);let x0=W,y0=H,x1=-1,y1=-1,n=0;for(let y=0;y<H;y++)for(let x=0;x<W;x++){const k=(y*W+x)*4;if(d1[k]!==d2[k]||d1[k+1]!==d2[k+1]||d1[k+2]!==d2[k+2]){n++;if(x<x0)x0=x;if(y<y0)y0=y;if(x>x1)x1=x;if(y>y1)y1=y}}return JSON.stringify({n,x0,y0,x1,y1,W,H})})()`));
c.fermer();
