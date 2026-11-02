// MealWeek intacte (02/11) : le hub ouvre MealWeek, son planning s'affiche, aucune erreur dans la console.
import { connecter } from '../tests-pdfreader-v2/cdp.mjs';
const c = await connecter(process.env.CDP_FILTRE || '5302');
const erreurs = [];
await c.send('Runtime.enable');
c.on((m) => { if (m.method === 'Runtime.exceptionThrown') erreurs.push(m.params.exceptionDetails.text); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') erreurs.push(JSON.stringify(m.params.args.map((a) => a.value || a.description)).slice(0, 200)); });
await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await c.ev(`(() => { const e = [...document.querySelectorAll('button,a,.sb-item')].find((x) => /changer d.app|retour à l.accueil/i.test(x.title || x.getAttribute('aria-label') || '')); e && e.click(); return 1; })()`); await c.dormir(1500);
await c.ev(`[...document.querySelectorAll('.hub-card')].find((x) => /MealWeek/i.test(x.innerText))?.click(); 1`); await c.dormir(3000);
const txt = await c.ev(`document.body.innerText`);
const ok = /planning repas/i.test(txt) && !erreurs.length;
console.log(ok ? '✅' : '❌', 'MealWeek :', txt.slice(0, 90).replace(/\n/g, ' · '), erreurs.length ? '— erreurs : ' + erreurs.join(' | ') : '— 0 erreur console');
// retour à MedRevise pour les autres bancs
await c.ev(`(() => { const e = [...document.querySelectorAll('button')].find((x) => /Retour à l.accueil|Changer d.app/.test(x.title || x.getAttribute('aria-label') || '')); e && e.click(); return 1; })()`); await c.dormir(1200);
await c.ev(`[...document.querySelectorAll('.hub-card')].find((x) => /^\\s*MedRevise/i.test(x.innerText))?.click(); 1`); await c.dormir(1500);
process.exit(ok ? 0 : 1);
