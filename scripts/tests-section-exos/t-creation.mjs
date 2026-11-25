// 1) Ordinateur A : accès par la barre latérale, 3 notions (cours / sans cours / sans fiche), grille alignée, aperçus,
//    filtre, tri, grille ⇄ liste. Données de test : un cours « Physiologie rénale » semé dans la base locale du banc.
import { appareil, gestes, fixtures, dormir } from './commun.mjs';
const f = await fixtures();
const type = process.argv[2] || 'ordi';
const b = await appareil(type);
const g = gestes(b);
await b.ouvrirApp();
await b.attendreSynchro();
// cours de test (section › matière › fiche) — seulement s'il n'existe pas
await b.S(`if (!(await S.getOne('fiches', 'f-exo-cours'))) {
  await S.put('sources', { id: 's-exo-banc', nom: 'Banc Exos', rappelsJ: false, archive: false, icon: 'folder', tint: '#2BA89A' });
  await S.put('matieres', { id: 'm-exo-banc', sourceId: 's-exo-banc', nom: 'Physiologie', couleur: '#E0805A', icon: 'book' });
  await S.put('fiches', { id: 'f-exo-cours', matiereId: 'm-exo-banc', titre: 'Physiologie rénale', type: 'cours', ordre: 0, dateImport: '2026-11-25' });
} return 1`);
await b.ev(`(window.dispatchEvent(new Event('focus')), 1)`); await b.attendreSynchro();

b.ok(await b.ev(`!!([...document.querySelectorAll('.sb-item')].find((e) => e.title === 'Exos' && e.querySelector('.sb-icon svg')))`), 'barre latérale : entrée « Exos » avec icône et infobulle');
b.ok(await g.allerExos(), 'clic sur « Exos » : la page s’ouvre');
const entete = await b.ev(`(() => { const t = document.querySelector('.exo-topbar'); return { titre: t.querySelector('h1').innerText, boutons: [...t.querySelectorAll('button')].map((x) => x.title || x.innerText) }; })()`);
b.ok(entete.titre === 'Exos' && entete.boutons.some((x) => /Filtrer/.test(x)) && entete.boutons.includes('Grille') && entete.boutons.includes('Liste') && entete.boutons.some((x) => /^Trier/.test(x)) && entete.boutons.some((x) => /Créer une notion/.test(x)),
  'en-tête : titre « Exos », filtre, grille / liste, tri, « Nouvelle notion »', entete.boutons.join(' · '));
const existantes = await g.notions();
if (existantes.length) await b.N(`for (const n of await N.lireNotions()) await S.remove('exo_notion', n.id); return 1`); // banc rejoué : on repart de zéro
await dormir(500);

// notion 1 : rattachée au cours, fiche PDF + QCM HTML + exos PDF
await g.nouvelle();
await b.capture(type + '-feuille-vide');
await g.valider(); // nom vide : refusé
b.ok(await b.ev(`!!document.querySelector('[data-feuille="notion"]') && document.querySelector('[data-feuille="notion"] button[type="submit"]').disabled`), 'nom obligatoire : « Créer » reste grisé tant que le nom est vide');
await g.remplir({ nom: 'Équilibre acido-basique', cours: 'Physiologie rénale', fiche: f('Fiche-acido-basique.pdf'), exos: [f('QCM-acido-basique.html'), f('Exos-gaz-du-sang.pdf')] });
await b.capture(type + '-feuille-remplie');
b.ok(await g.valider(), 'notion 1 créée (cours, fiche PDF, 2 fichiers d’exercices)');
b.ok(await b.attendre(`!!document.querySelector('.exo-tuiles')`, 4000), 'après création : la vue de la notion s’ouvre');
await g.retourGrille();
// notion 2 : sans cours
await g.nouvelle();
await g.remplir({ nom: 'Potentiel de membrane', fiche: f('Fiche-potentiel-membrane.pdf'), exos: [f('Exos-goldman.html')] });
b.ok(await g.valider(), 'notion 2 créée (sans cours)');
await g.retourGrille();
// notion 3 : sans fiche
await g.nouvelle();
await g.remplir({ nom: 'Calculs de doses', exos: [f('Exos-calculs-doses.pdf'), f('Exo-piege.html')] });
b.ok(await g.valider(), 'notion 3 créée (sans fiche)');
await g.retourGrille();

const ns = await g.notions();
const n1 = ns.find((n) => n.nom === 'Équilibre acido-basique'), n2 = ns.find((n) => n.nom === 'Potentiel de membrane'), n3 = ns.find((n) => n.nom === 'Calculs de doses');
b.ok(ns.length === 3 && n1 && n1.coursId === 'f-exo-cours' && n1.fiche && n1.fiche.type === 'pdf' && n1.exercices.map((e) => e.type).join() === 'html,pdf'
  && n2 && !n2.coursId && n3 && !n3.fiche && n3.exercices.length === 2 && /^b/.test(n1.fiche.fileId),
  'stockage : 3 enregistrements « exo_notion » (cours, fiche, exercices ordonnés, fichiers dans le canal des blobs)', JSON.stringify(ns.map((n) => ({ nom: n.nom, cours: n.coursId, fiche: !!n.fiche, exos: n.exercices.map((e) => e.type + ':' + e.nom) }))));
