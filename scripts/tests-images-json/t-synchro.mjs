// Chantier 3 : synchro vers un 2ᵉ appareil (faux Supabase local). Ordi = 9335, tablette/2ᵉ appareil = 9336.
import { connecter } from './cdp.mjs';
import fs from 'fs';
process.env.CDP_FILTRE = '5300';
process.env.CDP_PORT = '9335';
const A = await connecter('5300');
process.env.CDP_PORT = '9336';
const Bc = await connecter('5300');
const ok = (c, m, d = '') => console.log((c ? '✅' : '❌') + ' ' + m + (d ? ' — ' + d : ''));
const S = (c, js) => c.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const S=await import(u.find(n=>n.includes('/medrevise/lib/storage.js')));${js}})()`);
const b3 = (c) => S(c, `const a=await S.getOne('annotations','an-b3');return {v:a.displayVersion||null,o:a.textOriginal||null,alt:a.textAlt||null,affiche:[...document.querySelectorAll('.pdfr-page[data-cle="1"] .note-box')].map(e=>e.innerText).find(t=>/itrate/.test(t))||null}`);
const synchro = async (c) => { await c.ev(`window.dispatchEvent(new Event('online')),1`); await c.dormir(5000); };
// 1. import sur l'ordi (même module que le panneau : lib/textesAnnotations via l'UI est testé dans t-json ; ici on passe par le panneau aussi)
await A.ev(`(()=>{document.querySelector('.mf-bouton').click();return 1})()`); await A.dormir(400);
await A.ev(`(()=>{[...document.querySelectorAll('.mf-item')].find(b=>b.innerText.startsWith('Importer des textes')).click();return 1})()`); await A.dormir(500);
const json = { course: 'PDF texte J', page: 1, boxes: [{ id: 'an-b3', text: 'Citrate synthase : étape 1.' }] };
await A.ev(`(()=>{const t=document.querySelector('.ta-colle');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(t,${JSON.stringify(JSON.stringify(json))});t.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`); await A.dormir(200);
await A.ev(`(()=>{[...document.querySelectorAll('button')].find(b=>b.innerText.trim().startsWith('Importer le collage')).click();return 1})()`); await A.dormir(1500);
console.log('ordi :', await A.ev(`(document.querySelector('.ta-message')||{}).innerText`));
await A.ev(`(()=>{const x=document.querySelector('.ta-panneau .icon-btn');x&&x.click();return 1})()`);
await A.dormir(2500); // file d'envoi (800 ms) + push
const cloud = await (await fetch('http://localhost:54399/__etat')).json();
const rowB3 = cloud.rows.find((r) => r.record_id === 'an-b3' && r.store === 'annotations');
ok(rowB3 && rowB3.data.textAlt === json.boxes[0].text && rowB3.data.displayVersion === 'alt' && !!rowB3.data.textOriginal, '1. cloud (faux Supabase) : la boîte porte ses deux versions + displayVersion', rowB3 && JSON.stringify({ textOriginal: rowB3.data.textOriginal, textAlt: rowB3.data.textAlt, displayVersion: rowB3.data.displayVersion }));
// 2. 2ᵉ appareil : synchro → mêmes deux versions, version IA affichée
await synchro(Bc);
let e = await b3(Bc);
ok(e.v === 'alt' && e.alt === json.boxes[0].text && e.o && e.affiche && e.affiche.includes('étape 1.') && e.affiche.includes('IA'), '2. 2ᵉ appareil : deux versions conservées, version IA affichée (badge IA)', JSON.stringify(e));
let r = await Bc.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync('../cap/synchro-appareil2-ia.png', Buffer.from(r.data, 'base64'));
// 3. bascule sur le 2ᵉ appareil (mini barre de la boîte) → l'ordi suit
const pb = await Bc.ev(`(async()=>{const e=[...document.querySelectorAll('.pdfr-page[data-cle="1"] .note-box')].find(x=>x.querySelector('.nb-version'));e.scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,400));const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
await Bc.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pb[0], y: pb[1] }); await Bc.dormir(800);
const bt = await Bc.ev(`(()=>{const b=document.querySelector('.nb-bascule');const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await Bc.send('Input.dispatchMouseEvent', { type, x: bt[0], y: bt[1], button: 'left', clickCount: 1 });
await Bc.dormir(2500);
await synchro(A);
e = await b3(A);
ok(e.v === 'original' && e.alt === json.boxes[0].text && e.affiche && e.affiche.includes('citrate synthase premiere') && e.affiche.includes('orig.'), '3. bascule faite sur le 2ᵉ appareil → l’ordi affiche l’original, la version IA reste', JSON.stringify(e));
r = await A.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync('../cap/synchro-ordi-original.png', Buffer.from(r.data, 'base64'));
A.fermer(); Bc.fermer();
