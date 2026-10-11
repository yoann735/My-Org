// Zones image v2 (11/10) — non-régression : MealWeek s'ouvre depuis le hub, sans erreur ; retour au hub.
// Usage : node t-mealweek.mjs <dossier-captures>
import { appareil, ok, bilan } from '../tests-collage/outils.mjs';
const A = await appareil(9335, { captures: process.argv[2] || '/tmp/zones' });
await A.send('Page.reload', { ignoreCache: true }); await A.dormir(3000);
if (!(await A.ev(`!!document.querySelector('.hub-card')`))) { // MedRevise ouverte : retour au hub par son bouton
  await A.ev(`(() => { const b = [...document.querySelectorAll('button, a')].find((x) => /Retour à l'accueil|mes apps|Changer d'app/.test((x.getAttribute('title') || '') + x.textContent)); b && b.click(); return 1; })()`);
  await A.dormir(1200);
}
await A.clic(await A.pos(`[...document.querySelectorAll('.hub-card')].find((c) => /MealWeek/.test(c.textContent))`));
await A.dormir(3000);
const mw = await A.ev(`({ planning: /Planning de la semaine/.test(document.body.innerText), texte: document.body.innerText.length, medrevise: !!document.querySelector('[data-app="medrevise"]') })`);
ok(mw.planning && mw.texte > 200 && !mw.medrevise, 'MealWeek s’ouvre normalement depuis le hub', JSON.stringify(mw));
await A.capture('mealweek');
ok(A.erreurs.length === 0, 'aucune erreur JavaScript', A.erreurs.join(' | ').slice(0, 300));
await A.ev(`(() => { const b = [...document.querySelectorAll('button, a')].find((x) => /Retour à l'accueil|mes apps|Changer d'app|Accueil/.test((x.getAttribute('title') || '') + x.textContent)); b && b.click(); return 1; })()`);
A.fermer();
process.exit(bilan() ? 1 : 0);
