// Jeu de test « fichiers d'un cours » (base LOCALE du banc) : « Cours fichiers (test) » — copie du PDF de 26 p. de
// « Physiologie rénale (jumelle) », boîtes p.2, p.5, p.10, surlignage p.3, une flashcard, une session de transcript,
// une position de lecture. Remis à zéro à chaque passage (annotations, fiche jumelle, fichiers retirés).
import { banc } from '../tests-bibliotheque-fichier/commun.mjs';
const b = await banc(1440, 900);
await b.biblio({ recharger: true });
console.log(await b.S(`const ID='f-tb-fichiers';
  for(const st of ['annotations','highlights'])for(const a of await S.getAll(st))if(a.ficheId===ID||String(a.ficheId).startsWith(ID+'::'))await S.remove(st,a.id);
  const cp=await S.getOne('companion_pdf','cp:'+ID);if(cp)await S.remove('companion_pdf',cp.id);
  for(const q of await S.getAll('questions'))if(q.ficheId===ID)await S.remove('questions',q.id);
  const fj=await S.getOne('fiches','f-fj');const blob=await S.getBlob(fj.pdfId);
  const pdfId=await S.putBlob(new File([blob],'Néphrologie — cours.pdf',{type:'application/pdf'}));
  await S.put('fiches',{id:ID,matiereId:'mat-tb-ap',dossierId:null,ordre:40,titre:'Cours fichiers (test)',sousTitre:'Importée',type:'standard',pdfId,pdfName:'Néphrologie — cours.pdf',dateImport:'2026-10-16',pdfImporteLe:new Date(Date.now()-86400e3).toISOString()});
  const boite=(page,t)=>S.newNoteBox({ficheId:ID,page,x:.55,y:.3,width:.3,height:.12,couleur:'jaune',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:t}]}]}});
  await S.put('annotations',boite(2,'Boîte page 2'));await S.put('annotations',boite(5,'Boîte page 5'));await S.put('annotations',boite(10,'Boîte page 10'));
  await S.put('highlights',S.newHighlight({ficheId:ID,page:3,texte:'surlignage page 3',couleur:'jaune',rects:[{x:.1,y:.2,width:.3,height:.03}]}));
  const q=S.newItem(ID,{id:'q-tb-fichiers',type:'flashcard',recto:'Unité fonctionnelle du rein ?',verso:'Le néphron'});await S.put('questions',q);
  await S.put('transcript_session',{id:'ts-tb-fichiers',kind:'session',courseId:ID,startedAt:new Date().toISOString(),endedAt:new Date().toISOString(),source:'micro',keyterms:[],segments:[{id:'s1',t0:0,t1:5,text:'Le néphron filtre le sang.',status:'final'}],notes:[],fontSize:'m',durationS:5,createdAt:new Date().toISOString()});
  await S.put('reading_position',{id:'rp:'+ID,page:3,decalage:0.2,zoom:1.2});
  return 'ok';`));
process.exit(0);
