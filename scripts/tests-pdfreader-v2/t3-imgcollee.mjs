import { banc } from './commun-doc.mjs';
import { glisserAvec, collerImage } from './outils-glisser.mjs';
import fs from 'fs';
const b = await banc();
const glisser = glisserAvec(b);
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0`); await b.dormir(500);
if (!(await b.ev(`!!document.querySelector('.pdfr-image')`))) {
  await b.clic(await b.bouton('Sélection'));
  const pg = await b.ev(`(()=>{const r=document.querySelector('.pdfr-textlayer').getBoundingClientRect();return [r.x+r.width*0.5,r.y+r.height*0.75]})()`);
  await b.clic(pg);
  await collerImage(b, fs.readFileSync('../fx/petit.b64', 'utf8').replace(/\s/g, ''));
}
b.ok(await b.ev(`!!document.querySelector('.pdfr-image')`), 'image collée sur la page du PDF');
// départ propre : image non pivotée
for (let i = 0; i < 4 && (await b.ev(`(document.querySelector('.pdfr-image-corps').style.transform||'').includes('rotate')`)); i++) {
  await b.clic(await b.bouton('Sélection'));
  await b.clic(await b.pos(`document.querySelector('.pdfr-image img')`), { att: 400 });
  await b.clic(await b.pos(`[...document.querySelectorAll('.pi-actions button')].find(x=>x.innerText.includes('90'))`), { att: 700 });
}
for (let i = 0; i < 30 && !(await b.ev(`document.querySelectorAll('.pdfr-image .pi-mot').length>3`)); i++) await b.dormir(2000);
b.ok(await b.ev(`document.querySelectorAll('.pdfr-image .pi-mot').length>3`), 'texte de l’image reconnu', await b.ev(`[...document.querySelectorAll('.pdfr-image .pi-mot')].map(e=>e.textContent.trim()).join(' ')`));
// cliquer à côté pour désélectionner
await b.clic(await b.ev(`(()=>{const r=document.querySelector('.pdfr-textlayer').getBoundingClientRect();return [r.x+30,r.y+30]})()`));
const mot = (t) => b.ev(`(()=>{const s=[...document.querySelectorAll('.pdfr-image .pi-mot')].find(e=>e.textContent.trim().startsWith(${JSON.stringify(t)}));if(!s)return null;const r=s.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]})()`);
const hls = () => b.ev(`[...document.querySelectorAll('.pdfr-image .pi-hl')].map(e=>getComputedStyle(e).backgroundColor)`);
await b.clic(await b.bouton('Surligneur'), { att: 500 });
await b.clic(await b.pos(`document.querySelectorAll('.pdfr-contexte .sc-pastille')[0]`));
let a = await mot('foie'), z = await mot('synthétise');
await glisser([a[0] + 2, (a[1] + a[3]) / 2], [z[2] - 2, (z[1] + z[3]) / 2]);
const h1 = await hls();
b.ok(h1.length >= 2, 'surligneur sur l’image collée : mots surlignés', h1.join(','));
const aligne = async () => b.ev(`(()=>{const m=[...document.querySelectorAll('.pdfr-image .pi-mot')].find(e=>e.textContent.trim().startsWith('foie')).getBoundingClientRect();const n=[...document.querySelectorAll('.pdfr-image .pi-hl')].map(e=>e.getBoundingClientRect()).sort((x,y)=>Math.abs(x.left-m.left)-Math.abs(y.left-m.left))[0];return n?Math.round(Math.max(Math.abs(n.left-m.left),Math.abs(n.top-m.top),Math.abs(n.bottom-m.bottom))*10)/10:null})()`);
b.ok((await aligne()) < 3, 'aligné sur les mots', (await aligne()) + ' px');
await b.capture('apres-hl-imgcollee');
await b.clic(await b.pos(`document.querySelectorAll('.pdfr-contexte .sc-pastille')[2]`));
a = await mot('foie'); z = await mot('synthétise');
await glisser([a[0] + 2, (a[1] + a[3]) / 2], [z[2] - 2, (z[1] + z[3]) / 2]);
const h2 = await hls();
b.ok(h2.length === h1.length && h2[0] !== h1[0], 'repasser dans une autre couleur : recoloré', h2[0]);
await glisser([a[0] + 2, (a[1] + a[3]) / 2], [z[2] - 2, (z[1] + z[3]) / 2]);
b.ok((await hls()).length === 0, 'repasser dans la même couleur : retiré');
await glisser([a[0] + 2, (a[1] + a[3]) / 2], [z[2] - 2, (z[1] + z[3]) / 2]);
// Sélection → bulle → Notion
await b.clic(await b.bouton('Sélection'), { att: 500 });
a = await mot('bile'); z = await mot('émulsionne');
await glisser([a[0] + 2, (a[1] + a[3]) / 2], [z[2] - 2, (z[1] + z[3]) / 2]);
const bulle = await b.ev(`[...document.querySelectorAll('.pi-bulle button')].map(x=>x.innerText.trim())`);
b.ok(bulle.join() === 'Notion,Flashcard,Copier', 'sélection → bulle Notion · Flashcard · Copier', bulle.join(' · '));
await b.capture('apres-imgcollee-bulle');
await b.clic(await b.pos(`[...document.querySelectorAll('.pi-bulle button')].find(x=>x.innerText.trim()==='Notion')`), { att: 900 });
b.ok((await hls()).length >= 4, 'Notion depuis la sélection : surlignée', (await hls()).length + ' mots');
const db = await b.S(`const h=(await S.getAll('highlights')).filter(x=>x.imageId);return h.map(x=>({c:x.couleur,t:x.texte,m:x.mots}))`);
console.log('   en base :', JSON.stringify(db));
// zoom : alignement
for (const lab of ['Zoomer', 'Dézoomer', 'Dézoomer']) { await b.clic(await b.bouton(lab), { att: 800 }); b.ok((await aligne()) < 3, 'alignement après ' + lab, (await aligne()) + ' px'); }
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
b.c.fermer();
