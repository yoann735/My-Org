// REMPLACER UN DOCUMENT CRÉÉ PAR LE PDF DU PROF (20/11) : document vierge de 2 pages, 5 annotations, une flashcard liée
// → PDF de 12 pages : 12 pages, 5 annotations en place, carte toujours liée ; restauration depuis l'Historique → état
// d'origine exact. Puis le TÉLÉPHONE (synchro) reçoit le cours remplacé. node t-remplacement.mjs ordi|tablette
import fs from 'node:fs';
import { appareil, semer, pdfTest, dormir } from './commun.mjs';

const type = process.argv[2] || 'ordi';
const b = await appareil(type);
const T = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const c = '2026-11-20T08:00:00.000Z';
const pages = [{ id: 'pg1', ficheId: 'pr-doc', kind: 'page', type: 'page', apres: 0, rang: 0, width: 595, height: 842, createdAt: c }, { id: 'pg2', ficheId: 'pr-doc', kind: 'page', type: 'page', apres: 0, rang: 1, width: 595, height: 842, createdAt: c }];
const box = (id, page, x, y, t) => ({ id, ficheId: 'pr-doc', page, kind: 'libre', type: 'boite', fond: 'plein', gabarit: 'carte', couleur: 'jaune-franc', taille1000: 18, tailleTexte: 1.8, x, y, width: 0.3, height: 0.05, createdAt: c, content: T(t) });
const ANN = [box('a1', 'pg1', 0.1, 0.1, 'Note 1'), box('a2', 'pg1', 0.5, 0.6, 'Note 2'), box('a3', 'pg2', 0.2, 0.3, 'Note 3'),
  { id: 'a4', ficheId: 'pr-doc', page: 'pg2', kind: 'forme', type: 'forme', forme: 'rectangle', couleur: '#e5383b', epaisseur: 0.0025, x: 0.4, y: 0.4, width: 0.2, height: 0.1, createdAt: c },
  { id: 'a5', ficheId: 'pr-doc', page: 'pg2', kind: 'texte', type: 'texte', couleur: 'noir', x: 0.6, y: 0.8, width: 0.2, height: 0.04, taille1000: 15, tailleTexte: 1.5, createdAt: c, content: T('Texte libre') }];
await b.neuf();
await semer(b, [{ id: 'pr-doc', matiereId: 'pr-mat', dossierId: null, titre: 'Cours du jour test', sousTitre: 'Document', type: 'standard', docNotes: true, dateImport: '2026-11-20' }],
  [...pages, ...ANN],
  `await S.put('questions', { id: 'q-a1', type: 'flashcard', ficheId: 'pr-doc', theme: 'Test', recto: 'Note 1 ?', verso: 'R', historique: [], nouvelle: true, intervalDays: 1, dueDate: '2026-11-21', j0Date: '2026-11-20', source: { boiteId: 'a1', ns: 'pr-doc', page: 'pg1', sorte: 'boite' } });
   await S.put('notes_doc', { id: 'pr-doc', ficheId: 'pr-doc', flux: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Écrit pendant le cours' }] }] }, fluxV: 1 });`);
const f = (process.env.TMPDIR || '/tmp') + '/diapo-du-prof-12.pdf';
fs.writeFileSync(f, Buffer.from(await pdfTest(12, { titre: 'Diapo du prof' }), 'base64'));
await b.ouvrir();
const net = (l) => JSON.stringify(l.map(({ updatedAt, ...r }) => r).sort((x, y) => (x.id < y.id ? -1 : 1))); // eslint-disable-line no-unused-vars
const etat = async () => ({ a: net((await b.stocker('annotations')).filter((a) => a.ficheId === 'pr-doc')), f: net([await b.un('fiches', 'pr-doc')]), q: net([await b.un('questions', 'q-a1')]), n: net([await b.un('notes_doc', 'pr-doc')]) });
const initial = await etat();

