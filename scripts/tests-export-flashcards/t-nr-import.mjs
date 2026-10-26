// Non-régression de l'import existant (Chrome C) dans un cours vide : « Voir le format attendu » › « Essayer cet exemple »
// (aucune erreur, chaque type, cartes neuves dans les J à la date de départ), validation toujours stricte (champ
// inconnu, image manquante dans le .zip : un message par carte, rien d'importé), doublons (Ignorer par défaut), et un
// .zip « à l'ancienne » (JSON + image jointe par son nom) : l'image est importée.
import { banc, SORTIE } from './commun.mjs';
const b = await banc(false);
await b.ouvrirApp({ recharger: true });
await b.S(`for(const q of await S.getAll('questions'))if(q.ficheId==='fx-nr')await S.remove('questions',q.id);
  const f=await S.getOne('fiches','fx-tous');await S.put('fiches',{...f,id:'fx-nr',titre:'Non-régression import',ordre:9});return 1`);
await b.ouvrirApp({ recharger: true });
const AUJ = new Date().toLocaleDateString('fr-CA');
await b.ouvrirCours('Non-régression import');
const M = `document.querySelector('[data-import-flashcards]')`;
const ouvrir = async () => { await b.toucher(`document.querySelector('[data-act="importer-fc"]')`, 500); };
const apercu = () => b.ev(`(()=>{const a=${M}.querySelector('[data-apercu]');if(!a)return {globale:(${M}.querySelector('.ifc-erreur-globale')||{}).innerText||null};return {erreurs:[...a.querySelectorAll('[data-erreur]')].map(x=>x.innerText.trim()),compte:Object.fromEntries([...a.querySelectorAll('[data-sorte]')].map(x=>[x.dataset.sorte,+x.querySelector('.tnum').innerText])),doublons:+(a.querySelector('[data-doublons]')||{dataset:{doublons:0}}).dataset.doublons,bouton:(a.querySelector('[data-act=importer]')||{}).innerText?.trim(),actif:!(a.querySelector('[data-act=importer]')||{}).disabled,progression:!!a.querySelector('[data-champ=progression]')}})()`);
const coller = async (t) => {
  await b.ev(`(()=>{const t=${M}.querySelector('[data-champ=json]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,${JSON.stringify(t)});t.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
  await b.toucher(`${M}.querySelector('[data-act=analyser]')`, 1500);
};
// 1. l'exemple du format attendu, tel quel
await ouvrir();
await b.toucher(`${M}.querySelector('[data-act=format]')`, 400);
await b.ev(`[...${M}.querySelectorAll('button')].find(x=>/Essayer cet exemple/.test(x.textContent)).click()`);
await b.attendre(`!!${M}.querySelector('[data-apercu]')`, 30000);
let a = await apercu();
b.v(a.erreurs.length === 0 && JSON.stringify(a.compte) === JSON.stringify({ texte: 2, trous: 1, image: 1, muscle: 1, molecule: 1, tableau: 1 }) && a.actif && !a.progression, '« Essayer cet exemple » : aucune erreur, 7 cartes (chaque type), pas d’option de progression (un JSON sans « progress »)', JSON.stringify(a));
await b.toucher(`${M}.querySelector('[data-act=importer]')`, 2000);
const cartes = await b.S(`return (await S.getAll('questions')).filter(q=>q.ficheId==='fx-nr').map(q=>({recto:q.recto,nouvelle:q.nouvelle,due:q.dueDate,j0:q.j0Date,img:!!q.imageId,muscle:!!q.muscle,mol:!!q.molecule,tab:!!q.tableau,items:(q.items||[]).length}))`);
b.v(cartes.length === 7 && cartes.every((q) => q.nouvelle === true && q.due === AUJ && q.j0 === AUJ), 'importées : 7 cartes neuves, dans les J à partir d’aujourd’hui', cartes.length + ' cartes');
b.v(cartes.filter((q) => q.img).length === 1 && cartes.some((q) => q.muscle) && cartes.some((q) => q.mol) && cartes.some((q) => q.tab) && cartes.some((q) => q.items === 4), 'image, Muscle, Molécule, Tableau, éléments à révéler : comme avant');
// 2. doublons : le même exemple une 2e fois → 7 doublons, « Ignorer » par défaut → rien à importer
await b.fermerFenetre(); await b.dormir(400);
await ouvrir();
await coller(await b.ev(`(async()=>(await import('/src/medrevise/lib/importFlashcards.js')).exempleJSON())()`));
a = await apercu();
b.v(a.doublons === 7 && /Importer 0 carte/.test(a.bouton) && !a.actif, 'doublons : 7 détectés, « Ignorer » par défaut (Importer 0 carte)', JSON.stringify({ d: a.doublons, b: a.bouton }));
// 3. validation stricte : champ inconnu, image absente du .zip
await coller(JSON.stringify({ items: [{ type: 'flashcard', recto: 'R', verso: 'V', bidule: 1 }, { type: 'flashcard', recto: 'R2', verso: 'V2', image: { fichier: 'absente.png' } }, { type: 'flashcard', recto: 'R3', verso: 'V3', a_apprendre: 'oui' }] }, null, 2));
a = await apercu();
b.v(a.erreurs.length === 3 && /Carte 1 \(ligne 3\) : champ inconnu « bidule »/.test(a.erreurs[0]) && /image\.fichier « absente\.png »/.test(a.erreurs[1]) && /a_apprendre/.test(a.erreurs[2]) && !a.actif, 'validation stricte : un message par carte (numéro, ligne, champ), rien d’importable', a.erreurs.join(' | '));
await b.fermerFenetre(); await b.dormir(400);
// 4. .zip « à l'ancienne » : un JSON + une image jointe par son nom
const zip = await b.ev(`(async()=>{const {creerZip}=await import('/src/medrevise/lib/zipSimple.js');const c=document.createElement('canvas');c.width=120;c.height=80;const g=c.getContext('2d');g.fillStyle='#c33';g.fillRect(0,0,120,80);
  const png=new Uint8Array(await (await new Promise(ok=>c.toBlob(ok,'image/png'))).arrayBuffer());
  const z=creerZip([{nom:'cartes.json',donnees:JSON.stringify({items:[{type:'flashcard',recto:'Carte avec image jointe (ancien zip)',verso:'Rouge',image:{fichier:'rouge.png',place:'verso'}}]})},{nom:'rouge.png',donnees:png}]);
  const a=new Uint8Array(await z.arrayBuffer());let s='';for(const x of a)s+=String.fromCharCode(x);return btoa(s)})()`);
const fs = await import('node:fs');
fs.writeFileSync(SORTIE + '/ancien.zip', Buffer.from(zip, 'base64'));
await ouvrir();
await b.ev(`[...document.querySelectorAll('.ifc-onglets .seg-btn')].find(x=>/Fichier/.test(x.textContent)).click()`); await b.dormir(300);
await b.deposer(`${M}.querySelector('input[type=file]')`, SORTIE + '/ancien.zip');
await b.attendre(`!!${M}.querySelector('[data-apercu]')`, 30000);
a = await apercu();
b.v(a.erreurs.length === 0 && a.compte.image === 1, 'ancien .zip (JSON + image jointe) : accepté', JSON.stringify(a.compte));
await b.toucher(`${M}.querySelector('[data-act=importer]')`, 2000);
const c = await b.S(`const q=(await S.getAll('questions')).find(x=>x.ficheId==='fx-nr'&&/ancien zip/.test(x.recto));const bl=q&&await S.getBlob(q.imageId);return q&&{place:q.imagePlace,type:bl&&bl.type,taille:bl&&bl.size}`);
b.v(c && c.place === 'verso' && c.type === 'image/png' && c.taille > 0, 'image du .zip importée (verso, PNG)', JSON.stringify(c));
b.fin();
