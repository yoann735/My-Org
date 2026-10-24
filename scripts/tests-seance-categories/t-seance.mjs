// (24/10) LANCEMENT PAR CATÉGORIES + CYCLE DES NOUVELLES, sur la copie des vraies données (profil isolé, sans cloud).
// Ordinateur (Réviser) ou téléphone (accueil) : node t-seance.mjs [W H]
//  1. chaque combinaison de cases × maximums : en-tête « N cartes » = somme des min(dispo, max), séance composée
//     dans l'ordre Retard → Révisions → Nouvelles, retards triés du plus au moins en retard ;
//  2. raccourcis « Bloc nouvelles » / « Révisions J » ; dernier choix mémorisé (rechargement) ;
//  3. bloc Nouvelles : recto → retourner → 2 boutons seulement ; Garder → revient au bloc suivant ; Passer → J0 =
//     aujourd'hui, due demain (Révisions de demain), FSRS ombre initialisé, événement journalisé ;
//  4. Révisions J : 4 boutons, une note → date des J avancée, entrée de journal (note), FSRS ombre mis à jour.
import { banc } from './commun.mjs';
const W = +(process.argv[2] || 1440), H = +(process.argv[3] || 900);
const tel = W < 760;
const suffixe = tel ? '-mobile' : '';
const b = await banc(W, H);
await b.ouvrirApp();
if (!tel) await b.reviser(); else await b.attendre(`!!document.querySelector('[data-sfa="lanceur"]')`, 20000);
const MOD = { cat: b.mod('categoriesFC.js'), plan: b.mod('planning.js'), sm2: b.mod('sm2.js'), jr: b.mod('journal.js') };
const AUJ = await b.ev(`(async () => ${MOD.sm2}.todayISO())()`);
const DEMAIN = await b.ev(`(async () => { const d = new Date(${JSON.stringify(AUJ)} + 'T12:00:00'); d.setDate(d.getDate() + 1); return ${MOD.sm2}.isoDate(d); })()`);
// séance écrite par le lanceur au clic sur Démarrer
const seance = () => b.ev(`(async () => (await ${b.mod('storage.js')}.getMeta('seanceFC')) || null)()`);
const quitter = async () => { await b.toucher(`document.querySelector('.sfc-quitter')`, 900); if (!tel) await b.reviser(); else await b.attendre(`!!document.querySelector('[data-sfa="lanceur"]')`); };
const l0 = await b.lanceur();
b.ok(l0 && l0.nouvelles.n > 0 && l0.revisions.n >= 0 && l0.retard.n > 0, `lanceur : Nouvelles ${l0.nouvelles.n} · Révisions ${l0.revisions.n} · Retard ${l0.retard.n}`, l0.total);
await b.capture('sc-lanceur' + suffixe, tel ? null : await b.ev(`(() => { const r = document.querySelector('[data-sfa="lanceur"]').getBoundingClientRect(); return { x: Math.round(r.x) - 8, y: Math.round(r.y) - 8, width: Math.round(r.width) + 16, height: Math.round(r.height) + 16 }; })()`));
// dates effectives des cartes (pour vérifier l'ordre des retards)
const dates = await b.ev(`(async () => { const P = ${MOD.plan}; const S = ${b.mod('storage.js')}; const o = {}; for (const q of await S.getAll('questions')) o[q.id] = P.nextDate(q); return o; })()`);

// 1. combinaisons
const MAXS = tel ? [5, 'tout'] : [5, 15, 'tout'];
let combos = 0, okCombos = 0;
for (let m = 1; m < 8; m++) {
  for (const max of MAXS) {
    const choix = { nouvelles: !!(m & 1), revisions: !!(m & 2), retard: !!(m & 4) };
    for (const c of ['nouvelles', 'revisions', 'retard']) { await b.cocher(c, choix[c]); await b.maximum(c, max); }
    await b.dormir(150);
    const l = await b.lanceur();
    const att = ['nouvelles', 'revisions', 'retard'].reduce((s, c) => s + (choix[c] ? (max === 'tout' ? l[c].n : Math.min(max, l[c].n)) : 0), 0);
    const total = parseInt(l.total, 10);
    combos++;
    if (!att) { if (b.ok(total === 0 && await b.ev(`document.querySelector('[data-sfa="demarrer"]').disabled`), `combinaison ${JSON.stringify(choix)} max ${max} : 0 carte, Démarrer désactivé`)) okCombos++; continue; }
    await b.toucher(`document.querySelector('[data-sfa="demarrer"]')`, 1200);
    await b.attendre(`!!document.querySelector('.sfc-carte')`, 15000);
    const s = await seance();
    const rang = { retard: 0, revisions: 1, nouvelles: 2 };
    const ordre = s.cartes.map((id) => rang[s.categorie[id]]);
    const blocsOk = ordre.every((v, i) => !i || ordre[i - 1] <= v);
    const ret = s.cartes.filter((id) => s.categorie[id] === 'retard').map((id) => dates[id]);
    const retTrie = ret.every((d, i) => !i || ret[i - 1] <= d);
    const parCat = (c) => s.cartes.filter((id) => s.categorie[id] === c).length;
    const comptes = ['nouvelles', 'revisions', 'retard'].every((c) => parCat(c) === (choix[c] ? (max === 'tout' ? l[c].n : Math.min(max, l[c].n)) : 0));
    const prog = await b.ev(`(document.querySelector('.sfc-prog') || {}).textContent || ''`);
    if (b.ok(total === att && s.cartes.length === att && blocsOk && retTrie && comptes && prog === `1 / ${att}`,
      `combinaison ${['nouvelles', 'revisions', 'retard'].filter((c) => choix[c]).join('+')} max ${max} : ${att} cartes, ordre Retard → Révisions → Nouvelles, retards triés`,
      `en-tête ${l.total} · séance ${s.cartes.length} · ${prog}${ret.length ? ` · retards ${ret[0]} … ${ret[ret.length - 1]}` : ''}`)) okCombos++;
    await quitter();
  }
}
b.ok(okCombos === combos, `${okCombos}/${combos} combinaisons justes`);

