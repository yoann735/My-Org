// (17/10) Emploi du temps « École » : le calendrier HORAIRE (components/GrilleEcole.jsx), semaine 1BKINE12 v3
// (v1 + chevauchement du mardi, cours du soir jusqu'à 20:30, samedi). Ordinateur, tablette, téléphone.
import { ouvrir, hp, forcerServeur } from './commun-edt.mjs';
await hp('/__version?v=3'); await forcerServeur();
const MARDI_1015 = '2026-10-20T08:15:00Z'; // mardi 20/10 10:15 à Bruxelles : TP de kiné ET remédiation en cours
let b = await ouvrir({ date: MARDI_1015 });
await b.reinit({ mode: 'ecole' }); await b.ev(`localStorage.removeItem('medrevise.edt.vue');1`); await b.recharger(); await b.accueil(); await b.attendreEcole(); await b.dormir(600);
const zone = () => b.ev(`(()=>{const z=document.querySelector('.edtg-zone');return {debut:+z.dataset.debut,fin:+z.dataset.fin,cols:[...document.querySelectorAll('.edtg-jour-tete')].map(x=>x.innerText.replace(/\\s+/g,' ').trim()),vue:document.querySelector('.edtg').dataset.vue,wk:document.querySelector('.edtg-nav .wk').innerText}})()`);
let z = await zone();
b.ok(z.vue === 'semaine' && z.cols.join(',') === 'LUN 19,MAR 20,MER 21,JEU 22,VEN 23,SAM 24', 'ordinateur : vue Semaine, lun→ven + samedi (il y a cours)', z.cols.join(','));
b.ok(z.debut === 7 && z.fin === 22, 'heures : premier cours 08:30 − 1 h → dernier 20:30 + 1 h (7 h–22 h)', `${z.debut} h–${z.fin} h`);
const pxH = await b.ev(`parseFloat(getComputedStyle(document.querySelector('.edtg-zone')).getPropertyValue('--px-h'))`);
let c = await b.cartes();
const du = (j) => c.filter((x) => (x.jour || '').startsWith(j));
const lun = du('lundi');
b.ok(lun.map((x) => x.h).join(' | ') === '08:30–10:30 | 10:45–12:45 | 13:45–15:45', 'lundi : 3 cours à leur place', lun.map((x) => x.h).join(' | '));
b.ok(Math.abs(lun[0].top - 1.5 * pxH) < 1 && Math.abs(lun[0].haut - (2 * pxH - 2)) < 1, 'hauteur exacte : 08:30 → top 1,5 h, 2 h de cours = 2 h de grille', `top ${lun[0].top}, h ${lun[0].haut}, ${pxH} px/h`);
const trou = lun[1].top - (lun[0].top + lun[0].haut);
b.ok(trou >= 0.25 * pxH - 0.5, 'trous visibles : la pause de 15 min (10:30–10:45) et le midi restent vides', `${trou.toFixed(1)} px`);
const mar = du('mardi').filter((x) => !/annule/.test(x.cls));
const kine = mar.find((x) => /Kinésithérapie/.test(x.t)), rem = mar.find((x) => /Remédiation/.test(x.t));
b.ok(kine && rem && Math.abs(kine.w - rem.w) < 2 && Math.abs(kine.x - rem.x) > kine.w * 0.9, 'chevauchement : TP de kiné et remédiation côte à côte (même largeur)', kine && rem && `${Math.round(kine.x)}/${Math.round(kine.w)} · ${Math.round(rem.x)}/${Math.round(rem.w)}`);
b.ok(/en-cours/.test(kine.cls) && /en-cours/.test(rem.cls), 'cours en cours : les deux cours de 10:15');
b.ok(await b.ev(`getComputedStyle(document.querySelector('.edtg-bloc.en-cours'),'::after').animationName`) === 'edtg-pulse', 'liseré pulsant (animation edtg-pulse)');
b.ok(/annule/.test(du('mardi').find((x) => /Biochimie/.test(x.t)).cls), 'cours annulé : barré, atténué');
const ligne = await b.ev(`(()=>{const l=document.querySelector('.edtg-maintenant');if(!l)return null;return {top:parseFloat(l.style.top),jour:l.closest('.edtg-col').ariaLabel,lbl:document.querySelector('.edtg-maintenant-lbl').innerText}})()`);
b.ok(ligne && Math.abs(ligne.top - 3.25 * pxH) < 1 && ligne.jour.startsWith('mardi') && ligne.lbl === '10:15', 'ligne rouge de l’heure actuelle (mardi 10:15) + heure dans la colonne des heures', JSON.stringify(ligne));
b.ok(await b.ev(`document.querySelector('.edtg-jour-tete.today').innerText.includes('20') && document.querySelector('.edtg-col.today').ariaLabel.startsWith('mardi')`), 'jour actuel surligné (en-tête + colonne)');
const soir = du('jeudi').find((x) => /éthique/.test(x.t));
b.ok(soir && soir.h === '19:00–20:30', 'cours du soir (jeudi 19:00–20:30) dans la grille', soir && soir.h);
const ordre = await b.ev(`(()=>{const g=document.querySelector('.edtg-zone');const l=document.querySelector('.edt-lignes');const a=document.querySelector('.edt-avant');return {lignes:!!(l.compareDocumentPosition(g)&4),avant:!!(a.compareDocumentPosition(g)&4),rappel:!!document.querySelector('.edt-ligne.rappel')}})()`);
b.ok(ordre.lignes && ordre.avant && ordre.rappel, 'prochain cours, changements et rappel du jeudi 16 h au-dessus de la grille', JSON.stringify(ordre));
// collants : en-tête des jours et colonne des heures
await b.ev(`document.querySelector('.edtg-zone').scrollTop=300;1`); await b.dormir(200);
const coll = await b.ev(`(()=>{const z=document.querySelector('.edtg-zone').getBoundingClientRect();const t=document.querySelector('.edtg-tete').getBoundingClientRect();return {tete:Math.round(t.top-z.top),pos:getComputedStyle(document.querySelector('.edtg-heures')).position}})()`);
b.ok(coll.tete <= 1 && coll.pos === 'sticky', 'en-tête des jours collant au défilement, colonne des heures collante', JSON.stringify(coll));
await b.ev(`document.querySelector('.edtg-zone').scrollTop=0;1`);
await b.png('edt-grille-semaine', '.edt-carte');
// fiche détaillée
await b.clic(await b.pos(`[...document.querySelectorAll('.edtg-bloc')].find(e=>/Kinésithérapie/.test(e.dataset.titre))`, false), { att: 500 });
const fiche = await b.ev(`(()=>{const f=document.querySelector('[data-fiche-cours]');return f?f.closest('.day-pop').innerText.replace(/\\s+/g,' '):null})()`);
b.ok(fiche && /Kinésithérapie générale/.test(fiche) && /08:30–12:30/.test(fiche) && /Mme Martin/.test(fiche) && /P1 · Montignies/.test(fiche) && /en cours/i.test(fiche) && /Matière reliée|Aucune matière reliée/.test(fiche), 'tap → fiche détaillée : intitulé, horaire, prof, salle, en cours, matière reliée', fiche);
await b.png('edt-grille-fiche', '.day-pop', 8);
await b.T.Escape(); await b.dormir(300);
// navigation
const nav = async (lbl) => { await b.clic(await b.pos(`document.querySelector('.edtg-nav .weeknav button[aria-label=${JSON.stringify(lbl)}]')`, false), { att: 500 }); return zone(); };
z = await nav('Suivant');
b.ok(z.wk === 'Semaine prochaine' && z.cols.length === 5 && z.cols[0] === 'LUN 26', 'semaine suivante : lun→ven (pas de cours le week-end)', z.cols.join(','));
c = await b.cartes();
b.ok(c.find((x) => x.jour.startsWith('lundi')).h === '08:30–10:30', 'après le changement d’heure (26/10) : lundi 08:30 juste');
await b.clic(await b.pos(`document.querySelector('.edtg-auj')`, false), { att: 500 });
b.ok((await zone()).wk === 'Cette semaine', '« Aujourd’hui » revient à la semaine en cours');
// glissement horizontal au trackpad
await b.c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 700, y: 600, deltaX: 140, deltaY: 0 }); await b.dormir(500);
b.ok((await zone()).wk === 'Semaine prochaine', 'glissement horizontal (trackpad) → semaine suivante');
await b.clic(await b.pos(`document.querySelector('.edtg-auj')`, false), { att: 400 });
// vues
await b.vue('3jours'); await b.dormir(400); z = await zone();
b.ok(z.vue === '3jours' && z.cols.join(',') === 'MAR 20,MER 21,JEU 22', 'vue 3 jours : à partir d’aujourd’hui', z.cols.join(','));
await b.png('edt-grille-3jours', '.edt-carte');
await b.vue('jour'); await b.dormir(400); z = await zone();
b.ok(z.vue === 'jour' && z.cols.length === 1 && z.wk === 'Aujourd’hui', 'vue Jour', z.cols.join(','));
z = await nav('Suivant');
b.ok(z.wk === 'Demain' && z.cols[0] === 'MER 21', 'jour suivant → « Demain »');
await b.vue('semaine'); await b.dormir(300);
b.ok(b.erreurs.length === 0, '0 erreur console', b.erreurs.join(' | '));
b.c.fermer();

