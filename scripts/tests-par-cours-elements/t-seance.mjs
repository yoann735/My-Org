// « Regrouper par cours » — ordinateur (node t-seance.mjs) ou téléphone (node t-seance.mjs tel). Rejouer seed.mjs avant.
// OFF : ordre d'avant (Retard → Révisions → Nouvelles, cours mélangés) ; ON : cours dans l'ordre de la Bibliothèque,
// catégories dans chaque cours, mêmes cartes, maximums respectés ; nom du cours sur la carte ; intercalaires ; reprise
// après interruption (même ordre) ; notation inchangée (dueDate / historique / journal écrits comme avant).
import { banc, COURS } from './commun.mjs';
const tel = process.argv[2] === 'tel';
const b = await banc(tel);
const sfx = tel ? '-mobile' : '';
const v = b.v;
const parId = Object.fromEntries((await b.S(`return (await S.getAll('questions')).map(q=>[q.id,{f:q.ficheId,d:q.dueDate}])`)));
const titre = { f1: COURS[0], f2: COURS[1], f3: COURS[2], f4: COURS[3] };
const cat = (id) => (/retard/.test(id) ? 'retard' : /rev/.test(id) ? 'revisions' : 'nouvelles');
const cours = (ids) => ids.map((id) => parId[id].f);
const blocs = (ids) => cours(ids).filter((f, i, a) => i === 0 || a[i - 1] !== f);

await b.lanceur();
const l0 = await b.lanceur && await b.ev(`(()=>{const l=document.querySelector('[data-sfa="lanceur"]');const s=l.querySelector('[data-sfa="par-cours"]');const cats=l.querySelector('.sfa-cats');return {sw:s&&s.querySelector('.switch').getAttribute('aria-checked'),sous:!!s&&(cats.compareDocumentPosition(s)&Node.DOCUMENT_POSITION_FOLLOWING)>0,txt:s&&s.textContent}})()`);
v(l0.sw === 'false' && l0.sous, `lanceur : interrupteur « Regrouper par cours » sous les cases, OFF par défaut`, l0.txt);
await b.tout();
await b.capture('pc-lanceur-off' + sfx);

// ---- OFF : ordre actuel ----
await b.toucher(`document.querySelector('[data-sfa="demarrer"]')`, 1500);
let e = await b.seance();
const off = e.cartes;
v(off.length === 40, `OFF : séance de ${off.length} cartes sur 4 cours`);
const ordreCat = off.map(cat);
const rangCat = { retard: 0, revisions: 1, nouvelles: 2 };
v(ordreCat.every((c, i) => i === 0 || rangCat[ordreCat[i - 1]] <= rangCat[c]), 'OFF : Retard → Révisions → Nouvelles, comme avant');
v(blocs(off).length > 4, `OFF : cours mélangés (${blocs(off).length} changements de cours)`);
v(!(await b.ev(`!!document.querySelector('.sfc-cours')`)), 'OFF : pas de nom de cours sur la carte');
await b.toucher(`document.querySelector('.sfc-quitter')`, 1200);

// ---- ON ----
await b.lanceur();
await b.parCours(true);
await b.dormir(300);
await b.capture('pc-lanceur-on' + sfx);
await b.lanceur(); // rechargé : l'interrupteur est mémorisé
v((await b.ev(`document.querySelector('[data-sfa="par-cours"] .switch').getAttribute('aria-checked')`)) === 'true', 'interrupteur mémorisé (après rechargement)');
await b.toucher(`document.querySelector('[data-sfa="demarrer"]')`, 1500);
e = await b.seance();
const on = e.cartes;
v(e.parCours === true && on.length === 40 && [...on].sort().join() === [...off].sort().join(), 'ON : les MÊMES 40 cartes');
v(blocs(on).join(',') === 'f1,f2,f3,f4', `ON : cours d'un seul tenant, dans l'ordre de la Bibliothèque (${blocs(on).map((f) => titre[f]).join(' → ')})`);
let okCat = true, okRetard = true;
for (const f of ['f1', 'f2', 'f3', 'f4']) {
  const ids = on.filter((id) => parId[id].f === f);
  const c = ids.map(cat);
  if (!c.every((x, i) => i === 0 || rangCat[c[i - 1]] <= rangCat[x])) okCat = false;
  const d = ids.filter((id) => cat(id) === 'retard').map((id) => parId[id].d);
  if (d.some((x, i) => i > 0 && d[i - 1] > x)) okRetard = false;
}
v(okCat, 'ON : dans chaque cours, Retard → Révisions → Nouvelles');
v(okRetard, 'ON : Retard du plus en retard au moins en retard');
const premier = await b.ev(`(document.querySelector('.sfc-cours')||{}).textContent`);
v(premier === COURS[0], `ON : nom du cours en haut de la carte (« ${premier} »)`);
await b.capture('pc-carte-cours' + sfx);

