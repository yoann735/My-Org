import { banc } from './commun-doc.mjs';
const b = await banc();
await b.clic(await b.pos(`document.querySelector('.mf-bouton')`), { att: 400 });
await b.clic(await b.pos(`[...document.querySelectorAll('.mf-item')].find(x=>x.innerText.includes('Fond de page'))`), { att: 900 });
const pg = await b.ev(`(()=>{const r=[...document.querySelectorAll('.pdfr-page')].map(e=>e.getBoundingClientRect()).find(r=>r.height>300);return [r.x,r.y,r.width,r.height]})()`);
await b.capture(process.argv[2], { x: pg[0], y: pg[1] + pg[3] * 0.56, width: pg[2], height: pg[3] * 0.2 });
console.log('fond', await b.ev(`!!document.querySelector('.pt-flux-cadre.fond-noir')`) ? 'noir' : 'blanc');
b.c.fermer();
