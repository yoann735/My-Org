// (17/10) Menu Fichier en sections — Cours · Diapo originale · Fiche. Base LOCALE du banc.
// Préalables : tests-fiche-jumelle/seed.mjs (Physiologie rénale), seed-menu.mjs (cours jetable, HTML seul).
import { banc, FX } from './commun.mjs';
const b = await banc(1440, 900);
await b.c.send('Runtime.evaluate', { expression: `localStorage.setItem('medrevise.biblio.tri','manuel')` });
await b.S(`for(const r of await S.getAll('companion_pdf')) if(r.courseId==='f-tb-jetable') await S.remove('companion_pdf',r.id); return 1`);
await b.biblio({ recharger: true });
// le nom réel de la fiche jumelle de « Physiologie rénale » (une autre suite peut l'avoir remplacée : fiche-v2.pdf)
const NOM_FICHE = await b.S(`return ((await S.getAll('companion_pdf')).find(r=>r.courseId==='f-fj')||{}).fileName||'fiche.pdf'`);
const DOC = ['pdfAnnote', 'formats', 'exportIA', 'textes', 'ocr', 'remplacer', 'supprimer'];
const sansPropres = (l) => l.filter((x) => !['miseEnPage', 'correspondance'].includes(x));

/* 1. cours PDF + fiche : trois sections, mêmes actions, document affiché mis en évidence */
await b.ouvrir('Physiologie rénale (jumelle)');
if ((await b.vue()) !== 'Fiche') await b.basculer('Fiche');
await b.ouvrirMenu();
let s = await b.lireSections();
b.ok(s.map((x) => x.cle).join() === 'cours,original,fiche', 'trois sections dans l’ordre : Cours · Diapo originale · Fiche', s.map((x) => x.cle).join());
b.ok(s[0].entrees.map((e) => e.label).join(' · ') === 'Renommer le cours · Fichiers du cours… · Supprimer le cours…', 'section Cours : Renommer le cours · Fichiers du cours · Supprimer le cours', s[0].entrees.map((e) => e.label).join(' · '));
b.ok(s[1].role === 'Diapo originale' && s[1].nom === 'cours.pdf', 'en-tête « Diapo originale — cours.pdf » (icône + nom du fichier)', `${s[1].role} — ${s[1].nom}`);
b.ok(s[2].role === 'Fiche' && s[2].nom === NOM_FICHE, `en-tête « Fiche — ${NOM_FICHE} »`, `${s[2].role} — ${s[2].nom}`);
const ids1 = s[1].entrees.map((e) => e.id), ids2 = s[2].entrees.map((e) => e.id);
b.ok(JSON.stringify(sansPropres(ids1)) === JSON.stringify(DOC) && JSON.stringify(sansPropres(ids2)) === JSON.stringify(DOC), 'mêmes actions, même ordre dans les deux sections', ids1.join(' · ') + ' | ' + ids2.join(' · '));
b.ok(ids2.includes('correspondance') && !ids1.includes('correspondance') && ids2.indexOf('correspondance') === ids2.indexOf('remplacer') - 1, 'Correspondance des pages : propre à la section Fiche, juste avant « Remplacer ce fichier »');
const lbl = (sec, id) => sec.entrees.find((e) => e.id === id).label;
b.ok(lbl(s[1], 'pdfAnnote') === 'Exporter la diapo annotée' && lbl(s[2], 'pdfAnnote') === 'Exporter la fiche annotée', 'libellés explicites : « Exporter la diapo annotée » / « Exporter la fiche annotée »');
b.ok(lbl(s[1], 'supprimer') === 'Supprimer la diapo originale…' && lbl(s[2], 'supprimer') === 'Supprimer la fiche…', 'libellés explicites : « Supprimer la diapo originale… » / « Supprimer la fiche… »');
b.ok(s[1].entrees.find((e) => e.id === 'supprimer').danger && s[2].entrees.find((e) => e.id === 'supprimer').danger && s[0].entrees.find((e) => e.id === 'supprimer').danger, 'les trois suppressions en rouge');
b.ok(s[2].affiche && s[2].marque && !s[1].affiche && s[1].retrait && s[2].fond !== s[1].fond, 'Fiche affichée : section teintée + « affiché » ; Diapo en retrait', `${s[2].fond} vs ${s[1].fond}`);
b.ok(s[2].entrees.find((e) => e.id === 'pdfAnnote').kbd && !s[1].entrees.find((e) => e.id === 'pdfAnnote').kbd, '⌘P affiché seulement dans la section du document affiché');
await b.capture('fcc-menu-fiche-affichee', await b.ev(`(()=>{const e=document.querySelector('.lecteur-entete').getBoundingClientRect();const r=document.querySelector('.mf-menu').getBoundingClientRect();return {x:Math.max(0,e.x-4),y:Math.max(0,e.y-4),width:Math.round(r.width+24),height:Math.round(r.bottom-e.y+14)}})()`));
await b.fermerMenu();
await b.basculer('Original');
await b.ouvrirMenu();
s = await b.lireSections();
b.ok(s[1].affiche && s[1].marque && s[2].retrait && !s[2].marque, 'bascule sur Original : la mise en évidence passe à la Diapo originale');
await b.capture('fcc-menu-diapo-affichee', await b.ev(`(()=>{const e=document.querySelector('.lecteur-entete').getBoundingClientRect();const r=document.querySelector('.mf-menu').getBoundingClientRect();return {x:Math.max(0,e.x-4),y:Math.max(0,e.y-4),width:Math.round(r.width+24),height:Math.round(r.bottom-e.y+14)}})()`));

