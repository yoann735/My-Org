// Bibliothèque — tris « Dernière modification » / « Date d'ajout » (15/10). Base LOCALE du banc.
// Préalable : node seed-biblio.mjs. Argument : chemin d'un PDF à importer.
import { banc } from './commun.mjs';
const PDF = process.argv[2];
const b = await banc(1440, 900);
await b.c.send('Runtime.evaluate', { expression: `localStorage.removeItem('medrevise.biblio.tri')` });
await b.S(`for(const f of await S.getAll('fiches'))if(/^Neurologie/.test(f.titre))await S.remove('fiches',f.id);return 1`);
await b.biblio({ recharger: true });
const base = () => b.S(`const f=await S.getAll('fiches');const st=await S.getStats();return JSON.stringify({f:f.map(x=>[x.id,x.matiereId,x.dossierId||null,x.ordre??null,!!x.archive]).sort(),ouverts:st.treeOpenDossiers||[],sections:st.ordreSections||null})`);
const avant = await base();
const arbreAvant = await b.fiches();
await b.capture('tb-1-arbre-manuel');
b.ok(await b.ev(`document.querySelector('.lib-tri-bouton').innerText.trim()==='Trier'`), 'ordre manuel par défaut (bouton « Trier »)');

/* ---- DERNIÈRE MODIFICATION ---- */
await b.trier('Dernière modification');
let l = await b.fiches(), m = await b.metas();
b.ok(!(await b.ev(`!!document.querySelector('.lt-mat, .lt-sec, .lt-dos')`)), 'liste plate : plus de section, de matière ni de dossier');
b.ok(l.length === 12, '12 fiches (archivées et section archivée exclues, Rattrapage inclus)', l.length + ' : ' + l.join(' | '));
b.ok(!l.some((t) => /archivée/.test(t)), 'aucune fiche archivée');
b.ok(l.includes('Enzymologie') && l.includes('Métabolisme glucidique'), 'les fiches de la section Rattrapage y sont');
b.ok(m[0] === 'Modifiée il y a 2 h · Anatomie palpatoire' && l[0].startsWith('Membre supérieur'), 'en tête : la fiche surlignée il y a 2 h', m[0]);
const iMeta = l.indexOf('Métabolisme glucidique');
b.ok(m[iMeta] === 'Modifiée il y a 6 h · Biochimie', 'carte créée il y a 6 h et révisée il y a 1 h : comptée à sa création', m[iMeta]);
b.ok(m[l.indexOf('Psychologie du développement')] === 'Modifiée hier · Psychologie', 'annotation d’hier', m[l.indexOf('Psychologie du développement')]);
b.ok(m[l.indexOf('Théories de l’apprentissage')] === 'Modifiée il y a 4 j · Psychologie', 'texte du document (notes_doc) il y a 4 j');
b.ok(m[l.indexOf('Rachis et bassin')] === 'Modifiée le 3 oct. · Anatomie palpatoire', 'jamais modifiée : sa date d’ajout');
const fond = await b.ev(`getComputedStyle(document.querySelector('.lib-tri-matiere')).color + ' / ' + getComputedStyle(document.querySelector('.lib-tri-meta')).color`);
b.ok(fond.split(' / ')[0] !== fond.split(' / ')[1], 'matière en gris (plus clair que la date)', fond);
await b.capture('tb-2-modif');
// annoter une fiche du bas : elle remonte en tête
const cible = 'Membre inférieur — repères';
const rangAvant = l.indexOf(cible);
await b.clic(await b.pos(`[...document.querySelectorAll('.lib-plat-rangee')].find(e=>e.innerText.startsWith(${JSON.stringify(cible)}))`), { att: 3500 });
b.ok(await b.ev(`!!document.querySelector('.pdfr-scroll')`), 'fiche ouverte depuis la liste plate');
const pg = await b.rect(`[...document.querySelectorAll('.pdfr-textlayer span')][0].closest('.pdfr-page')`);
await b.clic(await b.bouton('Boîte'));
await b.clic([pg.x + pg.w * 0.5, pg.y + 260], { att: 800 }); await b.ecrire('Repère annoté');
await b.T.Escape(); await b.T.Escape(); await b.dormir(1800);
// la liste (rail replié) se rouvre sans fermer le cours : la fiche est déjà en tête
await b.clic(await b.pos(`document.querySelector('.lib-master .split-handle, .lib-split .split-handle, [class*=split-handle]')`, false), { att: 900 });
l = await b.fiches(); m = await b.metas();
b.ok(l[0].startsWith(cible) && m[0].startsWith('Modifiée à l’instant'), `annotée, elle remonte en tête (était ${rangAvant + 1}e)`, `${l[0]} — ${m[0]}`);
await b.capture('tb-3-modif-apres-annotation');
await b.fermerLecteur();

