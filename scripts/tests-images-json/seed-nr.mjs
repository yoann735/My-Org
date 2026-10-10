// une carte Muscle SANS image sur « PDF texte J » (id fixe), état identique pour l'avant / après
import { connecter } from './cdp.mjs';
const c = await connecter();
console.log(await c.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const S=await import(u.find(n=>n.includes('/medrevise/lib/storage.js')));
for(const q of (await S.getAll('questions')).filter(q=>q.ficheId==='j-txt'))await S.remove('questions',q.id);
const lignes={origine:'• Face postérieure de l\\'ilium\\n• Sacrum et coccyx',trajet:'Oblique en bas et en dehors',insertion:'• Tubérosité glutéale',action:'• Extenseur de la cuisse\\n• Rotateur latéral',innervation:'Nerf glutéal inférieur'};
await S.put('questions',{id:'q-nr-muscle',ficheId:'j-txt',type:'flashcard',theme:'Hanche',concept:'Hanche',difficulte:'intermediaire',recto:'m. Grand glutéal',verso:'(verso)',indice:null,a_retenir:'',cloze:[],imageId:null,imagePlace:null,muscle:{v:1,lignes},createdAt:'2026-10-10T10:00:00.000Z'});
return 'ok'})()`));
c.fermer();
