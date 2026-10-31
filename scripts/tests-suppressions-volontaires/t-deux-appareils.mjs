// Banc « suppressions volontaires entre deux appareils » (31/10, docs/diagnostic-elements-manquants.md). Cas réel du
// 26–28/10 : la carte est supprimée sur un appareil, l'alerte apparaissait sur un AUTRE (qui ne reçoit qu'une tombstone).
// Installation (profils NEUFS, jamais le vrai cloud) : faux Supabase :54399 (JOURNAL=1 CONTRAINTE_RATING=0), Vite :5300
// (VITE_SUPABASE_URL=http://localhost:54399, launch.json « medrevise-faux-cloud »), Chrome headless A 9335 (ordinateur)
// et B 9336 (téléphone) sur http://localhost:5300/. Jeu : ../tests-selection-passages/seed.mjs.
//  1. B pose sa référence « d'hier » ;
//  2. A supprime une carte par le chemin de l'interface (registre puis remove, comme ctx.deleteQuestion) → B se synchronise :
//     la carte disparaît, AUCUNE alerte, 1 suppression volontaire reconnue (registre reçu par la synchro) ;
//  3. A efface une autre carte SANS passer par l'interface (tombstone seule, comme un bug de synchro/migration) → B : ALERTE ;
//  4. A = B = cloud (empreintes), aucune erreur console.
import { appareil } from '../tests-synchro-affichage/commun.mjs';
const A = await appareil(false); const B = await appareil(true); const v = B.v;
const ST = `(await import('/src/medrevise/lib/syncStatus.js'))`;
const empreintes = (b) => b.ev(`(async () => { const s = ${ST}; const l = await s.etatLocal(); const c = await s.etatCloud(); return { local: l.hash, cloud: c && c.hash }; })()`);
const synchro = async (b) => { await b.S(`await S.syncNow(); return 1`); await b.dormir(800); await b.S(`await S.syncNow(); return 1`); };
const controle = (b) => b.S(`const E=await import('/src/medrevise/integrite/executer.js');const r=await E.lancerControle({avecCloud:false});return {baisse:r.baisse,volontaires:r.suppressionsVolontaires}`);
const hier = await B.S(`const sm2=await import('/src/medrevise/lib/sm2.js');const d=new Date(sm2.todayISO()+'T12:00:00');d.setDate(d.getDate()-1);return d.toLocaleDateString('fr-CA')`);
for (const x of [A, B]) await synchro(x);

// 1. référence d'hier sur B
const [x, y] = await B.S(`const q=(await S.getAll('questions')).filter(q=>q.type==='flashcard').map(q=>q.id).sort();return [q[0],q[1]]`);
const nB = await B.S(`const {instantane}=await import('/src/medrevise/integrite/controle.js');const q=await S.getAll('questions');
  await S.setMeta('integrite.instantanes',{precedent:null,courant:instantane(q,${JSON.stringify(hier)})});return q.length`);
v(nB > 0 && x && y, 'B : référence d’hier posée', `${nB} questions, cartes ${x} / ${y}`);

// 2. suppression volontaire sur A (même séquence que ctx.deleteQuestion)
await A.S(`const q=await S.getOne('questions',${JSON.stringify(x)});await S.noterSuppressionsVolontaires([q],'suppression d’une carte');await S.remove('questions',q.id);return 1`);
await synchro(A); await synchro(B);
v(!(await B.S(`return await S.getOne('questions',${JSON.stringify(x)})`)), 'B : la carte supprimée sur A a disparu (tombstone reçue)');
const regB = await B.S(`return (await S.getSuppressionsVolontaires()).filter(r=>r.entrees&&r.entrees[${JSON.stringify(x)}]).map(r=>r.id)`);
v(regB.length === 1 && /^suppressionsVolontaires:ordinateur:/.test(regB[0]), 'B : registre de A reçu par la synchro', JSON.stringify(regB));
let r = await controle(B);
v(!r.baisse && r.volontaires === 1, 'B : AUCUNE alerte, 1 suppression volontaire', JSON.stringify(r));

// 3. disparition non manuelle sur A (tombstone sans registre)
await A.S(`await S.remove('questions',${JSON.stringify(y)});return 1`);
await synchro(A); await synchro(B);
v(!(await B.S(`return await S.getOne('questions',${JSON.stringify(y)})`)), 'B : la carte effacée hors interface a disparu');
r = await controle(B);
v(r.baisse && r.baisse.total === 1 && r.baisse.idsManquants[0] === y, 'B : ALERTE pour la disparition non expliquée, et elle seule', JSON.stringify(r));

// 4. alignement
const eA = await empreintes(A); const eB = await empreintes(B);
v(eA.local === eB.local && eA.local === eA.cloud && eB.cloud === eA.cloud, 'A = B = cloud', JSON.stringify({ eA, eB }));
B.fin();
