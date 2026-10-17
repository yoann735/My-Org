// (17/10 soir) Flashcard « Tableau » au téléphone (390 × 844, tactile) : série de la fiche, verso avec noms de
// colonnes, cellules révélées au doigt, défilement horizontal INTERNE pour 4 colonnes, la page ne déborde pas ;
// boutons de notation visibles. Préalable : t-tableau.mjs (crée les deux cartes). Base LOCALE du banc.
import { banc } from './commun.mjs';
const b = await banc(390, 844, { tactile: true });
await b.S(`for(const q of await S.getAll('questions'))if(q.ficheId==='f-001-tb'){q.dueDate=new Date().toLocaleDateString('fr-CA');await S.put('questions',q);}return 1`);
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await b.c.send('Page.reload', { ignoreCache: true }); await b.dormir(4500);
if (await b.ev(`document.body.innerText.includes('Choisis ton espace')`)) { await b.ev(`[...document.querySelectorAll('.hub-card')].find(b=>/^\\s*MedRevise/i.test(b.innerText))?.click();1`); await b.dormir(2000); }
const p = await b.ev(`(()=>{const t=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&e.textContent.trim()==='Fesse — tableaux (test)');if(!t)return null;let c=t;while(c&&!c.querySelector('button'))c=c.parentElement;const r=[...c.querySelectorAll('button')].find(x=>x.innerText.trim()==='Réviser');r.scrollIntoView({block:'center'});const q=r.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()`);
b.ok(!!p, 'accueil téléphone : la fiche « Fesse — tableaux (test) » à réviser');
await b.tape(p); await b.dormir(1200);
// viser la carte à 4 colonnes (innervation)
for (let k = 0; k < 2; k++) {
  if (await b.ev(`(document.querySelector('.mrm-flash-card')||{}).innerText?.includes('innervation')`)) break;
  await b.tape(await b.dans(`document.querySelector('.mrm-flash-card')`, 0.5, 0.5)); await b.dormir(500);
  await b.tape(await b.dans(`document.querySelectorAll('.bf-zone button')[2]`, 0.5, 0.5)); await b.dormir(800);
}
b.ok(await b.ev(`document.querySelector('.mrm-flash-card').innerText.includes('Muscles de la fesse — innervation')`), 'recto : le titre');
await b.tape(await b.dans(`document.querySelector('.mrm-flash-card')`, 0.5, 0.5)); await b.dormir(600);
const T = `document.querySelector('.mrm-flash-card [data-tableau]')`;
let e = await b.ev(`(()=>{const d=${T}.querySelector('.tb-defil');return {th:[...${T}.querySelectorAll('th')].map(x=>x.textContent.trim()).filter(Boolean),masques:${T}.querySelectorAll('.tb-masque').length,sw:d.scrollWidth,cw:d.clientWidth,page:document.scrollingElement.scrollWidth,iw:innerWidth}})()`);
b.ok(e.th.join('|') === 'Muscle|Innervation|Action|Fonction' && e.masques === 8, 'verso : 4 noms de colonnes visibles, 8 cellules masquées', JSON.stringify(e));
b.ok(e.sw > e.cw && e.page <= e.iw, 'tableau plus large que la carte : défilement horizontal INTERNE, la page ne déborde pas', `${e.sw} > ${e.cw}, page ${e.page}/${e.iw}`);
await b.capture('tb-mobile-masque');
await b.tape(await b.dans(`${T}.querySelector('[data-cellule="0:1"] .tb-masque')`, 0.5, 0.5));
e = await b.ev(`({masques:${T}.querySelectorAll('.tb-masque').length,v:${T}.querySelector('[data-cellule="0:1"]').textContent.trim(),dos:!!document.querySelector('.mrm-flash-card [data-tableau]')})`);
b.ok(e.masques === 7 && e.v === 'Nerf glutéal supérieur' && e.dos, 'tap sur une cellule : révélée, la carte reste au verso', JSON.stringify(e));
await b.ev(`${T}.querySelector('.tb-defil').scrollLeft=400;1`); await b.dormir(200);
await b.tape(await b.dans(`${T}.querySelector('tr[data-ligne="1"] .tb-ligne-btn')`, 0.5, 0.5));
b.ok(await b.ev(`${T}.querySelectorAll('tr[data-ligne="1"] .tb-masque').length`) === 0, '« Révéler la ligne » au doigt (après défilement horizontal)');
await b.tape(await b.dans(`${T}.querySelector('.tb-tout-btn')`, 0.5, 0.5));
b.ok(await b.ev(`${T}.querySelectorAll('.tb-masque').length`) === 0, '« Tout révéler »');
const bn = await b.ev(`(()=>{const l=[...document.querySelectorAll('.bf-zone button')];return {n:l.length,ok:l.every(x=>{const r=x.getBoundingClientRect();const el=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.bottom<=innerHeight&&r.height>=44&&el&&x.contains(el)})}})()`);
b.ok(bn.n >= 3 && bn.ok, 'boutons de notation visibles et libres sous le tableau', JSON.stringify(bn));
await b.capture('tb-mobile-revele');
b.ok(!b.erreurs.length, 'aucune erreur dans la page', b.erreurs.join(' / '));
process.exit(0);
