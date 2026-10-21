// ONGLET FLASHCARDS REFAIT (22/10) : chaque fonction de l'audit retrouvée. Création des 5 sortes (texte, carte à trou,
// Muscle, Tableau, Molécule) + une image, sélecteur de sorte unique, amorces dans un menu (recherche, favori,
// « + Mon amorce »), « Plus d'options » replié, un seul « Ajouter » (⌘↵) et « Annuler », pas de « Terminer » ; même
// formulaire en modification ; recherche, filtres par sorte, actions au survol (modifier, apprentissage, carnet,
// supprimer) ; thème discret ; mobile sans débordement.   Usage : node t-flashcards.mjs [ipad|mobile]
import { banc, semer, ouvrirFlashcards, COURS } from './commun.mjs';
const app = process.argv[2] || 'ordinateur';
const b = await banc(1440, 900, { tactile: app !== 'ordinateur' });
await b.ev(`localStorage.removeItem('medrevise.amorcesFavoris');localStorage.removeItem('medrevise.amorcesRecto');1`);
await semer(b);
await b.S(`const r=await S.getOne('learning_set','learning_set');if(r)await S.put('learning_set',{...r,cardIds:(r.cardIds||[]).filter(x=>!String(x).startsWith('fa-'))});return 1`);
const tape = await ouvrirFlashcards(b, { appareil: app });
const cartes = () => b.S(`return (await S.getAll('questions')).filter(q=>q.ficheId===${JSON.stringify(COURS)}).map(q=>({id:q.id,recto:q.recto,verso:q.verso,cloze:q.cloze,indice:q.indice,imageId:q.imageId,muscle:!!q.muscle,tableau:!!q.tableau,molecule:!!q.molecule,theme:q.theme,carnet:!!q.carnetAt}))`);
const F = `document.querySelector('.pis-add.fc-carte')`;
// la cible au centre de la zone visible (le pied d'actions est collé en bas et recouvre ce qui y arrive)
// (défilement VERTICAL de la zone du panneau seulement : scrollIntoView décalerait aussi la piste des volets)
const centrer = (js) => b.ev(`(()=>{const e=${js};if(!e)return 0;const z=e.closest('.pis-scroll')||e.closest('.pm-vue');if(!z)return 0;const r=e.getBoundingClientRect(),q=z.getBoundingClientRect();const h=Math.max(q.top,0),bas=Math.min(q.bottom,innerHeight);z.scrollTop+=r.top+r.height/2-(h+bas)/2;return 1})()`); // le centre de la partie VISIBLE de la zone
// recentre tant que l'élément sous le doigt n'est pas la cible (le volet bas de la tablette se redimensionne)
const touche = (js, p) => b.ev(`(()=>{const e=document.elementFromPoint(${p[0]},${p[1]});const t=${js};return !!(t&&e&&(t===e||t.contains(e)))})()`);
const clic = async (js) => {
  let p = null;
  for (let k = 0; k < 4; k++) { await centrer(js); await b.dormir(300); p = await b.pos(js, false); if (!p) throw new Error('introuvable : ' + js); if (await touche(js, p)) break; }
  await tape(p); await b.dormir(350);
};
const cmdEntree = async () => { await b.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 4 }); await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 4 }); await b.dormir(900); };
const taper = async (sel, texte) => { await b.ev(`(()=>{const t=${sel};t.focus();t.select&&t.select();return 1})()`); await b.ev(`document.execCommand('insertText',false,${JSON.stringify(texte)})`); await b.dormir(150); };
const n0 = (await cartes()).length;
// 1) le formulaire : sélecteur de sorte, Recto / Verso, options repliées, pas de « Terminer »
await clic(`document.querySelector('[data-act="nouvelle"]')`);
let f = await b.ev(`(()=>{const f=${F};return {sortes:[...f.querySelectorAll('.fc-type')].map(x=>x.textContent),actif:(f.querySelector('.fc-type.actif')||{}).textContent,
  champs:[...f.querySelectorAll('.fcf > .imp-field .fcf-etiquette label')].map(x=>x.textContent),options:!!f.querySelector('.fcf-options'),plus:!!f.querySelector('.fcf-plus'),
  terminer:[...document.querySelectorAll('.pis-body button')].some(x=>/Terminer/.test(x.textContent)),boutons:[...f.querySelectorAll('.fcf-pied .btn')].map(x=>x.textContent.trim()),puces:f.querySelectorAll('.amr-puce').length}})()`);
