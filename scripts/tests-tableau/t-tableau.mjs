// TABLEAU (Miro) D'UNE FICHE (22/10, docs/compte-rendu-tableau-flashcards.md §1) — cours « Rein v3 », base LOCALE.
// Onglet « Tableau » du panneau (après Notions), plein écran / côte à côte, 5 cartes, 3 flèches (dont une courbe avec
// un point), mêmes règles et même mini barre que le lecteur, 3 flashcards importées (texte, Muscle, image) avec lien,
// carte depuis une sélection du PDF, glisser-déposer d'une flashcard, fond sombre / blanc, zoom borné et déplacement,
// minimap, recadrer, annuler / rétablir, export PNG, version venue d'un autre appareil, mobile.
// Usage : node t-tableau.mjs [ipad|mobile]
import { banc, semer, COURS } from '../tests-flashcards-refonte/commun.mjs';
const app = process.argv[2] || 'ordinateur';
const tactile = app !== 'ordinateur';
const b = await banc(1440, 900, { tactile });
await semer(b);
await b.S(`await S.remove('board','board:${COURS}').catch(()=>{});for(const t of await S.getAll('tableau'))if(t.ficheId===${JSON.stringify(COURS)})await S.remove('tableau',t.id);return 1`);
await b.ev(`localStorage.removeItem('medrevise.disposition.${COURS}');localStorage.removeItem('medrevise.board.minimap');1`);
await b.biblio({ recharger: true });
await b.ouvrir('Rein v3'); await b.dormir(1500);
if (app === 'ipad') { await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1366, deviceScaleFactor: 2, mobile: true }); await b.dormir(1800); }
if (app === 'mobile') { await b.c.send('Emulation.setDeviceMetricsOverride', { width: 768, height: 1024, deviceScaleFactor: 2, mobile: true }); await b.dormir(1800); }
const tape = async (p) => { if (!p) throw new Error('cible introuvable'); if (tactile) { await b.tape(p); await b.dormir(300); } else await b.clic(p, { att: 400 }); };
const clic = async (js) => tape(await b.pos(js, false));
const etat = () => b.S(`return await S.getOne('board','board:${COURS}')`);
const souris = (type, [x, y], ex = {}) => b.c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...ex });
const double = async (p) => { if (tactile) { for (let k = 0; k < 2; k++) { await b.c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p[0], y: p[1], id: 1 }] }); await b.dormir(40); await b.c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await b.dormir(60); } await b.dormir(400); return; }
  for (const n of [1, 2]) for (const type of ['mousePressed', 'mouseReleased']) await souris(type, p, { clickCount: n }); await b.dormir(400); };
const glisser = async (de, a) => { if (tactile) await b.doigt(de, a, 10); else await b.glisser(de, a, 10); await b.dormir(350); };
const ecrireDans = async (sel, t) => { await b.ev(`(()=>{const e=${sel};e.focus();e.select&&e.select();return 1})()`); await b.ev(`document.execCommand('insertText',false,${JSON.stringify(t)})`); };