// Mes J inchangé : géré par t-ecole.mjs (comparaison au pixel). Ici : tablette et téléphone.
b = await ouvrir({ date: MARDI_1015, W: 820, H: 1180, tactile: true });
await b.ev(`localStorage.removeItem('medrevise.edt.vue');1`); await b.recharger(); await b.accueil(); await b.attendreEcole(); await b.dormir(600);
z = await zone();
b.ok(z.vue === '3jours' && z.cols.length === 3, 'tablette (820 px) : 3 jours par défaut', z.cols.join(','));
const zt = await b.dans(`document.querySelector('.edtg-zone')`, 0.6, 0.5);
await b.doigt([zt[0] + 140, zt[1]], [zt[0] - 140, zt[1] + 5], 8);
b.ok((await zone()).cols[0] === 'VEN 23', 'tablette : glisser vers la gauche → 3 jours suivants', (await zone()).cols.join(','));
await b.clic(await b.pos(`document.querySelector('.edtg-auj')`, false), { att: 400 });
let d = await b.debordement();
b.ok(d.sw <= d.iw && !d.hors.length, 'tablette : rien ne déborde', JSON.stringify(d));
await b.png('edt-grille-tablette', '.edt-carte');
b.c.fermer();

b = await ouvrir({ date: MARDI_1015, W: 390, H: 844, tactile: true });
await b.recharger(); await b.dormir(800);
await b.ev(`document.querySelector('.edt-mobile').scrollIntoView({block:'start'});1`); await b.dormir(300);
z = await zone();
b.ok(z.vue === 'jour' && z.cols.length === 1 && z.wk === 'Aujourd’hui', 'téléphone : vue Jour par défaut');
c = await b.cartes();
b.ok(c.length === 3 && c.filter((x) => /en-cours/.test(x.cls)).length === 2, 'téléphone : les cours du mardi, deux en cours côte à côte', c.map((x) => `${x.h} ${x.t}`).join(' | '));
await b.ev(`document.querySelector('.edtg-nav').scrollIntoView({block:'start'});1`); await b.dormir(300); await b.capture('edt-grille-mobile');
const zm = await b.dans(`document.querySelector('.edtg-zone')`, 0.6, 0.5);
await b.doigt([zm[0] + 120, zm[1]], [zm[0] - 120, zm[1] + 5], 8);
b.ok((await zone()).wk === 'Demain', 'téléphone : glisser → « Demain »');
b.ok(await b.ev(`!!document.querySelector('.edtg-auj')`), 'téléphone : « Aujourd’hui » apparaît dès qu’on quitte aujourd’hui');
await b.tape(await b.dans(`document.querySelector('.edtg-bloc')`, 0.5, 0.5)); await b.dormir(500);
b.ok(await b.ev(`!!document.querySelector('[data-fiche-cours]') && !document.querySelector('[data-fiche-cours] .edt-actions')`), 'téléphone : fiche détaillée (sans Ouvrir/Transcrire : pas de lecteur au téléphone)');
await b.capture('edt-grille-mobile-fiche');
d = await b.debordement();
b.ok(d.sw <= d.iw && !d.hors.length, 'téléphone : rien ne déborde', JSON.stringify(d));
b.ok(b.erreurs.length === 0, '0 erreur console (téléphone)', b.erreurs.join(' | '));
b.c.fermer();
await hp('/__version?v=1'); await forcerServeur();
process.exit(0);
