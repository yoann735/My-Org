// Éléments à révéler (carte Texte) — ordinateur (C). Rejouer seed.mjs avant. Création (verso + 4 éléments, 3 masqués,
// 1 visible), modification (réordonnement au glisser, œil), vue agrandie (un par un, Tout révéler), mode Apprentissage
// (aperçu, session), import JSON (format attendu + import réel), export (sauvegarde JSONL), cartes témoins identiques.
import { banc, COURS } from './commun.mjs';
const b = await banc(false);
const v = b.v;
const RECTO = 'Quelles sont les 4 fonctions du rein ?';
const EL = ['Épuration des déchets azotés', 'Équilibre hydro-électrolytique', 'Équilibre acido-basique', 'Fonctions endocrines (EPO, rénine)'];
const temoins = () => b.S(`const q=(await S.getAll('questions')).filter(x=>x.id.startsWith('temoin-')).sort((a,c)=>a.id<c.id?-1:1);const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(q)));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,16)`);
const h0 = await temoins();
v(await b.ouvrirCours(COURS[0], { recharger: true }), 'cours « Cours 1 — Rein » ouvert');
await b.ongletFlashcards();
const nombreAvant = await b.ev(`document.querySelectorAll('.pis-item.fcl-carte').length`);

// ---- création ----
await b.toucher(`document.querySelector('.fcl-nouvelle')`, 700);
const formAvant = await b.ev(`(()=>{const f=document.querySelector('.fc-carte');return {recto:!!f.querySelector('[aria-label="Recto"]'),verso:!!f.querySelector('[aria-label="Verso"]'),elements:f.querySelectorAll('[data-element]').length,bouton:(f.querySelector('[data-act="ajouter-element"]')||{}).textContent}})()`);
v(formAvant.recto && formAvant.verso && formAvant.elements === 0 && /Élément/.test(formAvant.bouton), 'formulaire Texte : recto, verso comme avant ; bouton discret « + Élément » sous le verso, aucun élément au départ', JSON.stringify(formAvant));
await b.taper(`document.querySelector('.fc-carte [aria-label="Recto"]')`, RECTO);
await b.taper(`document.querySelector('.fc-carte [aria-label="Verso"]')`, 'Quatre grandes fonctions :');
await b.toucher(`document.querySelector('.fc-carte [data-act="ajouter-element"]')`, 400);
for (let i = 0; i < 4; i++) {
  await b.send('Input.insertText', { text: EL[i] }); await b.dormir(150);
  if (i < 3) { await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await b.dormir(250); }
}
const lignes = () => b.ev(`[...document.querySelectorAll('.fc-carte [data-element]')].map(l=>[l.querySelector('textarea').value,l.querySelector('[data-oeil]').dataset.oeil])`);
let L = await lignes();
v(L.length === 4 && L.every(([t, o], i) => t === EL[i] && o === 'masque'), 'Entrée enchaîne les éléments ; masqués par défaut', JSON.stringify(L));
await b.toucher(`document.querySelectorAll('.fc-carte [data-element] [data-oeil]')[2]`, 300);
L = await lignes();
v(L[2][1] === 'visible', 'œil : l’élément 3 passe « visible »');
await b.capture('el-formulaire', await b.ev(`(()=>{const r=document.querySelector('.fc-carte').getBoundingClientRect();return {x:r.x-6,y:Math.max(0,r.y-6),width:r.width+12,height:Math.min(900-r.y,r.height+12)}})()`));
await b.toucher(`[...document.querySelectorAll('.fc-carte .imp-actions button')].find(x=>/^\\s*Ajouter/.test(x.textContent))`, 1200);
let id = await b.S(`return ((await S.getAll('questions')).find(q=>q.recto===${JSON.stringify(RECTO)})||{}).id`);
let c = await b.carteBase(id);
v(c && c.verso === 'Quatre grandes fonctions :' && JSON.stringify(c.items) === JSON.stringify(EL.map((t, i) => ({ text: t, masked: i !== 2 }))), 'base : items [{ text, masked }] dans l’ordre, 3 masqués, 1 visible', JSON.stringify(c && c.items));
await b.toucher(`[...document.querySelectorAll('.fc-carte .imp-actions button')].find(x=>/Annuler/.test(x.textContent))`, 500);

