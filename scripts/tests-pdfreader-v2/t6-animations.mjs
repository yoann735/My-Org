// toutes les animations / transitions du lecteur ≤ 200 ms ; aucune avec prefers-reduced-motion
import { banc } from './commun-doc.mjs';
const b = await banc();
const c = b.c;
const releve = () => b.ev(`(()=>{const r=document.querySelector('.pdfr-v2');const els=[r,...r.querySelectorAll('*'),...document.querySelectorAll('.sc-pop,.ctx-menu,.pt-bulle,.mep-panneau')];let max=0,qui='',n=0;const ms=(v)=>Math.max(0,...v.split(',').map(x=>parseFloat(x)*(x.trim().endsWith('ms')?1:1000)));for(const e of els){const cs=getComputedStyle(e);const a=cs.animationName!=='none'?ms(cs.animationDuration):0;const t=ms(cs.transitionDuration);const d=Math.max(a,t);if(d>0)n++;if(d>max){max=d;qui=(e.className&&e.className.baseVal!==undefined?e.className.baseVal:e.className)+' '+(a>t?'anim '+cs.animationName:'trans '+cs.transitionProperty)}}return {max,qui:String(qui).slice(0,120),n}})()`);
// états variés : outil, mise en forme, menu Fichier ouvert
await b.clic(await b.bouton('Crayon'), { att: 300 });
await b.clic(await b.bouton('Sélection'), { att: 300 });
await b.clic(await b.pos(`document.querySelector('.pt-flux p')`), { att: 500 });
await b.clic(await b.pos(`document.querySelector('.mf-bouton')`), { att: 400 });
const r1 = await releve();
b.ok(r1.max <= 200, 'animations et transitions du lecteur ≤ 200 ms', `max ${r1.max} ms (${r1.qui}) sur ${r1.n} éléments animés`);
await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await b.dormir(300);
const r2 = await releve();
b.ok(r2.max === 0, 'prefers-reduced-motion : aucune animation ni transition', `max ${r2.max} ms (${r2.qui})`);
await c.send('Emulation.setEmulatedMedia', { features: [] });
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
c.fermer();
