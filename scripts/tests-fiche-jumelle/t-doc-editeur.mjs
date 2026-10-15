// Fiche jumelle sur DOCUMENT — correspondance MANUELLE : l'éditeur liste les pages du document, on glisse une
// page de fiche sur une page du document, l'enregistrement se fait par ANCRES de bloc ; « Automatique » rétablit.
import { banc } from './commun.mjs';
const b = await banc();
b.ok(await b.ouvrir('Myologie (document)', { recharger: true }), 'cours document ouvert');
const id = await b.S(`return (await S.getAll('fiches')).find(f=>f.titre==='Myologie (document)').id`);
const vue = () => b.ev(`document.querySelector('.pdfr-jumelle-bascule .seg-btn.active')?.innerText`);
if ((await vue()) !== 'Original') { await b.clic(await b.pos(`[...document.querySelectorAll('.pdfr-jumelle-bascule .seg-btn')].find(x=>x.innerText==='Original')`, false), { att: 2500 }); }
b.ok(await b.menuFichier('Correspondance des pages'), 'Fichier → « Correspondance des pages… » (document)');
await b.dormir(1200);
const ed = await b.ev(`JSON.stringify({entete:document.querySelector('.fjc-entete').innerText, lignes:[...document.querySelectorAll('.fjc-ligne .fjc-otitre')].map(x=>x.innerText), ajout:[...document.querySelectorAll('.fjc-page.ajoutee .fjc-etiquette')].map(e=>e.dataset.fiche).join(',')})`);
b.ok(/DOCUMENT · 6 PAGES/i.test(ed) && /Le muscle squelettique/.test(ed) && /"ajout":"3,7"/.test(ed), 'colonne de gauche : les 6 pages du DOCUMENT (titres), fiche p.3 et p.7 ajoutées', ed);
await b.capt('doc-editeur-import');
// glisser « Fiche p.3 » (synthèse, ajoutée) sur la page 3 du document
await b.ev(`document.querySelector('.fjc-ligne[data-orig="3"]').scrollIntoView({block:'center'});[...document.querySelectorAll('.fjc-fiche .fjc-etiquette')].find(e=>e.dataset.fiche==='3').scrollIntoView({block:'center'});1`); await b.dormir(300);
await b.glisser(await b.pos(`[...document.querySelectorAll('.fjc-fiche .fjc-etiquette')].find(e=>e.dataset.fiche==='3')`, false), await b.pos(`document.querySelector('.fjc-ligne[data-orig="3"] .fjc-otitre')`, false), 14);
b.ok(await b.ev(`document.querySelector('.fjc-ligne[data-orig="3"] .fjc-etiquette')?.dataset.fiche`) === '3', 'glissé : page 3 du document ↔ fiche p.3');
await b.clic(await b.pos(`[...document.querySelectorAll('.fjc-actions button')].find(x=>x.innerText==='Enregistrer')`, false), { att: 900 });
const pm = JSON.parse(await b.S(`return JSON.stringify((await S.getOne('companion_pdf','cp:${id}')).pageMap)`));
b.ok(pm.mode === 'bloc' && pm.manuel && pm.parBloc.length === 6 && pm.parBloc[2].fiche === 3 && /^heading:/.test(pm.parBloc[2].ancre), 'enregistré PAR ANCRE : la page 3 (titre « L’énergétique… ») → fiche p.3', JSON.stringify(pm.parBloc.map((e) => e.fiche)));
// effet sur la bascule : document p.3 → fiche p.3
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0`); await b.dormir(300);
for (let k = 1; k < 3; k++) { await b.ev(`document.querySelector('.ptb-pages button[title="Page suivante"]').click();1`); await b.dormir(150); }
await b.dormir(600); await b.ev(`document.activeElement&&document.activeElement.blur&&document.activeElement.blur();1`);
await b.T.Tab(); for (let k = 0; k < 40 && (await vue()) !== 'Fiche'; k++) await b.dormir(100); await b.dormir(1500);
b.ok((await b.ev(`document.querySelector('.ptb-pages .tnum').innerText`)) === '3 / 8', 'bascule après correction : document p.3 → fiche p.3', await b.ev(`document.querySelector('.ptb-pages .tnum').innerText`));
await b.T.Tab(); for (let k = 0; k < 40 && (await vue()) !== 'Original'; k++) await b.dormir(100); await b.dormir(1500);
// « Automatique » + Enregistrer rétablit la correspondance calculée
await b.menuFichier('Correspondance des pages'); await b.dormir(1200);
await b.clic(await b.pos(`[...document.querySelectorAll('.fjc-actions button')].find(x=>x.innerText==='Automatique')`, false), { att: 300 });
await b.clic(await b.pos(`[...document.querySelectorAll('.fjc-actions button')].find(x=>x.innerText==='Enregistrer')`, false), { att: 900 });
const pm2 = JSON.parse(await b.S(`return JSON.stringify((await S.getOne('companion_pdf','cp:${id}')).pageMap)`));
b.ok(JSON.stringify(pm2.parBloc.map((e) => e.fiche)) === '[1,2,4,5,6,8]', '« Automatique » : 1 2 4 5 6 8 rétabli', JSON.stringify(pm2.parBloc.map((e) => e.fiche)));
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
b.c.fermer();
