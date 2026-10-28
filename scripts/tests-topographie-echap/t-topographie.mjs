// Ligne « Topographie » des cartes Muscle (28/10) — ordinateur (C). Rejouer tests-par-cours-elements/seed.mjs avant.
// Formulaire : 6ᵉ ligne après Innervation, aucune mention « optionnel » sur le tableau ; création avec la Topographie SEULE
// (texte + image collée), puis avec le nom seul ; révision ligne par ligne (vue agrandie, mode Apprentissage) ; ancienne
// carte Muscle : Topographie vide « — », carte en base identique ; « Voir le format attendu », import, export .zip ré-importé.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { banc } from './commun.mjs';
const b = await banc(false);
const v = b.v;
const SORTIE = process.env.SORTIE || '/tmp/topo'; fs.mkdirSync(SORTIE, { recursive: true });
const hTemoin = () => b.S(`const q=await S.getOne('questions','temoin-muscle');const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(q)));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,16)`);
const h0 = await hTemoin();
const carte = (recto) => b.S(`return (await S.getAll('questions')).find(q=>q.ficheId==='f5'&&q.recto===${JSON.stringify(recto)}&&!q.deleted)||null`);
v(await b.ouvrirCours('Cours témoin', { recharger: true }), 'cours « Cours témoin » ouvert');
await b.ongletFlashcards();
await b.toucher(`document.querySelector('.fcl-nouvelle')`, 800);
await b.sorte('muscle');

// ---- formulaire ----
const f = await b.ev(`(()=>{const t=document.querySelector('.fc-carte .mu-saisie');return {labels:[...t.querySelectorAll('.mu-saisie-ligne > label')].map(l=>l.textContent),txt:t.textContent}})()`);
v(f.labels.length === 6 && f.labels[4] === 'Innervation' && f.labels[5] === 'Topographie', '6 lignes, « Topographie » tout en bas après Innervation', f.labels.join(' · '));
v(!/option|facultati|obligatoire/i.test(f.txt), 'aucune mention « optionnel » / « facultatif » sur le tableau');
const bouton = () => b.ev(`(()=>{const x=[...document.querySelectorAll('.fc-carte .imp-actions button')].find(x=>/^\\s*Ajouter/.test(x.textContent)&&x.offsetParent);return x?!x.disabled:null})()`);

// Topographie SEULE : texte + image collée (⌘V dans le champ)
await b.focusEcrire(`document.querySelector('#mu-topographie')`, 'Loge antérieure du bras, sous le biceps brachial');
await b.ev(`(async()=>{const c=document.createElement('canvas');c.width=120;c.height=80;const x=c.getContext('2d');x.fillStyle='#c0392b';x.fillRect(0,0,120,80);x.fillStyle='#fff';x.font='20px sans-serif';x.fillText('TOPO',30,48);
  const bl=await new Promise(r=>c.toBlob(r,'image/png'));const dt=new DataTransfer();dt.items.add(new File([bl],'topo.png',{type:'image/png'}));
  const t=document.querySelector('#mu-topographie');t.focus();t.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));return 1})()`);
await b.dormir(800);
v(await b.ev(`!!document.querySelector('[data-zone-image="topographie"] img')`), 'image collée sur la ligne Topographie (même zone image que les autres lignes)');
await b.focusEcrire(`[...document.querySelectorAll('.fc-carte input.imp-title')].find(i=>/Grand glutéal/.test(i.placeholder)&&i.offsetParent)`, 'Brachial');
v(await bouton(), '« Ajouter » actif avec le nom + la seule Topographie');
await b.capture('topo-formulaire', await b.ev(`(()=>{const r=document.querySelector('.fc-carte').getBoundingClientRect();return {x:r.x-6,y:Math.max(0,r.y-6),width:r.width+12,height:Math.min(innerHeight-Math.max(0,r.y-6),r.height+12)}})()`));
await b.toucher(`[...document.querySelectorAll('.fc-carte .imp-actions button')].find(x=>/^\\s*Ajouter/.test(x.textContent)&&x.offsetParent)`, 1500);
let c1 = await carte('Brachial');
v(c1 && c1.muscle.lignes.topographie === 'Loge antérieure du bras, sous le biceps brachial' && ['origine', 'trajet', 'insertion', 'action', 'innervation'].every((k) => c1.muscle.lignes[k] === ''), 'base : carte créée, topographie remplie, les 5 autres vides', JSON.stringify(c1 && c1.muscle.lignes));
v(c1 && c1.muscle.images && c1.muscle.images.topographie && c1.muscle.images.topographie.imageId, 'base : image rangée sous muscle.images.topographie', JSON.stringify(c1 && c1.muscle.images));

