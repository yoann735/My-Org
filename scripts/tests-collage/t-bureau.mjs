// Collage d'image au survol — ORDINATEUR (1 440 px, souris). Vrai ⌘V, vrai survol (Input.dispatchMouseEvent).
// Carte Muscle : survol Insertion / image générale, focus Origine sans survol, texte seul, remplacer + ⌘Z,
// OCR, dépôt d'un fichier, enregistrement (images aux bonnes lignes) ; carte standard : survol recto / verso.
// Usage : node t-bureau.mjs <dossier-captures>
import { appareil, ok, bilan } from './outils.mjs';
import { ouvrirFormulaire } from './ouvrir.mjs';

const captures = process.argv[2] || '/tmp/collage';
const A = await appareil(9335, { captures });
ok(await ouvrirFormulaire(A), 'formulaire Muscle ouvert (cours « 3 1 Muscles de la fesse », panneau Flashcards)');
const F = `document.querySelector('.mu-form')`;
const ligne = (id) => `${F}.querySelector('[data-zone-image="${id}"]')`;
const vignettes = () => A.ev(`Object.fromEntries([...${F}.querySelectorAll('[data-zone-image]')].map((z) => [z.getAttribute('data-zone-image'), (() => { const i = z.querySelector('.mui-vignette img'); return i && i.complete ? i.naturalWidth + 'x' + i.naturalHeight : null; })()]))`);
const neutre = async () => A.survoler(await A.pos(`document.querySelector('.pdfr-scroll, .pdfr-v2, main')`)); // souris hors du formulaire

// nom du muscle
await A.clic(await A.pos(`${F}.querySelector('.mu-nom-champ')`)); await A.ecrire('m. Test collage');

// 1. survol de la ligne Insertion + ⌘V
await A.pressePapierImage(420, 140, '#c0392b', 'IMAGE A|Insertion grand trochanter');
await A.clic(await A.pos(`${F}.querySelector('.mu-nom-champ')`)); // focus dans le NOM (pas une ligne)
await A.survoler(await A.pos(ligne('insertion')));
const contour = await A.ev(`(() => { const v = ${ligne('insertion')}.querySelector('[data-zone-visuel]'); return { classe: v.classList.contains('zi-survol'), astuce: v.dataset.astuce || null, outline: getComputedStyle(v).outlineStyle, apres: getComputedStyle(v, '::after').content }; })()`);
ok(contour.classe && contour.outline === 'solid' && /⌘V pour coller/.test(contour.apres), 'survol de la ligne Insertion : contour d’accent + « ⌘V pour coller »', JSON.stringify(contour));
await A.capture('01-survol-insertion');
await A.cmdV(); await A.dormir(120);
const spinner = await A.ev(`!!${F}.querySelector('.zi-collage')`);
await A.dormir(1200);
let v = await vignettes();
ok(v.insertion === '420x140' && Object.entries(v).filter(([k, x]) => x && k !== 'insertion').length === 0, '⌘V au survol d’Insertion → image dans Insertion, nulle part ailleurs (focus pourtant dans le nom)', JSON.stringify(v));
ok(spinner, 'spinner court pendant le collage');
await A.capture('02-image-collee-insertion');
const ocr0 = await A.ev(`(${ligne('insertion')}.querySelector('.zi-ocr') || {}).textContent || ''`);
await A.dormir(9000);
const ocr1 = await A.ev(`(${ligne('insertion')}.querySelector('.zi-ocr') || {}).textContent || ''`);
ok(/Lecture du texte|Texte lu/.test(ocr0) && /Texte lu · \d+ mot/.test(ocr1), 'OCR démarré sur l’image collée', `${ocr0} → ${ocr1}`);

// 2. survol de l'image générale + ⌘V
await A.pressePapierImage(300, 220, '#2471a3', 'IMAGE B|vue générale');
await A.survoler(await A.pos(`${F}.querySelector('[data-zone-image="generale"]')`));
await A.cmdV(); await A.dormir(1300);
v = await vignettes();
ok(v.generale === '300x220' && v.insertion === '420x140', '⌘V au survol de l’image générale → image générale', JSON.stringify(v));

// 3. curseur dans le texte d'Origine, souris hors de toute zone → image d'Origine
await A.clic(await A.pos(`document.getElementById('mu-origine')`));
await neutre();
const survolResiduel = await A.ev(`!!${F}.querySelector('.zi-survol')`);
await A.pressePapierImage(260, 260, '#1e8449', 'IMAGE C|origine');
await A.cmdV(); await A.dormir(1300);
v = await vignettes();
ok(!survolResiduel && v.origine === '260x260', 'focus dans Origine, aucune zone survolée → image d’Origine', JSON.stringify(v));

// 4. texte seul dans le presse-papiers → collage de texte normal, aucune image
await A.clic(await A.pos(`document.getElementById('mu-action')`));
await A.pressePapierTexte('Extension et rotation latérale');
const avant4 = JSON.stringify(await vignettes());
await A.cmdV(); await A.dormir(600);
const texte = await A.ev(`document.getElementById('mu-action').value`);
ok(texte.includes('Extension et rotation latérale') && JSON.stringify(await vignettes()) === avant4, 'texte seul : collé dans le champ Action, aucune image ajoutée', texte);

