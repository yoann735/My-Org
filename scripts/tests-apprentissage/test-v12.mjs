// Apprentissage v1.2 — reprise de séance remise d'accord avec le plan du jour + fusion « streak max ».
// node scripts/tests-apprentissage/test-v12.mjs [copie-idb.json]   (le JSON optionnel rejoue un cas réel)
import { readFileSync } from 'node:fs';
import { planDuJour, introduire, repondre, sortir, reprendreSeance, fusionApprentissage, entrelacer } from '../../src/medrevise/lib/apprentissageFC.js';
import { advanceQuestion, QUALITY } from '../../src/medrevise/lib/sm2.js';
let echecs = 0;
const ok = (c, m, d = '') => { console.log((c ? '✅' : '❌') + ' ' + m + (d ? ' — ' + d : '')); if (!c) echecs++; };
const J = '2026-10-10', J1 = '2026-10-11';
const coursDe = (id) => 'f' + (parseInt(String(id).replace(/\D/g, ''), 10) % 3);
const nouvelle = (i, extra = {}) => ({ id: 'q' + i, type: 'flashcard', ficheId: coursDe('q' + i), recto: 'r' + i, dueDate: J, learnState: 'new', ...extra });
const revision = (i) => ({ id: 'q' + i, type: 'flashcard', ficheId: coursDe('q' + i), dueDate: J, learnState: 'review', intervalDays: 3, historique: [{ date: '2026-10-07', qualite: 2 }] });
const sansDoublon = (l) => new Set(l).size === l.length;

// séance ouverte : 4 révisions, 6 nouvelles introduites
let cartes = {};
[0, 1, 2, 3].forEach((i) => { cartes['q' + i] = revision(i); });
for (let i = 10; i < 16; i++) cartes['q' + i] = introduire(nouvelle(i), {}, J);
const plan0 = planDuJour(Object.values(cartes), {}, J);
let etat = { date: J, phase: 'revisions', bloc: 'tout', revisions: entrelacer(plan0.revisions.map((q) => q.id), coursDe), revIdx: 0,
  file: entrelacer(plan0.enCours.map((q) => q.id), coursDe), nApprendre: 6, nNouvelles: 6, faites: { revisions: 0, apprises: 0, rates: 0 } };
ok(etat.revisions.length === 4 && etat.file.length === 6, 'séance ouverte : 4 révisions, 6 à apprendre');
// on avance : 2 révisions notées, 2 cartes vues en apprentissage (streak 1)
for (const id of etat.revisions.slice(0, 2)) cartes[id] = advanceQuestion(cartes[id], QUALITY.facile);
etat = { ...etat, revIdx: 2, phase: 'apprendre' };
const vues = etat.file.slice(0, 2);
vues.forEach((id) => { cartes[id] = repondre({ ...cartes[id], learningPresented: true }, true, {}, J).carte; });
etat = { ...etat, file: [...etat.file.slice(2), ...vues] };
// 5 cartes créées ensuite, départ aujourd'hui ; 1 révision devenue échue
for (let i = 20; i < 25; i++) cartes['q' + i] = nouvelle(i);
cartes.q5 = revision(5);
const ordreAvant = etat.file.slice();
let r = reprendreSeance(etat, planDuJour(Object.values(cartes), {}, J), coursDe);
ok(r.etat.file.length === 11 && r.ajouts.apprendre === 5, 'reprise : file 6 → 11 (+5 nouvelles)', r.etat.file.length);
ok(JSON.stringify(r.etat.file.slice(0, 6)) === JSON.stringify(ordreAvant), 'cartes déjà dans la file : ordre conservé, ajouts en FIN');
ok(r.aIntroduire.length === 5, 'les 5 nouvelles sont à introduire (comme une séance neuve)');
ok(vues.every((id) => cartes[id].learningStreak === 1), 'cartes déjà vues : streak conservé (1)');
ok(r.etat.revisions.length === 5 && r.etat.revIdx === 2 && r.etat.revisions.slice(2).length === 3, 'révisions : 2 faites gardées, +1 devenue échue → 3 restantes');
ok(r.etat.nApprendre === 11 && r.etat.nNouvelles === 11, 'compteurs de séance mis à jour', `${r.etat.nApprendre}/${r.etat.nNouvelles}`);
// les compteurs restants = plan du jour (après introduction)
r.aIntroduire.forEach((q) => { cartes[q.id] = introduire(q, {}, J); });
let plan = planDuJour(Object.values(cartes), {}, J);
r = reprendreSeance(r.etat, plan, coursDe);
ok(r.etat.file.length === plan.enCours.length + plan.nouvelles.length && r.etat.revisions.length - r.etat.revIdx === plan.revisions.length,
  'restantes = plan du jour', `${r.etat.revisions.length - r.etat.revIdx}/${r.etat.file.length} vs ${plan.revisions.length}/${plan.enCours.length + plan.nouvelles.length}`);
