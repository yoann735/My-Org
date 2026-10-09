// capture d'une zone fixe de la page 1 (anciennes annotations) au zoom « ajuster »
import { banc } from './commun-doc.mjs';
const b = await banc();
await b.clic(await b.bouton('Sélection'));
await b.clic(await b.bouton('Ajuster à la largeur'), { att: 900 });
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0`); await b.dormir(900);
await b.ev(`document.activeElement&&document.activeElement.blur&&document.activeElement.blur()`);
await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 890 }); await b.dormir(500);
const r = await b.ev(`(()=>{const t=document.querySelector('.pdfr-textlayer').getBoundingClientRect();return {x:t.x,y:t.y,width:t.width,height:Math.min(520,900-t.y)}})()`);
await b.capture(process.argv[2], r);
console.log('zone', JSON.stringify(r));
b.c.fermer();
