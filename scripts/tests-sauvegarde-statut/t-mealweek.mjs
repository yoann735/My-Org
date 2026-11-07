// MealWeek intacte (07/11) : même affichage au pixel près avec le code de départ (:5304) et le nouveau (:5303), aucune erreur console.
import fs from 'node:fs';
import { DOSSIER_IMG } from './commun.mjs';
import { appareil } from '../tests-fsrs/banc.mjs';
const prendre = async (port, url, filtre) => {
  process.env.CDP_FILTRE = filtre;
  const b = await appareil(port);
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await b.send('Page.enable');
  await b.send('Page.navigate', { url }); await b.dormir(2500);
  await b.ev(`(localStorage.setItem('app.current', JSON.stringify('mealweek')), 1)`);
  await b.send('Page.navigate', { url: url.replace(/\/\?.*$/, '/mealweek') }); await b.dormir(4000);
  await b.ev(`(document.querySelectorAll('*').forEach((e) => { e.style.animation = 'none'; e.style.transition = 'none'; }), 1)`); await b.dormir(500);
  const texte = await b.ev(`document.body.innerText.slice(0, 120).replace(/\\s+/g, ' ')`);
  const s = await b.send('Page.captureScreenshot', { format: 'png' });
  return { png: Buffer.from(s.data, 'base64'), texte, erreurs: b.erreurs };
};
const nouveau = await prendre(9335, 'http://localhost:5303/?banc=5300', '5303');
const ancien = await prendre(9338, 'http://localhost:5304/?banc=5300', '5304');
fs.writeFileSync(DOSSIER_IMG + 'mealweek-apres.png', nouveau.png); fs.writeFileSync(DOSSIER_IMG + 'mealweek-avant.png', ancien.png);
const identiques = Buffer.compare(nouveau.png, ancien.png) === 0;
console.log((identiques ? '✅' : '❌') + ' MealWeek : capture identique octet pour octet (avant / après)', '—', nouveau.texte);
console.log((nouveau.erreurs.length === 0 ? '✅' : '❌') + ' MealWeek : aucune erreur console', nouveau.erreurs.join(' | ').slice(0, 200));
process.exit(0);
