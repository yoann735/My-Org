// (29/10) DIAPO D'ORIGINE sur un cours « document » (créé dans l'app) : le lien dit « Document p. … » et ouvre le
// document à cette page ; retour à la fiche. Préalable : node seed-doc.mjs <fx> && node t-doc-import.mjs <fx>
import { banc } from './commun.mjs';
const b = await banc(1440, 900);
b.ok(await b.ouvrir('Myologie (document)', { recharger: true }), 'cours document ouvert');
await b.dormir(1500);
const vue = () => b.ev(`document.querySelector('.pdfr-jumelle-bascule .seg-btn.active')?.innerText`);
if ((await vue()) !== 'Fiche') { await b.ev(`[...document.querySelectorAll('.pdfr-jumelle-bascule .seg-btn')].find(x=>x.innerText==='Fiche').click();1`); await b.dormir(1800); }
b.ok((await vue()) === 'Fiche', 'fiche affichée');
// l'infobulle, toujours là (à faible zoom, le bouton n'affiche que son icône : règle .ctl-reduit de l'app)
const lire = () => b.ev(`[...document.querySelectorAll('.pdfr-origine')].map(x=>x.closest('.pdfr-page').dataset.cle+':'+(((x.title||'').match(/le document (p\\. [\\d–]+)/)||[])[1] ? 'Document '+x.title.match(/le document (p\\. [\\d–]+)/)[1] : ''))`);
// les pages hors écran ne sont pas dessinées : on descend dans la fiche jusqu'à un lien vers une page > 1
const vus = new Set();
for (let i = 0; i < 60; i++) { (await lire()).forEach((l) => vus.add(l)); if ([...vus].some((l) => +l.split(':Document p. ')[1]?.split(/[–\s]/)[0] > 1)) break; await b.ev(`(()=>{document.querySelector('.pdfr-scroll').scrollTop+=400;return 1})()`); await b.dormir(150); }
const liens = [...vus];
b.ok(liens.length > 1 && liens.every((l) => /:Document p\. \d+/.test(l)), 'liens « Document p. … » sur les pages de la fiche', JSON.stringify(liens));
const cible = liens.map((l) => +l.split(':Document p. ')[1].split(/[–\s]/)[0]).find((p) => p > 1);
b.ok(cible > 1, 'un lien vers une page > 1 du document', String(cible));
const lienCible = liens.find((l) => l.includes('Document p. ' + cible));
const pageFiche = +lienCible.split(':')[0];
await b.ev(`(()=>{const x=document.querySelector('.pdfr-page[data-cle="${pageFiche}"] .pdfr-origine');x.scrollIntoView({block:'center'});return 1})()`); await b.dormir(300);
const r = await b.rect(`document.querySelector('.pdfr-page[data-cle="${pageFiche}"] .pdfr-origine')`);
await b.clic([r.cx, r.cy], { att: 2500 });
const page = await b.ev(`(()=>{const t=(document.querySelector('.pdfr-v2')||document.body).innerText.match(/(\\d+)\\s*\\/\\s*(\\d+)/);return t?+t[1]:null})()`);
b.ok((await vue()) === 'Original' && page === cible, `clic : le document s’ouvre à la page ${cible}`, String(page));
b.ok(await b.ev(`!!document.querySelector('[data-retour-fiche]')`), 'bouton « Revenir à la fiche »');
await b.ev(`document.querySelector('[data-retour-fiche]').click();1`); await b.dormir(2200);
const pf = await b.ev(`(()=>{const t=(document.querySelector('.pdfr-v2')||document.body).innerText.match(/(\\d+)\\s*\\/\\s*(\\d+)/);return t?+t[1]:null})()`);
b.ok((await vue()) === 'Fiche' && pf === pageFiche, `retour : fiche p.${pageFiche}`, String(pf));
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
b.c.fermer(); process.exit(0);
