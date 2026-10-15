// Crée le cours DOCUMENT « Myologie (document) » par la même fonction que « Nouveau document »
// (documents/lib/documents.js#createDocumentNotes) et y pose le texte de doc-flux.json (6 sections,
// sauts de page). Retire d'abord un éventuel document de test précédent. node seed-doc.mjs <fx>
import { connecter } from '../tests-pdfreader-v2/cdp.mjs';
import fs from 'fs';
const fx = process.argv[2];
const c = await connecter();
const flux = fs.readFileSync(fx + '/doc-flux.json', 'utf8');
console.log(await c.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const im=(p)=>import(u.find(n=>n.includes(p))||('/src/medrevise/'+p));
const S=await im('lib/storage.js');const D=await im('documents/lib/documents.js');const N=await im('documents/lib/notesDoc.js');
for(const f of await S.getAll('fiches')) if(f.titre==='Myologie (document)'){
  for(const st of ['annotations','highlights']) for(const a of await S.getAll(st)) if(a.ficheId===f.id||String(a.ficheId).startsWith(f.id+'::fiche')) await S.remove(st,a.id);
  for(const r of await S.getAll('companion_pdf')) if(r.courseId===f.id) await S.remove('companion_pdf',r.id);
  for(const r of await S.getAll('reading_position')) if(String(r.id).startsWith('rp:'+f.id)) await S.remove('reading_position',r.id);
  for(const q of await S.getAll('questions')) if(q.ficheId===f.id) await S.remove('questions',q.id);
  await S.remove('notes_doc',f.id); await S.remove('fiches',f.id);
}
await S.put('sources',{id:'src-fj',nom:'Source jumelle',couleur:'#7c5cff'});
await S.put('matieres',{id:'mat-fj',nom:'Physiologie test',sourceId:'src-fj'});
const f=await D.createDocumentNotes({matiereId:'mat-fj',titre:'Myologie (document)'});
await N.majNotesDoc(f.id,{flux:${flux},fluxMaj:Date.now(),fluxAppareil:'seed'});
await S.put('questions',{id:'q-doc1',ficheId:f.id,type:'flashcard',concept:'Sarcomère',recto:'Unité contractile ?',verso:'Le sarcomère'});
return 'doc '+f.id;})()`));
c.fermer();
