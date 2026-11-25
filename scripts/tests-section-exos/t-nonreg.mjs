// 6) NON-RÉGRESSION (ordinateur A) : barre latérale (chaque entrée s'ouvre), lecteur d'un COURS et son onglet « Exos »
//    (panneau : QCM / Flashcards / Exercices / Feynman) inchangé, Bibliothèque, synchro « À jour », sauvegardes
//    (export local : store exo_notion ; copie quotidienne GitHub : lignes exo_notion + fichiers dans l'index du bucket).
import { appareil, gestes, fixtures, dormir, FAUX_SB } from './commun.mjs';
import fs from 'node:fs';
import { lireCloud } from '../../src/medrevise/sauvegarde/lecture.js';
import { construireExport } from '../../src/medrevise/sauvegarde/export.js';
const f = await fixtures();
const b = await appareil('ordi');
const g = gestes(b);
await b.ouvrirApp(); await b.attendreSynchro();

// barre latérale : entrées, ordre, chacune s'ouvre sans erreur
const entrees = await b.ev(`[...document.querySelectorAll('.sidebar .sb-nav .sb-item')].map((e) => e.title)`);
b.ok(entrees.join('|') === 'Accueil|Réviser|Apprentissage|Bibliothèque|Exos|Carnet d\'erreurs', 'barre latérale : entrées existantes inchangées, « Exos » après Bibliothèque', entrees.join(' · '));
for (const t of entrees) {
  await b.clic(`[...document.querySelectorAll('.sidebar .sb-nav .sb-item')].find((e) => e.title === ${JSON.stringify(t)})`, 900);
  const actif = await b.ev(`(document.querySelector('.sidebar .sb-item.active') || {}).title`);
  const vide = await b.ev(`document.querySelector('.main').innerText.trim().length < 5`);
  b.ok(actif === t && !vide, `« ${t} » s’ouvre (onglet actif, écran rendu)`);
}

// lecteur d'un COURS : le cours de test reçoit un PDF (données du banc) et une flashcard
await b.S(`const f = await S.getOne('fiches', 'f-exo-cours'); if (!f.pdfId) { const r = await fetch('data:application/pdf;base64,${fs.readFileSync(f('Exos-gaz-du-sang.pdf')).toString('base64')}'); const blob = new Blob([await r.arrayBuffer()], { type: 'application/pdf' }); const id = await S.putBlob(blob); await S.put('fiches', { ...f, pdfId: id, pdfName: 'cours-renal.pdf' }); }
  if (!(await S.getOne('questions', 'q-exo-banc'))) await S.put('questions', { id: 'q-exo-banc', ficheId: 'f-exo-cours', type: 'flashcard', recto: 'pH normal ?', verso: '7,40', createdAt: new Date().toISOString() }); return 1`);
await b.ev(`(window.dispatchEvent(new Event('focus')), 1)`); await b.attendreSynchro();
await b.clic(`[...document.querySelectorAll('.sidebar .sb-nav .sb-item')].find((e) => e.title === 'Bibliothèque')`, 900);
await b.ev(`(() => { const r = [...document.querySelectorAll('button')].find((x) => (x.title || '') === 'Revenir à la liste'); r && r.click(); return 1; })()`); await dormir(500);
const ouvert = await b.clic(`[...document.querySelectorAll('.lt-fiche > .lt-rangee')].find((e) => e.innerText.includes('Physiologie rénale'))`, 1200);
b.ok(ouvert && await b.attendre(`!!document.querySelector('.pdfr-page[data-cle="1"] canvas')`, 20000), 'Bibliothèque : le cours s’ouvre dans le lecteur');
const modes = await b.ev(`[...document.querySelectorAll('.pis [role="tab"], .pis button')].map((x) => x.innerText.trim()).filter(Boolean).slice(0, 12)`);
b.ok(modes.some((m) => /^Exercices|^Exos/.test(m)) && modes.some((m) => /Transcript|Trans/.test(m)) && modes.some((m) => /Notions/.test(m)), 'panneau du lecteur de cours : modes Exercices (« Exos ») · Transcript · Notes · Notions', modes.join(' · '));
await b.clic(`[...document.querySelectorAll('.pis button, .pis [role="tab"]')].find((x) => /^Exercices|^Exos/.test(x.innerText.trim()))`, 600);
const sous = await b.ev(`[...document.querySelectorAll('.pm-sous-btn')].map((x) => x.innerText.replace(/\\s+/g, ' ').trim())`);
b.ok(sous.length === 4 && sous.some((s) => /Flashcards?\s*1/.test(s)), 'onglet « Exos » du lecteur : QCM / Flashcards / Exercices / Feynman, la flashcard du cours y est', sous.join(' · '));
await b.capture('nonreg-lecteur-cours-onglet-exos');
await b.ev(`(() => { const r = [...document.querySelectorAll('button')].find((x) => (x.title || '') === 'Revenir à la liste'); r && r.click(); return 1; })()`); await dormir(600);

// synchro : « À jour » (empreintes locale et cloud égales, notions comprises)
await b.synchro();
b.ok(await b.ev(`document.documentElement.getAttribute('data-mr-synchro') === 'ajour'`), 'synchro : « À jour » (empreinte locale = cloud, store exo_notion compris)');
// sauvegarde locale (export JSON)
const exp = await b.ev(`(async () => { const E = await __imp('/src/medrevise/lib/backupExport.js'); const x = await E.buildBackup(); const o = x.stores ? x : (x.backup || x.data || x); return JSON.stringify({ n: (o.stores && o.stores.exo_notion || []).length }); })()`).catch((e) => JSON.stringify({ err: String(e).slice(0, 200) }));
const nbNotions = (await g.notions()).length;
b.ok(JSON.parse(exp).n === nbNotions, 'sauvegarde locale (export) : le store exo_notion est inclus', exp);
// copie quotidienne GitHub : même construction que /api/backup-daily, lue sur le faux cloud
const cloud = await lireCloud({ url: FAUX_SB, cle: 'cle-de-test' });
const { fichiers, manifeste } = construireExport({ ...cloud, jour: '2026-11-25' });
const records = fichiers.filter((x) => /^data\/records/.test(x.chemin)).map((x) => x.contenu).join('\n');
const index = (fichiers.find((x) => x.chemin === 'data/files-index.json') || {}).contenu || '';
const notions = await g.notions();
const ids = notions.flatMap((n) => [n.fiche, ...n.exercices].filter(Boolean).map((x) => x.fileId));
b.ok(notions.every((n) => records.includes(n.id)) && ids.every((id) => index.includes(id)), 'copie quotidienne GitHub : enregistrements exo_notion + fichiers des notions dans l’index du bucket', `${notions.length} notions, ${ids.length} fichiers, ${manifeste.fichiers.length} fichiers de copie`);
process.exitCode = b.fin();
b.fermerWs();
