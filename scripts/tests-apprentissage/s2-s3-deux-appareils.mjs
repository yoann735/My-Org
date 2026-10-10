// Scénario 2 : séance OUVERTE sur A (ordinateur), 5 cartes créées sur B (téléphone) puis synchronisées.
// Scénario 3 : une carte SORTIE sur B pendant que A a la séance ouverte → A la retire à la reprise.
import { appareil } from './banc.mjs';
import { versEncart, encart, pas, progression, creerCartes, capture, sansDoublon } from './commun.mjs';
let echecs = 0; const ok = (c, m, d = '') => { console.log((c ? '✅' : '❌') + ' ' + m + (d ? ' — ' + d : '')); if (!c) echecs++; };
const A = await appareil(9335), B = await appareil(9336);
// A : séance ouverte à l'écran (reprise), à jour du cloud
await A.synchro(); await A.dormir(3500);
if (!(await A.ev(`!!document.querySelector('.sfc-carte')`))) { await versEncart(A); await A.clic('Reprendre la séance') || await A.clic('Démarrer la séance'); await A.attendre(`!!document.querySelector('.sfc-carte')`); }
if ((await A.seance()).phase !== 'apprendre') { await A.clic('Passer à l’apprentissage'); await A.dormir(600); }
const a0 = await A.seance(); const p0 = await progression(A);
console.log('A, séance ouverte :', p0, '· file', a0.file.length);
// ---- scénario 2
const ids = await creerCartes(B, 'telB' + Date.now().toString(36) + '_', 5);
await B.synchro(); await B.dormir(3000);
await A.synchro(); await A.dormir(3500); // fin de synchro sur A : la séance ouverte est remise d'accord
const a1 = await A.seance(); const p1 = await progression(A);
console.log('A après la synchro :', p1, '· file', a1.file.length);
await capture(A, 'ordi-5-seance-ouverte-apres-synchro');
ok(a1.file.length === a0.file.length + 5, '[2] séance OUVERTE sur A : file +5 après la synchro', `${a0.file.length} → ${a1.file.length}`);
ok(ids.every((id) => a1.file.slice(a0.file.length).includes(id)), '[2] les 5 cartes créées sur B sont en fin de file sur A');
ok(JSON.stringify(a1.file.slice(0, a0.file.length)) === JSON.stringify(a0.file), '[2] cartes déjà dans la file : intactes');
ok(p1.includes(String(a1.file.length)), '[2] compteur de la séance = file réelle', p1);
ok(sansDoublon(a1.file), '[2] aucun doublon');
// ---- scénario 3 : B fait sortir une carte (2e succès) qui est aussi dans la file de A
await versEncart(B); await B.clic('Reprendre la séance') || await B.clic('Démarrer la séance');
await B.attendre(`!!document.querySelector('.sfc-carte, .sfc-transition')`);
let sortie = null;
for (let i = 0; i < 40 && !sortie; i++) {
  await B.clic('Commencer l’apprentissage');
  const vue = await B.ev(`(() => { const c = document.querySelector('.sfc-carte'); return c ? c.dataset.carte : null; })()`);
  const r = await pas(B, { su: true });
  if (r === 'su' && vue) { const c = (await B.cartes()).find((x) => x.id === vue); if (c && c.learnState === 'review') sortie = vue; }
}
console.log('B : carte sortie →', sortie);
ok(!!sortie && a1.file.includes(sortie), '[3] une carte de la file de A est sortie sur B', sortie);
await B.dormir(1500); await B.synchro(); await B.dormir(3000);
await A.synchro(); await A.dormir(3500);
const a2 = await A.seance(); const p2 = await progression(A);
const cA = (await A.cartes()).find((x) => x.id === sortie);
console.log('A après la synchro :', p2, '· file', a2.file.length, '· carte', sortie, 'sur A :', cA && cA.learnState);
ok(!a2.file.includes(sortie) && a2.file.length === a1.file.length - 1, '[3] A retire la carte sortie sur B (file −1)', `${a1.file.length} → ${a2.file.length}`);
ok(cA && cA.learnState === 'review', '[3] la carte est « en révision » sur A aussi (jamais ramenée en apprentissage)');
ok(await A.ev(`!!document.querySelector('.sfc-carte')`), '[3] la séance de A continue d’afficher une carte');
await capture(A, 'ordi-6-apres-sortie-sur-B');
// l'encart de A = plan du jour
await A.ev(`document.querySelector('.sfc-quitter').click(), true`); await A.dormir(1200); await versEncart(A);
const eA = await encart(A);
const plan = await A.ev(`(async () => { const st = ${A.mod('storage.js')}; const ap = ${A.mod('apprentissageFC.js')}; const pl = ${A.mod('planning.js')}; const sm2 = ${A.mod('sm2.js')};
  const db = { sources: await st.getAll('sources'), matieres: await st.getAll('matieres'), fiches: await st.getAll('fiches'), questions: await st.getAll('questions') }; const ix = pl.index(db);
  const p = ap.planDuJour(db.questions.filter((q) => ap.estFlashcardJ(q) && pl.isFicheScheduled(db, ix.fById[q.ficheId], ix)), await st.getReglagesFC(), sm2.todayISO(), pl.nextDate);
  return { rev: p.revisions.length, app: p.enCours.length + p.nouvelles.length }; })()`);
ok(eA.rev === plan.rev && eA.app === plan.app, 'encart de A = plan du jour recalculé', `encart ${eA.rev}/${eA.app} · plan ${plan.rev}/${plan.app}`);
ok(A.erreurs.length === 0 && B.erreurs.length === 0, 'aucune erreur console (A et B)', [...A.erreurs, ...B.erreurs].join(' / ').slice(0, 300));
A.fermer(); B.fermer();
process.exit(echecs ? 1 : 0);
