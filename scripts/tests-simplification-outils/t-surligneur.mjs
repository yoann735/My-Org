// §1/§5 SURLIGNEUR UNIQUE : sur du texte → surlignage des caractères (même couleur retire, autre couleur remplace) ;
// hors du texte → trait à main levée (sa couleur, son épaisseur, « Ligne droite »).   node t-surligneur.mjs [tablette]
import { banc } from './commun.mjs';
const tablette = process.argv[2] === 'tablette';
const b = await banc();
await b.preparer();
await b.ouvrirCours({ tablette });
await b.outil6('surligneur');
const ligne = await b.ev(`(()=>{const sp=[...document.querySelectorAll('.pdfr-page[data-cle="1"] .pdfr-textlayer span')].filter(s=>/Pyramides|Bertin/.test(s.textContent));const a=sp[0].getBoundingClientRect(),z=sp[sp.length-1].getBoundingClientRect();return [a.left+1,a.top+a.height/2,z.right-1,z.top+z.height/2]})()`);
const passer = async () => { await b.glisser([ligne[0], ligne[1]], [ligne[2], ligne[3]], 14); await b.dormir(700); await b.ev(`window.getSelection().removeAllRanges();1`); await b.dormir(200); };
const hls = async () => (await b.surlignagesEnBase()).map((h) => ({ texte: h.texte, couleur: h.couleur }));
await passer();
const h1 = await hls();
b.ok(h1.length === 1 && /Pyramides de Malpighi et colonnes de Bertin/.test(h1[0].texte), 'sur du texte natif : le passage est surligné', JSON.stringify(h1));
await passer();
const h2 = await hls();
b.ok(h2.length === 0, 'même couleur sur le même passage : le surlignage est retiré', JSON.stringify(h2));
await passer();
// autre couleur (2e pastille de la sous-barre)
const couleurs = await b.ev(`[...document.querySelectorAll('.pdfr-contexte .sc-pastille')].map(e=>e.title||e.getAttribute('aria-label'))`);
await b.clic(await b.pos(`document.querySelectorAll('.pdfr-contexte .sc-pastille')[1]`, false), { att: 300 });
await passer();
const h3 = await hls();
b.ok(h3.length === 1 && h3[0].couleur !== h1[0].couleur, 'autre couleur sur le même passage : la couleur est remplacée', JSON.stringify({ avant: h1[0].couleur, apres: h3, couleurs: couleurs.slice(0, 3) }));
const tr = await b.ev(`[...document.querySelectorAll('.pdfr-page[data-cle="1"] .pdfr-hlayer .pdfr-hl-rect')].map(e=>{const c=getComputedStyle(e);return {rayon:c.borderTopLeftRadius,mix:c.mixBlendMode,op:c.opacity,pb:c.paddingBottom,mt:c.marginTop}})`);
// (29/10, docs/compte-rendu-synchro-rapide-surlignage-listes.md) coins de 4 px et 2 px de débord à gauche et à droite
b.ok(tr.length === 1 && tr[0].rayon === '4px' && tr[0].mix === 'multiply' && tr[0].pb === '2px' && tr[0].mt === '-1px', 'rendu : un rectangle par ligne, coins 4 px, débord 1 px en haut et en bas (2 px sur les côtés), multiply', JSON.stringify(tr));
// MAIN LEVÉE : un geste qui commence hors du texte (bas de la page 1, vide)
const page = await b.rect(`document.querySelector('.pdfr-page[data-cle="1"]')`);
const de = [page.x + page.w * 0.2, page.y + page.h * 0.85], a = [page.x + page.w * 0.6, page.y + page.h * 0.88];
// « Ligne droite » d'abord à non (réglage mémorisé sur l'appareil)
if ((await b.ev(`document.querySelector('[data-reglage="ligne-droite"]').getAttribute('aria-pressed')`)) === 'true') await b.clic(await b.pos(`document.querySelector('[data-reglage="ligne-droite"]')`, false), { att: 300 });
const avantTraits = (await b.enBase()).filter((x) => x.kind === 'trait').length;
await b.glisser(de, a, 12); await b.dormir(800);
const traits = (await b.enBase()).filter((x) => x.kind === 'trait');
const t = traits[traits.length - 1];
b.ok(traits.length === avantTraits + 1 && t.mode === 'surligneur' && t.couleur === h3[0].couleur, 'hors du texte : un surlignage à main levée (mode surligneur, couleur du Surligneur)', JSON.stringify(t && { mode: t.mode, couleur: t.couleur, rendu: t.rendu, ep1000: t.ep1000 }));
b.ok((await b.surlignagesEnBase()).length === 1, 'le trait libre ne crée aucun surlignage de texte');
// Ligne droite
await b.clic(await b.pos(`document.querySelector('[data-reglage="ligne-droite"]')`, false), { att: 300 });
const de2 = [page.x + page.w * 0.2, page.y + page.h * 0.93], a2 = [page.x + page.w * 0.7, page.y + page.h * 0.935];
await b.glisser(de2, [page.x + page.w * 0.45, page.y + page.h * 0.96], 6); await b.dormir(200);
await b.glisser(de2, a2, 12); await b.dormir(800);
const t2 = (await b.enBase()).filter((x) => x.kind === 'trait').pop();
b.ok(t2 && t2.rendu === 'droit' && t2.points.length === 2 && t.rendu === 'cr', '« Ligne droite » : le trait libre va droit du départ à l’arrivée (sans : tracé libre)', JSON.stringify(t2 && { libre: t.rendu, droit: t2.rendu, n: t2.points.length }));
{ await b.capture('so-surligneur-main-levee', { x: Math.round(page.x), y: Math.round(page.y + page.h * 0.5), width: Math.round(page.w), height: Math.round(page.h * 0.5) }); }
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
