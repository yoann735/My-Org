// Usage : zsh ../tests-fsrs/lancer.sh <dépôt> <profil-A = copie restaurée des vraies données> <profil-B vide> ; node t-synchro.mjs
// (24/10) NON-RÉGRESSION DE LA SYNCHRO — deux appareils, faux Supabase local (jamais le vrai cloud).
// A = ordinateur (9335, copie des vraies données) : la conversion « Nouvelles » s'applique au démarrage et part au
// faux cloud ; B = téléphone (9336, profil vide) reçoit tout. B passe une Nouvelle en révision et note une carte ;
// A les reçoit. Journal : la note part au cloud ; l'événement sans note reste en file tant que la table impose
// rating 1–4 (contrainte simulée), puis part quand elle est levée (= SQL appliqué) — sans jamais bloquer les notes.
import { appareil, faux } from '../tests-fsrs/banc.mjs';
const ok = (c, m, d = '') => { console.log((c ? '✅' : '❌') + ' ' + m + (d ? ' — ' + d : '')); return c; };
const A = await appareil('9335');
const B = await appareil('9336');
for (const [X, mobile] of [[A, false], [B, true]]) {
  await X.send('Network.setCacheDisabled', { cacheDisabled: true });
  await X.send('Emulation.setDeviceMetricsOverride', mobile ? { width: 390, height: 844, deviceScaleFactor: 1, mobile: true } : { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
}
const ouvrir = async (X) => {
  await X.send('Page.reload', { ignoreCache: true }); await X.dormir(2500);
  for (let i = 0; i < 80; i++) {
    const ou = await X.ev(`document.querySelector('.sfa, [data-sfa]') ? 'app' : document.querySelector('.hub-card') ? 'hub' : ''`);
    if (ou === 'app') break;
    if (ou === 'hub') await X.ev(`(() => { const c = [...document.querySelectorAll('.hub-card')].find((x) => /MedRevise/i.test(x.innerText)); c && c.click(); return 1; })()`);
    await X.dormir(400);
  }
};
const S = (X, js) => X.ev(`(async () => { const S = ${X.mod('storage.js')}; ${js} })()`);
const JR = (X) => X.mod('journal.js').replace('/src/medrevise/lib/journal.js', '/src/medrevise/journal/journal.js');
const SY = (X) => X.mod('synchro.js').replace('/src/medrevise/lib/synchro.js', '/src/medrevise/journal/synchro.js');
const synchro = async (X) => { await X.ev(`(window.dispatchEvent(new Event('online')), true)`); await X.dormir(5000); await X.ev(`(async () => { await ${SY(X)}.synchroniserJournal(); return true; })()`); await X.dormir(1500); };
const nouvelles = (X) => S(X, `return (await S.getAll('questions')).filter((q) => q.nouvelle === true).length`);

await ouvrir(A);
await A.attendre(`(async () => !!(await ${A.mod('storage.js')}.getMeta('migration.conversion-nouvelles-v1')))()`, 60000);
await synchro(A);
const nA = await nouvelles(A);
ok(nA === 270, `A : conversion appliquée au démarrage (${nA} Nouvelles)`);
const cloud = await faux();
const nCloud = cloud.rows.filter((r) => r.store === 'questions' && r.data && r.data.nouvelle === true).length;
ok(nCloud === 270, `faux cloud : ${nCloud} cartes « nouvelle: true » reçues (ajout de champ, LWW)`);
await ouvrir(B);
await B.dormir(8000);
await synchro(B);
const qa = await S(A, `return (await S.getAll('questions')).length`);
const qb = await S(B, `return (await S.getAll('questions')).length`);
ok(qb === qa && (await nouvelles(B)) === 270, `B (profil vide) reçoit tout : ${qb}/${qa} cartes, ${await nouvelles(B)} Nouvelles`);
// B : passer une Nouvelle en révision (module de l'app, même fonction que le bouton) + noter une révision
const choix = await S(B, `const P = ${B.mod('planning.js')}; const C = ${B.mod('categoriesFC.js')}; const qs = await S.getAll('questions');
  const n = qs.find((q) => C.estNouvelle(q)); const r = qs.find((q) => q.type === 'flashcard' && !C.estNouvelle(q) && P.nextDate(q) && P.nextDate(q) <= ${JSON.stringify(new Date().toISOString().slice(0, 10))}); return { n: n.id, r: r.id };`);
await B.ev(`(async () => { const R = await import(performance.getEntriesByType('resource').map((x) => x.name).find((x) => x.includes('/scheduler/repondre.js'))); const S = ${B.mod('storage.js')};
  await R.passerFlashcardEnRevision(await S.getOne('questions', ${JSON.stringify(choix.n)}), { sauver: (c) => S.put('questions', c) });
  await R.repondreFlashcard(await S.getOne('questions', ${JSON.stringify(choix.r)}), 3, { sauver: (c) => S.put('questions', c) }); return 1; })()`);
await synchro(B);
const fc = await faux();
const lignes = fc.journalRevisions.n;
const enFile = await B.ev(`(async () => (await ${JR(B)}.entreesEnAttente()).map((e) => ({ rating: e.rating, ev: e.details && e.details.evenement })))()`);
ok(lignes >= 1 && enFile.length === 1 && enFile[0].rating === null, 'journal : la note est partie au cloud ; l’événement « passage_revision » reste en file (table rating 1–4)', JSON.stringify(enFile));
await synchro(A);
const na = await S(A, `return await S.getOne('questions', ${JSON.stringify(choix.n)})`);
const ra = await S(A, `return await S.getOne('questions', ${JSON.stringify(choix.r)})`);
const rb = await S(B, `return await S.getOne('questions', ${JSON.stringify(choix.r)})`);
ok(na.nouvelle === false && na.j0Date && na.dueDate === (await S(B, `return (await S.getOne('questions', ${JSON.stringify(choix.n)})).dueDate`)), 'A reçoit la carte passée en révision par B (nouvelle: false, J0, date des J)', `${na.j0Date} → ${na.dueDate}`);
ok(ra.dueDate === rb.dueDate && ra.historique.length === rb.historique.length, 'A reçoit la note de B (même date des J, même historique)');
// contrainte levée (= SQL appliqué) : l'événement part
await fetch('http://localhost:54399/__journal?contrainteRating=0');
await synchro(B);
const enFile2 = await B.ev(`(async () => (await ${JR(B)}.entreesEnAttente()).length)()`);
ok(enFile2 === 0, 'SQL appliqué (contrainte levée) : l’événement part, file vide');
ok(A.erreurs.length === 0 && B.erreurs.length === 0, 'aucune erreur JS', [...A.erreurs, ...B.erreurs].slice(0, 3).join(' | '));
process.exit(0);
