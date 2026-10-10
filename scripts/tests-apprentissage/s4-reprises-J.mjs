// 10 reprises successives (quitter / reprendre, et 10 synchros séance ouverte) : aucun doublon, état stable.
// Non-régression de la méthode des J : notation en séance = advanceQuestion (+ apresNotationJ pour Raté).
import { appareil } from './banc.mjs';
import { versEncart, encart, sansDoublon } from './commun.mjs';
let echecs = 0; const ok = (c, m, d = '') => { console.log((c ? '✅' : '❌') + ' ' + m + (d ? ' — ' + d : '')); if (!c) echecs++; };
const A = await appareil(9335);
const lire = async () => { const s = await A.seance(); return JSON.stringify([s.revisions.slice(s.revIdx), s.file.slice().sort()]); };
await versEncart(A);
await A.clic('Reprendre la séance'); await A.attendre(`!!document.querySelector('.sfc-carte, .sfc-transition')`); await A.dormir(600);
const ref = await lire(); const s0 = await A.seance();
let stable = true, propre = true;
for (let k = 0; k < 10; k++) {
  await A.ev(`document.querySelector('.sfc-quitter').click(), true`); await A.dormir(700);
  await versEncart(A); await A.clic('Reprendre la séance'); await A.attendre(`!!document.querySelector('.sfc-carte, .sfc-transition')`); await A.dormir(500);
  const s = await A.seance(); propre = propre && sansDoublon(s.file) && sansDoublon(s.revisions);
  stable = stable && (await lire()) === ref;
}
ok(propre, '10 reprises (quitter / reprendre) : aucun doublon');
ok(stable, '10 reprises : mêmes cartes restantes', `${s0.file.length} à apprendre`);
stable = true; propre = true;
for (let k = 0; k < 10; k++) { await A.synchro(); await A.dormir(1800); const s = await A.seance(); propre = propre && sansDoublon(s.file) && sansDoublon(s.revisions); stable = stable && (await lire()) === ref; }
ok(propre && stable, '10 synchros séance ouverte : aucun doublon, état stable');
// ---- méthode des J : 2 révisions échues créées, notées Facile et Raté en séance
const [idF, idR] = await A.ev(`(async () => { const st = ${A.mod('storage.js')}; const sm2 = ${A.mod('sm2.js')}; const t = sm2.todayISO(); const k = Date.now().toString(36);
  const base = (id) => ({ id, type: 'flashcard', ficheId: 'fA', recto: 'J ' + id, verso: 'v', learnState: 'review', intervalDays: 7, dueDate: t, capped: false, termine: false, historique: [{ date: '2026-10-03', qualite: 2 }] });
  await st.put('questions', base('qJF' + k)); await st.put('questions', base('qJR' + k)); return ['qJF' + k, 'qJR' + k]; })()`);
await A.synchro(); await A.dormir(3000);
const avant = Object.fromEntries((await A.ev(`(async () => (await ${A.mod('storage.js')}.getAll('questions')).filter((q) => q.id.startsWith('qJ')))()`)).map((q) => [q.id, q]));
const s1 = await A.seance();
ok(s1.revisions.slice(s1.revIdx).includes(idF) && s1.revisions.slice(s1.revIdx).includes(idR), 'séance ouverte : les 2 révisions devenues échues sont ajoutées');
if ((await A.seance()).phase !== 'revisions') { await A.clic('Revenir aux révisions'); await A.dormir(600); }
for (let i = 0; i < 6; i++) {
  const vue = await A.ev(`(document.querySelector('.sfc-carte')||{dataset:{}}).dataset.carte`);
  if (vue !== idF && vue !== idR) break;
  await A.clic('Voir la réponse'); await A.dormir(250);
  await A.clic(vue === idF ? 'Facile' : 'Raté'); await A.dormir(500);
}
const attendu = await A.ev(`(async () => { const sm2 = ${A.mod('sm2.js')}; const ap = ${A.mod('apprentissageFC.js')}; const av = ${JSON.stringify(avant)};
  const f = sm2.advanceQuestion(av['${idF}'], sm2.QUALITY.facile); const r = ap.apresNotationJ(sm2.advanceQuestion(av['${idR}'], sm2.QUALITY.rate), sm2.QUALITY.rate, null);
  return { f: { dueDate: f.dueDate, intervalDays: f.intervalDays, h: f.historique.length, ls: f.learnState }, r: { dueDate: r.dueDate, intervalDays: r.intervalDays, h: r.historique.length, ls: r.learnState, ld: r.learningDue } }; })()`);
const apres = Object.fromEntries((await A.ev(`(async () => (await ${A.mod('storage.js')}.getAll('questions')).filter((q) => q.id.startsWith('qJ')))()`)).map((q) => [q.id, q]));
const F = apres[idF], R = apres[idR];
ok(F.dueDate === attendu.f.dueDate && F.intervalDays === attendu.f.intervalDays && F.historique.length === attendu.f.h && F.learnState === 'review', 'J : « Facile » = advanceQuestion (échéance, intervalle, historique)', `${F.dueDate} / ${F.intervalDays} j`);
ok(R.dueDate === attendu.r.dueDate && R.learnState === 'learning' && R.learningDue === attendu.r.ld, 'J : « Raté » = advanceQuestion + réapprentissage demain (inchangé)', `${R.learnState} dû ${R.learningDue}`);
const s2 = await A.seance();
ok(!s2.file.includes(idR), 'carte ratée aujourd’hui : PAS ajoutée à la file du jour (elle est attendue demain)');
await A.ev(`document.querySelector('.sfc-quitter').click(), true`); await A.dormir(1000); await versEncart(A);
console.log('encart final A :', (await encart(A)).texte);
ok(A.erreurs.length === 0, 'aucune erreur console', A.erreurs.join(' / ').slice(0, 300));
A.fermer(); process.exit(echecs ? 1 : 0);
