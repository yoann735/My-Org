// Téléphone (390 × 844, tactile) et tablette (820 × 1180, tactile) : le sélecteur tient dans
// l'en-tête, vue jour par défaut, glissement entre les jours, cartes lisibles, rien ne déborde.
import { ouvrir, hp, forcerServeur } from './commun-edt.mjs';

await hp('/__version?v=1'); await forcerServeur();
const LUNDI_0900 = '2026-10-19T07:00:00Z';
let b = await ouvrir({ date: LUNDI_0900, W: 390, H: 844, tactile: true });
await b.reinit({ mode: 'j' }); await b.recharger();
const voir = () => b.ev(`document.querySelector('.edt-mobile').scrollIntoView({block:'start'});1`);
await voir(); await b.dormir(300);
const tete = await b.ev(`(()=>{const h=document.querySelector('.edt-mobile-head').getBoundingClientRect();const s=document.querySelector('.edt-mobile-head .edt-seg').getBoundingClientRect();return {h:[h.left,h.right,h.height],s:[s.left,s.right,s.top-h.top]}})()`);
b.ok(tete.s[1] <= tete.h[1] + 0.5 && tete.h[2] < 48, 'le sélecteur tient dans l’en-tête du calendrier (une ligne)', JSON.stringify(tete));
b.ok(await b.ev(`!!document.querySelector('.edt-mobile .edt-jour') && document.querySelector('.edt-mobile .wk').textContent==='Aujourd’hui'`), 'Mes J : vue jour par défaut (« Aujourd’hui »)');
await b.capture('edt-mobile-j');
await b.mode('ecole'); await b.attendreEcole(); await voir(); await b.dormir(400);
b.ok(await b.ev(`!!document.querySelector('.edt-mobile .edt-jour') && !document.querySelector('.edt-mobile .edt-grille')`), 'École : vue jour par défaut');
let cc = await b.cartes();
b.ok(cc.map((x) => x.h.slice(0, 11)).join(',') === '08:30–10:30,10:45–12:45,13:45–15:45', 'École : les cours du lundi', cc.map((x) => x.h).join(','));
const lisible = await b.ev(`(()=>{const e=document.querySelector('.edt-mobile .edt-cours');const f=(s)=>parseFloat(getComputedStyle(e.querySelector(s)).fontSize);return {t:f('.edt-t'),h:f('.edt-h'),p:f('.edt-p'),l:f('.edt-l'),w:e.getBoundingClientRect().width}})()`);
b.ok(lisible.t >= 14 && lisible.p >= 12 && lisible.h >= 11 && lisible.w > 300, 'cartes lisibles (intitulé 14 px, détails ≥ 12 px, pleine largeur)', JSON.stringify(lisible));
b.ok(await b.ev(`!document.querySelector('.edt-mobile .edt-actions')`), 'téléphone : pas de bouton Ouvrir/Transcrire (pas de lecteur sur téléphone)');
let d = await b.debordement();
b.ok(d.sw <= d.iw && d.hors.length === 0, 'rien ne déborde', JSON.stringify(d));
await voir(); await b.dormir(200); await b.capture('edt-mobile-ecole');
// glissement entre les jours
const zone = async () => b.dans(`document.querySelector('.edt-mobile .edt-jour-liste')`, 0.5, 0.5);
let z = await zone();
await b.doigt([z[0] + 120, z[1]], [z[0] - 120, z[1] + 6], 8);
b.ok(await b.ev(`document.querySelector('.edt-mobile .wk').textContent`) === 'Demain', 'glisser vers la gauche → « Demain »');
cc = await b.cartes();
b.ok(cc.map((x) => x.t).join(',') === 'Kinésithérapie générale,Biochimie' && /annule/.test(cc[1].cls), 'mardi : pratique + cours annulé');
z = await zone();
await b.doigt([z[0] - 120, z[1]], [z[0] + 120, z[1]], 8); await b.dormir(200);
z = await zone();
await b.doigt([z[0] - 120, z[1]], [z[0] + 120, z[1]], 8);
b.ok(await b.ev(`document.querySelector('.edt-mobile .wk').textContent`) === 'Hier', 'deux glissements vers la droite → « Hier »');
z = await zone();
await b.doigt([z[0], z[1] - 100], [z[0] + 30, z[1] + 100], 8);
b.ok(await b.ev(`document.querySelector('.edt-mobile .wk').textContent`) === 'Hier', 'un défilement vertical ne change pas de jour');
await b.tape(await b.bouton("Aujourd'hui", '.edt-mobile'));
b.ok(await b.ev(`document.querySelector('.edt-mobile .wk').textContent`) === 'Aujourd’hui', '« Aujourd’hui »');
await b.recharger(); await voir();
b.ok(await b.ev(`document.querySelector('.edt-mobile .edt-seg .seg-btn.active').textContent`) === 'École', 'choix mémorisé sur le téléphone');
d = await b.debordement();
b.ok(d.sw <= d.iw, 'aucun défilement horizontal de la page', JSON.stringify(d));
b.ok(b.erreurs.length === 0, '0 erreur console (téléphone)', b.erreurs.join(' | '));
b.c.fermer();

// petit téléphone 320 px
b = await ouvrir({ date: LUNDI_0900, W: 320, H: 640, tactile: true });
await b.ev(`document.querySelector('.edt-mobile').scrollIntoView({block:'start'});1`); await b.dormir(300);
d = await b.debordement();
b.ok(d.sw <= d.iw && d.hors.length === 0, '320 px : rien ne déborde', JSON.stringify(d));
await b.capture('edt-mobile-320');
b.c.fermer();

// tablette portrait : Accueil desktop, grille École
b = await ouvrir({ date: LUNDI_0900, W: 820, H: 1180, tactile: true });
await b.attendreEcole();
const vue = await b.ev(`document.querySelector('.edt-grille') ? 'semaine' : document.querySelector('.edt-carte .edt-jour') ? 'jour' : 'aucune'`);
d = await b.debordement();
b.ok(vue !== 'aucune' && d.sw <= d.iw && d.hors.length === 0, `tablette 820 px : vue ${vue}, rien ne déborde`, JSON.stringify(d));
await b.png('edt-tablette', '.edt-carte');
b.ok(b.erreurs.length === 0, '0 erreur console (tablette)', b.erreurs.join(' | '));
b.c.fermer();
// tablette paysage / fenêtre étroite d'ordinateur : vue jour sous 640 px de carte
b = await ouvrir({ date: LUNDI_0900, W: 1000, H: 800 });
await b.attendreEcole();
const larg = await b.ev(`document.querySelector('.edt').getBoundingClientRect().width`);
const vue2 = await b.ev(`document.querySelector('.edt-grille') ? 'semaine' : 'jour'`);
b.ok((larg < 640) === (vue2 === 'jour'), `fenêtre 1 000 px : carte de ${Math.round(larg)} px → vue ${vue2}`);
d = await b.debordement();
b.ok(d.sw <= d.iw && d.hors.length === 0, 'fenêtre 1 000 px : rien ne déborde', JSON.stringify(d));
b.c.fermer();
