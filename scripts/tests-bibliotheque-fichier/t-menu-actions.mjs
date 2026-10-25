// Menu « Fichier » unique (15/10) — chaque entrée fait ce qu'elle dit, les grisées ne font rien (raison
// affichée), clavier et raccourcis identiques. Base LOCALE du banc (préalable : seed-menu.mjs).
import { banc } from './commun.mjs';
const b = await banc(1440, 900);
await b.c.send('Runtime.evaluate', { expression: `localStorage.setItem('medrevise.biblio.tri','manuel')` });
await b.biblio({ recharger: true });
// téléchargements interceptés (rien n'est écrit sur le disque) ; impression du navigateur neutralisée
const pieger = () => b.ev(`(()=>{if(window.__piege)return 1;window.__piege=1;window.__dl=[];window.__print=0;
  const o=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){const n=this.download,h=this.href;window.__dl.push({nom:n,taille:-1});
    const i=window.__dl.length-1;fetch(h).then(r=>r.blob()).then(x=>{window.__dl[i].taille=x.size;window.__dl[i].type=x.type;return x.slice(0,600).text()}).then(t=>{window.__dl[i].debut=t}).catch(()=>{});return;}return o.call(this)};
  window.print=()=>{window.__print++;setTimeout(()=>window.dispatchEvent(new Event('afterprint')),300)};return 1})()`);
const dl = () => b.ev(`JSON.stringify(window.__dl||[])`).then(JSON.parse);
const viderDl = () => b.ev(`(window.__dl=[],1)`);
const ouvrirMenu = async () => { if (!(await b.ev(`!!document.querySelector('.mf-menu')`))) await b.clic(await b.pos(`document.querySelector('.mf-bouton')`, false), { att: 450 }); };
const entree = async (id, choix = null) => { await ouvrirMenu(); await b.clic(await b.pos(choix ? `document.querySelector('[data-entree=${id}] [data-choix=${choix}]')` : `document.querySelector('button[data-entree=${id}]')`, false), { att: 600 });
  // (25/10) les exports passent par le choix des pages (pdf/ChoixPages.jsx) : « Toutes », puis Exporter
  if (await b.ev(`!!document.querySelector('.cp-fenetre')`)) { await b.clic(await b.pos(`document.querySelector('.cp-fenetre .cp-mode[data-mode="toutes"]')`, false), { att: 200 }); await b.clic(await b.pos(`document.querySelector('.cp-fenetre [data-action="exporter"]')`, false), { att: 600 }); }
};
const menuOuvert = () => b.ev(`!!document.querySelector('.mf-menu')`);
const vue = async (v) => { await b.ev(`(()=>{const x=[...document.querySelectorAll('.pdfr-jumelle-bascule .seg-btn')].find(x=>x.innerText===${JSON.stringify(v)});x&&x.click();return 1})()`); await b.dormir(1800); };
const attendre = async (f, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await b.dormir(300); } return false; };

