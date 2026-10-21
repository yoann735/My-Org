// (20/10 soir) Flèches souples ou dures : points de contrôle (double-clic / appui long), coudes, courbes, pointes,
// styles de trait, épaisseur, couleur, suppression d'un point, flèche attachée qui suit sa boîte, Annuler ;
// flèches libres (forme « flèche ») ; export PDF ; anciennes flèches identiques. Cours « Boîtes v4 », base LOCALE.
// Usage : node t-fleches.mjs [captures-seules|ipad]
import { banc } from './commun.mjs';
import fs from 'node:fs';
const mode = process.argv[2] || '';
const capturesSeules = mode === 'captures-seules', ipad = mode === 'ipad';
const b = await banc(1440, 900, { tactile: ipad });
const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const ANCIENNES = [
  { id: 'an-f-A', ficheId: 'f-v3-boites', page: 1, x: 0.55, y: 0.30, width: 0.2, height: 0.06, kind: 'libre', type: 'boite', couleur: 'jaune', content: doc('Ancienne A'), ancre: { x: 0.2, y: 0.25, texte: null }, fleche: true, fleches: [{ id: 'flA2', x: 0.3, y: 0.62, texte: null }], createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'an-f-F', ficheId: 'f-v3-boites', page: 1, kind: 'forme', type: 'forme', forme: 'fleche', x: 0.62, y: 0.6, width: 0.25, height: 0.15, couleur: 'corail', epaisseur: 0.0025, createdAt: '2026-10-01T10:00:00.000Z' },
];
await b.S(`for(const a of await S.getAll('annotations'))if(a.ficheId==='f-v3-boites')await S.remove('annotations',a.id);
  for(const r of await S.getAll('reading_position'))if(String(r.id).startsWith('rp:f-v3-boites'))await S.remove('reading_position',r.id);
  for(const a of ${JSON.stringify(ANCIENNES)})await S.put('annotations',a);return 1`);