// nom SEUL
await b.attendre(`document.querySelector('#mu-topographie').value==='' && !!document.querySelector('.fc-carte-nb')`, 15000).catch(() => {});
v((await b.ev(`document.querySelector('#mu-topographie').value`)) === '', 'formulaire vidé pour enchaîner');
await b.focusEcrire(`[...document.querySelectorAll('.fc-carte input.imp-title')].find(i=>/Grand glutéal/.test(i.placeholder)&&i.offsetParent)`, 'Coraco-brachial');
v(await bouton(), '« Ajouter » actif avec le nom seul (toutes les lignes vides)');
await b.toucher(`[...document.querySelectorAll('.fc-carte .imp-actions button')].find(x=>/^\\s*Ajouter/.test(x.textContent)&&x.offsetParent)`, 1500);
await b.attendre(`/2 ajoutées/.test((document.querySelector('.fc-carte-nb')||{}).textContent||'')`, 15000).catch(() => {});
const c2 = await carte('Coraco-brachial');
v(c2 && Object.values(c2.muscle.lignes).every((x) => x === '') && Object.keys(c2.muscle.lignes).length === 6, 'base : carte « Coraco-brachial » créée, 6 lignes vides');
await b.toucher(`[...document.querySelectorAll('.fc-carte .imp-actions button')].find(x=>/Annuler/.test(x.textContent)&&x.offsetParent)`, 600);

// ---- révision : vue agrandie ----
const agrandir = async (id) => {
  await b.survol(b.carteListe(id));
  await b.toucher(`${b.carteListe(id)}.querySelector('[data-act="agrandir"]')`, 900);
  await b.toucher(`document.querySelector('.va .sfc-carte')`, 700);
};
const etat = () => b.ev(`(()=>{const d=document.querySelector('.va');return {l:[...d.querySelectorAll('.mu-tableau .mu-ligne')].map(x=>x.dataset.ligne+'='+(x.classList.contains('cachee')?'?':x.querySelector('.mu-contenu').textContent.trim()||(x.querySelector('img')?'[img]':''))),tout:(d.querySelector('.mu-tout-btn')||{}).textContent||'',img:!!d.querySelector('[data-ligne="topographie"] img')}})()`);
await agrandir(c1.id);
let s = await etat();
v(s.l.length === 6 && s.l[5] === 'topographie=?' && s.l.slice(0, 5).every((x) => x.endsWith('=—')) && /\(1\)/.test(s.tout), 'Brachial, verso : 6 lignes, les 5 vides affichent « — », Topographie masquée, « Tout révéler (1) »', s.l.join(' | '));
await b.capture('topo-revision-masquee');
await b.toucher(`document.querySelector('.va [data-ligne="topographie"].cachee')`, 500);
await b.attendre(`!!document.querySelector('.va [data-ligne="topographie"] img')`, 8000).catch(() => {});
s = await etat();
v(/topographie=Loge antérieure/.test(s.l[5]) && s.img && !s.tout, 'un toucher révèle la ligne Topographie : texte ET image', s.l[5]);
await b.capture('topo-revision-revelee');
await b.echap();
await agrandir(c2.id);
s = await etat();
v(s.l.length === 6 && s.l.every((x) => x.endsWith('=—')) && !s.tout, 'Coraco-brachial (nom seul) : 6 lignes « — », rien à révéler', s.l.join(' | '));
await b.echap();
await agrandir('temoin-muscle');
s = await etat();
v(s.l.length === 6 && s.l[5] === 'topographie=—' && s.l.slice(0, 5).every((x) => x.endsWith('=?')) && /\(5\)/.test(s.tout), 'ancienne carte Muscle : ses 5 lignes masquées comme avant, Topographie vide « — » en bas', s.l.join(' | '));
await b.capture('topo-ancienne-carte');
for (let i = 0; i < 5; i++) await b.toucher(`document.querySelector('.va .mu-ligne.cachee')`, 300);
s = await etat();
v(s.l.slice(0, 5).every((x) => !x.endsWith('=?')) && !s.tout, 'ancienne carte : révélation ligne par ligne (5 touchers)', s.l.join(' | '));
await b.echap();
v((await hTemoin()) === h0, `ancienne carte Muscle identique en base (${h0})`);

