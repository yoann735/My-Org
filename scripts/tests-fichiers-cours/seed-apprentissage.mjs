// Jeu de test du mode Apprentissage (base LOCALE du banc) : liste vidée (notes comprises), une fiche « cartes seules »
// « Cartes d'anatomie (test) » (2 flashcards) dans Anatomie palpatoire. Les 3 flashcards de seed-carnet restent.
import { banc } from '../tests-bibliotheque-fichier/commun.mjs';
const b = await banc(1440, 900);
await b.biblio({ recharger: true });
console.log(await b.S(`await S.put('learning_set',{id:'learning_set',cardIds:[],notes:{}});
  await S.put('fiches',{id:'f-tb-cartes',matiereId:'mat-tb-ap',dossierId:null,ordre:30,titre:'Cartes d’anatomie (test)',sousTitre:'Importée',type:'standard',dateImport:'2026-10-16'});
  for(const q of await S.getAll('questions'))if(/^q-tb-ana/.test(q.srcId||''))await S.remove('questions',q.id);
  let n=0;for(const [r,v] of [['Insertion du deltoïde ?','Tubérosité deltoïdienne'],['Innervation du trapèze ?','Nerf accessoire (XI)']]){const it=S.newItem('f-tb-cartes',{id:'q-tb-ana'+(++n),type:'flashcard',recto:r,verso:v,concept:r});await S.put('questions',it);}
  return 'ok';`));
process.exit(0);