// sortie sur l'appareil B → retirée ; supprimée → retirée ; révision notée ailleurs → retirée
const sortieB = r.etat.file[3];
cartes[sortieB] = sortir(cartes[sortieB], J);
const supprimee = r.etat.file[4]; delete cartes[supprimee];
const noteeAilleurs = r.etat.revisions[r.etat.revIdx]; cartes[noteeAilleurs] = advanceQuestion(cartes[noteeAilleurs], QUALITY.difficile);
const r2 = reprendreSeance(r.etat, planDuJour(Object.values(cartes), {}, J), coursDe);
ok(!r2.etat.file.includes(sortieB) && !r2.etat.file.includes(supprimee) && r2.etat.file.length === 9, 'sortie ailleurs + supprimée → retirées de la file (11 → 9)');
ok(!r2.etat.revisions.slice(r2.etat.revIdx).includes(noteeAilleurs) && r2.retirees.revisions === 1, 'révision notée sur l’autre appareil → retirée des restantes');
// 10 reprises successives : aucun doublon, rien ne bouge
let e = r2.etat; const ref = JSON.stringify([e.revisions, e.file]);
for (let k = 0; k < 10; k++) e = reprendreSeance(e, planDuJour(Object.values(cartes), {}, J), coursDe).etat;
ok(sansDoublon(e.file) && sansDoublon(e.revisions) && JSON.stringify([e.revisions, e.file]) === ref, '10 reprises successives : aucun doublon, état stable');
// doublons hérités dans une séance sauvegardée → nettoyés
const sale = reprendreSeance({ ...e, file: [...e.file, e.file[0], e.file[1]] }, planDuJour(Object.values(cartes), {}, J), coursDe).etat;
ok(sansDoublon(sale.file) && sale.file.length === e.file.length, 'file sauvegardée avec doublons → dédoublonnée');
// bloc vidé : phase qui passe la main
const vide = reprendreSeance({ date: J, phase: 'revisions', bloc: 'tout', revisions: ['q99'], revIdx: 0, file: [] }, { revisions: [], enCours: [], nouvelles: [cartes.q20], aSortir: [] }, coursDe).etat;
ok(vide.phase === 'apprendre' && vide.file.length === 1, 'révisions vidées (notées ailleurs) + 1 nouvelle → phase apprendre');

// FUSION
const base = introduire(nouvelle(40), {}, J);
const a = { ...base, learningStreak: 1, learningPresented: true, updatedAt: '2026-10-10T10:00:00Z' };
const b = { ...base, learningStreak: 0, learningPresented: true, updatedAt: '2026-10-10T10:05:00Z' };
let f = fusionApprentissage(b, a);
ok(f && f.learningStreak === 1, 'séances parallèles : la version récente a streak 0, l’autre 1 → 1 (jamais le plus bas)');
ok(fusionApprentissage(a, b) === null, 'la version retenue a déjà le streak le plus élevé → aucune écriture');
const sortieAilleurs = sortir({ ...a }, J);
f = fusionApprentissage({ ...b }, sortieAilleurs);
ok(f && f.learnState === 'review' && f.dueDate === J1, 'sortie sur un appareil, cycle encore ouvert sur l’autre → la sortie gagne');
const autreCycle = { ...a, learningIntroducedOn: '2026-10-09' };
ok(fusionApprentissage(b, autreCycle) === null, 'cycles différents (raté plus tard) → LWW inchangé');
const nouveauRate = { ...b, historique: [{ date: J, qualite: 0 }] };
ok(fusionApprentissage(nouveauRate, sortieAilleurs) === null, 'nouvelle notation J depuis la sortie → pas de retour en arrière');
ok(fusionApprentissage({ ...revision(1), updatedAt: 'x' }, { ...revision(1), intervalDays: 9 }) === null, 'cartes en révision : LWW inchangé (méthode des J intacte)');

// REJEU d'un cas réel (copie IndexedDB du Mac du 10/10, docs/diagnostic-divergence-apprentissage.md)
if (process.argv[2]) {
  const { index, isFicheScheduled, nextDate } = await import('../../src/medrevise/lib/planning.js');
  const d = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const db = { sources: d.sources.v, matieres: d.matieres.v, fiches: d.fiches.v, questions: d.questions.v };
  const ix = index(db);
  const fc = db.questions.filter((q) => q.type === 'flashcard' && isFicheScheduled(db, ix.fById[q.ficheId], ix));
  const s = d.meta.v[d.meta.k.indexOf('seanceFC')];
  const p = planDuJour(fc, null, s.date, nextDate);
  const rr = reprendreSeance(s, p, (id) => (db.questions.find((q) => q.id === id) || {}).ficheId);
  ok(s.file.length === 62 && rr.etat.file.length === 77 && rr.ajouts.apprendre === 15, 'cas réel du Mac : séance figée à 62 → 77 après reprise (+15)', `${s.file.length} → ${rr.etat.file.length}`);
  ok(rr.etat.revisions.length - rr.etat.revIdx === 39, 'cas réel : 39 révisions, les mêmes');
}
console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est vert.');
process.exit(echecs ? 1 : 0);