// 2. raccourcis + mémorisation
await b.maximum('nouvelles', 5); await b.maximum('revisions', 'tout'); await b.maximum('retard', 10);
await b.toucher(`document.querySelector('[data-raccourci="blocNouvelles"]')`);
let l = await b.lanceur();
b.ok(l.nouvelles.coche && !l.revisions.coche && !l.retard.coche && parseInt(l.total, 10) === Math.min(5, l.nouvelles.n), '« Bloc nouvelles » : Nouvelles seules (maximum 5 conservé)', l.total);
await b.toucher(`document.querySelector('[data-raccourci="revisionsJ"]')`);
l = await b.lanceur();
b.ok(!l.nouvelles.coche && l.revisions.coche && l.retard.coche && parseInt(l.total, 10) === l.revisions.n + Math.min(10, l.retard.n), '« Révisions J » : Révisions + Retard', l.total);
await b.ouvrirApp();
if (!tel) await b.reviser(); else await b.attendre(`!!document.querySelector('[data-sfa="lanceur"]')`, 20000);
const lm = await b.lanceur();
b.ok(!lm.nouvelles.coche && lm.revisions.coche && lm.retard.coche && lm.retard.max === '10' && lm.nouvelles.max === '5', 'dernier choix mémorisé après rechargement', JSON.stringify(lm));

// 3. bloc Nouvelles
await b.toucher(`document.querySelector('[data-raccourci="blocNouvelles"]')`);
await b.toucher(`document.querySelector('[data-sfa="demarrer"]')`, 1200);
await b.attendre(`!!document.querySelector('.sfc-carte')`, 15000);
let s = await seance();
const [id1, id2] = s.cartes;
b.ok(await b.ev(`/Nouvelle/i.test(document.querySelector('.sfc-etiquette').textContent) && !document.querySelector('[data-nouvelle]') && !!document.querySelector('.sfc-carte')`), 'carte nouvelle : recto, « Nouvelle carte », pas encore de bouton');
await b.toucher(`document.querySelector('.sfc-carte')`, 600);
const boutons = await b.ev(`[...document.querySelectorAll('.sfc-bas button')].filter((x) => x.offsetParent).map((x) => x.dataset.nouvelle || x.dataset.note || x.textContent.trim())`);
b.ok(JSON.stringify(boutons) === '["garder","passer"]', 'retournée : DEUX boutons seulement, « Garder en nouvelle » et « Passer en révision »', JSON.stringify(boutons));
await b.capture('sc-carte-nouvelle' + suffixe);
const journalAvant = await b.ev(`(async () => (await ${MOD.jr}.toutLeJournal()).length)()`);
await b.toucher(`document.querySelector('[data-nouvelle="garder"]')`, 900);
const c1 = await b.S(`return await S.getOne('questions', ${JSON.stringify(id1)})`);
b.ok(c1.nouvelle === true && !(c1.historique || []).length, 'Garder : la carte reste Nouvelle, rien n’est écrit');
// carte 2 : Passer
await b.toucher(`document.querySelector('.sfc-carte')`, 600);
await b.toucher(`document.querySelector('[data-nouvelle="passer"]')`, 1200);
const c2 = await b.S(`return await S.getOne('questions', ${JSON.stringify(id2)})`);
b.ok(c2.nouvelle === false && c2.j0Date === AUJ && c2.dueDate === DEMAIN && c2.intervalDays === 1 && !(c2.historique || []).length,
  'Passer en révision : J0 = aujourd’hui, due demain (J1), aucune note inventée', `j0 ${c2.j0Date} · due ${c2.dueDate}`);
