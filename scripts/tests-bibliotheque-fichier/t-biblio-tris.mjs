// Bibliothèque — tris « Dernière modification » / « Date d'ajout ». Base LOCALE du banc.
// (17/10) Les tris GARDENT l'arbre : seules les fiches sont réordonnées dans chaque dossier / matière,
// la date est sous chaque fiche. Préalable : node seed-biblio.mjs. Argument : chemin d'un PDF à importer.
import { banc } from './commun.mjs';
const PDF = process.argv[2];
const b = await banc(1440, 900);
await b.c.send('Runtime.evaluate', { expression: `localStorage.removeItem('medrevise.biblio.tri')` });
await b.S(`for(const f of await S.getAll('fiches'))if(/^Neurologie/.test(f.titre))await S.remove('fiches',f.id);return 1`);
await b.biblio({ recharger: true });
const base = () => b.S(`const f=await S.getAll('fiches');const st=await S.getStats();return JSON.stringify({f:f.map(x=>[x.id,x.matiereId,x.dossierId||null,x.ordre??null,!!x.archive]).sort(),ouverts:st.treeOpenDossiers||[],sections:st.ordreSections||null})`);
const structure = () => b.ev(`[...document.querySelectorAll('.lib-tree .lt-sec, .lib-tree .lt-mat, .lib-tree .lt-dos')].map(e=>(e.querySelector('.lt-nom')||{}).textContent+':'+((e.querySelector('.lt-compte')||{}).textContent||'')).join('|')`);
const avant = await base();
const arbreAvant = await b.fiches();
const structAvant = await structure();
await b.capture('tb-1-arbre-manuel');
b.ok(await b.ev(`!document.querySelector('.lib-barre-tri').classList.contains('actif') && document.querySelector('.lib-barre-tri-lbl').textContent==='Ordre manuel' && !document.querySelector('.lt-date')`), 'ordre manuel par défaut : aucune date sous les fiches');

/* ---- DERNIÈRE MODIFICATION ---- */
await b.trier('Dernière modification');
let d = await b.dates();
b.ok(await structure() === structAvant, 'l’arbre reste : sections, matières, dossiers et compteurs identiques');
b.ok(Object.keys(d).length === arbreAvant.length && Object.values(d).every((x) => x), 'une date sous chaque fiche affichée', `${Object.keys(d).length} fiches`);
b.ok(!Object.keys(d).some((t) => /archivée/.test(t)), 'aucune fiche archivée');
b.ok(d['Membre supérieur — repères'] === 'il y a 2 h', 'fiche surlignée il y a 2 h : « il y a 2 h »', d['Membre supérieur — repères']);
b.ok(d['Métabolisme glucidique'] === 'il y a 6 h', 'carte créée il y a 6 h et révisée il y a 1 h : comptée à sa création', d['Métabolisme glucidique']);
b.ok(d['Psychologie du développement'] === 'hier', 'annotation d’hier', d['Psychologie du développement']);
// les fiches du jeu de test (les autres fiches du banc ont pu être touchées par d'autres suites)
const JEU_AP = ['Membre supérieur — repères', 'Membre inférieur — repères', 'Rachis et bassin'];
const ap = (await b.seauDe('Membre supérieur — repères')).filter((t) => JEU_AP.includes(t));
b.ok(ap.join('|') === 'Membre supérieur — repères|Membre inférieur — repères|Rachis et bassin', 'Anatomie palpatoire : la plus récemment modifiée en tête de SA matière (fiches du jeu)', ap.join(' | '));
// fiches d'un dossier replié : l'arbre garde ses pliages → la recherche les déplie (sans le mémoriser)
const chercher0 = async (t) => { await b.ev(`(()=>{const i=document.querySelector('.lib-barre input');const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(i,${JSON.stringify('')}+${JSON.stringify(t)});i.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`); await b.dormir(400); };
await chercher0('psycho');
const dPsy = await b.dates();
b.ok(dPsy['Théories de l’apprentissage'] === 'il y a 4 j', 'texte du document (notes_doc) il y a 4 j', dPsy['Théories de l’apprentissage']);
b.ok((await b.seauDe('Théories de l’apprentissage')).length === 1 && (await b.seauDe('Attachement (Bowlby)')).length === 1, 'les fiches restent dans leur dossier / chapitre');
await chercher0('');
const coul = await b.ev(`getComputedStyle(document.querySelector('.lt-date')).color + ' / ' + getComputedStyle(document.querySelector('.lt-fiche .lt-nom')).color`);
b.ok(coul.split(' / ')[0] !== coul.split(' / ')[1], 'date en gris, plus discrète que le titre', coul);
const dRachis = d['Rachis et bassin'];
await b.capture('tb-2-modif');
// annoter une fiche du bas de sa matière : elle remonte en tête DE SA MATIÈRE
const cible = 'Membre inférieur — repères';
const rangAvant = ap.indexOf(cible);
await b.clic(await b.pos(`[...document.querySelectorAll('.lt-fiche .lt-rangee')].find(e=>e.querySelector('.lt-nom').firstChild.textContent.trim()===${JSON.stringify(cible)})`), { att: 3500 });
b.ok(await b.ev(`!!document.querySelector('.pdfr-scroll')`), 'fiche ouverte depuis l’arbre trié');
const pg = await b.rect(`[...document.querySelectorAll('.pdfr-textlayer span')][0].closest('.pdfr-page')`);
await b.clic(await b.bouton('Boîte'));
await b.clic([pg.x + pg.w * 0.5, pg.y + 260], { att: 800 }); await b.ecrire('Repère annoté');
await b.T.Escape(); await b.T.Escape(); await b.dormir(1800);
await b.clic(await b.pos(`document.querySelector('.lib-master .split-handle, .lib-split .split-handle, [class*=split-handle]')`, false), { att: 900 });
const ap2 = (await b.seauDe(cible)).filter((t) => JEU_AP.includes(t)); d = await b.dates();
b.ok(ap2[0] === cible && d[cible] === 'à l’instant', `annotée, elle remonte en tête de sa matière (était ${rangAvant + 1}e)`, `${ap2.join(' | ')} — ${d[cible]}`);
await b.capture('tb-3-modif-apres-annotation');
await b.fermerLecteur();

