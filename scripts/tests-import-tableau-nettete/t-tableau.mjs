// (17/10 soir) Flashcard « Tableau » : création 3 colonnes × 4 lignes depuis le formulaire unifié, collage TSV,
// carte dans les J comme une carte faite à la main ; révision : noms de colonnes visibles, cellule / ligne / tout ;
// téléphone : défilement horizontal interne. Base LOCALE du banc.
import { banc } from './commun.mjs';
const b = await banc(1440, 900);
await b.S(`for(const q of await S.getAll('questions'))if(q.ficheId==='f-001-tb'||(q.tableau&&q.ficheId==='f-fj'))await S.remove('questions',q.id);
  await S.put('sources',{id:'src-rv',nom:'HELHa (test 17/10)',rappelsJ:true});
  await S.put('matieres',{id:'mat-tb',sourceId:'src-rv',nom:'Myologie (test 17/10)',couleur:'teal'});
  const fj=await S.getOne('fiches','f-fj');
  await S.put('fiches',{id:'f-001-tb',matiereId:'mat-tb',dossierId:null,ordre:1,titre:'Fesse — tableaux (test)',type:'standard',pdfId:fj.pdfId,pdfName:'cours.pdf',dateImport:'2026-10-10'});return 1`);
await b.biblio({ recharger: true });
await b.ouvrir('Fesse — tableaux (test)');
await b.panneauFlashcards();
await b.clic(await b.pos(`document.querySelector('.pm-actions [data-act="nouvelle"]')`, false), { att: 500 });
const sortes = await b.ev(`[...document.querySelectorAll('.fc-types .fc-type')].map(x=>x.innerText.trim())`);
b.ok(sortes.join(' · ') === 'Texte · Muscle · Tableau · Molécule', '(22/10) sélecteur de sorte unique : Texte · Muscle · Tableau · Molécule', sortes.join(' · '));
await b.clic(await b.pos(`document.querySelector('.fc-type[data-sorte="tableau"]')`, false), { att: 400 });
const F = `document.querySelector('[data-formulaire-tableau]')`;
b.ok(await b.ev(`!!${F} && ${F}.offsetParent!==null`), 'le formulaire Tableau s’ouvre');
// 3 colonnes × 4 lignes, saisies
await b.remplir(`${F}.querySelector('[data-champ=titre]')`, 'Muscles de la fesse — insertions');
const COLS = ['Muscle', 'Origine', 'Insertion'];
for (let k = 0; k < 3; k++) await b.remplir(`${F}.querySelector('[data-col="${k}"]')`, COLS[k]);
await b.clic(await b.pos(`${F}.querySelector('[data-act=ligne]')`), { att: 200 });
const L = [['Grand glutéal', 'Ilium, sacrum, coccyx', 'Tubérosité glutéale, tractus ilio-tibial'], ['Moyen glutéal', 'Face glutéale de l’ilium', 'Grand trochanter (face latérale)'], ['Petit glutéal', 'Face glutéale de l’ilium (bas)', 'Grand trochanter (face antérieure)'], ['Piriforme', 'Face pelvienne du sacrum', 'Bord supérieur du grand trochanter']];
for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) await b.remplir(`${F}.querySelector('[data-cellule="${r}:${c}"]')`, L[r][c]);
const dims = await b.ev(`({c:${F}.querySelectorAll('.tb-nom-col').length,l:${F}.querySelectorAll('tbody tr').length})`);
b.ok(dims.c === 3 && dims.l === 4, 'tableau 3 colonnes × 4 lignes', JSON.stringify(dims));
await b.capture('tb-formulaire', await b.ev(`(()=>{const r=${F}.getBoundingClientRect();return {x:r.x-8,y:Math.max(0,r.y-8),width:r.width+16,height:Math.min(880,r.height+16)}})()`));
const nAvant = await b.S(`return (await S.getAll('questions')).filter(q=>q.ficheId==='f-001-tb').length`);
await b.clic(await b.pos(`${F}.querySelector('[data-act=ajouter]')`), { att: 1200 });
let q = await b.S(`return (await S.getAll('questions')).filter(q=>q.ficheId==='f-001-tb'&&q.tableau)`);
const sm = await b.S(`const sm2=await import(performance.getEntriesByType('resource').map(e=>e.name).find(n=>n.includes('/medrevise/lib/sm2.js'))||'/src/medrevise/lib/sm2.js');return sm2.todayISO()`);
b.ok(q.length === 1 && q[0].recto === 'Muscles de la fesse — insertions' && q[0].tableau.colonnes.join('|') === 'Muscle|Origine|Insertion' && q[0].tableau.lignes.length === 4, 'enregistrée : type flashcard + tableau { colonnes, lignes }', JSON.stringify(q[0] && q[0].tableau).slice(0, 160));
b.ok(q[0] && /^Muscle : Grand glutéal · Origine : Ilium/.test(q[0].verso), 'verso texte = tableau mis à plat (lisible partout)', q[0] && q[0].verso.split('\n')[0]);
b.ok(q[0] && q[0].dueDate === sm && q[0].type === 'flashcard', 'dans les J comme une carte créée à la main (due aujourd’hui)', q[0] && `${q[0].dueDate} · ${q[0].learnState || ''}`);
// collage TSV (tableur) : 1re ligne = noms des colonnes
const TSV = 'Muscle\tInnervation\tAction\tFonction\nTenseur du fascia lata\tNerf glutéal supérieur\tFlexion, abduction\tStabilise le genou\nObturateur interne\tNerf de l’obturateur interne\tRotation latérale\tStabilise la hanche';
await b.remplir(`${F}.querySelector('[data-champ=titre]')`, 'Muscles de la fesse — innervation');
await b.coller(`${F}.querySelector('[data-champ=tsv]')`, TSV); await b.dormir(300);
const apresTSV = await b.ev(`({cols:[...${F}.querySelectorAll('.tb-nom-col')].map(i=>i.value),l:${F}.querySelectorAll('tbody tr').length,c00:${F}.querySelector('[data-cellule="0:0"]').value,msg:(${F}.querySelector('.tb-message')||{}).innerText||''})`);
b.ok(apresTSV.cols.join('|') === 'Muscle|Innervation|Action|Fonction' && apresTSV.l === 2 && apresTSV.c00 === 'Tenseur du fascia lata', 'collage TSV : colonnes et lignes pré-remplies (1re ligne = noms)', JSON.stringify(apresTSV));
// collage TSV directement dans la grille (sans en-têtes cochés → décoché)
await b.clic(await b.pos(`${F}.querySelector('.tb-opt input')`), { att: 150 });
await b.coller(`${F}.querySelector('[data-cellule="0:1"]')`, 'A\tB\nC\tD\nE\tF'); await b.dormir(300);
const grille = await b.ev(`({cols:[...${F}.querySelectorAll('.tb-nom-col')].map(i=>i.value),l:${F}.querySelectorAll('tbody tr').length,c20:${F}.querySelector('[data-cellule="2:1"]').value})`);
b.ok(grille.l === 3 && grille.c20 === 'F', 'collage TSV dans la grille : 3 lignes remplies, noms de colonnes gardés', JSON.stringify(grille));
await b.clic(await b.pos(`${F}.querySelector('.tb-opt input')`), { att: 150 });
await b.coller(`${F}.querySelector('[data-champ=tsv]')`, TSV); await b.dormir(300);
await b.clic(await b.pos(`${F}.querySelector('[data-act=ajouter]')`), { att: 1200 });
q = await b.S(`return (await S.getAll('questions')).filter(q=>q.ficheId==='f-001-tb'&&q.tableau).map(q=>q.recto+' : '+q.tableau.colonnes.length+'×'+q.tableau.lignes.length)`);
b.ok(q.length === 2 && q.includes('Muscles de la fesse — innervation : 4×2'), 'deuxième carte (TSV) enregistrée : 4 colonnes × 2 lignes', q.join(' / '));
// panneau : la carte s'affiche avec son tableau
await b.clic(await b.pos(`[...document.querySelectorAll('.fc-carte .imp-actions button')].find(x=>x.offsetParent&&x.innerText.trim()==='Annuler')`, false), { att: 600 });
b.ok(await b.ev(`[...document.querySelectorAll('.pis-face-tag')].some(x=>x.textContent.trim()==='Tableau') && !!document.querySelector('.pis [data-tableau] table')`), 'panneau : la carte s’affiche « Tableau » avec son tableau (non masqué)');
await b.capture('tb-panneau', await b.ev(`(()=>{const e=[...document.querySelectorAll('.pis [data-tableau]')][0].closest('.pis-item')||document.querySelector('.pis [data-tableau]');const r=e.getBoundingClientRect();return {x:r.x-8,y:r.y-8,width:r.width+16,height:Math.min(500,r.height+16)}})()`));
await b.fermerLecteur();
// révision : la fiche « Fesse — tableaux (test) » → « Réviser cette fiche »
await b.biblio({ recharger: true });
const sel = `[...document.querySelectorAll('.lt-fiche .lt-rangee')].find(e=>e.innerText.startsWith('Fesse — tableaux'))`;
await b.ev(`${sel}.scrollIntoView({block:'center'});1`); await b.dormir(200);
const row = await b.pos(sel, false);
await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: row[0], y: row[1] }); await b.dormir(300);
await b.clic(await b.pos(`${sel}.querySelector('[title="Réviser cette fiche"]')`, false), { att: 1500 });
// la série peut commencer par l'une ou l'autre : on vise celle des insertions
for (let k = 0; k < 2; k++) {
  if (await b.ev(`document.querySelector('.flash-face.front').innerText.includes('insertions')`)) break;
  await b.clic(await b.pos(`document.querySelector('.flash-card')`, false), { att: 700 });
  await b.clic(await b.pos(`document.querySelectorAll('.rev-rate button')[2]`, false), { att: 900 });
}
b.ok(await b.ev(`document.querySelector('.flash-face.front').innerText.includes('Muscles de la fesse — insertions')`), 'recto = le titre du tableau');
await b.clic(await b.pos(`document.querySelector('.flash-card')`, false), { att: 800 });
const T = `document.querySelector('.flash-face.back [data-tableau]')`;
let etat = await b.ev(`({th:[...${T}.querySelectorAll('th')].map(x=>x.innerText.trim()).filter(Boolean),masques:${T}.querySelectorAll('.tb-masque').length,lignes:${T}.querySelectorAll('.tb-ligne-btn').length,tout:(${T}.querySelector('.tb-tout-btn')||{}).innerText||''})`);
b.ok(etat.th.join('|').toLowerCase() === 'muscle|origine|insertion' && etat.masques === 12 && etat.lignes === 4 && /\(12\)/.test(etat.tout), 'verso : noms de colonnes visibles, 12 cellules masquées, « Révéler la ligne » × 4, « Tout révéler (12) »', JSON.stringify(etat));
await b.capture('tb-revision-masque', await b.ev(`(()=>{const r=document.querySelector('.flash-card').getBoundingClientRect();return {x:r.x-6,y:r.y-6,width:r.width+12,height:r.height+12}})()`));
await b.clic(await b.pos(`${T}.querySelector('[data-cellule="1:2"] .tb-masque')`), { att: 300 });
etat = await b.ev(`({masques:${T}.querySelectorAll('.tb-masque').length,v:${T}.querySelector('[data-cellule="1:2"]').innerText.trim(),retourne:document.querySelector('.flash-card').classList.contains('flipped')})`);
b.ok(etat.masques === 11 && etat.v === 'Grand trochanter (face latérale)' && etat.retourne, 'tap sur une cellule : elle seule se révèle (la carte ne se retourne pas)', JSON.stringify(etat));
await b.clic(await b.pos(`${T}.querySelector('tr[data-ligne="0"] .tb-ligne-btn')`), { att: 300 });
etat = await b.ev(`({masques:${T}.querySelectorAll('.tb-masque').length,l0:[...${T}.querySelectorAll('tr[data-ligne="0"] td')].slice(0,3).map(x=>x.innerText.trim())})`);
b.ok(etat.masques === 8 && etat.l0[0] === 'Grand glutéal', '« Révéler la ligne » : la ligne 1 entière', JSON.stringify(etat));
await b.clic(await b.pos(`${T}.querySelector('.tb-tout-btn')`), { att: 300 });
etat = await b.ev(`({masques:${T}.querySelectorAll('.tb-masque').length,tout:!!${T}.querySelector('.tb-tout-btn')})`);
b.ok(etat.masques === 0 && !etat.tout, '« Tout révéler » : plus rien de masqué');
await b.capture('tb-revision-revele', await b.ev(`(()=>{const r=document.querySelector('.flash-card').getBoundingClientRect();return {x:r.x-6,y:r.y-6,width:r.width+12,height:r.height+12}})()`));
b.ok(!b.erreurs.length, 'aucune erreur dans la page', b.erreurs.join(' / '));
process.exit(0);
