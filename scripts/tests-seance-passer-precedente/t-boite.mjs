// Flashcard depuis une BOÎTE d'annotation = le MÊME formulaire complet que « Nouvelle carte » de la barre latérale.
// node t-boite.mjs ordi|tablette  (le téléphone n'a pas de lecteur de cours : pas de boîte, pas de « → Flashcard »)
// Cours PDF de test (3 pages, fait par pdf-lib), deux boîtes : texte + image, boîte-tableau. Données de test seulement.
import fs from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { appareil, dormir } from './commun.mjs';

const type = process.argv[2] || 'ordi';
const b = await appareil(type);
const chiffres = {};

/* cours PDF de test */
const pdf = await PDFDocument.create(); const police = await pdf.embedFont(StandardFonts.Helvetica);
for (let i = 1; i <= 3; i++) { const p = pdf.addPage([595, 842]); p.drawText(`Cours de test — page ${i}`, { x: 60, y: 780, size: 22, font: police }); p.drawText('Le néphron est l’unité fonctionnelle du rein.'.replace('’', "'"), { x: 60, y: 740, size: 13, font: police }); }
const pdf64 = Buffer.from(await pdf.save()).toString('base64');

await b.vider();
await b.ouvrir();
const T = (t, m) => ({ type: 'text', text: t, ...(m ? { marks: m.map((x) => ({ type: x })) } : {}) });
const P = (...c) => ({ type: 'paragraph', content: c });
const doc = (...c) => ({ type: 'doc', content: c });
const G = { v: 2, cols: [0.4, 0.6], entete: true, lignes: [['Segment', 'Rôle'], ['Glomérule', 'Filtration'], ['Tubule proximal', 'Réabsorption']], formats: [[{ fond: 'cyan' }, { fond: 'cyan' }], [null, { couleur: 'rouge', gras: true }], [null, null]], bordures: { mode: 'toutes', couleur: null, ep: 1 } };
await b.ev(`(async () => { const S = await __imp('/src/medrevise/lib/storage.js');
  const bin = atob(${JSON.stringify(pdf64)}); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  const pdfId = await S.putBlob(new Blob([a], { type: 'application/pdf' }));
  const c = document.createElement('canvas'); c.width = 600; c.height = 340; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 600, 340); x.strokeStyle = '#c0392b'; x.lineWidth = 8; x.beginPath(); x.arc(170, 170, 110, 0, 7); x.stroke();
  x.fillStyle = '#111'; x.font = 'bold 38px Arial'; x.fillText('GLOMERULE', 320, 120); x.fillText('TUBULE', 320, 220);
  const imgId = await S.putBlob(new File([await new Promise((r) => c.toBlob(r, 'image/png'))], 'schema.png', { type: 'image/png' }));
  await S.put('sources', { id: 'bx-src', nom: 'Section test', rappelsJ: true });
  await S.put('matieres', { id: 'bx-mat', nom: 'Matière test', sourceId: 'bx-src' });
  await S.put('fiches', { id: 'bx-f', matiereId: 'bx-mat', dossierId: null, titre: 'Cours boîtes test', type: 'standard', pdfId, pdfName: 'cours.pdf', dateImport: '2026-11-20' });
  const base = { ficheId: 'bx-f', page: 1, kind: 'libre', type: 'boite', fond: 'plein', gabarit: 'carte', taille1000: 15, bord1000: 1.5, pad1000: [10, 8], largeurFixe: true, createdAt: '2026-11-20T08:00:00.000Z' };
  await S.put('annotations', { ...base, id: 'bx-img', x: 0.08, y: 0.2, width: 0.42, height: 0.12, couleur: 'bleu-franc', image: { blobId: imgId, ratio: 0.5667, position: 'dessus' },
    content: ${JSON.stringify(doc(P(T('Néphron')), P(T('Unité fonctionnelle du rein : '), T('filtration', ['bold']), T(', réabsorption.')), P(T('Ex : '), T('glomérule', ['italic']))))} });
  await S.put('annotations', { ...base, id: 'bx-tab', x: 0.55, y: 0.2, width: 0.4, height: 0.1, couleur: 'blanc', grille: ${JSON.stringify(G)}, content: ${JSON.stringify(doc(P(T('Segment | Rôle'))))} });
  return 1; })()`);
