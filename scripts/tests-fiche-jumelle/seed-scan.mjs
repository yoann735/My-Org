// Cours SCANNÉ (pages en images, aucun texte natif) « Physiologie rénale (scan) » : le cours de test
// rendu page par page (pdf.js → PNG) puis remis en PDF (pdf-lib), dans le navigateur. L'OCR de l'app
// le traite tout seul à l'import (putBlob). node seed-scan.mjs <dossier fx>
import { connecter } from '../tests-pdfreader-v2/cdp.mjs';
import fs from 'fs';
const fx = process.argv[2];
const c = await connecter();
const pdf = fs.readFileSync(fx + '/cours.pdf').toString('base64');
console.log(await c.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);
const S=await import(u.find(n=>n.includes('/medrevise/lib/storage.js'))||'/src/medrevise/lib/storage.js');
const P=await import(u.find(n=>n.includes('/medrevise/pdf/pdfjsSetup.js'))||'/src/medrevise/pdf/pdfjsSetup.js');
const L=await import(u.find(n=>n.includes('/deps/pdf-lib.js'))||'/node_modules/.vite/deps/pdf-lib.js');
const bin=atob(${JSON.stringify(pdf)});const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);
const doc=await P.openPdf(a.buffer);const out=await L.PDFDocument.create();
for(let i=1;i<=doc.numPages;i++){const pg=await doc.getPage(i);const vp=pg.getViewport({scale:2});const cv=document.createElement('canvas');cv.width=vp.width;cv.height=vp.height;
 await pg.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;const png=await new Promise(r=>cv.toBlob(r,'image/png'));
 const img=await out.embedPng(await png.arrayBuffer());const p=out.addPage([vp.width/2,vp.height/2]);p.drawImage(img,{x:0,y:0,width:vp.width/2,height:vp.height/2});}
const blob=new Blob([await out.save()],{type:'application/pdf'});
const pdfId=await S.putBlob(blob);
await S.put('fiches',{id:'f-fjs',matiereId:'mat-fj',dossierId:null,titre:'Physiologie rénale (scan)',type:'standard',pdfId,pdfName:'cours-scan.pdf',dateImport:'2026-10-15'});
return 'scan ok '+pdfId+' '+blob.size+' octets';})()`));
c.fermer();
