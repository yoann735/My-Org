// Mode file d'attente — ouverture après 4 jours sans ouvrir l'app, sur DEUX appareils synchronisés (faux Supabase
// :54409, Vite :5311). A = ordinateur (profil 9348), B = tablette (profil 9347). Données de test uniquement.
// Lundi : A active le mode (écran), fait 6 cartes sur 15. Mardi → vendredi : l'app n'est ouverte nulle part.
// Samedi : B ouvre en premier (clôture les journées, écrit, envoie), puis A ouvre. Même résultat attendu, et aucune
// réécriture par A (calcul identique) ; 5 ouvertures de plus sur chaque appareil : rien ne change.
import fs from 'node:fs';
import { appareil, paquets, dormir } from './commun.mjs';

const BASE = 'http://localhost:5311';
const A = await appareil('ordi2', BASE);
const B = await appareil('tablette', BASE);
let echecs = 0;
const ok = (c, m, d = '') => { console.log((c ? '✅ ' : '❌ ') + m + (d ? ' — ' + d : '')); if (!c) echecs++; };
const synchro = async (b) => { await b.attendre(`document.documentElement.getAttribute('data-mr-synchro') === 'ajour'`, 40000, 200); };
const etatFA = (b, j) => b.attendre(`(async () => { const S = await __imp('/src/medrevise/lib/storage.js'); const r = await S.getFileAttente(); return r && r.actif && r.verifieJusquau >= ${JSON.stringify(j)}; })()`, 20000, 200);

await A.vider(); await B.vider();
await A.horloge('2026-11-16');
await A.semer(paquets('2026-11-16', 10, 15, { vue: '2026-11-15' }));
await A.ouvrir(); await synchro(A);
// activation à l'écran sur A
await A.aller('Réglages'); await A.attendre(`!!document.querySelector('[data-fa="reglage"]')`, 15000);
await A.clic(`document.querySelector('[data-fa="reglage"] .switch')`, 600);
await A.attendre(`!!document.querySelector('[data-fa="feuille"]')`, 5000);
await A.clic(`document.querySelector('[data-fa="activer"]')`, 1500);
let sA = await A.etat();
ok(sA.rec && sA.rec.actif, 'A : mode activé à l’écran');
await A.noter(sA.revisions.slice(0, 6));
await A.ouvrir(); await synchro(A); await dormir(2000); await A.ouvrir(); await synchro(A);
// B reçoit tout lundi
await B.horloge('2026-11-16'); await synchro(B);
let sB = await B.etat();
ok(sB.rec && sB.rec.actif && sB.revisions.length === 9, 'B (lundi) : mode reçu par la synchro, 9 cartes restantes', String(sB.revisions.length));

// samedi : B ouvre en premier
await B.horloge('2026-11-21'); await synchro(B); await etatFA(B, '2026-11-20'); await dormir(1500);
await B.ouvrir(); await synchro(B); await dormir(1500);
sB = await B.etat();
ok(sB.rec.pauses.join() === '2026-11-16,2026-11-17,2026-11-18,2026-11-19,2026-11-20', 'B (samedi, après 4 jours sans ouvrir) : lundi (pas fini) + mardi → vendredi en pause', sB.rec.pauses.join());
ok(sB.revisions.length === 9 && sB.revisions.every((id) => id.startsWith('c2026-11-16')), 'B : samedi = les 9 cartes restantes du lundi', String(sB.revisions.length));
const majB = sB.rec.updatedAt;
// puis A
await A.horloge('2026-11-21'); await synchro(A); await etatFA(A, '2026-11-20'); await dormir(1500);
sA = await A.etat();
ok(JSON.stringify(sA.rec.pauses) === JSON.stringify(sB.rec.pauses) && sA.decalage === sB.decalage, 'A (samedi) : mêmes jours en pause, même décalage', `${sA.rec.pauses.join()} · ${sA.decalage} j`);
ok(JSON.stringify([...sA.revisions].sort()) === JSON.stringify([...sB.revisions].sort()) && JSON.stringify(sA.retard) === JSON.stringify(sB.retard), 'A et B : même file (Retard, Révisions)');
ok(sA.rec.updatedAt === majB, 'A n’a rien réécrit (calcul identique à celui de B)', `${sA.rec.updatedAt}`);
// ouvertures répétées
for (let k = 0; k < 5; k++) { await A.ouvrir(); await B.ouvrir(); }
await synchro(A); await synchro(B);
const fA = await A.etat(), fB = await B.etat();
ok(fA.rec.updatedAt === majB && fB.rec.updatedAt === majB && fA.rec.pauses.join() === sB.rec.pauses.join(), '5 ouvertures de plus sur chaque appareil : aucun changement (idempotent)');
const eA = await (async () => { await A.aller('Réviser'); await A.attendre(`!!document.querySelector('.sfa')`, 15000); await dormir(500); return A.ecran(); })();
const eB = await (async () => { await B.aller('Réviser'); await B.attendre(`!!document.querySelector('.sfa')`, 15000); await dormir(500); return B.ecran(); })();
ok(JSON.stringify(eA) === JSON.stringify(eB) && eA.decalage && eA.decalage.n === 5 && eA.decalage.alerte, 'écrans A et B identiques (5 j de décalage, alerte)', JSON.stringify(eA));
await A.capture('deux-appareils-ordi'); await B.capture('deux-appareils-tablette');
const errs = [...A.erreurs, ...B.erreurs].filter((e) => !/validateDOMNesting|Failed to load resource|ERR_|Failed to fetch|NetworkError|timetable|emploi/i.test(e || ''));
ok(errs.length === 0, 'aucune erreur console', errs.join(' | ').slice(0, 400));
console.log(echecs ? `❌ ${echecs} échec(s)` : '✅ tout est vert');
fs.mkdirSync(new URL('./resultats/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('./resultats/deux-appareils.json', import.meta.url), JSON.stringify({ pauses: sB.rec.pauses, decalage: sB.decalage, revisions: sB.revisions.length, ecran: eA, echecs }, null, 1));
process.exitCode = echecs;
A.fermerWs(); B.fermerWs();
