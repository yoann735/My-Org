// Mode Apprentissage libre (11/10) — non-régression sur l'ordinateur (A) : chaque onglet s'ouvre sans
// erreur (11/10 : « Apprentissage (exos) » et « Prise de notes » sont retirés) ; le panneau Flashcards garde Éditer / Supprimer ;
// la séance du jour s'ouvre et se quitte. Usage : node t-non-regression.mjs <dossier-captures>
import { appareil, ok, bilan } from '../tests-collage/outils.mjs';
import { ouvrirMedRevise, onglet, ouvrirFiche } from './commun.mjs';
const A = await appareil(9335, { captures: process.argv[2] || '/tmp/alib' });
await A.send('Page.reload', { ignoreCache: true }); await A.dormir(3000);
await ouvrirMedRevise(A); await A.dormir(1500);
const vus = [];
for (const [titre, preuve] of [['Accueil', '.screen, .main'], ['Réviser', '.sfa'], ['Apprentissage', '.alib'], ['Bibliothèque', '.main'], ["Carnet d'erreurs", '.main'], ['Réglages', '.main']]) {
  const trouve = await onglet(A, titre); await A.dormir(1200);
  const h1 = await A.ev(`(document.querySelector('.main h1') || {}).innerText || ''`);
  vus.push(`${titre}${trouve ? '' : ' (absent)'} → ${h1 || (await A.ev(`!!document.querySelector(${JSON.stringify(preuve)})`) ? 'ok' : '?')}`);
}
ok(!vus.some((v) => /absent|\?/.test(v)) && A.erreurs.length === 0, 'chaque onglet s’ouvre sans erreur', vus.join(' · '));
const actif = await A.ev(`(() => { const el = [...document.querySelectorAll('.sb-item.active')]; return el.map((e) => e.title); })()`);
ok(actif.length === 1 && actif[0] === 'Réglages', 'un seul onglet allumé à la fois', JSON.stringify(actif));
await ouvrirFiche(A, 'Myologie');
await A.clic(await A.pos(`document.querySelector('.pis-item[data-item="qCoiffe"] .cd-ic[title="Éditer"]')`)); await A.dormir(600);
const form = await A.ev(`!!document.querySelector('.pis-item form, .pis-item textarea, .pis-item input[type=text]')`);
await A.ev(`(() => { const b = [...document.querySelectorAll('.pis button')].find((x) => /Annuler/.test(x.textContent)); b && b.click(); return 1; })()`); await A.dormir(400);
await A.clic(await A.pos(`document.querySelector('.pis-item[data-item="qCoiffe"] .cd-ic[title="Supprimer"]')`)); await A.dormir(500);
const conf = await A.ev(`(document.querySelector('.day-pop') || {}).innerText || ''`);
await A.ev(`(() => { const b = [...document.querySelectorAll('.day-pop button')].find((x) => x.textContent.trim() === 'Annuler'); b && b.click(); return 1; })()`); await A.dormir(400);
const toujours = await A.ev(`(async () => !!(await (${A.st}).getOne('questions', 'qCoiffe')))()`);
ok(form && /Supprimer cet item/.test(conf) && toujours, 'panneau Flashcards : « Éditer » ouvre le formulaire, « Supprimer » demande confirmation (annulé, carte intacte)');
await onglet(A, 'Réviser'); await A.dormir(1200);
await A.clic(await A.pos(`document.querySelector('.sfa-btn')`)); await A.dormir(1500);
const seance = await A.ev(`!!document.querySelector('.sfc-carte') || /Séance terminée|Rien à faire/.test(document.body.innerText)`);
await A.clic(await A.pos(`document.querySelector('.sfc-quitter')`)); await A.dormir(800);
ok(seance, 'séance du jour : s’ouvre (carte affichée) et se quitte');
ok(A.erreurs.length === 0, 'aucune exception JavaScript', A.erreurs.join(' | ').slice(0, 300));
A.fermer();
process.exit(bilan() ? 1 : 0);
