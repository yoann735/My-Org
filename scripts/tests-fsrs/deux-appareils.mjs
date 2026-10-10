// Deux appareils (banc FSRS) : A = ordinateur (9335, données restaurées), B = téléphone (9336, profil vide).
// 1. B s'ouvre et reçoit tout du faux cloud (cartes + journal) ; 2. B répond à 5 cartes dans sa séance
// (vrais clics, interface mobile) ; 3. A et B, HORS LIGNE tous les deux, répondent à la MÊME carte ;
// 4. retour en ligne : journaux fusionnés, même état FSRS des deux côtés.
// Usage : node deux-appareils.mjs <dossier-captures>
import { writeFileSync, mkdirSync } from 'node:fs';
import { appareil, faux } from './banc.mjs';

const dossier = process.argv[2] || '/tmp/deux-appareils-fsrs';
mkdirSync(dossier, { recursive: true });
const A = await appareil('9335');
const B = await appareil('9336');
for (const [X, mobile] of [[A, false], [B, true]]) {
  await X.send('Page.enable'); await X.send('Network.enable'); await X.send('Network.setCacheDisabled', { cacheDisabled: true });
  await X.send('Emulation.setDeviceMetricsOverride', mobile ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true } : { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  if (mobile) await X.send('Emulation.setTouchEmulationEnabled', { enabled: true });
}
const capture = async (X, n) => { const r = await X.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${dossier}/${n}.png`, Buffer.from(r.data, 'base64')); };
const J = (X) => X.mod('journal.js').replace('/src/medrevise/lib/journal.js', '/src/medrevise/journal/journal.js');
const SY = (X) => X.mod('synchro.js').replace('/src/medrevise/lib/synchro.js', '/src/medrevise/journal/synchro.js');
const journal = (X) => X.ev(`(async () => (await ${J(X)}.toutLeJournal()).map((e) => e.id).sort())()`);
const bloc = (X, id) => X.ev(`(async () => { const q = await ${X.mod('storage.js')}.getOne('questions', ${JSON.stringify(id)}); return q ? { fsrs: q.fsrs ? { ...q.fsrs, majLe: undefined, base: undefined } : null, dueDate: q.dueDate } : null; })()`);
const synchro = async (X) => { await X.ev(`(window.dispatchEvent(new Event('online')), true)`); await X.dormir(4000); await X.ev(`(async () => { await ${SY(X)}.synchroniserJournal(); return true; })()`); await X.dormir(1500); };
const r = {};

// 1. ouverture du téléphone : tout arrive du faux cloud
await B.send('Page.reload'); await B.dormir(2500);
const ouvert = `!!(document.querySelector('[data-app="medrevise"]') || document.querySelector('.sfa'))`;
if (!(await B.ev(ouvert))) await B.clic('MedRevise', '.hub-card');
await B.attendre(ouvert, 20000);
await B.dormir(9000);
await synchro(B);
r.B_ouverture = { encart: await B.texte('.sfa'), journal: (await journal(B)).length, cartes: await B.ev(`(async () => (await ${B.mod('storage.js')}.getAll('questions')).length)()`) };
await capture(B, 'B-1-accueil');

// 2. B répond à 5 cartes (vrais clics)
const jA0 = (await journal(A)).length;
await B.clic('Démarrer', '.sfa-btn') || await B.clic('Reprendre', '.sfa-btn');
await B.attendre(`!!document.querySelector('.sfc-carte')`);
const vuesB = [];
for (let i = 0; i < 5; i++) {
  vuesB.push(await B.ev(`document.querySelector('.sfc-carte').dataset.carte`));
  await B.clic('Voir la réponse'); await B.dormir(300);
  if (i === 0) await capture(B, 'B-2-quatre-boutons');
  await B.ev(`document.querySelectorAll('.sfc-notes.quatre button')[${[2, 1, 3, 0, 2][i]}].click(), true`); await B.dormir(600);
}
await B.ev(`document.querySelector('.sfc-quitter').click(), true`); await B.dormir(1000);
await synchro(B); await synchro(A);
r.apres5 = { journalA: (await journal(A)).length, journalB: (await journal(B)).length, jA0, nuage: (await (await fetch('http://localhost:54399/__journal')).json()).lignes.length };
r.memesBlocs5 = [];
for (const id of vuesB) r.memesBlocs5.push(JSON.stringify(await bloc(A, id)) === JSON.stringify(await bloc(B, id)));

// 3. la MÊME carte, hors ligne des deux côtés (même code que les boutons : scheduler/repondre.js)
const cible = await A.ev(`(async () => { const q = (await ${A.mod('storage.js')}.getAll('questions')).find((x) => x.type === 'flashcard' && x.recto && (x.historique || []).length >= 2 && !x.conversionApprentissage); return q.id; })()`);
for (const X of [A, B]) await X.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
const repondre = (X, note, heure) => X.ev(`(async () => { const st = ${X.mod('storage.js')}; const rep = await import(performance.getEntriesByType('resource').map((r) => r.name).find((n) => n.includes('/scheduler/repondre.js')) || '/src/medrevise/scheduler/repondre.js');
  const q = await st.getOne('questions', ${JSON.stringify(cible)}); const reg = await st.getReglagesFC();
  const m = new Date(); m.setHours(${heure}, 0, 0, 0);
  await rep.repondreFlashcard(q, ${note}, { reglages: reg, maintenant: m, sauver: (c) => st.put('questions', c) }); return true; })()`);
await repondre(A, 3, 9);   // A : Correct à 9 h
await repondre(B, 1, 21);  // B : À revoir à 21 h (même jour de révision → une seule révision comptée, la première)
r.horsLigne = { journalA: (await journal(A)).length, journalB: (await journal(B)).length };
for (const X of [A, B]) await X.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await synchro(A); await synchro(B); await synchro(A);
const jA = await journal(A), jB = await journal(B);
r.final = { journauxIdentiques: JSON.stringify(jA) === JSON.stringify(jB), n: jA.length, blocA: await bloc(A, cible), blocB: await bloc(B, cible) };
r.final.memeEtat = JSON.stringify(r.final.blocA.fsrs) === JSON.stringify(r.final.blocB.fsrs);
r.erreurs = { A: A.erreurs, B: B.erreurs };
writeFileSync(`${dossier}/deux-appareils.json`, JSON.stringify(r, null, 1));
console.log(JSON.stringify({ B_ouverture: r.B_ouverture, apres5: r.apres5, memesBlocs5: r.memesBlocs5, horsLigne: r.horsLigne, final: { ...r.final, blocA: r.final.blocA.fsrs && r.final.blocA.fsrs.due, blocB: r.final.blocB.fsrs && r.final.blocB.fsrs.due }, erreurs: [A.erreurs.length, B.erreurs.length] }, null, 1));
A.fermer(); B.fermer();