// ---- mode Apprentissage : session, ligne par ligne ----
await b.ev(`localStorage.removeItem('medrevise.apprentissage.filtres');1`);
await b.apprentissage();
await b.taper(`document.querySelector('.alib2-recherche input')`, 'Brachial');
await b.toucher(`document.querySelector('.alib-lancer')`, 900);
for (let i = 0; i < 4 && !(await b.ev(`/^\\s*Brachial|Brachial$/.test((document.querySelector('.alib-session .sfc-carte')||{}).innerText||'')`)); i++) { await b.toucher(`document.querySelector('.alib-session .sfc-carte')`, 500); await b.toucher(`document.querySelector('.alib-session [data-act="suivante"], .alib-session .alib-suivante')`, 600).catch(() => {}); }
await b.toucher(`document.querySelector('.alib-session .sfc-carte')`, 700);
const sess = await b.ev(`(()=>{const d=document.querySelector('.alib-session');return {l:d.querySelectorAll('.mu-tableau .mu-ligne').length,m:d.querySelectorAll('.mu-tableau .mu-masque').length,dern:([...d.querySelectorAll('.mu-tableau .mu-ligne')].pop().querySelector('.mu-etiquette')||{}).textContent}})()`);
v(sess.l === 6 && sess.dern === 'Topographie', 'session Apprentissage : tableau à 6 lignes, Topographie en dernier', JSON.stringify(sess));
await b.toucher(`document.querySelector('.sfc-quitter')`, 800);

