// Fiche jumelle sur DOCUMENT — bascule (zoom, position, outil), document intact, calques séparés,
// ancres par bloc : 2 paragraphes écrits au début → la correspondance tient ; bloc ancré supprimé →
// « sans équivalent », sans erreur.
import { banc } from './commun.mjs';
const b = await banc();
b.ok(await b.ouvrir('Myologie (document)', { recharger: true }), 'cours document ouvert');
const id = await b.S(`return (await S.getAll('fiches')).find(f=>f.titre==='Myologie (document)').id`);
const vue = () => b.ev(`document.querySelector('.pdfr-jumelle-bascule .seg-btn.active')?.innerText`);
const page = () => b.ev(`document.querySelector('.ptb-pages .tnum')?.innerText`);
const versVue = async (v) => { if ((await vue()) !== v) { await b.clic(await b.pos(`[...document.querySelectorAll('.pdfr-jumelle-bascule .seg-btn')].find(x=>x.innerText===${JSON.stringify(v)})`, false), { att: 2200 }); } };
const flux = () => b.S(`const r=await S.getOne('notes_doc','${id}');return JSON.stringify({f:r.flux,m:r.fluxMaj})`);
// position relative dans la page sous le haut de la zone de lecture
const fraction = () => b.ev(`(()=>{const el=document.querySelector('.pdfr-scroll');const y=el.getBoundingClientRect().top;let best=null;el.querySelectorAll('.pdfr-page[data-cle]').forEach((p,i)=>{const r=p.getBoundingClientRect();if(r.top<=y+1&&r.bottom>y)best=+((y-r.top)/r.height).toFixed(3)});return best})()`);
const allerFraction = async (n, f) => {
  await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0`); await b.dormir(300);
  for (let k = 1; k < n; k++) { await b.ev(`document.querySelector('.ptb-pages button[title="Page suivante"]').click();1`); await b.dormir(120); }
  await b.dormir(400);
  await b.ev(`(()=>{const el=document.querySelector('.pdfr-scroll');const y=el.getBoundingClientRect().top;let best=null,d=1e9;el.querySelectorAll('.pdfr-page[data-cle]').forEach(p=>{const r=p.getBoundingClientRect();const e=Math.abs(r.top-y);if(e<d){d=e;best=p}});const r=best.getBoundingClientRect();el.scrollTop+=r.top-y+${f}*r.height;return 1})()`);
  await b.dormir(700);
};
const sansFocus = () => b.ev(`document.activeElement&&document.activeElement.blur&&document.activeElement.blur();1`);
// bascule + attente RÉELLE : la vue a changé et (côté document) l'éditeur est remonté avec ses pages
const attendreVue = async (v0) => { for (let k = 0; k < 50; k++) { const v = await vue(); if (v !== v0 && (v === 'Fiche' || await b.ev(`!!document.querySelector('.pt-flux-cadre h1')`))) { await b.dormir(900); return true; } await b.dormir(100); } return false; };
const tab = async () => { const v0 = await vue(); await sansFocus(); await b.T.Tab(); await attendreVue(v0); };
await versVue('Original');
b.ok(await b.ev(`!!document.querySelector('.pt-flux-cadre .ProseMirror')`) && (await page()).endsWith('/ 6'), 'côté Original : l’ÉDITEUR du document (6 p.)', await page());
const f0 = await flux();
// zoom + outil + doc p.4 à 30 %
await b.clic(await b.pos(`document.querySelector('.ptb-zoom button[title="Dézoomer"]')`, false), { att: 500 });
const zoom0 = await b.ev(`document.querySelector('.ptb-zoom .hint').innerText`);
await allerFraction(4, 0.3);
const fr0 = await fraction(); const p0 = await page();
await b.clic(await b.bouton('Surligneur'));
await b.T.Tab(); await b.dormir(2200);
const fr1 = await fraction();
b.ok((await vue()) === 'Fiche' && (await page()) === '5 / 8', 'Tab : document p.4 → fiche p.5 (sa correspondante)', p0 + ' → ' + await page());
b.ok(Math.abs(fr1 - fr0) < 0.03, 'même position relative dans la page', `${fr0} → ${fr1}`);
b.ok(await b.ev(`document.querySelector('.ptb-zoom .hint').innerText`) === zoom0, 'même zoom', zoom0);
b.ok(await b.ev(`[...document.querySelectorAll('.ptb-outil.actif')].some(x=>x.title.startsWith('Surligneur'))`), 'même outil (Surligneur)');
await b.capt('doc-bascule-fiche');
await b.clic(await b.bouton('Sélection'));
await tab();
b.ok((await vue()) === 'Original' && (await page()) === '4 / 6' && Math.abs((await fraction()) - fr0) < 0.03, 'Tab : retour au document p.4, même position', await page() + ' ' + await fraction());
b.ok(await b.ev(`!!document.querySelector('.pt-flux-cadre .ProseMirror')`), 'l’éditeur est de retour (écriture possible)');
await b.capt('doc-bascule-original');
const f1 = await flux();
b.ok(f1 === f0, 'deux bascules : le document (flux et date d’écriture) est INCHANGÉ');
// CALQUES SÉPARÉS : une boîte sur le document, une sur la fiche
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0`); await b.dormir(600);
const pg = await b.rect(`document.querySelector('.pdfr-page[data-cle]')`);
await b.clic(await b.bouton('Boîte')); await b.clic([pg.x + pg.w * 0.6, pg.y + 420], { att: 900 }); await b.ecrire('Boîte du document');
await b.T.Escape(); await b.T.Escape(); await b.dormir(500);
await versVue('Fiche'); await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0`); await b.dormir(700);
const pf = await b.rect(`document.querySelector('.pdfr-page[data-cle]')`);
b.ok(!(await b.ev(`[...document.querySelectorAll('.note-box')].some(n=>n.innerText.includes('Boîte du document'))`)), 'sur la fiche, la boîte du document n’apparaît pas');
await b.clic(await b.bouton('Boîte')); await b.clic([pf.x + pf.w * 0.5, pf.y + 500], { att: 900 }); await b.ecrire('Boîte de la fiche');
await b.T.Escape(); await b.T.Escape(); await b.dormir(500);
const ns = JSON.parse(await b.S(`return JSON.stringify((await S.getAll('annotations')).filter(a=>a.kind==='libre'&&String(a.ficheId).startsWith('${id}')).map(a=>a.ficheId+' : '+(JSON.stringify(a.content).match(/"text":"([^"]*)"/)||[])[1]))`));
b.ok(ns.includes(`${id} : Boîte du document`) && ns.includes(`${id}::fiche:1 : Boîte de la fiche`), 'en base : un calque pour le document, un pour la fiche', JSON.stringify(ns));
await versVue('Original'); await b.dormir(500);
b.ok(await b.ev(`[...document.querySelectorAll('.note-box')].map(n=>n.innerText.trim()).join('|')`) === 'Boîte du document', 'retour au document : seule sa boîte');
// ÉCRIRE 2 PARAGRAPHES AU DÉBUT (par l'éditeur, comme une frappe : sauvegarde automatique comprise)
const long = (n) => Array.from({ length: 14 }, (_, i) => `Phrase ${i + 1} du paragraphe ${n} ajouté au début du document pour faire glisser la pagination.`).join(' ');
await b.ev(`(()=>{const ed=document.querySelector('.pt-flux-cadre .ProseMirror').editor;ed.chain().insertContentAt(0,[{type:'paragraph',content:[{type:'text',text:${JSON.stringify(long(1))}}]},{type:'paragraph',content:[{type:'text',text:${JSON.stringify(long(2))}}]}]).run();return 1})()`);
await b.dormir(2500);
const nbApres = await page();
b.ok(nbApres.endsWith('/ 7'), 'le texte ajouté fait déborder la première section : le document passe à 7 pages', nbApres);
// la page qui porte « Le couplage excitation-contraction » (section 2) → fiche p.2
// page (n°) d'un élément du flux : on l'amène à l'écran, puis on lit le compteur de pages
const pageDe = async (txt, sel = 'h1') => { await b.ev(`(()=>{const h=[...document.querySelectorAll('.pt-flux-cadre ${sel}')].find(x=>x.innerText.includes(${JSON.stringify(txt)}));const el=document.querySelector('.pdfr-scroll');el.scrollTop+=h.getBoundingClientRect().top-el.getBoundingClientRect().top-Math.min(el.clientHeight*0.2,150);return 1})()`); await b.dormir(700); return +(await page()).split('/')[0]; };
const pSec2 = await pageDe('Le couplage');
await allerFraction(pSec2, 0.05);
await tab();
b.ok(pSec2 === 3 && (await page()) === '2 / 8', `les ancres TIENNENT : section 2, désormais en p.${pSec2} du document → fiche p.2`, await page());
await tab();
const pSec6 = await pageDe('Le muscle cardiaque'); await allerFraction(pSec6, 0.05); await tab();
b.ok((await page()) === '8 / 8', `section 6 (p.${pSec6} du document) → fiche p.8`, await page());
await tab();
// la page 1 ne porte plus que le texte ajouté (aucune ancre) : sans équivalent → la plus proche + avis
await allerFraction(1, 0.2); await sansFocus(); await b.T.Tab(); await b.dormir(300);
const avis2 = await b.ev(`document.querySelector('.fj-avis')?.innerText || ''`); await b.dormir(2000);
b.ok(/sans équivalent/.test(avis2), 'page 1 (texte ajouté, sans ancre) : « sans équivalent » + page la plus proche, sans erreur', avis2 + ' → ' + await page());
await b.capt('doc-ancres-apres-ecriture');
await tab();
// SUPPRIMER le bloc ancré de la section 4 (son titre)
await b.ev(`(()=>{const ed=document.querySelector('.pt-flux-cadre .ProseMirror').editor;let de=null,a=null;ed.state.doc.forEach((n,pos)=>{if(n.type.name==='heading'&&n.textContent.includes('Les types de fibres')){de=pos;a=pos+n.nodeSize}});ed.chain().deleteRange({from:de,to:a}).run();return 1})()`);
await b.dormir(2500);
const pSec4 = await pageDe('Les fibres de type I ', 'p');
await allerFraction(pSec4, 0.1);
// le curseur DANS le texte de cette page (vrai clic sur le paragraphe), puis ⌘⇧F
await b.clic(await b.pos(`[...document.querySelectorAll('.pt-flux-cadre p')].find(x=>x.innerText.startsWith('Les fibres de type IIa'))`, false), { att: 500 });
const avantRaccourci = await page();
await b.touche('f', { meta: true, shift: true, code: 'KeyF', vk: 70 }); await b.dormir(300);
const avis4 = await b.ev(`document.querySelector('.fj-avis')?.innerText || ''`); await b.dormir(2000);
b.ok(/sans équivalent/.test(avis4) && (await vue()) === 'Fiche' && (await page()) !== '5 / 8', `bloc ancré supprimé : sa page (p.${pSec4}) est « sans équivalent », sans erreur (⌘⇧F, curseur dans le texte)`, avantRaccourci + ' · ' + avis4 + ' → ' + await page());
await tab();
// et la fiche p.5 n'a plus d'original
const sansOrig = JSON.parse(await b.S(`return JSON.stringify((await S.getOne('companion_pdf','cp:${id}')).pageMap.parBloc.map(e=>e.fiche))`));
await b.menuFichier('Correspondance des pages'); await b.dormir(1500);
const editeur = await b.ev(`JSON.stringify({lignes:document.querySelectorAll('.fjc-ligne').length, ajout:[...document.querySelectorAll('.fjc-page.ajoutee .fjc-etiquette')].map(e=>e.dataset.fiche).join(','), entete:document.querySelector('.fjc-entete')?.innerText})`);
b.ok(/"lignes":7/.test(editeur) && (await flux()).length > 0 && /"ajout":"3,5,7"/.test(editeur), 'éditeur : 7 pages du document ; fiche p.5 redevenue sans original (avec les 2 ajoutées)', editeur);
await b.capt('doc-editeur');
await b.T.Escape();
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
b.c.fermer();
