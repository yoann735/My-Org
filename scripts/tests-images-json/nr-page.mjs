// capture fixe de la page 1 de « PDF texte J » (boîtes + surlignage d'avant) : node nr-page.mjs <nom>
import { banc } from './commun-doc.mjs';
import { outilsJson } from './json-commun.mjs';
const B = await banc();
const J = outilsJson(B);
await B.ev(`(()=>{const b=document.querySelector('button.ptb-outil[title^="Sélection"]');b&&b.click();return 1})()`);
await J.cadrer();
await B.ev(`document.activeElement&&document.activeElement.blur&&document.activeElement.blur(),1`);
await B.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 890 }); await B.dormir(800);
const clip = await J.rectPage();
await J.capturer(process.argv[2], clip);
console.log('capture', process.argv[2], JSON.stringify(clip));
B.c.fermer();
