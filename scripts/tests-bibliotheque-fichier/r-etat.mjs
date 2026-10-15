// état de la base locale du banc : sections, matières, fiches (lecture seule)
import { banc } from '../tests-fiche-jumelle/commun.mjs';
const b = await banc(1440, 900);
await b.c.send('Network.setCacheDisabled', { cacheDisabled: true });
await b.c.send('Page.reload', { ignoreCache: true }); await b.dormir(4500);
const app = await b.ev(`document.body.innerText.includes('Choisis ton espace') ? 'hub' : document.body.innerText.includes('PLANNING REPAS') ? 'mealweek' : 'medrevise'`);
console.log('app', app);
console.log(await b.S(`const src=await S.getAll('sources'),mat=await S.getAll('matieres'),f=await S.getAll('fiches');return JSON.stringify({src:src.map(s=>[s.id,s.nom,!!s.archive]),mat:mat.map(m=>[m.id,m.nom,m.sourceId,!!m.archive]),f:f.map(x=>[x.id,x.titre,x.matiereId,x.dossierId||'',x.ordre,x.dateImport,!!x.archive,x.pdfId?'pdf':x.docNotes?'doc':x.type])},null,0)`));
process.exit(0);
