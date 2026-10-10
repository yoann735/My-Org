// Série d'une fiche (Session.jsx, bureau) : QCM → 3 boutons inchangés ; flashcards → 4 boutons avec intervalle.
// Lancée depuis Réviser → « Réviser toute cette fiche » (série déjà ouverte : reprise là où elle est).
// Usage : node serie.mjs <dossier-captures>
import { writeFileSync, mkdirSync } from 'node:fs';
import { appareil } from './banc.mjs';
const dossier = process.argv[2] || '/tmp/serie-fsrs';
mkdirSync(dossier, { recursive: true });
const A = await appareil('9335');
await A.send('Page.enable');
const cap = async (n) => { const r = await A.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${dossier}/${n}.png`, Buffer.from(r.data, 'base64')); };
if (!(await A.ev(`!!document.querySelector('.rev-card')`))) {
  await A.ev(`(() => { const el = [...document.querySelectorAll('.sb-item')].find((b) => (b.getAttribute('title') || '').startsWith('Réviser')); el && el.click(); return true; })()`); await A.dormir(1500);
  await A.clic('Réviser toute cette fiche'); await A.dormir(1500);
}
const vus = [];
for (let i = 0; i < 26; i++) {
  if (!(await A.ev(`!!document.querySelector('.rev-card, .flash-card')`))) break;
  const qcm = await A.ev(`!!document.querySelector('.rev-choice')`);
  if (qcm) { await A.ev(`document.querySelector('.rev-choice').click(), true`); await A.dormir(200); await A.ev(`(() => { const v = [...document.querySelectorAll('.rev-card button, .rev-stage button')].find((b) => /Valider|Vérifier|Corriger/.test(b.textContent)); v && v.click(); return !!v; })()`); }
  else await A.ev(`(() => { const c = document.querySelector('.flash-card'); c && c.click(); return !!c; })()`);
  await A.dormir(600);
  const b = await A.ev(`(() => { const z = document.querySelector('.rev-rate'); return z ? { type: ${'`'}${'$'}{document.querySelector('.rev-choice') ? 'qcm' : 'flashcard'}${'`'}, quatre: z.classList.contains('quatre'), libelles: [...z.querySelectorAll('button')].map((x) => x.textContent.replace(/\\s+/g, ' ').trim()) } : null; })()`);
  if (!b) break;
  vus.push(b);
  if (b.type === 'qcm' && !vus.capQ) { await cap('serie-qcm-3-boutons'); vus.capQ = true; }
  if (b.type === 'flashcard' && !vus.capF) { await cap('serie-flashcard-4-boutons'); vus.capF = true; }
  await A.ev(`document.querySelectorAll('.rev-rate button')[2].click(), true`); await A.dormir(900);
  await A.clic('Passer');
}
const resume = { qcm: vus.filter((x) => x.type === 'qcm'), fc: vus.filter((x) => x.type === 'flashcard') };
console.log('QCM vus', resume.qcm.length, '· 3 boutons :', resume.qcm.every((x) => !x.quatre && x.libelles.length === 3), resume.qcm[0] && resume.qcm[0].libelles.join(' · '));
console.log('Flashcards vues', resume.fc.length, '· 4 boutons :', resume.fc.every((x) => x.quatre && x.libelles.length === 4), resume.fc[0] && resume.fc[0].libelles.join(' · '));
console.log('erreurs', A.erreurs.length);
writeFileSync(`${dossier}/serie.json`, JSON.stringify({ vus, erreurs: A.erreurs }, null, 1));
A.fermer();
