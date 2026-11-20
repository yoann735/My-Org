// NON-RÉGRESSION du lecteur (20/11) : crayon, surligneur, forme, boîte (écriture continue), supprimer / annuler,
// fiche jumelle (bascule, calque séparé, collage d'une copie de l'original vers la fiche), synchro vers le cloud.
// node t-nonreg.mjs ordi|tablette
import { appareil, semer, pdfTest, dormir } from './commun.mjs';

const type = process.argv[2] || 'ordi';
const b = await appareil(type);
await b.neuf();
await semer(b, [{ id: 'pr-nr', matiereId: 'pr-mat', dossierId: null, titre: 'Non-régression test', type: 'standard', pdf64: await pdfTest(3), pdfName: 'diapo.pdf', dateImport: '2026-11-20' }]);
const fiche64 = await pdfTest(3, { titre: 'Fiche' });
await b.ouvrir();
const annots = async () => (await b.stocker('annotations')).filter((a) => String(a.ficheId).startsWith('pr-nr'));
const nouveaux = async (avant) => (await annots()).filter((a) => !avant.some((x) => x.id === a.id));
// tracé : à la souris (ordinateur) ; au STYLET sur l'iPad (le doigt y fait défiler la page, comme dans l'app)
const glisser = async (x0, y0, x1, y1, pas = 10) => {
  const pt = b.tactile ? 'pen' : 'mouse';
  await b.send('Page.bringToFront');
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0, pointerType: pt });
  await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', buttons: 1, clickCount: 1, pointerType: pt });
  for (let k = 1; k <= pas; k++) { await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + ((x1 - x0) * k) / pas, y: y0 + ((y1 - y0) * k) / pas, button: 'left', buttons: 1, pointerType: pt }); await dormir(25); }
  await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', buttons: 0, clickCount: 1, pointerType: pt });
  await dormir(900);
};
const outil = (id) => b.clicFixe(`[...document.querySelectorAll('[data-outil="${id}"]')].find((e) => e.offsetParent)`, 500);
const P = (fx, fy) => b.ev(`(() => { const r = document.querySelector('.pdfr-page[data-cle="1"]').getBoundingClientRect(); return [r.x + r.width * ${fx}, r.y + r.height * ${fy}]; })()`);

b.ok(await b.ouvrirCours('Non-régression test'), 'diapo ouverte');
b.ok(await b.attendre(`!!document.querySelector('.pdfr-page[data-cle="1"] canvas')`, 20000), 'page rendue');
await dormir(1500);
await b.ev(`(() => { document.querySelector('.pdfr-page[data-cle="1"]').scrollIntoView({ block: 'start' }); return 1; })()`); await dormir(600);

/* crayon */
let av = await annots();
await outil('dessin');
let [x0, y0] = await P(0.1, 0.55), [x1, y1] = await P(0.35, 0.65);
await glisser(x0, y0, x1, y1);
let n = await nouveaux(av);
b.ok(n.length === 1 && n[0].kind === 'trait', 'crayon : un trait tracé', n.map((a) => a.kind).join(','));

/* surligneur sur le texte de la page */
const hAvant = (await b.stocker('highlights')).length;
await outil('surligneur');
const ligne = await b.ev(`(() => { const s = [...document.querySelectorAll('.pdfr-page[data-cle="1"] .pdfr-textlayer span')].find((x) => /nephron/.test(x.textContent)); const r = s.getBoundingClientRect(); return [r.x + 3, r.y + r.height / 2, r.x + r.width * 0.6, r.y + r.height / 2]; })()`);
await glisser(...ligne);
await dormir(800);
b.ok((await b.stocker('highlights')).length === hAvant + 1, 'surligneur : un passage du texte surligné');

/* forme */
av = await annots();
await outil('forme');
[x0, y0] = await P(0.36, 0.6); [x1, y1] = await P(0.48, 0.75);
await glisser(x0, y0, x1, y1);
n = await nouveaux(av);
b.ok(n.length === 1 && n[0].kind === 'forme', 'forme : une forme tracée', n.map((a) => a.kind).join(','));
const formeId = n[0] && n[0].id;

/* boîte : écriture continue (le texte est en base AVANT de quitter la boîte) */
av = await annots();
await outil('ecrire');
[x0, y0] = await P(0.3, 0.25);
if (b.tactile) await glisser(x0, y0, x0 + 1, y0 + 1, 1); else await b.point(x0, y0, 1200); // iPad : posée au stylet (le doigt fait défiler)
await dormir(600);
await b.taper('Écrit sans fermer');
await dormir(900);
n = await nouveaux(av);
b.ok(n.length === 1 && JSON.stringify(n[0].content || '').includes('Écrit sans fermer'), 'boîte : le texte est enregistré en local pendant l’écriture (écriture continue)');
await b.touche('Escape', { code: 'Escape', vk: 27 }); await dormir(400); await b.touche('Escape', { code: 'Escape', vk: 27 }); await dormir(400);

