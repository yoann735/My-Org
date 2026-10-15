// Reproduit le bug du sélecteur de couleur (version d'avant) sur une BOÎTE.
import { banc } from '../tests-pdfreader-v2/commun-doc.mjs';
const b = await banc();
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0`); await b.dormir(800);
const page = await b.ev(`(()=>{const s=[...document.querySelectorAll('.pdfr-textlayer span')][0].closest('.pdfr-page').getBoundingClientRect();return [s.x,s.y,s.width,s.height]})()`);
await b.clic(await b.bouton('Boîte'));
await b.clic([page[0] + page[2] * 0.55, page[1] + page[3] * 0.6], { att: 700 });
await b.ecrire('Boîte test couleur');
await b.dormir(400);
const coul0 = await b.ev(`getComputedStyle(document.querySelector('.note-box.active')).backgroundColor`);
// bouton couleur de la barre de la boîte
await b.clic(await b.pos(`document.querySelector('.nb-actions .sc-bouton')`), { att: 500 });
b.ok(await b.ev(`!!document.querySelector('.sc-pop')`), 'panneau de couleurs ouvert');
await b.clic(await b.pos(`document.querySelector('.sc-pop .sc-roue-btn')`), { att: 500 });
b.ok(await b.ev(`!!document.querySelector('.sc-fenetre')`), 'roue ouverte');
await b.capture('avant-roue');
// 1) saisie hex
await b.clic(await b.pos(`document.querySelector('.sc-fenetre .sc-hex')`), { att: 300 });
const focus = await b.ev(`document.activeElement && document.activeElement.className`);
b.ok(focus === 'sc-hex', 'clic dans le champ hex : il prend le focus', 'activeElement = ' + focus);
await b.ev(`(()=>{const i=document.querySelector('.sc-fenetre .sc-hex');i.select&&i.select();return 1})()`);
await b.ecrire('1e88e5');
b.ok((await b.ev(`document.querySelector('.sc-fenetre .sc-hex').value`)).toLowerCase().includes('1e88e5'), 'hex tapé', await b.ev(`document.querySelector('.sc-fenetre .sc-hex').value`));
// 2) curseur de luminosité
const lum0 = await b.ev(`document.querySelector('.sc-fenetre .sc-lum input').value`);
const r = await b.ev(`(()=>{const e=document.querySelector('.sc-fenetre .sc-lum input').getBoundingClientRect();return [e.x,e.y+e.height/2,e.width]})()`);
await b.c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r[0] + r[2] * 0.9, y: r[1], button: 'left', clickCount: 1 });
for (let k = 9; k >= 2; k--) { await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r[0] + r[2] * k / 10, y: r[1], button: 'left', buttons: 1 }); await b.dormir(30); }
await b.c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r[0] + r[2] * 0.2, y: r[1], button: 'left', clickCount: 1 });
const lum1 = await b.ev(`document.querySelector('.sc-fenetre .sc-lum input')?.value`);
b.ok(lum1 !== lum0, 'curseur de luminosité glissé', `${lum0} → ${lum1}`);
await b.capture('avant-apres-gestes');
// 3) aperçu en direct sur la boîte ?
const coul1 = await b.ev(`getComputedStyle(document.querySelector('.note-box.active')||document.querySelector('.note-box')).backgroundColor`);
b.ok(coul1 !== coul0, 'aperçu en direct sur la boîte', `${coul0} → ${coul1}`);
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
b.c.fermer();
