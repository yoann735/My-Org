import { connecter } from './cdp.mjs';
import fs from 'fs';
const c = await connecter();
const pdf = fs.readFileSync('../fx/image.pdf').toString('base64');
const png = fs.readFileSync('../fx/page.png').toString('base64');
const para = (t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
const flux = { type: 'doc', content: [
  { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Document test v2' }] },
  ...Array.from({ length: 14 }, (_, i) => para(`Paragraphe ${i + 1}. Le cycle de Krebs se déroule dans la matrice mitochondriale et oxyde l'acétyl-CoA en CO2 en produisant NADH, FADH2 et GTP. Cette phrase sert à remplir la page pour tester la pagination et les marges.`)),
] };
console.log(await c.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const S=await import(u.find(n=>n.includes('/medrevise/lib/storage.js'))||'/src/medrevise/lib/storage.js');
const b64=(s,t)=>{const bin=atob(s);const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return new Blob([a],{type:t})};
await S.put('sources',{id:'src-t',nom:'Source test',couleur:'#7c5cff'});
await S.put('matieres',{id:'mat-t',nom:'Biochimie test',sourceId:'src-t'});
const pdfId=await S.putBlob(b64(${JSON.stringify(pdf)},'application/pdf'));
await S.put('fiches',{id:'f-img',matiereId:'mat-t',dossierId:null,titre:'PDF image test',type:'standard',pdfId,dateImport:'2026-10-09'});
await S.put('fiches',{id:'f-doc',matiereId:'mat-t',dossierId:null,titre:'Document test v2',sousTitre:'Document',type:'standard',docNotes:true,dateImport:'2026-10-09'});
await S.put('notes_doc',{id:'f-doc',ficheId:'f-doc',flux:${JSON.stringify(flux)}});
return 'seed ok';})()`));
fs.writeFileSync('../fx/png.b64', png);
c.fermer();
