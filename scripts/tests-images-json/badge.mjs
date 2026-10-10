import { banc } from './commun-doc.mjs';
const B = await banc();
await B.clic(await B.bouton('Ajuster à la largeur'), { att: 600 });
for (let i = 0; i < 2; i++) await B.clic(await B.bouton('Zoomer'), { att: 400 });
const r = await B.ev(`(async()=>{const e=[...document.querySelectorAll('.pdfr-page[data-cle="1"] .note-box')].find(x=>x.querySelector('.nb-version'));e.scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,500));const b=e.getBoundingClientRect();return [b.x,b.y,b.width,b.height]})()`);
await B.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r[0] + r[2] / 2, y: r[1] + r[3] / 2 }); await B.dormir(900);
await B.capture('json-badge-barre', { x: r[0] - 30, y: r[1] - 60, width: Math.max(420, r[2] + 60), height: r[3] + 100 });
B.c.fermer();