/* ===== COURS PDF ===== */
await b.ouvrir('Membre supérieur — repères'); await pieger();
// clavier : focus sur la 1re entrée, ↓ ↑, Échap rend le focus au bouton
await ouvrirMenu();
b.ok(await b.ev(`document.activeElement?.dataset?.entree==='renommer'`), 'clavier : à l’ouverture, le focus est sur « Renommer »');
await b.T.Bas(); await b.T.Bas();
b.ok(await b.ev(`document.activeElement?.dataset?.entree==='miseEnPage'`), 'clavier : ↓ ↓ → « Mise en page » (les grisées restent atteignables, à leur place)');
await b.T.Haut();
b.ok(await b.ev(`document.activeElement?.dataset?.entree==='fichiers'`), 'clavier : ↑ → « Fichiers du cours »');
await b.T.Escape();
b.ok(!(await menuOuvert()) && await b.ev(`document.activeElement?.classList.contains('mf-bouton')`), 'Échap : menu fermé, focus rendu au bouton Fichier');
// grisée : rien ne se passe, la raison s'affiche, le menu reste ouvert
await entree('miseEnPage');
b.ok(await menuOuvert() && await b.ev(`document.querySelector('.mf-raison')?.innerText==='Non disponible pour un cours PDF'`) && !(await b.ev(`!!document.querySelector('.mep-panneau')`)), 'entrée grisée touchée : rien ne s’ouvre, sa raison s’affiche dans le menu');
await b.capture('mf-grisee-raison', await b.ev(`(()=>{const r=document.querySelector('.mf-menu').getBoundingClientRect();return {x:r.x-8,y:r.y-40,width:r.width+16,height:r.height+48}})()`));
await b.T.Escape();
// 1. Renommer (F2) — annulé par Échap
await b.ev(`document.activeElement&&document.activeElement.blur&&document.activeElement.blur(),1`);
await b.touche('F2', { code: 'F2', vk: 113 }); await b.dormir(300);
b.ok(await b.ev(`!!document.querySelector('.lecteur-entete input')`), 'F2 : le titre passe en édition (Renommer)');
await b.T.Escape(); await b.dormir(200);
b.ok(!(await b.ev(`!!document.querySelector('.lecteur-entete input')`)) && await b.ev(`document.querySelector('.lecteur-entete').innerText.includes('Membre supérieur — repères')`), 'Échap : renommage annulé, titre inchangé');
await entree('renommer');
b.ok(await b.ev(`!!document.querySelector('.lecteur-entete input')`), 'menu › Renommer : même effet');
await b.T.Escape(); await b.dormir(200);
// 4. Reconnaissance de texte
await entree('ocr');
b.ok(await b.ev(`document.body.innerText.includes('Relancer sur ce cours') && document.body.innerText.includes('Afficher la couche OCR')`), 'Reconnaissance de texte : fenêtre (état, couche OCR, relancer)');
await b.T.Escape(); await b.ev(`(()=>{const x=[...document.querySelectorAll('.day-pop-head button')].pop();x&&x.click();return 1})()`); await b.dormir(300);
// 5. PDF annoté — par le menu, puis par ⌘P
await viderDl(); await entree('pdfAnnote');
b.ok(await attendre(async () => (await dl()).some((x) => /-annote\.pdf$/.test(x.nom) && x.taille > 1000)), 'Exporter le PDF annoté : un PDF téléchargé', (await dl()).map((x) => x.nom + ' · ' + x.taille + ' o').join(', '));
await viderDl();
await b.touche('p', { meta: true, code: 'KeyP', vk: 80 });
b.ok(await attendre(async () => (await dl()).some((x) => /-annote\.pdf$/.test(x.nom))) && (await b.ev(`window.__print`)) === 0, '⌘P : même export (pas l’impression du navigateur)');
// 6. Exporter .md / PNG par page
await viderDl(); await entree('exporter', 'md');
let d = await attendre(async () => (await dl()).some((x) => /\.md$/.test(x.nom) && x.debut));
const md = (await dl()).find((x) => /\.md$/.test(x.nom));
b.ok(d && md.debut.startsWith('# Membre supérieur — repères'), 'Exporter › .md : le texte du cours en Markdown', md && md.nom + ' · ' + md.taille + ' o');
await viderDl(); await entree('exporter', 'png');
d = await attendre(async () => (await dl()).some((x) => /\.zip$/.test(x.nom) && x.taille > 0), 60000);
const zip = (await dl()).find((x) => /\.zip$/.test(x.nom));
b.ok(d && zip.debut && zip.debut.startsWith('PK') && /page-01\.png/.test(zip.debut), 'Exporter › PNG par page : un .zip de PNG (page-01.png…)', zip && zip.nom + ' · ' + Math.round(zip.taille / 1024) + ' Ko');
// 7. Export spécial IA (⌘⇧E) — avec « Copier les notions », « Cours complet (JSON) », « Prompts… »
await b.touche('E', { meta: true, shift: true, code: 'KeyE', vk: 69 }); await b.dormir(500);
b.ok(await b.ev(`!!document.querySelector('.eia-panneau')`), '⌘⇧E : panneau Export spécial IA');
b.ok(await b.ev(`[...document.querySelectorAll('.eia-extras button')].map(x=>x.innerText.trim()).join('|')==='Copier les notions|Cours complet (JSON)|Prompts…'`), 'Export spécial IA : « Copier les notions », « Cours complet (JSON) », « Prompts… » (sortis du menu)');
await b.capture('mf-export-ia', await b.ev(`(()=>{const r=document.querySelector('.eia-panneau').getBoundingClientRect();return {x:r.x-8,y:r.y-8,width:r.width+16,height:r.height+16}})()`));
await b.clic(await b.pos(`[...document.querySelectorAll('.eia-extras button')].find(x=>x.innerText.trim()==='Prompts…')`, false), { att: 700 });
b.ok(await b.ev(`!!document.querySelector('.day-pop') && document.querySelector('.day-pop').innerText.includes('rompt')`), 'Prompts… : la fenêtre des prompts');
await b.ev(`(()=>{const x=document.querySelector('.day-pop-scrim');x&&x.click();return 1})()`); await b.dormir(300);
await b.T.Escape(); await b.dormir(300);
// 8. Textes d'annotations : Exporter / Importer → le panneau, sur le bon volet (Affichage y reste)
await entree('textes', 'importer');
b.ok(await b.ev(`document.querySelector('.ta-volet.actif')?.innerText==='Importer' && [...document.querySelectorAll('.ta-volet')].map(x=>x.innerText).join('|')==='Exporter|Importer|Affichage'`), 'Textes › Importer : panneau sur « Importer » (volets Exporter · Importer · Affichage)');
await b.T.Escape(); await b.dormir(200);
// 2. Importer la fiche jumelle : ouvre le sélecteur de fichier (annulé ici)
await b.c.send('Page.enable'); await b.c.send('Page.setInterceptFileChooserDialog', { enabled: true });
let choisi = false; b.c.on((m) => { if (m.method === 'Page.fileChooserOpened') choisi = true; });
await entree('fichiers'); await b.dormir(700);
b.ok(await b.ev(`!!document.querySelector('.fcrs-ligne[data-ligne=jumelle]')`), 'Fichiers du cours… : l’écran (principal + fiche jumelle) s’ouvre');
await b.clic(await b.pos(`[...document.querySelectorAll('.fcrs-ligne[data-ligne=jumelle] .fcrs-actions button')].find(x=>x.innerText.trim()==='Importer')`, false), { att: 500 });
b.ok(choisi, 'ligne Fiche jumelle › Importer : le sélecteur de PDF s’ouvre');
await b.c.send('Page.setInterceptFileChooserDialog', { enabled: false });
// ⋯ des Exercices : « Prompts (théorie et exercices)… »
const exo = await b.ev(`(()=>{const t=[...document.querySelectorAll('[role=tab]')].find(x=>x.innerText.trim().startsWith('Exercices'));t&&t.click();return !!t})()`); await b.dormir(700);
if (exo) {
  await b.clic(await b.pos(`[...document.querySelectorAll('.pis button')].find(x=>(x.title||'').startsWith('Plus')||x.getAttribute('aria-label')==='Plus d’actions'||x.innerText.trim()==='⋯')`, false).catch(() => null), { att: 500 }).catch(() => {});
  b.ok(await b.ev(`[...document.querySelectorAll('.ctx-menu-item')].some(x=>x.innerText.includes('Prompts (théorie et exercices)'))`), 'panneau › Exercices › ⋯ : « Prompts (théorie et exercices)… »');
  await b.T.Escape();
}
// remplacer la sélection : ⋯ de la barre d'outils, seulement avec une sélection
const avantSel = await b.ev(`!!document.querySelector('.pdfr-v2 button[title="Actions sur le document"]')`);
await b.clic(await b.bouton('Sélection'));
const sp = await b.rect(`[...document.querySelectorAll('.pdfr-textlayer span')].find(s=>s.textContent.trim().length>8)`);
await b.glisser([sp.x + 2, sp.cy], [sp.x + sp.w * 0.8, sp.cy], 12); await b.dormir(500);
const btnDoc = await b.pos(`document.querySelector('.pdfr-v2 button[title="Actions sur le document"]')`, false);
if (btnDoc) await b.clic(btnDoc, { att: 400 });
b.ok(!avantSel && await b.ev(`[...document.querySelectorAll('button, [role=menuitem]')].some(x=>x.innerText.trim()==='Remplacer le texte sélectionné')`), 'sélection de texte : « Remplacer le texte sélectionné » dans le ⋯ de la barre (absent sans sélection)');
await b.T.Escape(); await b.ev(`getSelection().removeAllRanges(),1`);

