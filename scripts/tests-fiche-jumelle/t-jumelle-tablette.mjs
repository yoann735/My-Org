// Fiche jumelle AU DOIGT, tablette 820 × 1 180 tactile : segment Original · Fiche (cibles ≥ 36 px),
// bascule au toucher, éditeur de correspondance : glisser une page AU DOIGT.
import { banc } from './commun.mjs';
const b = await banc();
b.ok(await b.ouvrir('Physiologie rénale (jumelle)', { recharger: true }), 'cours ouvert (1 440 px)');
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180, deviceScaleFactor: 2, mobile: true });
await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await b.dormir(1500);
const seg = await b.rect(`document.querySelector('.pdfr-jumelle-bascule .seg-btn')`);
b.ok(seg && seg.h >= 36, 'segment Original · Fiche ≥ 36 px au doigt', seg && `${seg.w.toFixed(0)}×${seg.h}`);
const vue = () => b.ev(`document.querySelector('.pdfr-jumelle-bascule .seg-btn.active')?.innerText`);
const v0 = await vue();
await b.tape(await b.pos(`[...document.querySelectorAll('.pdfr-jumelle-bascule .seg-btn')].find(x=>!x.classList.contains('active'))`, false));
await b.dormir(1500);
b.ok((await vue()) !== v0, 'toucher : bascule ' + v0 + ' → ' + await vue());
// éditeur, au doigt : la page « Synthèse » (fiche p.6) sur la diapositive 5, puis Annuler (rien d'écrit)
await b.tape(await b.pos(`document.querySelector('.mf-bouton')`, false));
await b.tape(await b.pos(`[...document.querySelectorAll('.mf-extras .mf-pastille')].find(x=>x.innerText==='Pages')`, false)); // (15/10) menu Fichier unique
await b.dormir(1500);
await b.ev(`document.querySelector('.fjc-ligne[data-orig="5"]').scrollIntoView({block:'center'});[...document.querySelectorAll('.fjc-fiche .fjc-etiquette')].find(e=>e.dataset.fiche==='6').scrollIntoView({block:'center'});1`); await b.dormir(300);
const de = await b.pos(`[...document.querySelectorAll('.fjc-fiche .fjc-etiquette')].find(e=>e.dataset.fiche==='6')`, false);
const vers = await b.pos(`document.querySelector('.fjc-ligne[data-orig="5"] .fjc-otitre')`, false);
await b.doigt(de, vers, 14);
b.ok(await b.ev(`document.querySelector('.fjc-ligne[data-orig="5"] .fjc-etiquette')?.dataset.fiche`) === '6', 'glisser AU DOIGT : fiche p.6 → diapositive 5');
await b.capt('jumelle-editeur-tablette');
const avant = await b.S(`return JSON.stringify((await S.getOne('companion_pdf','cp:f-fj')).pageMap)`);
await b.tape(await b.pos(`[...document.querySelectorAll('.fjc-actions button')].find(x=>x.innerText==='Annuler')`, false));
b.ok(await b.S(`return JSON.stringify((await S.getOne('companion_pdf','cp:f-fj')).pageMap)`) === avant && !(await b.ev(`!!document.querySelector('.fjc')`)), 'Annuler : rien d’écrit');
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: false });
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
b.c.fermer();
