// Partie B : surligneur dans un document — mot, phrase sur deux lignes, passage à cheval sur deux pages ;
// ni extension ni flash pendant le geste ; même couleur retire / autre remplace ; le surlignage suit
// le texte ; annuler / rétablir. « Document long J » ouvert (seed-long.mjs). node t-surl-doc2.mjs [tablette]
import { banc } from './commun-doc.mjs';
import { outilsSurl } from './surl-commun.mjs';
const tab = process.argv[2] === 'tablette';
const B = await banc(tab ? 820 : 1440, tab ? 1180 : 900);
const { c, ev, ok, dormir } = B;
const U = outilsSurl(B);
if (tab) { await c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await dormir(800); }
const notions = () => ev(`(()=>{const ed=document.querySelector('.pt-flux').editor;const runs=[];ed.state.doc.descendants((n,pos)=>{if(!n.isText)return;const m=n.marks.find(x=>x.type.name==='notion');if(!m)return;const d=runs[runs.length-1];if(d&&d.id===m.attrs.id&&ed.state.doc.textBetween(d.to,pos,'')===''){d.to=pos+n.nodeSize;d.t+=(d.to-n.nodeSize>d.lastTo?' ':'')+n.text;d.lastTo=d.to}else runs.push({id:m.attrs.id,c:m.attrs.couleur,to:pos+n.nodeSize,lastTo:pos+n.nodeSize,t:n.text})});return runs.map(r=>({id:r.id,c:r.c,t:r.t}))})()`);
const resume = (l) => l.map((h) => `${h.c}:«${h.t}»`).join(' | ');
const pos = (p, m, fin = false) => ev(`(()=>{const el=[...document.querySelectorAll('.pt-flux > p')].find(x=>x.textContent.startsWith(${JSON.stringify(p)}));const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode())){const i=n.nodeValue.indexOf(${JSON.stringify(m)});if(i>=0){const k=${fin ? `i+${m.length}-1` : 'i'};const r=document.createRange();r.setStart(n,k);r.setEnd(n,k+1);const b=r.getBoundingClientRect();return [${fin ? 'b.right-1' : 'b.left+1'},b.top+b.height/2]}}return null})()`);
const voir = (p) => ev(`(()=>{const el=[...document.querySelectorAll('.pt-flux > p')].find(x=>x.textContent.startsWith(${JSON.stringify(p)}));el.scrollIntoView({block:'center'});return 1})()`).then(() => dormir(400));
const selLen = () => ev(`(()=>{const s=getSelection();const e=s.focusNode&&(s.focusNode.nodeType===1?s.focusNode:s.focusNode.parentElement);return [s.toString().length,!!(e&&e.closest('.pt-flux'))]})()`);
// geste relevé : longueur de la sélection à chaque pas ; « flash » = la sélection rétrécit de plus de 3 caractères
const geste = async (a, b, pas = 24) => {
  const tr = [];
  if (tab) {
    await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a[0], y: a[1] }] });
    for (let i = 1; i <= pas; i++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a[0] + (b[0] - a[0]) * i / pas, y: a[1] + (b[1] - a[1]) * i / pas }] }); await dormir(35); tr.push(await selLen()); }
    await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a[0], y: a[1] });
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a[0], y: a[1], button: 'left', clickCount: 1, buttons: 1 });
    for (let i = 1; i <= pas; i++) { await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a[0] + (b[0] - a[0]) * i / pas, y: a[1] + (b[1] - a[1]) * i / pas, button: 'left', buttons: 1 }); await dormir(35); tr.push(await selLen()); }
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b[0], y: b[1], button: 'left', clickCount: 1 });
  }
  await dormir(700);
  const lens = tr.map((x) => x[0]);
  let flash = 0; for (let i = 1; i < lens.length; i++) if (lens[i] < lens[i - 1] - 3) flash++;
  return { max: Math.max(...lens), dernier: lens[lens.length - 1], flash, horsTexte: tr.filter((x) => x[0] && !x[1]).length };
};
if (tab) { await ev(`(()=>{const b=document.querySelector('button[aria-label="Surligneur"]');b.click();return 1})()`); await dormir(400); }
else await U.outil('Surligneur');
await U.couleur('Ambre');
// 1. un mot
await voir('Paragraphe 2.');
let g = await geste(await pos('Paragraphe 2.', 'glucose'), await pos('Paragraphe 2.', 'glucose', true), 8);
let l = await notions();
ok(l.length === 1 && l[0].t === 'glucose' && !g.flash && !g.horsTexte, '1. un mot', `${resume(l)} · max ${g.max}, flashs ${g.flash}`);
// 2. une phrase sur deux lignes
await voir('Paragraphe 3.');
g = await geste(await pos('Paragraphe 3.', 'transforme'), await pos('Paragraphe 3.', 'mitochondrie', true), 24);
l = await notions();
const phrase = l.find((h) => h.t.startsWith('transforme'));
ok(!!phrase && phrase.t.endsWith('mitochondrie') && !g.flash && g.max <= g.dernier + 1 && !g.horsTexte, '2. une phrase sur deux lignes', `«${phrase && phrase.t}» · max ${g.max} / fin ${g.dernier}, flashs ${g.flash}`);
await B.capture('surl-doc-2lignes' + (tab ? '-tab' : ''));
// 3. à cheval sur deux pages (fin de la page 1 → début de la page 2), en traversant marges et écart
await voir('Paragraphe 14.');
const pages = await ev(`(()=>{const pm=document.querySelector('.pt-flux');const r=pm.pagination.res.pages;const o={};pm.editor.state.doc.forEach((n,p,i)=>{if(/^Paragraphe 1[45]\\./.test(n.textContent))o[n.textContent.slice(0,14)]=r[i]});return o})()`);
g = await geste(await pos('Paragraphe 14.', 'cytosol'), await pos('Paragraphe 15.', 'glucose', true), 36);
l = await notions();
const cheval = l.find((h) => h.t.startsWith('cytosol'));
ok(pages['Paragraphe 14.'] === 0 && pages['Paragraphe 15.'] === 1 && !!cheval && cheval.t.endsWith('glucose') && !g.flash && g.max <= g.dernier + 1 && !g.horsTexte, '3. passage à cheval sur deux pages : ni extension à la page, ni flash', `pages ${JSON.stringify(pages)} · «${cheval && cheval.t.slice(0, 40)}…${cheval && cheval.t.slice(-20)}» · max ${g.max} / fin ${g.dernier}, flashs ${g.flash}`);
await B.capture('surl-doc-2pages' + (tab ? '-tab' : ''));
// 4. même couleur sur le milieu de la phrase → retiré (scindé) ; autre couleur → remplacée
await voir('Paragraphe 3.');
await geste(await pos('Paragraphe 3.', 'pyruvate'), await pos('Paragraphe 3.', 'pyruvate', true), 8);
l = await notions();
ok(!l.some((h) => /pyruvate dans/.test(h.t)) && l.some((h) => h.t.startsWith('transforme')) && l.some((h) => h.t.endsWith('mitochondrie')), '4a. même couleur au milieu → retiré, scindé', resume(l));
await U.couleur('Vert sauge');
await geste(await pos('Paragraphe 3.', 'cytosol'), await pos('Paragraphe 3.', 'NADH', true), 12);
l = await notions();
const vert = l.find((h) => h.t.startsWith('cytosol et'));
ok(!!vert && vert.c !== 'ambre' && !l.some((h) => h.c === 'ambre' && !h.t.includes('Paragraphe 15') && h.t.includes('ATP')), '4b. autre couleur → remplacée (une seule couche)', resume(l));
const avant6 = await notions();
// 6. annuler / rétablir (le journal du document)
await ev(`document.activeElement&&document.activeElement.blur&&document.activeElement.blur(),1`);
for (let i = 0; i < 2; i++) { await B.touche('z', { meta: true, code: 'KeyZ', vk: 90 }); await dormir(500); }
const annule = await notions();
for (let i = 0; i < 2; i++) { await B.touche('z', { meta: true, shift: true, code: 'KeyZ', vk: 90 }); await dormir(500); }
const retabli = await notions();
ok(resume(annule) !== resume(retabli) && resume(retabli) === resume(avant6), '6. ⌘Z / ⇧⌘Z sur les surlignages', `annulé : ${resume(annule).slice(0, 120)}…`);
// 5. le surlignage SUIT le texte : on ajoute un long paragraphe au début → repagination
const avant = JSON.stringify(await notions());
if (tab) { await ev(`(()=>{const b=document.querySelector('button[aria-label="Sélection"]');b.click();return 1})()`); await dormir(300); } else await U.outil('Sélection');
await voir('Paragraphe 1.');
await B.clic(await pos('Paragraphe 1.', 'Paragraphe'), { att: 300 });
await B.touche('Home', { vk: 36, code: 'Home' });
await B.ecrire('Ajout en tête : ' + 'texte inséré pour décaler la pagination. '.repeat(6) + '\n');
await dormir(1500);
const apres = await notions();
const pages2 = await ev(`(()=>{const pm=document.querySelector('.pt-flux');const r=pm.pagination.res.pages;const o={};pm.editor.state.doc.forEach((n,p,i)=>{if(/^Paragraphe 1[45]\\./.test(n.textContent))o[n.textContent.slice(0,14)]=r[i]});return o})()`);
ok(JSON.stringify(apres.map((h) => [h.c, h.t])) === JSON.stringify(JSON.parse(avant).map((h) => [h.c, h.t])), '5. texte inséré avant : les surlignages suivent leurs mots (même texte, même couleur)', `pagination ${JSON.stringify(pages)} → ${JSON.stringify(pages2)}`);
// 7. notions enregistrées = passages surlignés
await dormir(2500);
const recs = await B.S(`return (await S.getAll('highlights')).filter(h=>h.ficheId==='j-long'&&h.source==='doc').length`);
ok(recs === apres.length, '7. panneau Notions : une notion par passage', `${recs} enregistrements / ${apres.length} passages`);
ok(!B.erreurs.length, 'aucune exception JS', B.erreurs.join(' | '));
c.fermer();
