// v1.1 — MENU « AMORCE » du formulaire flashcard dans un panneau de 360 px (docs/compte-rendu-tableau-flashcards.md
// « v1.1 — corrections ») : entièrement visible, ≥ 320 px, dans un portail au-dessus de tout, défilement interne,
// insertion au recto qui marche toujours.   Usage : node t-amorce.mjs <prefixe-captures> [ipad|mobile]
import { banc, semer, ouvrirFlashcards } from '../tests-flashcards-refonte/commun.mjs';
const pref = process.argv[2] || 'v11-amorce';
const app = process.argv[3] || 'ordinateur';
const b = await banc(1440, 900, { tactile: app !== 'ordinateur' });
await semer(b);
await b.ev(`localStorage.removeItem('medrevise.amorcesFavoris');1`);
const tape = await ouvrirFlashcards(b, { appareil: app });
const largeur = (w) => b.ev(`(()=>{const p=document.querySelector('.pis');const poignee=p.getBoundingClientRect().width-document.querySelector('.pis-body').getBoundingClientRect().width;const t=${w}+poignee;
  if(document.querySelector('.lecteur-tab'))p.style.justifySelf='end';p.style.flex='0 0 '+t+'px';p.style.width=t+'px';p.style.maxWidth=t+'px';return 1})()`);
for (const w of [360, 320]) {
  await largeur(w); await b.dormir(700);
  if (!(await b.ev(`!!document.querySelector('.pis-add.fc-carte')`))) { await tape(await b.pos(`document.querySelector('[data-act="nouvelle"]')`, false)); await b.dormir(600); }
  await b.ev(`(()=>{const x=document.querySelector('.pis-add.fc-carte .mam-bouton');const z=x.closest('.pis-scroll');if(z){const r=x.getBoundingClientRect(),q=z.getBoundingClientRect();z.scrollTop+=r.top-q.top-60}return 1})()`); await b.dormir(300);
  await tape(await b.pos(`document.querySelector('.pis-add.fc-carte .mam-bouton')`, false)); await b.dormir(500);
  const m = await b.ev(`(()=>{const m=document.querySelector('.mam-menu');if(!m)return null;const r=m.getBoundingClientRect(),P=document.querySelector('.pis-body').getBoundingClientRect(),F=document.querySelector('.pis-add.fc-carte').getBoundingClientRect();
    const l=m.querySelector('.mam-liste');const txt=[...m.querySelectorAll('.mam-txt')];
    const dessus=document.elementFromPoint(r.left+r.width/2,r.top+20);
    return {w:Math.round(r.width),l:Math.round(r.left),r:Math.round(r.right),t:Math.round(r.top),b:Math.round(r.bottom),vw:innerWidth,vh:innerHeight,panneau:[Math.round(P.left),Math.round(P.right)],formulaire:[Math.round(F.left),Math.round(F.right)],
      portail:!m.closest('.pis'),dessus:!!(dessus&&m.contains(dessus)),defile:getComputedStyle(l).overflowY,deborde:l.scrollHeight>l.clientHeight,
      tronques:txt.filter(x=>x.scrollWidth>x.clientWidth+1).map(x=>x.textContent).slice(0,3),n:txt.length}})()`);
  b.ok(m && m.w >= 320 && m.l >= 0 && m.r <= m.vw && m.t >= 0 && m.b <= m.vh && m.l >= m.panneau[0] - 1 && m.r <= m.panneau[1] + 1 && m.portail && m.dessus && m.defile === 'auto' && !m.tronques.length,
    `panneau de ${w} px : menu Amorce entièrement visible (${m && m.w} px, dans la largeur du panneau), portail au-dessus de tout, défilement interne, aucun libellé tronqué`, JSON.stringify(m));
  if (w === 360) await b.capture(`${pref}-${app}`, await b.ev(`(()=>{const P=document.querySelector('.pis-body').getBoundingClientRect(),m=document.querySelector('.mam-menu').getBoundingClientRect(),F=document.querySelector('.pis-add.fc-carte').getBoundingClientRect();const y=Math.max(0,Math.min(F.top,m.top)-10);return {x:Math.round(P.left-10),y:Math.round(y),width:Math.round(P.width+20),height:Math.round(Math.min(innerHeight-y,Math.max(m.bottom,F.top+200)-y+10))}})()`));
  // la recherche au clavier et l'insertion au recto
  await b.ev(`(()=>{const i=document.querySelector('.mam-recherche');i.focus();return 1})()`);
  await b.ev(`document.execCommand('insertText',false,'innerv')`); await b.dormir(300);
  const vus = await b.ev(`[...document.querySelectorAll('.mam-txt')].map(x=>x.textContent)`);
  await tape(await b.pos(`document.querySelector('.mam-txt')`, false)); await b.dormir(400);
  const recto = await b.ev(`(()=>{const f=document.querySelector('.pis-add.fc-carte');const t=f.querySelector('textarea, [contenteditable="true"]');return t?(t.value!==undefined?t.value:t.innerText):''})()`);
  b.ok(vus.length === 1 && /innervation/.test(vus[0]) && /innervation de/.test(recto) && !(await b.ev(`!!document.querySelector('.mam-menu')`)), 'recherche au clavier dans le portail, puis insertion au recto (le menu se ferme)', JSON.stringify({ vus, recto }));
  await b.ev(`(()=>{const f=document.querySelector('.pis-add.fc-carte');const t=f.querySelector('textarea');if(t){const P=HTMLTextAreaElement.prototype;Object.getOwnPropertyDescriptor(P,'value').set.call(t,'');t.dispatchEvent(new Event('input',{bubbles:true}))}return 1})()`);
}
// clic hors du menu : il se ferme ; Échap aussi
await tape(await b.pos(`document.querySelector('.pis-add.fc-carte .mam-bouton')`, false)); await b.dormir(400);
await b.T.Escape(); await b.dormir(300);
const fermeEchap = !(await b.ev(`!!document.querySelector('.mam-menu')`));
const formOuvert = await b.ev(`!!document.querySelector('.pis-add.fc-carte')`);
b.ok(fermeEchap && formOuvert, 'Échap ferme le menu sans fermer le formulaire', JSON.stringify({ fermeEchap, formOuvert }));
await b.ev(`(()=>{const p=document.querySelector('.pis');p.style.flex='';p.style.width='';p.style.maxWidth='';p.style.justifySelf='';return 1})()`);
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
