// TÉLÉPHONE (390 × 844) : MedRevise mobile s'ouvre, navigation, dessin mobile avec la nouvelle palette
import { banc } from './commun-doc.mjs';
const b = await banc(1440, 900);
const c = b.c;
const app = () => b.ev(`document.body.innerText.includes('Choisis ton espace') ? 'hub' : document.body.innerText.includes('PLANNING REPAS') ? 'mealweek' : 'medrevise'`);
if ((await app()) === 'mealweek') { await b.ev(`[...document.querySelectorAll('button,a')].find(b=>/Retour à l.accueil|Changer d.app/.test(b.title||b.getAttribute('aria-label')||''))?.click();1`); await b.dormir(1200); }
if ((await app()) === 'hub') { await b.ev(`[...document.querySelectorAll('.hub-card')].find(x=>/^\\s*MedRevise/i.test(x.innerText))?.click();1`); await b.dormir(2000); }
await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await b.dormir(2000);
const txt = await b.ev(`document.body.innerText.slice(0,120).replace(/\\n/g,' · ')`);
b.ok(/MedRevise|AUJOURD/i.test(txt), 'MedRevise mobile affiché', txt);
await b.capture('apres-mobile-accueil');
const boutons = await b.ev(`[...document.querySelectorAll('button')].filter(x=>x.offsetParent).map(x=>(x.getAttribute('aria-label')||x.innerText).trim().split('\\n')[0]).filter(Boolean).slice(0,14).join(' | ')`);
console.log('   boutons :', boutons);
// parcourir les onglets du bas
const onglets = await b.ev(`[...document.querySelectorAll('nav button, .mb-nav button, [role=tab]')].filter(x=>x.offsetParent).length`);
for (let i = 0; i < Math.min(onglets, 4); i++) { await b.ev(`[...document.querySelectorAll('nav button, .mb-nav button, [role=tab]')].filter(x=>x.offsetParent)[${i}].click();1`); await b.dormir(700); }
b.ok(!b.erreurs.length, 'navigation mobile : 0 erreur JS', b.erreurs.join(' | '));
await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await c.send('Emulation.setTouchEmulationEnabled', { enabled: false });
c.fermer();
