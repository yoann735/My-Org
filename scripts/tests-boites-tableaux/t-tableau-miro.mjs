// §5 TABLEAU dans une carte du tableau Miro : le bug de débordement (capture), le même menu Tableau, fusion, couleurs,
// bordures, Tab, collage, ⌘Z — même composant que le lecteur.   node t-tableau-miro.mjs [tablette]
import { banc, outilsTableau } from './commun.mjs';
const tablette = process.argv[2] === 'tablette';
const b = await banc();
const T = outilsTableau(b, '[data-boite="c-grand"]');
const lignes10 = Array.from({ length: 10 }, (_, i) => Array.from({ length: 8 }, (_, j) => (i === 0 ? 'Titre ' + j : 'C' + i + '.' + j + (j % 3 === 0 ? ' plus long' : ''))));
const g = { v: 1, cols: Array(8).fill(0.125), lignes: lignes10, entete: true };
await b.preparer({ annotations: [] });
await b.S(`await S.put('board',{id:'board:f-simpl',ficheId:'f-simpl',kind:'board',v:1,objects:[{id:'c-grand',type:'carte',x:40,y:40,w:640,h:160,couleur:'bleu-franc',z:1,titre:'',corps:'',grille:${JSON.stringify(g)}}],edges:[],viewport:{x:20,y:40,z:0.62},theme:'sombre'});return 1`);
await b.ouvrirCours({ tablette });
const re = '^(Tableau|Le tableau en plein)$';
await b.clic(await b.pos(`[...document.querySelectorAll('button:not(.pm-seg-btn)')].find(e=>e.offsetParent&&new RegExp(${JSON.stringify(re)}).test(e.innerText.trim()||e.getAttribute('aria-label')||e.title||''))`, false), { att: 2200 });
const O = async () => (await b.board()).objects.find((o) => o.id === 'c-grand');
const d0 = await T.debord();
await b.dormir(800);
b.ok(d0.bas <= 0 && d0.droite <= 0, 'BUG CORRIGÉ : un tableau 10 × 8 ne sort plus de sa carte (avant : 1 132 px de trop)', JSON.stringify(d0));
b.ok(Math.abs((await O()).h - (await b.ev(`document.querySelector('${T.box}').offsetHeight`))) <= 1, 'la hauteur enregistrée de la carte suit le tableau (cadre, flèches)', String((await O()).h));
await b.capRect('bt-miro-10x8', `document.querySelector('${T.box}')`, 12);
// sélection puis édition
await b.clic(await b.pos(`document.querySelector('${T.box} .btab-td[data-i="0"][data-j="0"]')`, false), { att: 500 });
const ob = await b.optionsBarre();
b.ok(ob.flat().includes('tableau'), 'mini barre de la carte : le bouton Tableau', JSON.stringify(ob));
await b.clic(await T.posCell(2, 1), { att: 300 }); await b.clic(await T.posCell(2, 1), { att: 700 });
if (!(await T.focus())) { await b.clic(await T.posCell(2, 1), { n: 2, att: 700 }); }
b.ok((await T.focus()) === '2:1', 'édition : curseur dans la cellule visée', await T.focus());
await T.clicCell(2, 1); await T.shiftClic(await T.posCell(3, 2));
await T.menu('fusionner');
let o = await O();
b.ok(JSON.stringify(o.grille.fusions) === JSON.stringify([{ i: 2, j: 1, rs: 2, cs: 2 }]), 'menu Tableau › Fusionner (2 × 2)', JSON.stringify(o.grille.fusions));
await T.couleur('fond', 'jaune-vif');
o = await O();
b.ok(o.grille.formats && o.grille.formats[2][1] && o.grille.formats[2][1].fond === 'jaune-vif', 'fond de la cellule fusionnée', JSON.stringify(o.grille.formats && o.grille.formats[2][1]));
await T.menu('b-toutes');
b.ok((await O()).grille.bordures.mode === 'toutes', 'bordures : toutes');
const d1 = await T.debord();
b.ok(d1.bas <= 0 && d1.droite <= 0 && d1.haut <= 0 && d1.gauche <= 0, 'bordures extérieures dessinées DANS la carte', JSON.stringify(d1));
// ⌘Z depuis une cellule (rien de tapé) : le journal du tableau
await T.clicCell(5, 5);
await b.touche('z', { meta: true, code: 'KeyZ', vk: 90 }); await b.dormir(600);
b.ok(!(await O()).grille.bordures, '⌘Z (curseur dans une cellule) : les bordures sont défaites');
// Tab dans la dernière cellule
await T.clicCell(9, 7);
await b.T.Tab(); await b.dormir(600);
o = await O();
b.ok(o.grille.lignes.length === 11 && (await T.focus()) === '10:0', 'Tab dans la dernière cellule : une ligne de plus', String(o.grille.lignes.length));
// collage TSV
await b.ev(`(()=>{const dt=new DataTransfer();dt.setData('text/plain','x1\\tx2\\nx3\\tx4');document.activeElement.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));return 1})()`);
await b.dormir(800);
o = await O();
b.ok(o.grille.lignes[10][0] === 'x1' && o.grille.lignes[11][1] === 'x4', 'coller un tableau (TSV)', JSON.stringify(o.grille.lignes.slice(10)));
const d2 = await T.debord();
await b.dormir(600);
b.ok(d2.bas <= 0 && Math.abs((await O()).h - (await b.ev(`document.querySelector('${T.box}').offsetHeight`))) <= 1, 'la carte a grandi avec le tableau', JSON.stringify({ d2, h: (await O()).h }));
await b.T.Escape(); await b.dormir(400);
await b.capRect('bt-miro-forme', `document.querySelector('${T.box}')`, 12);
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