await b.biblio({ recharger: true });
await b.ouvrir('Boîtes v3'); await b.dormir(1500);
if (ipad) { await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1366, deviceScaleFactor: 2, mobile: true }); await b.dormir(1500); }
await b.ev(`window.__mrZoom(1);1`); await b.dormir(1200);
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0;1`); await b.dormir(800);
await b.outil('Sélection'); await b.dormir(1200);
const P = await b.rect(`document.querySelector('.pdfr-page[data-cle="1"]')`);
await b.capture('fleches-anciennes-' + (capturesSeules ? 'capture' : 'apres'), { x: Math.round(P.x), y: Math.round(P.y), width: Math.round(P.w), height: Math.round(P.h) });
if (capturesSeules) process.exit(0);
const ecart = async (n1, n2) => { const A = fs.readFileSync(`../cap/${n1}.png`).toString('base64'), C = fs.readFileSync(`../cap/${n2}.png`).toString('base64'); return JSON.parse(await b.ev(`Promise.all(['${A}','${C}'].map(s=>new Promise(ok=>{const i=new Image();i.onload=()=>{const k=document.createElement('canvas');k.width=i.width;k.height=i.height;const x=k.getContext('2d');x.drawImage(i,0,0);ok(x.getImageData(0,0,i.width,i.height).data)};i.src='data:image/png;base64,'+s}))).then(([p,q])=>{let n=0,max=0;for(let k=0;k<Math.min(p.length,q.length);k+=4){const d=Math.max(Math.abs(p[k]-q[k]),Math.abs(p[k+1]-q[k+1]),Math.abs(p[k+2]-q[k+2]));if(d>0){n++;max=Math.max(max,d)}}return JSON.stringify({n,max})})`)); };
if (!ipad && fs.existsSync('../cap/fleches-anciennes-capture.png')) { const e = await ecart('fleches-anciennes-capture', 'fleches-anciennes-apres'); b.ok(e.max <= 2, 'anciennes flèches (boîte : principale + 1 ; flèche libre) : rendu identique à l’ancien code', JSON.stringify(e)); }
const pt = (fx, fy) => [P.x + P.w * fx, P.y + P.h * fy];
const toucher = (p, att = 300) => (ipad ? b.tape(p) : b.clic(p, { att })); // au doigt sur iPad
const enBase = (id) => b.S(`return await S.getOne('annotations',${JSON.stringify(id)})`);
const tape2 = async (p) => { // double-clic (souris) — au doigt : appui long
  if (ipad) { await b.c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p[0], y: p[1], id: 1 }] }); await b.dormir(750); await b.c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await b.dormir(400); return; }
  for (const n of [1, 2]) for (const type of ['mousePressed', 'mouseReleased']) await b.c.send('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', clickCount: n });
  await b.dormir(400);
};
// --- nouvelle boîte + une flèche vers la droite
await b.outil('Boîte'); await b.clic(pt(0.1, 0.12), { att: 600 });
for (let i = 0; i < 20 && !(await b.ev(`!!(document.activeElement&&document.activeElement.closest&&document.activeElement.closest('.note-box .ProseMirror'))`)); i++) await b.dormir(100);
await b.ecrire('Source');
const boiteId = await b.S(`const l=(await S.getAll('annotations')).filter(a=>a.ficheId==='f-v3-boites'&&a.type==='boite'&&!a.id.startsWith('an-f'));return l[0].id`);
const selection = async () => { if (!(await b.ev(`!!document.querySelector('.ptb-outil.actif[title^="Sélection"], .tab-outil.actif[aria-label="Sélection"]')`))) await b.outil('Sélection'); };
await selection();
const activer = async () => { const r = await b.rect(`[...document.querySelectorAll('.note-box')].find(e=>/Source/.test(e.innerText))`); await b.clic([r.x + 6, r.y + 3], { att: 400 }); };
await activer();
await b.clic(await b.pos(`document.querySelector('.nb-barre [aria-label="Ajouter une flèche"]')`, false), { att: 300 });
await b.clic(pt(0.45, 0.45), { att: 500 });
await b.T.Escape(); await b.dormir(300); // la boîte n'est plus sélectionnée (sa barre ne recouvrira pas la flèche)
let rec = await enBase(boiteId);
const idf = rec.fleches[0].id;
const milieuSur = (frac) => b.ev(`(()=>{const p=document.querySelector('g.nb-conn[data-conn="${idf}"] .nb-conn-cible');const L=p.getTotalLength();const q=p.getPointAtLength(L*${frac});const m=p.getScreenCTM();return [q.x*m.a+m.e,q.y*m.d+m.f]})()`);
// 1) deux points de contrôle (double-clic / appui long) → flèche DURE à deux coudes
await toucher(await milieuSur(0.5));
await tape2(await milieuSur(0.33)); await tape2(await milieuSur(0.75));
rec = await enBase(boiteId);
let fl = rec.fleches[0];
b.ok(fl.points && fl.points.length === 2 && (fl.type || 'dure') === 'dure', `${ipad ? 'appui long' : 'double-clic'} × 2 : deux points de contrôle, flèche dure`, JSON.stringify(fl.points));
// glisser chaque point pour faire deux coudes
const ctl = (i) => b.pos(`document.querySelector('.nb-ctl[data-conn="${idf}"][data-i="${i}"]')`, false);
let c0 = await ctl(0); if (c0) await (ipad ? b.doigt(c0, [c0[0], c0[1] - 90], 8) : b.glisser(c0, [c0[0], c0[1] - 90], 8));
let c1 = await ctl(1); if (c1) await (ipad ? b.doigt(c1, [c1[0], c1[1] + 90], 8) : b.glisser(c1, [c1[0], c1[1] + 90], 8));
await b.dormir(300);
fl = (await enBase(boiteId)).fleches[0];
const dTrait = () => b.ev(`(document.querySelector('g.nb-conn[data-conn="${idf}"] .nb-conn-trait')||{getAttribute:()=>''}).getAttribute('d')`);
let d = await dTrait();
b.ok((d.match(/L/g) || []).length === 3 && !/C/.test(d), 'flèche dure : 2 coudes (3 segments droits)', d.slice(0, 80));
b.ok(fl.points[0].y < 0.4 && fl.points[1].y > 0.4, 'points déplacés (en fractions de page)', JSON.stringify(fl.points));
await b.capture('fleche-dure' + (ipad ? '-ipad' : ''), { x: Math.round(P.x), y: Math.round(P.y), width: Math.round(P.w * 0.7), height: Math.round(P.h * 0.7) });
// 2) souple
const reglage = async (nom) => { await b.ev(`(()=>{const x=document.querySelector('.barre-fleche [data-reglage="${nom}"]');x&&x.scrollIntoView({block:'nearest',inline:'nearest'});return 1})()`); await b.dormir(ipad ? 700 : 100); await toucher(await b.pos(`document.querySelector('.barre-fleche [data-reglage="${nom}"]')`, false), 400); };
await toucher(await milieuSur(0.5));
await reglage('type');
d = await dTrait();
b.ok(/C/.test(d) && (d.match(/C/g) || []).length === 3, 'Souple : la courbe passe par les 2 points (3 courbes de Bézier)', d.slice(0, 80));
b.ok((await enBase(boiteId)).fleches[0].type === 'souple', 'type « souple » enregistré');
await b.capture('fleche-souple' + (ipad ? '-ipad' : ''), { x: Math.round(P.x), y: Math.round(P.y), width: Math.round(P.w * 0.7), height: Math.round(P.h * 0.7) });
// 3) pointes, trait, épaisseur, couleur
await reglage('debut'); // aucune → ouverte
await reglage('fin'); // pleine → aucune
fl = (await enBase(boiteId)).fleches[0];
const tetes = await b.ev(`[...document.querySelectorAll('g.nb-conn[data-conn="${idf}"] .nb-conn-tete')].map(t=>t.getAttribute('fill'))`);
b.ok(fl.pointes.debut === 'ouverte' && fl.pointes.fin === 'aucune' && tetes.length === 1 && tetes[0] === 'none', 'pointes : départ ouverte, arrivée aucune', JSON.stringify([fl.pointes, tetes]));
await reglage('fin'); await reglage('fin'); // aucune → ouverte → pleine
await reglage('trait');
let dash = await b.ev(`document.querySelector('g.nb-conn[data-conn="${idf}"] .nb-conn-trait').getAttribute('stroke-dasharray')`);
b.ok(!!dash && (await enBase(boiteId)).fleches[0].trait === 'tirets', 'trait : tirets', dash);
await reglage('trait');
dash = await b.ev(`document.querySelector('g.nb-conn[data-conn="${idf}"] .nb-conn-trait').getAttribute('stroke-dasharray')`);
b.ok(/^0\.01 /.test(dash || '') && (await enBase(boiteId)).fleches[0].trait === 'pointilles', 'trait : pointillés', dash);
const larg0 = +(await b.ev(`document.querySelector('g.nb-conn[data-conn="${idf}"] .nb-conn-trait').getAttribute('stroke-width')`));
await reglage('epaisseur');
const larg1 = +(await b.ev(`document.querySelector('g.nb-conn[data-conn="${idf}"] .nb-conn-trait').getAttribute('stroke-width')`));
b.ok(larg1 > larg0, 'épaisseur augmentée', `${larg0} → ${larg1}`);
await b.clic(await b.pos(`document.querySelector('.barre-fleche .sc-bouton')`, false), { att: 400 });
await b.clic(await b.pos(`.scw-panneau .scw-cellule[data-valeur="bleufonce"]`.replace(/^/, 'document.querySelector(\'') + `')`, false), { att: 400 });
b.ok((await enBase(boiteId)).fleches[0].couleur === 'bleufonce' && (await b.ev(`document.querySelector('g.nb-conn[data-conn="${idf}"] .nb-conn-trait').getAttribute('stroke')`)) === '#2563EB', 'couleur de la flèche : bleu');
// 4) supprimer un point (double-clic dessus)
await toucher(await milieuSur(0.5));
c0 = await ctl(0);
if (!ipad) { for (const n of [1, 2]) for (const type of ['mousePressed', 'mouseReleased']) await b.c.send('Input.dispatchMouseEvent', { type, x: c0[0], y: c0[1], button: 'left', clickCount: n }); }
else await b.ev(`document.querySelector('.nb-ctl[data-conn="${idf}"][data-i="0"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));1`);
await b.dormir(400);
b.ok((await enBase(boiteId)).fleches[0].points.length === 1, 'double-clic sur un point : retiré (il en reste 1)');
// 5) Annuler : le point revient
await b.T.Escape(); await b.dormir(150);
await b.touche('z', { meta: true }); await b.dormir(500);
b.ok((await enBase(boiteId)).fleches[0].points.length === 2, 'Annuler : le point retiré revient');
// 6) la flèche suit sa boîte
const debut = async () => (await dTrait()).match(/^M([\d.]+) ([\d.]+)/).slice(1).map(Number);
const d0 = await debut();
const pts0 = JSON.stringify((await enBase(boiteId)).fleches[0].points);
const barre = await b.ev(`(()=>{const r=[...document.querySelectorAll('.note-box')].find(e=>/Source/.test(e.innerText)).querySelector('.nb-bar').getBoundingClientRect();return [r.x+10,r.y+r.height/2]})()`);
await (ipad ? b.doigt(barre, [barre[0] + 60, barre[1] + 40], 8) : b.glisser(barre, [barre[0] + 60, barre[1] + 40], 8)); await b.dormir(400);
const d1 = await debut();
b.ok(Math.hypot(d1[0] - d0[0], d1[1] - d0[1]) > 30 && JSON.stringify((await enBase(boiteId)).fleches[0].points) === pts0, 'boîte déplacée : la flèche reste accrochée (départ suit), ses points restent', `${d0} → ${d1}`);
// 7) flèche LIBRE (forme « flèche ») : point de contrôle + souple
const ligneForme = await b.ev(`(()=>{const p=document.querySelector('.pdfr-forme[data-forme="fleche"] .pf-hit');const L=p.getTotalLength();const q=p.getPointAtLength(L*0.5);const m=p.getScreenCTM();return [q.x*m.a+m.e,q.y*m.d+m.f]})()`);
await b.clic(ligneForme, { att: 300 });
await tape2(ligneForme);
let f = await enBase('an-f-F');
b.ok(f.fleche && f.fleche.points && f.fleche.points.length === 1, 'flèche libre : point de contrôle ajouté (style dans `fleche`)', JSON.stringify(f.fleche));
await b.clic(await b.pos(`document.querySelector('.barre-fleche [data-reglage="type"]')`, false), { att: 400 }); // (21/10) réglages dans la rangée commune
const dForme = await b.ev(`document.querySelector('.pdfr-forme[data-forme="fleche"] .pf-trace').getAttribute('d')`);
f = await enBase('an-f-F');
b.ok(f.fleche.type === 'souple' && /C/.test(dForme) && f.epaisseur === 0.0025 && f.couleur === 'corail', 'flèche libre souple ; épaisseur et couleur de la forme intactes', dForme.slice(0, 60));
// 8) export PDF annoté : sans erreur, flèches comptées
const bilan = await b.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const E=await import(u.find(n=>n.includes('/pdf/exportAnnote.js')));const S=await import(u.find(n=>n.includes('/medrevise/lib/storage.js')));const fi=await S.getOne('fiches','f-v3-boites');const an=(await S.getAll('annotations')).filter(a=>a.ficheId==='f-v3-boites');const r=await E.exporterDepuisBlob(fi.pdfId,[],an);return JSON.stringify({octets:(r.octets||r.bytes||r).length||0,bilan:r.bilan||null})})()`);
b.ok(/fleches":[3-9]/.test(bilan) || /octets":[1-9]/.test(bilan), 'export PDF annoté : flèches stylées exportées sans erreur', bilan);
await b.capture('fleches-fin' + (ipad ? '-ipad' : ''), { x: Math.round(P.x), y: Math.round(P.y), width: Math.round(Math.min(P.w, 1000)), height: Math.round(Math.min(P.h, 700)) });
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' / '));
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
process.exit(0);
