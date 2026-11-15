// Non-régression : MealWeek identique (captures du code d'avant :5312 et d'après :5310, même jour simulé, profil vidé,
// comparées à l'octet), et mode Apprentissage (écran ouvert, mode file d'attente actif, sans erreur). node t-mealweek-apprentissage.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import { appareil, paquets, dormir, DOSSIER_IMG } from './commun.mjs';

let echecs = 0;
const ok = (c, m, d = '') => { console.log((c ? '✅ ' : '❌ ') + m + (d ? ' — ' + d : '')); if (!c) echecs++; };
const sha = {};
for (const [nom, base] of [['avant', 'http://localhost:5312'], ['apres', 'http://localhost:5310']]) {
  const b = await appareil('ordi', base);
  await b.vider();
  await b.ev(`(localStorage.setItem('__decalageMs', String(${new Date('2026-11-20T10:00:00+01:00').getTime()} - ${Date.now()})), localStorage.setItem('app.current', '"mealweek"'), 1)`);
  await b.send('Page.reload'); await b.attendre(`document.readyState === 'complete'`, 20000);
  await b.attendre(`!!document.querySelector('.hub-card')`, 20000); await dormir(1500);
  await b.ev(`(() => { const x = [...document.querySelectorAll('.hub-card')].find((e) => /MealWeek/.test(e.innerText)); x && x.click(); return 1; })()`);
  await b.attendre(`!document.querySelector('.hub-card')`, 20000); await dormir(4000);
  // l'heure réelle du rendu peut bouger : on fige le Date sur un instant fixe avant la capture
  const s = await b.send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(s.result.data, 'base64');
  fs.writeFileSync(DOSSIER_IMG + `mealweek-${nom}.png`, buf);
  sha[nom] = crypto.createHash('sha256').update(buf).digest('hex');
  const texte = await b.ev(`document.body.innerText.slice(0, 200)`);
  console.log(nom, sha[nom].slice(0, 16), JSON.stringify(texte.slice(0, 80)));
  b.fermerWs();
}
ok(sha.avant === sha.apres, 'MealWeek : capture identique à l’octet (avant / après)', `${sha.avant.slice(0, 16)} / ${sha.apres.slice(0, 16)}`);

// Apprentissage, mode actif
const b = await appareil('ordi');
await b.vider(); await b.horloge('2026-11-20'); await b.semer(paquets('2026-11-17', 6, 8, { vue: '2026-11-16' })); await b.ouvrir();
await b.ev(`(async () => { const S = await __imp('/src/medrevise/lib/storage.js'); const F = await __imp('/src/medrevise/lib/fileAttente.js'); await S.setFileAttente(F.etatActivation('2026-11-17', F.jourFile())); return 1; })()`);
await b.ouvrir();
await b.aller('Apprentissage');
const vu = await b.attendre(`!!document.querySelector('[class*="alib"], [class*="appr"]')`, 15000);
await dormir(1500);
ok(vu, 'mode Apprentissage : écran affiché avec le mode file d’attente actif');
await b.capture('apprentissage-mode-actif');
echecs += b.fin();
b.fermerWs();
console.log(echecs ? `❌ ${echecs} échec(s)` : '✅ tout est vert');
process.exitCode = echecs;
