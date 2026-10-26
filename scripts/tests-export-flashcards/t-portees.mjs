// Les autres portées de l'export (Chrome C, ordinateur) : une MATIÈRE et un COURS (menus « … » de la Bibliothèque),
// les cartes VISIBLES du mode Apprentissage (filtres actuels), TOUTES les flashcards (Réglages). À lancer après
// t-export.mjs (les cours cibles contiennent alors les cartes ré-importées).
import fs from 'node:fs';
import { banc, COURS, MATIERE, SORTIE } from './commun.mjs';
import { ouvrirZip } from './aide.mjs';
const b = await banc(false);
await b.ouvrirApp({ recharger: true });
const AUJ = new Date().toLocaleDateString('fr-CA');
const empAvant = await b.empreinteCartes();
const verifierZip = (z, attendu, quoi) => {
  const Z = ouvrirZip(z.chemin);
  const imgs = Z.noms.filter((x) => x.startsWith('images/'));
  const refs = [...new Set(JSON.stringify(Z.doc.items).match(/images\/[a-z0-9]+\.[a-z]+/g) || [])];
  b.v(Z.integre && Z.jsonOk && Z.doc.items.length === attendu, `${quoi} : archive intègre, JSON valide, ${attendu} cartes`, `${Z.doc && Z.doc.items.length} cartes · ${z.nom} · ${Math.round(z.octets / 1024)} Ko`);
  b.v(refs.every((r) => imgs.includes(r)) && imgs.length === refs.length && new Set(imgs).size === imgs.length && z.manquantes.length === 0, `${quoi} : toutes les images présentes, aucune en double, aucune manquante`, `${imgs.length} images`);
  return Z;
};
const cliquerMenu = async (texte) => { await b.dormir(300); return b.ev(`(()=>{const x=[...document.querySelectorAll('.ctx-menu button, .ctx-menu [role=menuitem], [role=menu] button, .ctxm button')].find(e=>e.textContent.includes(${JSON.stringify(texte)}));if(!x)return [...document.querySelectorAll('button')].filter(e=>e.textContent.includes(${JSON.stringify(texte)})).length?(([...document.querySelectorAll('button')].find(e=>e.textContent.includes(${JSON.stringify(texte)}))).click(),true):false;x.click();return true})()`); };

// ---------- 1. Bibliothèque : une matière ----------
await b.bibliotheque();
const nMat = await b.S(`const f=new Set((await S.getAll('fiches')).filter(x=>x.matiereId==='mx').map(x=>x.id));return (await S.getAll('questions')).filter(q=>q.type==='flashcard'&&!q.ephemeral&&f.has(q.ficheId)).length`);
await b.ev(`(()=>{const r=[...document.querySelectorAll('.lt-mat')].find(e=>e.textContent.includes(${JSON.stringify(MATIERE)}));r.scrollIntoView({block:'center'});r.querySelector('[title="Actions sur la matière"]').click();return 1})()`);
await b.dormir(500);
const libMat = await b.ev(`[...document.querySelectorAll('button')].map(e=>e.textContent).find(t=>/Exporter les flashcards/.test(t))||''`);
b.v(libMat.includes(`Exporter les flashcards (${nMat})`), `menu « … » de la matière : « Exporter les flashcards (${nMat})… »`, libMat);
await b.capture('biblio-menu-matiere');
await cliquerMenu('Exporter les flashcards');
await b.attendre(`!!document.querySelector('[data-export-flashcards]')`, 5000);
b.v((await b.texte('[data-export-flashcards] [data-nom-fichier]')) === `medrevise-flashcards-anatomie-export-${AUJ}.zip`, 'nom : medrevise-flashcards-<matière>-AAAA-MM-JJ.zip', await b.texte('[data-export-flashcards] [data-nom-fichier]'));
b.v(await b.ev(`document.querySelectorAll('[data-export-flashcards] .efc-cours li').length`) === 3, 'aperçu : cartes par cours (3 cours)', await b.texte('[data-export-flashcards] .efc-cours li'));
await b.capture('export-matiere');
await b.lancerExport();
const zm = await b.recupererZip('matiere.zip');
const Zm = verifierZip(zm, nMat, 'matière');
b.v(/Par cours/.test(Zm.readme) && Zm.readme.includes(`Anatomie export › ${COURS.cible} : 10`), 'README : cartes par cours');
await b.fermerFenetre(); await b.dormir(400);