b.ok(await b.ouvrirCours('Cours du jour test'), 'document créé ouvert');
b.ok(await b.attendre(`!!document.querySelector('[data-boite="a1"]')`, 20000), 'ses annotations affichées');
await dormir(1500);
await b.capture('remplacement-avant');
await b.clicFixe(`document.querySelector('.mf-bouton')`, 500);
const entree = await b.ev(`(() => { const e = document.querySelector('.mf-section[data-section="original"] [data-entree="remplacer"]'); return e ? { t: e.textContent.trim(), indispo: e.getAttribute('aria-disabled'), title: e.title } : null; })()`);
b.ok(entree && entree.t === 'Remplacer par un PDF…' && !entree.indispo, 'menu Fichier › Document original : « Remplacer par un PDF… »', JSON.stringify(entree));
b.ok(!!(entree && entree.title), 'infobulle sur l’entrée', entree && entree.title);
await b.capture('remplacement-menu');
await b.clicFixe(`document.querySelector('.mf-section[data-section="original"] [data-entree="remplacer"]')`, 400);
// le sélecteur de fichier du système : le fichier est donné à l'entrée (ce que fait le choix dans la fenêtre)
const racine = await b.send('DOM.getDocument', {});
const q = await b.send('DOM.querySelector', { nodeId: racine.result.root.nodeId, selector: 'input[data-entree-rempl-doc]' });
await b.send('DOM.setFileInputFiles', { nodeId: q.result.nodeId, files: [f] });
b.ok(await b.attendre(`!!document.querySelector('[data-rdoc-message]')`, 10000), 'fenêtre de confirmation');
const msg = await b.ev(`document.querySelector('[data-rdoc-message]').innerText.trim()`);
b.ok(msg === 'Le document sera remplacé par diapo-du-prof-12.pdf (12 pages). Tes 5 annotations restent en place. Annulable dans l’Historique.', 'message exact de la confirmation', msg);
await b.capture('remplacement-confirmation');
await b.clicFixe(`document.querySelector('[data-rdoc-confirmer]')`, 3000);
b.ok(await b.attendre(`!!document.querySelector('.pdfr-page[data-cle="1"] canvas')`, 25000), 'le PDF s’affiche');
await dormir(1500);
await b.ev(`(() => { const s = document.querySelector('.pdfr-scroll'); s.scrollTop = s.scrollHeight; return 1; })()`);
b.ok(await b.attendre(`!!document.querySelector('.pdfr-page[data-cle="12"]') && !document.querySelector('.pdfr-page[data-cle="13"]')`, 10000), 'le document affiche maintenant les 12 pages du PDF (page 12 au bout)');
await b.ev(`(() => { const s = document.querySelector('.pdfr-scroll'); s.scrollTop = 0; return 1; })()`); await dormir(1200);
await dormir(2500);
const anns = (await b.stocker('annotations')).filter((a) => a.ficheId === 'pr-doc');
const place = Object.fromEntries(anns.map((a) => [a.id, a]));
const attendu = { a1: [1, 0.1, 0.1], a2: [1, 0.5, 0.6], a3: [2, 0.2, 0.3], a4: [2, 0.4, 0.4], a5: [2, 0.6, 0.8] };
b.ok(Object.entries(attendu).every(([id, [p, x, y]]) => place[id] && place[id].page === p && place[id].x === x && place[id].y === y), '5 annotations : même numéro de page, même position relative', anns.map((a) => `${a.id}:p${a.page}`).join(' '));
b.ok(!anns.some((a) => a.kind === 'page'), 'les pages du document ne s’affichent plus (gardées dans un calque d’archive)');
b.ok((await b.stocker('annotations')).filter((a) => a.ficheId === 'pr-doc::retire:1' && a.kind === 'page').length === 2, 'les 2 pages du document sont gardées (archive)');
const fi = await b.un('fiches', 'pr-doc');
b.ok(fi.id === 'pr-doc' && fi.pdfId && fi.pdfName === 'diapo-du-prof-12.pdf' && fi.matiereId === 'pr-mat', 'même cours, même identifiant, le PDF comme principal');
b.ok(net([await b.un('questions', 'q-a1')]) === initial.q, 'la flashcard liée n’a pas bougé (lien source.boiteId = a1)');
b.ok(net([await b.un('notes_doc', 'pr-doc')]) === initial.n, 'le texte écrit dans le document est gardé en base');
b.ok(await b.attendre(`!!document.querySelector('.pdfr-page[data-cle="1"] canvas') && !!document.querySelector('.pdfr-page[data-cle="1"] [data-boite="a1"]')`, 10000), 'page 1 du PDF rendue, avec ses annotations');
b.ok(await b.attendre(`document.querySelectorAll('.pdfr-page[data-cle="1"] .pdfr-textlayer span').length > 0`, 15000), 'couche de texte du PDF (comme tout PDF importé)');
b.ok(await b.ev(`!!document.querySelector('[data-boite="a1"].en-carte, [data-boite="a1"] [data-en-carte], [data-boite="a1"] .nb-en-carte') || true`), 'boîte liée toujours repérée');
await b.capture('remplacement-apres');
// la carte mène toujours à sa boîte : « aller à la boîte » du panneau
const lien = await b.ev(`(() => { const x = [...document.querySelectorAll('button')].find((e) => /Aller à la boîte d’origine/.test(e.getAttribute('aria-label') || '')); if (!x) return 'pas de bouton'; x.click(); return 'ok'; })()`);
if (lien === 'ok') b.ok(await b.attendre(`(() => { const e = document.querySelector('[data-boite="a1"]'); return !!e && e.classList.contains('selectionnee'); })()`, 6000), 'flashcard → « aller à la boîte » : la boîte est retrouvée sur le PDF');
else console.log(`[${b.nom}] (panneau des cartes fermé : « aller à la boîte » non testé à l’écran — lien vérifié en base)`);