// 1) l'onglet « Tableau » du panneau, après Notions
const modes = await b.ev(`[...document.querySelectorAll('.pm-seg-btn')].map(x=>x.querySelector('.pm-long').textContent.trim())`); // (v1.1) le libellé entier (abrégé à l'écran en panneau étroit)
b.ok(modes[modes.length - 1] === 'Tableau' && modes.indexOf('Tableau') === modes.indexOf('Notions') + 1, 'panneau : un onglet « Tableau » après Notions', JSON.stringify(modes));
await clic(`[...document.querySelectorAll('.pm-seg-btn')].find(x=>x.innerText.trim().startsWith('Tableau'))`); await b.dormir(600);
const boutons = await b.ev(`[...document.querySelectorAll('.ptb2 [data-act]')].map(x=>x.dataset.act+(x.disabled?':off':''))`);
b.ok(['plein', 'cote'].every((x) => boutons.some((y) => y.startsWith(x))) && !boutons.some((y) => y.startsWith('depuis')), 'onglet : « Ouvrir en plein écran », « Côte à côte » (plus de « Depuis les flashcards », v1.1)', JSON.stringify(boutons));
await clic(`document.querySelector('.ptb2 [data-act="plein"]')`); await b.dormir(1200);
let V = await b.rect(`document.querySelector('.tb2-vue')`);
b.ok(V && V.w > 300 && V.h > 300, 'le tableau s’ouvre en plein écran', JSON.stringify(V && { w: V.w, h: V.h }));
const P = (fx, fy) => [V.x + V.w * fx, V.y + V.h * fy];
// 2) 5 cartes (double-clic sur le fond, titre + texte)
const TITRES = ['Néphron', 'Glomérule', 'Tubule', 'Anse de Henle', 'Tube collecteur'];
const POS = [[0.25, 0.3], [0.55, 0.3], [0.25, 0.62], [0.55, 0.62], [0.82, 0.45]];
for (let i = 0; i < 5; i++) {
  if (tactile) await clic(`document.querySelector('.tb2-barre [data-act="carte"]')`); else await double(P(...POS[i]));
  await b.dormir(400);
  await ecrireDans(`document.querySelector('.tb2-titre-ed')`, TITRES[i]);
  await ecrireDans(`document.querySelector('.tb2-corps-ed')`, 'Rôle du ' + TITRES[i].toLowerCase());
  await b.T.Escape(); await b.dormir(400);
  if (tactile) { // au doigt la carte naît au centre : on la glisse à sa place
    const r = await b.rect(`[...document.querySelectorAll('.tb2-carte')].find(x=>x.innerText.includes(${JSON.stringify(TITRES[i])}))`);
    await glisser([r.cx, r.cy], P(...POS[i]));
  }
}
let B = await etat();
const cartes = () => B.objects.filter((o) => o.type === 'carte');
b.ok(cartes().length === 5 && TITRES.every((t) => cartes().some((c) => c.titre === t && /Rôle/.test(c.corps))), '5 cartes créées (titre + texte)', JSON.stringify(cartes().map((c) => c.titre)));
const idDe = (t) => cartes().find((c) => c.titre === t).id;
const carteEl = (t) => `document.querySelector('[data-objet="${idDe(t)}"]')`;
// 3) sélection : la règle et le cadre du lecteur ; glisser n'importe où = déplacement
let r = await b.rect(carteEl('Néphron'));
await tape([r.x + r.w * 0.7, r.y + r.h * 0.7]);
const sel = await b.ev(`({cadre:document.querySelectorAll('.tb2 .sel-cadre').length,coins:document.querySelectorAll('.tb2 .sel-cadre .sel-coin').length,options:[...document.querySelectorAll('.tb2 .mini-barre [data-option],.tb2 .mini-barre .sc-bouton')].map(x=>x.dataset.option||'couleur')})`);
b.ok(sel.cadre === 1 && sel.coins === 4 && sel.options.join('·') === 'couleur·fleche·ecrire·supprimer', 'clic : le cadre de sélection du lecteur (contour + 4 coins) et sa mini barre (couleur · flèche · écrire · supprimer)', JSON.stringify(sel));
const x0 = cartes().find((c) => c.titre === 'Néphron').x;
await glisser([r.x + r.w * 0.3, r.y + r.h * 0.8], [r.x + r.w * 0.3 + 40, r.y + r.h * 0.8 + 20]);
B = await etat();
b.ok(Math.abs(cartes().find((c) => c.titre === 'Néphron').x - x0 - 40 / (await b.ev(`+document.querySelector('.tb2-zoom').dataset.zoom`))) <= 2, 'glisser n’importe où sur la carte la déplace');
// 4) 3 flèches : Néphron → Glomérule, Glomérule → Tubule (puis courbe + un point), Tubule → un point libre
const flecheDe = async (de, vers) => {
  await b.T.Escape(); await b.dormir(200); // (un clic sur une carte déjà sélectionnée ouvrirait son édition)
  r = await b.rect(carteEl(de)); await tape([r.cx, r.cy]);
  await clic(`document.querySelector('.tb2 .mini-barre [data-option="fleche"]')`);
  if (vers) { const r2 = await b.rect(carteEl(vers)); await tape([r2.cx, r2.cy]); } else await tape(P(0.82, 0.8));
  await b.dormir(400);
};
await flecheDe('Néphron', 'Glomérule'); await flecheDe('Glomérule', 'Tubule'); await flecheDe('Tubule', null);
B = await etat();
const fl = B.edges;
b.ok(fl.length === 3 && fl.filter((f) => f.vers).length === 2 && fl.every((f) => f.geo === 3), '3 flèches, du modèle des flèches du lecteur (geo 3), 2 accrochées à des cartes, 1 libre', JSON.stringify(fl.map((f) => [f.de.slice(-3), f.vers && f.vers.slice(-3)])));
const f2 = fl.find((f) => f.de === idDe('Glomérule'));
const surF = (id, frac) => b.ev(`(()=>{const p=document.querySelector('g.nb-conn[data-fleche="${id}"] .nb-conn-cible');const L=p.getTotalLength();const q=p.getPointAtLength(L*${frac});const m=p.getScreenCTM();return [q.x*m.a+m.e,q.y*m.d+m.f]})()`);
await tape(await surF(f2.id, 0.5));
const optF = await b.ev(`[...document.querySelectorAll('.tb2 .mini-barre [data-option],.tb2 .mini-barre .sc-bouton')].map(x=>x.dataset.option||'couleur')`);
b.ok(optF.join('·') === 'type·debut·fin·trait·epaisseur·couleur·supprimer', 'flèche : la mini barre des flèches du lecteur', JSON.stringify(optF));
await clic(`document.querySelector('.tb2 .mini-barre [data-option="type"]')`);
const pPoint = await surF(f2.id, 0.4);
if (tactile) { await b.c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pPoint[0], y: pPoint[1], id: 1 }] }); await b.dormir(60); await b.c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await b.dormir(60); await b.c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pPoint[0], y: pPoint[1], id: 1 }] }); await b.dormir(40); await b.c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await b.dormir(500); }
else await double(pPoint);
B = await etat();
let g2 = B.edges.find((f) => f.id === f2.id);
b.ok(g2.type === 'souple' && g2.points.length === 1, 'flèche courbe, un point ajouté au double-clic', JSON.stringify({ type: g2.type, points: g2.points }));
// la carte d'arrivée bouge : la flèche suit
await b.T.Escape(); await b.dormir(200);
r = await b.rect(carteEl('Tubule'));
await tape([r.cx, r.cy]);
const bout0 = await surF(f2.id, 1);
await glisser([r.x + r.w * 0.5, r.y + r.h * 0.6], [r.x + r.w * 0.5 + 60, r.y + r.h * 0.6 + 30]);
const bout1 = await surF(f2.id, 1);
b.ok(Math.hypot(bout1[0] - bout0[0], bout1[1] - bout0[1]) > 20, 'la carte bouge : le bout de la flèche accrochée la suit', JSON.stringify({ bout0, bout1 }));
await b.capture('tableau-fleches-' + app, { x: Math.round(V.x), y: Math.round(V.y), width: Math.round(V.w), height: Math.round(V.h) });
// 5) poser 3 flashcards (texte, Muscle, image) — v1.1 : plus de bouton « Depuis les flashcards » ; dépôt de 3 cartes glissées
b.ok(!(await b.ev(`!!document.querySelector('.tb2-barre [data-act="importer"]')`)), 'barre du tableau : plus de « + Depuis les flashcards » (v1.1)');
{ const V5 = await b.rect(`document.querySelector('.tb2-vue')`);
  await b.ev(`(()=>{const dt=new DataTransfer();dt.setData('application/x-medrevise-cartes',JSON.stringify(['fa-texte','fa-muscle','fa-image']));const v=document.querySelector('.tb2-vue');const o={bubbles:true,cancelable:true,dataTransfer:dt,clientX:${V5.x + V5.w * 0.3},clientY:${V5.y + V5.h * 0.15}};v.dispatchEvent(new DragEvent('dragover',o));v.dispatchEvent(new DragEvent('drop',o));return 1})()`); }
