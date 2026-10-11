// Export IA en PDF (11/10) : « Cours 26 pages IA », une ou deux boîtes par page (progression / annulation). node seed-ia26.mjs
import { connecter } from './cdp.mjs';
import fs from 'fs';
const c = await connecter();
const pdf = fs.readFileSync('../fx/cours26.pdf').toString('base64');
const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const B = [];
for (let p = 1; p <= 26; p++) {
  B.push([`an26p${String(p).padStart(2, '0')}a`, p, 0.6, 0.15, 0.3, 0.04, `Page ${p} : enzyme ${p}, réaction ${p * 3}`, { couleur: ['ambre', 'bleu', 'vert', 'rose'][p % 4], ancre: { x: 0.45, y: 0.5 }, fleche: true }]);
  if (p % 3 === 0) B.push([`an26p${String(p).padStart(2, '0')}b`, p, 0.08, 0.62, 0.25, 0.05, `Remarque ${p} : à revoir`, { couleur: 'bleu', fond: 'plein' }]);
}
console.log(await c.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const S=await import(u.find(n=>n.includes('/medrevise/lib/storage.js'))||'/src/medrevise/lib/storage.js');
const bin=atob(${JSON.stringify(pdf)});const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);
await S.put('sources',{id:'src-ia',nom:'Source IA',couleur:'#7c5cff'});
await S.put('matieres',{id:'mat-ia',nom:'Biochimie IA',sourceId:'src-ia'});
const pdfId=await S.putBlob(new Blob([a],{type:'application/pdf'}));
await S.put('fiches',{id:'ia-26',matiereId:'mat-ia',dossierId:null,titre:'Cours 26 pages IA',type:'standard',pdfId,dateImport:'2026-10-11'});
for(const a of (await S.getAll('annotations')).filter(a=>a.ficheId==='ia-26'))await S.remove('annotations',a.id);
const now=new Date().toISOString();
for(const [id,page,x,y,w,h,t,extra] of ${JSON.stringify(B.map(([id, page, x, y, w, h, t, extra]) => [id, page, x, y, w, h, doc(t), extra]))})
  await S.put('annotations',{id,ficheId:'ia-26',page,kind:'libre',type:'boite',x,y,width:w,height:h,content:t,createdAt:now,...extra});
return 'seed 26 ok'})()`));
c.fermer();