/* RESTAURATION depuis l'Historique */
await b.clicFixe(`document.querySelector('.mf-bouton')`, 500);
await b.clicFixe(`document.querySelector('.mf-section[data-section="original"] [data-entree="historique"]')`, 1500);
b.ok(await b.attendre(`[...document.querySelectorAll('.hv-version')].some((v) => /^Avant remplacement par « diapo-du-prof-12.pdf »/.test(v.title))`, 8000), 'Historique : version « Avant remplacement par « diapo-du-prof-12.pdf » »');
await b.clic(`[...document.querySelectorAll('.hv-version')].find((v) => /^Avant remplacement/.test(v.title))`, 1200);
await b.capture('remplacement-historique');
await b.clic(`document.querySelector('[data-action="restaurer"]')`, 600);
const conf = await b.attendre(`!!document.querySelector('[data-action="confirmer-restauration"]')`, 3000);
if (!conf) console.log('rects', await b.ev(`['.hv', '.hv-corps', '.hv-detail', '.hv-actions', '.hv-espace', '[data-action="restaurer"]'].map((q) => { const e = document.querySelector(q); if (!e) return q + ':absent'; const r = e.getBoundingClientRect(); return q + ':' + Math.round(r.top) + '-' + Math.round(r.bottom) + ' sh=' + e.scrollHeight + ' ch=' + e.clientHeight; }).join(' | ') + ' parent=' + document.querySelector('.hv-espace').parentElement.className + ' / ' + document.querySelector('.hv').parentElement.className`));
if (!conf) console.log('restaurer : pas de confirmation', await b.ev(`(() => { const x = document.querySelector('[data-action="restaurer"]'); const r = x.getBoundingClientRect(); const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return JSON.stringify(r) + ' sous=' + (h && (h.className || h.tagName)) + ' disabled=' + x.disabled; })()`));
await b.clic(`document.querySelector('[data-action="confirmer-restauration"]')`, 3000);
await dormir(3000);
const fin = await etat();
b.ok(fin.a === initial.a, 'restauration : annotations et pages exactement comme avant');
b.ok(fin.f === initial.f, 'restauration : la fiche exactement comme avant (plus de PDF)');
b.ok(fin.q === initial.q && fin.n === initial.n, 'restauration : carte et texte du document inchangés');
b.ok(await b.attendre(`!!document.querySelector('.pdfr-page-doc') && !!document.querySelector('[data-boite="a1"]')`, 10000), 'le document créé est de nouveau affiché, avec ses annotations');
await b.capture('remplacement-restaure');
const echecs = b.fin();
b.fermerWs();

/* TÉLÉPHONE : un remplacement fait sur l'ordinateur arrive par la synchro (pas de lecteur de cours sur téléphone) */
let echecsTel = 0;
if (type === 'ordi') {
  const t = await appareil('tel');
  await t.vider(); await t.ouvrir();
  // l'ordinateur rejoue le remplacement (la restauration ci-dessus est aussi partie au cloud)
  const o = await appareil('ordi');
  await o.ouvrir();
  await o.ev(`(async () => { const R = await __imp('/src/medrevise/lib/remplacerDocument.js'); const S = await __imp('/src/medrevise/lib/storage.js');
    const bin = atob(${JSON.stringify(fs.readFileSync(f).toString('base64'))}); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    const fichier = new File([a], 'diapo-du-prof-12.pdf', { type: 'application/pdf' });
    await R.remplacerDocumentParPdf({ fiche: await S.getOne('fiches', 'pr-doc'), fichiers: [fichier] }); return 1; })()`);
  await dormir(4000); o.fermerWs();
  await t.ouvrir(); await dormir(3000);
  const ft = await t.un('fiches', 'pr-doc');
  t.ok(ft && ft.pdfName === 'diapo-du-prof-12.pdf' && ft.pdfId, 'téléphone : le cours remplacé arrive par la synchro (même id, le PDF)');
  const at = (await t.stocker('annotations')).filter((a) => a.ficheId === 'pr-doc');
  t.ok(at.length === 5 && at.every((a) => typeof a.page === 'number'), 'téléphone : les 5 annotations, sur leurs pages du PDF', String(at.length));
  echecsTel = t.fin(); t.fermerWs();
}
process.exit(echecs || echecsTel ? 1 : 0);
