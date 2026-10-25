// §6 TABLEAU (MIRO) : tableau vide (message), « + Carte », double-clic, boîte-tableau (même composant), « → Tableau » depuis
// une boîte du lecteur (déjà posée : montrée), curseurs grab / grabbing / text (lecteur et tableau).  node t-tableau-miro.mjs [tablette]
import { banc, FICHE } from './commun.mjs';
const tablette = process.argv[2] === 'tablette';
const b = await banc();
const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const base = { ficheId: FICHE, page: 1, createdAt: '2026-10-22T08:00:00.000Z', kind: 'libre', type: 'boite', fond: 'plein', gabarit: 'carte', taille1000: 18, tailleTexte: 1.8, bord1000: 1.5, pad1000: [10, 8] };
const G = { v: 1, cols: [0.5, 0.5], entete: true, lignes: [['Rein', 'Rôle'], ['Néphron', 'Filtration']] };
await b.preparer({ annotations: [
  { ...base, id: 'tm-boite', x: 0.55, y: 0.6, width: 0.3, height: 0.08, couleur: 'vert-franc', content: doc('Le néphron filtre le sang') },
  { ...base, id: 'tm-grille', x: 0.55, y: 0.75, width: 0.38, height: 0.1, largeurFixe: true, couleur: 'bleu-franc', grille: G, content: doc('Rein | Rôle') },
] });
await b.ouvrirCours({ tablette });
// disposition du lecteur (en-tête ordinateur : « PDF » / « Tableau » ; tablette : « Le PDF seul » / « Le tableau en plein »)
const dispo = async (lib) => { const re = lib === 'PDF' ? '^(PDF|Le PDF seul)$' : '^(Tableau|Le tableau en plein)$';
  await b.clic(await b.pos(`[...document.querySelectorAll('button:not(.pm-seg-btn)')].find(e=>e.offsetParent&&new RegExp(${JSON.stringify(re)}).test(e.innerText.trim()||e.getAttribute('aria-label')||e.title||''))`, false), { att: 1800 }); };
const curseur = (js) => b.ev(`(()=>{const e=${js};return e?getComputedStyle(e).cursor:null})()`);
// CURSEURS DANS LE LECTEUR
b.ok((await curseur(`document.querySelector('[data-boite="tm-boite"]')`)) === 'grab', 'lecteur : main ouverte (grab) au survol d’une boîte (outil Sélection)');
{ const p = await b.pos(`document.querySelector('[data-boite="tm-boite"]')`, false);
  const s = (type, x, y, extra = {}) => b.c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
  await s('mouseMoved', p[0], p[1]); await s('mousePressed', p[0], p[1]);
  for (let k = 1; k <= 5; k++) { await s('mouseMoved', p[0] + k * 6, p[1] + k * 3, { buttons: 1 }); await b.dormir(30); }
  const pendant = await b.ev(`({classe:document.documentElement.classList.contains('mr-glisse'),curseur:getComputedStyle(document.elementFromPoint(${p[0] + 30},${p[1] + 15})).cursor})`);
  await s('mouseReleased', p[0] + 30, p[1] + 15); await b.dormir(500);
  const apres = await b.ev(`document.documentElement.classList.contains('mr-glisse')`);
  b.ok(pendant.classe && pendant.curseur === 'grabbing' && !apres, 'lecteur : main fermée (grabbing) pendant le glisser, puis plus', JSON.stringify(pendant));
  await b.T.Escape(); await b.dormir(200);
  await b.preparer({ annotations: [{ ...base, id: 'tm-boite', x: 0.55, y: 0.6, width: 0.3, height: 0.08, couleur: 'vert-franc', content: doc('Le néphron filtre le sang') }, { ...base, id: 'tm-grille', x: 0.55, y: 0.75, width: 0.38, height: 0.1, largeurFixe: true, couleur: 'bleu-franc', grille: G, content: doc('Rein | Rôle') }] });
  await b.ouvrirCours({ tablette }); }