await b.ouvrir();
// Bibliothèque → le cours
await b.aller('Biblioth');
await dormir(800);
await b.ev(`(() => { const r = [...document.querySelectorAll('button')].find((x) => (x.title || '') === 'Revenir à la liste' || x.getAttribute('aria-label') === 'Retour'); r && r.click(); return 1; })()`);
await dormir(600);
// tablette : l'arbre de la Bibliothèque est replié — « Afficher le panneau »
if (!(await b.ev(`!!document.querySelector('.lt-fiche')`))) await b.clic(`document.querySelector('.lib-master.collapsed .split-handle')`, 900);
await b.clic(`[...document.querySelectorAll('.lt-fiche')].find((e) => e.innerText.trim().startsWith('Cours boîtes test'))`, 2500);
b.ok(await b.attendre(`!!document.querySelector('.note-box[data-boite="bx-img"]')`, 25000), 'cours ouvert, boîtes affichées');
await dormir(1200);
const cartes = () => b.ev(`(async () => (await (await __imp('/src/medrevise/lib/storage.js')).getAll('questions')).filter((q) => q.ficheId === 'bx-f'))()`);
const versFlashcard = async (id) => {
  await b.clic(`document.querySelector('.note-box[data-boite="${id}"]')`, 600);
  return b.clic(`[...document.querySelectorAll('.mini-barre [data-option="vers-flashcard"]')].find((e) => e.offsetParent)`, 1500);
};
const F = `document.querySelector('.pis-add.fc-carte')`;

/* 1. boîte texte + image → le formulaire complet du panneau, pré-rempli */
b.ok(await versFlashcard('bx-img'), '« → Flashcard » dans la mini barre de la boîte');
b.ok(await b.attendre(`!!${F}`, 6000), 'le formulaire du panneau (« Nouvelle carte ») s’ouvre');
b.ok(!(await b.ev(`!!document.querySelector('.bfc-fenetre')`)), 'l’ancien formulaire réduit n’existe plus');
const form = await b.ev(`(() => { const f = ${F}; const v = (s) => (f.querySelector(s) || {}).value;
  return { sortes: [...f.querySelectorAll('.fc-type')].map((x) => x.dataset.sorte), active: (f.querySelector('.fc-type.actif') || {}).dataset?.sorte, recto: v('textarea[aria-label="Recto"]'), verso: v('textarea[aria-label="Verso"]'),
    image: !!f.querySelector('.fcf-options img, [data-zone-image] img, .fc-image img, img'), masques: [...f.querySelectorAll('button')].some((x) => /Masques à deviner/.test(x.textContent)),
    elements: !!f.querySelector('.ev-editeur, [data-elements], .elv-editeur') || /lément/.test(f.innerText), plus: !!f.querySelector('.fcf-plus'), theme: !!f.querySelector('.fcf-options input') }; })()`);
