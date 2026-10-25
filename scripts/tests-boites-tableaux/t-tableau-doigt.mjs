// §5 AU DOIGT sur tablette (iPad émulé, événements tactiles de confiance) et FLUIDITÉ d'un tableau 10 × 8 :
// toucher une cellule, glisser une plage, marges, filets, menu ; tâches longues pendant les gestes.
import { banc, outilsTableau } from './commun.mjs';
const b = await banc();
const T = outilsTableau(b);
const lignes10 = Array.from({ length: 10 }, (_, i) => Array.from({ length: 8 }, (_, j) => (i === 0 ? 'T' + j : i + '.' + j)));
await b.preparer({ annotations: [b.boiteGrille('bt-10', { v: 1, cols: Array(8).fill(0.125), lignes: lignes10, entete: true }, { x: 0.05, y: 0.05, width: 0.9, taille1000: 11 })] });
await b.ouvrirCours({ tablette: true });
const B = async () => (await b.enBase()).find((a) => a.id === 'bt-10');
// sonde : tâches longues (> 50 ms) et durée des images pendant un geste
await b.ev(`(()=>{window.__longues=[];new PerformanceObserver(l=>{for(const e of l.getEntries())window.__longues.push(Math.round(e.duration))}).observe({type:'longtask',buffered:false});return 1})()`);
const longues = async () => { const v = await b.ev(`window.__longues.splice(0)`); return v; };
// toucher la boîte : sélection ; toucher une cellule : édition, curseur dedans
await b.tape(await b.pos(`document.querySelector('${T.box} .btab-td[data-i="4"][data-j="4"]')`, false));
await b.tape(await T.posCell(4, 4)); await b.dormir(500);
b.ok((await T.focus()) === '4:4', 'au doigt : toucher la boîte sélectionnée ouvre la cellule touchée', await T.focus());
await longues();
// glisser au doigt d'une cellule à une autre : la plage
const t0 = Date.now();
await b.doigt(await T.posCell(2, 1), await T.posCell(5, 3), 12); await b.dormir(300);
b.ok((await T.selTd()).split(' ').length === 12, 'glisser au doigt de 2:1 à 5:3 : une plage de 4 × 3', await T.selTd());
const lg1 = await longues();
b.ok(!lg1.some((d) => d > 50), 'plage au doigt sur un 10 × 8 : aucune tâche longue (> 50 ms)', JSON.stringify(lg1));
// marges au doigt
await b.tape(await b.pos(`document.querySelector('${T.box} .btab-marge-lig[data-lig="6"]')`, false));
b.ok((await T.selTd()) === [0, 1, 2, 3, 4, 5, 6, 7].map((j) => '6:' + j).join(' '), 'toucher la marge de gauche : la ligne', await T.selTd());
await b.tape(await b.pos(`document.querySelector('${T.box} .btab-marge-col[data-col="2"]')`, false));
b.ok((await T.selTd()).split(' ').length === 10, 'toucher la marge du haut : la colonne');
// filet au doigt (largeur de colonne)
const c0 = (await B()).grille.cols;
const f = await b.pos(`document.querySelector('${T.box} .btab-filet[data-filet="3"]')`, false);
await b.doigt(f, [f[0] + 50, f[1]], 12); await b.dormir(400);
const c1 = (await B()).grille.cols;
b.ok(c1[3] > c0[3] + 0.03, 'glisser un filet au doigt : la colonne s’élargit', JSON.stringify([c0[3], c1[3]]));
// hauteur de ligne au doigt : la ligne sélectionnée (marge) montre son filet
await b.tape(await b.pos(`document.querySelector('${T.box} .btab-marge-lig[data-lig="3"]')`, false));
const fh = await b.pos(`document.querySelector('${T.box} .btab-filet-h[data-filet-h="3"]')`, false);
const nh = await b.ev(`document.querySelectorAll('${T.box} .btab-filet-h').length`);
if (fh) await b.doigt(fh, [fh[0], fh[1] + 40], 12); await b.dormir(400);
const hs = (await B()).grille.hauts;
b.ok(nh === 1 && Array.isArray(hs) && hs[3] > 0, 'au doigt : la ligne sélectionnée a son filet, glisser = hauteur de ligne', JSON.stringify({ nh, hs }));
const lg2 = await longues();
b.ok(!lg2.some((d) => d > 50), 'filet au doigt sur un 10 × 8 : aucune tâche longue', JSON.stringify(lg2));
// menu au doigt : insérer une ligne, chronométré
const p = await b.pos(`[...document.querySelectorAll('.mini-barre [data-option="tableau"]')].find(e=>e.offsetParent)`, false);
await b.tape(p);
b.ok(await b.ev(`!!document.querySelector('.mt-pop')`), 'toucher « Tableau » ouvre le menu');
const dur = await b.ev(`(async()=>{const avant=document.querySelectorAll('${T.box} tr').length;const t=performance.now();document.querySelector('.mt-pop [data-tab="ins-dessous"]').click();for(let k=0;k<100;k++){await new Promise(r=>requestAnimationFrame(r));if(document.querySelectorAll('${T.box} tr').length>avant)return Math.round(performance.now()-t)}return -1})()`);
b.ok(dur >= 0 && dur < 120, 'insérer une ligne dans un 10 × 8 : affiché en moins de 120 ms', dur + ' ms');
const dur2 = await b.ev(`(async()=>{const t=performance.now();document.querySelector('.mt-pop [data-tab="b-toutes"]').click();for(let k=0;k<100;k++){await new Promise(r=>requestAnimationFrame(r));const td=document.querySelector('${T.box} .btab-td');if(getComputedStyle(td).borderTopStyle==='solid')return Math.round(performance.now()-t)}return -1})()`);
b.ok(dur2 >= 0 && dur2 < 120, 'bordures sur un 11 × 8 : affiché en moins de 120 ms', dur2 + ' ms');
await b.capture('bt-ipad-10x8');
// frappe : une cellule du 10 × 8 réagit sans tâche longue
await b.tape(await b.pos(`document.querySelector('.mini-barre [data-option="tableau"]')`, false));
await b.tape(await T.posCell(8, 6)); await b.dormir(300);
await longues();
await b.ecrire('abcdefgh');
const lg3 = await longues();
b.ok((await b.ev(`document.activeElement.innerText`)).endsWith('abcdefgh') && !lg3.some((d) => d > 50), 'frappe dans une cellule du 10 × 8 : aucune tâche longue', JSON.stringify(lg3));
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
