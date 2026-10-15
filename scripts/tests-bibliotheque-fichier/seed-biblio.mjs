// Jeu de test de la Bibliothèque (tris) — base LOCALE du banc seulement (Vite :5199 sans Supabase).
// Écrit directement dans IndexedDB (idb-keyval) pour poser des dates passées : rien ne part au cloud.
import { banc } from '../tests-fiche-jumelle/commun.mjs';
const b = await banc(1440, 900);
const H = 3600e3, J = 24 * H, now = Date.now();
const id36 = (p, t, s) => p + Math.floor(t).toString(36) + s;
const jour = (t) => new Date(t).toISOString().slice(0, 10);
const r = await b.ev(`(async()=>{
  const u=performance.getEntriesByType('resource').map(e=>e.name);
  const K=await import(u.find(n=>n.includes('idb-keyval')));
  const st=(n)=>K.createStore('medrevise-'+n,'v1');
  const now=${now},H=${H},J=${J};
  const iso=(t)=>new Date(t).toISOString();
  const fj=await K.get('f-fj',st('fiches'));
  const pdfId=fj&&fj.pdfId;
  const put=(n,rec)=>K.set(rec.id,rec,st(n));
  // idempotent : retire d'abord les fiches de test d'un passage précédent (ids « …tb… ») et ce qui leur appartient
  const vieux=(await K.keys(st('fiches'))).filter(k=>/tb([0-9][0-9](ap|ps|bi)|arch|arc2)$/.test(k));
  for(const k of vieux)await K.del(k,st('fiches'));
  for(const n of ['highlights','annotations','questions','notes_doc'])for(const [k,v] of await K.entries(st(n)))if(/^(hl-tb|an-tb)|tbq1$/.test(k)||vieux.includes(k)||(v&&vieux.includes(v.ficheId)))await K.del(k,st(n));
  await put('sources',{id:'src-tb1',nom:'Cours S1',updatedAt:iso(now-30*J)});
  await put('sources',{id:'src-tb2',nom:'Rattrapage',updatedAt:iso(now-30*J)});
  await put('matieres',{id:'mat-tb-ap',nom:'Anatomie palpatoire',sourceId:'src-tb1',updatedAt:iso(now-30*J)});
  await put('matieres',{id:'mat-tb-psy',nom:'Psychologie',sourceId:'src-tb1',updatedAt:iso(now-30*J)});
  await put('matieres',{id:'mat-tb-bio',nom:'Biochimie',sourceId:'src-tb2',updatedAt:iso(now-30*J)});
  await put('dossiers',{id:'dos-tb-u1',nom:'Unité 1',matiereId:'mat-tb-psy',parentId:null,ordre:0,updatedAt:iso(now-30*J)});
  await put('dossiers',{id:'dos-tb-c1',nom:'Chapitre A',matiereId:'mat-tb-psy',parentId:'dos-tb-u1',ordre:0,updatedAt:iso(now-30*J)});
  const F=${JSON.stringify([
    // [suffixe, titre, matiere, dossier, ordre, il y a (jours, ajout), pdf?]
    ['ap01', 'Membre supérieur — repères', 'mat-tb-ap', null, 1, 25, true],
    ['ap02', 'Membre inférieur — repères', 'mat-tb-ap', null, 0, 12.2, true],
    ['ap03', 'Rachis et bassin', 'mat-tb-ap', null, 2, 12.6, false],
    ['ps01', 'Psychologie du développement', 'mat-tb-psy', null, 0, 20, true],
    ['ps02', 'Attachement (Bowlby)', 'mat-tb-psy', 'dos-tb-u1', 0, 9, true],
    ['ps03', 'Théories de l’apprentissage', 'mat-tb-psy', 'dos-tb-c1', 0, 5, false],
    ['bi01', 'Métabolisme glucidique', 'mat-tb-bio', null, 0, 3, true],
    ['bi02', 'Enzymologie', 'mat-tb-bio', null, 1, 1.5, false],
  ])};
  const ids={};
  for(const [s,titre,mat,dos,ordre,ilya,avecPdf] of F){
    const t=now-ilya*J, id='f'+Math.floor(t).toString(36)+'tb'+s.slice(-2)+s.slice(0,2);
    ids[s]=id;
    await put('fiches',{id,matiereId:mat,dossierId:dos,ordre,titre,sousTitre:'Importée',type:'standard',
      ...(avecPdf?{pdfId,pdfName:'cours.pdf'}:{docNotes:true,sousTitre:'Document'}),dateImport:new Date(t).toISOString().slice(0,10),updatedAt:iso(now-0.5*J)});
  }
  // section ARCHIVÉE et fiche archivée : absentes de l'arbre, donc des tris aussi
  await put('sources',{id:'src-tb3',nom:'Ancienne section',archive:true,updatedAt:iso(now-30*J)});
  await put('matieres',{id:'mat-tb-old',nom:'Matière archivée',sourceId:'src-tb3',updatedAt:iso(now-30*J)});
  await put('fiches',{id:'f'+Math.floor(now-0.1*J).toString(36)+'tbarch',matiereId:'mat-tb-old',dossierId:null,ordre:0,titre:'Fiche d’une section archivée',type:'standard',docNotes:true,dateImport:new Date(now).toISOString().slice(0,10),updatedAt:iso(now)});
  await put('fiches',{id:'f'+Math.floor(now-0.2*J).toString(36)+'tbarc2',matiereId:'mat-tb-ap',dossierId:null,ordre:9,titre:'Fiche archivée',archive:true,type:'standard',docNotes:true,dateImport:new Date(now).toISOString().slice(0,10),updatedAt:iso(now)});
  // modifications passées (updatedAt posés à la main)
  await put('highlights',{id:'hl-tb-1',ficheId:ids.ap01,page:1,texte:'repère',couleur:'jaune',rects:[],updatedAt:iso(now-2*H)});
  await put('annotations',{id:'an-tb-1',ficheId:ids.ps01,page:1,kind:'note',x:.1,y:.1,width:.2,height:.1,updatedAt:iso(now-26*H)});
  await put('notes_doc',{id:ids.ps03,content:{type:'doc',content:[]},updatedAt:iso(now-4*J)});
  await put('questions',{id:'q'+Math.floor(now-6*H).toString(36)+'tbq1',ficheId:ids.bi01,type:'flashcard',concept:'Glycolyse',recto:'?',verso:'!',updatedAt:iso(now-1*H)});
  return JSON.stringify(ids);
})()`);
console.log(r);
process.exit(0);
