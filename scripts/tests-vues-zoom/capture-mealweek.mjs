// Capture de MealWeek (1440×900) sur le serveur :5303 — node capture-mealweek.mjs <nom>. Lancée une fois avec le code de
// départ servi sur :5303, une fois avec le nouveau code : même origine, même profil → captures comparables octet pour octet.
import fs from 'node:fs';
import { DOSSIER_IMG } from './commun.mjs';
import { appareil } from '../tests-fsrs/banc.mjs';
process.env.CDP_FILTRE = '5303';
const b = await appareil(9335);
await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await b.send('Page.enable');
await b.send('Page.navigate', { url: 'http://localhost:5303/?banc=5300' }); await b.dormir(2500);
await b.ev(`(localStorage.setItem('app.current', JSON.stringify('mealweek')), 1)`);
await b.send('Page.navigate', { url: 'http://localhost:5303/mealweek' }); await b.dormir(4000);
await b.ev(`(document.querySelectorAll('*').forEach((e) => { e.style.animation = 'none'; e.style.transition = 'none'; }), 1)`); await b.dormir(500);
const s = await b.send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(DOSSIER_IMG + process.argv[2] + '.png', Buffer.from(s.data, 'base64'));
console.log(process.argv[2], (await b.ev(`document.body.innerText.slice(0, 100).replace(/\\s+/g, ' ')`)), 'erreurs:', b.erreurs.length, b.erreurs.join(' | ').slice(0, 200));
await b.ev(`(localStorage.setItem('app.current', JSON.stringify('medrevise')), 1)`);
process.exit(0);
