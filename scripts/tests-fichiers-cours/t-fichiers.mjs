// Fichiers d'un cours (16/10) — écran « Fichiers du cours », remplacer le principal, fiche jumelle (importer, remplacer,
// supprimer), refus d'un second principal, taille max, un import à la fois, document, Bibliothèque, Archives, comptes.
// Base LOCALE du banc. Préalable : node seed-fichiers.mjs. Argument : dossier fx (cours-v2.pdf, fiche.pdf, fiche-v2.pdf, trop-lourd.pdf).
import { banc } from '../tests-bibliotheque-fichier/commun.mjs';
const FX = process.argv[2];
const b = await banc(1440, 900);
const ID = 'f-tb-fichiers';
await b.c.send('Runtime.evaluate', { expression: `localStorage.setItem('medrevise.biblio.tri','manuel')` });
await b.biblio({ recharger: true });
const comptes = () => b.S(`const uu=performance.getEntriesByType('resource').map(e=>e.name);const K=await import(uu.find(n=>n.includes('idb-keyval')));const o={};
  for(const st of ['fiches','questions','highlights','annotations','companion_pdf','transcript_session','reading_position','notes_doc','learning_set'])o[st]=(await S.getAll(st)).length;
  o.blobs=(await K.keys(K.createStore('medrevise-blobs','v1'))).length;o.backups=(await K.keys(K.createStore('medrevise-backups','v1'))).length;return JSON.stringify(o)`).then(JSON.parse);
const avant = await comptes();
const piege = () => b.ev(`(()=>{if(window.__piege)return 1;window.__piege=1;window.__dl=[];const o=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){const n=this.download,h=this.href;const i=window.__dl.push({nom:n,taille:-1})-1;fetch(h).then(r=>r.blob()).then(x=>{window.__dl[i].taille=x.size});return;}return o.call(this)};return 1})()`);
const dl = () => b.ev(`JSON.stringify(window.__dl||[])`).then(JSON.parse);
const ouvrirFichiers = async () => { await b.clic(await b.pos(`document.querySelector('.mf-bouton')`, false), { att: 400 }); await b.clic(await b.pos(`document.querySelector('button[data-entree=fichiers]')`, false), { att: 1200 }); };
const ligne = (l) => b.ev(`(()=>{const e=document.querySelector('.fcrs-ligne[data-ligne=${l}]');return e?{texte:e.innerText.replace(/\\n/g,' | '),boutons:[...e.querySelectorAll('.fcrs-actions button')].map(x=>x.innerText.trim()+(x.disabled?' (grisé)':''))}:null})()`);
const bouton = (l, t) => b.pos(`[...document.querySelectorAll('.fcrs-ligne[data-ligne=${l}] .fcrs-actions button')].find(x=>x.innerText.trim()===${JSON.stringify(t)})`, false);
const fiche = () => b.S(`return JSON.stringify(await S.getOne('fiches','${ID}'))`).then(JSON.parse);
// sélecteur de fichier intercepté : UN écouteur, une file — chaque ouverture reçoit le fichier suivant
await b.c.send('Page.enable'); await b.c.send('DOM.enable');
await b.c.send('Page.setInterceptFileChooserDialog', { enabled: true });
const fileFichiers = [];
b.c.on(async (m) => { if (m.method !== 'Page.fileChooserOpened') return; const x = fileFichiers.shift(); if (!x) return; await b.c.send('DOM.setFileInputFiles', { files: [x.chemin], backendNodeId: m.params.backendNodeId }); x.ok(true); });
b.fichierSuivant = (chemin) => new Promise((ok) => fileFichiers.push({ chemin, ok }));
const attendre = async (f, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await b.dormir(300); } return false; };

