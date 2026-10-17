// (17/10 soir) Import de flashcards (JSON) depuis le panneau : « Voir le format attendu » copié et réimporté tel
// quel (6 types), erreurs claires par carte et par ligne, aperçu, doublons (Ignorer / Importer quand même), date de
// départ, cartes dans les J ; fichier .json et .zip (JSON + image jointe). Base LOCALE du banc.
import { banc } from './commun.mjs';
const FX = '/private/tmp/claude-501/-Users-yoannlmr/674331a8-6a8d-4fc3-b297-21ed022b7f02/scratchpad/import';
const b = await banc(1440, 900);
await b.c.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: 'http://localhost:5199' }).catch(() => {});
// fiche dédiée, vidée : « Import (test 17/10) » (même PDF que la fiche jumelle)
await b.S(`for(const q of await S.getAll('questions'))if(q.ficheId==='f-002-imp')await S.remove('questions',q.id);
  const fj=await S.getOne('fiches','f-fj');await S.put('sources',{id:'src-rv',nom:'HELHa (test 17/10)',rappelsJ:true});
  await S.put('matieres',{id:'mat-tb',sourceId:'src-rv',nom:'Myologie (test 17/10)',couleur:'teal'});
  await S.put('fiches',{id:'f-002-imp',matiereId:'mat-tb',dossierId:null,ordre:2,titre:'Import (test 17/10)',type:'standard',pdfId:fj.pdfId,pdfName:'cours.pdf',dateImport:'2026-10-10'});return 1`);
