// 1) Réviser 20 cartes sur A (ordinateur), ouvrir B (téléphone) : chiffres en chargement, puis valeurs identiques à A,
//    JAMAIS la valeur périmée de B (« 12 retard » transitoire). 2) Retour au premier plan de B après des réponses sur A :
//    idem. Enregistreur DOM posé avant le chargement (commun.mjs). node t-demarrage.mjs
import { appareil, ENREGISTREUR, faux } from './commun.mjs';
const A = await appareil(false); const v = A.v;
const B = await appareil(true);
// B à jour avec le jeu de départ, puis on ne le touche plus (il ne verra pas les réponses de A)
await B.ouvrirApp(); await B.attendrePhase(['ajour', 'incomplet', 'horsligne']);
const perimeB = await B.planLocal();
// --- A : 20 réponses
await A.ouvrirApp(); await A.attendrePhase(['ajour']); await A.reviser();
const avantA = await A.chiffres();
const n = await A.repondre(20);
await A.synchro(1000); await A.attendrePhase(['ajour']); await A.dormir(4000); // file du journal (3 s) puis passe complète
await A.ev(`window.dispatchEvent(new Event('online'));1`); await A.attendrePhase(['ajour']);
await A.reviser();
const refA = await A.chiffres();
v(n === 20 && refA.retard < avantA.retard, `A : ${n} cartes notées « Correct » — Retard ${avantA.retard} → ${refA.retard}, Révisions ${avantA.revisions} → ${refA.revisions}`);
const cloud = await faux();
v(cloud.journalRevisions.n >= 20, `faux cloud : ${cloud.journalRevisions.n} réponses au journal`);
v(perimeB.retard !== refA.retard, `B (local, avant ouverture) calculerait Retard ${perimeB.retard} / Révisions ${perimeB.revisions} : valeur PÉRIMÉE qui ne doit jamais s’afficher`);
// --- B : ouverture (rechargement), enregistreur posé avant le chargement
await B.send('Page.enable');
await B.send('Page.addScriptToEvaluateOnNewDocument', { source: ENREGISTREUR });
await B.send('Page.reload', { ignoreCache: true });
await B.dormir(300);
const tAtt = Date.now();
let attente = null;
for (let i = 0; i < 80 && !attente; i++) { const p = await B.phase(); if (p === 'attente') attente = await B.bandeau(); await B.dormir(50); }
await B.capture('sync-tel-chargement');
const fin = await B.attendrePhase(['ajour', 'incomplet', 'horsligne']);
await B.capture('sync-tel-ajour');
const finB = await B.chiffres();
const vus = await B.vus();
v(fin === 'ajour', `B : passe complète → « ${(await B.bandeau() || {}).texte} » (${Date.now() - tAtt} ms)`);
v(attente && attente.texte === 'Synchronisation…', `B pendant la synchro : bandeau « ${attente && attente.texte} »`);
const etats = vus.map(([, e]) => e).filter((e) => e.retard !== null);
const premiers = etats.slice(0, 1)[0] || {};
v(premiers.retard === 'attente' && premiers.revisions === 'attente' && premiers.hero === 'attente' && premiers.demarrer === 'off', `B : premier état affiché = indicateurs (Retard, Révisions, accueil) et Démarrer désactivé — ${JSON.stringify(premiers)}`);
const nombres = etats.filter((e) => e.retard !== 'attente');
const faux1 = nombres.filter((e) => e.retard !== refA.retard || e.revisions !== refA.revisions || e.nouvelles !== refA.nouvelles);
v(faux1.length === 0 && nombres.length > 0, `B : ${etats.length} états enregistrés, valeurs affichées toujours = A (Retard ${refA.retard}, Révisions ${refA.revisions}, Nouvelles ${refA.nouvelles}) ; jamais ${perimeB.retard}`, faux1.length ? JSON.stringify(faux1[0]) : '');
v(JSON.stringify(finB) === JSON.stringify(refA), `B final = A : ${JSON.stringify(finB)}`);
await B.dormir(3500);
v(!(await B.bandeau()), 'B : « À jour » disparaît en fondu');
// --- 2) retour au premier plan : 5 réponses de plus sur A, puis B redevient visible
await A.reviser();
const n2 = await A.repondre(5);
await A.dormir(4000); await A.ev(`window.dispatchEvent(new Event('online'));1`); await A.attendrePhase(['ajour']);
await A.reviser();
const refA2 = await A.chiffres();
const perime2 = await B.planLocal();
await B.ev(`window.__vus = []; 1`);
await B.ev(`document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); 1`);
await B.dormir(120);
const ph2 = await B.phase();
const att2 = await B.ev(`!!document.querySelector('[data-sfa="lanceur"] [data-cat="retard"] [data-chiffre="attente"]')`);
await B.capture('sync-tel-retour');
const fin2 = await B.attendrePhase(['ajour', 'incomplet', 'horsligne']);
const vus2 = (await B.vus()).map(([, e]) => e).filter((e) => e.retard !== null);
const apres = vus2.slice(vus2.findIndex((e) => e.retard === 'attente'));
const faux2 = apres.filter((e) => e.retard !== 'attente' && (e.retard !== refA2.retard || e.revisions !== refA2.revisions));
v(n2 === 5 && perime2.revisions !== refA2.revisions, `A : 5 réponses de plus (Révisions ${refA.revisions} → ${refA2.revisions}) ; B local = ${perime2.revisions} (périmé)`);
const iAtt = vus2.findIndex((e) => e.retard === 'attente');
v(iAtt === 0 && vus2[0].demarrer === 'off' && (ph2 === 'attente' || att2 || vus2.length >= 2), `B au retour au premier plan : 1er état = indicateurs, Démarrer désactivé (${vus2.length} états : ${vus2.map((e) => e.retard + '/' + e.revisions).join(' → ')})`);
v(fin2 === 'ajour' && faux2.length === 0 && JSON.stringify(await B.chiffres()) === JSON.stringify(refA2), `B après le retour : ${JSON.stringify(await B.chiffres())} = A, aucune valeur intermédiaire`, faux2.length ? JSON.stringify(faux2[0]) : '');
// une seule passe pour visibilitychange + focus simultanés : compter les tirages complets au faux cloud
const req = (await faux()).journal || [];
console.log('   (info) dernières requêtes faux cloud :', req.slice(-3).map((r) => (r.m || r.method || '') + ' ' + (r.u || r.url || '')).join(' | ').slice(0, 200));
B.erreurs.forEach((e) => A.erreurs.push('B: ' + e));
A.echecs += B.echecs;
A.fin();
