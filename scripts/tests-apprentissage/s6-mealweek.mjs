// MealWeek intacte : hub → MealWeek s'affiche sans erreur console, puis retour à MedRevise.
import { appareil } from './banc.mjs';
import { capture } from './commun.mjs';
const A = await appareil(9335);
if (await A.ev(`!!document.querySelector('.sfc')`)) { await A.ev(`document.querySelector('.sfc-quitter').click(), true`); await A.dormir(800); }
await A.ev(`(() => { const el = [...document.querySelectorAll('button, .sb-item')].find((b) => /Changer d'app|Accueil — changer/.test(b.getAttribute('title') || b.getAttribute('aria-label') || '')); el && el.click(); return !!el; })()`);
await A.attendre(`!!document.querySelector('.hub-card')`);
await A.clic('MealWeek', '.hub-card');
await A.attendre(`!!document.querySelector('[data-app="mealweek"]') || /MealWeek/.test(document.body.innerText) && !document.querySelector('.hub-card')`);
await A.dormir(1500);
const t = await A.ev(`document.body.innerText.slice(0, 160).replace(/\\s+/g, ' ')`);
await capture(A, 'mealweek');
console.log((A.erreurs.length ? '❌' : '✅') + ' MealWeek s’affiche — « ' + t.slice(0, 90) + ' » · erreurs : ' + A.erreurs.length);
await A.ev(`(() => { const el = [...document.querySelectorAll('button')].find((b) => /accueil|Changer d'app/i.test(b.getAttribute('title') || b.getAttribute('aria-label') || '')); el && el.click(); return !!el; })()`);
await A.attendre(`!!document.querySelector('.hub-card')`); await A.clic('MedRevise', '.hub-card');
await A.attendre(`!!document.querySelector('[data-app="medrevise"]')`);
A.fermer(); process.exit(A.erreurs.length ? 1 : 0);