b.ok(c2.fsrs && c2.fsrs.state === 0 && c2.fsrs.source === 'nouvelle' && c2.fsrs.due === DEMAIN && c2.fsrs.majLe, 'FSRS ombre initialisé à ce moment (carte neuve, échéance = celle des J)', JSON.stringify({ state: c2.fsrs.state, due: c2.fsrs.due, majLe: c2.fsrs.majLe }));
const ev = await b.ev(`(async () => (await ${MOD.jr}.journalDeCarte(${JSON.stringify(id2)})).pop() || null)()`);
b.ok(ev && ev.rating === null && ev.details.evenement === 'passage_revision' && ev.state_after.dueDate === DEMAIN && (await b.ev(`(async () => (await ${MOD.jr}.toutLeJournal()).length)()`)) === journalAvant + 1,
  'événement journalisé (rating null, details.evenement = passage_revision), une seule entrée', ev && JSON.stringify(ev.details));
const demain = await b.ev(`(async () => { const C = ${MOD.cat}; const P = ${MOD.plan}; const S = ${b.mod('storage.js')}; const q = await S.getOne('questions', ${JSON.stringify(id2)});
  const k = C.categoriser([q], ${JSON.stringify(DEMAIN)}, P.nextDate); const a = C.categoriser([q], ${JSON.stringify(AUJ)}, P.nextDate); return { demain: k.revisions.length, auj: a.revisions.length + a.retard.length + a.nouvelles.length }; })()`);
b.ok(demain.demain === 1 && demain.auj === 0, 'la carte passée sort des Nouvelles et revient demain dans les Révisions (cycle des J)');
await quitter();
const l2 = await b.lanceur();
b.ok(l2.nouvelles.n === l.nouvelles.n - 1, `bloc suivant : Nouvelles disponibles ${l.nouvelles.n} → ${l2.nouvelles.n} (la carte passée en révision n’y est plus)`);
await b.toucher(`document.querySelector('[data-sfa="demarrer"]')`, 1200);
await b.attendre(`!!document.querySelector('.sfc-carte')`, 15000);
s = await seance();
b.ok(s.cartes.includes(id1) && !s.cartes.includes(id2), 'Garder → la carte revient au bloc Nouvelles suivant ; Passer → elle n’y est plus');
await quitter();

// 4. Révisions J : notation à 4 boutons inchangée, J, journal, FSRS ombre
await b.toucher(`document.querySelector('[data-raccourci="revisionsJ"]')`);
await b.maximum('retard', 5);
await b.toucher(`document.querySelector('[data-sfa="demarrer"]')`, 1200);
await b.attendre(`!!document.querySelector('.sfc-carte')`, 15000);
s = await seance();
const idR = s.cartes[0];
const avantR = await b.S(`return await S.getOne('questions', ${JSON.stringify(idR)})`);
b.ok(s.categorie[idR] === 'retard' && /retard/i.test(await b.ev(`document.querySelector('.sfc-etiquette').textContent`)), 'première carte : la plus en retard, étiquette « En retard »', `${avantR.dueDate}`);
await b.toucher(`document.querySelector('.sfc-carte')`, 600);
const quatre = await b.ev(`[...document.querySelectorAll('.sfc-bas [data-note]')].map((x) => x.dataset.note).join(',')`);
b.ok(quatre === '1,2,3,4' && !(await b.ev(`!!document.querySelector('[data-nouvelle]')`)), 'Retard / Révisions : les 4 boutons de notation (À revoir · Difficile · Correct · Facile)');
const prevu = await b.ev(`(document.querySelector('.sfc-bas [data-note="3"]') || {}).innerText || ''`);
await b.toucher(`document.querySelector('.sfc-bas [data-note="3"]')`, 1200);
const apresR = await b.S(`return await S.getOne('questions', ${JSON.stringify(idR)})`);
const attendu = await b.ev(`(async () => { const q = ${JSON.stringify(avantR)}; return ${MOD.sm2}.advanceQuestion(q, 5).dueDate; })()`);
const evR = await b.ev(`(async () => (await ${MOD.jr}.journalDeCarte(${JSON.stringify(idR)})).sort((a, c) => (a.reviewed_at < c.reviewed_at ? -1 : 1)).pop())()`);
b.ok(apresR.dueDate === attendu && apresR.historique.length === avantR.historique.length + 1, `« Correct » : date des J = moteur maison inchangé (${avantR.dueDate} → ${apresR.dueDate})`, prevu.replace(/\s+/g, ' '));
b.ok(evR && evR.rating === 3 && evR.planificateur === 'maison' && apresR.fsrs && apresR.fsrs.source === 'reponse' && apresR.fsrs.majLe > (avantR.fsrs ? avantR.fsrs.majLe || '' : ''), 'journal (note 3, planificateur maison = interrupteur OFF) et FSRS ombre mis à jour');
await quitter();
b.ok(b.erreurs.length === 0, 'aucune erreur JS', b.erreurs.slice(0, 3).join(' | '));
process.exit(0);
