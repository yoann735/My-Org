// remet « Document neuf J » à son état de départ (4 paragraphes, sans image ni dessin)
import { connecter } from './cdp.mjs';
const c = await connecter();
const para = (t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
const flux = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Document neuf J' }] }, ...Array.from({ length: 4 }, (_, i) => para(`Paragraphe ${i + 1}. Le cycle de Krebs se déroule dans la matrice mitochondriale et oxyde l'acétyl-CoA en CO2 en produisant NADH, FADH2 et GTP.`))] };
console.log(await c.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const S=await import(u.find(n=>n.includes('/medrevise/lib/storage.js')));
await S.put('notes_doc',{id:'j-doc2',ficheId:'j-doc2',flux:${JSON.stringify(flux)},fluxMaj:Date.now()});
for(const d of await S.getAll('dessins'))await S.remove('dessins',d.id);
for(const a of (await S.getAll('annotations')).filter(a=>a.ficheId==='j-doc2'&&a.kind!=='page'))await S.remove('annotations',a.id);
return 'reset ok'})()`));
c.fermer();
