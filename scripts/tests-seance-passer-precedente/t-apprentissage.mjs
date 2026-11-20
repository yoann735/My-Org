// Non-régression : le mode Apprentissage s'ouvre, montre les cartes de test et réagit (aucune erreur console).
// node t-apprentissage.mjs ordi|tablette|tel
import { appareil, jeu, dormir } from './commun.mjs';
const type = process.argv[2] || 'ordi';
const b = await appareil(type);
await b.vider(); await b.horloge('2026-11-20', '10:00'); await b.semer(jeu('2026-11-20')); await b.ouvrir();
const J0 = (await b.instantane()).journal.length;
if (type === 'tel') await b.clic(`[...document.querySelectorAll('button, a')].find((e) => /Apprentissage/.test(e.innerText || e.title || ''))`, 1500);
else await b.aller('Apprentissage');
b.ok(await b.attendre(`!!document.querySelector('[class*="alib"], [class*="appr"]')`, 15000), 'écran Apprentissage ouvert');
await dormir(800);
const texte = await b.ev(`document.body.innerText.replace(/\\s+/g, ' ')`);
b.ok(/Question (ret|rev)-|Nouvelle \d/.test(texte) || /\d+ cartes?/.test(texte), 'les cartes de test y apparaissent', texte.slice(0, 160));
await b.capture('20-apprentissage');
b.ok((await b.instantane()).journal.length === J0, 'le mode Apprentissage n’écrit pas le journal (inchangé)');
process.exit(b.fin() ? 1 : 0);
