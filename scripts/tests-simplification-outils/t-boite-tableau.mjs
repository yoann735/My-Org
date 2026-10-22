// §4 BOÎTE-TABLEAU dans le lecteur : 3 × 4, en-tête, Tab entre cellules, Entrée = retour à la ligne, + / − lignes et
// colonnes, redimensionnement proportionnel, filet vertical.   node t-boite-tableau.mjs [tablette]
import { banc } from './commun.mjs';
const tablette = process.argv[2] === 'tablette';
const b = await banc();
await b.preparer();
await b.ouvrirCours({ tablette });
const page = await b.rect(`document.querySelector('.pdfr-page[data-cle="1"]')`);
await b.outil6('ecrire'); await b.sousOutil('boiteTableau');
await b.clic([page.x + page.w * 0.5, page.y + page.h * 0.5], { att: 900 });
const boite = async () => (await b.enBase()).find((a) => a.grille);
let B = await boite();
b.ok(B && B.grille.cols.length === 3 && B.grille.lignes.length === 4 && B.grille.entete === true, 'Texte › Boîte-tableau : une boîte 3 colonnes × 4 lignes avec en-tête', JSON.stringify(B && { cols: B.grille.cols, n: B.grille.lignes.length }));
const focusCell = () => b.ev(`(()=>{const a=document.activeElement;return a&&a.classList.contains('btab-cell')?a.dataset.i+':'+a.dataset.j:null})()`);
b.ok((await focusCell()) === '0:0', 'en édition tout de suite, curseur dans la 1re cellule', await focusCell());
const valeurs = [['Muscle', 'Origine', 'Action'], ['Psoas', 'L1–L4', 'Flexion'], ['Iliaque', 'Fosse iliaque', 'Flexion'], ['Grand fessier', 'Ilium', 'Extension']];
for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
  await b.ecrire(valeurs[i][j]);
  if (i === 3 && j === 2) { await b.T.Enter(); await b.ecrire('de hanche'); }
  if (!(i === 3 && j === 2)) await b.T.Tab();
}
const parcours = await focusCell();
await b.touche('Tab', { shift: true, vk: 9 }); const retour = await focusCell();
await b.T.Escape(); await b.dormir(400); await b.T.Escape(); await b.dormir(600);
B = await boite();
b.ok(JSON.stringify(B.grille.lignes.slice(0, 3)) === JSON.stringify(valeurs.slice(0, 3)) && B.grille.lignes[3][2] === 'Extension\nde hanche', 'Tab passe d’une cellule à l’autre, Entrée = retour à la ligne dans la cellule', JSON.stringify(B.grille.lignes));
b.ok(parcours === '3:2' && retour === '3:1', 'Maj+Tab revient à la cellule précédente', parcours + ' → ' + retour);
b.ok(/Muscle \| Origine \| Action/.test(JSON.stringify(B.content)), 'texte à plat dans `content` (exports, recherche, IA)');
// rendu : le tableau occupe toute la largeur intérieure, filets intérieurs seulement, en-tête en gras
const rendu = await b.ev(`(()=>{const bx=document.querySelector('.note-box.boite-tableau');const body=bx.querySelector('.nb-body');const t=bx.querySelector('.btab-table');const cs=getComputedStyle(body);const k=parseFloat(getComputedStyle(bx).scale)||1;
  const inner=body.getBoundingClientRect().width-(parseFloat(cs.paddingLeft)+parseFloat(cs.paddingRight))*k;const td=bx.querySelector('.btab-td');const tdc=getComputedStyle(td);
  return {tab:Math.round(t.getBoundingClientRect().width),inner:Math.round(inner),bordureTable:getComputedStyle(t).borderTopStyle,filet:tdc.borderRightWidth+' '+tdc.borderRightColor,tete:getComputedStyle(bx.querySelector('.btab-tete .btab-cell')).fontWeight,corps:getComputedStyle(bx.querySelectorAll('tr')[1].querySelector('.btab-cell')).fontWeight,fond:getComputedStyle(bx).backgroundColor,rayon:getComputedStyle(bx).borderTopLeftRadius}})()`);
