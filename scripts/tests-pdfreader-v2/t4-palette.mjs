import { banc } from './commun-doc.mjs';
import { glisserAvec } from './outils-glisser.mjs';
const b = await banc();
const glisser = glisserAvec(b);
const attendu = 'Ambre — prioritaire,Corail,Violet doux,Bleu ardoise,Vert sauge,Rose poudré — cloze';
const pastilles = () => b.ev(`[...document.querySelectorAll('.pdfr-contexte .sc-couleurs > .sc-pastille:not(.actif[title="Couleur actuelle"])')].map(p=>p.title.replace(/ — couleur.*$/,'')).filter(t=>t!=='Couleur actuelle').join()`);
for (const o of ['Surligneur', 'Boîte', 'Texte', 'Forme', 'Crayon']) {
  await b.clic(await b.bouton(o), { att: 500 });
  const p = await pastilles();
  b.ok(p === attendu, `sélecteur « ${o} » : les 6 couleurs de base`, p);
}
await b.capture('apres-palette-crayon', await b.ev(`(()=>{const r=document.querySelector('.pdfr-contexte').getBoundingClientRect();return {x:r.x,y:r.y-60,width:r.width,height:r.height+64}})()`));
// nouvelle boîte : transparente, bordure ambre
await b.clic(await b.bouton('Boîte'), { att: 400 });
await b.clic(await b.pos(`document.querySelector('.pdfr-contexte .sc-couleurs > .sc-pastille[title^="Ambre"]')`));
const pg = await b.ev(`(()=>{const r=document.querySelector('.pdfr-textlayer').getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()`);
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0`); await b.dormir(400);
await b.clic([pg[0] + pg[2] * 0.08, pg[1] + 40], { att: 700 });
await b.ecrire('Boîte transparente');
const st = async () => b.ev(`(()=>{const e=[...document.querySelectorAll('.note-box')].filter(x=>x.innerText.includes('Boîte transparente')).pop();const cs=getComputedStyle(e);return {bg:cs.backgroundColor,bord:cs.borderTopColor,texte:cs.color,classe:e.className}})()`);
let s1 = await st();
b.ok(s1.bg === 'rgba(0, 0, 0, 0)' && s1.bord === 'rgb(245, 165, 36)', 'nouvelle boîte : fond transparent, bordure ambre', JSON.stringify(s1));
await b.clic(await b.bouton('Sélection'));
await b.clic([pg[0] + pg[2] * 0.5, pg[1] + pg[3] * 0.9], { att: 400 });
await b.capture('apres-boite-transparente', { x: pg[0], y: pg[1], width: pg[2] * 0.6, height: 140 });
// option Fond : teinté puis plein (survol pour afficher la barre)
const boite = await b.pos(`[...document.querySelectorAll('.note-box')].filter(x=>x.innerText.includes('Boîte transparente')).pop()`);
for (const [nom, test] of [['teinté', (s) => s.bg === 'rgba(245, 165, 36, 0.15)'], ['plein', (s) => s.bg === 'rgba(245, 165, 36, 0.92)'], ['transparent', (s) => s.bg === 'rgba(0, 0, 0, 0)']]) {
  await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: boite[0], y: boite[1] }); await b.dormir(700);
  const f = await b.pos(`(()=>{const bx=[...document.querySelectorAll('.note-box')].filter(x=>x.innerText.includes('Boîte transparente')).pop().getBoundingClientRect();return [...document.querySelectorAll('.nb-actions .nb-fond')].map(e=>({e,r:e.getBoundingClientRect()})).sort((p,q)=>Math.hypot(p.r.x-bx.x,p.r.y-bx.y)-Math.hypot(q.r.x-bx.x,q.r.y-bx.y))[0].e})()`);
  await b.clic(f, { att: 600 });
  const s = await st();
  b.ok(test(s), 'option Fond → ' + nom, s.bg);
  if (nom !== 'transparent') await b.capture('apres-boite-' + nom.replace('é', 'e'), { x: pg[0], y: pg[1], width: pg[2] * 0.6, height: 140 });
}
// ancienne boîte : inchangée (pas de classe fond-*)
const anc = await b.ev(`(()=>{const e=[...document.querySelectorAll('.note-box')].find(x=>x.innerText.includes('Note boîte'));return e?{c:e.className,bg:getComputedStyle(e).backgroundColor}:null})()`);
b.ok(anc && !/fond-/.test(anc.c) && anc.bg === 'rgba(255, 216, 77, 0.92)', 'ancienne boîte : rendu d’origine', JSON.stringify(anc));
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
b.c.fermer();
