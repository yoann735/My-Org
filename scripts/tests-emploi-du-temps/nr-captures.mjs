// Non-régression au pixel (Accueil, calendrier des J, séance) : captures sous l'étiquette argv[2].
// Rejouer avec le code d'avant (git checkout <ancien> -- src/medrevise src/styles) puis comparer (nr-comparer.mjs).
import { ouvrir } from './commun-edt.mjs';
const lab = process.argv[2];
let b = await ouvrir({});
await b.ev(`localStorage.setItem('medrevise.accueil.calendrier',JSON.stringify('j'));1`);
await b.recharger(); await b.accueil(); await b.dormir(1500);
await b.png(`nr-${lab}-grille`, '.wcal-grid');
await b.png(`nr-${lab}-serie`, '.today-cta');
await b.png(`nr-${lab}-legende`, '.jcal-legend');
await b.png(`nr-${lab}-droite`, '.dash-grid > .dash-grid-col:last-child');
// jour du calendrier → fenêtre du jour
const jour = await b.pos(`[...document.querySelectorAll('.wcal-grid .wcal-day')].find(d=>!d.disabled)`, false);
if (jour) { await b.clic(jour, { att: 900 }); await b.png(`nr-${lab}-jour`, '.day-pop'); await b.T.Escape(); }
console.log(lab, 'ordinateur ok', b.erreurs.length ? b.erreurs : '');
b.c.fermer();
b = await ouvrir({ W: 390, H: 844, tactile: true });
await b.dormir(1200);
await b.png(`nr-${lab}-m-hero`, '.mrm-hero');
const s = await b.ev(`!!document.querySelector('.mrm-scroll > *')`);
if (s) await b.png(`nr-${lab}-m-seance`, '.mrm-scroll > :first-child');
console.log(lab, 'téléphone ok', b.erreurs.length ? b.erreurs : '');
b.c.fermer();
