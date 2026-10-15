// Mode « Les deux » (côte à côte) RETIRÉ : plus de bouton ni de panneau, raccourci et code supprimés ;
// un ancien réglage « Les deux » retombe sur « Original », sans message. Cours PDF avec fiche.
import { banc } from './commun.mjs';
const b = await banc();
// ancien réglage d'appareil : « Les deux » activé et la fiche affichée
await b.ev(`localStorage.setItem('medrevise.jumelle.lesDeux','1');localStorage.setItem('medrevise.jumelle.vue.f-fj','fiche');1`);
b.ok(await b.ouvrir('Physiologie rénale (jumelle)', { recharger: true }), 'cours PDF avec fiche ouvert');
b.ok((await b.ev(`document.querySelector('.pdfr-jumelle-bascule .seg-btn.active')?.innerText`)) === 'Original', 'ancien réglage « Les deux » : on retombe sur « Original »');
b.ok(await b.ev(`localStorage.getItem('medrevise.jumelle.lesDeux')===null`), 'le réglage est effacé');
b.ok(!(await b.ev(`!!document.querySelector('.fj-avis, .day-pop')`)), 'sans message');
b.ok(await b.ev(`document.querySelector('.pdfr-jumelle-bascule').innerText.replace(/\\s+/g,' ').trim()`) === 'Original Fiche', 'segment à deux positions « Original · Fiche », rien d’autre');
b.ok(!(await b.ev(`!!document.querySelector('.pdfr-jumelle-deux, .pdfr-jumelle, .vj, .avec-jumelle')`)), 'ni bouton ni panneau côte à côte');
const regles = await b.ev(`[...document.styleSheets].flatMap(s=>{try{return [...s.cssRules].map(r=>r.selectorText||'')}catch(e){return []}}).filter(t=>/\\.vj|pdfr-jumelle-deux|avec-jumelle/.test(t)).length`);
b.ok(regles === 0, 'aucune règle CSS du mode côte à côte chargée', String(regles));
// la bascule, elle, marche toujours
await b.clic(await b.pos(`document.querySelector('.pdfr-scroll')`, false), { att: 100 });
await b.ev(`document.activeElement&&document.activeElement.blur&&document.activeElement.blur();1`);
await b.T.Tab(); await b.dormir(1800);
b.ok((await b.ev(`document.querySelector('.pdfr-jumelle-bascule .seg-btn.active')?.innerText`)) === 'Fiche', 'Tab : bascule vers la fiche (non-régression)');
await b.capt('sans-les-deux');
await b.T.Tab(); await b.dormir(1500);
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
b.c.fermer();