/* ===== FICHE JUMELLE ===== */
await b.biblio(); await b.ouvrir('Physiologie rénale (jumelle)'); await pieger(); await vue('Fiche');
await ouvrirMenu();
await b.clic(await b.pos(`[...document.querySelectorAll('.mf-extras .mf-pastille')].find(x=>x.innerText==='Pages')`, false), { att: 1500 });
b.ok(await b.ev(`document.body.innerText.includes('Correspondance des pages')`), 'fiche jumelle › pastille « Pages » : l’éditeur de correspondance');
b.ok(await b.ev(`[...document.querySelectorAll('.fjc-actions button')].some(x=>/^Non replacées \\(\\d+\\)/.test(x.innerText))`), 'éditeur : « Non replacées (n) » (sorti du menu)');
await b.clic(await b.bouton('Annuler'), { att: 400 });
await viderDl(); await b.touche('p', { meta: true, code: 'KeyP', vk: 80 });
b.ok(await attendre(async () => (await dl()).some((x) => /-fiche-annote\.pdf$/.test(x.nom))), '⌘P sur la fiche : le PDF annoté de la fiche (« -fiche-annote.pdf »)');
await entree('ocr');
b.ok(await b.ev(`document.body.innerText.includes('Relancer sur ce cours')`), 'Reconnaissance de texte : disponible aussi côté fiche');
await b.ev(`(()=>{const x=[...document.querySelectorAll('.day-pop-head button')].pop();x&&x.click();return 1})()`); await b.dormir(300);
await vue('Original');