// ---- parcours du 1er cours : notation (non-régression), puis intercalaire ----
const avant1 = await b.carteBase(on[0]);
const noter = async () => {
  await b.toucher(`document.querySelector('.sfc-carte')`, 500);
  const nouv = await b.ev(`!!document.querySelector('[data-nouvelle="passer"]')`);
  await b.toucher(nouv ? `document.querySelector('[data-nouvelle="passer"]')` : `[...document.querySelectorAll('.sfc-bas button')].find(x=>/Correct/.test(x.textContent))`, 900);
};
for (let k = 0; k < 10; k++) await noter();
const apres1 = await b.carteBase(on[0]);
v(apres1.dueDate > avant1.dueDate && (apres1.historique || []).length === (avant1.historique || []).length + 1, `notation inchangée : ${on[0]} J ${avant1.dueDate} → ${apres1.dueDate}, historique +1`);
const inter = await b.ev(`(()=>{const x=document.querySelector('.sfc-intercalaire');return x?x.innerText.replace(/\\n+/g,' | '):null})()`);
v(inter && /Cours suivant/i.test(inter) && inter.includes(COURS[1]) && /10 cartes/.test(inter), `intercalaire au changement de cours (« ${inter} »)`);
await b.capture('pc-intercalaire' + sfx);
await b.toucher(`document.querySelector('.sfc-intercalaire')`, 600);
v((await b.ev(`(document.querySelector('.sfc-cours')||{}).textContent`)) === COURS[1] && await b.ev(`!!document.querySelector('.sfc-carte')`), 'intercalaire passé d’un tap : 1re carte du cours suivant');
// ---- interruption au milieu du 2e cours, reprise ----
for (let k = 0; k < 3; k++) await noter();
const avantInt = await b.seance();
await b.lanceur(); // rechargement de la page = interruption
v(await b.ev(`!!document.querySelector('[data-sfa="reprendre"]')`), 'après interruption : « Reprendre la séance commencée »');
await b.toucher(`document.querySelector('[data-sfa="reprendre"]')`, 1500);
const repris = await b.seance();
v(repris.cartes.join() === avantInt.cartes.join() && repris.idx === avantInt.idx && repris.idx === 13, `reprise : même ordre, même position (${repris.idx + 1} / ${repris.cartes.length})`);
v((await b.ev(`(document.querySelector('.sfc-cours')||{}).textContent`)) === COURS[1] && await b.ev(`document.querySelector('.sfc-carte').dataset.carte`) === on[13], `reprise : la carte ${on[13]} du ${COURS[1]}`);
for (let k = 0; k < 7; k++) await noter();
v(await b.ev(`!!document.querySelector('.sfc-intercalaire')`) && (await b.ev(`document.querySelector('.sfc-intercalaire').innerText`)).includes(COURS[2]), `2e intercalaire : « ${COURS[2]} »`);
await b.toucher(`document.querySelector('.sfc-quitter')`, 1200);

// ---- maximums : sur l'ensemble de la séance, mêmes cartes que OFF ----
await b.S(`await S.setMeta('seanceFC', null); return 1`);
await b.lanceur();
await b.maximum('retard', 5); await b.maximum('nouvelles', 5); await b.maximum('revisions', 'tout');
await b.dormir(300);
const tot = await b.ev(`document.querySelector('[data-sfa="total"]').textContent`);
await b.toucher(`document.querySelector('[data-sfa="demarrer"]')`, 1500);
const onMax = (await b.seance()).cartes;
const n = (ids, c) => ids.filter((id) => cat(id) === c).length;
await b.toucher(`document.querySelector('.sfc-quitter')`, 1200);
await b.S(`await S.setMeta('seanceFC', null); return 1`);
await b.lanceur(); await b.parCours(false); await b.dormir(300);
await b.toucher(`document.querySelector('[data-sfa="demarrer"]')`, 1500);
const offMax = (await b.seance()).cartes;
await b.toucher(`document.querySelector('.sfc-quitter')`, 1200);
v(n(onMax, 'retard') <= 5 && n(onMax, 'nouvelles') <= 5 && n(onMax, 'retard') === n(offMax, 'retard') && n(onMax, 'nouvelles') === n(offMax, 'nouvelles'),
  `maximums sur toute la séance : Retard ${n(onMax, 'retard')} (max 5), Nouvelles ${n(onMax, 'nouvelles')} (max 5), Révisions ${n(onMax, 'revisions')} — total annoncé « ${tot} »`);
v([...onMax.filter((id) => cat(id) !== 'revisions')].sort().join() === [...offMax.filter((id) => cat(id) !== 'revisions')].sort().join(), 'maximums : ON et OFF retiennent les mêmes Retard et Nouvelles');
v(blocs(onMax).join(',') === [...new Set(cours(onMax))].sort().join(','), `maximums : toujours groupé par cours (${blocs(onMax).join(' → ')})`);
await b.lanceur(); await b.parCours(false);
await b.S(`await S.setMeta('seanceFC', null); return 1`);
b.fin();
