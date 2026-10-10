// « Document long J » : 18 paragraphes (2 pages) — node seed-long.mjs
import { connecter } from './cdp.mjs';
const c = await connecter();
const para = (t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
const phr = (i) => `Paragraphe ${i}. La glycolyse transforme le glucose en pyruvate dans le cytosol et produit de l'ATP et du NADH, puis le pyruvate entre dans la mitochondrie.`;
const flux = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Document long J' }] }, ...Array.from({ length: 18 }, (_, i) => para(phr(i + 1)))] };
console.log(await c.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const S=await import(u.find(n=>n.includes('/medrevise/lib/storage.js')));
await S.put('sources',{id:'src-j',nom:'Source JSON',couleur:'#7c5cff'});await S.put('matieres',{id:'mat-j',nom:'Biochimie J',sourceId:'src-j'});
await S.put('fiches',{id:'j-long',matiereId:'mat-j',dossierId:null,titre:'Document long J',sousTitre:'Document',type:'standard',docNotes:true,dateImport:'2026-10-10'});
await S.put('notes_doc',{id:'j-long',ficheId:'j-long',flux:${JSON.stringify(flux)},fluxMaj:Date.now()});
for(const h of (await S.getAll('highlights')).filter(h=>h.ficheId==='j-long'))await S.remove('highlights',h.id);
return 'ok'})()`));
c.fermer();
