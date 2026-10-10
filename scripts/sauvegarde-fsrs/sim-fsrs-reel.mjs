// Simulation (lecture seule) : première note FSRS sur les vraies cartes converties (S = intervalle, D = D0(Good)).
// Hors app : lancer depuis un dossier où ts-fsrs@5.4.2 est installé (npm i ts-fsrs@5.4.2), avec le dossier de sauvegarde en argument.
import { fsrs, generatorParameters, createEmptyCard, Rating, State } from 'ts-fsrs';
import { readFileSync } from 'node:fs';
const B = process.argv[2];
const q = JSON.parse(readFileSync(B + '/idb/medrevise-questions/v1.json')).entries.map(e => e[1]);
const f = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: false, enable_short_term: false, learning_steps: [], relearning_steps: [] }));
const DAY = 864e5, midi = (iso) => new Date(iso + 'T12:00:00');
const jours = (a, b) => Math.round((b - a) / DAY);
const rev = q.filter(x => x.type === 'flashcard' && x.learnState === 'review' && x.dueDate && !x.termine);
const groupes = {};
for (const x of rev) {
  const due = midi(x.dueDate), I = x.intervalDays || 1;
  const c = { ...createEmptyCard(due), due, stability: I, difficulty: f.init_difficulty(Rating.Good), state: State.Review, scheduled_days: I, elapsed_days: 0, reps: (x.historique||[]).length, lapses: 0, learning_steps: 0, last_review: new Date(due - I * DAY) };
  if (+c.due !== +due) throw new Error('due modifié');
  const k = I; const g = groupes[k] ||= { n: 0 };
  g.n++;
  for (const [nom, r] of [['Again', Rating.Again], ['Hard', Rating.Hard], ['Good', Rating.Good], ['Easy', Rating.Easy]]) g[nom] = jours(due, f.next(c, due, r).card.due);
  g.sm2 = { Rate: 1, Difficile: Math.max(I + 1, Math.round(I * 1.3)), Facile: Math.min(90, Math.max(I + 1, Math.round(I * 2.5))) };
}
console.log('| intervalle actuel | cartes | FSRS Again | Hard | Good | Easy | maison Raté | Difficile | Facile |\n|---|---|---|---|---|---|---|---|---|');
for (const [k, g] of Object.entries(groupes).sort((a, b) => a[0] - b[0])) console.log(`| ${k} j | ${g.n} | ${g.Again} | ${g.Hard} | ${g.Good} | ${g.Easy} | ${g.sm2.Rate} | ${g.sm2.Difficile} | ${g.sm2.Facile} |`);
console.log('cartes en révision converties :', rev.length, '— due conservé à l\'identique pour toutes');
