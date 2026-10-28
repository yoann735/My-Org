// SÉLECTION LIBRE : 3 cartes cochées, changement de filtre, 2 de plus → 5 ; case d'un cours filtré → toutes ses cartes
// (« dont N hors filtre ») ; état partiel ; survit à la recherche et à la vue ; Lancer sur la sélection ; Vider.
// Indépendance : planification, cartes, journal, séance identiques avant / après. node t-selection.mjs [tel]
import { appareil } from './commun.mjs';
const tel = process.argv[2] === 'tel';
const b = await appareil(tel); const v = b.v; const nom = tel ? 'tel' : 'ordi';
await b.reinitApprentissage();
const avant = await b.empreinte();
// 1) filtre Néphro-cardio : cocher 3 cartes
await b.filtreMatieres(['Néphro-cardio']); await b.deplier();
v(await b.compteur() === 20, `filtre Néphro-cardio : ${await b.compteur()} cartes`);
for (const id of ['c1-rev1', 'c1-rev2', 'c2-retard1']) await b.cocherCarte(id);
let s = await b.selection();
v(s && s.n === 3 && s.hors === 0, `3 cartes cochées → barre « ${s && s.texte} »`);
await b.capture(`sel-${nom}-3`);
// 2) autre filtre (Pneumo) : la sélection reste, 2 cartes de plus → 5
await b.filtreMatieres(['Pneumo']); await b.deplier();
s = await b.selection();
v(s && s.n === 3 && s.hors === 3, `changement de filtre : sélection conservée (${s && s.texte})`);
for (const id of ['c3-rev1', 'c3-nouv1']) await b.cocherCarte(id);
s = await b.selection();
v(s && s.n === 5 && s.hors === 3, `2 de plus → 5 sélectionnées dont 3 hors filtre (« ${s && s.texte} »)`);
// recherche et vue : rien ne bouge
await b.taper(`document.querySelector('.alib2-recherche input')`, 'nouv');
s = await b.selection(); v(s && s.n === 5, `recherche « nouv » : toujours 5 (${s && s.texte})`);
await b.taper(`document.querySelector('.alib2-recherche input')`, '');
if (!tel) { await b.toucher(`document.querySelector('.alib2-vue[aria-label="Vue liste compacte"]')`, 400); s = await b.selection(); v(s && s.n === 5, `vue liste : toujours 5`); await b.toucher(`document.querySelector('.alib2-vue[aria-label="Vue grille"]')`, 400); }
// 3) case d'un cours dont une partie est masquée : filtre Pneumo + Nouvelles → 3 cartes visibles de Cours 3, case → ses 10 cartes
await b.puce('nouvelles'); await b.deplier();
v(await b.compteur() === 3, `Pneumo + Nouvelles : ${await b.compteur()} cartes visibles`);
v(await b.etatCours('f3') === 'partiel', `case du Cours 3 : état partiel (2 sur 10 cochées) → ${await b.etatCours('f3')}`);
const titre = await b.ev(`document.querySelector('.alib2-cours[data-cours="f3"] [data-case-groupe]').title`);
v(/10 cartes.*dont 7 masquées/.test(titre), `infobulle de la case : « ${titre} »`);
await b.toucher(`document.querySelector('.alib2-cours[data-cours="f3"] [data-case-groupe] input')`, 400);
s = await b.selection();
v(s && s.n === 13 && s.hors === 10, `case du cours filtré → toutes ses cartes : « ${s && s.texte} »`);
v(/13 cartes sélectionnées dont 10 hors filtre/.test(s && s.texte), 'libellé « 13 cartes sélectionnées dont 10 hors filtre »');
v(await b.etatCours('f3') === 'tout', `case du Cours 3 : cochée (${await b.etatCours('f3')})`);
await b.capture(`sel-${nom}-cours-filtre`);
// 4) matière : état partiel puis tout
await b.puce('nouvelles'); await b.filtreMatieres([]); await b.deplier();
v(await b.etatMatiere('mA') === 'partiel', `matière Néphro-cardio : état partiel (3 sur 20) → ${await b.etatMatiere('mA')}`);
v(await b.etatCours('f1') === 'partiel' && await b.etatCours('f4') === 'aucun', `cours 1 partiel, cours 4 vide`);
await b.toucher(`document.querySelector('.alib2-matiere[data-matiere="mA"] > .alib2-gtete [data-case-groupe] input')`, 400);
s = await b.selection();
v(s && s.n === 30 && await b.etatMatiere('mA') === 'tout', `case de la matière → ses 20 cartes : ${s && s.n} sélectionnées`);
await b.toucher(`document.querySelector('.alib2-matiere[data-matiere="mA"] > .alib2-gtete [data-case-groupe] input')`, 400);
s = await b.selection();
v(s && s.n === 10 && await b.etatMatiere('mA') === 'aucun', `re-clic → la matière se décoche : ${s && s.n} sélectionnées (Cours 3 seul)`);
await b.capture(`sel-${nom}-partiel`);
// 5) Lancer sur la sélection (10 cartes du Cours 3) depuis la barre, et le bouton principal la suit
const lib = await b.ev(`document.querySelector('.alib-lancer[data-lancer]').dataset.lancer + ' ' + document.querySelector('.alib-lancer[data-lancer]').textContent`);
v(/^selection\s+Lancer \(10\)/.test(lib), `bouton Lancer principal : « ${lib} »`);
await b.toucher(`document.querySelector('[data-act="lancer-selection"]')`, 900);
const prog = await b.ev(`(document.querySelector('.sfc-prog') || {}).textContent || ''`);
const premiere = await b.ev(`(document.querySelector('.sfc-carte[data-carte]') || {}).dataset?.carte || ''`);
v(/0 \/ 10 sues/.test(prog) && premiere.startsWith('c3-'), `session lancée sur la sélection : « ${prog} », 1re carte ${premiere}`);
await b.capture(`sel-${nom}-session`);
await b.toucher(`document.querySelector('.sfc-quitter')`, 800);
// 6) Vider
s = await b.selection(); v(s && s.n === 10, 'retour au tableau de bord : sélection toujours là');
await b.toucher(`document.querySelector('[data-act="vider-selection"]')`, 400);
s = await b.selection();
const lib2 = await b.ev(`document.querySelector('.alib-lancer[data-lancer]').dataset.lancer + ' ' + document.querySelector('.alib-lancer[data-lancer]').textContent`);
const totalBase = await b.S(`return (await S.getAll('questions')).filter((q) => q.type === 'flashcard' && !q.ephemeral).length`);
v(s === null && new RegExp('^visibles\\s+Lancer \\(' + totalBase + '\\)').test(lib2), `Vider : barre retirée, Lancer revient aux ${totalBase} cartes visibles (« ${lib2} »)`);
// 7) indépendance
const apres = await b.empreinte();
v(JSON.stringify(avant) === JSON.stringify(apres), 'planification, cartes, journal et séance identiques avant / après', JSON.stringify(apres));
b.fin();
