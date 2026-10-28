// Jeu de test sur A (ordinateur, profil NEUF, faux Supabase) puis synchro vers B : 2 sections, 3 matières, 4 cours de
// 10 cartes (3 Retard, 4 Révisions, 3 Nouvelles) + un cours témoin. Plus 2 entrées de journal (preuve d'indépendance).
// Réécrit les mêmes ids, remet learning_set à zéro (passages) : rejouable.
import { appareil, COURS } from './commun.mjs';
const A = await appareil(false);
await A.send('Page.navigate', { url: 'http://localhost:5300/' }); await A.dormir(3500);
await A.ouvrirApp({ recharger: false });
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
await A.synchro(6000);
const B = await appareil(true);
await B.send('Page.navigate', { url: 'http://localhost:5300/' }); await B.dormir(3500);
await B.ouvrirApp({ recharger: false }); await B.synchro(7000);
const nB = await B.S(`return (await S.getAll('questions')).filter((q) => /^f[1-5]$/.test(q.ficheId)).length`);
console.log('seed', JSON.stringify(r), '· B a reçu', nB, 'cartes', A.erreurs.concat(B.erreurs).join(' | ').slice(0, 200));
process.exit(0);