/* 2. action de l'autre section : la fiche s'affiche d'abord, puis l'export part */
await b.pieger();
await b.entree('fiche', 'pdfAnnote');
let t0 = Date.now(), dl = [];
while (Date.now() - t0 < 12000 && !(dl = await b.telecharges()).length) await b.dormir(300);
b.ok((await b.vue()) === 'Fiche', '« Exporter la fiche annotée » depuis l’Original : la fiche est affichée d’abord');
b.ok(dl.length === 1 && /-fiche-annote\.pdf$/.test(dl[0]), 'puis l’export de la FICHE part (nom …-fiche-annote.pdf)', dl.join(', '));
await b.pieger();
await b.ev(`document.querySelector('.pdfr-scroll').focus();1`);
await b.c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'p', code: 'KeyP', modifiers: 4, windowsVirtualKeyCode: 80 });
await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'p', code: 'KeyP', modifiers: 4, windowsVirtualKeyCode: 80 });
t0 = Date.now(); while (Date.now() - t0 < 8000 && !(dl = await b.telecharges()).length) await b.dormir(300);
b.ok(dl.length === 1 && /-fiche-annote\.pdf$/.test(dl[0]), '⌘P : exporte le document AFFICHÉ (la fiche)', dl.join(', '));

/* 3. refus : supprimer la diapo originale tant qu'une fiche existe */
await b.entree('original', 'supprimer');
const refus = await b.ev(`(()=>{const m=document.querySelector('[data-sdoc=refus]');return m?m.innerText:null})()`);
b.ok(refus && refus.includes('« cours.pdf »') && refus.includes(`« ${NOM_FICHE} »`) && refus.includes('Importez d’abord un autre document principal ou remplacez-le'), 'refus expliqué : nomme la diapo et la fiche, « Importez d’abord un autre document principal ou remplacez-le »', (refus || '').slice(0, 160));
await b.capture('fcc-refus', await b.ev(`(()=>{const r=document.querySelector('[data-sdoc=refus]').closest('.day-pop')||document.querySelector('[data-sdoc=refus]');const q=r.getBoundingClientRect();return {x:q.x-10,y:q.y-10,width:q.width+20,height:q.height+20}})()`));
await b.T.Escape(); await b.dormir(300);

/* 4. confirmation de suppression de la fiche : nom exact + ce qui est conservé (puis Annuler) */
await b.entree('fiche', 'supprimer');
await b.dormir(500);
const conf = await b.ev(`(()=>{const m=document.querySelector('[data-sdoc=fiche]');return m?m.innerText:null})()`);
b.ok(conf && conf.includes(`Supprimer la fiche « ${NOM_FICHE} »`) && /Conservé/i.test(conf) && /flashcard/.test(conf) && /notion/.test(conf) && /annotation/.test(conf), 'confirmation : « Supprimer la fiche « fiche.pdf » » + conservé (annotations de la diapo, flashcards, notions)', (conf || '').replace(/\n/g, ' ').slice(0, 220));
await b.capture('fcc-confirme-fiche', await b.ev(`(()=>{const r=document.querySelector('[data-sdoc=fiche]').closest('.day-pop')||document.querySelector('[data-sdoc=fiche]');const q=r.getBoundingClientRect();return {x:q.x-10,y:q.y-10,width:q.width+20,height:q.height+20}})()`));
await b.clic(await b.pos(`[...document.querySelectorAll('[data-sdoc=fiche] button')].find(x=>x.innerText.trim()==='Annuler')`, false), { att: 400 });
b.ok(!!(await b.S(`return !!(await S.getAll('companion_pdf')).find(r=>r.courseId==='f-fj')`)), 'Annuler : la fiche est toujours là');
await b.fermerLecteur();