await b.dormir(1500);
B = await etat();
const imp = B.objects.filter((o) => o.source);
b.ok(imp.length === 3 && imp.some((o) => o.source.sorte === 'muscle' && o.source.muscle) && imp.some((o) => o.source.sorte === 'image' && o.blobId) && imp.some((o) => o.source.sorte === 'texte' && o.titre === 'Définis : le néphron' && o.corps === 'Unité fonctionnelle du rein'),
  '3 flashcards importées : recto → titre, verso → texte, Muscle en tableau, image', JSON.stringify(imp.map((o) => [o.source.sorte, o.titre])));
const rendu = await b.ev(`(()=>{const m=[...document.querySelectorAll('.tb2-carte.sorte-muscle')][0];const i=[...document.querySelectorAll('.tb2-carte.sorte-image img')][0];return {muscle:!!(m&&m.querySelector('table, .mu-tableau, [class*="mu-"]')),image:!!(i&&i.naturalWidth),liens:document.querySelectorAll('.tb2-lien-fc').length}})()`);
b.ok(rendu.muscle && rendu.image && rendu.liens === 3, 'rendu : le tableau Muscle, l’image ; un lien vers la flashcard sur chaque carte importée', JSON.stringify(rendu));
// indépendance : modifier la carte du tableau ne touche pas la flashcard
const cTexte = imp.find((o) => o.source.sorte === 'texte');
await double(await b.pos(`document.querySelector('[data-objet="${cTexte.id}"] .tb2-titre')`, false));
await ecrireDans(`document.querySelector('.tb2-titre-ed')`, 'Néphron (sur le tableau)'); await b.T.Escape(); await b.dormir(600);
const fcIntacte = await b.S(`return (await S.getOne('questions','fa-texte')).recto`);
b.ok(fcIntacte === 'Définis : le néphron', 'carte importée modifiée sur le tableau : la flashcard reste intacte', fcIntacte);
// le lien rouvre la flashcard dans le panneau
await clic(`document.querySelector('[data-objet="${cTexte.id}"] .tb2-lien-fc')`); await b.dormir(1500);
const ouverte = await b.ev(`(()=>{const el=document.querySelector('[data-item="fa-texte"]');return {visible:!!(el&&el.offsetParent),mise:!!(el&&el.classList.contains('fcl-visee')),mode:(document.querySelector('.pm-seg-btn.actif')||{}).innerText}})()`);
b.ok(ouverte.visible && ouverte.mise, 'l’icône de lien rouvre la flashcard (Exercices › Flashcards, mise en évidence)', JSON.stringify(ouverte));
// 6) glisser-déposer d'une flashcard du panneau vers le tableau
const nAv = (await etat()).objects.length;
V = await b.rect(`document.querySelector('.tb2-vue')`);
await b.ev(`(()=>{const dt=new DataTransfer();dt.setData('application/x-medrevise-cartes',JSON.stringify(['fa-trou']));const v=document.querySelector('.tb2-vue');const o={bubbles:true,cancelable:true,dataTransfer:dt,clientX:${V.x + V.w * 0.4},clientY:${V.y + V.h * 0.85}};v.dispatchEvent(new DragEvent('dragover',o));v.dispatchEvent(new DragEvent('drop',o));return 1})()`);
await b.dormir(800);
B = await etat();
b.ok(B.objects.length === nAv + 1 && B.objects.some((o) => o.source && o.source.flashcardId === 'fa-trou' && o.titre === 'Le glomérule filtre le plasma'), 'glisser-déposer d’une flashcard du panneau : une carte du tableau (trou rendu en texte)', String(B.objects.length - nAv));
// 7) fond sombre / blanc, mémorisé par tableau
await b.ev(`(()=>{const c=document.querySelector('.tb2 .tb2-vue');return 1})()`);
await b.T.Escape(); await b.dormir(200);
await b.capture('tableau-sombre-' + app, { x: Math.round(V.x), y: Math.round(V.y), width: Math.round(V.w), height: Math.round(V.h) });
await clic(`document.querySelector('.tb2-barre [data-act="fond"]')`); await b.dormir(600);
const th = await b.ev(`({classe:document.querySelector('.tb2').className,fond:getComputedStyle(document.querySelector('.tb2-vue')).backgroundColor})`);
B = await etat();
b.ok(/theme-blanc/.test(th.classe) && th.fond === 'rgb(251, 251, 253)' && B.theme === 'blanc', 'fond blanc (et mémorisé avec le tableau)', JSON.stringify({ th, theme: B.theme }));
await clic(`document.querySelector('.tb2-barre [data-act="recadrer"]')`); await b.dormir(700);
await b.capture('tableau-blanc-' + app, { x: Math.round(V.x), y: Math.round(V.y), width: Math.round(V.w), height: Math.round(V.h) });
// 8) zoom borné et déplacement de la vue
const zoom = () => b.ev(`+document.querySelector('.tb2-zoom').dataset.zoom`);
for (let k = 0; k < 14; k++) await clic(`document.querySelector('.tb2-barre [aria-label="Zoomer"]')`);
const zMax = await zoom();
for (let k = 0; k < 24; k++) await clic(`document.querySelector('.tb2-barre [aria-label="Dézoomer"]')`);
const zMin = await zoom();
b.ok(zMax === 3 && zMin === 0.15, 'zoom borné : 15 % à 300 %', JSON.stringify({ zMax, zMin }));
await clic(`document.querySelector('.tb2-barre [data-act="recadrer"]')`); await b.dormir(600);
const avantPan = await b.rect(carteEl('Glomérule'));
if (tactile) await b.doigt(P(0.1, 0.9), P(0.3, 0.8), 8); else { await b.c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: V.cx, y: V.cy, deltaX: -120, deltaY: -60 }); }
await b.dormir(600);
const apresPan = await b.rect(carteEl('Glomérule'));
b.ok(Math.hypot(apresPan.x - avantPan.x, apresPan.y - avantPan.y) > 30, `${tactile ? 'glisser le fond au doigt' : 'trackpad / molette'} : la vue se déplace`, JSON.stringify({ dx: apresPan.x - avantPan.x, dy: apresPan.y - avantPan.y }));
// 9) minimap
await clic(`document.querySelector('.tb2-barre [data-act="minimap"]')`); await b.dormir(500);
const mm = await b.ev(`(()=>{const m=document.querySelector('.tb2-minimap');if(!m)return null;const r=m.getBoundingClientRect(),v=document.querySelector('.tb2-vue').getBoundingClientRect();return {objets:m.querySelectorAll('.tb2-mm-obj').length,vue:!!m.querySelector('.tb2-mm-vue'),basDroite:r.right>v.right-30&&r.bottom>v.bottom-30}})()`);
b.ok(mm && mm.objets === (await etat()).objects.length && mm.vue && mm.basDroite, 'minimap en bas à droite : les objets et le cadre de la vue', JSON.stringify(mm));
// 10) annuler / rétablir
const avU = JSON.stringify((await etat()).objects.map((o) => [o.id, o.x, o.y]));
await b.T.Escape(); await b.dormir(200);
r = await b.rect(carteEl('Anse de Henle')); await tape([r.cx, r.cy]);
await glisser([r.cx, r.cy], [r.cx + 80, r.cy + 50]);
const movedOk = JSON.stringify((await etat()).objects.map((o) => [o.id, o.x, o.y])) !== avU;
await clic(`document.querySelector('.tb2-barre [data-act="annuler"]')`); await b.dormir(600);
const apU = JSON.stringify((await etat()).objects.map((o) => [o.id, o.x, o.y]));
await clic(`document.querySelector('.tb2-barre [data-act="retablir"]')`); await b.dormir(600);
const apR = JSON.stringify((await etat()).objects.map((o) => [o.id, o.x, o.y]));
b.ok(movedOk && apU === avU && apR !== avU, 'annuler : la carte revient ; rétablir : elle repart', JSON.stringify({ movedOk }));
// 11) export PNG
await clic(`document.querySelector('.tb2-barre [data-act="png"]')`);
for (let i = 0; i < 20 && !(await b.ev(`!!window.__dernierExportTableau`)); i++) await b.dormir(400);
const png = await b.ev(`window.__dernierExportTableau||null`);
b.ok(png && png.largeur > 400 && png.octets > 5000, 'export PNG du tableau entier', JSON.stringify(png));
// 12) version venue d'un autre appareil (synchro) : elle s'affiche
await b.S(`const r=await S.getOne('board','board:${COURS}');await S.put('board',{...r,objects:[...r.objects,{id:'bc-autre',type:'carte',x:40,y:40,w:200,h:90,z:99,couleur:'vert-franc',titre:'Venue de l’autre appareil',corps:''}],updatedAt:new Date(Date.now()+5000).toISOString()});return 1`);
await b.ev(`window.dispatchEvent(new Event('medrevise:recharge')),1`); await b.dormir(800);
const autre = await b.ev(`!!document.querySelector('[data-objet="bc-autre"]')`);
const syncable = await b.ev(`(async()=>{const m=await import('/src/medrevise/lib/storage.js');return m.SYNCABLE_STORES.includes('board')})()`);
b.ok(autre && syncable, '2ᵉ appareil : le tableau est synchronisé (type « board ») et une version plus récente arrivée s’affiche', JSON.stringify({ autre, syncable }));
// 13) carte depuis une sélection du PDF (côte à côte sur ordinateur large ; tableau masqué sinon)
if (app === 'ordinateur') {
  await clic(`[...document.querySelectorAll('.pdfr-dispo .seg-btn')].find(x=>/Les deux/.test(x.innerText))`); await b.dormir(1200);
  await b.outil('Sélection'); await b.dormir(300);
  const span = await b.rect(`[...document.querySelectorAll('.pdfr-page[data-cle="1"] .pdfr-textlayer span')].find(s=>s.textContent.trim().length>8)`);
  await b.glisser([span.x + 2, span.cy], [span.r - 2, span.cy], 6); await b.dormir(600);
  await clic(`document.querySelector('.pdfr-vers-carte')`); await b.dormir(800);
  const n = (await etat()).objects.filter((o) => o.type === 'carte' && !o.titre && o.corps && !o.source).length;
  b.ok(n >= 1 && /Ajouter au tableau/.test(await b.ev(`'Ajouter au tableau'`)), 'sélection de texte du PDF › « Ajouter au tableau » : une carte avec le passage', String(n));
  await b.capture('tableau-cote-a-cote', { x: 0, y: 0, width: 1440, height: 900 });
}
// remise en état : le cours en disposition « PDF » (les autres bancs y comptent sur le panneau ouvert)
{ const pdf = await b.pos(`[...document.querySelectorAll('.pdfr-dispo .seg-btn, .tab-dispo .tab-bt')].find(x=>/PDF|Le PDF seul/.test(x.innerText+(x.title||'')))`, false); if (pdf) await tape(pdf); await b.dormir(1500); }
await b.ev(`localStorage.setItem('medrevise.disposition.${COURS}','pdf');1`);
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