/* ---- DATE D'AJOUT ---- */
await b.trier('Date d’ajout');
d = await b.dates();
const ap3 = (await b.seauDe('Membre supérieur — repères')).filter((t) => JEU_AP.includes(t));
b.ok(ap3[ap3.length - 1] === 'Membre supérieur — repères' && /^\d{1,2} \S+$/.test(d['Membre supérieur — repères']), 'la plus ancienne en dernier dans sa matière, « 22 sept. » sous la fiche', `${ap3.join(' | ')} — ${d['Membre supérieur — repères']}`);
b.ok(dRachis === d['Rachis et bassin'], 'jamais modifiée : « modifiée » à sa date d’ajout', `${dRachis} / ${d['Rachis et bassin']}`);
b.ok(ap3.indexOf('Membre inférieur — repères') < ap3.indexOf('Rachis et bassin'), 'deux ajouts le même jour : départagés à l’heure (identifiant)');
b.ok(await structure() === structAvant, 'Date d’ajout : arbre identique');
await b.capture('tb-4-ajout');
// importer un PDF (dépôt sur une fiche de l'arbre) : en tête de la matière visée
const p = await b.pos(`[...document.querySelectorAll('.lt-fiche .lt-rangee')].find(e=>e.innerText.includes('Enzymologie'))`);
const data = { items: [], files: [PDF], dragOperationsMask: 1 };
for (const type of ['dragEnter', 'dragOver', 'drop']) { await b.c.send('Input.dispatchDragEvent', { type, x: p[0], y: p[1], data }); await b.dormir(300); }
await b.dormir(1000);
await b.clic(await b.bouton('Importer'), { att: 2500 });
const bio = await b.seauDe('Enzymologie'); d = await b.dates();
const neuro = bio.find((t) => /^Neurologie/.test(t));
const auj = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
b.ok(neuro && bio[0] === neuro && d[neuro] === auj, 'PDF importé : en tête de Biochimie (matière de la ligne visée), daté d’aujourd’hui', `${bio.join(' | ')} — ${neuro && d[neuro]}`);
await b.capture('tb-5-ajout-apres-import');

/* ---- MÉMORISATION ---- */
await b.biblio({ recharger: true });
b.ok(await b.ev(`document.querySelector('.lib-barre-tri-lbl').textContent==='Date d’ajout' && localStorage.getItem('medrevise.biblio.tri')==='ajout' && !!document.querySelector('.lt-date')`), 'tri mémorisé par appareil (rechargement)');

