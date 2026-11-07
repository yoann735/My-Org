// CAPTURES « AVANT » (07/11) : le code de départ (a5b20b2, servi par Vite :5304 depuis un dossier de travail séparé), même faux
// cloud que le banc (jeu seed.mjs : 19 cartes « Boîte → Flashcard »), Chrome 9338 au profil NEUF. Reproduit le constat :
// en-tête « À jour » ET Réglages « Pas à jour — 19 éléments à synchroniser » / « Pas encore synchronisé cette session ».
import fs from 'node:fs';
import { DOSSIER_IMG } from './commun.mjs';
import { banc } from '../tests-a-apprendre/commun.mjs';
process.env.CDP_FILTRE = '5304'; process.env.CDP_PORT = '9338';
const A = await banc(1440, 900, {});
const cap = async (nom) => { const s = await A.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(DOSSIER_IMG + nom + '.png', Buffer.from(s.data, 'base64')); };
await A.send('Page.navigate', { url: 'http://localhost:5304/?banc=5300' }); await A.dormir(2500);
await A.ouvrirApp({ recharger: false });
// l'en-tête au moment où la synchro se termine (« À jour · hh:mm », avant le fondu)
let entete = null;
for (let i = 0; i < 300 && !entete; i++) { entete = await A.ev(`(() => { const h = document.querySelector('[data-bandeau-synchro="ajour"]'); return h ? h.innerText.trim() : null; })()`); if (!entete) await A.dormir(100); }
await cap('avant-entete-ajour');
await A.ev(`(() => { const x = [...document.querySelectorAll('.sb-item')].find((e) => (e.title || '').startsWith('Réglages')); x && x.click(); return 1; })()`);
await A.dormir(1500);
await A.attendre(`/Pas à jour|À jour avec le cloud/.test(document.body.innerText)`, 60000);
const reglages = await A.ev(`(() => { const c = [...document.querySelectorAll('.card')].find((x) => /Synchronisation/.test((x.querySelector('h3') || {}).textContent || '')); c.scrollIntoView({ block: 'center' }); return c.innerText.split('\\n').slice(0, 6).join(' | '); })()`);
await A.dormir(400); await cap('avant-reglages-19-elements');
const detail = await A.ev(`(async () => { const S = ${A.mod('storage.js')}; const b = await S.etatBlobs(); return { introuvables: b.introuvables.length, exemples: b.introuvablesDetail.slice(0, 3).map((d) => d.store + ':' + d.id + ' (' + d.champ + ')') }; })()`);
console.log('AVANT — en-tête :', entete);
console.log('AVANT — Réglages :', reglages);
console.log('AVANT — « fichiers introuvables » :', JSON.stringify(detail));
process.exit(0);
