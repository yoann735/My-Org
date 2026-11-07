// CAPTURE « AVANT » après rafraîchissement (passe rapide) : « Pas encore synchronisé cette session » + « Pas à jour — 19 ».
import fs from 'node:fs';
import { DOSSIER_IMG } from './commun.mjs';
import { banc } from '../tests-a-apprendre/commun.mjs';
process.env.CDP_FILTRE = '5304'; process.env.CDP_PORT = '9338';
const A = await banc(1440, 900, {});
await A.send('Page.navigate', { url: 'http://localhost:5304/?banc=5300' }); await A.dormir(2500);
await A.ouvrirApp({ recharger: false });
let entete = null;
for (let i = 0; i < 300 && !entete; i++) { entete = await A.ev(`(() => { const h = document.querySelector('[data-bandeau-synchro="ajour"]'); return h ? h.innerText.trim() : null; })()`); if (!entete) await A.dormir(100); }
await A.ev(`(() => { const x = [...document.querySelectorAll('.sb-item')].find((e) => (e.title || '').startsWith('Réglages')); x && x.click(); return 1; })()`);
await A.attendre(`/Pas à jour|À jour avec le cloud/.test(document.body.innerText)`, 60000);
const t = await A.ev(`(() => { const c = [...document.querySelectorAll('.card')].find((x) => /Synchronisation/.test((x.querySelector('h3') || {}).textContent || '')); c.scrollIntoView({ block: 'center' }); return c.innerText.split('\\n').slice(0, 4).join(' | '); })()`);
await A.dormir(400); const s = await A.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(DOSSIER_IMG + 'avant-reglages-apres-rafraichissement.png', Buffer.from(s.data, 'base64'));
console.log('AVANT (rafraîchi) — en-tête :', entete, '· Réglages :', t);
process.exit(0);
