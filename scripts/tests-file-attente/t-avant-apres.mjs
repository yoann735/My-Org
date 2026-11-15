// Mode file d'attente DÉSACTIVÉ = comportement strictement identique à avant le chantier.
// Même copie de données, même jour simulé : code d'AVANT (:5312, git archive 481184d) vs code d'APRÈS (:5310), puis
// APRÈS avec un enregistrement du mode présent mais désactivé (après une activation + désactivation).
// Comparés : file (catégories et ordre), compteurs à l'écran, calendrier (dueOn sur 35 jours + retard), séance composée
// (hasard figé), prochaine séance, compteur du hub. node t-avant-apres.mjs
import fs from 'node:fs';
import { appareil, paquets, nouvelles, ajouterJours, dormir } from './commun.mjs';

const JOUR = '2026-11-20';
// jeu varié : retards sur 12 jours, révisions du jour, futur sur 40 jours, Nouvelles, carte sautée, terminée, QCM
function jeu() {
  const cs = [];
  for (let k = -12; k <= 40; k++) { const j = ajouterJours(JOUR, k); const n = 3 + ((k + 20) % 5); cs.push(...paquets(j, 1, n, { prefixe: 'c', vue: ajouterJours(j, -(1 + ((k + 30) % 7))) })); }
  cs.push(...nouvelles(14));
  cs.push({ ...paquets(JOUR, 1, 1, { prefixe: 'saute' })[0], skippedOn: JOUR });
  cs.push({ ...paquets('2026-11-10', 1, 1, { prefixe: 'fin' })[0], termine: true, dueDate: null });
  cs.push({ id: 'qcm-1', type: 'qcm', ficheId: 'fa-f1', question: 'QCM ?', choix: ['a', 'b'], bonne: 0, intervalDays: 2, dueDate: JOUR, historique: [{ date: '2026-11-18', qualite: 5 }] });
  return cs;
}
const releve = (b) => b.ev(`(async () => {
  const P = await __imp('/src/medrevise/lib/planning.js'); const C = await __imp('/src/medrevise/lib/categoriesFC.js'); const A = await __imp('/src/medrevise/lib/apprentissageFC.js');
  const S = await __imp('/src/medrevise/lib/storage.js'); const sm2 = await __imp('/src/medrevise/lib/sm2.js'); const Q = await __imp('/src/medrevise/session/SeanceFC.jsx');
  const db = { sources: await S.getAll('sources'), matieres: await S.getAll('matieres'), fiches: await S.getAll('fiches'), questions: await S.getAll('questions') };
  const t = sm2.todayISO(); const cartes = Q.flashcardsPlanifiees(db);
  const cats = C.categoriser(cartes, t, P.nextDate);
  const cal = []; for (let k = 0; k < 35; k++) { const d = P.addDays(t, k); cal.push([d, P.dueOn(db, d).map((q) => q.id).sort()]); }
  const r = Math.random; Math.random = () => 0.37;
  const s1 = Q.nouvelleSeance(db, t, { nouvelles: { coche: true, max: 10 }, revisions: { coche: true, max: 'tout' }, retard: { coche: true, max: 'tout' } });
  const s2 = Q.nouvelleSeance(db, t, { nouvelles: { coche: true, max: 5 }, revisions: { coche: true, max: 5 }, retard: { coche: true, max: 15 }, parCours: true });
  Math.random = r;
  return { t, retard: cats.retard.map((q) => q.id), revisions: cats.revisions.map((q) => q.id), nouvelles: cats.nouvelles.map((q) => q.id), cal,
    overdue: P.overdueQuestions(db).map((q) => q.id).sort(), dueToday: P.dueToday(db).map((q) => q.id).sort(), prochaine: A.prochaineSeance(cartes, t, P.nextDate),
    plan: A.planDuJour(cartes, t, P.nextDate).dues.map((q) => q.id).sort(), seance1: s1.cartes, seance2: s2.cartes, dates: Object.fromEntries(db.questions.map((q) => [q.id, P.nextDate(q)])) };
})()`);
const ecranReviser = async (b) => { await b.aller('Réviser'); await b.attendre(`!!document.querySelector('.sfa')`, 15000); await dormir(500); return b.ecran(); };
const hub = async (b) => { await b.ev(`(() => { const x = [...document.querySelectorAll('button, .sb-item')].find((e) => /Changer d.app/.test((e.title || '') + (e.innerText || ''))); x && x.click(); return 1; })()`); await b.attendre(`[...document.querySelectorAll('.hub-card')].some((e) => /\\d+ cartes?\\s/.test(e.innerText))`, 20000); await dormir(800);
  const t = await b.ev(`[...document.querySelectorAll('.hub-card')].find((e) => /MedRevise/.test(e.innerText))?.innerText.match(/(\\d+) cartes?\\s/)?.[1]`);
  await b.ev(`(() => { const x = [...document.querySelectorAll('.hub-card')].find((e) => /MedRevise/.test(e.innerText)); x && x.click(); return 1; })()`); await dormir(1500); return t; };

