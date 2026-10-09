// TABLETTE TACTILE (820 × 1180) : barre de mise en forme au doigt, 20 bascules, règles, surligneur au doigt sur une image
import { banc } from './commun-doc.mjs';
const b = await banc(1440, 900);
const c = b.c;
const tap = async (p, att = 400) => {
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p[0], y: p[1] }] });
  await b.dormir(60);
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await b.dormir(att);
};
await c.send('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180, deviceScaleFactor: 1, mobile: true });
await c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await b.dormir(1800);
b.ok(await b.ev(`!!document.querySelector('.lecteur-tab')`), 'mode tablette');
await tap(await b.bouton('Sélection'));
const visible = () => b.ev(`(()=>{const e=document.querySelector('.pdfr-contexte.mode-texte .pdfr-edit-toolbar');if(!e)return false;const r=e.getBoundingClientRect();return r.height>10&&+getComputedStyle(e.closest('.pdfr-rangee-contenu')).opacity>0.5})()`);
let manques = 0, sauts = 0;
const top0 = await b.ev(`document.querySelector('.pdfr-scroll').getBoundingClientRect().top`);
for (let k = 0; k < 20; k++) {
  const p = await b.ev(`(()=>{const ps=[...document.querySelectorAll('.pt-flux p')].filter(p=>{const r=p.getBoundingClientRect();return r.top>300&&r.bottom<1100});const p=ps[${k}%ps.length];const r=p.getBoundingClientRect();return [r.x+30+(${k}*23)%250,r.y+8]})()`);
  await tap(p, 450);
  if (!(await visible())) manques++;
  const t = await b.ev(`document.querySelector('.pdfr-scroll').getBoundingClientRect().top`);
  if (Math.abs(t - top0) > 1) sauts++;
  await tap(await b.bouton('Crayon'), 350);
  if (await visible()) manques++;
  await tap(await b.bouton('Sélection'), 350);
}
b.ok(manques === 0, 'tablette : 20 bascules au doigt, barre toujours juste', manques + ' écart(s)');
b.ok(sauts === 0, 'tablette : aucun saut du contenu', sauts + ' saut(s)');
await tap(await b.ev(`(()=>{const p=document.querySelector('.pt-flux p');const r=p.getBoundingClientRect();return [r.x+40,r.y+8]})()`), 600);
const grosse = await b.ev(`(()=>{const r=document.querySelector('.rg-h');return r?Math.round(r.getBoundingClientRect().height):0})()`);
b.ok(grosse >= 20, 'règles en tablette : cible tactile élargie', grosse + ' px');
// Gras au doigt sur un mot (double-tap = sélection du mot)
await b.capture('apres-tablette-mise-en-forme');
const nb = await b.ev(`document.querySelectorAll('.pdfr-contexte.mode-texte .et-btn').length`);
b.ok(nb > 15, 'tablette : toutes les commandes de mise en forme dans la rangée', nb + ' boutons');
b.ok(!(await b.ev(`!!document.querySelector('.pt-barre')`)), 'tablette : plus de barre en bas');
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
c.fermer();