// ---- import : « Voir le format attendu » puis l'exemple ----
await b.ouvrirCours('Cours 3 — Poumon', { recharger: true }); await b.ongletFlashcards();
await b.toucher(`document.querySelector('[data-act="importer-fc"]')`, 700);
await b.toucher(`document.querySelector('[data-act="format"]')`, 500);
const fmt = await b.ev(`document.querySelector('[data-exemple]').textContent`);
v(/"topographie": "Loge antérieure du bras/.test(fmt) && /6 champs du tableau Muscle, chacun facultatif/.test(fmt), '« Voir le format attendu » : champ topographie dans l’exemple Muscle');
await b.capture('topo-format', await b.ev(`(()=>{const e=document.querySelector('[data-exemple]');const i=e.textContent.indexOf('"muscle"');e.scrollTop=Math.max(0,e.scrollHeight*i/e.textContent.length-40);const p=document.querySelector('[data-import-flashcards]').getBoundingClientRect();return {x:p.x,y:Math.max(0,p.y),width:p.width,height:Math.min(innerHeight-p.y,p.height)}})()`));
await b.toucher(`[...document.querySelectorAll('[data-import-flashcards] button')].find(x=>/Essayer cet exemple/.test(x.textContent))`, 4000);
await b.toucher(`[...document.querySelectorAll('[data-import-flashcards] button')].find(x=>/^\\s*Importer/.test(x.textContent)&&!x.disabled)`, 2500);
const imp = await b.S(`const q=(await S.getAll('questions')).find(x=>x.ficheId==='f3'&&x.recto==='Biceps brachial');return q?q.muscle.lignes:null`);
v(imp && /^Loge antérieure du bras/.test(imp.topographie) && imp.innervation, 'import de l’exemple : carte Muscle avec sa topographie', imp && imp.topographie);
// JSON collé : Topographie seule, puis aucune ligne
const r = await b.S(`const I=await import('/src/medrevise/lib/importFlashcards.js');const a=await I.analyserImport({texte:JSON.stringify({items:[{type:'flashcard',recto:'Brachial (collé)',muscle:{topographie:'Loge antérieure'}},{type:'flashcard',recto:'Muscle vide (collé)',muscle:{}}]})});return {erreurs:a.erreurs.length,topo:a.cartes.map(c=>c.carte.muscle.lignes.topographie)}`);
v(r.erreurs === 0 && r.topo.join('|') === 'Loge antérieure|', 'import : Topographie seule, ou aucune ligne → acceptés', JSON.stringify(r));

// ---- export .zip du cours témoin (UI) → topographie dans flashcards.json → ré-import dans Cours 4 ----
await b.ouvrirCours('Cours témoin', { recharger: true }); await b.ongletFlashcards();
await b.ev(`(()=>{const o=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){window.__dl=this.download;return;}return o.call(this)};return 1})()`); // aucun fichier dans ~/Downloads
await b.toucher(`document.querySelector('[data-act="exporter-fc"]')`, 500);
await b.toucher(`document.querySelector('[data-act="exporter-selection"]')`, 700);
await b.ev(`window.__dernierExportFC=null;1`);
await b.toucher(`document.querySelector('[data-export-flashcards] [data-act="exporter-fc"]')`, 300);
await b.attendre(`!!document.querySelector('[data-export-flashcards] [data-fait]')`, 60000);
const z = await b.ev(`(async()=>{const e=window.__dernierExportFC;const a=new Uint8Array(await e.blob.arrayBuffer());let s='';for(let i=0;i<a.length;i+=0x8000)s+=String.fromCharCode.apply(null,a.subarray(i,i+0x8000));return {nom:e.nom,b64:btoa(s)}})()`);
const ZIP = SORTIE + '/temoin.zip'; fs.writeFileSync(ZIP, Buffer.from(z.b64, 'base64'));
const J = JSON.parse(execFileSync('unzip', ['-p', ZIP, 'flashcards.json']).toString());
const parRecto = Object.fromEntries(J.items.map((i) => [i.recto, i]));
v(parRecto['Biceps brachial'].muscle.topographie === '' && parRecto['Brachial'].muscle.topographie.startsWith('Loge') && parRecto['Brachial'].muscle.images.topographie && parRecto['Coraco-brachial'].muscle.topographie === '',
  'export .zip : champ « topographie » sur chaque carte Muscle (vide pour l’ancienne), image de la ligne exportée', JSON.stringify(Object.fromEntries(Object.entries(parRecto).filter(([, i]) => i.muscle).map(([k, i]) => [k, i.muscle.topographie]))));
await b.ev(`(()=>{const x=document.querySelector('.day-pop-head button[aria-label="Fermer"], .day-pop-head .cd-ic, .day-pop-head button');x&&x.click();return 1})()`); await b.dormir(400);
v(await b.ouvrirCours('Cours 4 — Foie', { recharger: true }), 'cours « Cours 4 — Foie » ouvert'); await b.ongletFlashcards();
await b.toucher(`document.querySelector('[data-act="importer-fc"]')`, 700);
await b.ev(`(()=>{const x=[...document.querySelectorAll('[data-import-flashcards] button')].find(e=>/Fichier/.test(e.textContent));x&&x.click();return 1})()`); await b.dormir(400);
await b.attendre(`!!document.querySelector('[data-import-flashcards] input[type=file]')`, 10000);
const o = await b.send('Runtime.evaluate', { expression: `document.querySelector('[data-import-flashcards] input[type=file]')` });
await b.send('DOM.enable'); await b.send('DOM.setFileInputFiles', { files: [ZIP], objectId: o.result.objectId });
await b.dormir(2500);
await b.toucher(`[...document.querySelectorAll('[data-import-flashcards] button')].find(x=>/^\\s*Importer/.test(x.textContent)&&!x.disabled)`, 3000);
const re = await b.S(`const q=(await S.getAll('questions')).filter(x=>x.ficheId==='f4'&&x.muscle);const o=Object.fromEntries(q.map(x=>[x.recto,x.muscle]));const b1=o['Brachial']&&o['Brachial'].images&&o['Brachial'].images.topographie;return {topo:Object.fromEntries(q.map(x=>[x.recto,x.muscle.lignes.topographie])),img:b1?(await S.getBlob(b1.imageId)).size:0}`);
v(re.topo['Brachial'] && re.topo['Brachial'].startsWith('Loge') && re.topo['Biceps brachial'] === '' && re.img > 0, 'ré-import du .zip : topographie (et son image) retrouvées', JSON.stringify(re));
v((await hTemoin()) === h0, 'ancienne carte Muscle toujours identique après export');
b.fin();