// ---------- 2. Bibliothèque : un cours ----------
await b.ev(`(()=>{const l=[...document.querySelectorAll('.lt-fiche')].find(e=>e.innerText.trim().startsWith(${JSON.stringify(COURS.tous)}));l.scrollIntoView({block:'center'});l.querySelector('[title="Autres actions"]').click();return 1})()`);
await b.dormir(500);
await b.capture('biblio-menu-cours');
const libC = await b.ev(`[...document.querySelectorAll('button')].map(e=>e.textContent).find(t=>/Exporter les flashcards/.test(t))||''`);
b.v(libC.includes('Exporter les flashcards (10)'), 'menu « … » du cours : « Exporter les flashcards (10)… »', libC);
await cliquerMenu('Exporter les flashcards');
await b.attendre(`!!document.querySelector('[data-export-flashcards]')`, 5000);
await b.lancerExport();
const zc = await b.recupererZip('cours.zip');
verifierZip(zc, 10, 'cours');
b.v(zc.nom === `medrevise-flashcards-export-tous-les-types-${AUJ}.zip`, 'nom : medrevise-flashcards-<cours>-AAAA-MM-JJ.zip', zc.nom);
await b.fermerFenetre(); await b.dormir(400);

// ---------- 3. mode Apprentissage : les cartes visibles avec les filtres actuels ----------
await b.ev(`(()=>{try{localStorage.removeItem('medrevise.apprentissage.filtres')}catch(e){}return 1})()`);
await b.apprentissage();
await b.taper(`document.querySelector('.alib2-recherche input')`, 'scapula');
await b.ev(`document.querySelector('[data-puce="aap"]') && 1`);
const nVis = await b.compteur();
b.v(nVis > 0, `filtre « scapula » : ${nVis} cartes visibles`);
await b.toucher(`document.querySelector('.alib2 [data-act="exporter-fc"]')`, 600);
b.v(new RegExp(`${nVis} cartes`).test(await b.texte('[data-export-flashcards] [data-compte]')), 'fenêtre d’export : exactement les cartes visibles', await b.texte('[data-export-flashcards] [data-compte]'));
await b.capture('export-apprentissage');
await b.lancerExport();
const za = await b.recupererZip('apprentissage.zip');
const Za = verifierZip(za, nVis, 'filtre Apprentissage');
const sans = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
b.v(Za.doc.items.every((x) => sans([x.recto, x.verso, x.theme].join(' ')).includes('scapula')), 'chaque carte exportée passe le filtre');
await b.fermerFenetre(); await b.dormir(300);
// filtre combiné : « À apprendre » (sans recherche)
await b.taper(`document.querySelector('.alib2-recherche input')`, '');
await b.toucher(`document.querySelector('[data-puce="aap"]')`, 500);
const nAap = await b.compteur();
await b.toucher(`document.querySelector('.alib2 [data-act="exporter-fc"]')`, 600);
await b.lancerExport();
const zaap = await b.recupererZip('apprentissage-aap.zip');
const Zaap = verifierZip(zaap, nAap, 'filtre « À apprendre »');
b.v(Zaap.doc.items.every((x) => x.a_apprendre === true), 'filtre « À apprendre » : toutes les cartes exportées portent le tag');
await b.fermerFenetre(); await b.dormir(300);
await b.toucher(`document.querySelector('[data-puce="aap"]')`, 300);

// ---------- 4. Réglages : toutes les flashcards ----------
const nTout = await b.S(`return (await S.getAll('questions')).filter(q=>q.type==='flashcard'&&!q.ephemeral).length`);
await b.ev(`(()=>{const x=[...document.querySelectorAll('.sb-item')].find(e=>(e.title||'')==='Réglages');x.click();return 1})()`);
await b.attendre(`!!document.querySelector('[data-act="exporter-toutes-fc"]')`, 8000);
await b.ev(`document.querySelector('[data-act="exporter-toutes-fc"]').scrollIntoView({block:'center'});1`); await b.dormir(400);
const carte = await b.rect(`document.querySelector('[data-act="exporter-toutes-fc"]').closest('.card')`);
await b.capture('reglages-carte', { x: carte.x, y: carte.y, width: carte.w, height: carte.h });
await b.toucher(`document.querySelector('[data-act="exporter-toutes-fc"]')`, 600);
b.v(new RegExp(`${nTout} cartes`).test(await b.texte('[data-export-flashcards] [data-compte]')), `Réglages : toutes les flashcards (${nTout})`);
const t0 = Date.now();
await b.lancerExport();
const zt = await b.recupererZip('toutes.zip');
verifierZip(zt, nTout, 'toutes les flashcards');
b.v(zt.nom === `medrevise-flashcards-toutes-${AUJ}.zip`, 'nom : medrevise-flashcards-toutes-AAAA-MM-JJ.zip', `${zt.nom} · ${Date.now() - t0} ms`);
await b.fermerFenetre(); await b.dormir(300);
b.v(JSON.stringify(await b.empreinteCartes()) === JSON.stringify(empAvant), 'aucune carte modifiée par ces 6 exports');
b.fin();
