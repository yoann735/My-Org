// nombre de pixels différents entre deux PNG (décodés dans la page du Chrome C) : node px-diff.mjs a.png b.png …(paires)
import fs from 'node:fs';
import { banc } from './commun.mjs';
const b = await banc(false);
const a = process.argv.slice(2);
for (let i = 0; i < a.length; i += 2) {
  const d = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
  const r = await b.ev(`(async()=>{const ld=(s)=>new Promise(ok=>{const i=new Image();i.onload=()=>ok(i);i.src=s});const [x,y]=await Promise.all([ld(${JSON.stringify(d(a[i]))}),ld(${JSON.stringify(d(a[i + 1]))})]);
    if(x.width!==y.width||x.height!==y.height)return 'tailles '+x.width+'×'+x.height+' / '+y.width+'×'+y.height;
    const px=(im)=>{const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);return g.getImageData(0,0,c.width,c.height).data};
    const p=px(x),q=px(y);let n=0,max=0;for(let k=0;k<p.length;k+=4){const e=Math.max(Math.abs(p[k]-q[k]),Math.abs(p[k+1]-q[k+1]),Math.abs(p[k+2]-q[k+2]));if(e){n++;max=Math.max(max,e)}}return n+' px différents (écart max '+max+')'})()`);
  console.log(a[i].split('/').pop(), 'vs', a[i + 1].split('/').pop(), ':', r);
}
process.exit(0);
