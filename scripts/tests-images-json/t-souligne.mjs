// Chantier 2 : soulignement et surligneur de fond (barre de mise en forme) — même règle.
// Pré-requis : « Document neuf J » ouvert.
import { banc } from './commun-doc.mjs';
const B = await banc();
const { ev, ok, dormir, clic } = B;
await ev(`(()=>{const b=document.querySelector('button.ptb-outil[title^="Sélection"]');b&&b.click();return 1})()`); await dormir(300);
// curseur dans le texte (la barre de mise en forme apparaît), puis sélection par l'éditeur
const p = await ev(`(()=>{const el=[...document.querySelectorAll('.pt-flux > p')].find(x=>x.textContent.startsWith('Paragraphe 3.'));el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return [r.x+40,r.y+8]})()`);
await clic(p, { att: 500 });
const plage = (a, b) => ev(`(()=>{const ed=document.querySelector('.pt-flux').editor;let base=null;ed.state.doc.forEach((n,pos)=>{if(n.textContent.startsWith('Paragraphe 3.'))base=pos+1});const t=ed.state.doc.textBetween(base,base+200);const x=base+t.indexOf(${JSON.stringify(a)}),y=base+t.indexOf(${JSON.stringify(b)})+${JSON.stringify(b)}.length;ed.commands.setTextSelection({from:x,to:y});return [x,y]})()`);
const marques = (nom, attr) => ev(`(()=>{const ed=document.querySelector('.pt-flux').editor;let base=null;ed.state.doc.forEach((n,pos)=>{if(n.textContent.startsWith('Paragraphe 3.'))base=pos});const node=ed.state.doc.nodeAt(base);const out=[];node.forEach((t)=>{const m=t.marks.find(m=>m.type.name===${JSON.stringify(nom)}${attr ? `&&m.attrs.${attr}` : ''});if(m)out.push((${attr ? `m.attrs.${attr}` : "'U'"})+':«'+t.text+'»')});return out})()`);
const bouton = (t) => B.pos(`[...document.querySelectorAll('.pdfr-edit-toolbar button')].find(b=>(b.title||'').startsWith(${JSON.stringify(t)}))`, false);
// SOULIGNÉ
await plage('cycle', 'matrice'); await clic(await bouton('Souligné'), { att: 300 });
let m = await marques('underline');
ok(m.length === 1 && m[0].includes('cycle de Krebs se déroule dans la matrice'), 'U1. souligné', JSON.stringify(m));
await plage('Krebs', 'Krebs'); await clic(await bouton('Souligné'), { att: 300 });
m = await marques('underline');
ok(m.length === 2 && !m.some((x) => x.includes('Krebs')), 'U2. resouligner le milieu → retiré sur la portion (scindé)', JSON.stringify(m));
await plage('cycle', 'matrice'); await clic(await bouton('Souligné'), { att: 300 });
m = await marques('underline');
ok(m.length === 1 && m[0].includes('cycle de Krebs se déroule dans la matrice'), 'U3. passage partiellement souligné → souligné en entier (fusion)', JSON.stringify(m));
// SURLIGNEUR DE FOND
const fond = async (nom) => { await clic(await bouton('Surligneur de fond'), { att: 400 }); await clic(await B.pos(`[...document.querySelectorAll('button')].find(b=>(b.title||'').startsWith(${JSON.stringify(nom)})&&b.offsetParent)`, false), { att: 400 }); };
await plage('oxyde', 'CO2'); await fond('Ambre');
m = await marques('textStyle', 'backgroundColor');
ok(m.length === 1, 'F1. fond ambre', JSON.stringify(m));
await plage('acétyl', 'acétyl'); await fond('Ambre');
m = await marques('textStyle', 'backgroundColor');
ok(m.length === 2 && !m.some((x) => x.includes('acétyl')), 'F2. même couleur au milieu → retiré sur la portion', JSON.stringify(m));
await plage('en CO2', 'CO2'); await fond('Vert sauge');
m = await marques('textStyle', 'backgroundColor');
ok(m.length === 3 && m.filter((x) => x.includes('CO2')).length === 1 && !m.find((x) => x.includes('CO2')).startsWith(m[0].split(':')[0]), 'F3. autre couleur → remplacée (une couche)', JSON.stringify(m));
await B.capture('souligne-fond', { x: 150, y: 300, width: 900, height: 250 });
ok(!B.erreurs.length, 'aucune exception JS', B.erreurs.join(' | '));
B.c.fermer();
