// Surlignage sur la couche OCR (un mot = un span) : node t-surlignage-ocr.mjs <avant|apres>
// Cours de test « Physiologie rénale (scan) » (f-fjs, base locale du banc) ; les surlignages créés ici sont retirés à la fin.
import { banc } from './commun.mjs';
const v = process.argv[2] || 'apres';
const b = await banc();
const FJ = 'f-fjs';
const avantIds = new Set(await b.S(`return (await S.getAll('highlights')).filter(h=>h.ficheId===${JSON.stringify(FJ)}).map(h=>h.id)`));
await b.ev(`localStorage.setItem('medrevise.disposition.${FJ}','pdf');1`);
await b.S(`for(const r of await S.getAll('reading_position'))if(String(r.id).startsWith('rp:${FJ}'))await S.remove('reading_position',r.id);return 1`);
await b.biblio({ recharger: true });
await b.ouvrir('Physiologie rénale (scan)'); await b.dormir(2500);
await b.ev(`window.__mrZoom(1);1`); await b.dormir(1200);
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0;1`); await b.dormir(1500);
// une ligne de mots OCR de la page 1 (au moins 3 mots)
const ligne = await b.ev(`(()=>{const sp=[...document.querySelectorAll('.pdfr-page[data-cle="1"] .pdfr-textlayer span')].filter(s=>s.textContent.trim());
  const L=new Map();for(const s of sp){const r=s.getBoundingClientRect();const k=Math.round((r.top+r.height/2)/6);(L.get(k)||L.set(k,[]).get(k)).push({s,r})}
  const P=document.querySelector('.pdfr-page[data-cle="1"]').getBoundingClientRect();
  const l=[...L.values()].filter(x=>x.length>=4&&x[0].r.top>P.top+P.height*0.25).sort((a,b)=>a[0].r.top-b[0].r.top)[0];if(!l)return null;l.sort((a,b)=>a.r.left-b.r.left);
  const a=l[0].r,z=l[Math.min(l.length-1,4)].r;return {n:l.length,mots:l.slice(0,5).map(x=>x.s.textContent),de:[a.left+1,a.top+a.height/2],a:[z.right-1,z.top+z.height/2],h:a.height}})()`);
console.log('ligne OCR :', JSON.stringify(ligne));
await b.ev(`(()=>{const x=[...document.querySelectorAll('.ptb-outil')].find(e=>(e.title||'').startsWith('Surligneur'));x.click();return 1})()`); await b.dormir(400);
await b.glisser(ligne.de, ligne.a, 14); await b.dormir(800);
await b.ev(`window.getSelection().removeAllRanges();1`);
await b.ev(`(()=>{const x=[...document.querySelectorAll('.ptb-outil')].find(e=>(e.title||'').startsWith('Sélection'));x.click();return 1})()`); await b.dormir(600);
{ const fs = await import('node:fs'); const r = await b.c.send('Page.captureScreenshot', { format: 'png', clip: { x: Math.round(ligne.de[0] - 20), y: Math.round(ligne.de[1] - 22), width: Math.round(ligne.a[0] - ligne.de[0] + 40), height: 44, scale: 2 } });
  fs.writeFileSync(`../cap/so-${v}-surlignage-ocr.png`, Buffer.from(r.data, 'base64')); }
const nouveaux = (await b.S(`return (await S.getAll('highlights')).filter(h=>h.ficheId===${JSON.stringify(FJ)})`)).filter((h) => !avantIds.has(h.id));
const rects = await b.ev(`[...document.querySelectorAll('.pdfr-page[data-cle="1"] .pdfr-hlayer .pdfr-hl-rect')].filter(e=>${JSON.stringify(nouveaux.map((h) => h.id))}.includes(e.dataset.hl)||!e.dataset.hl).map(e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);return {x:Math.round(r.x),w:Math.round(r.width),y:+r.y.toFixed(1),h:+r.height.toFixed(1),rayon:c.borderTopLeftRadius}})`);
console.log('surlignages créés :', nouveaux.length, nouveaux.map((h) => JSON.stringify({ texte: h.texte, rects: h.rects.length })).join(' '));
console.log('rectangles affichés :', JSON.stringify(rects));
await b.S(`for(const h of await S.getAll('highlights'))if(h.ficheId===${JSON.stringify(FJ)}&&!${JSON.stringify([...avantIds])}.includes(h.id))await S.remove('highlights',h.id);return 1`);
console.log('erreurs', b.erreurs);
process.exit(0);