b.ok(JSON.stringify(form.sortes) === JSON.stringify(['standard', 'muscle', 'tableau', 'molecule']) && form.active === 'standard', 'même composant : sélecteur Texte · Muscle · Tableau · Molécule', JSON.stringify(form.sortes));
b.ok(form.recto === 'Néphron' && /\*\*filtration\*\*/.test(form.verso || '') && /\*glomérule\*/.test(form.verso || ''), 'pré-rempli comme avant : recto = 1re ligne, verso = le reste (mise en forme gardée)', JSON.stringify({ recto: form.recto, verso: form.verso }));
b.ok(form.image && form.masques && form.theme, 'toutes les options : image de la boîte, « Masques à deviner… », thème / indice / à retenir', JSON.stringify(form));
await b.capture('10-boite-formulaire-complet');
chiffres.formulaire = form;
// masques : l'éditeur s'ouvre sur l'image de la boîte ; un rectangle ; créer
await b.clic(`[...${F}.querySelectorAll('button')].find((x) => /Masques à deviner/.test(x.textContent))`, 1500);
b.ok(await b.attendre(`[...document.querySelectorAll('.day-pop img')].some((i) => i.naturalWidth > 0)`, 8000), 'l’éditeur de masques s’ouvre avec l’image de la boîte (sans la recopier)');
await b.clic(`[...document.querySelectorAll('.sc-seg .seg-btn')].find((x) => /Rectangle/.test(x.textContent))`, 400);
const zone = await b.ev(`(() => { const i = [...document.querySelectorAll('.day-pop img')].find((x) => x.naturalWidth > 0); const r = i.getBoundingClientRect(); return [r.x + r.width * 0.55, r.y + r.height * 0.25, r.x + r.width * 0.9, r.y + r.height * 0.45]; })()`);
if (b.tactile) {
  await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: zone[0], y: zone[1], id: 1 }] });
  for (let k = 1; k <= 10; k++) { await b.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: zone[0] + ((zone[2] - zone[0]) * k) / 10, y: zone[1] + ((zone[3] - zone[1]) * k) / 10, id: 1 }] }); await dormir(25); }
  await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
} else {
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: zone[0], y: zone[1] });
  await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: zone[0], y: zone[1], button: 'left', buttons: 1, clickCount: 1 });
  for (let k = 1; k <= 10; k++) { await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: zone[0] + ((zone[2] - zone[0]) * k) / 10, y: zone[1] + ((zone[3] - zone[1]) * k) / 10, button: 'left', buttons: 1 }); await dormir(25); }
  await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: zone[2], y: zone[3], button: 'left', buttons: 0, clickCount: 1 });
}
await dormir(700);
await b.ev(`(() => { const a = document.activeElement; if (a && /INPUT|TEXTAREA/.test(a.tagName) && a.closest('.day-pop')) { a.focus(); document.execCommand('insertText', false, 'Glomérule'); } return 1; })()`);
await dormir(300);
await b.capture('11-boite-masques');
await b.clic(`[...document.querySelectorAll('.day-pop .btn.primary')].find((x) => /Créer la flashcard/.test(x.textContent) && !x.disabled)`, 2500);
await dormir(1200);
let C = await cartes();
const cImg = C.find((q) => q.source && q.source.boiteId === 'bx-img');
b.ok(!!cImg && !!cImg.occlusion && cImg.occlusion.coches.some((k) => k.kind === 'zone') && cImg.occlusion.imageId && cImg.recto === 'Néphron', 'carte à masques créée depuis la boîte (masque dessiné, image de la boîte)', JSON.stringify(cImg && { recto: cImg.recto, masques: cImg.occlusion && cImg.occlusion.coches.length, source: cImg.source }));
b.ok(!!cImg && cImg.source.page === 1 && cImg.source.sorte === 'boite' && cImg.srcId && cImg.srcId.startsWith('bfc'), 'lien avec la boîte conservé (source : boîte, page)', JSON.stringify(cImg && cImg.source));
b.ok(!(await b.ev(`!!${F}`)) && await b.attendre(`!!document.querySelector('.pis-item[data-item="${cImg && cImg.id}"]')`, 4000), 'le formulaire se ferme, la nouvelle carte est montrée dans le panneau');
await b.capture('12-boite-carte-creee');
// même carte faite depuis « Nouvelle carte » du panneau : image collée + un masque → mêmes champs
await b.clic(`document.querySelector('.fcl-nouvelle')`, 900);
await b.ev(`(async () => { const f = document.querySelector('.pis-add.fc-carte'); const r = f.querySelector('textarea[aria-label="Recto"]'); r.focus(); document.execCommand('insertText', false, 'Néphron (panneau)');
  const c = document.createElement('canvas'); c.width = 600; c.height = 340; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 600, 340); x.fillStyle = '#111'; x.font = 'bold 38px Arial'; x.fillText('GLOMERULE', 320, 120);
  const blob = await new Promise((res) => c.toBlob(res, 'image/png')); const dt = new DataTransfer(); dt.items.add(new File([blob], 'p.png', { type: 'image/png' }));
  r.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return 1; })()`);
