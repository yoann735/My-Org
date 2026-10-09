import { banc } from './commun-doc.mjs';
import { glisserAvec } from './outils-glisser.mjs';
const b = await banc();
const glisser = glisserAvec(b);
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0`); await b.dormir(500);
const pg = await b.ev(`(()=>{const r=[...document.querySelectorAll('.pdfr-page')].map(e=>e.getBoundingClientRect()).find(r=>r.height>300);return [r.x,r.y,r.width,r.height]})()`);
const deja = await b.ev(`document.querySelectorAll('.pdfr-page svg path').length`);
if (deja < 12) {
  await b.clic(await b.bouton('Crayon'), { att: 400 });
  for (const mode of ['Dessin', 'Surligneur']) {
    await b.clic(await b.pos(`[...document.querySelectorAll('.pdfr-contexte .ptb-segment button')].find(x=>x.innerText.trim()===${JSON.stringify(mode)})`), { att: 300 });
    for (let i = 0; i < 6; i++) {
      await b.clic(await b.pos(`document.querySelectorAll('.pdfr-contexte .sc-couleurs > .sc-pastille:not([title="Couleur actuelle"])')[${i}]`), { att: 200 });
      const x0 = pg[0] + pg[2] * (0.12 + i * 0.13), y0 = pg[1] + (mode === 'Dessin' ? 0.62 : 0.70) * pg[3];
      await glisser([x0, y0], [x0 + pg[2] * 0.1, y0 - 12], 10);
    }
  }
  await b.clic(await b.bouton('Sélection'));
}
const zone = { x: pg[0], y: pg[1] + pg[3] * 0.56, width: pg[2], height: pg[3] * 0.2 };
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0`); await b.dormir(300);
await b.capture('apres-palette-blanc', zone);
console.log(process.argv[2] === 'noir' ? '' : 'blanc capturé');
b.c.fermer();