/* ---- cours PDF : l'écran ---- */
await b.ouvrir('Cours fichiers (test)'); await piege();
await ouvrirFichiers();
let p = await ligne('principal'), j = await ligne('jumelle');
b.ok(/Néphrologie — cours\.pdf \| 26 pages · importé le .* · 14 Ko/.test(p.texte) && p.boutons.join('|') === 'Remplacer|Exporter', 'cours PDF : Document principal [nom, pages, date d’import, taille] — Remplacer · Exporter', p.texte);
b.ok(/Aucune/.test(j.texte) && j.boutons.join('|') === 'Importer|Supprimer (grisé)|Exporter (grisé)', 'cours PDF : Fiche jumelle « Aucune » — Importer (Supprimer, Exporter grisés)', j.boutons.join(' · '));
await b.capture('fichiers-1-cours-pdf');
await b.clic(await bouton('principal', 'Exporter'), { att: 900 });
b.ok((await dl()).some((x) => x.nom === 'Néphrologie — cours.pdf' && x.taille > 1000), 'Exporter : le PDF principal tel quel', JSON.stringify(await dl()));
// nom éditable
await b.clic(await b.pos(`document.querySelector('.fcrs-ligne[data-ligne=principal] .fcrs-nom .cd-ic')`, false), { att: 300 });
await b.ev(`(()=>{const i=document.querySelector('.fcrs-nom-champ');i.select();return 1})()`);
await b.c.send('Input.insertText', { text: 'Néphrologie (v1).pdf' }); await b.T.Enter(); await b.dormir(800);
b.ok((await fiche()).pdfName === 'Néphrologie (v1).pdf' && (await ligne('principal')).texte.includes('Néphrologie (v1).pdf'), 'nom du fichier éditable');
// taille max
let pris = b.fichierSuivant(`${FX}/trop-lourd.pdf`);
await b.clic(await bouton('principal', 'Remplacer'), { att: 200 }); await pris; await b.dormir(800);
b.ok(await b.ev(`(document.querySelector('.fcrs .fj-erreur')?.innerText||'').startsWith('Fichier trop lourd : 101 Mo (maximum 100 Mo)')`), 'taille max : message clair, rien de remplacé', await b.ev(`document.querySelector('.fcrs .fj-erreur')?.innerText`));
/* ---- remplacer le principal ---- */
const ancienId = (await fiche()).pdfId;
pris = b.fichierSuivant(`${FX}/cours-v2.pdf`);
await b.clic(await bouton('principal', 'Remplacer'), { att: 200 }); await pris; await b.dormir(700);
b.ok(await b.ev(`(document.querySelector('.fcrs-confirme')?.innerText||'').includes('Remplacer « Néphrologie (v1).pdf » par « cours-v2.pdf » ?')`), 'remplacer : confirmation explicite avant');
await b.capture('fichiers-2-confirmation');
const backupsAvant = (await comptes()).backups;
await b.clic(await b.pos(`[...document.querySelectorAll('.fcrs-confirme button')].find(x=>x.innerText.includes('Remplacer le document principal'))`, false), { att: 300 });
await attendre(() => b.ev(`!!document.querySelector('.fcrs-etat.ok')`));
const fin = await b.ev(`document.querySelector('.fcrs-etat.ok')?.innerText||''`);
b.ok(/3 annotations replacées .* 1 annotation non replacée/.test(fin), 'remplacé : 3 annotations replacées, 1 non replacée (la page 5 n’existe plus)', fin);
await b.capture('fichiers-3-remplace');
const apres = await fiche();
const ann = JSON.parse(await b.S(`const r=[];for(const st of ['annotations','highlights'])for(const a of await S.getAll(st))if(a.ficheId==='${ID}'||String(a.ficheId).startsWith('${ID}::'))r.push({st,ns:a.ficheId,page:a.page,t:a.texte||(JSON.stringify(a.content||'').match(/"text":"([^"]*)"/)||[])[1]});return JSON.stringify(r)`));
const ou = (t) => ann.find((a) => a.t === t);
b.ok(ou('Boîte page 2').page === 2 && ou('surlignage page 3').page === 3 && ou('Boîte page 10').page === 25 && ou('Boîte page 10').ns === ID, 'annotations replacées sur la page correspondante (p.10 → p.25 dans la nouvelle version)', JSON.stringify(ann));
b.ok(ou('Boîte page 5').ns === `${ID}::retire:1`, 'l’annotation de la page disparue est gardée (calque d’archive), jamais perdue', ou('Boîte page 5').ns);
b.ok(apres.pdfId !== ancienId && apres.fichiersRetires.length === 1 && apres.fichiersRetires[0].fileId === ancienId && await b.S(`return !!(await S.getBlob('${ancienId}'))`), 'ancien fichier marqué retiré (fichiersRetires), pas effacé (blob présent)');
b.ok((await comptes()).backups === backupsAvant + 1, 'putBackup fait avant le remplacement');
b.ok(await b.S(`return (await S.getAll('questions')).some(q=>q.id&&q.ficheId==='${ID}') && !!(await S.getOne('transcript_session','ts-tb-fichiers')) && (await S.getOne('transcript_session','ts-tb-fichiers')).courseId==='${ID}' && !!(await S.getOne('reading_position','rp:${ID}'))`), 'flashcards, transcript et position de lecture restent rattachés au cours');
await b.clic(await b.pos(`[...document.querySelectorAll('.fcrs-etat .fcrs-lien')][0]`, false), { att: 700 });
b.ok(await b.ev(`document.body.innerText.includes('Annotations non replacées (1)') && document.body.innerText.includes('Boîte page 5')`), '« Annotations non replacées » : consultables');
await b.capture('fichiers-4-non-replacees');
await b.T.Escape(); await b.dormir(300);
await b.ev(`(()=>{const x=[...document.querySelectorAll('.day-pop-head button')];x.forEach(y=>y.click());return 1})()`); await b.dormir(800);
b.ok(await attendre(() => b.ev(`/25 pages/.test(document.querySelector('.lecteur-entete').innerText)`), 8000), 'le lecteur affiche le nouveau PDF (25 pages)');
/* ---- second principal refusé ---- */
const refus = await b.S(`const uu=performance.getEntriesByType('resource').map(e=>e.name);const F=await import(uu.find(n=>n.includes('/lib/fichiersCours.js')));
  try{await F.importerPrincipal({fiche:await S.getOne('fiches','${ID}'),fichiers:[new File([new Uint8Array(10)],'autre.pdf',{type:'application/pdf'})]});return 'accepté';}catch(e){return e.message}`);