await b.clic(await b.pos(`document.querySelector('[data-boite="tm-boite"]')`, false), { att: 500 });
await b.clic(await b.pos(`document.querySelector('[data-boite="tm-boite"]')`, false), { att: 900 });
b.ok((await curseur(`document.querySelector('[data-boite="tm-boite"] .ProseMirror')`)) === 'text', 'lecteur : curseur « text » seulement en édition');
await b.T.Escape(); await b.T.Escape(); await b.dormir(300);
// (26/10, docs/compte-rendu-nettoyage-v2.md §2) « → Tableau » est retiré des mini barres : il ne doit plus y être
await b.clic(await b.pos(`document.querySelector('[data-boite="tm-boite"]')`, false), { att: 500 });
b.ok(!(await b.ev(`!!(${b.option('vers-tableau')})`)), 'mini barre d’une boîte : plus de « → Tableau » (retiré le 26/10)');
await b.T.Escape(); await b.dormir(300);
let B;
// TABLEAU VIDE : message centré
await b.S(`await S.remove('board','board:${FICHE}');return 1`);
await dispo('Tableau'); await b.dormir(600);
const vide = await b.ev(`(()=>{const e=document.querySelector('.tb2-vide-tableau');const v=document.querySelector('.tb2-vue');if(!e||!v)return null;const r=e.getBoundingClientRect(),q=v.getBoundingClientRect();return {texte:e.innerText.trim(),dx:Math.round(r.x+r.width/2-(q.x+q.width/2)),dy:Math.round(r.y+r.height/2-(q.y+q.height/2))}})()`);
b.ok(vide && vide.texte === 'Double-cliquez pour ajouter une carte' && Math.abs(vide.dx) < 4 && Math.abs(vide.dy) < 4, 'tableau vide : « Double-cliquez pour ajouter une carte », centré', JSON.stringify(vide));
{ const r = await b.rect(`document.querySelector('.tb2')`); await b.capture('so-tableau-vide' + (tablette ? '-tablette' : ''), { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.w), height: Math.round(Math.min(r.h, 900 - r.y)) }); }
// « + Carte » visible dans la barre du tableau
const plusCarte = await b.ev(`(()=>{const e=document.querySelector('.tb2-barre [data-act="carte"]');if(!e)return null;const r=e.getBoundingClientRect();return {texte:e.innerText.trim(),visible:r.width>0&&r.height>0,titre:e.title}})()`);
b.ok(plusCarte && plusCarte.visible && /Carte/.test(plusCarte.texte), 'bouton « + Carte » visible dans la barre du tableau', JSON.stringify(plusCarte));
await b.clic(await b.pos(`document.querySelector('.tb2-barre [data-act="carte"]')`, false), { att: 700 });
await b.ecrire('Carte du bouton'); await b.T.Escape(); await b.dormir(600);
B = await b.board();
b.ok(B.objects.length === 1 && /Carte du bouton/.test(B.objects[0].titre + B.objects[0].corps), '« + Carte » crée une carte (en édition tout de suite)', JSON.stringify(B.objects.map((o) => o.titre || o.corps)));
// double-clic sur le fond : une carte à cet endroit
const V = await b.rect(`document.querySelector('.tb2-vue')`);
const pt = [Math.round(V.x + V.w * 0.7), Math.round(V.y + V.h * 0.65)];
await b.clic(pt, { n: 1, att: 60 }); await b.clic(pt, { n: 2, att: 800 });
await b.T.Escape(); await b.dormir(500);
const c3 = await b.ev(`(()=>{const l=[...document.querySelectorAll('.tb2-carte')].map(e=>e.getBoundingClientRect());const r=l.find(r=>${pt[0]}>=r.left&&${pt[0]}<=r.right&&${pt[1]}>=r.top&&${pt[1]}<=r.bottom);return {n:l.length,sous:!!r}})()`);
b.ok(c3.n === 2 && c3.sous, 'double-clic sur le fond : une carte apparaît à cet endroit', JSON.stringify(c3));
// curseurs du tableau
await b.T.Escape();
b.ok((await curseur(`document.querySelector('.tb2-carte')`)) === 'grab', 'tableau : main ouverte au survol d’une carte');
{ const p = await b.pos(`document.querySelector('.tb2-carte')`, false);
  const s = (type, x, y, extra = {}) => b.c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
  await s('mouseMoved', p[0], p[1]); await s('mousePressed', p[0], p[1]);
  for (let k = 1; k <= 5; k++) { await s('mouseMoved', p[0] + k * 6, p[1] + k * 4, { buttons: 1 }); await b.dormir(30); }
  const pendant = await b.ev(`({classe:document.documentElement.classList.contains('mr-glisse'),curseur:getComputedStyle(document.elementFromPoint(${p[0] + 30},${p[1] + 20})).cursor})`);
  await s('mouseReleased', p[0] + 30, p[1] + 20); await b.dormir(500);
  b.ok(pendant.classe && pendant.curseur === 'grabbing', 'tableau : main fermée pendant le glisser d’une carte', JSON.stringify(pendant)); }