b.ok(Math.abs(rendu.tab - rendu.inner) <= 1 && rendu.bordureTable === 'hidden' && rendu.tete === '700' && rendu.corps === '400', 'rendu : pleine largeur intérieure, pas de bordure extérieure en plus, filets fins, en-tête en gras', JSON.stringify(rendu));
await b.capRect('so-boite-tableau', `document.querySelector('.note-box.boite-tableau')`, 14);
// mini barre : + ligne, + colonne, − ligne, − colonne, en-tête — boîte SÉLECTIONNÉE (un clic), pas en édition
await b.clic(await b.pos(`document.querySelector('.note-box.boite-tableau')`, false), { att: 600 });
b.ok(!(await b.ev(`!!document.querySelector('.note-box.boite-tableau .btab.edition')`)), 'un clic : la boîte-tableau est sélectionnée (pas en édition)');
const ob = (await b.optionsBarre())[0];
b.ok(['ligne+', 'colonne+', 'ligne-', 'colonne-', 'entete', 'vers-tableau'].every((k) => ob.includes(k)), 'mini barre : + ligne · + colonne · − ligne · − colonne · en-tête · → Tableau', JSON.stringify(ob));
{ const r = await b.rect(`[...document.querySelectorAll('.mini-barre')].find(e=>e.offsetParent)`); await b.capture('so-mini-boite-tableau', { x: Math.round(r.x - 6), y: Math.round(r.y - 6), width: Math.round(r.w + 12), height: Math.round(r.h + 12) }); }
await b.cliqueOption('ligne+', 600); await b.cliqueOption('colonne+', 600);
B = await boite(); const apresAjout = [B.grille.lignes.length, B.grille.cols.length];
await b.cliqueOption('ligne-', 600); await b.cliqueOption('colonne-', 600);
B = await boite(); const apresRetrait = [B.grille.lignes.length, B.grille.cols.length];
b.ok(apresAjout[0] === 5 && apresAjout[1] === 4 && apresRetrait[0] === 4 && apresRetrait[1] === 3 && JSON.stringify(B.grille.lignes[1]) === JSON.stringify(valeurs[1]), 'ajouter puis supprimer une ligne et une colonne (le texte est gardé)', JSON.stringify({ apresAjout, apresRetrait }));
await b.cliqueOption('entete', 600);
B = await boite();
b.ok(B.grille.entete === false && (await b.ev(`getComputedStyle(document.querySelector('.note-box.boite-tableau tr .btab-cell')).fontWeight`)) === '400', 'en-tête off : la 1re ligne n’est plus en gras');
await b.cliqueOption('entete', 600);
// redimensionner la boîte : colonnes proportionnelles (la boîte d'abord bien dans l'écran)
await b.ev(`document.querySelector('.note-box.boite-tableau').scrollIntoView({block:'center'});1`); await b.dormir(800);
const avantCols = (await boite()).grille.cols;
const w0 = await b.ev(`document.querySelector('.note-box.boite-tableau').getBoundingClientRect().width`);
const coin = await b.pos(`document.querySelector('.note-box.boite-tableau .sel-coin.sel-se')`, false);
await b.glisser(coin, [coin[0] + 120, coin[1]], 10); await b.dormir(700);
const w1 = await b.ev(`document.querySelector('.note-box.boite-tableau').getBoundingClientRect().width`);
const tds = await b.ev(`[...document.querySelector('.note-box.boite-tableau tr').children].map(td=>Math.round(td.getBoundingClientRect().width))`);
const apresCols = (await boite()).grille.cols;
b.ok(w1 > w0 + 80 && JSON.stringify(avantCols) === JSON.stringify(apresCols) && Math.abs(tds[0] / tds[1] - avantCols[0] / avantCols[1]) < 0.05, 'redimensionner la boîte : les colonnes suivent proportionnellement', JSON.stringify({ w0: Math.round(w0), w1: Math.round(w1), tds }));
// glisser le 1er filet vertical vers la droite : la 1re colonne s'élargit, la 2e rétrécit
const f = await b.pos(`document.querySelector('.note-box.boite-tableau .btab-filet[data-filet="0"]')`, false);
await b.glisser(f, [f[0] + 50, f[1]], 8); await b.dormir(700);
const cols2 = (await boite()).grille.cols;
b.ok(cols2[0] > apresCols[0] + 0.05 && cols2[1] < apresCols[1] - 0.05 && Math.abs(cols2[2] - apresCols[2]) < 0.001, 'glisser un filet vertical ajuste la colonne (sa voisine cède la place)', JSON.stringify({ avant: apresCols, apres: cols2 }));
await b.capRect('so-boite-tableau-ajustee', `document.querySelector('.note-box.boite-tableau')`, 14);
// annuler : la largeur de colonne revient
await b.touche('z', { meta: true, code: 'KeyZ', vk: 90 }); await b.dormir(700);
b.ok(JSON.stringify((await boite()).grille.cols) === JSON.stringify(apresCols), '⌘Z défait l’ajustement de colonne');
// en édition : « + ligne » ajoute SOUS la cellule qui a le curseur, « − colonne » retire SA colonne
const c11 = await b.pos(`document.querySelector('.note-box.boite-tableau .btab-cell[data-i="1"][data-j="1"]')`, false);
await b.clic(c11, { att: 900 });
b.ok((await b.ev(`(document.activeElement||{}).dataset?.i+':'+(document.activeElement||{}).dataset?.j`)) === '1:1', 'clic sur une cellule de la boîte sélectionnée : édition, curseur dans CETTE cellule');
await b.cliqueOption('ligne+', 700);
B = await boite();
b.ok(B.grille.lignes.length === 5 && B.grille.lignes[2].every((c) => c === '') && B.grille.lignes[3][0] === 'Iliaque', 'en édition : « + ligne » s’insère sous la ligne du curseur', JSON.stringify(B.grille.lignes.map((l) => l[0])));
await b.T.Escape(); await b.T.Escape(); await b.dormir(500);
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
