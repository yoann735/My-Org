// Scénario 1 : séance démarrée, quittée à mi-chemin, 5 cartes créées sur le MÊME appareil, reprise.
// node s1-meme-appareil.mjs 9335 ordi   |   node s1-meme-appareil.mjs 9336 tel
import { appareil } from './banc.mjs';
import { versEncart, encart, pas, carteVue, progression, creerCartes, capture, sansDoublon } from './commun.mjs';
const [port, nom] = [process.argv[2], process.argv[3]];
const X = await appareil(port);
let echecs = 0; const ok = (c, m, d = '') => { console.log((c ? '✅' : '❌') + ` [${nom}] ` + m + (d ? ' — ' + d : '')); if (!c) echecs++; };
await versEncart(X);
const e0 = await encart(X); console.log('encart au départ :', e0.texte);
await X.clic('Démarrer la séance') || await X.clic('Reprendre la séance');
await X.attendre(`!!document.querySelector('.sfc-carte')`);
// 2 révisions, puis l'apprentissage jusqu'à avoir des cartes à streak 1
for (let i = 0; i < 2; i++) await pas(X);
await X.clic('Passer à l’apprentissage'); await X.dormir(500);
for (let i = 0; i < 9; i++) await pas(X);
const avant = await X.seance();
const cartesAvant = Object.fromEntries((await X.cartes()).map((c) => [c.id, c]));
const vues = avant.file.filter((id) => (cartesAvant[id].learningStreak || 0) > 0);
console.log('avant de quitter :', await progression(X), '· file', avant.file.length, '· streak ≥ 1 :', vues.map((id) => id + '=' + cartesAvant[id].learningStreak).join(' '));
await capture(X, `${nom}-1-seance-avant`);
await X.ev(`document.querySelector('.sfc-quitter').click(), true`); await X.dormir(1000);
await versEncart(X);
const e1 = await encart(X); console.log('encart après avoir quitté :', e1.texte);
await capture(X, `${nom}-2-encart-avant-creation`);
// 5 cartes créées (départ aujourd'hui), puis l'app recharge ses données (fin de synchro)
const ids = await creerCartes(X, nom + Date.now().toString(36) + '_', 5);
await X.synchro(); await X.dormir(3500);
const e2 = await encart(X); console.log('encart après création :', e2.texte);
await capture(X, `${nom}-3-encart-apres-creation`);
ok(e2.app === e1.app + 5 && e2.rev === e1.rev, 'encart : Apprentissage +5, Révisions inchangées', `${e1.rev}/${e1.app} → ${e2.rev}/${e2.app}`);
await X.clic('Reprendre la séance'); await X.attendre(`!!document.querySelector('.sfc-carte, .sfc-transition')`); await X.dormir(800);
const apres = await X.seance();
const cartesApres = Object.fromEntries((await X.cartes()).map((c) => [c.id, c]));
ok(apres.file.length === avant.file.length + 5, 'file de la séance +5', `${avant.file.length} → ${apres.file.length}`);
ok(JSON.stringify(apres.file.slice(0, avant.file.length)) === JSON.stringify(avant.file), 'cartes déjà dans la file : même ordre, en tête');
ok(ids.every((id) => apres.file.slice(avant.file.length).includes(id)), 'les 5 nouvelles sont en FIN de file');
ok(ids.every((id) => cartesApres[id].learnState === 'learning' && cartesApres[id].learningIntroducedOn), 'les 5 nouvelles sont introduites (learning)');
ok(vues.length > 0 && vues.every((id) => cartesApres[id].learningStreak === cartesAvant[id].learningStreak), 'cartes déjà vues : streak conservé', vues.map((id) => cartesApres[id].learningStreak).join(','));
ok(sansDoublon(apres.file) && sansDoublon(apres.revisions), 'aucun doublon (file, révisions)');
console.log('séance reprise :', await progression(X));
await capture(X, `${nom}-4-seance-reprise`);
ok(X.erreurs.length === 0, 'aucune erreur console', X.erreurs.join(' / ').slice(0, 300));
X.fermer();
process.exit(echecs ? 1 : 0);
