// Sème le cours de test « Physiologie rénale (jumelle) » (26 pages) dans la base LOCALE du banc.
// node seed.mjs <dossier fx>   (Chrome headless CDP 9333, Vite sans Supabase)
import { connecter } from '../tests-pdfreader-v2/cdp.mjs';
import fs from 'fs';
const fx = process.argv[2];
const c = await connecter();
const pdf = fs.readFileSync(fx + '/cours.pdf').toString('base64');
console.log(await c.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const S=await import(u.find(n=>n.includes('/medrevise/lib/storage.js'))||'/src/medrevise/lib/storage.js');
const b64=(s,t)=>{const bin=atob(s);const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return new Blob([a],{type:t})};
await S.put('sources',{id:'src-fj',nom:'Source jumelle',couleur:'#7c5cff'});
await S.put('matieres',{id:'mat-fj',nom:'Physiologie test',sourceId:'src-fj'});
const pdfId=await S.putBlob(b64(${JSON.stringify(pdf)},'application/pdf'));
await S.put('fiches',{id:'f-fj',matiereId:'mat-fj',dossierId:null,titre:'Physiologie rénale (jumelle)',type:'standard',pdfId,pdfName:'cours.pdf',dateImport:'2026-10-15'});
await S.put('questions',{id:'q-fj1',ficheId:'f-fj',type:'flashcard',concept:'DFG normal',recto:'Valeur normale du DFG ?',verso:'120 mL/min'});
return 'seed ok '+pdfId;})()`));
c.fermer();
