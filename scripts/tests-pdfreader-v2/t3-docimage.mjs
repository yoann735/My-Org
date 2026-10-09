import { banc } from './commun-doc.mjs';
import { glisserAvec, collerImage } from './outils-glisser.mjs';
import fs from 'fs';
const b = await banc();
const glisser = glisserAvec(b);
const png = fs.readFileSync('../fx/png.b64', 'utf8');
if (!(await b.ev(`!!document.querySelector('.pti')`))) {
  // curseur à la fin du 3e paragraphe puis ⌘V
  const p = await b.pos(`document.querySelectorAll('.pt-flux p')[2]`);
  await b.clic(p); await b.touche('End', { vk: 35 });
  await collerImage(b, png);
}
for (let i = 0; i < 30 && !(await b.ev(`!!document.querySelector('.pti .pti-ocr.pret')`)); i++) await b.dormir(2000);
b.ok(await b.ev(`!!document.querySelector('.pti .pti-ocr.pret')`), 'image collée dans le document, texte reconnu');
const mot = (t) => b.ev(`(()=>{const s=[...document.querySelectorAll('.pti .pti-mot')].find(e=>e.textContent.trim().startsWith(${JSON.stringify(t)}));if(!s)return null;s.scrollIntoView({block:'center'});const r=s.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]})()`);
const notions = () => b.ev(`[...document.querySelectorAll('.pti .pti-notion')].map(e=>getComputedStyle(e).getPropertyValue('--nc').trim())`);
b.ok(!(await b.ev(`!!document.querySelector('.pti.texte-actif')`)), 'icône « texte » NON activée');
await b.clic(await b.bouton('Surligneur'), { att: 600 });
console.log('outil', await b.ev(`document.querySelector('.ptb-outil.actif')?.title.slice(0,12)`), await b.ev(`document.querySelector('.pdfr-contexte')?.innerText.slice(0,40)`));
await b.clic(await b.pos(`document.querySelectorAll('.pdfr-contexte .sc-pastille')[0]`));
// départ propre : aucune notion sur l'image
await b.ev(`(()=>{const pm=document.querySelector('.pt-flux-cadre .ProseMirror');const ed=pm.editor;let p=null;ed.state.doc.descendants((n,pos)=>{if(n.type.name==='image'&&p==null)p=pos});if(p!=null){const n=ed.state.doc.nodeAt(p);ed.view.dispatch(ed.state.tr.setNodeMarkup(p,undefined,{...n.attrs,notions:[]}))}return 1})()`);
let a = await mot('Elle'), z = await mot('molécules');
await glisser([a[0] + 2, (a[1] + a[3]) / 2], [z[2] - 2, (z[1] + z[3]) / 2]);
let n1 = await notions();
b.ok(n1.length >= 3, 'surligneur sur les mots de l’image : notion posée', n1.join(','));
// alignement : boîte de notion sur le mot « Elle »
const al = await b.ev(`(()=>{const m=[...document.querySelectorAll('.pti .pti-mot')].find(e=>e.textContent.trim().startsWith('Elle')).getBoundingClientRect();const n=[...document.querySelectorAll('.pti .pti-notion')].map(e=>e.getBoundingClientRect()).find(r=>Math.abs(r.top-m.top)<m.height);return n?Math.round(Math.max(Math.abs(n.left-m.left),Math.abs(n.top-m.top))*10)/10:null})()`);
b.ok(al != null && al < 3, 'notion alignée sur le mot', al + ' px');
await b.capture('apres-hl-docimage');
// recolorer : 3e pastille
await b.clic(await b.pos(`document.querySelectorAll('.pdfr-contexte .sc-pastille')[2]`));
a = await mot('Elle'); z = await mot('molécules');
await glisser([a[0] + 2, (a[1] + a[3]) / 2], [z[2] - 2, (z[1] + z[3]) / 2]);
const n2 = await notions();
b.ok(n2.length === n1.length && n2[0] !== n1[0], 'repasser dans une autre couleur : recolorée', n2[0]);
await glisser([a[0] + 2, (a[1] + a[3]) / 2], [z[2] - 2, (z[1] + z[3]) / 2]);
b.ok((await notions()).length === 0, 'repasser dans la même couleur : retirée');
// Sélection → bulle Notion / Flashcard / Copier
await b.clic(await b.bouton('Sélection'));
a = await mot('La'); z = await mot('phosphofructokinase');
await glisser([a[0] + 2, (a[1] + a[3]) / 2], [z[2] - 2, (z[1] + z[3]) / 2]);
const bulle = await b.ev(`[...document.querySelectorAll('.pti-bulle button')].map(x=>x.innerText)`);
if (!bulle.length) console.log('état', await b.ev(`({sel:getSelection().toString().slice(0,50),outil:document.querySelector('.pt-flux-cadre').dataset.outil,cls:document.querySelector('.pti').className})`), a, z);
b.ok(bulle.join() === 'Notion,Flashcard,Copier', 'sélection → bulle habituelle', bulle.join(' · '));
await b.capture('apres-docimage-bulle');
await b.clic(await b.pos(`[...document.querySelectorAll('.pti-bulle button')].find(x=>x.innerText==='Notion')`), { att: 1500 });
b.ok((await notions()).length >= 2, 'Notion depuis la sélection');
// zoom : alignement
for (const lab of ['Zoomer', 'Dézoomer', 'Dézoomer']) {
  await b.clic(await b.bouton(lab), { att: 700 });
  const e = await b.ev(`(()=>{const m=[...document.querySelectorAll('.pti .pti-mot')].find(e=>e.textContent.trim().startsWith('phosphofructokinase')).getBoundingClientRect();const n=[...document.querySelectorAll('.pti .pti-notion')].map(e=>e.getBoundingClientRect()).filter(r=>Math.abs(r.top-m.top)<m.height).sort((x,y)=>Math.abs(x.left-m.left)-Math.abs(y.left-m.left))[0];return n?Math.round(Math.max(Math.abs(n.left-m.left),Math.abs(n.top-m.top),Math.abs(n.bottom-m.bottom))*10)/10:null})()`);
  b.ok(e != null && e < 3, 'alignement après ' + lab + ' (zoom ' + await b.ev(`document.querySelector('.ptb-zoom .tnum').innerText`) + ')', e + ' px');
}
// panneau Notions : la notion de l'image y est
await b.dormir(1500);
await b.clic(await b.pos(`[...document.querySelectorAll('button,[role=tab]')].find(x=>x.innerText.trim().startsWith('Notions'))`), { att: 800 });
const panneau = await b.ev(`document.querySelector('.pis, .pdfr-panel, aside')?document.body.innerText.includes('La phosphofructokinase'):false`);
await b.capture('apres-docimage-panneau');
b.ok(panneau, 'notion de l’image listée dans le panneau Notions');
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
b.c.fermer();