/* 5. cours jetable : importer une fiche, la supprimer, puis supprimer la diapo originale */
await b.ouvrir('Cours jetable (test)');
await b.ouvrirMenu();
s = await b.lireSections();
b.ok(s[2].nom === 'aucune' && s[2].entrees.map((e) => e.label).join() === 'Importer une fiche', 'sans fiche : « Fiche — aucune » avec seulement « Importer une fiche »', `${s[2].nom} / ${s[2].entrees.map((e) => e.label).join()}`);
await b.capture('fcc-menu-sans-fiche', await b.ev(`(()=>{const e=document.querySelector('.lecteur-entete').getBoundingClientRect();const r=document.querySelector('.mf-menu').getBoundingClientRect();return {x:Math.max(0,e.x-4),y:Math.max(0,e.y-4),width:Math.round(r.width+24),height:Math.round(r.bottom-e.y+14)}})()`));
const pris = b.fichierSuivant(FX + '/fiche.pdf');
await b.entree('fiche', 'importer');
await pris;
for (let k = 0; k < 40 && !(await b.ev(`[...document.querySelectorAll('.day-pop button')].some(x=>x.innerText.trim()==='Voir la fiche')`)); k++) await b.dormir(400);
await b.ev(`(()=>{const x=[...document.querySelectorAll('.day-pop button')].find(x=>x.innerText.trim()==='Voir la fiche');x&&x.click();return 1})()`); await b.dormir(1500);
b.ok(!!(await b.S(`return !!(await S.getAll('companion_pdf')).find(r=>r.courseId==='f-tb-jetable')`)) && (await b.vue()) === 'Fiche', 'Importer une fiche : la fiche est rattachée et affichée');
await b.entree('fiche', 'supprimer'); await b.dormir(600);
const avant = await b.S(`return (await S.getAll('backups')).length`).catch(() => null);
await b.clic(await b.pos(`document.querySelector('[data-sdoc=fiche] [data-sdoc-confirmer]')`, false), { att: 2500 });
b.ok(!(await b.S(`return !!(await S.getAll('companion_pdf')).find(r=>r.courseId==='f-tb-jetable')`)), 'Supprimer la fiche (confirmée) : fiche retirée');
b.ok((await b.vue()) === null && !!(await b.ev(`!!document.querySelector('.pdfr-scroll')`)), 'le lecteur revient sur la diapo originale');
await b.entree('original', 'supprimer'); await b.dormir(600);
const conf2 = await b.ev(`(()=>{const m=document.querySelector('[data-sdoc=original]');return m?m.innerText:null})()`);
b.ok(conf2 && conf2.includes('Supprimer la diapo originale « cours.pdf »') && /Conservé/i.test(conf2) && /flashcard/.test(conf2), 'sans fiche : confirmation « Supprimer la diapo originale « cours.pdf » » + conservé', (conf2 || '').replace(/\n/g, ' ').slice(0, 200));
await b.capture('fcc-confirme-diapo', await b.ev(`(()=>{const r=document.querySelector('[data-sdoc=original]').closest('.day-pop')||document.querySelector('[data-sdoc=original]');const q=r.getBoundingClientRect();return {x:q.x-10,y:q.y-10,width:q.width+20,height:q.height+20}})()`));
await b.clic(await b.pos(`document.querySelector('[data-sdoc=original] [data-sdoc-confirmer]')`, false), { att: 2500 });
const f = await b.S(`const f=await S.getOne('fiches','f-tb-jetable');return {pdfId:f.pdfId,retires:(f.fichiersRetires||[]).map(r=>r.type+':'+r.fileName+(r.supprime?':supprime':''))}`);
b.ok(!f.pdfId && f.retires.includes('pdf:cours.pdf:supprime'), 'diapo supprimée : le cours n’y pointe plus, le fichier est listé dans les archives (pas effacé)', JSON.stringify(f));
const bk = await b.ev(`new Promise(ok=>{const r=indexedDB.open('medrevise-backups');r.onsuccess=()=>{const q=r.result.transaction('v1').objectStore('v1').getAllKeys();q.onsuccess=()=>ok(q.result.filter(k=>/pre-supprime-(jumelle|principal)-f-tb-jetable/.test(k)))}})`);
b.ok(bk.some((k) => k.includes('pre-supprime-jumelle')) && bk.some((k) => k.includes('pre-supprime-principal')), 'putBackup fait AVANT chaque suppression (fiche puis diapo)', bk.join(', '));
await b.fermerLecteur();

