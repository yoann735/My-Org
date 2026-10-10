// Non-régression : (1) export PDF annoté NORMAL de « Cours 12 pages IA » rendu en PNG (pages 1 et 2) ;
// (2) carte Muscle SANS image dans le panneau du cours. node nr-final.mjs <suffixe>
import { banc } from './commun-doc.mjs';
import fs from 'fs';
const B = await banc();
const { c, ev, clic, dormir } = B;
const suf = process.argv[2];
const r = await ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const imp=(f)=>import(u.find(n=>n.includes(f)));
const S=await imp('/medrevise/lib/storage.js');const A=await imp('/medrevise/pdf/exportAnnote.js');const P=await imp('/medrevise/pdf/pdfjsSetup.js');
const fiche=await S.getOne('fiches','ia-12');const ann=(await S.getAll('annotations')).filter(a=>a.ficheId==='ia-12');
const {octets}=await A.exporterDepuisBlob(fiche.pdfId,[],ann);const d=await P.openPdf(octets.slice());const out=[];
for(const n of [1,2]){const pg=await d.getPage(n);const vp=pg.getViewport({scale:2});const cv=document.createElement('canvas');cv.width=vp.width;cv.height=vp.height;const g=cv.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,cv.width,cv.height);await pg.render({canvasContext:g,viewport:vp}).promise;out.push(cv.toDataURL('image/png').split(',')[1])}
return out})()`);
r.forEach((b64, i) => fs.writeFileSync(`../cap/nr-export-p${i + 1}-${suf}.png`, Buffer.from(b64, 'base64')));
await clic(await B.pos(`[...document.querySelectorAll('button')].find(x=>x.innerText.trim().startsWith('Flashcards'))`, false), { att: 900 });
await ev(`document.activeElement&&document.activeElement.blur&&document.activeElement.blur(),1`);
await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 890 }); await dormir(700);
const rect = await ev(`(()=>{const e=[...document.querySelectorAll('.mu-tableau')].find(x=>x.closest('[class]'));e.scrollIntoView({block:'center'});const r=e.closest('.pis-item, .card, [class*=pis-]').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.min(600,Math.round(r.height))}})()`);
await dormir(500);
await B.capture('nr-muscle-' + suf, rect);
console.log('ok', suf, JSON.stringify(rect));
c.fermer();
