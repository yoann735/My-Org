// node conformite.mjs <titre> [prefixe] — CONFORMITÉ DE L'EXPORT PDF (moteur paginé, 08/10)
// 1. structure : par page, mêmes blocs (et morceaux de blocs coupés), même ordre, même position (DOM écran vs DOM imprimé)
// 2. visuel : profil d'encre de chaque page, capture de l'écran vs rendu pdf.js du PDF exporté — écart des bords ≤ 2 px
import { banc } from './commun-doc.mjs';
import fs from 'fs';
import { execSync } from 'child_process';
const [TITRE, pref = 'conf'] = process.argv.slice(2);
execSync(`node ouvrir-cours.mjs ${JSON.stringify(TITRE)} --recharger`, { stdio: 'ignore' });
const B = await banc(1440, 1400);
const { c, ev, clic, pos, dormir } = B;
await dormir(2500);
const SC = `document.querySelector('.pdfr-workshop-course')`;
await ev(`(()=>{document.activeElement&&document.activeElement.blur&&document.activeElement.blur();const pm=document.querySelector('.pt-flux.ProseMirror');pm.editor.commands.setTextSelection(1);pm.editor.commands.blur();getSelection().removeAllRanges();return 1})()`);
await dormir(400);
// structure : morceaux de blocs par page (y en unités de page, 842 = hauteur A4)
const STRUCT = (racine) => `(()=>{
  const out=[];
  const cad=document.querySelector('.pdfr-pages > .pt-flux-cadre');const ech=cad?cad.querySelector('.ProseMirror').getBoundingClientRect().width/cad.querySelector('.ProseMirror').offsetWidth:1;
  const NB=Number(([...document.querySelectorAll('span,div')].find(e=>e.children.length===0&&/^\\d+\\s*\\/\\s*\\d+$/.test((e.innerText||'').trim()))||{innerText:'0/0'}).innerText.split('/')[1]);
  const pages=${racine === 'ecran' ? `Array.from({length:NB},(_,k)=>({getBoundingClientRect:()=>{const c=cad.getBoundingClientRect();return{top:c.top+k*860*ech,bottom:c.top+(k*860+842)*ech,height:842*ech}}}))` : `[...document.querySelectorAll('.pdfr-impression-pages > .pdfr-page')]`};
  const flux=(pg)=>${racine === 'ecran' ? `document.querySelector('.pdfr-pages > .pt-flux-cadre .ProseMirror')` : `pg.querySelector('.pt-flux-impression .ProseMirror')`};
  pages.forEach((pg,k)=>{
    const R=pg.getBoundingClientRect();const u=R.height/842;const pm=flux(pg);const liste=[];
    [...pm.children].filter(e=>!e.classList.contains('pt-saut')).forEach((b,i)=>{
      let m=[];
      if(['P','H1','H2','H3'].includes(b.tagName)){const r=document.createRange();const w=document.createTreeWalker(b,NodeFilter.SHOW_TEXT);let t;while((t=w.nextNode())){if(!t.length)continue;r.selectNodeContents(t);for(const q of r.getClientRects())if(q.height&&!m.some(x=>Math.abs(x.top-q.top)<2))m.push({top:q.top,bottom:q.bottom})}}
      else if(['UL','OL','BLOCKQUOTE'].includes(b.tagName))m=[...b.children].filter(c=>!c.classList.contains('pt-saut-ligne')).map(c=>c.getBoundingClientRect());
      else{const q=(b.querySelector('.pti-cadre')||b).getBoundingClientRect();if(q.height>1)m=[q]}
      const ici=m.filter(q=>q.top+1>=R.top&&q.top<R.bottom-1);
      if(ici.length)liste.push({b:i,t:b.classList.contains('pti')?'IMG':b.tagName,n:ici.length,y:+((ici[0].top-R.top)/u).toFixed(2)});
    });
    out.push(liste);
  });
  return JSON.stringify(out);
})()`;
const ecran = JSON.parse(await ev(STRUCT('ecran')));
// visuel, écran : chaque page capturée à sa taille d'affichage
await ev(`window.__prof={ecran:[],pdf:[]};1`);
// zoom : une page entière visible dans la zone de lecture
for (let z = 0; z < 12; z++) {
  const tient = await ev(`(()=>{const p=document.querySelector('.pdfr-workshop-course .pdfr-page[data-cle]').getBoundingClientRect();return p.height<${SC}.clientHeight-30})()`);
  if (tient) break;
  await ev(`[...document.querySelectorAll('button')].find(b=>(b.title||'').startsWith('Dézoomer'))?.click();1`); await dormir(350);
}
await dormir(800);
const PROFIL = `async function profil(src,W){const im=await createImageBitmap(src);const cv=document.createElement('canvas');cv.width=W;cv.height=Math.round(im.height*W/im.width);const g=cv.getContext('2d');g.drawImage(im,0,0,cv.width,cv.height);const d=g.getImageData(0,0,cv.width,cv.height).data;const bg=[d[(5*cv.width+5)*4],d[(5*cv.width+5)*4+1],d[(5*cv.width+5)*4+2]];const lignes=[];for(let y=0;y<cv.height;y++){let n=0;for(let x=8;x<cv.width-8;x++){const o=(y*cv.width+x)*4;if(Math.abs(d[o]-bg[0])+Math.abs(d[o+1]-bg[1])+Math.abs(d[o+2]-bg[2])>120)n++}lignes.push(n)}const runs=[];let deb=-1,vide=0;for(let y=0;y<lignes.length;y++){if(lignes[y]>0){if(deb<0)deb=y;vide=0}else if(deb>=0){vide++;if(vide>2){runs.push([deb,y-vide]);deb=-1;vide=0}}}if(deb>=0)runs.push([deb,lignes.length-1]);return{h:cv.height,runs}}`;
const nb = ecran.length;
let W = 0;
for (let k = 0; k < nb; k++) {
  const PAGEK = `(()=>{const cad=document.querySelector('.pdfr-pages > .pt-flux-cadre').getBoundingClientRect();const pm=document.querySelector('.pdfr-pages > .pt-flux-cadre .ProseMirror');const e=pm.getBoundingClientRect().width/pm.offsetWidth;const y=cad.top+${k}*860*e;return [...document.querySelectorAll('.pdfr-workshop-course .pdfr-page[data-cle]')].find(p=>Math.abs(p.getBoundingClientRect().top-y)<3)})()`;
  await ev(`(()=>{const cad=document.querySelector('.pdfr-pages > .pt-flux-cadre').getBoundingClientRect();const pm=document.querySelector('.pdfr-pages > .pt-flux-cadre .ProseMirror');const e=pm.getBoundingClientRect().width/pm.offsetWidth;${SC}.scrollTop+=cad.top+${k}*860*e-${SC}.getBoundingClientRect().top-10;return 1})()`);
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 3, y: 1390 });
  await dormir(700);
  const r = JSON.parse(await ev(`(()=>{const p=${PAGEK}.getBoundingClientRect();return JSON.stringify([p.x,p.y,p.width,p.height])})()`));
  W = Math.round(r[2]);
  const s = await c.send('Page.captureScreenshot', { format: 'png', clip: { x: r[0], y: r[1], width: r[2], height: r[3], scale: 1 } });
  fs.writeFileSync(`../../../cap-tests-document/${pref}-ecran-p${k + 1}.png`, Buffer.from(s.data, 'base64'));
  await ev(`(async()=>{${PROFIL};const b=await (await fetch('data:image/png;base64,${s.data}')).blob();window.__prof.ecran[${k}]=await profil(b,${W});return 1})()`);
}
// export : le vrai bouton « Exporter en PDF »
await ev(`${SC}.scrollTop=0;1`); await dormir(400);
await clic(await pos(`[...document.querySelectorAll('button')].find(b=>(b.title||'').startsWith('Fichier'))`), { att: 500 });
await clic(await pos(`[...document.querySelectorAll('.mf-item, [role=menuitem], button')].find(e=>/^Exporter en PDF/.test(e.innerText.trim()))`), { att: 4000 });
await c.send('Emulation.setEmulatedMedia', { media: 'print' }); await dormir(500);
const imprime = JSON.parse(await ev(STRUCT('impression')));
const pdf = await c.send('Page.printToPDF', { printBackground: false, preferCSSPageSize: true });
await c.send('Emulation.setEmulatedMedia', { media: '' });
fs.writeFileSync(`../../../cap-tests-document/${pref}-export.pdf`, Buffer.from(pdf.data, 'base64'));
// visuel, PDF : rendu pdf.js à la même largeur que la page à l'écran
const nPdf = await ev(`(async()=>{${PROFIL};const pj=await import('/node_modules/pdfjs-dist/build/pdf.mjs');pj.GlobalWorkerOptions.workerSrc='/node_modules/pdfjs-dist/build/pdf.worker.mjs';const bin=Uint8Array.from(atob('${pdf.data}'),c=>c.charCodeAt(0));const d=await pj.getDocument({data:bin}).promise;for(let i=1;i<=d.numPages;i++){const p=await d.getPage(i);const v1=p.getViewport({scale:1});const v=p.getViewport({scale:${W}/v1.width});const cv=document.createElement('canvas');cv.width=Math.round(v.width);cv.height=Math.round(v.height);await p.render({canvasContext:cv.getContext('2d'),viewport:v}).promise;window.__prof.pdf[i-1]=await profil(cv,${W});if(i<=12){const u=cv.toDataURL('image/png');window.__png=window.__png||[];window.__png[i-1]=u}}return d.numPages})()`);
for (let k = 0; k < Math.min(nPdf, 12); k++) { const u = await ev(`window.__png[${k}]`); fs.writeFileSync(`../../../cap-tests-document/${pref}-pdf-p${k + 1}.png`, Buffer.from(u.split(',')[1], 'base64')); }
const prof = JSON.parse(await ev(`JSON.stringify(window.__prof)`));
// verdict
const u = W / 595; // px écran par unité de page
const versA4 = 793.7 / W; // px écran → px d'une page A4 à 96 ppp
let ok = nb === nPdf && nb === imprime.length;
console.log(`pages : écran ${nb} | DOM imprimé ${imprime.length} | PDF ${nPdf} ${ok ? '✅' : '❌'}`);
const lignes = [];
for (let k = 0; k < nb; k++) {
  const a = ecran[k] || [], b = imprime[k] || [];
  const memes = a.length === b.length && a.every((x, i) => x.b === b[i].b && x.t === b[i].t && x.n === b[i].n);
  const dy = memes ? Math.max(0, ...a.map((x, i) => Math.abs(x.y - b[i].y))) : NaN;
  const pe = prof.ecran[k], pp = prof.pdf[k];
  let dv = NaN, runsOk = false;
  if (pe && pp) {
    runsOk = pe.runs.length === pp.runs.length;
    if (runsOk) dv = Math.max(0, ...pe.runs.map((r, i) => Math.max(Math.abs(r[0] - pp.runs[i][0]), Math.abs(r[1] - pp.runs[i][1])))) * versA4;
  }
  const bon = memes && dy * (793.7 / 595) <= 2 && runsOk && dv <= 2;
  ok = ok && bon;
  const l = `p${k + 1} ${bon ? '✅' : '❌'} blocs écran ${a.length} / imprimé ${b.length}, ordre ${memes ? 'identique' : 'DIFFÉRENT'}, écart DOM max ${Number.isNaN(dy) ? '—' : (dy * 793.7 / 595).toFixed(2) + ' px'} | encre : ${pe ? pe.runs.length : '?'} zones écran / ${pp ? pp.runs.length : '?'} PDF, écart max ${Number.isNaN(dv) ? '—' : dv.toFixed(2) + ' px'}`;
  lignes.push(l); console.log(l);
  if (!memes) console.log('   écran  :', JSON.stringify(a).slice(0, 300), '\n   imprimé:', JSON.stringify(b).slice(0, 300));
  if (!runsOk && pe && pp) console.log('   zones écran', JSON.stringify(pe.runs).slice(0, 300), '\n   zones PDF  ', JSON.stringify(pp.runs).slice(0, 300));
}
console.log(ok ? '✅ CONFORMITÉ : export identique à l’écran' : '❌ CONFORMITÉ : écarts');
fs.writeFileSync(`../../../cap-tests-document/${pref}-conformite.txt`, [`${TITRE} — ${nb} pages`, ...lignes, ok ? 'CONFORME' : 'ÉCARTS'].join('\n'));
console.log('erreurs JS :', B.erreurs.length ? B.erreurs : 'aucune');
await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
c.fermer();