// BOÎTE-TABLEAU dans le tableau : même composant, Tab, + ligne
await b.clic(await b.pos(`document.querySelector('.tb2-barre [data-act="carte-tableau"]')`, false), { att: 900 });
const f0 = await b.ev(`(()=>{const a=document.activeElement;return a&&a.classList.contains('btab-cell')?a.dataset.i+':'+a.dataset.j:null})()`);
await b.ecrire('Os'); await b.T.Tab(); await b.ecrire('Rôle'); await b.T.Tab(); await b.ecrire('Note'); await b.T.Tab(); await b.ecrire('Fémur');
await b.T.Escape(); await b.dormir(700);
B = await b.board();
const cg = B.objects.find((o) => o.grille);
b.ok(f0 === '0:0' && cg && cg.grille.lignes.length === 4 && cg.grille.cols.length === 3 && JSON.stringify(cg.grille.lignes[0]) === '["Os","Rôle","Note"]' && cg.grille.lignes[1][0] === 'Fémur', 'tableau › Boîte-tableau : 3 × 4, en édition, Tab entre cellules', JSON.stringify(cg && cg.grille.lignes));
b.ok((await b.ev(`!!document.querySelector('.tb2-carte.carte-grille .btab .btab-table')`)), 'la carte rend le MÊME composant (BoiteTableau) que le lecteur');
await b.clic(await b.pos(`document.querySelector('.tb2-carte.carte-grille')`, false), { att: 500 });
const og = (await b.optionsBarre())[0];
b.ok(og.includes('tableau'), 'mini barre de la carte-tableau : le menu Tableau (+ ligne, + colonne, en-tête…)', JSON.stringify(og));
await b.tableau('ins-dessous'); await b.tableau('ins-droite');
B = await b.board(); const cg2 = B.objects.find((o) => o.grille);
b.ok(cg2.grille.lignes.length === 5 && cg2.grille.cols.length === 4, '+ ligne / + colonne dans le tableau Miro', JSON.stringify([cg2.grille.lignes.length, cg2.grille.cols.length]));
await b.margeTableau('col', 3, '.tb2-carte.carte-grille'); await b.tableau('sup-colonne');
{ const r = await b.rect(`document.querySelector('.tb2-carte.carte-grille')`), m = await b.rect(`[...document.querySelectorAll('.mini-barre')].find(e=>e.offsetParent)`);
  const x0 = Math.min(r.x, m.x) - 12, y0 = Math.min(r.y, m.y) - 12; await b.capture('so-tableau-boite-tableau' + (tablette ? '-tablette' : ''), { x: Math.round(x0), y: Math.round(y0), width: Math.round(Math.max(r.r, m.r) - x0 + 12), height: Math.round(Math.max(r.b, m.b) - y0 + 12) }); }
await b.T.Escape();
await dispo('PDF');
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
