import { banc } from '../tests-bibliotheque-fichier/commun.mjs';
const b = await banc(1440, 900, { tactile: true });
await b.biblio({ recharger: true }); await b.ouvrir('Membre supérieur — repères');
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 820, deviceScaleFactor: 1, mobile: true }); await b.dormir(1500);
await b.ev(`(()=>{const t=[...document.querySelectorAll('[role=tab]')].find(x=>x.innerText.trim().startsWith('Transcript'));t&&t.click();return 1})()`); await b.dormir(1200);
const ligne = await b.pos(`[...document.querySelectorAll('.pis *')].find(x=>x.children.length<4&&/12 lignes/.test(x.innerText)&&x.getBoundingClientRect().height<60)`, false);
if (ligne) await b.tape(ligne);
await b.dormir(800);
const chev = await b.pos(`document.querySelector('.trx-chevron')`, false);
console.log('chevron', chev);
await b.tape(chev);
await b.capture('trx-tab-menu');
const diag = await b.ev(`(()=>{const its=[...document.querySelectorAll('.ctx-menu-item')];return JSON.stringify(its.map(it=>{const r=it.getBoundingClientRect();const top=document.elementFromPoint(r.x+r.width/2,Math.min(innerHeight-1,r.y+r.height/2));return [it.innerText.trim(),Math.round(r.y),Math.round(r.bottom),innerHeight,it===top||it.contains(top),top&&(top.className||top.tagName)]}))})()`);
console.log(diag);
// on tape « Copier sans horodatage »
const p = await b.pos(`[...document.querySelectorAll('.ctx-menu-item')].find(x=>x.innerText.includes('sans horodatage'))`, false);
// sonde : qui reçoit le click ?
await b.ev(`window.__cl=[];document.addEventListener('click',e=>window.__cl.push((e.target.className||e.target.tagName)+''),true);1`);
await b.tape(p);
console.log('clics reçus :', await b.ev(`JSON.stringify(window.__cl)`), ' menu ouvert ?', await b.ev(`!!document.querySelector('.ctx-menu')`), ' bouton :', await b.ev(`document.querySelector('.trx-groupe .btn')?.innerText`));
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
process.exit(0);
