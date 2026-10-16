// Jeu de test du carnet : 3 flashcards sur « Psychologie du développement » (base LOCALE du banc), remises à zéro.
import { banc } from '../tests-bibliotheque-fichier/commun.mjs';
const b = await banc(1440, 900);
await b.biblio({ recharger: true });
console.log(await b.S(`const f=(await S.getAll('fiches')).find(x=>x.titre==='Psychologie du développement');
  for(const q of await S.getAll('questions'))if(/^q-tb-fc/.test(q.srcId||''))await S.remove('questions',q.id);
  const cartes=[['Muscle innervé par le nerf axillaire ?','Le deltoïde'],['Origine du biceps brachial (chef court) ?','Processus coracoïde'],['Stade de Piaget de 2 à 7 ans ?','Préopératoire']];
  let n=0;for(const [r,v] of cartes){const it=S.newItem(f.id,{id:'q-tb-fc'+(++n),type:'flashcard',recto:r,verso:v,concept:r});it.historique=[{date:new Date(Date.now()-864e5).toISOString().slice(0,10),qualite:1}];it.dueDate=new Date().toISOString().slice(0,10);await S.put('questions',it);}
  await S.setCarnetPuces && 0; return f.id;`));
process.exit(0);