await dormir(900);
await b.clic(`[...document.querySelector('.pis-add.fc-carte').querySelectorAll('button')].find((x) => /Masques à deviner/.test(x.textContent))`, 1500);
await b.attendre(`[...document.querySelectorAll('.day-pop img')].some((i) => i.naturalWidth > 0)`, 8000);
await b.clic(`[...document.querySelectorAll('.sc-seg .seg-btn')].find((x) => /Rectangle/.test(x.textContent))`, 400);
const z2 = await b.ev(`(() => { const i = [...document.querySelectorAll('.day-pop img')].find((x) => x.naturalWidth > 0); const r = i.getBoundingClientRect(); return [r.x + r.width * 0.55, r.y + r.height * 0.25, r.x + r.width * 0.9, r.y + r.height * 0.45]; })()`);
if (b.tactile) {
  await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: z2[0], y: z2[1], id: 1 }] });
  for (let k = 1; k <= 10; k++) { await b.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: z2[0] + ((z2[2] - z2[0]) * k) / 10, y: z2[1] + ((z2[3] - z2[1]) * k) / 10, id: 1 }] }); await dormir(25); }
  await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
} else {
  await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: z2[0], y: z2[1], button: 'left', buttons: 1, clickCount: 1 });
  for (let k = 1; k <= 10; k++) { await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: z2[0] + ((z2[2] - z2[0]) * k) / 10, y: z2[1] + ((z2[3] - z2[1]) * k) / 10, button: 'left', buttons: 1 }); await dormir(25); }
  await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: z2[2], y: z2[3], button: 'left', buttons: 0, clickCount: 1 });
}
await dormir(700);
await b.clic(`[...document.querySelectorAll('.day-pop .btn.primary')].find((x) => /Créer la flashcard/.test(x.textContent) && !x.disabled)`, 2500);
await dormir(1200);
C = await cartes();
const cPan = C.find((q) => q.recto === 'Néphron (panneau)');
const cles = (q) => Object.keys(q || {}).filter((k) => !['source', 'srcId', 'id', 'createdAt', 'updatedAt'].includes(k)).sort();
const clesOcc = (q) => Object.keys((q && q.occlusion) || {}).sort();
b.ok(!!cPan && JSON.stringify(cles(cPan)) === JSON.stringify(cles(cImg)) && JSON.stringify(clesOcc(cPan)) === JSON.stringify(clesOcc(cImg)), 'carte à masques depuis la boîte ≡ carte à masques depuis le panneau (mêmes champs), + le lien vers la boîte',
  `boîte : ${cles(cImg).length} champs · panneau : ${cles(cPan).length} champs · en plus : source=${!!(cImg && cImg.source)}, panneau source=${!!(cPan && cPan.source)}`);
chiffres.masques = { champsBoite: cles(cImg), champsPanneau: cles(cPan) };

// le formulaire du panneau reste ouvert pour enchaîner (comportement inchangé) : « Annuler » le ferme
await b.clic(`[...document.querySelector('.pis-add.fc-carte').querySelectorAll('.fcf-pied .btn, button')].find((x) => x.offsetParent && /^\\s*Annuler\\s*$/.test(x.textContent))`, 700);
b.ok(!(await b.ev(`!!${F}`)), '« Annuler » ferme le formulaire du panneau');
/* 2. boîte déjà convertie : la carte s'ouvre, pas de doublon */
await versFlashcard('bx-img');
C = await cartes();
b.ok(!(await b.ev(`!!${F}`)) && C.filter((q) => q.source && q.source.boiteId === 'bx-img').length === 1, 'boîte déjà convertie : la carte existante s’ouvre (pas de doublon)');

/* 3. boîte-tableau → sorte Tableau pré-remplie, grille complète gardée */
await versFlashcard('bx-tab');
b.ok(await b.attendre(`!!${F}`, 6000), 'boîte-tableau : le même formulaire s’ouvre');
const ft = await b.ev(`(() => { const f = ${F}; return { active: (f.querySelector('.fc-type.actif') || {}).dataset?.sorte, titre: ([...f.querySelectorAll('[data-champ="titre"]')].find((x) => x.offsetParent) || {}).value,
  cols: [...f.querySelectorAll('.tb-nom-col')].filter((x) => x.offsetParent).map((x) => x.value) }; })()`);
b.ok(ft.active === 'tableau' && ft.titre === 'Compléter le tableau' && JSON.stringify(ft.cols) === JSON.stringify(['Segment', 'Rôle']), 'sorte Tableau, titre et colonnes pré-remplis', JSON.stringify(ft));
await b.capture('13-boite-tableau-formulaire');
await b.clic(`[...${F}.querySelectorAll('.btn.primary')].find((x) => x.offsetParent && /Ajouter/.test(x.textContent))`, 2500);
await dormir(1000);
C = await cartes();
const cTab = C.find((q) => q.source && q.source.boiteId === 'bx-tab');
b.ok(!!cTab && cTab.tableau && cTab.grille && cTab.grille.formats && cTab.source.sorte === 'boite-tableau', 'carte Tableau créée : tableau complet de la boîte (couleurs) et lien vers la boîte', JSON.stringify(cTab && { recto: cTab.recto, lignes: cTab.tableau && cTab.tableau.lignes.length, grille: !!cTab.grille }));

fs.mkdirSync(new URL('./resultats/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL(`./resultats/boite-${type}.json`, import.meta.url), JSON.stringify({ resultats: b.resultats, chiffres }, null, 1));
const echecs = b.fin();
b.fermerWs();
process.exit(echecs ? 1 : 0);
