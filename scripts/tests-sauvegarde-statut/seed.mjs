// Jeu de test du banc « sauvegarde + statut de synchro » (07/11) : le jeu de tests-selection-passages/seed.mjs (4 cours × 10 cartes,
// cours témoin, 2 entrées de journal) écrit sur l'ordinateur (profil NEUF, faux Supabase), PLUS 19 cartes « Boîte → Flashcard »
// dont le champ srcId vaut genId('bfc') : la forme exacte des 19 cartes qui faisaient compter 19 « fichiers manquants ».
import { dispositif } from './commun.mjs';
import { COURS } from '../tests-selection-passages/commun.mjs';
const A = await dispositif('ordi');
await A.recharger();
const r = await A.S(`
  const sm2 = await import('/src/medrevise/lib/sm2.js');
  const J = await import(performance.getEntriesByType('resource').map((x) => x.name).find((n) => n.includes('journal/journal.js')) || '/src/medrevise/journal/journal.js');
  const today = sm2.todayISO();
  const j = (n) => { const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('fr-CA'); };
  await S.putMany('sources', [{ id: 's1', nom: 'Section 1', rappelsJ: true }, { id: 's2', nom: 'Section 2', rappelsJ: true }]);
  await S.putMany('matieres', [{ id: 'mA', sourceId: 's1', nom: 'Néphro-cardio', ordre: 0 }, { id: 'mB', sourceId: 's1', nom: 'Pneumo', ordre: 1 }, { id: 'mC', sourceId: 's2', nom: 'Hépato', ordre: 0 }]);
  const C = ${JSON.stringify(COURS)};
  await S.putMany('fiches', [{ id: 'f4', matiereId: 'mC', titre: C[3], type: 'standard', ordre: 0 }, { id: 'f2', matiereId: 'mA', titre: C[1], type: 'standard', ordre: 1 },
    { id: 'f1', matiereId: 'mA', titre: C[0], type: 'standard', ordre: 0 }, { id: 'f3', matiereId: 'mB', titre: C[2], type: 'standard', ordre: 0 }, { id: 'f5', matiereId: 'mC', titre: 'Cours témoin', type: 'standard', ordre: 1 }]);
  const H = [{ date: j(-12), qualite: 3 }];
  const cartes = [];
  for (const k of [1, 2, 3, 4]) {
    const fc = (id, o) => ({ id, type: 'flashcard', ficheId: 'f' + k, theme: 'C' + k, recto: 'Cours ' + k + ' · ' + id, verso: 'Réponse ' + id, ...o });
    [1, 2, 3].forEach((n) => cartes.push(fc('c' + k + '-retard' + n, { historique: H, nouvelle: false, intervalDays: 3, dueDate: j(-n - k), j0Date: j(-20) })));
    [1, 2, 3, 4].forEach((n) => cartes.push(fc('c' + k + '-rev' + n, { historique: H, nouvelle: false, intervalDays: 4, dueDate: today, j0Date: j(-20) })));
    [1, 2, 3].forEach((n) => cartes.push(fc('c' + k + '-nouv' + n, { historique: [], nouvelle: true, dueDate: j(-n), j0Date: j(-n) })));
  }
  cartes.push({ id: 'temoin-texte', type: 'flashcard', ficheId: 'f5', theme: 'Témoin', recto: 'Rôle du néphron ?', verso: 'Filtrer le sang.', historique: H, nouvelle: false, intervalDays: 30, dueDate: j(20), j0Date: j(-40) });
  await S.putMany('questions', cartes);
  const ls = (await S.getOne('learning_set', 'learning_set')) || { id: 'learning_set', cardIds: [] };
  await S.put('learning_set', { ...ls, passages: {} });
  for (const [id, carte] of [['seed-j1', 'c1-retard1'], ['seed-j2', 'c2-rev1']])
    await J.ajouterAuJournal({ id, card_id: carte, rating: 3, reviewed_at: new Date(Date.now() - 86400000).toISOString(), jour: j(-1), device: 'banc', scheduler_version: 'banc', planificateur: 'maison', state_before: null, state_after: null, details: {} });
  return { today, n: cartes.length };
`);
const bfc = await A.S(`
  const l = []; for (let i = 0; i < 19; i++) l.push({ id: 'bfc-carte-' + i, type: 'flashcard', ficheId: 'f5', theme: 'Boîte', recto: 'Boîte → Flashcard ' + (i + 1), verso: 'verso', historique: [], nouvelle: true, dueDate: '2099-01-01', j0Date: '2026-11-06', srcId: S.genId('bfc'), source: { sorte: 'boite', boiteId: 'an-boite-' + i, page: 110 } });
  await S.putMany('questions', l); return l.length;`);
await A.ev(`(window.dispatchEvent(new Event('online')), 1)`); await A.attendrePhase(['ajour'], 60000); await A.dormir(3000);
console.log('seed', JSON.stringify(r), '+', bfc, 'cartes Boîte → Flashcard (srcId bfc…)', A.erreurs.join(' | ').slice(0, 200));
process.exit(0);