// ---- modification : glisser l'élément 4 en tête, puis œil ----
const plan0 = { dueDate: c.dueDate, j0Date: c.j0Date, historique: c.historique, nouvelle: c.nouvelle };
await b.survol(b.carteListe(id));
await b.toucher(`${b.carteListe(id)}.querySelector('[data-act="modifier"]')`, 800);
await b.ev(`(()=>{document.querySelector('.fc-carte.edition [data-elements]').scrollIntoView({block:'center'});return 1})()`); await b.dormir(400);
const g = await b.rect(`document.querySelectorAll('.fc-carte.edition [data-element] .fce-poignee')[3]`);
const cible = await b.rect(`document.querySelectorAll('.fc-carte.edition [data-element]')[0]`);
await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g.cx, y: g.cy });
await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: g.cx, y: g.cy, button: 'left', clickCount: 1 });
for (let k = 1; k <= 12; k++) { await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g.cx, y: g.cy + (cible.y + 4 - g.cy) * k / 12, button: 'left', buttons: 1 }); await b.dormir(30); }
await b.capture('el-glisser', await b.ev(`(()=>{const r=document.querySelector('.fc-carte.edition').getBoundingClientRect();return {x:r.x-6,y:Math.max(0,r.y-6),width:r.width+12,height:Math.min(900-r.y,r.height+12)}})()`));
await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: g.cx, y: cible.y + 4, button: 'left', clickCount: 1 });
await b.dormir(300);
const L2 = await b.ev(`[...document.querySelectorAll('.fc-carte.edition [data-element] textarea')].map(t=>t.value)`);
v(L2.join('|') === [EL[3], EL[0], EL[1], EL[2]].join('|'), 'glisser la poignée : l’élément 4 passe en tête', L2.join(' | '));
await b.toucher(`document.querySelectorAll('.fc-carte.edition [data-element] [data-oeil]')[0]`, 300); // Endocrine → visible
await b.toucher(`document.querySelectorAll('.fc-carte.edition [data-element] [data-oeil]')[3]`, 300); // Acido → masqué
await b.toucher(`[...document.querySelectorAll('.fc-carte.edition .imp-actions button')].find(x=>/Enregistrer/.test(x.textContent))`, 1200);
c = await b.carteBase(id);
v(c.items.map((x) => x.text).join('|') === L2.join('|') && c.items.map((x) => x.masked).join() === 'false,true,true,true', 'modification enregistrée : nouvel ordre, œils', JSON.stringify(c.items));
v(JSON.stringify({ dueDate: c.dueDate, j0Date: c.j0Date, historique: c.historique, nouvelle: c.nouvelle }) === JSON.stringify(plan0), 'modification : planification de la carte inchangée');
// remettre l'ordre et les masques de l'énoncé (3 masqués, 1 visible) pour la suite
await b.S(`const q=await S.getOne('questions',${JSON.stringify(id)});await S.put('questions',{...q,items:${JSON.stringify(EL.map((t, i) => ({ text: t, masked: i !== 2 })))}});return 1`);
await b.ouvrirCours(COURS[0], { recharger: true }); await b.ongletFlashcards();
v(await b.ev(`${b.carteListe(id)}.querySelectorAll('.mu-elements .mu-ligne').length`) === 4 && !(await b.ev(`!!${b.carteListe(id)}.querySelector('.mu-masque')`)), 'liste du panneau : les 4 éléments, tous lisibles (pas de masque hors révision)');
await b.capture('el-liste', await b.ev(`(()=>{${b.carteListe(id)}.scrollIntoView({block:'center'});const r=${b.carteListe(id)}.getBoundingClientRect();return {x:r.x-4,y:Math.max(0,r.y-4),width:r.width+8,height:r.height+8}})()`));

// ---- vue agrandie : révision un par un, Tout révéler ----
await b.survol(b.carteListe(id));
await b.toucher(`${b.carteListe(id)}.querySelector('[data-act="agrandir"]')`, 800);
await b.toucher(`document.querySelector('.va .sfc-carte')`, 700);
const va = () => b.ev(`(()=>{const d=document.querySelector('.va');return {intro:(d.querySelector('.sfc-verso')||{}).textContent,lignes:d.querySelectorAll('.mu-elements .mu-ligne').length,masques:d.querySelectorAll('.mu-elements .mu-masque').length,visible:[...d.querySelectorAll('.mu-elements .mu-ligne:not(.cachee)')].map(x=>x.textContent).join('|'),tout:(d.querySelector('.mu-elements .mu-tout-btn')||{}).textContent,cote:d.querySelector('.sfc-carte').dataset.cote}})()`);
let s = await va();
v(s.intro === 'Quatre grandes fonctions :' && s.lignes === 4 && s.masques === 3 && s.visible.includes(EL[2]) && /Tout révéler\s*\(3\)/.test(s.tout), 'vue agrandie, verso : introduction puis les éléments — 3 masqués, le visible lisible, « Tout révéler (3) »', JSON.stringify(s));
await b.capture('el-agrandie-masques');
await b.toucher(`document.querySelector('.va .mu-elements .mu-ligne.cachee')`, 400);
s = await va();
v(s.masques === 2 && s.visible.includes(EL[0]) && s.cote === 'verso', 'un tap révèle UN élément (la carte reste au verso)', JSON.stringify(s));
await b.toucher(`document.querySelector('.va .mu-elements .mu-tout-btn')`, 400);
s = await va();
v(s.masques === 0 && !s.tout, '« Tout révéler » : tous visibles', JSON.stringify(s));
await b.capture('el-agrandie-revele');
await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await b.dormir(300);

