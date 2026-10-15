// Fiche jumelle — éditeur de correspondance (menu Fichier) : deux colonnes, glisser pour réassocier,
// menu de secours, enregistrement (synchronisé), effet sur la bascule, « Automatique ».
import { banc } from './commun.mjs';
const b = await banc();
b.ok(await b.ouvrir('Physiologie rénale (jumelle)', { recharger: true }), 'cours ouvert');
const rec = () => b.S(`return JSON.stringify(await S.getOne('companion_pdf','cp:f-fj'))`).then(JSON.parse);
b.ok(await b.menuFichier('Correspondance des pages'), 'Fichier → « Correspondance des pages… »');
await b.dormir(1200);
const n = await b.ev(`JSON.stringify({lignes:document.querySelectorAll('.fjc-ligne').length, fiche:document.querySelectorAll('.fjc-page').length, ajout:document.querySelectorAll('.fjc-page.ajoutee').length, fusion:document.querySelectorAll('.fjc-ligne .fjc-badge').length})`);
b.ok(n === '{"lignes":26,"fiche":30,"ajout":5,"fusion":1}', 'deux colonnes : 26 diapositives, 30 pages de fiche dont 5 « ajoutées », 1 fusion', n);
await b.capt('jumelle-editeur');
// GLISSER la page 6 de la fiche (« Synthèse », ajoutée) sur la diapositive 5
await b.ev(`document.querySelector('.fjc-fiche .fjc-page:nth-of-type(7)')?.scrollIntoView({block:'center'});document.querySelector('.fjc-ligne[data-orig="5"]').scrollIntoView({block:'center'});1`); await b.dormir(300);
const de = await b.pos(`[...document.querySelectorAll('.fjc-fiche .fjc-etiquette')].find(e=>e.dataset.fiche==='6')`, false);
const vers = await b.pos(`document.querySelector('.fjc-ligne[data-orig="5"] .fjc-otitre')`, false);
await b.glisser(de, vers, 14);
b.ok(await b.ev(`document.querySelector('.fjc-ligne[data-orig="5"] .fjc-etiquette')?.dataset.fiche`) === '6', 'glisser « Fiche p.6 » sur la diapositive 5 : associées');
b.ok(await b.ev(`[...document.querySelectorAll('.fjc-page.ajoutee .fjc-etiquette')].map(e=>e.dataset.fiche).join(',')`) === '5,14,21,29,30', 'la fiche p.5 devient « ajoutée », la p.6 ne l’est plus');
// menu de secours (doigt / clavier) : diapositive 26 → « — »
await b.ev(`(()=>{const s=document.querySelector('.fjc-ligne[data-orig="26"] select');const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;set.call(s,'');s.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`); await b.dormir(200);
b.ok(await b.ev(`document.querySelector('.fjc-ligne[data-orig="26"]').classList.contains('sans')`), 'menu « — » : diapositive 26 sans équivalent');
await b.capt('jumelle-editeur-modifie');
await b.clic(await b.pos(`[...document.querySelectorAll('.fjc-actions button')].find(x=>x.innerText==='Enregistrer')`, false), { att: 800 });
let r = await rec();
b.ok(r.pageMap.manuel && r.pageMap.versFiche[4] === 6 && r.pageMap.versFiche[25] === null && r.pageMap.versOrig[5] === 5 && r.pageMap.versOrig[4] === null, 'enregistré : manuel, 5→6, 26 → aucune', JSON.stringify(r.pageMap.versFiche));
// effet sur la bascule : original p.5 → fiche p.6
await b.ev(`(async()=>{const el=document.querySelector('.pdfr-scroll');el.scrollTop=el.scrollHeight*4.2/26;})()`); await b.dormir(800);
if ((await b.ev(`document.querySelector('.pdfr-jumelle-bascule .seg-btn.active')?.innerText`)) !== 'Original') { await b.T.Tab(); await b.dormir(1500); await b.ev(`(()=>{const el=document.querySelector('.pdfr-scroll');el.scrollTop=el.scrollHeight*4.2/26;})()`); await b.dormir(800); }
const p0 = await b.ev(`document.querySelector('.ptb-pages .tnum').innerText`);
await b.clic(await b.pos(`document.querySelector('.pdfr-scroll')`, false), { att: 100 }); await b.T.Tab(); await b.dormir(1500);
b.ok(p0 === '5 / 26' && (await b.ev(`document.querySelector('.ptb-pages .tnum').innerText`)) === '6 / 30', 'bascule après correction : original p.5 → fiche p.6', p0 + ' → ' + await b.ev(`document.querySelector('.ptb-pages .tnum').innerText`));
// « Automatique » rétablit la correspondance calculée
await b.menuFichier('Correspondance des pages'); await b.dormir(1200);
b.ok((await b.ev(`document.querySelector('.mf-menu')`)) === null, 'éditeur ouvert');
await b.clic(await b.pos(`[...document.querySelectorAll('.fjc-actions button')].find(x=>x.innerText==='Automatique')`, false), { att: 300 });
await b.clic(await b.pos(`[...document.querySelectorAll('.fjc-actions button')].find(x=>x.innerText==='Enregistrer')`, false), { att: 800 });
r = await rec();
b.ok(JSON.stringify(r.pageMap.versOrig) === JSON.stringify([1,2,3,4,5,null,6,7,8,9,10,11,12,null,14,15,16,17,18,19,null,20,21,22,23,24,25,26,null,null]), '« Automatique » + Enregistrer : correspondance calculée rétablie');
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
b.c.fermer();
