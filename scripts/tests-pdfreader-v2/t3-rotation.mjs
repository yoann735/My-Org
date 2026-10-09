import { banc } from './commun-doc.mjs';
const b = await banc();
await b.clic(await b.bouton('Sélection'));
await b.clic(await b.bouton('Ajuster à la largeur'), { att: 800 });
await b.ev(`document.querySelector('.pdfr-image').scrollIntoView({block:'center'})`); await b.dormir(500);
// rotation 90° : les surlignages suivent
await b.clic(await b.pos(`document.querySelector('.pdfr-image img')`), { att: 400 });
if (!(await b.ev(`(document.querySelector('.pdfr-image-corps').style.transform||'').includes('90')`))) await b.clic(await b.pos(`[...document.querySelectorAll('.pi-actions button')].find(x=>x.innerText.includes('90'))`), { att: 800 });
// pivotée de 90° : la largeur à l'écran = la hauteur du mot (l'espace final du mot s'étend en vertical)
const aligneRot = await b.ev(`(()=>{const m=[...document.querySelectorAll('.pdfr-image .pi-mot')].find(e=>e.textContent.trim().startsWith('foie')).getBoundingClientRect();const n=[...document.querySelectorAll('.pdfr-image .pi-hl')].map(e=>e.getBoundingClientRect()).sort((x,y)=>Math.abs(x.top-m.top)-Math.abs(y.top-m.top))[0];return Math.round(Math.max(Math.abs(n.left-m.left),Math.abs(n.right-m.right),Math.abs(n.top-m.top))*10)/10})()`);
b.ok(aligneRot < 3, 'image pivotée : surlignages toujours sur les mots', aligneRot + ' px');
await b.capture('apres-imgcollee-rotation');
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
b.c.fermer();
