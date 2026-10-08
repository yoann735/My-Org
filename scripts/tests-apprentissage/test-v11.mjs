// Apprentissage des flashcards v1.1 (critère 2, sans quota) — node scripts/tests-apprentissage/test-v11.mjs
import { planDuJour, repondre, reinserer, DISTANCE, reglagesFC, estimationMs, apresNotationJ, introduire, prochaineSeance, REGLAGES_FC_DEFAUT, BORNES_FC } from '../../src/medrevise/lib/apprentissageFC.js';
import { QUALITY } from '../../src/medrevise/lib/sm2.js';
let echecs = 0;
const ok = (c, m, d = '') => { console.log((c ? '✅' : '❌') + ' ' + m + (d ? ' — ' + d : '')); if (!c) echecs++; };
const J = '2026-10-08', J1 = '2026-10-09';
const carte = (i, extra = {}) => ({ id: 'q' + i, type: 'flashcard', ficheId: 'f' + (i % 3), recto: 'r' + i, verso: 'v' + i, dueDate: J, learnState: 'learning', learningStreak: 0, learningPresented: false, ...extra });

ok(REGLAGES_FC_DEFAUT.critere === 2 && BORNES_FC.critere[0] === 1 && BORNES_FC.critere[1] === 5 && !('quotaNouvelles' in REGLAGES_FC_DEFAUT), 'réglages : critère 2 par défaut, plage 1–5, plus de quota');
ok(JSON.stringify(Object.keys(reglagesFC({ quotaNouvelles: 15, critere: 3, critereApresRate: 2 })).sort()) === JSON.stringify(['critere', 'muscleLigneParLigne']), 'anciens champs du quota ignorés');
// 30 cartes au départ aujourd'hui : toutes dans Apprendre
const trente = Array.from({ length: 30 }, (_, i) => carte(i));
let p = planDuJour(trente, {}, J);
ok(p.nouvelles.length === 30 && p.enCours.length === 0 && !('glissent' in p), '30 cartes au départ aujourd’hui → 30 dans Apprendre, aucune repoussée');
// 60 aussi
ok(planDuJour(Array.from({ length: 60 }, (_, i) => carte(i)), {}, J).nouvelles.length === 60, '60 cartes → 60 (aucun plafond)');
// départ demain : pas aujourd'hui, demain oui
const demain = carte(99, { dueDate: J1, learnState: 'new' });
ok(planDuJour([demain], {}, J).nouvelles.length === 0 && planDuJour([demain], {}, J1).nouvelles.length === 1, 'date de départ demain : entre demain, pas avant');
// critère 2
let q = introduire(carte(1), {}, J);
let r = repondre({ ...q, learningPresented: true }, true, {}, J);
ok(!r.sortie && r.carte.learningStreak === 1, '1er succès : reste');
r = repondre(r.carte, true, {}, J);
ok(r.sortie && r.carte.learnState === 'review' && r.carte.dueDate === J1, '2e succès consécutif : sortie → révision J+1', r.carte.dueDate);
// raté puis 2 succès
r = repondre({ ...q, learningPresented: true }, false, {}, J);
r = repondre(r.carte, true, {}, J); const apres1 = r.sortie;
r = repondre(r.carte, true, {}, J);
ok(!apres1 && r.sortie, 'raté puis 2 succès → sortie');
// ancien critère 3 enregistré sur la carte : le réglage (2) décide
r = repondre({ ...q, learningCriterion: 3, learningStreak: 1, learningPresented: true }, true, {}, J);
ok(r.sortie, 'carte entrée avec critère 3 : sort au 2e succès (réglage courant)');
// carte déjà à 2 succès (entrée avant la v1.1) → aSortir, pas dans enCours
const deja = carte(5, { learningIntroducedOn: '2026-10-07', learningDue: '2026-10-07', learningStreak: 2, learningCriterion: 3, learningPresented: true });
const un = carte(6, { learningIntroducedOn: '2026-10-07', learningDue: '2026-10-07', learningStreak: 1, learningPresented: true });
p = planDuJour([deja, un], {}, J);
ok(p.aSortir.length === 1 && p.aSortir[0].id === 'q5' && p.enCours.length === 1, 'série 2 existante → sort sans repasser ; série 1 → reste en cours');
// raté en révision : redescend avec le même critère (2)
const rev = apresNotationJ({ ...carte(7), learnState: 'review' }, QUALITY.rate, {}, J);
ok(rev.learnState === 'learning' && rev.learningCriterion === 2 && rev.learningDue === J1, 'raté en révision → réapprentissage demain, critère 2');
// réinsertion : fin de paquet
const f = reinserer(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'], 'X', DISTANCE.finDePaquet, () => 'z');
ok(f[f.length - 1] === 'X' && f.length === 13, 'réussie du premier coup → en FIN de paquet (12 cartes avant elle)');
const g = reinserer(['a', 'b', 'c', 'd', 'e', 'f'], 'X', DISTANCE.pasSu, () => 'z', () => 0);
ok(g.indexOf('X') === 3, 'ratée → revient 3–4 cartes plus loin', String(g.indexOf('X')));
// carte retenue par l'ancien quota (départ passé, jamais entrée) → dans Apprendre aujourd'hui
const retenue = carte(8, { dueDate: '2026-10-01' });
ok(planDuJour([retenue], {}, J).nouvelles.length === 1, 'carte retenue par l’ancien quota (départ le 01/10) → entre aujourd’hui');
// estimation : ≈ 45 s par carte à apprendre
const min = Math.round(estimationMs(23, 41, []) / 60000);
ok(min === 37, '23 à réviser · 41 à apprendre → ≈ 37 min (15 s / révision, 45 s / carte à apprendre)', min + ' min');
ok(Math.round(estimationMs(0, 10, [{ nApprendre: 10, msApprendre: 1e7 }, { nApprendre: 10, msApprendre: 1e7 }, { nApprendre: 10, msApprendre: 1e7 }]) / 1000) === 450, 'mesures anciennes (critère 3) ignorées pour l’apprentissage');
ok(prochaineSeance([demain], planDuJour([demain], {}, J), J) === J1, 'prochaine séance = prochaine date de départ (plus de « demain » forcé par le quota)');
console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est vert.');
process.exit(echecs ? 1 : 0);
