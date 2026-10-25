// §5 SYSTÈME DE TABLEAU dans une boîte du lecteur : débordement, sélection, menu Tableau (chaque action), fusion /
// scission, couleurs, bordures, style, filets, clavier, collage depuis un tableur, undo, 10 × 8.
//   node t-tableau.mjs [tablette]
import { banc, outilsTableau } from './commun.mjs';
const tablette = process.argv[2] === 'tablette';
const b = await banc();
const T = outilsTableau(b);
const G0 = { v: 1, cols: [0.3333, 0.3333, 0.3334], entete: true, lignes: [['Muscle', 'Origine', 'Action'], ['Psoas', 'L1–L4', 'Flexion'], ['Iliaque', 'Fosse iliaque', 'Flexion'], ['Grand fessier', 'Ilium', 'Extension']] };
await b.preparer({ annotations: [b.boiteGrille('bt-1', G0, { x: 0.2, y: 0.12, width: 0.5, taille1000: 16 })] });
await b.ouvrirCours({ tablette });
const B = async () => (await b.enBase()).find((a) => a.id === 'bt-1');
const lignes = async () => (await B()).grille.lignes;
// 1. sélection d'une cellule (clic sur la boîte sélectionnée = édition, curseur dans la cellule)
await b.clic(await b.pos(`document.querySelector('${T.box}')`, false), { att: 500 });
await b.clic(await T.posCell(1, 1), { att: 700 });
b.ok((await T.focus()) === '1:1' && (await T.selTd()) === '1:1', 'clic : la cellule (curseur dedans, cellule sélectionnée)', await T.selTd());
// 2. plage au glisser
await T.glisserSouris(await T.posCell(1, 0), await T.posCell(2, 1), 10); await b.dormir(300);
b.ok((await T.selTd()) === '1:0 1:1 2:0 2:1', 'glisser d’une cellule à une autre : la plage', await T.selTd());
// 3. Maj+clic étend
await b.clic(await T.posCell(0, 0), { att: 400 });
await T.shiftClic(await T.posCell(1, 2));
b.ok((await T.selTd()) === '0:0 0:1 0:2 1:0 1:1 1:2', 'Maj+clic : la plage depuis la cellule de départ', await T.selTd());
// 4. marges : colonne, ligne, tout
await b.clic(await b.pos(`document.querySelector('${T.box} .btab-marge-col[data-col="1"]')`, false), { att: 400 });
b.ok((await T.selTd()) === '0:1 1:1 2:1 3:1', 'clic dans la marge du haut : la colonne', await T.selTd());
await b.clic(await b.pos(`document.querySelector('${T.box} .btab-marge-lig[data-lig="2"]')`, false), { att: 400 });
b.ok((await T.selTd()) === '2:0 2:1 2:2', 'clic dans la marge de gauche : la ligne', await T.selTd());
if (tablette) { await T.menu('sel-tout'); await T.fermerMenu(); } else await b.clic(await b.pos(`document.querySelector('${T.box} .btab-coin')`, false), { att: 400 });
b.ok((await T.selTd()).split(' ').length === 12, tablette ? 'menu Tableau › Tout : tout le tableau (au doigt, pas de coin)' : 'clic dans le coin : tout le tableau');
// 5. menu Tableau : ouvert depuis la mini barre, regroupé
await b.clic(await T.posCell(1, 1), { att: 500 });
await T.ouvrirMenu();
const sections = await b.ev(`[...document.querySelectorAll('.mt-pop .mt-section')].map(s=>s.dataset.section)`);
b.ok(JSON.stringify(sections) === JSON.stringify(['selection', 'lignes', 'cellules', 'bordures', 'style']), 'menu Tableau : Sélection · Lignes et colonnes · Cellules · Bordures · Style', JSON.stringify(sections));
b.ok((await T.focus()) === '1:1', 'ouvrir le menu garde le curseur dans la cellule');
await b.capRect('bt-menu-tableau', `document.querySelector('.mt-pop')`, 10);
// insertions / suppressions autour de la cellule 1:1
await T.menu('ins-dessus'); let L = await lignes();
b.ok(L.length === 5 && L[1].every((c) => !c) && L[2][0] === 'Psoas', 'Insérer au-dessus', JSON.stringify(L.map((l) => l[0])));
await T.menu('sel-cellule'); // la ligne insérée était sélectionnée : revenir à une cellule
await T.menu('ins-dessous'); L = await lignes();
b.ok(L.length === 6 && L[2].every((c) => !c), 'Insérer en dessous', JSON.stringify(L.map((l) => l[0])));
await T.marge('lig', 1); await T.marge('lig', 2, true); await T.menu('sup-ligne'); L = await lignes();
b.ok(L.length === 4 && JSON.stringify(L) === JSON.stringify(G0.lignes), 'Supprimer les lignes (2 lignes sélectionnées par la marge) : retour au tableau d’origine', JSON.stringify(L.map((l) => l[0])));
await T.clicCell(1, 1);
await T.menu('ins-gauche'); L = await lignes();
b.ok(L[0].length === 4 && L[0][1] === '' && L[0][2] === 'Origine', 'Insérer à gauche', JSON.stringify(L[0]));
await T.menu('sel-cellule'); await T.menu('ins-droite'); L = await lignes();
b.ok(L[0].length === 5 && L[0][2] === '', 'Insérer à droite', JSON.stringify(L[0]));
await T.marge('col', 1); await T.marge('col', 2, true); await T.menu('sup-colonne'); L = await lignes();
b.ok(JSON.stringify(L) === JSON.stringify(G0.lignes), 'Supprimer la colonne (×2)', JSON.stringify(L[0]));
await T.menu('repartir');
b.ok(JSON.stringify((await B()).grille.cols) === JSON.stringify([0.3333, 0.3333, 0.3333]), 'Répartir uniformément');
// 6. fusion / scission
await T.clicCell(1, 2); await T.shiftClic(await T.posCell(2, 2));
await T.menu('fusionner'); let g = (await B()).grille;
b.ok(JSON.stringify(g.fusions) === JSON.stringify([{ i: 1, j: 2, rs: 2, cs: 1 }]) && g.lignes[1][2] === 'Flexion\nFlexion' && (await b.ev(`document.querySelector('${T.box} .btab-td[data-i="1"][data-j="2"]').rowSpan`)) === 2, 'Fusionner 2 cellules (texte réuni, rowspan 2)', JSON.stringify(g.fusions));
b.ok((await T.debord()).bas <= 0, 'fusion : rien ne dépasse de la boîte');
await T.menu('scinder'); g = (await B()).grille;
b.ok(!g.fusions && (await b.ev(`document.querySelectorAll('${T.box} .btab-td').length`)) === 12, 'Scinder', JSON.stringify(g.fusions));
// 7. couleurs, style du texte, taille, alignements
await T.marge('lig', 0);
const okFond = await T.couleur('fond', 'cyan');
g = (await B()).grille;
b.ok(okFond && g.formats && g.formats[0].every((f) => f && f.fond === 'cyan') && !(g.formats[1] || []).some(Boolean), 'Fond des cellules (ligne 1)', JSON.stringify(g.formats && g.formats[0]));
const okTexte = await T.couleur('couleur', 'bleufonce');
g = (await B()).grille;
b.ok(okTexte && g.formats && g.formats[0].every((f) => f && f.couleur === 'bleufonce'), 'Couleur du texte des cellules', JSON.stringify(g.formats && g.formats[0][0]));
await T.menu('italique'); await T.menu('gras');
g = (await B()).grille;
b.ok(g.formats[0].every((f) => f.italique && f.gras), 'Gras et italique des cellules');
await T.ouvrirMenu();
await b.clic(await b.pos(`document.querySelector('.mt-pop [data-tab="taille"]')`, false), { att: 200 });
await b.ev(`(()=>{const t=document.querySelector('.mt-pop [data-tab="taille"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(t,'22');t.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
await b.touche('Enter', { vk: 13, code: 'Enter' }); await b.dormir(500);
g = (await B()).grille;
const fsz = await b.ev(`(()=>{const td=document.querySelector('${T.box} .btab-td[data-i="0"][data-j="0"]');const bx=document.querySelector('${T.box}');return {fs:parseFloat(getComputedStyle(td).fontSize),page:document.querySelector('.pdfr-page[data-cle="1"]').getBoundingClientRect().width,k:parseFloat(getComputedStyle(bx).scale)||1}})()`);
b.ok(g.formats[0][0].taille === 22 && Math.abs(fsz.fs * fsz.k - 22 * fsz.page / 1000) < 0.6, 'Taille du texte en px (22 px d’une page de 1000 px)', JSON.stringify(fsz));
await T.menu('h-centre'); await T.menu('v-milieu');
g = (await B()).grille;
const al = await b.ev(`(()=>{const td=document.querySelector('${T.box} .btab-td[data-i="0"][data-j="1"]');const c=getComputedStyle(td);return c.textAlign+' '+c.verticalAlign})()`);
b.ok(g.formats[0][1].alignH === 'center' && g.formats[0][1].alignV === 'milieu' && al === 'center middle', 'Alignement horizontal et vertical', al);
// 8. bordures
await T.menu('b-toutes');
const bd = await b.ev(`(()=>{const c=getComputedStyle(document.querySelector('${T.box} .btab-td[data-i="0"][data-j="0"]'));return c.borderTopStyle+' '+c.borderLeftStyle})()`);
b.ok((await B()).grille.bordures.mode === 'toutes' && bd === 'solid solid', 'Bordures : toutes (extérieures dessinées)', bd);
await T.menu('b-exterieures');
const bx = await b.ev(`(()=>{const c=getComputedStyle(document.querySelector('${T.box} .btab-td[data-i="1"][data-j="1"]'));const d=getComputedStyle(document.querySelector('${T.box} .btab-td[data-i="0"][data-j="0"]'));return [c.borderTopStyle,c.borderRightStyle,d.borderTopStyle,d.borderLeftStyle].join(' ')})()`);
b.ok(bx === 'none none solid solid', 'Bordures : extérieures seulement', bx);
await T.menu('b-aucune');
b.ok((await b.ev(`[...document.querySelectorAll('${T.box} .btab-td')].every(t=>getComputedStyle(t).borderTopStyle==='none'&&getComputedStyle(t).borderRightStyle==='none')`)), 'Bordures : aucune');
await T.menu('b-interieures');
await T.ouvrirMenu();
await b.ev(`(()=>{const t=document.querySelector('.mt-pop [data-tab="b-ep"]');t.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(t,'3');t.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
await b.touche('Enter', { vk: 13, code: 'Enter' }); await b.dormir(500);
const okBc = await T.couleur('b-couleur', 'bleufonce');
g = (await B()).grille;
b.ok(g.bordures.mode === 'interieures' && g.bordures.ep === 3 && okBc && g.bordures.couleur === 'bleufonce', 'Bordures : intérieures, épaisseur 3 px, couleur', JSON.stringify(g.bordures));
b.ok((await T.debord()).bas <= 0 && (await T.debord()).droite <= 0, 'bordures épaisses : rien ne dépasse', JSON.stringify(await T.debord()));
// 9. style
await T.menu('st-alterne');
const alt = await b.ev(`[...document.querySelectorAll('${T.box} tr')].map(t=>t.classList.contains('btab-impaire')?1:0).join('')`);
b.ok((await B()).grille.alterne === true && alt === '0010', 'Style : lignes alternées (après l’en-tête)', alt);
await T.menu('st-aucun');
g = (await B()).grille;
b.ok(!g.entete && !g.alterne, 'Style : aucun');
await T.menu('st-entete');
b.ok((await B()).grille.entete === true, 'Style : ligne d’en-tête');
await T.fermerMenu();
await b.capRect('bt-tableau-forme', `document.querySelector('${T.box}')`, 16);
// 10. filets : largeur de colonne, hauteur de ligne
const c0 = (await B()).grille.cols;
const f0 = await b.pos(`document.querySelector('${T.box} .btab-filet[data-filet="0"]')`, false);
await b.glisser(f0, [f0[0] + 40, f0[1]], 8); await b.dormir(500);
const c1 = (await B()).grille.cols;
b.ok(c1[0] > c0[0] + 0.04 && c1[1] < c0[1] - 0.04, 'glisser un filet vertical : largeur de colonne', JSON.stringify(c1));
const h0 = await b.ev(`document.querySelector('${T.box} tr:nth-child(2)').getBoundingClientRect().height`);
if (tablette) await T.marge('lig', 1); // au doigt : le filet d'une ligne n'apparaît que sous la ligne sélectionnée
const fh = await b.pos(`document.querySelector('${T.box} .btab-filet-h[data-filet-h="1"]')`, false);
await b.glisser(fh, [fh[0], fh[1] + 40], 8); await b.dormir(500);
const h1 = await b.ev(`document.querySelector('${T.box} tr:nth-child(2)').getBoundingClientRect().height`);
g = (await B()).grille;
b.ok(h1 > h0 + 30 && Array.isArray(g.hauts) && g.hauts[1] > 0 && (await T.debord()).bas <= 0, 'glisser un filet horizontal : hauteur de ligne (la boîte suit)', JSON.stringify({ h0: Math.round(h0), h1: Math.round(h1), hauts: g.hauts }));
// 11. undo / redo de chaque opération
const avantUndo = JSON.stringify((await B()).grille);
await b.touche('z', { meta: true, code: 'KeyZ', vk: 90 }); await b.dormir(600);
const apresUndo = (await B()).grille;
b.ok(!apresUndo.hauts && JSON.stringify(apresUndo) !== avantUndo, '⌘Z (curseur dans une cellule, rien de tapé) : la hauteur de ligne est défaite', JSON.stringify(apresUndo.hauts));
await b.touche('z', { meta: true, shift: true, code: 'KeyZ', vk: 90 }); await b.dormir(600);
b.ok(JSON.stringify((await B()).grille) === avantUndo, '⌘⇧Z la refait');
for (let k = 0; k < 4; k++) { await b.touche('z', { meta: true, code: 'KeyZ', vk: 90 }); await b.dormir(350); }
b.ok((await B()).grille.entete === true && (await B()).grille.alterne === true, '⌘Z × 4 : le style revient (lignes alternées)', JSON.stringify({ entete: (await B()).grille.entete, alterne: (await B()).grille.alterne }));
// 12. clavier : Tab / Maj+Tab, flèches, Entrée, Tab dans la dernière cellule = une ligne
await T.clicCell(0, 0);
await b.T.Tab(); const t1 = await T.focus();
await b.touche('Tab', { shift: true, vk: 9 }); const t2 = await T.focus();
await b.touche('ArrowDown', { vk: 40 }); const t3 = await T.focus();
await b.touche('ArrowRight', { vk: 39 }); const t4 = await T.focus(); // curseur à la fin du texte : cellule suivante
b.ok(t1 === '0:1' && t2 === '0:0' && t3 === '1:0' && t4 === '1:1', 'Tab, Maj+Tab, flèches (aux bords du texte)', [t1, t2, t3, t4].join(' → '));
await T.clicCell(3, 2);
const n0 = (await lignes()).length;
await b.T.Tab(); await b.dormir(500);
b.ok((await lignes()).length === n0 + 1 && (await T.focus()) === n0 + ':0', 'Tab dans la dernière cellule : une ligne de plus, curseur dedans', await T.focus());
await b.ecrire('Sartorius'); await b.T.Enter(); await b.ecrire('(couturier)');
await b.T.Tab(); await b.dormir(400);
b.ok((await lignes())[n0][0] === 'Sartorius\n(couturier)', 'Entrée = retour à la ligne dans la cellule', JSON.stringify((await lignes())[n0][0]));
// 13. coller depuis un tableur (TSV d'Excel) et du HTML (Word / Sheets)
await T.clicCell(1, 0);
await b.ev(`(()=>{const dt=new DataTransfer();dt.setData('text/plain','A1\\tB1\\tC1\\tD1\\nA2\\t"B2\\nsuite"\\tC2\\tD2\\n');document.activeElement.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));return 1})()`);
await b.dormir(700);
L = await lignes();
b.ok(L[1][0] === 'A1' && L[2][1] === 'B2\nsuite' && L[1].length === 4 && L[2][3] === 'D2', 'coller du TSV (Excel / Sheets) : cellules remplies, une colonne ajoutée', JSON.stringify(L.slice(1, 3)));
await T.clicCell(4, 0);
await b.ev(`(()=>{const dt=new DataTransfer();dt.setData('text/html','<table><tr><td>W1</td><td colspan="2">W2</td></tr><tr><td>W3</td><td>W4</td><td>W5</td></tr></table>');dt.setData('text/plain','W1 W2');document.activeElement.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));return 1})()`);
await b.dormir(700);
L = await lignes();
b.ok(L[4][0] === 'W1' && L[4][1] === 'W2' && L[5][2] === 'W5', 'coller un tableau HTML (Word)', JSON.stringify(L.slice(4, 6)));
b.ok((await T.debord()).bas <= 0 && (await T.debord()).droite <= 0, 'après collage : la boîte suit, rien ne dépasse', JSON.stringify(await T.debord()));
await b.touche('z', { meta: true, code: 'KeyZ', vk: 90 }); await b.dormir(600);
b.ok((await lignes())[4][0] !== 'W1', '⌘Z défait le collage');
await b.T.Escape(); await b.dormir(300); await b.T.Escape(); await b.dormir(400);
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