/* supprimer / annuler */
await outil('main');
await b.clicFixe(`document.querySelector('.pdfr-forme[data-objet="${formeId}"]')`, 600);
await b.touche('Delete', { code: 'Delete', vk: 46 }); await dormir(800);
b.ok(!(await annots()).some((a) => a.id === formeId), 'Suppr : la forme sélectionnée est supprimée');
await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 4 }); await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 4 });
await dormir(900);
b.ok((await annots()).some((a) => a.id === formeId), '⌘Z : la forme revient');
await b.capture('nonreg-outils');

/* fiche jumelle : import, bascule, calque séparé, copie de l'original collée sur la fiche */
await b.ev(`(async () => { const J = await __imp('/src/medrevise/lib/ficheJumelle.js'); const S = await __imp('/src/medrevise/lib/storage.js');
  const bin = atob(${JSON.stringify(fiche64)}); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  const f = await S.getOne('fiches', 'pr-nr'); await J.importerJumelle({ courseId: 'pr-nr', fichier: new File([a], 'fiche.pdf', { type: 'application/pdf' }), pdfIdOrig: f.pdfId }); return 1; })()`);
await b.ouvrir();
b.ok(await b.ouvrirCours('Non-régression test') && await b.attendre(`!!document.querySelector('.pdfr-page[data-cle="1"] canvas')`, 20000), 'cours rouvert avec sa fiche');
await dormir(1500);
await outil('main');
const boite = (await annots()).find((a) => a.kind === 'libre');
await b.ev(`(() => { document.querySelector('.pdfr-page[data-cle="1"]').scrollIntoView({ block: 'start' }); return 1; })()`); await dormir(500);
await b.clicFixe(`document.querySelector('[data-boite="${boite.id}"]')`, 600);
await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, modifiers: 4, commands: ['copy'] }); await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, modifiers: 4 });
await dormir(500);
const bascule = await b.clicFixe(`[...document.querySelectorAll('.seg-btn[role="tab"]')].find((e) => e.textContent.trim() === 'Fiche')`, 2500);
b.ok(bascule && await b.attendre(`[...document.querySelectorAll('.seg-btn[role="tab"]')].some((e) => e.textContent.trim() === 'Fiche' && e.classList.contains('active'))`, 8000), 'bascule Original → Fiche');
b.ok(await b.attendre(`!!document.querySelector('.pdfr-page[data-cle="1"] canvas') && !document.querySelector('[data-boite="${boite.id}"]')`, 10000), 'la fiche s’affiche, sans les annotations de l’original (calque séparé)');
await dormir(800);
const avF = await annots();
await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, modifiers: 4, commands: ['paste'] }); await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, modifiers: 4 });
await dormir(1200);
const cpF = await nouveaux(avF);
b.ok(cpF.length === 1 && String(cpF[0].ficheId).startsWith('pr-nr::fiche'), 'copie de l’original collée sur la fiche (son calque)', cpF.map((a) => a.ficheId).join(','));
await b.clicFixe(`[...document.querySelectorAll('.seg-btn[role="tab"]')].find((e) => e.textContent.trim() === 'Original')`, 2500);
b.ok(await b.attendre(`!!document.querySelector('[data-boite="${boite.id}"]')`, 10000), 'retour à l’original : ses annotations');
await b.capture('nonreg-fiche-jumelle');

/* synchro : tout est parti au faux cloud */
await dormir(4000);
const cloud = await (await fetch('http://localhost:54399/rest/v1/medrevise_records?select=record_id,store', { headers: { apikey: 'faux' } })).json();
const ids = new Set(cloud.map((r) => r.record_id));
const locaux = await annots();
b.ok(locaux.every((a) => ids.has(a.id)), 'synchro : toutes les annotations sont au cloud', `${locaux.filter((a) => ids.has(a.id)).length}/${locaux.length}`);
b.ok(await b.ev(`['ajour','local'].includes(document.documentElement.getAttribute('data-mr-synchro'))`), 'synchro : état « à jour »', await b.ev(`document.documentElement.getAttribute('data-mr-synchro')`));
const echecs = b.fin();
b.fermerWs(); process.exit(echecs ? 1 : 0);
