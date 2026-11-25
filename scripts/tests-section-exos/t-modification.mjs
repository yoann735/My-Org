// 3) Modifier (ordinateur ou iPad : node t-modification.mjs ordi|ipad) — après t-creation.mjs.
//    Renommer, changer de cours, ajouter 2 exos, en réordonner, retirer un exo ANNOTÉ (confirmation avec le nombre
//    d'annotations ; putBackup ; fichier dans « Fichiers retirés » ; annotations intactes, Historique), le remettre ;
//    remplacer la fiche annotée (même confirmation).
import { appareil, gestes, fixtures, dormir } from './commun.mjs';
const f = await fixtures();
const type = process.argv[2] || 'ordi';
const b = await appareil(type);
const g = gestes(b);
await b.ouvrirApp(); await b.attendreSynchro();
b.ok(await g.allerExos(), 'page Exos');
await b.attendre(`document.querySelectorAll('.exo-carte, .exo-ligne').length >= 3`, 20000);
const nomAvant = (await g.notions()).find((n) => /Potentiel de membrane/.test(n.nom)).nom;
const nouveauNom = 'Potentiel de membrane et de repos';
const nb = { backups: async () => b.S(`return (await S.getAll('backups')).length`) };

// 1. renommer + changer de cours + ajouter 2 exos
b.ok(await g.ouvrirNotion(nomAvant), 'ouvrir « ' + nomAvant + ' »');
b.ok(await g.modifier(), 'feuille « Modifier »');
b.ok(await b.ev(`document.querySelector('.day-pop-head').innerText.includes('Modifier la notion')`), 'titre « Modifier la notion »');
await g.remplir({ nom: nouveauNom, cours: 'Physiologie rénale', exos: [f('Exos-nernst.pdf'), f('QCM-acido-basique.html')] });
let l = await g.lignes();
b.ok(l.length === 3 && /nernst/i.test(l[1]) && /QCM/.test(l[2]), 'ajout de 2 exos (en fin de liste)', l.join(' | '));
// réordonner : le QCM monte d'un cran (Nernst descend)
await b.clic(`${g.ligne('QCM')}.querySelector('[aria-label="Monter"]')`);
l = await g.lignes();
b.ok(/QCM/.test(l[1]) && /nernst/i.test(l[2]), 'réordonner (Monter / Descendre)', l.join(' | '));
// renommer un exo
await b.clic(`${g.ligne('QCM')}.querySelector('[aria-label="Renommer"]')`);
await b.ev(`(() => { const i = document.querySelector('.exo-f-renommer'); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(i, 'QCM de révision'); i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
await b.touche('Enter', 'Enter', 13);
l = await g.lignes();
b.ok(l.some((x) => /QCM de révision/.test(x)), 'renommer un fichier d’exercices', l.join(' | '));
await b.capture(type + '-feuille-modifier');
b.ok(await g.valider(), 'enregistrer');
let n2 = (await g.notions()).find((n) => n.nom === nouveauNom);
b.ok(n2 && n2.coursId === 'f-exo-cours' && n2.exercices.length === 3 && n2.exercices[1].nom === 'QCM de révision' && /nernst/i.test(n2.exercices[2].nom),
  'stockage : nom, cours, 3 exos dans le nouvel ordre', JSON.stringify(n2 && n2.exercices.map((e) => e.nom)));
b.ok(await b.ev(`document.querySelector('.exo-titre-notion').innerText === ${JSON.stringify(nouveauNom)} && /Physiologie rénale/.test(document.querySelector('.exo-sous').innerText)`), 'vue notion à jour (nom, cours)');

// 2. annoter l'exo Nernst (PDF), puis le retirer
const nernst = n2.exercices[2];
const nsN = 'exo:' + nernst.id;
await g.ouvrirTuile('nernst');
b.ok(await g.attendrePdf(), 'exo PDF ouvert dans le PdfReader');
await dormir(1200);
await g.annoter('Note Nernst ' + type, 0.5, 0.12);
await g.annoter('Deuxième note ' + type, 0.5, 0.24);
const annN = await b.S(`return (await S.getAll('annotations')).filter((a) => a.ficheId === ${JSON.stringify(nsN)}).length`);
b.ok(annN === 2, 'exo annoté (2 boîtes)', String(annN));
await g.fermerPdf();
const bk0 = await nb.backups();
await g.modifier();
await b.clic(`${g.ligne('nernst')}.querySelector('[aria-label="Retirer"]')`, 900);
const conf = await b.ev(`(() => { const p = [...document.querySelectorAll('.day-pop')].pop(); return p ? p.innerText : null; })()`);
b.ok(/2 annotations/.test(conf || '') && /Retirer/.test(conf || ''), 'retirer un fichier annoté : confirmation avec le nombre d’annotations', (conf || '').replace(/\s+/g, ' ').slice(0, 220));
await b.capture(type + '-confirmation-retrait');
await b.clic(`[...[...document.querySelectorAll('.day-pop')].pop().querySelectorAll('button')].find((x) => /^Retirer$/.test(x.innerText.trim()))`, 400);
l = await g.lignes();
b.ok(l.length === 2 && !l.some((x) => /nernst/i.test(x)), 'fichier retiré de la liste', l.join(' | '));
b.ok(await g.valider(), 'enregistrer');
n2 = (await g.notions()).find((n) => n.nom === nouveauNom);
const bk1 = await nb.backups();
const dernierBk = await b.S(`const l = (await S.getAll('backups')).filter((x) => /^pre-retrait-exos-/.test(x.key)).sort((a, c) => a.when.localeCompare(c.when)).pop(); return JSON.stringify({ key: l.key, fichiers: l.data.fichiers.map((x) => x.nom), annotations: l.data.annotations.length })`);
const annApres = await b.S(`return (await S.getAll('annotations')).filter((a) => a.ficheId === ${JSON.stringify(nsN)}).length`);
const versRetrait = await b.ev(`(async () => { const H = await __imp('/src/medrevise/lib/historiqueDoc.js'); return (await H.listerVersions(${JSON.stringify(nsN)})).some((v) => /retiré de la notion/.test(v.raison)); })()`);
b.ok(bk1 === bk0 + 1 && /nernst/i.test(dernierBk) && /"annotations":2/.test(dernierBk), 'putBackup AVANT le retrait (fichier + ses 2 annotations)', dernierBk);
b.ok(n2.exercices.length === 2 && n2.fichiersRetires.some((r) => r.id === nernst.id && r.raison === 'retiré') && annApres === 2 && versRetrait,
  'récupérable : dans « Fichiers retirés », annotations intactes, version « Fichier retiré… » dans l’Historique');
// 3. le remettre : les annotations reviennent avec lui
await g.modifier();
b.ok(await b.ev(`!!document.querySelector('[data-retire]')`), 'feuille : section « Fichiers retirés »');
await b.capture(type + '-fichiers-retires');
await b.clic(`[...document.querySelectorAll('[data-retire] button')].find((x) => /Remettre/.test(x.innerText))`, 400);
await g.valider();
n2 = (await g.notions()).find((n) => n.nom === nouveauNom);
b.ok(n2.exercices.some((e) => e.id === nernst.id) && !n2.fichiersRetires.some((r) => r.id === nernst.id), '« Remettre » : le fichier revient dans la notion');
await g.ouvrirTuile('nernst'); await g.attendrePdf();
b.ok(await b.attendre(`[...document.querySelectorAll('.note-box')].some((n) => n.innerText.includes('Note Nernst'))`, 15000), 'ses annotations sont toujours là');
await g.fermerPdf();
await g.retourGrille();

// 4. remplacer la fiche annotée de la notion 1 (annotée par t-lecteurs) : confirmation, ancienne fiche récupérable
const n1 = (await g.notions()).find((n) => n.nom === 'Équilibre acido-basique');
const annF = await b.S(`return (await S.getAll('annotations')).filter((a) => a.ficheId === ${JSON.stringify('exo:' + n1.fiche.id)}).length`);
await g.ouvrirNotion('Équilibre acido-basique');
await g.modifier();
await b.fichiers('input[data-champ="fiche"]', [f('Fiche-acido-basique-v2.pdf')]);
await dormir(600);
const conf2 = await b.ev(`(() => { const p = [...document.querySelectorAll('.day-pop')].pop(); return p ? p.innerText : null; })()`);
b.ok(annF > 0 && new RegExp(annF + ' annotation').test(conf2 || '') && /Remplacer/.test(conf2 || ''), 'remplacer une fiche annotée : confirmation avec le nombre d’annotations', (conf2 || '').replace(/\s+/g, ' ').slice(0, 160));
await b.clic(`[...[...document.querySelectorAll('.day-pop')].pop().querySelectorAll('button')].find((x) => /^Remplacer$/.test(x.innerText.trim()))`, 400);
await g.valider();
const n1b = (await g.notions()).find((n) => n.nom === 'Équilibre acido-basique');
b.ok(n1b.fiche.id !== n1.fiche.id && /v2/.test(n1b.fiche.nom) && n1b.fichiersRetires.some((r) => r.id === n1.fiche.id && r.raison === 'remplacé' && r.role === 'fiche'),
  'nouvelle fiche en place ; l’ancienne dans « Fichiers retirés » (remplacé), ses annotations intactes', n1b.fiche.nom);
// on remet l'ancienne fiche annotée (la v2 part à son tour dans les retirés) pour les tests suivants
await g.modifier();
await b.clic(`[...document.querySelectorAll('[data-retire] button')].find((x) => /Remettre/.test(x.innerText))`, 600);
const conf3 = await b.ev(`(() => { const p = [...document.querySelectorAll('.day-pop')]; return p.length > 1; })()`);
if (conf3) await b.clic(`[...[...document.querySelectorAll('.day-pop')].pop().querySelectorAll('button')].find((x) => /^Remplacer$/.test(x.innerText.trim()))`, 400);
await g.valider();
b.ok((await g.notions()).find((n) => n.nom === 'Équilibre acido-basique').fiche.id === n1.fiche.id, 'remettre l’ancienne fiche (« Remettre ») : elle reprend sa place');
await g.retourGrille();
await b.synchro(); await dormir(2000);
process.exitCode = b.fin();
b.fermerWs();
