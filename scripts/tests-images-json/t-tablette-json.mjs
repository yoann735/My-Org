// Tablette : bascule de version au doigt, panneau Import/Export à 820 px. « PDF texte J » ouvert.
import { banc } from './commun-doc.mjs';
import { tablette } from './tab-commun.mjs';
const B = await banc(820, 1180);
const { c, ev, ok, dormir } = B;
const T = await tablette(B);
const b3 = () => B.S(`const a=await S.getOne('annotations','an-b3');return {v:a.displayVersion||null,alt:a.textAlt||null}`);
// 1. panneau d'import à 820 px : entièrement visible, import au doigt
await T.tap(await B.pos(`document.querySelector('.mf-bouton')`, false));
await T.tap(await B.pos(`[...document.querySelectorAll('.mf-item')].find(b=>b.innerText.startsWith('Importer des textes'))`, false));
const rp = await ev(`(()=>{const r=document.querySelector('.ta-panneau').getBoundingClientRect();return [Math.round(r.left),Math.round(r.top),Math.round(r.right),Math.round(r.bottom),innerWidth]})()`);
ok(rp[0] >= 0 && rp[2] <= rp[4] && rp[3] <= 1180, 'panneau « Textes d’annotations » entièrement à l’écran (tablette)', JSON.stringify(rp));
await ev(`(()=>{const t=document.querySelector('.ta-colle');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(t,${JSON.stringify(JSON.stringify({ boxes: [{ id: 'an-b3', text: 'Citrate synthase (tablette).' }] }))});t.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
await T.tap(await B.pos(`[...document.querySelectorAll('.ta-panneau button')].find(b=>b.innerText.includes('Importer le collage'))`, false), 900);
const msg = await ev(`(document.querySelector('.ta-message')||{}).innerText`);
await B.capture('tab-panneau-import');
ok(/^1 boîte mise à jour/.test(msg || '') && (await b3()).alt === 'Citrate synthase (tablette).', 'import au doigt', msg);
await T.tap(await B.pos(`document.querySelector('.ta-panneau .icon-btn')`, false));
// 2. bascule par boîte au doigt : tap sur la boîte (active) → bouton de version dans sa mini barre
const pb = await ev(`(async()=>{const e=[...document.querySelectorAll('.pdfr-page[data-cle="1"] .note-box')].find(x=>x.querySelector('.nb-version'));e.scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,500));const r=e.querySelector('.nb-bar').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
await T.tap(pb, 700);
const avant = await b3();
const bt = await B.pos(`document.querySelector('.nb-bascule')`, false);
ok(!!bt, 'boîte touchée : le bouton « Voir l’original / la version IA » est dans sa mini barre');
await T.tap(bt, 800);
const apres = await b3();
await T.tap(await B.pos(`document.querySelector('.nb-bascule')`, false), 800);
const retour = await b3();
ok(avant.v === 'alt' && apres.v === 'original' && retour.v === 'alt', 'tablette : bascule au doigt dans les deux sens', `${avant.v} → ${apres.v} → ${retour.v}`);
await B.capture('tab-bascule');
ok(!B.erreurs.length, 'aucune exception JS', B.erreurs.join(' | '));
c.fermer();