// ---- mode Apprentissage : vignette, aperçu, session ----
await b.ev(`localStorage.removeItem('medrevise.apprentissage.filtres');1`);
await b.apprentissage();
await b.taper(`document.querySelector('.alib2-recherche input')`, '4 fonctions du rein');
const vig = await b.ev(`(document.querySelector('.alib2-carte .alib2-verso')||{}).textContent`);
v(/• Épuration/.test(vig || ''), 'vignette : les éléments listés sous le verso', vig);
await b.toucher(`document.querySelector('.alib-lancer')`, 900);
await b.toucher(`document.querySelector('.alib-session .sfc-carte')`, 700);
const sess = await b.ev(`(()=>{const d=document.querySelector('.alib-session');return {m:d.querySelectorAll('.mu-elements .mu-masque').length,l:d.querySelectorAll('.mu-elements .mu-ligne').length}})()`);
await b.toucher(`document.querySelector('.alib-session .mu-elements .mu-ligne.cachee')`, 400);
const sess2 = await b.ev(`document.querySelectorAll('.alib-session .mu-elements .mu-masque').length`);
v(sess.l === 4 && sess.m === 3 && sess2 === 2, `session Apprentissage : 3 masqués, révélés un par un (${sess.m} → ${sess2})`);
await b.capture('el-apprentissage-session');
await b.toucher(`document.querySelector('.alib-session .mu-elements .mu-tout-btn')`, 400);
v((await b.ev(`document.querySelectorAll('.alib-session .mu-elements .mu-masque').length`)) === 0, 'session : Tout révéler');
await b.toucher(`document.querySelector('.sfc-quitter')`, 800);
await b.taper(`document.querySelector('.alib2-recherche input')`, '');

// ---- import JSON : « Voir le format attendu », puis import réel de l'exemple ----
await b.ouvrirCours(COURS[2], { recharger: true }); await b.ongletFlashcards();
await b.toucher(`document.querySelector('[data-act="importer-fc"]')`, 700);
await b.toucher(`document.querySelector('[data-act="format"]')`, 500);
const fmt = await b.ev(`document.querySelector('[data-exemple]').textContent`);
v(/"items": \[/.test(fmt) && /"masked": false/.test(fmt) && /4 fonctions du rein/.test(fmt), '« Voir le format attendu » : exemple d’une carte à éléments (items, masked)');
await b.capture('el-format', await b.ev(`(()=>{const e=[...document.querySelectorAll('[data-exemple]')][0];const i=e.textContent.indexOf('texte à éléments');const r=e.getBoundingClientRect();e.scrollTop=Math.max(0,e.scrollHeight*i/e.textContent.length-20);const p=document.querySelector('[data-import-flashcards]').getBoundingClientRect();return {x:p.x,y:Math.max(0,p.y),width:p.width,height:Math.min(900-p.y,p.height)}})()`));
await b.toucher(`[...document.querySelectorAll('[data-import-flashcards] button')].find(x=>/Essayer cet exemple/.test(x.textContent))`, 4000);
const compte = await b.ev(`(document.querySelector('[data-compte]')||{}).textContent`);
const btImp = await b.ev(`(()=>{const x=[...document.querySelectorAll('[data-import-flashcards] button')].find(x=>/^\\s*Importer/.test(x.textContent)&&!x.disabled);return x?x.textContent:null})()`);
v(!!btImp && /Texte\s*2/.test(compte || ''), `analyse de l’exemple sans erreur (${compte})`);
await b.toucher(`[...document.querySelectorAll('[data-import-flashcards] button')].find(x=>/^\\s*Importer/.test(x.textContent)&&!x.disabled)`, 2500);
const imp = await b.S(`const q=(await S.getAll('questions')).find(x=>x.ficheId==='f3'&&x.recto==='Quelles sont les 4 fonctions du rein ?');return q?{items:q.items,verso:q.verso,dueDate:q.dueDate}:null`);
v(imp && imp.items.length === 4 && imp.items.map((x) => x.masked).join() === 'true,true,false,true', 'import réel : carte à éléments créée dans le cours, masques respectés', JSON.stringify(imp));
// ---- export : sauvegarde (records JSONL, clés triées) → relue → éléments intacts ----
const exp = await b.S(`const E = await import('/src/medrevise/sauvegarde/export.js');
  const q = await S.getOne('questions', ${JSON.stringify(id)});
  const r = E.construireExport({ records: [{ store: 'questions', record_id: q.id, updated_at: q.updatedAt, deleted: false, data: q }], jour: '2026-10-26' });
  const lu = E.lireJsonl(r.fichiers.find((f) => f.chemin === 'data/records.jsonl').contenu)[0].data;
  return { egal: E.jsonCanonique(lu.items) === E.jsonCanonique(q.items), items: lu.items.length };`);
v(exp.egal && exp.items === 4, 'export (sauvegarde JSONL) puis relecture : éléments identiques');

// ---- anciennes cartes intactes ----
v((await temoins()) === h0, `cartes témoins (Texte ancienne, Muscle) identiques octet pour octet (${h0})`);
b.fin();
