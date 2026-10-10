// Série mobile (MobileSession.jsx, téléphone 390 px) : « Commencer la série » → flashcards à 4 boutons.
// Usage : node serie-mobile.mjs <dossier-captures>
import { writeFileSync, mkdirSync } from 'node:fs';
import { appareil } from './banc.mjs';
const dossier = process.argv[2] || '/tmp/serie-mobile-fsrs';
mkdirSync(dossier, { recursive: true });
const B = await appareil('9336');
await B.send('Page.enable');
await B.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await B.send('Emulation.setTouchEmulationEnabled', { enabled: true });
const cap = async (n) => { const r = await B.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${dossier}/${n}.png`, Buffer.from(r.data, 'base64')); };
if (!(await B.ev(`!!document.querySelector('.mrm-flash-card, .mrm-rate')`))) { await B.clic('Commencer la série'); await B.dormir(1500); }
const vus = [];
for (let i = 0; i < 12; i++) {
  const etat = await B.ev(`(() => ({ qcm: !!document.querySelector('.mrm-choice, .mrm-opt, [class*=mrm-qcm]'), flash: !!document.querySelector('[class*=mrm-flash]'), rate: !!document.querySelector('.mrm-rate') }))()`);
  if (!etat.flash && !etat.qcm && !etat.rate) break;
  if (!etat.rate) { await B.ev(`(() => { const c = document.querySelector('.mrm-flash-card') || document.querySelector('.mrm-flash-scene'); c && c.click(); const b = [...document.querySelectorAll('button')].find((x) => /Voir la réponse|Retourner|Valider/.test(x.textContent)); b && b.click(); return true; })()`); await B.dormir(600); }
  const z = await B.ev(`(() => { const z = document.querySelector('.mrm-rate'); return z ? { quatre: z.classList.contains('quatre'), libelles: [...z.querySelectorAll('button')].map((x) => x.textContent.replace(/\\s+/g, ' ').trim()) } : null; })()`);
  if (!z) break;
  vus.push(z);
  if (z.quatre && !vus.cap) { await cap('serie-mobile-4-boutons'); vus.cap = true; }
  await B.ev(`document.querySelectorAll('.mrm-rate button')[2].click(), true`); await B.dormir(800);
  await B.clic('Passer');
}
console.log('cartes notées', vus.length, '· flashcards à 4 boutons :', vus.filter((x) => x.quatre).length, '·', (vus.find((x) => x.quatre) || {}).libelles, '· erreurs', B.erreurs.length);
B.fermer();
