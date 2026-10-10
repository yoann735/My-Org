// Tour de non-régression (banc FSRS) : cours PDF ouvert (pages rendues), panneau Transcript, MealWeek.
// Usage : node tour-app.mjs <dossier-captures>
import { writeFileSync, mkdirSync } from 'node:fs';
import { appareil } from './banc.mjs';
const dossier = process.argv[2] || '/tmp/tour-fsrs';
mkdirSync(dossier, { recursive: true });
const A = await appareil('9335');
await A.send('Page.enable');
await A.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
const cap = async (n) => { const r = await A.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${dossier}/${n}.png`, Buffer.from(r.data, 'base64')); };
const r = {};
await A.ev(`(() => { const el = [...document.querySelectorAll('.sb-item')].find((b) => (b.getAttribute('title') || '').startsWith('Réviser')); el && el.click(); return true; })()`); await A.dormir(1200);
r.voirCours = await A.clic('Voir le cours'); await A.dormir(5000);
r.pdf = await A.ev(`({ pages: document.querySelectorAll('.pdfr-page, [class*=pdfr-page]').length, canvas: document.querySelectorAll('canvas').length, texte: document.querySelectorAll('.pdfr-textlayer span').length })`);
await cap('1-cours-pdf');
r.transcript = await A.clic('Transcript'); await A.dormir(1500);
r.transcriptTexte = (await A.ev(`(document.querySelector('[class*=trx], [class*=transcript]') || {}).textContent || ''`)).replace(/\s+/g, ' ').slice(0, 160);
await cap('2-panneau-transcript');
// MealWeek (via le hub)
await A.ev(`(() => { const el = [...document.querySelectorAll('button, a, .sb-item')].find((b) => /^(Accueil — changer d'app|Changer d'app)/.test(b.getAttribute('title') || '')); el && el.click(); return !!el; })()`); await A.dormir(1500);
r.hub = await A.ev(`[...document.querySelectorAll('.hub-card')].map((c) => c.textContent.replace(/\\s+/g, ' ').trim().slice(0, 30))`);
await A.clic('MealWeek', '.hub-card'); await A.dormir(3000);
r.mealweek = (await A.ev(`document.body.innerText.slice(0, 200)`)).replace(/\s+/g, ' ');
await cap('3-mealweek');
// retour MedRevise pour la suite des tests
await A.ev(`(() => { const el = [...document.querySelectorAll('button, a')].find((b) => /Retour à l'accueil|mes apps/.test(b.getAttribute('title') || b.textContent || '')); el && el.click(); return !!el; })()`); await A.dormir(1200);
await A.clic('MedRevise', '.hub-card'); await A.dormir(2000);
r.erreurs = A.erreurs;
writeFileSync(`${dossier}/tour.json`, JSON.stringify(r, null, 1));
console.log(JSON.stringify(r, null, 1));
A.fermer();