b.ok(f.sortes.join('·') === 'Texte·Muscle·Tableau·Molécule' && f.actif === 'Texte' && f.champs.join('·') === 'Recto·Verso' && !f.options && f.plus && !f.terminer && f.boutons.join('·') === 'Annuler·Ajouter' && !f.puces,
  'formulaire : une sorte en tête (Texte · Muscle · Tableau · Molécule), Recto / Verso d’abord, « Plus d’options » replié, « Annuler » / « Ajouter », pas de « Terminer » ni de pile d’amorces', JSON.stringify(f));
// 2) amorces : menu, recherche, favori, « + Mon amorce », insertion au recto
await clic(`(${F}).querySelector('.mam-bouton')`);
await taper(`document.querySelector('.mam-recherche')`, 'role');
const trouve = await b.ev(`[...document.querySelectorAll('.mam-txt')].map(x=>x.textContent)`);
await clic(`[...document.querySelectorAll('.mam-ligne')].find(x=>/rôle de/.test(x.textContent)).querySelector('.mam-fav')`);
await clic(`[...document.querySelectorAll('.mam-txt')].find(x=>/rôle de/.test(x.textContent))`);
const recto1 = await b.ev(`(${F}).querySelector('textarea[aria-label="Recto"]').value`);
await clic(`(${F}).querySelector('.mam-bouton')`);
const enTete = await b.ev(`(()=>{const g=document.querySelector('.mam-groupe');return g?g.querySelector('.mam-titre').textContent+' : '+[...g.querySelectorAll('.mam-txt')].map(x=>x.textContent).join(' | '):null})()`);
await clic(`document.querySelector('.mam-ajout-btn')`);
await taper(`document.querySelector('.mam-ajout input')`, 'Quel muscle');
await b.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await b.dormir(300);
const perso = await b.ev(`[...document.querySelectorAll('.mam-groupe')].map(g=>g.querySelector('.mam-titre').textContent+':'+g.querySelectorAll('.mam-ligne').length).join(' ')`);
await b.T.Escape(); await b.dormir(200);
b.ok(trouve.length >= 1 && trouve.every((t) => /rôle/i.test(t)) && recto1 === 'Quel est le rôle de : ' && /^Favoris : Quel est le rôle de :/.test(enTete || '') && /Mes amorces:1/.test(perso),
  'menu « Amorce » : recherche (« role » → « rôle »), favori en tête, « + Mon amorce », insertion au recto', JSON.stringify({ trouve, recto1, enTete, perso }));