// 5. remplacer l'image d'Insertion puis ⌘Z → l'ancienne revient
await A.pressePapierImage(500, 300, '#7d3c98', 'IMAGE D|remplacement');
await A.survoler(await A.pos(ligne('insertion')));
await A.cmdV(); await A.dormir(1300);
v = await vignettes();
const message = await A.ev(`(document.querySelector('.mu-form .zi-message') || {}).textContent || ''`);
ok(v.insertion === '500x300' && /remplacée/.test(message), 'remplacement : nouvelle image dans Insertion + message « Image remplacée… Annuler »', `${v.insertion} · ${message}`);
await A.capture('03-remplacement-message');
await A.cmdZ(); await A.dormir(1200);
v = await vignettes();
ok(v.insertion === '420x140', '⌘Z → l’image précédente revient dans Insertion', JSON.stringify(v));
// ⌘Z dans un champ où l'on vient de taper : annule le TEXTE, pas une image
await A.pressePapierImage(500, 300, '#7d3c98', 'IMAGE D|remplacement');
await A.survoler(await A.pos(ligne('insertion'))); await A.cmdV(); await A.dormir(1300);
await A.clic(await A.pos(`document.getElementById('mu-innervation')`)); await A.ecrire('N. glutéal');
await A.cmdZ(); await A.dormir(500);
v = await vignettes();
ok(v.insertion === '500x300', 'texte tapé après le collage : ⌘Z dans le champ annule le texte, l’image reste', `${v.insertion} · innervation « ${await A.ev(`document.getElementById('mu-innervation').value`)} »`);

// 6. dépôt d'un fichier sur la ligne Trajet
const p = await A.pos(ligne('trajet'));
await A.ev(`(async () => { window.__fichierDepot = new File([await (await (() => { const c = new OffscreenCanvas(180, 90); const x = c.getContext('2d'); x.fillStyle = '#555'; x.fillRect(0, 0, 180, 90); return c.convertToBlob({ type: 'image/png' }); })())], 'depot.png', { type: 'image/png' }); return 1; })()`);
const depose = await A.ev(`(() => { const el = document.elementFromPoint(${p[0]}, ${p[1]}); const dt = new DataTransfer(); dt.items.add(window.__fichierDepot);
  for (const t of ['dragenter', 'dragover', 'drop']) el.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt })); return el.closest('[data-zone-image]')?.getAttribute('data-zone-image'); })()`);
await A.dormir(1300);
v = await vignettes();
ok(depose === 'trajet' && v.trajet === '180x90', 'fichier déposé sur la ligne Trajet → image de Trajet', JSON.stringify(v));

// 7. enregistrer → images aux bonnes lignes en base
const idsAvant = await A.ev(`(async () => (await ${A.st}.getAll('questions')).map((q) => q.id))()`);
await A.clic(await A.pos(`[...${F}.querySelectorAll('.imp-actions button')].find((b) => /Ajouter|Enregistrer/.test(b.textContent))`));
await A.dormir(2500);
const carte = await A.ev(`(async () => { const avant = new Set(${JSON.stringify(idsAvant)}); const q = (await ${A.st}.getAll('questions')).find((x) => !avant.has(x.id) && x.muscle); if (!q) return null;
  const tailles = {}; for (const [k, v] of Object.entries(q.muscle.images || {})) { const b = await ${A.st}.getBlob(v.imageId); const bm = await createImageBitmap(b); tailles[k] = bm.width + 'x' + bm.height; }
  const g = q.muscle.imageGenerale; let gt = null; if (g) { const bm = await createImageBitmap(await ${A.st}.getBlob(g.imageId)); gt = bm.width + 'x' + bm.height; }
  return { id: q.id, recto: q.recto, tailles, generale: gt, action: q.muscle.lignes.action }; })()`);
ok(carte && carte.tailles.insertion === '500x300' && carte.tailles.origine === '260x260' && carte.tailles.trajet === '180x90' && carte.generale === '300x220' && !carte.tailles.action, 'enregistrée : Insertion 500×300 (remplacée en dernier), Origine 260×260, Trajet 180×90, générale 300×220, Action sans image', JSON.stringify(carte));
console.log('CARTE', carte && carte.id);

// 8. carte standard : survol recto / verso
await A.clic(await A.pos(`[...document.querySelectorAll('button')].find((b) => b.offsetParent && /Carte standard/.test(b.textContent))`)); await A.dormir(700);
const G = `[...document.querySelectorAll('.aif-champs')].find((f) => f.getClientRects().length && f.querySelector('.fci-champ'))`;
await A.clic(await A.pos(`${G}.querySelector('[data-zone-image="recto"] textarea')`)); await A.ecrire('Recto test collage');
await A.pressePapierImage(320, 160, '#ca6f1e', 'RECTO|image');
await A.survoler(await A.pos(`${G}.querySelector('[data-zone-image="recto"] textarea')`));
await A.capture('04-standard-survol-recto');
await A.cmdV(); await A.dormir(1200);
const etat = () => A.ev(`(() => { const g = ${G}; const i = g.querySelector('.fc-vignette img'); return { image: i && i.complete ? i.naturalWidth + 'x' + i.naturalHeight : null, place: (g.querySelector('.fc-seg .seg-btn.active') || {}).textContent || null }; })()`);
let s = await etat();
ok(s.image === '320x160' && s.place === 'Recto', 'carte standard : survol du recto + ⌘V → image affichée au recto', JSON.stringify(s));
await A.pressePapierImage(240, 240, '#17a589', 'VERSO|image');
await A.survoler(await A.pos(`${G}.querySelector('[data-zone-image="verso"] textarea')`));
await A.cmdV(); await A.dormir(1200);
s = await etat();
ok(s.image === '240x240' && s.place === 'Verso', 'survol du verso + ⌘V → image affichée au verso (remplace)', JSON.stringify(s));
await A.capture('05-standard-verso');
await A.cmdZ(); await A.dormir(900);
s = await etat();
ok(s.image === '320x160' && s.place === 'Recto', '⌘Z → image et place précédentes', JSON.stringify(s));

ok(A.erreurs.length === 0, 'aucune erreur JavaScript', A.erreurs.join(' | ').slice(0, 300));
A.fermer();
process.exit(bilan() ? 1 : 0);