/* ---- GRILLE et LISTE ---- */
await b.affichage('Grille');
const grille = await b.ev(`[...document.querySelectorAll('.lv-matiere')].map(m=>[m.querySelector('.lv-matiere-titre').textContent,[...m.querySelectorAll('.lv-carte-titre')].map(e=>e.innerText.replace(/\\s*fiche$/,'').trim())])`);
const grilleAp = (grille.find((g) => /Anatomie/.test(g[0])) || [null, []])[1];
b.ok(await b.ev(`!!document.querySelector('.lv-section-titre') && !!document.querySelector('.lib-vue-pleine > .lib-barre')`) && grilleAp[grilleAp.length - 1] === 'Membre supérieur — repères', 'grille : sections et matières gardées, cartes triées dans chaque matière, même rangée en tête', grilleAp.join(' | '));
await b.capture('tb-6-grille-ajout');
await b.trier('Dernière modification');
await b.affichage('Liste');
b.ok(await b.ev(`document.querySelector('.lv-entete .lv-col-date').textContent.trim()==='Modifiée'`), 'liste : colonne « Modifiée » (tableau trié par date)');
const liste = await b.fiches();
b.ok(/^Neurologie/.test(liste[0]) && liste[1] === cible, 'liste : le PDF importé puis la fiche annotée juste avant, en tête', liste.slice(0, 3).join(' | '));
await b.capture('tb-7-liste-modif');

/* ---- RECHERCHE ---- */
const chercher = async (t) => { await b.ev(`(()=>{const i=document.querySelector('.lib-barre input');const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(i,${JSON.stringify(t)});i.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`); await b.dormir(400); };
await chercher('reperes');
b.ok((await b.fiches()).join('|') === 'Membre inférieur — repères|Membre supérieur — repères', 'liste + modification : « reperes » (sans accent) → les 2 fiches, dans l’ordre du tri', (await b.fiches()).join(' | '));
await b.affichage('Arbre');
await b.trier('Date d’ajout');
b.ok((await b.fiches()).join('|') === 'Membre inférieur — repères|Membre supérieur — repères' && await b.ev(`!!document.querySelector('.lt-mat')`), 'arbre + ajout : mêmes 2 fiches, la plus récente d’abord, sous leur matière', (await b.fiches()).join(' | '));
await b.trier('Ordre manuel');
await chercher('psycho');
const st0 = await b.S(`return JSON.stringify((await S.getStats()).treeOpenDossiers||[])`);
const l = await b.fiches();
b.ok(l.length === 3 && l.includes('Théories de l’apprentissage'), 'arbre manuel + « psycho » (matière) : 3 fiches, dossiers dépliés pour l’affichage', l.join(' | '));
b.ok(!(await b.ev(`[...document.querySelectorAll('.lt-mat .lt-nom')].some(e=>/Anatomie/.test(e.innerText))`)), 'les matières sans résultat sont masquées');
await b.capture('tb-8-recherche-arbre');
await chercher('zzzz');
b.ok(await b.ev(`document.body.innerText.includes('Aucune fiche ne correspond à « zzzz »')`), 'aucun résultat : message');
await chercher('');
b.ok((await b.S(`return JSON.stringify((await S.getStats()).treeOpenDossiers||[])`)) === st0, 'le dépliage de la recherche n’est pas mémorisé');

/* ---- RETOUR À L'ORDRE MANUEL : arborescence intacte ---- */
const apres = JSON.parse(await base()), av = JSON.parse(avant);
const neuf = apres.f.filter((x) => !av.f.some((y) => y[0] === x[0]));
const sansNeufs = JSON.stringify({ ...apres, f: apres.f.filter((x) => av.f.some((y) => y[0] === x[0])) });
// l'import (pas le tri) range le PDF dans Biochimie : seul l'ordre de CETTE matière peut bouger
const horsBio = (o) => JSON.stringify({ ...o, f: o.f.filter((x) => x[1] !== 'mat-tb-bio') });
b.ok(horsBio(JSON.parse(sansNeufs)) === horsBio(av) && JSON.stringify(apres.ouverts) === JSON.stringify(av.ouverts), 'aucun tri n’a écrit : matières, dossiers, ordres et dépliage identiques', neuf.length + ' fiche importée');
b.ok(JSON.stringify((await b.fiches()).filter((t) => !/^Neurologie/.test(t))) === JSON.stringify(arbreAvant), 'ordre manuel : l’arbre affiché est le même qu’avant', (await b.fiches()).join(' | '));
await b.capture('tb-9-retour-manuel');
b.ok(!b.erreurs.length, 'aucune erreur dans la page', b.erreurs.join(' / '));
// ménage du banc : la fiche importée par le test
await b.S(`for(const f of await S.getAll('fiches'))if(/^Neurologie/.test(f.titre))await S.remove('fiches',f.id);return 1`);
process.exit(0);
