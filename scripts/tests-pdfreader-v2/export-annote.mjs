// Fichier → « Exporter en PDF annoté », téléchargement intercepté → fichier dans ../cap/<nom>.pdf
import { banc } from './commun-doc.mjs';
import fs from 'fs';
const b = await banc();
const nom = process.argv[2] || 'export';
await b.ev(`(()=>{window.__dl=null;const o=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){window.__dl=this.href;return}return o.call(this)};return 1})()`);
await b.clic(await b.pos(`[...document.querySelectorAll('.mf-bouton')][0]`), { att: 400 });
await b.clic(await b.pos(`[...document.querySelectorAll('.mf-item')].find(x=>x.innerText.includes('PDF annoté'))`), { att: 300 });
for (let i = 0; i < 40 && !(await b.ev(`!!window.__dl`)); i++) await b.dormir(500);
const b64 = await b.ev(`(async()=>{const r=await fetch(window.__dl);const a=new Uint8Array(await r.arrayBuffer());let s='';for(let i=0;i<a.length;i+=8192)s+=String.fromCharCode(...a.subarray(i,i+8192));return btoa(s)})()`);
fs.writeFileSync(`../cap/${nom}.pdf`, Buffer.from(b64, 'base64'));
console.log('export', nom, Buffer.from(b64, 'base64').length, 'octets');
b.c.fermer();
