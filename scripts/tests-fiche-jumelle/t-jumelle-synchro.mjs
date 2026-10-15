// Fiche jumelle — SYNCHRO vers un 2ᵉ appareil, sans le vrai cloud : scripts/faux-supabase.mjs (:54399),
// Vite :5300 (VITE_SUPABASE_URL=http://localhost:54399), Chrome A (9335) et B (9336), profils séparés.
import { banc } from './commun.mjs';
import fs from 'fs';
const FX = process.argv[2];
const etatCloud = async () => (await fetch('http://localhost:54399/__etat')).json();
process.env.CDP_PORT = '9335'; process.env.CDP_FILTRE = '5300';
const A = await banc();
await A.c.send('Page.navigate', { url: 'http://localhost:5300/' }); await A.dormir(5000);
// appareil A : le cours (26 p.) puis sa fiche, importée par le menu Fichier
const pdf = fs.readFileSync(FX + '/cours.pdf').toString('base64');
await A.S(`const b64=(s,t)=>{const bin=atob(s);const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return new Blob([a],{type:t})};
await S.put('sources',{id:'src-fj',nom:'Source jumelle',couleur:'#7c5cff'});
await S.put('matieres',{id:'mat-fj',nom:'Physiologie test',sourceId:'src-fj'});
const pdfId=await S.putBlob(b64(${JSON.stringify(pdf)},'application/pdf'));
await S.put('fiches',{id:'f-fj',matiereId:'mat-fj',dossierId:null,titre:'Physiologie rénale (jumelle)',type:'standard',pdfId,pdfName:'cours.pdf',dateImport:'2026-10-15'});
await S.put('questions',{id:'q-fj1',ficheId:'f-fj',type:'flashcard',concept:'DFG normal',recto:'Valeur normale du DFG ?',verso:'120 mL/min'});return 1`);
A.ok(await A.ouvrir('Physiologie rénale (jumelle)', { recharger: true }), 'A : cours ouvert');
const pris = A.fichierSuivant(FX + '/fiche.pdf');
await A.menuFichier('Importer la fiche jumelle'); await pris; await A.dormir(2500);
await A.clic(await A.pos(`[...document.querySelectorAll('.fj-resume button')].find(x=>x.innerText.includes('Voir la fiche'))`, false), { att: 1500 });
await A.S(`const r=await S.getOne('companion_pdf','cp:f-fj');await S.put('annotations',{...S.newNoteBox({ficheId:r.nsAnnot,page:1,x:0.5,y:0.55,width:0.3,height:0.05,couleur:'ardoise',fond:'plein'}),content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Annotée sur A'}]}]}});return 1`);
await A.ev(`window.dispatchEvent(new Event('online'));1`); await A.dormir(6000);
const cloud = await etatCloud();
const lignes = cloud.rows.filter((r) => r.store === 'companion_pdf');
const recA = JSON.parse(await A.S(`return JSON.stringify(await S.getOne('companion_pdf','cp:f-fj'))`));
A.ok(lignes.length === 1 && lignes[0].record_id === 'cp:f-fj', 'faux cloud : 1 ligne companion_pdf « cp:f-fj »', JSON.stringify(lignes.map((r) => r.record_id)));
A.ok(cloud.blobs.some((x) => (x.id || x) === recA.fileId || JSON.stringify(x).includes(recA.fileId)), 'faux cloud : le PDF de la fiche est dans le bucket des blobs', recA.fileId);
const shaA = await A.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const S=await import(u.find(n=>n.includes('/medrevise/lib/storage.js')));const b=await S.getBlob(${JSON.stringify(recA.fileId)});const h=await crypto.subtle.digest('SHA-256',await b.arrayBuffer());return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('')})()`);
A.c.fermer();
// appareil B : profil neuf, rien de semé — tout arrive par la synchro
process.env.CDP_PORT = '9336'; process.env.CDP_FILTRE = '';
const B = await banc();
await B.c.send('Page.navigate', { url: 'http://localhost:5300/' }); await B.dormir(9000);
B.ok(await B.ouvrir('Physiologie rénale (jumelle)'), 'B : le cours est arrivé et s’ouvre');
const recB = JSON.parse(await B.S(`return JSON.stringify(await S.getOne('companion_pdf','cp:f-fj'))`));
B.ok(recB && recB.fileId === recA.fileId && JSON.stringify(recB.pageMap) === JSON.stringify(recA.pageMap), 'B : même enregistrement companion_pdf (fichier, correspondance)');
B.ok(await B.ev(`!!document.querySelector('.pdfr-jumelle-bascule')`), 'B : segment Original · Fiche présent');
await B.clic(await B.pos(`[...document.querySelectorAll('.pdfr-jumelle-bascule .seg-btn')].find(x=>x.innerText==='Fiche')`, false), { att: 3000 });
B.ok((await B.ev(`document.querySelector('.ptb-pages .tnum')?.innerText`)) === '1 / 30', 'B : la fiche (30 p.) s’affiche — PDF téléchargé du cloud');
const shaB = await B.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const S=await import(u.find(n=>n.includes('/medrevise/lib/storage.js')));const b=await S.getBlob(${JSON.stringify(recA.fileId)});const h=await crypto.subtle.digest('SHA-256',await b.arrayBuffer());return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('')})()`);
B.ok(shaA === shaB, 'B : fichier de la fiche identique octet pour octet (SHA-256)', shaB.slice(0, 16) + '…');
B.ok(await B.ev(`[...document.querySelectorAll('.note-box')].some(n=>n.innerText.includes('Annotée sur A'))`), 'B : l’annotation posée sur la fiche par A est là, sur la fiche');
await B.capt('jumelle-appareil-B');
await B.clic(await B.pos(`document.querySelector('button[title="Revenir à la liste"]')`, false), { att: 1200 });
B.ok(await B.ev(`[...document.querySelectorAll('.lt-fiche')].some(l=>l.innerText.includes('Physiologie rénale (jumelle)')&&!!l.querySelector('.lib-marque-fiche'))`), 'B : marque « fiche » dans la Bibliothèque');
await B.capt('jumelle-bibliotheque-marque');
B.ok(!B.erreurs.length, '0 erreur JS', B.erreurs.join(' | '));
B.c.fermer();
