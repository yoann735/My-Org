// Changements détectés sur 7 jours (horaire, salle, annulation) : ligne discrète cliquable, avant → après.
import { ouvrir, hp, forcerServeur } from './commun-edt.mjs';

const DIMANCHE_2000 = '2026-10-18T18:00:00Z'; // dimanche 18/10 20:00 Bruxelles : la semaine du 19 dans les 7 jours
await hp('/__version?v=1'); await forcerServeur();
const b = await ouvrir({ date: DIMANCHE_2000 });
await b.reinit({ mode: 'ecole' }); await b.recharger(); await b.accueil(); await b.attendreEcole();
b.ok(!(await b.ev(`!!document.querySelector('.edt-changements')`)), 'version 1 : aucun changement signalé');
await b.clic(await b.pos(`document.querySelector('.edt-nav .weeknav button[title="Semaine suivante"]')`, false), { att: 400 });

// Hyperplanning publie une nouvelle version (horaire, salle, annulation)
await hp('/__version?v=2'); await forcerServeur();
await b.clic(await b.pos(`document.querySelector('.edt-actualiser')`, false), { att: 400 }); await b.attendreEcole(); await b.attendre(`document.querySelector('.edt-changements')`, 4000);
const ligne = await b.ev(`(()=>{const e=document.querySelector('.edt-changements .edt-ligne');return e?e.textContent.trim():null})()`);
b.ok(ligne === '3 changements cette semaine', 'ligne discrète « 3 changements cette semaine »', ligne);
b.ok(await b.ev(`document.querySelector('.edt-changements .edt-ligne').classList.contains('nouveau')`), 'changements non vus mis en évidence (accent)');
await b.clic(await b.pos(`document.querySelector('.edt-changements .edt-ligne')`, false), { att: 500 });
const liste = await b.ev(`[...document.querySelectorAll('.edt-chg-liste li')].map(li=>li.innerText.replace(/\\n/g,' / '))`);
console.log('   ' + liste.join('\n   '));
b.ok(liste.some((x) => /^Physiologie humaine · lun\. 19 oct\. \/ 13:45–15:45 → 14:30–16:30$/.test(x)), 'horaire : 13:45–15:45 → 14:30–16:30');
b.ok(liste.some((x) => /^Psychologie de la santé · mer\. 21 oct\. \/ Annulé$/.test(x)), 'annulation');
b.ok(liste.some((x) => /^Anglais médical · ven\. 23 oct\. \/ A01 · Montignies → A03 · Montignies$/.test(x)), 'salle : A01 → A03');
await b.png('edt-changement', '.edt-carte');
const cartes = await b.cartes();
b.ok(/Modifié/.test(cartes.find((x) => x.t === 'Physiologie humaine' && x.jour.startsWith('lundi')).h) && /14:30–16:30/.test(cartes.find((x) => x.t === 'Physiologie humaine' && x.jour.startsWith('lundi')).h), 'carte : nouvel horaire + badge « Modifié »');
b.ok(/Annulé/.test(cartes.find((x) => x.t === 'Psychologie de la santé').h), 'carte : badge « Annulé »');
// ouvert une fois → plus en accent ; toujours là après rechargement
await b.recharger(); await b.accueil(); await b.attendreEcole(); await b.dormir(400);
b.ok(await b.ev(`(()=>{const e=document.querySelector('.edt-changements .edt-ligne');return !!e && !e.classList.contains('nouveau') && e.textContent.trim()==='3 changements cette semaine'})()`), 'après rechargement : toujours listés, marqués vus');
b.ok(b.erreurs.length === 0, '0 erreur console', b.erreurs.join(' | '));
b.c.fermer();

// une semaine plus tard, les changements passés disparaissent
const b2 = await ouvrir({ date: '2026-10-26T08:00:00Z' });
b2.ok(!(await b2.ev(`!!document.querySelector('.edt-changements')`)), 'lundi suivant : changements passés retirés');
b2.c.fermer();
// retour à la version 1, cache du banc remis à zéro
await hp('/__version?v=1'); await forcerServeur();
const b3 = await ouvrir({ date: DIMANCHE_2000 }); await b3.reinit({ mode: 'ecole' }); b3.c.fermer();