b.ok(n1.exercices[0].nom === 'QCM acido basique' && n1.exercices[1].nom === 'Exos gaz du sang', 'nom de fichier lisible', n1.exercices.map((e) => e.nom).join(' | '));

// grille : 3 cartes de même largeur, aperçus
b.ok(await b.attendre(`document.querySelectorAll('.exo-carte .exo-apercu.image img').length === 3`, 20000), 'aperçus : 1ʳᵉ page de la fiche (notions 1, 2) et du 1ᵉʳ PDF d’exercices (notion 3)');
const larg = await b.ev(`[...document.querySelectorAll('.exo-carte')].map((c) => Math.round(c.getBoundingClientRect().width))`);
const hauts = await b.ev(`[...document.querySelectorAll('.exo-carte')].map((c) => Math.round(c.getBoundingClientRect().top))`);
b.ok(larg.length === 3 && new Set(larg).size === 1 && new Set(hauts).size === 1, 'grille alignée : même largeur, même ligne', larg.join(', '));
const carte1 = await b.ev(`(() => { const c = [...document.querySelectorAll('.exo-carte')].find((x) => x.innerText.includes('Équilibre')); return { lieu: c.querySelector('.lv-carte-lieu').innerText, point: !!c.querySelector('.lv-carte-lieu .exo-point'), pied: c.querySelector('.lv-carte-pied').innerText, menu: !!c.querySelector('.cd-ic[title^="Autres actions"]') }; })()`);
b.ok(carte1.point && /Physiologie rénale/.test(carte1.lieu) && /Aujourd/.test(carte1.pied) && carte1.menu, 'carte : pastille couleur du cours, nom, date de modification, menu ⋮', JSON.stringify(carte1));
await b.capture(type + '-grille');

// tri A → Z puis récents
const ordreRecents = await g.cartes();
b.ok(ordreRecents[0] === 'Calculs de doses', 'tri par défaut : date de modification (la plus récente d’abord)', ordreRecents.join(' · '));
await b.clic(`[...document.querySelectorAll('.exo-actions button')].find((x) => /^Trier/.test(x.title))`);
await b.clic(`[...document.querySelectorAll('.ctx-menu-item')].find((x) => /A → Z/.test(x.innerText))`);
b.ok((await g.cartes()).join('|') === 'Calculs de doses|Équilibre acido-basique|Potentiel de membrane', 'tri A → Z', (await g.cartes()).join(' · '));
// filtre par cours
await b.clic(`document.querySelector('.exo-filtre')`);
const opts = await b.ev(`[...document.querySelectorAll('.ctx-menu-item')].map((x) => x.innerText.trim())`);
await b.clic(`[...document.querySelectorAll('.ctx-menu-item')].find((x) => /Physiologie rénale/.test(x.innerText))`);
b.ok((await g.cartes()).join('|') === 'Équilibre acido-basique', 'filtre « Physiologie rénale » : seule la notion rattachée', opts.join(' · '));
await b.capture(type + '-filtre');
await b.clic(`document.querySelector('.exo-filtre')`);
await b.clic(`[...document.querySelectorAll('.ctx-menu-item')].find((x) => /Tous/.test(x.innerText))`);
b.ok((await g.cartes()).length === 3, 'filtre « Tous » : les 3 notions');
// liste
await b.clic(`document.querySelector('.exo-actions [aria-label="Liste"]')`);
b.ok(await b.ev(`document.querySelectorAll('.exo-ligne').length === 3 && !document.querySelector('.exo-grille')`), 'affichage liste');
await b.capture(type + '-liste');
await b.clic(`document.querySelector('.exo-actions [aria-label="Grille"]')`);
await b.clic(`[...document.querySelectorAll('.exo-actions button')].find((x) => /^Trier/.test(x.title))`);
await b.clic(`[...document.querySelectorAll('.ctx-menu-item')].find((x) => /modification/.test(x.innerText))`);
// vue d'une notion
await g.ouvrirNotion('Équilibre acido-basique');
const tuiles = await b.ev(`[...document.querySelectorAll('.exo-tuile[data-fichier]')].map((t) => t.querySelector('.exo-tuile-lib').innerText + ' / ' + t.querySelector('.exo-tuile-nom').innerText)`);
b.ok(tuiles.length === 3 && /^Fiche/.test(tuiles[0]) && /^Exercices 1/.test(tuiles[1]) && /^Exercices 2/.test(tuiles[2]), 'vue notion : tuiles « Fiche », « Exercices 1 », « Exercices 2 » (noms lisibles)', tuiles.join(' | '));
b.ok(await b.ev(`/Physiologie rénale/.test(document.querySelector('.exo-sous').innerText) && !!document.querySelector('.exo-tete .icon-btn[title^="Retour"]')`), 'vue notion : nom, cours, bouton retour');
await b.capture(type + '-notion');
await g.retourGrille();
b.ok(await b.ev(`!!document.querySelector('.exo-grille')`), 'retour vers la grille');
// synchro : les 3 notions et leurs fichiers partent au faux cloud
await b.synchro(); await dormir(2500);
process.exitCode = b.fin();
b.fermerWs();
