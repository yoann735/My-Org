// Jeu de test des chantiers images / surlignage / JSON (10/10). node seed.mjs
import { connecter } from './cdp.mjs';
import fs from 'fs';
const c = await connecter();
const b64 = (f) => fs.readFileSync('../fx/' + f).toString('base64');
const para = (t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
const flux = (titre, n) => ({ type: 'doc', content: [
  { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: titre }] },
  ...Array.from({ length: n }, (_, i) => para(`Paragraphe ${i + 1}. Le cycle de Krebs se déroule dans la matrice mitochondriale et oxyde l'acétyl-CoA en CO2 en produisant NADH, FADH2 et GTP.`)),
] });
const doc = (texte, taille = '13px') => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: texte, marks: [{ type: 'textStyle', attrs: { fontSize: taille } }] }] }] });
console.log(await c.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const S=await import(u.find(n=>n.includes('/medrevise/lib/storage.js'))||'/src/medrevise/lib/storage.js');
const blob=(s,t)=>{const bin=atob(s);const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return new Blob([a],{type:t})};
const now=new Date().toISOString();
await S.put('sources',{id:'src-j',nom:'Source JSON',couleur:'#7c5cff'});
await S.put('matieres',{id:'mat-j',nom:'Biochimie J',sourceId:'src-j'});
const pdfT=await S.putBlob(blob(${JSON.stringify(b64('texte.pdf'))},'application/pdf'));
const pdfI=await S.putBlob(blob(${JSON.stringify(b64('image.pdf'))},'application/pdf'));
const png=await S.putBlob(blob(${JSON.stringify(b64('photo.png'))},'image/png'));
await S.put('fiches',{id:'j-txt',matiereId:'mat-j',dossierId:null,titre:'PDF texte J',type:'standard',pdfId:pdfT,dateImport:'2026-10-10'});
await S.put('fiches',{id:'j-img',matiereId:'mat-j',dossierId:null,titre:'PDF image J',type:'standard',pdfId:pdfI,dateImport:'2026-10-10'});
await S.put('fiches',{id:'j-doc',matiereId:'mat-j',dossierId:null,titre:'Document ancien J',sousTitre:'Document',type:'standard',docNotes:true,dateImport:'2026-10-10'});
await S.put('fiches',{id:'j-doc2',matiereId:'mat-j',dossierId:null,titre:'Document neuf J',sousTitre:'Document',type:'standard',docNotes:true,dateImport:'2026-10-10'});
await S.put('notes_doc',{id:'j-doc',ficheId:'j-doc',flux:${JSON.stringify(flux('Document ancien J', 10))},fluxMaj:1});
await S.put('notes_doc',{id:'j-doc2',ficheId:'j-doc2',flux:${JSON.stringify(flux('Document neuf J', 4))},fluxMaj:1});
// pages du document ancien + deux images FLOTTANTES (comportement d'avant), une pivotée
for (const [id,rang] of [['jpg-1',0],['jpg-2',1]]) await S.put('annotations',{id,ficheId:'j-doc',kind:'page',type:'page',apres:0,rang,width:595,height:842,createdAt:now});
await S.put('annotations',{id:'an-img-a',ficheId:'j-doc',page:'jpg-1',kind:'image',type:'image',blobId:png,x:0.2,y:0.42,width:0.5,height:0.5*(300/600)*(595/842),z:0,createdAt:now});
await S.put('annotations',{id:'an-img-b',ficheId:'j-doc',page:'jpg-2',kind:'image',type:'image',blobId:png,x:0.3,y:0.15,width:0.3,height:0.3*(300/600)*(595/842),rotation:90,z:0,createdAt:now});
// cinq boîtes de texte sur la page 1 du PDF texte (boîtes, post-it, texte libre, flèche)
const bx=(id,kind,x,y,w,t,extra={})=>({id,ficheId:'j-txt',page:1,x,y,width:w,height:0.036,kind,type:kind==='libre'?'boite':'texte',couleur:kind==='libre'?'ambre':'noir',content:${JSON.stringify(doc('X'))}.content?{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:t,marks:[{type:'textStyle',attrs:{fontSize:'13px'}}]}]}]}:null,createdAt:now,...extra});
await S.put('annotations',bx('an-b1','libre',0.62,0.30,0.3,'Krebs = matrice'));
await S.put('annotations',bx('an-b2','libre',0.62,0.40,0.3,'NADH x3 FADH2 x1 GTP x1 par tour',{fond:'plein',couleur:'rose'}));
await S.put('annotations',bx('an-b3','libre',0.10,0.55,0.35,'citrate synthase premiere etape du cycle tres importante a retenir pour le partiel',{ancre:{x:0.3,y:0.16,texte:'citrate'},fleche:true,couleur:'bleu'}));
await S.put('annotations',bx('an-b4','texte',0.55,0.62,0.3,'phosphorylation oxydative ensuite'));
await S.put('annotations',bx('an-b5','libre',0.10,0.75,0.4,'a revoir : bilan energetique',{fond:'teinte',couleur:'vert'}));
return 'seed ok';})()`));
c.fermer();
