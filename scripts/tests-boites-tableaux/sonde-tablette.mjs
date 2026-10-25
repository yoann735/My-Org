// SONDE du bug tablette (§3) : ce qui bouge quand on sélectionne du texte (diapo, boîte) en mode tablette.
// Mesure la position de tous les éléments du haut et de la page, le défilement, et note les éléments ajoutés au DOM.
import { banc } from './commun.mjs';
const b = await banc();
const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
await b.preparer({ annotations: [{ ficheId: 'f-simpl', page: 1, kind: 'libre', type: 'boite', fond: 'plein', gabarit: 'carte', taille1000: 16, couleur: 'jaune-franc', id: 'st-1', x: 0.5, y: 0.6, width: 0.4, height: 0.08, largeurFixe: true, content: doc('Le néphron est l’unité fonctionnelle du rein et filtre le plasma.') }] });
await b.ouvrirCours({ tablette: true });
await b.ev(`(()=>{window.__ajouts=[];new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1)window.__ajouts.push((n.className&&n.className.baseVal===undefined?n.className:n.tagName)+'')}).observe(document.body,{childList:true,subtree:true});return 1})()`);
const etat = () => b.ev(`(()=>{const haut={};const pg=document.querySelector('.pdfr-scroll');const lim=pg?pg.getBoundingClientRect().top+4:200;
  [...document.querySelectorAll('body *')].forEach((e,i)=>{if(!e.offsetParent&&getComputedStyle(e).position!=='fixed')return;const r=e.getBoundingClientRect();if(r.height>0&&r.bottom<=lim+1&&r.width>0&&e.children.length<40){const k=(e.className&&e.className.baseVal===undefined?e.className:e.tagName)+'#'+i;haut[k]=Math.round(r.left)+','+Math.round(r.top)+','+Math.round(r.width)+'x'+Math.round(r.height)}});const q=(s)=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return Math.round(r.top*10)/10+'/'+Math.round(r.height*10)/10};
  const sc=document.querySelector('.pdfr-scroll');const vv=window.visualViewport;
  return {haut:JSON.stringify(haut),scroll:sc&&sc.scrollTop,winY:scrollY,docY:document.scrollingElement.scrollTop,vv:vv?[vv.offsetTop,vv.height,vv.pageTop]:null,
    entete:q('.pdfr-entete, .lecteur-entete, header'),barre:q('.pdfr-barre, .ptb, .pdfr-toolbar'),contexte:q('.pdfr-contexte'),rangee:q('.pdfr-rangee'),
    page1:q('.pdfr-page[data-cle="1"]'),boite:q('[data-boite="st-1"]'),scrollBox:q('.pdfr-scroll')}})()`);
const e0 = await etat();
// 1) sélection d'un mot de la diapo (couche texte pdf.js) : sélection réelle par un glisser
const mots = await b.ev(`(()=>{const sp=[...document.querySelectorAll('.pdfr-page[data-cle="1"] .pdfr-textlayer span')].filter(s=>s.textContent.trim().length>6);const s=sp[1]||sp[0];const r=s.getBoundingClientRect();return [r.left+2,r.top+r.height/2,r.left+Math.min(r.width-2,80)]})()`);
await b.ev(`window.__ajouts=[];1`);
await b.glisser([mots[0], mots[1]], [mots[2], mots[1]], 12); await b.dormir(900);
const e1 = await etat();
const a1 = await b.ev(`window.__ajouts.splice(0)`);
const sel1 = await b.ev(`String(getSelection())`);
console.log('DIAPO sélection «', sel1, '»');
for (const k of Object.keys(e0)) if (k !== 'haut' && JSON.stringify(e0[k]) !== JSON.stringify(e1[k])) console.log('  bouge', k, JSON.stringify(e0[k]), '→', JSON.stringify(e1[k]));
{ const h0 = JSON.parse(e0.haut), h1 = JSON.parse(e1.haut); for (const k of new Set([...Object.keys(h0), ...Object.keys(h1)])) if (h0[k] !== h1[k]) console.log('  haut', k.slice(0, 60), h0[k], '→', h1[k]); }
console.log('  ajouts', JSON.stringify([...new Set(a1)]));
await b.capture('sonde-tablette-diapo');
// 2) sélection dans une boîte en édition
await b.ev(`getSelection().removeAllRanges();1`); await b.dormir(400);
await b.clic(await b.pos(`document.querySelector('[data-boite="st-1"]')`, false), { att: 400 });
await b.clic(await b.pos(`document.querySelector('[data-boite="st-1"]')`, false), { att: 900 });
const e2 = await etat();
await b.ev(`window.__ajouts=[];1`);
const m2 = await b.ev(`(()=>{const p=document.querySelector('[data-boite="st-1"] .ProseMirror p');const t=p.firstChild;const r=document.createRange();r.setStart(t,3);r.setEnd(t,10);const q=r.getBoundingClientRect();return [q.left+1,q.top+q.height/2,q.right-1]})()`);
await b.glisser([m2[0], m2[1]], [m2[2], m2[1]], 10); await b.dormir(900);
const e3 = await etat();
console.log('BOÎTE sélection «', await b.ev(`String(getSelection())`), '»');
for (const k of Object.keys(e2)) if (k !== 'haut' && JSON.stringify(e2[k]) !== JSON.stringify(e3[k])) console.log('  bouge', k, JSON.stringify(e2[k]), '→', JSON.stringify(e3[k]));
{ const h0 = JSON.parse(e2.haut), h1 = JSON.parse(e3.haut); for (const k of new Set([...Object.keys(h0), ...Object.keys(h1)])) if (h0[k] !== h1[k]) console.log('  haut', k.slice(0, 60), h0[k], '→', h1[k]); }
console.log('  ajouts', JSON.stringify([...new Set(await b.ev(`window.__ajouts.splice(0)`))]));
await b.capture('sonde-tablette-boite');
process.exit(0);
