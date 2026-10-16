// Jeu de test du menu Fichier — base LOCALE du banc : un cours PDF + fiche HTML, un cours jetable (pour « Supprimer »).
import { banc } from './commun.mjs';
const b = await banc(1440, 900);
await b.biblio({ recharger: true });
console.log(await b.S(`
  const fj=await S.getOne('fiches','f-fj');
  const html='<!doctype html><html><head><meta charset="utf-8"><title>Fiche</title></head><body><h1>Rein — fiche HTML</h1><p>Néphron, glomérule, tubule.</p></body></html>';
  const hid=await S.putBlob(new Blob([html],{type:'text/html'}));
  await S.put('fiches',{id:'f-tb-html',matiereId:'mat-tb-ap',dossierId:null,ordre:20,titre:'Cours PDF + HTML (test)',sousTitre:'Importée',type:'standard',pdfId:fj.pdfId,pdfName:'cours.pdf',htmlId:hid,htmlName:'fiche.html',dateImport:'2026-10-15'});
  await S.put('fiches',{id:'f-tb-htmlseul',matiereId:'mat-tb-ap',dossierId:null,ordre:22,titre:'Cours HTML seul (test)',sousTitre:'Importée',type:'standard',htmlId:hid,htmlName:'fiche.html',dateImport:'2026-10-15'});
  await S.put('fiches',{id:'f-tb-jetable',matiereId:'mat-tb-ap',dossierId:null,ordre:21,titre:'Cours jetable (test)',sousTitre:'Importée',type:'standard',pdfId:fj.pdfId,pdfName:'cours.pdf',dateImport:'2026-10-15',archive:false});
  return 'ok';`));
process.exit(0);
