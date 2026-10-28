// COMPTEUR DE PASSAGES, 2 appareils : session 1 sur A (ordinateur, clavier) → 2 cartes sues → badges ×1 (tableau de bord et
// session) ; synchro → B (téléphone, taps) : badges ×1, session 2 sur B → ×2 ; synchro → A : ×2 ; tri « Moins passées
// d'abord » ; une carte vue mais jamais sue n'a pas de badge. Indépendance : cartes, planification, journal, séance et lignes
// « questions » du faux cloud identiques avant / après ; seul learning_set change. node t-passages.mjs
import { appareil } from './commun.mjs';
const etatCloud = async () => (await fetch('http://localhost:54399/__etat')).json();
const lignesQ = async () => JSON.stringify((await etatCloud()).rows.filter((r) => r.store === 'questions').map((r) => [r.record_id, r.updated_at]).sort());
const A = await appareil(false); const v = A.v;
await A.reinitApprentissage();
const avantA = await A.empreinte(); const avantCloud = await lignesQ();
v(JSON.stringify(await A.passagesBase()) === '{}', 'départ : aucun passage enregistré');
// session 1 (A, clavier) : c1-rev1, c1-rev2 sues ; c1-rev3 « Pas su » puis Skip/fin → vue mais pas sue
for (const id of ['c1-rev1', 'c1-rev2', 'c1-rev3']) await A.cocherCarte(id);
await A.toucher(`document.querySelector('[data-act="lancer-selection"]')`, 900);
const cle = async (key, code, kc) => { await A.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: kc }); await A.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: kc }); await A.dormir(250); };
const courante = (b) => b.ev(`(document.querySelector('.sfc-carte[data-carte]') || {}).dataset?.carte || null`);
const badgeSession = (b) => b.ev(`+((document.querySelector('.alib-etiquette [data-passages]') || {}).dataset || {}).passages || 0`);
let sansBadge = true;
for (let k = 0; k < 12 && await courante(A); k++) {
  const id = await courante(A); if (await badgeSession(A)) sansBadge = false;
  await cle(' ', 'Space', 32);
  if (id === 'c1-rev3') await cle('ArrowLeft', 'ArrowLeft', 37); else await cle('ArrowRight', 'ArrowRight', 39);
  if ((await A.ev(`document.querySelector('.sfc-prog').textContent`)).startsWith('2 / 3')) break;
}
v(sansBadge, 'session 1 : aucune carte n’a de badge avant d’avoir été sue');
const prog = await A.ev(`document.querySelector('.sfc-prog').textContent`);
v(prog.startsWith('2 / 3'), `session 1 : « ${prog} »`);
let p = await A.passagesBase();
v(p['c1-rev1'] === 1 && p['c1-rev2'] === 1 && !p['c1-rev3'], `enregistré dès la validation (avant la fin) : ${JSON.stringify(p)}`);
await A.toucher(`.alib-finir` && `document.querySelector('.alib-finir')`, 500);
await A.capture('pass-ordi-fin-session1');
await A.toucher(`document.querySelector('.sfc-btn.principal')`, 800);
await A.deplier();
let bd = await A.badges();
v(bd['c1-rev1'] === 1 && bd['c1-rev2'] === 1 && !bd['c1-rev3'] && Object.keys(bd).length === 2, `tableau de bord A : badges ${JSON.stringify(bd)} (c1-rev3, vue mais pas sue : aucun)`);
const txt = await A.ev(`document.querySelector('.alib2-carte[data-carte="c1-rev1"] [data-passages]').textContent`);
v(txt === '×1', `libellé du badge : « ${txt} »`);
await A.capture('pass-ordi-badges-x1', { x: 120, y: 200, width: 1300, height: 360 });
await A.synchro(5000);
// B : reçoit ×1, session 2 au doigt sur c1-rev1 et c1-rev2
const B = await appareil(true);
await B.synchro(6000);
await B.reinitApprentissage();
bd = await B.badges();
v(bd['c1-rev1'] === 1 && bd['c1-rev2'] === 1, `B après synchro : ${JSON.stringify(bd)}`);
for (const id of ['c1-rev1', 'c1-rev2']) await B.cocherCarte(id);
await B.toucher(`document.querySelector('[data-act="lancer-selection"]')`, 900);
const b1 = await badgeSession(B);
v(b1 === 1, `session 2 sur B : badge « ×${b1} » sur la carte affichée`);
await B.capture('pass-tel-session-badge');
for (let k = 0; k < 8 && await courante(B); k++) {
  await B.toucher(`document.querySelector('.sfc-carte')`, 450);
  await B.toucher(`document.querySelector('.alib-su')`, 450);
}
const fin = await B.ev(`(document.querySelector('.alib-bilan') || {}).textContent || ''`);
v(/2 cartes vues · 2 sues/.test(fin), `session 2 terminée : « ${fin} »`);
await B.toucher(`document.querySelector('.sfc-btn.principal')`, 800);
await B.deplier();
bd = await B.badges();
v(bd['c1-rev1'] === 2 && bd['c1-rev2'] === 2, `B : ×2 après la 2ᵉ session ${JSON.stringify(bd)}`);
await B.capture('pass-tel-badges-x2');
await B.synchro(5000);
// A reçoit ×2 ; tri « Moins passées d'abord »
await A.synchro(6000); await A.reinitApprentissage();
bd = await A.badges();
v(bd['c1-rev1'] === 2 && bd['c1-rev2'] === 2, `A après synchro : ${JSON.stringify(bd)}`);
const ordre = () => A.ev(`[...document.querySelectorAll('.alib2-cours[data-cours="f1"] .alib2-carte')].map((c) => c.dataset.carte)`);
const o1 = await ordre();
await A.puce('tri');
const o2 = await ordre();
v(o1.indexOf('c1-rev1') < o1.indexOf('c1-rev3') && o2.slice(-2).join() === 'c1-rev1,c1-rev2' && o2.length === 10, `tri « Moins passées d’abord » : les ×2 passent en fin de cours (${o2.slice(-3).join(', ')})`);
await A.capture('pass-ordi-tri', { x: 120, y: 150, width: 1300, height: 420 });
await A.toucher(`document.querySelector('[data-carte="c1-rev3"] .alib2-case input')`, 300);
await A.toucher(`document.querySelector('[data-carte="c1-rev1"] .alib2-case input')`, 300);
await A.toucher(`document.querySelector('[data-act="lancer-selection"]')`, 900);
const prem = await courante(A);
v(prem === 'c1-rev3', `tri actif : la session sur la sélection commence par la moins passée — c1-rev3 (×0) avant c1-rev1 (×2), l’inverse de l’ordre de base (${prem})`);
await A.toucher(`document.querySelector('.sfc-quitter')`, 700);
await A.puce('tri');
// indépendance
const apresA = await A.empreinte();
v(JSON.stringify(avantA) === JSON.stringify(apresA), 'A : cartes, planification, journal, séance identiques avant / après', JSON.stringify(apresA));
const apresB = await B.empreinte();
v(apresB.hCartes === avantA.hCartes && apresB.hJournal === avantA.hJournal, 'B : mêmes cartes et même journal qu’A');
v(await lignesQ() === avantCloud, 'faux cloud : aucune ligne « questions » réécrite (mêmes updated_at)');
const ls = (await etatCloud()).rows.find((r) => r.store === 'learning_set');
v(ls && ls.data.passages['c1-rev1'] === 2 && ls.data.passages['c1-rev2'] === 2, `faux cloud : learning_set.passages = ${JSON.stringify(ls && ls.data.passages)}`);
B.erreurs.forEach((e) => A.erreurs.push('B: ' + e));
A.echecs += B.echecs;
A.fin();
