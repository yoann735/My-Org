// Export IA en PDF (11/10) : « Cours bruit IA », 2 pages couvertes d'une image de bruit (photo très chargée) — une page
// dépasse 1 Mo en JPEG à 150 dpi : l'export doit la refaire à 120 dpi et le signaler. node seed-ia-bruit.mjs
import { connecter } from './cdp.mjs';
const c = await connecter();
console.log(await c.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const S=await import(u.find(n=>n.includes('/medrevise/lib/storage.js')));
const {PDFDocument}=await import(u.find(n=>n.includes('pdf-lib'))||'pdf-lib');
const cv=new OffscreenCanvas(1400,1980);const g=cv.getContext('2d');const im=g.createImageData(1400,1980);for(let i=0;i<im.data.length;i+=4){im.data[i]=Math.random()*255;im.data[i+1]=Math.random()*255;im.data[i+2]=Math.random()*255;im.data[i+3]=255}g.putImageData(im,0,0);
const png=new Uint8Array(await (await cv.convertToBlob({type:'image/png'})).arrayBuffer());
const d=await PDFDocument.create();const img=await d.embedPng(png);for(let p=0;p<2;p++){const pg=d.addPage([595,842]);pg.drawImage(img,{x:0,y:0,width:595,height:842})}
const pdfId=await S.putBlob(new Blob([await d.save()],{type:'application/pdf'}));
await S.put('fiches',{id:'ia-bruit',matiereId:'mat-ia',dossierId:null,titre:'Cours bruit IA',type:'standard',pdfId,dateImport:'2026-10-11'});
for(const a of (await S.getAll('annotations')).filter(a=>a.ficheId==='ia-bruit'))await S.remove('annotations',a.id);
await S.put('annotations',{id:'anbruit01xa',ficheId:'ia-bruit',page:1,kind:'libre',type:'boite',x:0.1,y:0.1,width:0.4,height:0.05,content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Photo très chargée'}]}]},createdAt:new Date().toISOString(),couleur:'ambre',fond:'plein'});
return 'seed bruit ok'})()`));
c.fermer();
