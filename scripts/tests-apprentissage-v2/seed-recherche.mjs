// Cours de test « Recherche phrases » : p.1-2 texte NATIF (phrases coupées en fin de ligne, césures, apostrophes
// typographiques, espaces multiples), p.3 diapositive IMAGE (texte lu par l'OCR de l'app). Base LOCALE du banc 9333.
import { connecter } from '../tests-pdfreader-v2/cdp.mjs';
const c = await connecter();
console.log(await c.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);
const S=await import(u.find(n=>n.includes('/medrevise/lib/storage.js'))||'/src/medrevise/lib/storage.js');
const L=await import(u.find(n=>n.includes('/deps/pdf-lib.js'))||'/node_modules/.vite/deps/pdf-lib.js');
for(const f of await S.getAll('fiches')) if(f.id==='f-rech'){ await S.remove('fiches','f-rech'); }
const doc=await L.PDFDocument.create();const font=await doc.embedFont(L.StandardFonts.Helvetica);const bold=await doc.embedFont(L.StandardFonts.HelveticaBold);
const page=(titre,lignes)=>{const p=doc.addPage([842,595]);p.drawText(titre,{x:50,y:530,size:26,font:bold});lignes.forEach((l,i)=>p.drawText(l,{x:50,y:470-i*30,size:18,font}));};
page('Réabsorption tubulaire',['La réabsorption du sodium au niveau du tubule contourné proxi-','mal représente environ deux tiers de la charge filtrée, ce qui','explique l’importance du cotransporteur SGLT2 dans la réabsorp-','tion du glucose. L’aldostérone augmente la réabsorption du sodium','dans le canal collecteur.','Le débit    de filtration glomérulaire vaut 120 mL/min.']);
page('Synthèse',['Rappel : l’aldostérone augmente la réabsorption du sodium.','Le tubule contourné proximal réabsorbe aussi le bicarbonate.']);
const cv=document.createElement('canvas');cv.width=1684;cv.height=1190;const x=cv.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,1684,1190);x.fillStyle='#111';
x.font='bold 84px Arial';x.fillText('Multiplication à contre-courant',90,190);x.font='64px Arial';
['Le gradient corticopapillaire atteint','1200 mOsm/kg dans la médullaire interne.','Les vasa recta forment un échangeur.'].forEach((l,i)=>x.fillText(l,90,420+i*120));
const png=await new Promise(r=>cv.toBlob(r,'image/png'));const img=await doc.embedPng(await png.arrayBuffer());const p3=doc.addPage([842,595]);p3.drawImage(img,{x:0,y:0,width:842,height:595});
const blob=new Blob([await doc.save()],{type:'application/pdf'});const pdfId=await S.putBlob(blob);
await S.put('sources',{id:'src-fj',nom:'Source jumelle',couleur:'#7c5cff'});await S.put('matieres',{id:'mat-fj',nom:'Physiologie test',sourceId:'src-fj'});
await S.put('fiches',{id:'f-rech',matiereId:'mat-fj',dossierId:null,titre:'Recherche phrases',type:'standard',pdfId,pdfName:'recherche.pdf',dateImport:'2026-10-25'});
return 'ok '+pdfId;})()`));
c.fermer(); process.exit(0);