await b.capture('fc-apres-amorces-' + app, await b.ev(`(()=>{const r=(${F}).getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(Math.min(r.height,420))}})()`));
// 3) carte texte au clavier : ⌘↵ ajoute et laisse le formulaire vide, ouvert
await taper(`(${F}).querySelector('textarea[aria-label="Recto"]')`, 'Quel est le rôle de : l’anse de Henle');
await taper(`(${F}).querySelector('textarea[aria-label="Verso"]')`, 'Concentrer l’urine');
await b.ev(`(${F}).querySelector('textarea[aria-label="Verso"]').focus(),1`);
await cmdEntree();
let l = await cartes();
const c1 = l.find((q) => /anse de Henle/.test(q.recto || ''));
const vide = await b.ev(`(()=>{const f=${F};return f?{recto:f.querySelector('textarea[aria-label="Recto"]').value,nb:(f.querySelector('.fc-carte-nb')||{}).textContent||''}:null})()`);
b.ok(c1 && c1.verso === 'Concentrer l’urine' && vide && vide.recto === '' && /1 ajoutée/.test(vide.nb), 'texte : ⌘↵ ajoute la carte, le formulaire reste ouvert et vide (« 1 ajoutée ✓ »)', JSON.stringify({ c1, vide }));
// 4) carte à trou : un mot sélectionné, « Trou »
await taper(`(${F}).querySelector('textarea[aria-label="Recto"]')`, 'Le glomérule filtre le plasma');
await b.ev(`(()=>{const t=(${F}).querySelector('textarea[aria-label="Recto"]');t.focus();t.setSelectionRange(3,12);return 1})()`);
await clic(`[...(${F}).querySelectorAll('.fcf-etiquette .btn')].find(x=>/Trou/.test(x.textContent))`);
const avecTrou = await b.ev(`(${F}).querySelector('textarea[aria-label="Recto"]').value`);
await taper(`(${F}).querySelector('textarea[aria-label="Verso"]')`, 'glomérule');
await clic(`[...(${F}).querySelectorAll('.fcf-pied .btn.primary')][0]`); await b.dormir(600);
l = await cartes();
const c2 = l.find((q) => /\{\{glomérule\}\}/.test(q.recto || '') && q.id !== 'fa-trou');
b.ok(avecTrou === 'Le {{glomérule}} filtre le plasma' && c2 && JSON.stringify(c2.cloze) === '["glomérule"]', 'carte à trou : « Trou » sur le mot sélectionné, réponse enregistrée', JSON.stringify({ avecTrou, cloze: c2 && c2.cloze }));
// 5) « Plus d'options » : indice, thème, image (fichier), masques proposés
await taper(`(${F}).querySelector('textarea[aria-label="Recto"]')`, 'Que montre cette coupe ?');
await taper(`(${F}).querySelector('textarea[aria-label="Verso"]')`, 'Le cortex');
await clic(`(${F}).querySelector('.fcf-plus')`);
const opts = await b.ev(`[...(${F}).querySelectorAll('.fcf-options label')].map(x=>x.textContent.trim())`);
await taper(`[...(${F}).querySelectorAll('.fcf-options textarea')][0]`, 'Couche externe');
const png = '/private/tmp/claude-501/-Users-yoannlmr/001c2781-18de-49ca-9554-dc815a48abe9/scratchpad/coupe.png';
await b.ev(`(async()=>{const c=document.createElement('canvas');c.width=200;c.height=120;const x=c.getContext('2d');x.fillStyle='#e5383b';x.fillRect(0,0,200,120);return 1})()`);
const { root } = await b.c.send('DOM.getDocument', { depth: -1, pierce: true });
const { nodeId } = await b.c.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.pis-add.fc-carte .fcf-options input[type=file]' });
let image = false;
if (nodeId) {
  const fs = await import('node:fs');
  if (!fs.existsSync(png)) fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  await b.c.send('DOM.setFileInputFiles', { nodeId, files: [png] }); await b.dormir(800);
  image = await b.ev(`!!(${F}).querySelector('.fc-occ-option')`);
}
await clic(`[...(${F}).querySelectorAll('.fcf-pied .btn.primary')][0]`); await b.dormir(800);
l = await cartes();
const c3 = l.find((q) => q.recto === 'Que montre cette coupe ?');
b.ok(opts.slice(0, 3).join('·') === 'Thème·Indice·À retenir' && c3 && c3.indice === 'Couche externe' && (!nodeId || (image && c3.imageId)), '« Plus d’options » : thème, indice, à retenir, image (+ « Masques à deviner »), enregistrés', JSON.stringify({ opts, image, c3 }));
await b.capture('fc-apres-plus-options-' + app, await b.ev(`(()=>{const r=(${F}).getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(Math.min(r.height,640))}})()`));
// 6) Muscle, Tableau, Molécule : le sélecteur transforme le formulaire
await clic(`(${F}).querySelector('.fc-type[data-sorte="muscle"]')`);
await taper(`[...(${F}).querySelectorAll('.mu-nom-champ')].find(x=>x.offsetParent)`, 'm. Test refonte');
await b.ev(`(()=>{const z=[...(${F}).querySelectorAll('.mu-form textarea, .mu-form input')].filter(x=>x.offsetParent&&x.placeholder==='—');z.slice(0,5).forEach((t,i)=>{t.focus();document.execCommand('insertText',false,'champ '+(i+1))});return z.length})()`);
await clic(`[...(${F}).querySelectorAll('.mu-form .btn.primary')].find(x=>x.offsetParent)`); await b.dormir(1500);
await clic(`(${F}).querySelector('.fc-type[data-sorte="tableau"]')`);
await taper(`[...(${F}).querySelectorAll('[data-champ="titre"]')].find(x=>x.offsetParent)`, 'Tableau refonte');
await b.ev(`(()=>{const f=${F};[...f.querySelectorAll('.tb-nom-col')].filter(x=>x.offsetParent).forEach((t,i)=>{t.focus();document.execCommand('insertText',false,'Col '+(i+1))});[...f.querySelectorAll('.tb-cellule')].filter(x=>x.offsetParent).slice(0,2).forEach((t,i)=>{t.focus();document.execCommand('insertText',false,'v'+(i+1))});return 1})()`);
await clic(`[...(${F}).querySelectorAll('.btn.primary')].find(x=>x.offsetParent&&/Ajouter/.test(x.textContent))`); await b.dormir(800);
await clic(`(${F}).querySelector('.fc-type[data-sorte="molecule"]')`);
for (let i = 0; i < 60 && !(await b.ev(`!!document.querySelector('.mol-form #mol-nom') && !!document.querySelector('.mol-form .fci-champ')`)); i++) await b.dormir(500);
await b.dormir(1200);
await clic(`document.querySelector('.mol-form #mol-nom')`);
await b.ecrire('Alanine'); await b.dormir(700);
await clic(`document.querySelector('.mol-sugg')`); await b.dormir(2500);
await clic(`[...document.querySelectorAll('.mol-form .btn.primary')].find(x=>x.offsetParent)`); await b.dormir(1200);
l = await cartes();
b.ok(l.some((q) => q.muscle && q.recto === 'm. Test refonte') && l.some((q) => q.tableau && /Tableau refonte/.test(q.recto || '')) && l.some((q) => q.molecule && /Alanine/i.test(q.recto || '')),
  'Muscle, Tableau et Molécule créés depuis le même sélecteur de sorte', JSON.stringify(l.filter((q) => q.muscle || q.tableau || q.molecule).map((q) => q.recto)));
