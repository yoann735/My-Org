// 4) Deux appareils (A = ordinateur 9431, B = ordinateur 9434, profil neuf) par le faux Supabase — après t-modification.
//    B reçoit les notions, les fichiers et l'annotation de A (et inversement) ; hors ligne, B ouvre une notion déjà
//    synchronisée (fiche + exos) ; A supprime une notion (confirmation, putBackup) → elle disparaît aussi sur B.
import { appareil, gestes, dormir, sb } from './commun.mjs';
const A = await appareil('ordi'); const gA = gestes(A);
const B = await appareil('ordiB'); const gB = gestes(B);
await A.ouvrirApp(); await A.attendreSynchro();
await A.synchro(); await dormir(3000); // tout ce qui attend part (fichiers compris)
const nsA = await gA.notions();
const n1 = nsA.find((n) => n.nom === 'Équilibre acido-basique');
const nsFiche = 'exo:' + n1.fiche.id;

await B.ouvrirApp(); await B.attendreSynchro(40000);
B.ok(await gB.allerExos(), 'B : page Exos');
B.ok(await B.attendre(`document.querySelectorAll('.exo-carte').length === ${nsA.length}`, 20000), `B : les ${nsA.length} notions arrivent par la synchro`, (await gB.cartes()).join(' · '));
B.ok(await B.attendre(`document.querySelectorAll('.exo-carte .exo-apercu.image img').length === ${nsA.length}`, 30000), 'B : aperçus générés sur cet appareil (fichiers téléchargés)');
await B.capture('b-grille-synchro');
// annotation de A visible sur B
await gB.ouvrirNotion('Équilibre acido-basique');
await gB.ouvrirTuile('Fiche');
B.ok(await gB.attendrePdf(), 'B : la fiche s’ouvre dans le PdfReader');
B.ok(await B.attendre(`[...document.querySelectorAll('.note-box')].some((n) => /Annotation ordi /.test(n.innerText))`, 20000), 'B : l’annotation faite sur A est là (synchro vers l’autre appareil)');
// B annote → A la reçoit
const marqueB = 'Vu sur B ' + Date.now().toString(36);
await B.S(`for (const a of await S.getAll('annotations')) if (a.ficheId === ${JSON.stringify(nsFiche)} && /Vu sur B /.test(JSON.stringify(a.content || ''))) await S.remove('annotations', a.id); return 1`);
await gB.annoter(marqueB, 0.5, 0.5);
await gB.fermerPdf();
await B.synchro(); await dormir(2500);
await A.synchro(); await dormir(1500);
A.ok(await A.S(`return (await S.getAll('annotations')).some((a) => a.ficheId === ${JSON.stringify(nsFiche)} && JSON.stringify(a.content || '').includes(${JSON.stringify(marqueB)}))`), 'A : l’annotation faite sur B arrive');

// HORS LIGNE sur B : rechargement sans réseau, notion déjà synchronisée → fiche et exos disponibles
await gB.retourGrille();
await dormir(4000); // copie locale des fichiers (préchargement en tâche de fond)
await B.horsLigne(true);
await B.send('Page.reload'); await B.attendre(`document.readyState === 'complete'`, 20000);
await B.attendre(`!!document.querySelector('.sb-item')`, 30000); await dormir(1500);
B.ok(!(await B.ev(`navigator.onLine`)), 'B : hors ligne (cloud injoignable)');
B.ok(await gB.allerExos(), 'B hors ligne : page Exos');
B.ok(await B.attendre(`document.querySelectorAll('.exo-carte .exo-apercu.image img').length === ${nsA.length}`, 15000), 'B hors ligne : cartes et aperçus (en cache)');
await gB.ouvrirNotion('Équilibre acido-basique');
await gB.ouvrirTuile('Fiche');
B.ok(await gB.attendrePdf(), 'B hors ligne : la fiche PDF s’ouvre');
await gB.fermerPdf();
await gB.ouvrirTuile('Exercices 2'); // PDF
B.ok(await gB.attendrePdf(), 'B hors ligne : l’exo PDF s’ouvre');
await gB.fermerPdf();
await gB.ouvrirTuile('QCM');
B.ok(await B.attendre(`!!document.querySelector('.exo-html-frame')`, 8000) && !(await B.ev(`!!document.querySelector('.exo-html .exo-vide')`)), 'B hors ligne : l’exo HTML s’ouvre');
await B.capture('b-hors-ligne-html');
await B.clic(`document.querySelector('.exo-html-barre .icon-btn')`, 400);
await gB.retourGrille();
await B.horsLigne(false); await B.synchro();

// SUPPRESSION sur A
await gA.allerExos();
await A.attendre(`document.querySelectorAll('.exo-carte').length === ${nsA.length}`, 10000);
const bk0 = await A.S(`return (await S.getAll('backups')).length`);
await A.clic(`[...document.querySelectorAll('.exo-carte')].find((c) => c.innerText.includes('Calculs de doses')).querySelector('.cd-ic')`, 400);
A.ok(await A.ev(`[...document.querySelectorAll('.ctx-menu-item')].map((x) => x.innerText.trim()).join('|') === 'Modifier|Supprimer'`), 'menu ⋮ : Modifier, Supprimer');
await A.clic(`[...document.querySelectorAll('.ctx-menu-item')].find((x) => /Supprimer/.test(x.innerText))`, 500);
const txt = await A.ev(`(document.querySelector('.day-pop') || {}).innerText || ''`);
A.ok(/Supprimer « Calculs de doses » et ses 2 fichiers \?/.test(txt), 'confirmation « Supprimer <nom> et ses <N> fichiers ? »', txt.replace(/\s+/g, ' ').slice(0, 150));
await A.capture('a-confirmation-suppression');
await A.clic(`[...document.querySelectorAll('.day-pop button')].find((x) => /^Supprimer$/.test(x.innerText.trim()))`, 800);
const bk = await A.S(`const l = (await S.getAll('backups')).filter((x) => /^pre-delete-notion-exos-/.test(x.key)).sort((a, c) => a.when.localeCompare(c.when)).pop(); return JSON.stringify({ n: (await S.getAll('backups')).length, nom: l && l.data.notion.nom, fichiers: l && l.data.notion.exercices.length })`);
A.ok(JSON.parse(bk).n === bk0 + 1 && /Calculs de doses/.test(bk), 'putBackup avant la suppression (la notion entière)', bk);
A.ok(!(await gA.cartes()).includes('Calculs de doses') && !(await gA.notions()).some((n) => n.nom === 'Calculs de doses'), 'A : la notion disparaît');
await A.synchro(); await dormir(2000);
const cloud = await sb('/__etat');
const lignes = (cloud.rows || cloud.lignes || []).filter ? (cloud.rows || cloud.lignes || []) : [];
await B.synchro(); await dormir(1500);
await gB.allerExos();
B.ok(await B.attendre(`![...document.querySelectorAll('.exo-carte .lv-carte-titre')].some((e) => e.innerText.includes('Calculs de doses')) && document.querySelectorAll('.exo-carte').length === ${nsA.length - 1}`, 15000), 'B : la notion supprimée disparaît aussi après synchro');
await B.capture('b-apres-suppression');
const ea = A.fin(), eb = B.fin();
process.exitCode = ea + eb;
A.fermerWs(); B.fermerWs();
