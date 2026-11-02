// Planche avant / après (captures de docs/img/surlignage-alignement/) assemblée dans la page du banc
import { connecter } from '../tests-pdfreader-v2/cdp.mjs';
import { CAP } from './commun.mjs';
import fs from 'node:fs';
const [sortie, ...paires] = process.argv.slice(2); // paires : nom=légende
const c = await connecter(process.env.CDP_FILTRE || '5302');
const imgs = paires.map((p) => 'data:image/png;base64,' + fs.readFileSync(CAP + p.split('=')[0] + '.png').toString('base64'));
const leg = paires.map((p) => p.split('=').slice(1).join('='));
const out = await c.ev(`(async()=>{const srcs=${JSON.stringify(imgs)},leg=${JSON.stringify(leg)};
  const im=await Promise.all(srcs.map(s=>new Promise(ok=>{const i=new Image();i.onload=()=>ok(i);i.src=s;})));
  const G=16,T=30,W=Math.max(...im.map(i=>i.width))+G*2,H=im.reduce((a,i)=>a+i.height+T,0)+G*(im.length+1);
  const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.fillStyle='#f4f4f6';x.fillRect(0,0,W,H);
  let py=G;im.forEach((i,k)=>{x.fillStyle='#222';x.font='600 17px system-ui';x.fillText(leg[k],G,py+20);x.drawImage(i,G,py+T);py+=i.height+T+G;});
  return c.toDataURL('image/png').split(',')[1];})()`);
fs.writeFileSync(CAP + sortie + '.png', Buffer.from(out, 'base64'));
process.exit(0);