await b.biblio({ recharger: true });
await b.ouvrir('Import (test 17/10)');
await b.panneauFlashcards();
const btn = await b.ev(`(()=>{const a=[...document.querySelectorAll('.pm-actions button')];const i=a.findIndex(x=>x.dataset.act==='importer-fc');const j=a.findIndex(x=>x.innerText.trim()==='Ajouter');return {i,j,txt:i>=0?a[i].innerText.trim():null}})()`);
b.ok(btn.i === btn.j + 1 && btn.txt === 'Importer', 'Flashcards : bouton « Importer » juste à côté de « + Ajouter »', JSON.stringify(btn));
await b.clic(await b.pos(`document.querySelector('[data-act=importer-fc]')`), { att: 500 });
const M = `document.querySelector('[data-import-flashcards]')`;
b.ok(await b.ev(`!!${M}`), 'fenêtre « Importer des flashcards »');
const fiche = () => b.S(`return (await S.getAll('questions')).filter(q=>q.ficheId==='f-002-imp').map(q=>({recto:q.recto,due:q.dueDate,j0:q.j0Date||null,muscle:!!q.muscle,mol:q.molecule?q.molecule.smiles:null,tab:q.tableau?q.tableau.colonnes.length+'x'+q.tableau.lignes.length:null,img:q.imageId||null,place:q.imagePlace||null,cloze:q.cloze||null,type:q.type}))`);
const coller = async (t) => { await b.remplir(`${M}.querySelector('[data-champ=json]')`, t); await b.clic(await b.pos(`${M}.querySelector('[data-act=analyser]')`), { att: 1500 }); };
const apercu = () => b.ev(`(()=>{const a=${M}.querySelector('[data-apercu]');if(!a)return {globale:(${M}.querySelector('.ifc-erreur-globale')||{}).innerText||null};return {erreurs:[...a.querySelectorAll('[data-erreur]')].map(x=>x.innerText.trim()),compte:Object.fromEntries([...a.querySelectorAll('[data-sorte]')].map(x=>[x.dataset.sorte,+x.querySelector('.tnum').innerText])),exemples:a.querySelectorAll('.ifc-exemple').length,doublons:+(a.querySelector('[data-doublons]')||{dataset:{doublons:0}}).dataset.doublons,bouton:(a.querySelector('[data-act=importer]')||{}).innerText?.trim(),actif:!(a.querySelector('[data-act=importer]')||{}).disabled}})()`);
// 1. le format attendu : exemple complet copié d'un clic, prompt de génération
await b.clic(await b.pos(`${M}.querySelector('[data-act=format]')`), { att: 400 });
const fmt = await b.ev(`({ex:${M}.querySelector('[data-exemple]').innerText,prompt:${M}.querySelector('.ifc-prompt').innerText})`);
b.ok(/"muscle"/.test(fmt.ex) && /"molecule"/.test(fmt.ex) && /"tableau"/.test(fmt.ex) && /"image"/.test(fmt.ex) && /"cloze"/.test(fmt.ex) && /_commentaire/.test(fmt.ex), '« Voir le format attendu » : exemple commenté couvrant texte, trous, image, Muscle, Molécule, Tableau');
b.ok(/PROMPT DE COMPLÉTION MEDREVISE — BIOLOGIE/.test(fmt.prompt) && /TYPES DE FLASHCARDS SUPPLÉMENTAIRES/.test(fmt.prompt), 'et le prompt de génération (Réglages › Prompts) complété des types en plus');
await b.capture('imp-format', await b.ev(`(()=>{const r=${M}.closest('.day-pop').getBoundingClientRect();return {x:r.x-6,y:Math.max(0,r.y-6),width:r.width+12,height:Math.min(900,r.height+12)}})()`));
await b.clic(await b.pos(`${M}.querySelector('[data-copier=exemple]')`), { att: 400 });
const presse = await b.ev(`navigator.clipboard.readText().catch(e=>'ERREUR '+e.message)`);
b.ok(presse === fmt.ex.trim() || JSON.stringify(JSON.parse(presse)) === JSON.stringify(JSON.parse(fmt.ex)), 'copié d’un clic dans le presse-papiers', presse.slice(0, 60));
await b.clic(await b.pos(`${M}.querySelector('[data-act=format]')`), { att: 300 });
// 2. réimporté TEL QUEL : 0 erreur, 6 cartes, une par type
await coller(presse);
let a = await apercu();
b.ok(a.erreurs && a.erreurs.length === 0 && JSON.stringify(a.compte) === JSON.stringify({ texte: 1, trous: 1, image: 1, muscle: 1, molecule: 1, tableau: 1 }) && a.exemples === 3, 'l’exemple réimporté tel quel : aucune erreur, 6 cartes (1 par type), 3 exemples', JSON.stringify(a));
await b.capture('imp-apercu', await b.ev(`(()=>{const r=${M}.closest('.day-pop').getBoundingClientRect();return {x:r.x-6,y:Math.max(0,r.y-6),width:r.width+12,height:Math.min(900,r.height+12)}})()`));
await b.clic(await b.pos(`${M}.querySelector('[data-act=importer]')`), { att: 2000 });
let f = await fiche();
const auj = await b.S(`return (await import(performance.getEntriesByType('resource').map(e=>e.name).find(n=>n.includes('/medrevise/lib/sm2.js'))||'/src/medrevise/lib/sm2.js')).todayISO()`);
b.ok(f.length === 6 && f.every((q) => q.type === 'flashcard' && q.due === auj), '6 cartes rattachées à la fiche, dans les J (dues le jour de départ : aujourd’hui)', JSON.stringify(f.map((q) => q.due)));
b.ok(f.some((q) => q.muscle) && f.some((q) => q.mol === 'CCO') && f.some((q) => q.tab === '3x3') && f.some((q) => q.img && q.place === 'recto') && f.some((q) => q.cloze && q.cloze[0] === 'abducens'), 'chaque type conservé : Muscle, Molécule (SMILES CCO), Tableau 3×3, image (recto), trous', JSON.stringify(f.map((q) => [q.muscle, q.mol, q.tab, !!q.img, q.cloze])));
b.ok(await b.ev(`!!${M}.querySelector('[data-fait="6"]')`), 'message « 6 cartes importées … dans les J à partir du … »');
// 3. doublons : même JSON → 6 doublons ; Ignorer (0) / Importer quand même (6)
await coller(presse);
a = await apercu();
b.ok(a.doublons === 6 && a.bouton === 'Importer 0 carte' && !a.actif, 'réimport : 6 doublons (recto identique), « Ignorer » par défaut → rien à importer', JSON.stringify(a));
await b.clic(await b.pos(`${M}.querySelector('[data-doublons-choix=importer]')`), { att: 200 });
a = await apercu();
b.ok(a.bouton === 'Importer 6 cartes' && a.actif, '« Importer quand même » → 6 cartes', a.bouton);
await b.capture('imp-doublons', await b.ev(`(()=>{const r=${M}.closest('.day-pop').getBoundingClientRect();return {x:r.x-6,y:Math.max(0,r.y-6),width:r.width+12,height:Math.min(900,r.height+12)}})()`));
await b.clic(await b.pos(`${M}.querySelector('[data-act=importer]')`), { att: 2000 });
b.ok((await fiche()).length === 12, 'importées quand même : 12 cartes');
// 4. erreurs claires, carte par carte, avec la ligne
const FAUX = `{
  "items": [
    { "type": "flashcard", "recto": "Sans verso" },
    { "type": "carte", "recto": "a", "verso": "b" },
    { "type": "flashcard", "recto": "a", "verso": "b", "couleur": "rouge" },
    {
      "type": "flashcard", "recto": "Trop large",
      "tableau": { "colonnes": ["1","2","3","4","5","6","7"], "lignes": [["a"]] }
    },
    { "type": "flashcard", "recto": "Biceps", "muscle": { "origine": "x", "nerf": "y" } },
    { "type": "flashcard", "molecule": { "nom": "Truc", "smiles": "C1CC(" } },
    { "type": "flashcard", "recto": "Image", "verso": "x", "image": { "fichier": "absente.png" } },
    { "type": "qcm", "enonce": "?", "options": ["a","b"], "reponses_correctes": [0] },
    { "type": "flashcard", "recto": "Bonne", "verso": "carte" }
  ]
}`;
await coller(FAUX);
a = await apercu();
const att = ['Carte 1 (ligne 3) : champ « verso » manquant', 'Carte 2 (ligne 4) : type inconnu « carte » (attendu : flashcard)', 'Carte 3 (ligne 5) : champ inconnu « couleur »', 'Carte 4 (ligne 6) : tableau.colonnes : 7 colonnes (de 2 à 6)', 'Carte 5 (ligne 10) : muscle.nerf : champ inconnu (attendus : origine, trajet, insertion, action, innervation)', 'Carte 6 (ligne 11) : molecule.smiles « C1CC( » : SMILES illisible', 'Carte 7 (ligne 12) : image.fichier « absente.png » : importe un .zip qui contient ce fichier (ou utilise image.data)'];
b.ok(JSON.stringify(a.erreurs) === JSON.stringify(att), 'erreurs claires : une par carte, avec sa ligne et le champ en cause', a.erreurs.join(' | '));
b.ok(!a.actif && await b.ev(`/1 item d’un autre type \\(qcm\\)/.test(${M}.querySelector('.ifc-autres').innerText)`), 'rien n’est importable tant qu’il reste une erreur ; le QCM est signalé et laissé de côté');
await b.capture('imp-erreurs', await b.ev(`(()=>{const r=${M}.closest('.day-pop').getBoundingClientRect();return {x:r.x-6,y:Math.max(0,r.y-6),width:r.width+12,height:Math.min(900,r.height+12)}})()`));
await coller('pas du json');
b.ok(/JSON invalide/.test((await apercu()).globale || ''), 'texte qui n’est pas du JSON : message clair', (await apercu()).globale);
// 5. date de départ choisie
await coller('{"items":[{"type":"flashcard","recto":"Quel muscle est le principal extenseur de la hanche ?","verso":"Le grand glutéal."}]}');
await b.remplir(`${M}.querySelector('[data-champ=depart]')`, '2026-10-25');
await b.ev(`${M}.querySelector('[data-champ=depart]').dispatchEvent(new Event('change',{bubbles:true}));1`);
await b.clic(await b.pos(`${M}.querySelector('[data-act=importer]')`), { att: 1500 });
f = await fiche();
const ext = f.find((q) => /principal extenseur/.test(q.recto));
b.ok(ext && ext.due === '2026-10-25', 'date de départ choisie (25/10) : la carte entre dans les J ce jour-là', ext && ext.due);
// 6. fichier .json puis .zip (JSON + image jointe)
await b.clic(await b.pos(`${M}.querySelector('.ifc-onglets .seg-btn:nth-child(2)')`), { att: 300 });
let pris = b.choisirFichier(FX + '/fichier.json');
await b.clic(await b.pos(`[...${M}.querySelectorAll('button')].find(x=>x.innerText.startsWith('Choisir un fichier'))`), { att: 300 });
await pris; await b.dormir(1200);
a = await apercu();
b.ok(a.erreurs && a.erreurs.length === 0 && a.compte.texte === 1, 'fichier .json : analysé (1 carte)', JSON.stringify(a.compte));
await b.clic(await b.pos(`${M}.querySelector('[data-act=importer]')`), { att: 1500 });
pris = b.choisirFichier(FX + '/avec-image.zip');
await b.clic(await b.pos(`[...${M}.querySelectorAll('button')].find(x=>x.innerText.startsWith('Choisir un fichier'))`), { att: 300 });
await pris; await b.dormir(1500);
a = await apercu();
b.ok(a.erreurs && a.erreurs.length === 0 && a.compte.image === 1 && a.compte.texte === 1, 'fichier .zip : le JSON et son image jointe (image.fichier)', JSON.stringify(a));
await b.clic(await b.pos(`${M}.querySelector('[data-act=importer]')`), { att: 1800 });
f = await fiche();
const ac = f.find((q) => /acromion/.test(q.recto));
const blob = ac && ac.img ? await b.S(`const b=await S.getBlob(${JSON.stringify(ac.img)});return b?{t:b.type,n:b.size}:null`) : null;
b.ok(ac && ac.place === 'verso' && blob && blob.t === 'image/png' && blob.n > 0, 'image du .zip enregistrée (blob PNG, au verso)', JSON.stringify(blob));
b.ok(f.some((q) => /Sphéroïde|hanche \?/.test(q.recto + (q.verso || ''))), 'carte du .json importée');
await b.T.Escape(); await b.dormir(400);
// panneau : les cartes importées s'y affichent
const tags = await b.ev(`[...document.querySelectorAll('.pis-face-tag')].map(x=>x.textContent.trim())`);
b.ok(tags.includes('Muscle') && tags.filter((t) => t === 'Tableau').length >= 2, 'panneau : cartes Muscle, Tableau… affichées comme les autres', [...new Set(tags)].join(', '));
b.ok(!b.erreurs.length, 'aucune erreur dans la page', b.erreurs.join(' / '));
process.exit(0);
