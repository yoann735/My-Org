// Surligner les mots OCR d'une page PDF image : poser, aligner, retirer, recolorer, à 3 zooms
import { banc } from './commun-doc.mjs';
const b = await banc();
const c = b.c;
const glisser = async (a, z) => {
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a[0], y: a[1] });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a[0], y: a[1], button: 'left', clickCount: 1 });
  for (let k = 1; k <= 12; k++) { await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a[0] + (z[0] - a[0]) * k / 12, y: a[1] + (z[1] - a[1]) * k / 12, button: 'left', buttons: 1 }); await b.dormir(30); }
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: z[0], y: z[1], button: 'left', clickCount: 1 });
  await b.dormir(600);
};
const mot = (t, occ = 0) => b.ev(`(()=>{const s=[...document.querySelectorAll('.pdfr-textlayer .pdfr-ocr-mot')].filter(e=>e.textContent.trim().startsWith(${JSON.stringify(t)}))[${occ}];if(!s)return null;s.scrollIntoView({block:'center'});const r=s.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]})()`);
const nbHl = () => b.ev(`document.querySelectorAll('.pdfr-hlayer .pdfr-hl-rect').length`);
const zoom = async (pct) => { for (let i = 0; i < 12; i++) { const s = await b.ev(`parseInt(document.querySelector('.ptb-zoom .tnum, .tab-zoom').innerText)`); if (Math.abs(s - pct) < 8) break; await b.clic(await b.bouton(s > pct ? 'Dézoomer' : 'Zoomer'), { att: 500 }); } };
await b.clic(await b.bouton('Surligneur'));
await b.clic(await b.pos(`document.querySelectorAll('.pdfr-contexte .sc-couleurs > .sc-pastille:not([title="Couleur actuelle"])')[0]`));
// couleur courante : 1re pastille
const couleurs = await b.ev(`[...document.querySelectorAll('.pdfr-contexte .sc-pastille')].map(p=>p.title)`);
console.log('pastilles', couleurs.join(' | '));
const avant = await nbHl();
let a = await mot('Elle'), z = await mot('molécules');
await glisser([a[0] + 2, (a[1] + a[3]) / 2], [z[2] - 2, (z[1] + z[3]) / 2]);
const apres = await nbHl();
b.ok(apres > avant, 'surlignage posé sur des mots OCR', `${avant} → ${apres} rectangles`);
const ecart = async () => b.ev(`(()=>{const hl=[...document.querySelectorAll('.pdfr-hlayer .pdfr-hl-rect')].map(e=>e.getBoundingClientRect());const m=[...document.querySelectorAll('.pdfr-textlayer .pdfr-ocr-mot')].find(e=>e.textContent.trim().startsWith('Elle')).getBoundingClientRect();const h=hl.find(r=>Math.abs(r.top-m.top)<m.height);if(!h)return null;return {gauche:Math.round(Math.abs(h.left-m.left)*10)/10,haut:Math.round(Math.abs(h.top-m.top)*10)/10,bas:Math.round(Math.abs(h.bottom-m.bottom)*10)/10}})()`);
for (const pct of [160, 100, 250]) {
  await zoom(pct); await b.dormir(800);
  const e = await ecart();
  b.ok(e && e.gauche < 3 && e.haut < 4 && e.bas < 4, `alignement à ${pct} %`, JSON.stringify(e));
  await b.capture(`apres-hl-pdfimage-${pct}`);
}
await zoom(160); await b.dormir(800);
// recolorer : 2e pastille puis repasser
await b.clic(await b.pos(`document.querySelectorAll('.pdfr-contexte .sc-couleurs > .sc-pastille:not([title="Couleur actuelle"])')[1]`));
a = await mot('Elle'); z = await mot('molécules');
const c1 = await b.ev(`getComputedStyle(document.querySelector('.pdfr-hlayer .pdfr-hl-rect')).backgroundColor`);
await glisser([a[0] + 2, (a[1] + a[3]) / 2], [z[2] - 2, (z[1] + z[3]) / 2]);
const c2 = await b.ev(`getComputedStyle(document.querySelector('.pdfr-hlayer .pdfr-hl-rect')).backgroundColor`);
b.ok(c1 !== c2 && (await nbHl()) === apres, 'repasser dans une autre couleur : recoloré', `${c1} → ${c2}`);
await glisser([a[0] + 2, (a[1] + a[3]) / 2], [z[2] - 2, (z[1] + z[3]) / 2]);
b.ok((await nbHl()) === avant, 'repasser dans la même couleur : retiré');
// reposer pour l'export
await glisser([a[0] + 2, (a[1] + a[3]) / 2], [z[2] - 2, (z[1] + z[3]) / 2]);
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
c.fermer();