const cs = jeu();
const sortie = {};
for (const [nom, base] of [['avant', 'http://localhost:5312'], ['apres', 'http://localhost:5310']]) {
  const b = await appareil('ordi2', base);
  await b.vider(); await b.horloge(JOUR); await b.semer(cs); await b.ouvrir();
  sortie[nom] = { calc: await releve(b), ecran: await ecranReviser(b), hub: await hub(b) };
  if (nom === 'apres') {
    // enregistrement du mode présent puis désactivé (activation + désactivation, comme par l'écran)
    await b.ev(`(async () => { const S = await __imp('/src/medrevise/lib/storage.js'); const F = await __imp('/src/medrevise/lib/fileAttente.js');
      await S.setFileAttente(F.etatActivation('2026-11-08', F.jourFile())); await S.setFileAttente({ actif: false, pauses: [] }); return 1; })()`);
    await b.ouvrir();
    sortie.desactive = { calc: await releve(b), ecran: await ecranReviser(b), hub: await hub(b) };
  }
  b.fermerWs();
}
let echecs = 0;
const ok = (c, m, d = '') => { console.log((c ? '✅ ' : '❌ ') + m + (d ? ' — ' + d : '')); if (!c) echecs++; };
const A = sortie.avant, B = sortie.apres, D = sortie.desactive;
for (const [nom, X] of [['après (mode jamais activé)', B], ['après (mode activé puis désactivé)', D]]) {
  for (const k of ['retard', 'revisions', 'nouvelles', 'overdue', 'dueToday', 'prochaine', 'plan', 'seance1', 'seance2', 'dates']) ok(JSON.stringify(A.calc[k]) === JSON.stringify(X.calc[k]), `${nom} : ${k} identique`, k === 'dates' ? `${Object.keys(A.calc.dates).length} cartes` : Array.isArray(A.calc[k]) ? `${A.calc[k].length} éléments` : String(A.calc[k]));
  ok(JSON.stringify(A.calc.cal) === JSON.stringify(X.calc.cal), `${nom} : calendrier 35 jours identique`, A.calc.cal.slice(0, 3).map(([d, l]) => `${d}:${l.length}`).join(' '));
  ok(JSON.stringify(A.ecran) === JSON.stringify(X.ecran), `${nom} : compteurs à l’écran identiques`, JSON.stringify(X.ecran));
  ok(A.hub === X.hub, `${nom} : compteur du hub identique`, `${A.hub} / ${X.hub}`);
}
console.log(echecs ? `❌ ${echecs} échec(s)` : '✅ tout est vert');
fs.mkdirSync(new URL('./resultats/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('./resultats/avant-apres.json', import.meta.url), JSON.stringify({ chiffres: { retard: A.calc.retard.length, revisions: A.calc.revisions.length, nouvelles: A.calc.nouvelles.length, cartes: cs.length, seance1: A.calc.seance1.length, seance2: A.calc.seance2.length }, ecran: { avant: A.ecran, apres: B.ecran, desactive: D.ecran }, hub: [A.hub, B.hub, D.hub], echecs }, null, 1));
process.exitCode = echecs;