b.ok(l.length === n0 + 6, `les 5 sortes créées (texte, trou, image, muscle, tableau, molécule : ${l.length - n0} cartes)`, String(l.length - n0));
// 7) « Annuler » ferme le formulaire
await clic(`(${F}).querySelector('.fc-type[data-sorte="standard"]')`);
await clic(`[...(${F}).querySelectorAll('.fcf-pied .btn')].find(x=>/Annuler/.test(x.textContent))`);
b.ok(!(await b.ev(`!!document.querySelector('.pis-add.fc-carte')`)), '« Annuler » ferme le formulaire');
// 8) recherche et filtres
await taper(`document.querySelector('.fcl-recherche input')`, 'henle');
let vus = await b.ev(`[...document.querySelectorAll('.pis-list .pis-item')].map(x=>x.dataset.item)`);
b.ok(vus.length === 1 && vus[0] === c1.id, 'recherche « henle » (sans accent, sans majuscule) : la seule carte qui en parle', JSON.stringify(vus));
await taper(`document.querySelector('.fcl-recherche input')`, '');
await b.ev(`(()=>{const i=document.querySelector('.fcl-recherche input');i.value='';i.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
await clic(`document.querySelector('.fcl-filtre[data-filtre="trou"]')`);
vus = await b.ev(`[...document.querySelectorAll('.pis-list .pis-item')].map(x=>x.dataset.item)`);
const filtres = await b.ev(`[...document.querySelectorAll('.fcl-filtre')].map(x=>x.dataset.filtre+':'+x.querySelector('span').textContent).join(' ')`);
b.ok(vus.length === 2 && vus.includes('fa-trou'), 'filtre « Trou » : les 2 cartes à trou', JSON.stringify({ vus, filtres }));
await clic(`document.querySelector('.fcl-filtre[data-filtre="toutes"]')`);
// 9) actions au survol : modifier (même formulaire), apprentissage, carnet, supprimer
await centrer(`document.querySelector('[data-item="fa-texte"]')`); await b.dormir(300);
const r = await b.rect(`document.querySelector('[data-item="fa-texte"]')`);
if (app === 'ordinateur') { await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 }); await b.dormir(200); }
const avantSurvol = await b.ev(`+getComputedStyle(document.querySelector('[data-item="fa-texte"] .fcl-actions')).opacity`);
if (app === 'ordinateur') { await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.cx, y: r.cy }); await b.dormir(300); }
const survol = await b.ev(`(()=>{const a=document.querySelector('[data-item="fa-texte"] .fcl-actions');return {o:+getComputedStyle(a).opacity,acts:[...a.querySelectorAll('[data-act],[data-sn]')].map(x=>x.dataset.act||x.dataset.sn)}})()`);
b.ok((app === 'ordinateur' ? avantSurvol === 0 : true) && survol.o === 1 && ['modifier', 'apprentissage', 'carnet', 'supprimer'].every((x) => survol.acts.includes(x)), `actions ${app === 'ordinateur' ? 'au survol' : 'toujours visibles au doigt'} : modifier, apprentissage, carnet, supprimer`, JSON.stringify({ avantSurvol, ...survol }));
await clic(`document.querySelector('[data-item="fa-texte"] [data-act="apprentissage"]')`);
const appr = await b.S(`return ((await S.getOne('learning_set','learning_set'))||{cardIds:[]}).cardIds.includes('fa-texte')`);
await clic(`document.querySelector('[data-item="fa-texte"] [data-sn="carnet"]')`);
await clic(`document.querySelector('.sn-menu [data-pre]:not([data-pre="autre"]), .sn-feuille-item[data-pre]:not([data-pre="autre"])')`); await b.dormir(600);
const carnet = (await cartes()).find((q) => q.id === 'fa-texte').carnet;
await b.dormir(4800); // le toast « Ajouté au carnet » (4,5 s) se retire
b.ok(appr && carnet, 'apprentissage et carnet d’erreurs depuis la ligne de la carte', JSON.stringify({ appr, carnet }));
await clic(`document.querySelector('[data-item="fa-texte"] [data-act="modifier"]')`);
const mod = await b.ev(`(()=>{const f=document.querySelector('.fc-carte.edition');return f?{mode:(f.querySelector('.fc-carte-mode')||{}).textContent,sorte:(f.querySelector('.fc-type.actif')||{}).textContent,bloquees:[...f.querySelectorAll('.fc-type:disabled')].length,recto:f.querySelector('textarea[aria-label="Recto"]').value,options:!!f.querySelector('.fcf-options'),bouton:(f.querySelector('.fcf-pied .btn.primary')||{}).textContent}:null})()`);
await b.capture('fc-apres-modification-' + app, await b.ev(`(()=>{const r=document.querySelector('.fc-carte.edition').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(Math.max(0,r.y)),width:Math.round(r.width),height:Math.round(Math.min(r.height,620))}})()`));
await taper(`document.querySelector('.fc-carte.edition textarea[aria-label="Verso"]')`, 'Unité fonctionnelle du rein (modifiée)');
await clic(`document.querySelector('.fc-carte.edition .fcf-pied .btn.primary')`); await b.dormir(700);
const modifiee = (await cartes()).find((q) => q.id === 'fa-texte');
b.ok(mod && mod.mode === 'Modification' && mod.sorte === 'Texte' && mod.bloquees === 3 && /néphron/.test(mod.recto) && mod.options && /Enregistrer/.test(mod.bouton) && /modifiée/.test(modifiee.verso),
  'modifier : le même formulaire (sorte affichée et verrouillée, options ouvertes car remplies), « Enregistrer »', JSON.stringify({ mod, verso: modifiee.verso }));
await centrer(`document.querySelector('[data-item="fa-tableau"]')`); await b.dormir(300);
await clic(`document.querySelector('[data-item="fa-tableau"] [data-act="supprimer"]')`);
await clic(`[...document.querySelectorAll('.modal button, .day-pop button, [role="dialog"] button')].find(x=>/^\\s*Supprimer\\s*$/.test(x.textContent))`); await b.dormir(700);
b.ok(!(await cartes()).some((q) => q.id === 'fa-tableau'), 'supprimer (avec confirmation)');
// 10) thème discret, import, sélection, résumé
const theme = await b.ev(`(document.querySelector('.tf-discret')||{}).innerText||''`);
b.ok(/^Thème : —\s*Définir$/.test(theme.replace(/\s+/g, ' ').trim()), 'thème auto : un petit en-tête « Thème : — · Définir »', theme);
const actions = await b.ev(`[...document.querySelectorAll('.pm-actions button')].map(x=>(x.getAttribute('aria-label')||x.textContent).trim())`);
b.ok(actions.includes('Nouvelle carte') && actions.some((x) => /Importer/.test(x)) && actions.includes('Sélectionner'), 'barre : « Nouvelle carte », « Importer », « Sélectionner », « ⋯ »', JSON.stringify(actions));
// 11) mobile / tablette : rien ne déborde
const dep = await b.ev(`(()=>{const p=document.querySelector('.pis-body'),v=[...document.querySelectorAll('.pm-vue')].find(x=>!x.hasAttribute('inert'));let max=0;for(const e of v.querySelectorAll('*')){const r=e.getBoundingClientRect();if(r.width&&e.offsetParent)max=Math.max(max,r.right)}return {panneau:Math.round(p.getBoundingClientRect().right),max:Math.round(max)}})()`);
b.ok(dep.max <= dep.panneau + 1, 'aucun débordement horizontal dans le panneau', JSON.stringify(dep));
await b.capture('fc-apres-liste-' + app, await b.ev(`(()=>{const r=document.querySelector('.pis-body').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}})()`));
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
