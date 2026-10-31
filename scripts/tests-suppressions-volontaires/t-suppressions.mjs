// Banc « suppressions volontaires et contrôle d'intégrité » (31/10, docs/diagnostic-elements-manquants.md).
// Vite :5302 SANS Supabase (launch.json « medrevise-banc ») + Chrome headless isolé 9337, profil neuf : jamais le vrai
// cloud. Jeu : tests-par-cours-elements/seed.mjs. Scénario :
//  1. référence du contrôle = l'état actuel, datée d'HIER ;
//  2. suppression d'une carte d'un VRAI clic (panneau du cours › Flashcards › corbeille › Supprimer) → registre écrit,
//     contrôle relancé : AUCUNE alerte, « 1 carte supprimée par toi » ;
//  3. disparition NON manuelle simulée (copie de données sans une carte : effacement direct d'IndexedDB, sans passer
//     par l'interface ni par le registre) → alerte rouge avec CETTE carte seulement ;
//  4. les 12 suppressions du 26–28/10 dans une référence ancienne → aucune alerte.
import { banc, COURS } from '../tests-par-cours-elements/commun.mjs';
const b = await banc(false);
const v = (c, m, d = '') => b.v(c, m, d);
const hier = await b.S(`const sm2=await import('/src/medrevise/lib/sm2.js');const d=new Date(sm2.todayISO()+'T12:00:00');d.setDate(d.getDate()-1);return d.toLocaleDateString('fr-CA')`);
const reference = (extra = '[]') => b.S(`const {instantane}=await import('/src/medrevise/integrite/controle.js');
  const q=[...(await S.getAll('questions')), ...${extra}];
  await S.setMeta('integrite.instantanes',{precedent:null,courant:instantane(q,${JSON.stringify(hier)})});return q.length`);
const controle = () => b.S(`const E=await import('/src/medrevise/integrite/executer.js');const r=await E.lancerControle({avecCloud:false});
  return {baisse:r.baisse,volontaires:r.suppressionsVolontaires,ok:r.ok}`);
const bandeau = () => b.ev(`(document.querySelector('[data-testid="bandeau-baisse"]')||{}).textContent||''`);

// 1. référence d'hier
const n0 = await reference();
v(n0 > 0, 'référence d’hier posée', n0 + ' questions');

// 2. suppression d'un vrai clic
v(await b.ouvrirCours(COURS[0], { recharger: true }), 'cours ouvert : ' + COURS[0]);
await b.ongletFlashcards();
const cible = await b.ev(`(document.querySelector('.pis-item[data-item]')||{dataset:{}}).dataset.item||null`);
v(!!cible, 'une carte dans la liste', cible);
await b.survol(b.carteListe(cible));
const pCorbeille = await b.rect(`${b.carteListe(cible)}.querySelector('[data-act="supprimer"]')`);
for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type, x: pCorbeille.x + pCorbeille.w / 2, y: pCorbeille.y + pCorbeille.h / 2, button: 'left', clickCount: 1 });
await b.dormir(600);
const pOk = await b.rect(`[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Supprimer' && x.closest('.day-pop'))`);
v(!!pOk, 'confirmation « Supprimer cet item ? » affichée');
for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type, x: pOk.x + pOk.w / 2, y: pOk.y + pOk.h / 2, button: 'left', clickCount: 1 });
await b.dormir(1200);
v(!(await b.S(`return await S.getOne('questions', ${JSON.stringify(cible)})`)), 'carte supprimée de la base');
const reg = await b.S(`return (await S.getSuppressionsVolontaires()).map(r=>({id:r.id,e:r.entrees[${JSON.stringify(cible)}]||null}))`);
v(reg.length === 1 && reg[0].e && reg[0].e.origine === 'suppression d’une carte', 'registre : suppression notée comme volontaire', JSON.stringify(reg));
let r = await controle();
v(!r.baisse && r.volontaires === 1, 'contrôle : AUCUNE alerte, 1 suppression volontaire', JSON.stringify(r));
await b.dormir(400);
v(!(await bandeau()), 'aucun bandeau rouge');

// 3. disparition non manuelle simulée : effacement direct d'IndexedDB (comme une copie de données sans cette carte)
const perdue = await b.S(`const {del,createStore}=await import('/node_modules/.vite/deps/idb-keyval.js');
  const q=(await S.getAll('questions')).find(x=>x.type==='flashcard'&&x.id!==${JSON.stringify(cible)});await del(q.id,createStore('medrevise-questions','v1'));return q.id`);
r = await controle();
v(r.baisse && r.baisse.total === 1 && r.baisse.idsManquants[0] === perdue && r.baisse.parType.flashcard === 1, 'disparition non manuelle → ALERTE avec cette seule carte', JSON.stringify(r.baisse));
v(r.volontaires === 1, 'la suppression manuelle reste à part (non signalée)', String(r.volontaires));
await b.dormir(400);
const t = await bandeau();
v(/1 carte disparue sans suppression de ta part/.test(t), 'bandeau rouge affiché', t);

// 4. les 12 suppressions confirmées du 26–28/10, dans une référence ancienne
await b.S(`const {SUPPRESSIONS_CONFIRMEES}=await import('/src/medrevise/integrite/suppressions.js');return 1`);
await reference(`(await import('/src/medrevise/integrite/suppressions.js')).SUPPRESSIONS_CONFIRMEES.ids.map(id=>({id,type:'flashcard'}))`);
r = await controle();
v(!r.baisse && r.volontaires === 12, 'les 12 suppressions confirmées ne sont plus signalées', JSON.stringify(r));
b.fin();
