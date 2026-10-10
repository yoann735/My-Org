// glisse au surligneur de (mot1 dans P_a) à (mot2 dans P_b) LENTEMENT, en relevant la sélection à chaque pas
// node sonde-surl.mjs "<début P départ>" mot1 "<début P arrivée>" mot2 [pas]
import { banc } from './commun-doc.mjs';
import { outilsSurl } from './surl-commun.mjs';
const B = await banc();
const { c, ev, dormir } = B;
const U = outilsSurl(B);
const [pa, m1, pb, m2, pasArg] = process.argv.slice(2);
await U.outil('Surligneur');
await ev(`window.__sonde=[];(()=>{const obs=new MutationObserver(m=>{window.__mut=(window.__mut||0)+m.length});obs.observe(document.querySelector('.pdfr-pages'),{subtree:true,childList:true,attributes:true});window.__obs=obs})();1`);
const pos = (p, m) => ev(`(()=>{const el=[...document.querySelectorAll('.pt-flux > p')].find(x=>x.textContent.startsWith(${JSON.stringify(p)}));const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode())){const i=n.nodeValue.indexOf(${JSON.stringify(m)});if(i>=0){const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+1);const b=r.getBoundingClientRect();return [b.left+1,b.top+b.height/2]}}return null})()`);
await ev(`(()=>{const el=[...document.querySelectorAll('.pt-flux > p')].find(x=>x.textContent.startsWith(${JSON.stringify(pa)}));el.scrollIntoView({block:'center'});return 1})()`); await dormir(500);
const a = await pos(pa, m1), b = await pos(pb, m2);
const releve = () => ev(`(()=>{const s=getSelection();const cl=(n)=>{const e=n&&(n.nodeType===1?n:n.parentElement);return e?(e.closest('.pt-flux')?'flux':e.closest('.pdfr-page')?'page':e.className||e.tagName):null};const pm=document.querySelector('.pt-flux').editor;return {len:s.toString().length,anc:cl(s.anchorNode),foc:cl(s.focusNode),pm:pm.state.selection.to-pm.state.selection.from,mut:window.__mut||0}})()`);
const pas = Number(pasArg || 24);
await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a[0], y: a[1] });
await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a[0], y: a[1], button: 'left', clickCount: 1, buttons: 1 });
const traces = [];
for (let i = 1; i <= pas; i++) {
  const x = a[0] + (b[0] - a[0]) * i / pas, y = a[1] + (b[1] - a[1]) * i / pas;
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
  await dormir(40);
  traces.push({ i, x: Math.round(x), y: Math.round(y), ...(await releve()) });
}
// attendu : jamais plus que la distance réelle entre les deux mots
const attendu = await ev(`(()=>{const ed=document.querySelector('.pt-flux').editor;let s=0,e=0;ed.state.doc.descendants((n,pos)=>{if(!n.isText)return;const t=n.text;if(!s&&t.startsWith(${JSON.stringify(pa)}))s=pos+t.indexOf(${JSON.stringify(m1)});if(t.startsWith(${JSON.stringify(pb)}))e=pos+t.indexOf(${JSON.stringify(m2)})});return e-s})()`);
await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b[0], y: b[1], button: 'left', clickCount: 1 });
await dormir(700);
const fin = await B.S(`return 1`);
console.log('distance attendue ≈', attendu);
for (const t of traces) console.log(JSON.stringify(t));
console.log('notions :', await ev(`(()=>{const ed=document.querySelector('.pt-flux').editor;const r=[];ed.state.doc.descendants((n)=>{if(!n.isText)return;const m=n.marks.find(x=>x.type.name==='notion');if(m)r.push(n.text.slice(0,30)+'…('+n.text.length+')')});return r})()`));
c.fermer();