b.ok(/déjà un document principal/.test(refus), 'second principal refusé proprement', refus);
const verrou = await b.S(`const uu=performance.getEntriesByType('resource').map(e=>e.name);const F=await import(uu.find(n=>n.includes('/lib/fichiersCours.js')));
  let lacher;const long=F.avecVerrou('test',()=>new Promise(r=>{lacher=r}));let msg='';try{await F.avecVerrou('autre',async()=>1)}catch(e){msg=e.message}lacher();await long;return msg`);
b.ok(/Un import est déjà en cours/.test(verrou), 'un seul import à la fois', verrou);
/* ---- fiche jumelle : importer, remplacer, supprimer ---- */
await ouvrirFichiers();
pris = b.fichierSuivant(`${FX}/fiche.pdf`);
await b.clic(await bouton('jumelle', 'Importer'), { att: 200 }); await pris;
await attendre(() => b.ev(`document.body.innerText.includes('Voir la fiche')`));
await b.clic(await b.bouton('Voir la fiche'), { att: 1800 });
b.ok(await b.ev(`!!document.querySelector('.pdfr-jumelle-bascule')`), 'fiche jumelle importée : bascule Original · Fiche');
await b.S(`await S.put('annotations',S.newNoteBox({ficheId:'${ID}::fiche:1',page:1,x:.5,y:.3,width:.3,height:.1,couleur:'jaune',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Boîte de la fiche'}]}]}}));return 1`);
await b.biblio(); 
b.ok(await b.ev(`[...document.querySelectorAll('.lt-fiche')].filter(e=>e.innerText.startsWith('Cours fichiers (test)')).length===1 && [...document.querySelectorAll('.lt-fiche')].find(e=>e.innerText.startsWith('Cours fichiers (test)')).querySelector('.lib-marque-fiche')!==null`), 'Bibliothèque : une carte pour le cours, badge « fiche »');
await b.ouvrir('Cours fichiers (test)'); await piege();
await ouvrirFichiers();
j = await ligne('jumelle');
b.ok(/fiche\.pdf \| 30 pages · importée le .*/.test(j.texte) && j.boutons.join('|') === 'Remplacer|Supprimer|Exporter', 'cours avec fiche : ligne Fiche jumelle [nom, pages, date, taille] — Remplacer · Supprimer · Exporter', j.texte);
await b.capture('fichiers-5-avec-fiche');
pris = b.fichierSuivant(`${FX}/fiche-v2.pdf`);
await b.clic(await bouton('jumelle', 'Remplacer'), { att: 200 }); await pris;
await attendre(() => b.ev(`document.body.innerText.includes('Vérifier la correspondance')`));
b.ok(await b.ev(`document.body.innerText.includes('Remplacer la fiche')`), 'remplacer la fiche : nouvelle version importée (annotations replacées)');
await b.T.Escape(); await b.ev(`(()=>{[...document.querySelectorAll('.day-pop-head button')].forEach(y=>y.click());return 1})()`); await b.dormir(600);
const annJ = await b.S(`return (await S.getAll('annotations')).filter(a=>String(a.ficheId).startsWith('${ID}::fiche:')).length`);
await ouvrirFichiers();
await b.clic(await bouton('jumelle', 'Supprimer'), { att: 400 });
b.ok(await b.ev(`(document.querySelector('.fcrs-confirme.danger')?.innerText||'').includes('Supprimer la fiche jumelle « fiche-v2.pdf » ?')`), 'supprimer la fiche : confirmation explicite');
const bk = (await comptes()).backups;
await b.clic(await b.pos(`[...document.querySelectorAll('.fcrs-confirme button')].find(x=>x.innerText.includes('Supprimer la fiche jumelle'))`, false), { att: 300 });
await attendre(() => b.ev(`!!document.querySelector('.fcrs-etat.ok')`));
b.ok(!(await b.S(`return !!(await S.getOne('companion_pdf','cp:${ID}'))`)) && (await b.S(`return (await S.getAll('annotations')).filter(a=>String(a.ficheId).startsWith('${ID}::fiche:')).length`)) === 0 && (await comptes()).backups === bk + 1, `fiche supprimée avec ses ${annJ} annotations propres, après putBackup`);
await b.ev(`(()=>{[...document.querySelectorAll('.day-pop-head button')].forEach(y=>y.click());return 1})()`); await b.dormir(900);
b.ok(!(await b.ev(`!!document.querySelector('.pdfr-jumelle-bascule')`)), 'cours revenu « sans fiche » : bascule Original/Fiche masquée');
await b.biblio();
b.ok(await b.ev(`[...document.querySelectorAll('.lt-fiche')].find(e=>e.innerText.startsWith('Cours fichiers (test)')).querySelector('.lib-marque-fiche')===null`), 'Bibliothèque : plus de badge « fiche »');
/* ---- document créé dans l'app ---- */
await b.ouvrir('Conformité doc'); await ouvrirFichiers();
p = await ligne('principal'); j = await ligne('jumelle');
b.ok(/Conformité doc .* document de l’app/.test(p.texte) && p.boutons.join('|') === 'Remplacer (grisé)|Exporter' && j.boutons[0] === 'Importer', 'document : principal « document de l’app » (Remplacer grisé, Exporter), fiche jumelle importable', p.texte + ' / ' + p.boutons.join(' · '));
await b.capture('fichiers-6-document');
await b.ev(`(()=>{[...document.querySelectorAll('.day-pop-head button')].forEach(y=>y.click());return 1})()`); await b.dormir(400);
/* ---- Bibliothèque : plus d'« attacher » ; Fichiers du cours depuis le menu ⋯ ---- */
await b.biblio();
await b.ev(`(()=>{const x=[...document.querySelectorAll('.lt-fiche .lt-rangee')].find(e=>e.innerText.startsWith('Cours fichiers (test)')).querySelector('[title="Autres actions"]');x.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:300,clientY:300}));return 1})()`); await b.dormir(400);
const menu = await b.ev(`[...document.querySelectorAll('.ctx-menu-item')].map(x=>x.innerText.trim()).join('|')`);
b.ok(menu.includes('Fichiers du cours…') && !/Attacher|Ouvrir en HTML|Ouvrir en PDF|Remplacer le fichier HTML/.test(menu), 'menu ⋯ : « Fichiers du cours… », plus d’« attacher » ni de PDF/HTML secondaires', menu);
await b.clic(await b.pos(`[...document.querySelectorAll('.ctx-menu-item')].find(x=>x.innerText.trim()==='Fichiers du cours…')`, false), { att: 2500 });
b.ok(await b.ev(`!!document.querySelector('.fcrs') && !!document.querySelector('.pdfr-scroll')`), 'Bibliothèque › Fichiers du cours… : le cours s’ouvre sur cet écran');
await b.ev(`(()=>{[...document.querySelectorAll('.day-pop-head button')].forEach(y=>y.click());return 1})()`); await b.dormir(300);
/* ---- Archives ---- */
await b.ev(`(()=>{const x=[...document.querySelectorAll('.sb-item')].find(e=>/Réglages/.test(e.title||''));x&&x.click();return 1})()`); await b.dormir(1500);
const arch = await b.ev(`document.querySelector('#reglages-archives-fichiers')?.closest('.card')?.innerText||''`);
b.ok(arch.includes('Néphrologie (v1).pdf') && arch.includes('Document principal remplacé') && arch.includes('Fiche jumelle supprimée') && arch.includes('Fiche HTML en plus du PDF principal'), 'Réglages › Archives : principal remplacé, fiche supprimée, HTML en trop — en lecture', arch.slice(0, 400));
await b.ev(`document.querySelector('#reglages-archives-fichiers').scrollIntoView({block:'start'}),1`); await b.dormir(300);
await b.capture('fichiers-7-archives');
/* ---- comptes avant / après ---- */
const fin2 = await comptes();
console.log('comptes avant', JSON.stringify(avant)); console.log('comptes après', JSON.stringify(fin2));
b.ok(fin2.blobs >= avant.blobs + 3 && fin2.highlights === avant.highlights && fin2.annotations === avant.annotations && fin2.questions === avant.questions && fin2.transcript_session === avant.transcript_session && fin2.reading_position === avant.reading_position,
  'aucune donnée effacée : fichiers (blobs) seulement ajoutés ; surlignages, annotations du cours, cartes, transcripts, positions inchangés en nombre (seules les annotations de la fiche supprimée, sauvegardées avant, sont parties)');
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' / '));
process.exit(0);
