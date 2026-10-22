// v1.1 — MealWeek intacte : elle s'ouvre depuis le sélecteur d'apps, 0 erreur JavaScript (base locale).
import { banc } from '../tests-pdfreader-v3/commun.mjs';
const b = await banc(1440, 900);
// depuis MedRevise : « Changer d'app » (app.current est réécrit au déchargement : on passe par le hub, pas par un rechargement)
await b.clic(await b.pos(`document.querySelector('[title="Changer d\\'app"], [title^="Accueil — changer"]')`, false), { att: 1500 });
const carte = await b.pos(`[...document.querySelectorAll('.hub-card')].find(x=>/MealWeek|repas/i.test(x.innerText||''))`, false);
await b.clic(carte, { att: 2500 });
const etat = await b.ev(`({app:JSON.parse(localStorage.getItem('app.current')),texte:document.body.innerText.slice(0,160).replace(/\\s+/g,' ')})`);
b.ok(/^MealWeek/.test(etat.texte) && /Semaine 1 sur 9/.test(etat.texte), 'MealWeek s’ouvre depuis le sélecteur d’apps', JSON.stringify(etat));
await b.capture('v11-mealweek', { x: 0, y: 0, width: 1440, height: 900 });
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
await b.ev(`localStorage.setItem('app.current',JSON.stringify('medrevise'));1`);
process.exit(0);
