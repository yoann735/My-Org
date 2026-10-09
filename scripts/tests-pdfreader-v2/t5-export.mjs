// « Exporter en PDF » d'un document : marges du PDF = marges du document
import { banc } from './commun-doc.mjs';
import fs from 'fs';
const b = await banc();
const c = b.c;
const att = JSON.parse(fs.readFileSync('../cap/marges-attendues.json', 'utf8'));
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0`); await b.dormir(400);
await b.clic(await b.pos(`document.querySelector('.mf-bouton')`), { att: 500 });
await b.clic(await b.pos(`[...document.querySelectorAll('.mf-item')].find(e=>/^Exporter en PDF/.test(e.innerText.trim()))`), { att: 4000 });
await c.send('Emulation.setEmulatedMedia', { media: 'print' }); await b.dormir(500);
const pdf = await c.send('Page.printToPDF', { printBackground: false, preferCSSPageSize: true });
await c.send('Emulation.setEmulatedMedia', { media: '' });
fs.writeFileSync('../cap/export-marges.pdf', Buffer.from(pdf.data, 'base64'));
// rendu pdf.js à 595 px (1 px = 1 unité de page) : première colonne / ligne d'encre de la page 1
const r = await b.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const pj=await import('/node_modules/pdfjs-dist/build/pdf.mjs');pj.GlobalWorkerOptions.workerSrc='/node_modules/pdfjs-dist/build/pdf.worker.mjs';const bin=Uint8Array.from(atob(${JSON.stringify(pdf.data)}),c=>c.charCodeAt(0));const d=await pj.getDocument({data:bin}).promise;const p=await d.getPage(1);const v1=p.getViewport({scale:1});const v=p.getViewport({scale:595/v1.width});const cv=document.createElement('canvas');cv.width=Math.round(v.width);cv.height=Math.round(v.height);const g=cv.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,cv.width,cv.height);await p.render({canvasContext:g,viewport:v}).promise;const im=g.getImageData(0,0,cv.width,cv.height).data;let x0=1e9,y0=1e9,x1=0;for(let y=0;y<cv.height;y++)for(let x=0;x<cv.width;x++){const k=(y*cv.width+x)*4;if(im[k]<120&&im[k+1]<120&&im[k+2]<120){if(x<x0)x0=x;if(y<y0)y0=y;if(x>x1)x1=x;}}window.__png=cv.toDataURL('image/png');return {pages:d.numPages,x0,y0,x1,w:cv.width,h:cv.height}})()`);
fs.writeFileSync('../cap/export-marges-p1.png', Buffer.from((await b.ev('window.__png')).split(',')[1], 'base64'));
const U = 595 / 210;
b.ok(Math.abs(r.x0 - att.gauche * U) < 4, `PDF : marge gauche ${att.gauche} mm`, `encre à ${r.x0} unités, attendu ${Math.round(att.gauche * U)}`);
b.ok(r.y0 > att.haut * U && r.y0 < att.haut * U + 30, `PDF : marge du haut ${att.haut} mm (titre juste dessous)`, `encre à ${r.y0} unités, marge ${Math.round(att.haut * U)}`);
b.ok(r.x1 <= 595 - att.droite * U + 2, `PDF : rien au-delà de la marge droite ${att.droite} mm`, `encre jusqu'à ${r.x1}, limite ${Math.round(595 - att.droite * U)}`);
const nbEcran = await b.ev(`document.querySelector('.ptb-pages .tnum').innerText`);
b.ok(String(r.pages) === nbEcran.split('/')[1].trim(), 'autant de pages dans le PDF qu’à l’écran', `${r.pages} / écran ${nbEcran}`);
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
c.fermer();