/* ---- DATE D'AJOUT ---- */
await b.trier('Date d’ajout');
l = await b.fiches(); m = await b.metas();
b.ok(l[l.length - 1].startsWith('Membre supérieur') && m[m.length - 1] === 'Ajoutée le 20 sept. · Anatomie palpatoire', 'la plus ancienne en dernier', m[m.length - 1]);
b.ok(l.indexOf('Membre inférieur — repères') < l.indexOf('Rachis et bassin'), 'deux ajouts le même jour : départagés à l’heure (identifiant)');
await b.capture('tb-4-ajout');
// importer un PDF (dépôt sur une ligne) : en tête
const p = await b.pos(`[...document.querySelectorAll('.lib-plat-rangee')].find(e=>e.innerText.includes('Enzymologie'))`, false);
const data = { items: [], files: [PDF], dragOperationsMask: 1 };
for (const type of ['dragEnter', 'dragOver', 'drop']) { await b.c.send('Input.dispatchDragEvent', { type, x: p[0], y: p[1], data }); await b.dormir(300); }
await b.dormir(1000);
await b.clic(await b.bouton('Importer'), { att: 2500 });
l = await b.fiches(); m = await b.metas();
b.ok(/^Neurologie/.test(l[0]) && m[0] === 'Ajoutée le 15 oct. · Biochimie', 'PDF importé : en tête, dans la matière de la ligne visée', `${l[0]} — ${m[0]}`);
await b.capture('tb-5-ajout-apres-import');

/* ---- MÉMORISATION ---- */
await b.biblio({ recharger: true });
b.ok(await b.ev(`document.querySelector('.lib-tri-bouton').innerText.trim()==='Date d’ajout' && localStorage.getItem('medrevise.biblio.tri')==='ajout'`), 'tri mémorisé par appareil (rechargement)');

/* ---- GRILLE et LISTE ---- */
const platAjout = await b.fiches();
await b.affichage('Grille');
b.ok(JSON.stringify(await b.fiches()) === JSON.stringify(platAjout) && !(await b.ev(`!!document.querySelector('.lv-section-titre')`)), 'grille : même ordre, sans regroupement');
await b.capture('tb-6-grille-ajout');
await b.trier('Dernière modification');
const grilleModif = await b.fiches();
await b.affichage('Liste');
b.ok(JSON.stringify(await b.fiches()) === JSON.stringify(grilleModif), 'liste : même ordre que la grille (dernière modification)');
b.ok(await b.ev(`document.querySelector('.lv-entete .lv-col-date').textContent.trim()==='Modifiée'`), 'liste : colonne « Modifiée »');
await b.capture('tb-7-liste-modif');

/* ---- RECHERCHE ---- */
const chercher = async (t) => { await b.ev(`(()=>{const i=document.querySelector('.lib-recherche input');const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(i,${JSON.stringify(t)});i.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`); await b.dormir(400); };
await chercher('reperes');
b.ok(JSON.stringify(await b.fiches()) === JSON.stringify(grilleModif.filter((x) => /repères/.test(x))), 'liste + modification : « reperes » (sans accent) → les 2 fiches, dans l’ordre du tri', (await b.fiches()).join(' | '));
await b.affichage('Arbre');
await b.trier('Date d’ajout');
b.ok((await b.fiches()).join('|') === 'Membre inférieur — repères|Membre supérieur — repères', 'arbre + ajout : mêmes 2 fiches, la plus récente d’abord', (await b.fiches()).join(' | '));
await b.trier('Ordre manuel');
await chercher('psycho');
const st0 = await b.S(`return JSON.stringify((await S.getStats()).treeOpenDossiers||[])`);
l = await b.fiches();
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
