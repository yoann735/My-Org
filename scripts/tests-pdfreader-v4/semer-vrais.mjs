// (20/10 soir) sème deux VRAIS cours (copies locales, jamais envoyées) dans la base LOCALE du banc et ouvre
// l'anatomie pour que l'OCR de l'app produise sa couche. node semer-vrais.mjs <anatomie.pdf> <bio.pdf>
import { banc, FX } from './commun.mjs';
import fs from 'node:fs';
const b = await banc(1440, 900);
const semer = (id, titre, f) => b.S(`const bin=atob(${JSON.stringify(fs.readFileSync(f).toString('base64'))});const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);
  await S.put('sources',{id:'src-v4',nom:'Vrais cours (test)',couleur:'#7c5cff'});await S.put('matieres',{id:'mat-v4',nom:'Vrais cours v4',sourceId:'src-v4'});
  const pdfId=await S.putBlob(new Blob([a],{type:'application/pdf'}));
  await S.put('fiches',{id:${JSON.stringify(id)},matiereId:'mat-v4',dossierId:null,titre:${JSON.stringify(titre)},type:'standard',pdfId,pdfName:'cours.pdf',dateImport:'2026-10-20'});return pdfId;`);
console.log(await semer('f-v4-genou', 'Genou (vrai cours)', process.argv[2]));
console.log(await semer('f-v4-bio', 'Macromolécules (vrai cours)', process.argv[3]));
await b.biblio({ recharger: true });
console.log('ouvert', await b.ouvrir('Genou (vrai cours)'));
process.exit(0);