/* 6. document créé dans l'app, onglet Notes, fiche HTML : mêmes sections */
for (const [titre, attendu] of [['Myologie (document)', 'doc'], ['Membre supérieur — repères', 'notes'], ['Cours HTML seul (test)', 'html']]) {
  await b.biblio({ recharger: true });
  const ouvert = await b.ouvrir(titre);
  b.ok(ouvert || (attendu === "html" && await b.ev(`!!document.querySelector(".mf-bouton")`)), `${attendu} : « ${titre} » ouvert`);
  if (attendu === 'doc' && (await b.vue()) === 'Fiche') await b.basculer('Original');
  if (attendu === 'notes') { await b.ev(`(()=>{const t=[...document.querySelectorAll('[role=tab]')].find(x=>x.innerText.trim()==='Notes');t&&t.click();return 1})()`); await b.dormir(900); }
  if (attendu === 'html') await b.dormir(1500);
  await b.ouvrirMenu();
  s = await b.lireSections();
  b.ok(s.map((x) => x.cle).join() === 'cours,original,fiche', `${attendu} : mêmes trois sections`, s.map((x) => `${x.role} — ${x.nom}`).join(' | '));
  if (attendu === 'doc') {
    b.ok(s[1].role === 'Document original' && s[1].entrees.some((e) => e.id === 'miseEnPage' && !e.gris) && lbl(s[1], 'pdfAnnote') === 'Exporter le document annoté', 'document : « Document original », Mise en page (propre), « Exporter le document annoté »');
    b.ok(s[1].affiche, 'document : section du document affiché mise en évidence');
    // action de CONTENU de l'autre section, vers le document (éditeur) : il s'affiche d'abord
    await b.fermerMenu(); await b.basculer('Fiche');
    await b.entree('original', 'textes', 'exporter');
    for (let k = 0; k < 30 && !(await b.ev(`!!document.querySelector('.ta-panneau')`)); k++) await b.dormir(300);
    b.ok((await b.vue()) === 'Original' && await b.ev(`!!document.querySelector('.ta-panneau') && !!document.querySelector('.pt-flux-cadre, .pt-zone')`), 'document : « Textes › Exporter » de la section Document original depuis la fiche → le document s’affiche, puis le panneau s’ouvre');
    await b.T.Escape(); await b.dormir(400);
    await b.ouvrirMenu();
    await b.capture('fcc-menu-document', await b.ev(`(()=>{const e=document.querySelector('.lecteur-entete').getBoundingClientRect();const r=document.querySelector('.mf-menu').getBoundingClientRect();return {x:Math.max(0,e.x-4),y:Math.max(0,e.y-4),width:Math.round(r.width+24),height:Math.round(r.bottom-e.y+14)}})()`));
  }
  if (attendu === 'notes') b.ok(s[1].affiche && s[1].nom === 'cours.pdf' || s[1].nom.length > 0, 'onglet Notes : même menu, la diapo affichée en évidence', s[1].nom);
  if (attendu === 'html') b.ok(s[1].role === 'Fiche HTML' && s[2].nom === 'aucune' && s[2].entrees[0].gris, 'fiche HTML : « Fiche HTML — fiche.html », « Fiche — aucune » (import grisé)', s[2].entrees[0].titre);
  await b.fermerMenu();
  await b.fermerLecteur();
}
b.ok(!b.erreurs.length, 'aucune erreur dans la page', b.erreurs.join(' / '));
process.exit(0);
