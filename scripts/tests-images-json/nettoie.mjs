// retire surlignages et annotations ajoutées par les tests d'un cours (garde pages et boîtes du jeu) : node nettoie.mjs <ficheId>
import { connecter } from './cdp.mjs';
const c = await connecter();
const f = process.argv[2];
console.log(await c.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const S=await import(u.find(n=>n.includes('/medrevise/lib/storage.js')));let n=0;
for(const a of (await S.getAll('annotations')).filter(a=>a.ficheId===${JSON.stringify(f)}&&a.kind!=='page'&&!/^an-(b[1-5]|img-[ab])$/.test(a.id))){await S.remove('annotations',a.id);n++}
for(const h of (await S.getAll('highlights')).filter(h=>h.ficheId===${JSON.stringify(f)})){await S.remove('highlights',h.id);n++}
return ${JSON.stringify(f)}+' : '+n+' retirés'})()`));
c.fermer();