/* ===== DOCUMENT ===== */
await b.biblio(); await b.ouvrir('Conformité doc'); await pieger();
await entree('miseEnPage');
b.ok(await b.ev(`!!document.querySelector('.mep-panneau') && [...document.querySelectorAll('.mep-fond .mep-pre')].map(x=>x.innerText.trim()).join('|')==='Blanc|Noir'`), 'document › Mise en page : marges + « Fond de page » (Blanc · Noir)');
const fond0 = await b.ev(`!!document.querySelector('.pdfr-page.fond-noir')`);
await b.clic(await b.pos(`[...document.querySelectorAll('.mep-fond .mep-pre')].find(x=>x.innerText.trim()===${JSON.stringify('Noir')})`, false), { att: 600 });
const fond1 = await b.ev(`!!document.querySelector('.pdfr-page.fond-noir')`);
await b.clic(await b.pos(`[...document.querySelectorAll('.mep-fond .mep-pre')].find(x=>x.innerText.trim()===${JSON.stringify('Blanc')})`, false), { att: 600 });
b.ok(!fond0 && fond1 && !(await b.ev(`!!document.querySelector('.pdfr-page.fond-noir')`)), 'Fond de page : Noir puis Blanc (remis comme avant)');
await b.capture('mf-mise-en-page', await b.ev(`(()=>{const r=document.querySelector('.mep-panneau').getBoundingClientRect();return {x:r.x-8,y:r.y-8,width:r.width+16,height:r.height+16}})()`));
await b.T.Escape();
await viderDl(); await entree('exporter', 'md');
b.ok(await attendre(async () => (await dl()).some((x) => /\.md$/.test(x.nom) && x.taille > 0)), 'document › Exporter › .md');
await b.touche('E', { meta: true, shift: true, code: 'KeyE', vk: 69 }); await b.dormir(400);
b.ok(!(await b.ev(`!!document.querySelector('.eia-panneau')`)), '⌘⇧E sur un document : rien (entrée grisée)');
await b.touche('p', { meta: true, code: 'KeyP', vk: 80 }); await b.dormir(2500);
b.ok((await b.ev(`window.__print`)) === 1, '⌘P sur un document : son export PDF (la feuille d’impression du document)');
await b.dormir(800);

/* ===== SUPPRIMER (cours jetable du jeu de test) ===== */
await b.biblio(); await b.ouvrir('Cours jetable (test)');
await entree('supprimer');
b.ok(await b.ev(`[...document.querySelectorAll('.day-pop .row:not(.spread) button')].map(x=>x.innerText.trim()).join('|')==='Annuler|Supprimer le cours'`), 'Supprimer… : Annuler · Supprimer le cours (16/10 : plus de « Détacher le PDF »)');
await b.capture('mf-supprimer', await b.ev(`(()=>{const r=document.querySelector('.day-pop').getBoundingClientRect();return {x:r.x-8,y:r.y-8,width:r.width+16,height:r.height+16}})()`));
await b.clic(await b.bouton('Annuler'), { att: 400 });
b.ok(!(await b.S(`return !!(await S.getOne('fiches','f-tb-jetable')).archive`)), 'Annuler : rien de supprimé');
await entree('supprimer'); await b.clic(await b.bouton('Supprimer le cours'), { att: 1200 });
b.ok(await b.S(`return !!(await S.getOne('fiches','f-tb-jetable')).archive`) && !(await b.ev(`!!document.querySelector('.pdfr-scroll')`)), 'Supprimer le cours : à la corbeille (archive), lecteur fermé');
await b.S(`const f=await S.getOne('fiches','f-tb-jetable');await S.put('fiches',{...f,archive:false});return 1`); // banc : remis
b.ok(!b.erreurs.length, 'aucune erreur dans la page', b.erreurs.join(' / '));
process.exit(0);
