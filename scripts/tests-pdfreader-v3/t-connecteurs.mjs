// (20/10) Connecteurs de boîtes : toutes les flèches se retirent de la même façon (la première comprise),
// boîte sans flèche valide, ajout identique pour la 1re et les suivantes, Annuler / Rétablir, anciennes boîtes
// converties à la lecture SANS rien réécrire. Cours « Boîtes v3 » (cours.pdf) de la base LOCALE du banc.
// Usage : node t-connecteurs.mjs [captures-seules]   (captures-seules : pour comparer avec l'ancien code)
import { banc } from './commun.mjs';
const capturesSeules = process.argv[2] === 'captures-seules';
const b = await banc(1440, 900);
const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const ANCIENNES = [
  { id: 'an-v3-A', ficheId: 'f-v3-boites', page: 1, x: 0.55, y: 0.30, width: 0.2, height: 0.06, kind: 'libre', type: 'boite', couleur: 'jaune', content: doc('Ancienne A : principale + 1'), ancre: { x: 0.2, y: 0.25, texte: null }, fleche: true, fleches: [{ id: 'flA2', x: 0.3, y: 0.62, texte: null }], createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'an-v3-B', ficheId: 'f-v3-boites', page: 1, x: 0.6, y: 0.66, width: 0.2, height: 0.06, kind: 'libre', type: 'boite', couleur: 'vert', content: doc('Ancienne B : épinglée'), ancre: { x: 0.45, y: 0.82, texte: null }, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'an-v3-C', ficheId: 'f-v3-boites', page: 1, x: 0.08, y: 0.78, width: 0.2, height: 0.06, kind: 'libre', type: 'boite', couleur: 'bleu', content: doc('Ancienne C : sans flèche'), createdAt: '2026-10-01T10:00:00.000Z' },
];
await b.S(`if(!await S.getOne('fiches','f-v3-boites')){}
  for(const a of await S.getAll('annotations'))if(a.ficheId==='f-v3-boites')await S.remove('annotations',a.id);
  for(const r of await S.getAll('reading_position'))if(String(r.id).startsWith('rp:f-v3-boites'))await S.remove('reading_position',r.id);
  for(const a of ${JSON.stringify(ANCIENNES)})await S.put('annotations',a);return 1`);
if (!(await b.S(`return !!(await S.getOne('fiches','f-v3-boites'))`))) await b.semer('f-v3-boites', 'Boîtes v3', 'cours.pdf');
await b.biblio({ recharger: true });
await b.ouvrir('Boîtes v3'); await b.dormir(1800);
await b.ev(`window.__mrZoom(1);1`); await b.dormir(1200);
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0;1`); await b.dormir(800);
await b.outil('Sélection'); await b.dormir(300);
const page1 = await b.rect(`document.querySelector('.pdfr-page[data-cle="1"]')`);
await b.capture('conn-anciennes-' + (capturesSeules ? 'capture' : 'apres'), { x: Math.round(page1.x), y: Math.round(page1.y), width: Math.round(page1.w), height: Math.round(page1.h) });
if (capturesSeules) process.exit(0);

const enBase = (id) => b.S(`const a=await S.getOne('annotations',${JSON.stringify(id)});return a&&{ancre:a.ancre||null,fleche:!!a.fleche,fleches:(a.fleches||[]).map(f=>f.id)}`);
const nbConn = (id) => b.ev(`(()=>{const n=[...document.querySelectorAll('.note-box')].find(e=>e.innerText.includes(${JSON.stringify(id)}));return document.querySelectorAll('.pdfr-page[data-cle="1"] .nb-ancre[data-conn]').length})()`);
const connDe = (boxId) => b.ev(`(()=>{const ids=[];document.querySelectorAll('.pdfr-page[data-cle="1"] g.nb-conn').forEach(g=>ids.push(g.dataset.conn));return ids})()`);
const milieu = (conn) => b.ev(`(()=>{const l=document.querySelector('.pdfr-page[data-cle="1"] g.nb-conn[data-conn="${conn}"] line.nb-conn-cible');if(!l)return null;const r=l.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
const avant = await enBase('an-v3-A');
b.ok(JSON.stringify(await connDe()) === JSON.stringify(['principale', 'flA2']), 'ancienne boîte A : 2 connecteurs (la principale convertie à la lecture, en premier)', JSON.stringify(await connDe()));
b.ok(await b.ev(`document.querySelectorAll('.pdfr-page[data-cle="1"] .nb-ancre:not([data-conn])').length`) === 1, 'ancienne boîte B (épinglée sans flèche) : son repère rond, comme avant');

// --- 1. retirer la PREMIÈRE flèche d'une ancienne boîte (clic sur le trait → croix au milieu → Suppr)
let p = await milieu('principale');
await b.clic(p, { att: 250 });
b.ok(await b.ev(`!!document.querySelector('g.nb-conn.sel[data-conn="principale"]') && !!document.querySelector('.nb-conn-x')`), 'clic sur la 1re flèche : mise en évidence + croix à son milieu');
await b.capture('conn-selection', { x: Math.round(page1.x), y: Math.round(page1.y), width: Math.round(page1.w * 0.8), height: Math.round(page1.h * 0.8) });
await b.touche('Delete', { vk: 46 }); await b.dormir(500);
const apresSuppr = await enBase('an-v3-A');
b.ok(apresSuppr && !apresSuppr.ancre && !apresSuppr.fleche && JSON.stringify(apresSuppr.fleches) === '["flA2"]', 'Suppr : la PREMIÈRE flèche est retirée, la boîte et l’autre flèche restent', JSON.stringify(apresSuppr));
b.ok(await b.ev(`document.querySelectorAll('.note-box').length`) === 3, 'la boîte n’a pas été supprimée avec la flèche');
await b.touche('z', { meta: true }); await b.dormir(600);
b.ok(JSON.stringify(await enBase('an-v3-A')) === JSON.stringify(avant), 'Annuler : la 1re flèche revient à l’identique (champs d’origine)', JSON.stringify(await enBase('an-v3-A')));
await b.touche('z', { meta: true, shift: true }); await b.dormir(600);
b.ok(!(await enBase('an-v3-A')).fleche, 'Rétablir : retirée de nouveau');
await b.touche('z', { meta: true }); await b.dormir(600);

// --- 2. une NOUVELLE boîte avec 3 flèches, retirées dans le désordre
await b.outil('Boîte');
const pb = [page1.x + page1.w * 0.42, page1.y + page1.h * 0.47];
await b.clic(pb, { att: 700 });
await b.ecrire('Nouvelle boîte'); await b.dormir(300);
await b.T.Escape(); await b.dormir(200);
await b.outil('Sélection'); await b.dormir(300);
const nouvelle = await b.S(`const l=(await S.getAll('annotations')).filter(a=>a.ficheId==='f-v3-boites'&&!a.id.startsWith('an-v3'));return l.length===1?l[0].id:null`);
b.ok(!!nouvelle, 'nouvelle boîte créée', nouvelle);
const activer = async () => { const r = await b.rect(`[...document.querySelectorAll('.note-box')].find(e=>/Nouvelle/.test(e.innerText))`); await b.clic([r.x + 8, r.y + 5], { att: 400 }); };
const cibles = [[0.12, 0.12], [0.85, 0.15], [0.80, 0.90]];
for (const [fx, fy] of cibles) {
  await activer();
  const bt = await b.pos(`document.querySelector('.nb-barre [aria-label="Ajouter une flèche"]')`, false);
  if (!bt) { b.ok(false, 'bouton « Ajouter une flèche » visible'); break; }
  await b.clic(bt, { att: 300 });
  await b.clic([page1.x + page1.w * fx, page1.y + page1.h * fy], { att: 500 });
}
const ids3 = (await enBase(nouvelle)).fleches;
b.ok(ids3.length === 3, 'ajout : 3 flèches, la 1re ajoutée exactement comme les suivantes', JSON.stringify(ids3));
await b.T.Escape(); await b.dormir(300);
await b.capture('conn-trois-fleches', { x: Math.round(page1.x), y: Math.round(page1.y), width: Math.round(page1.w), height: Math.round(page1.h) });
const ordre = [ids3[0], ids3[2], ids3[1]]; // la première, puis la dernière, puis celle du milieu
for (const [i, id] of ordre.entries()) {
  p = await milieu(id);
  await b.clic(p, { att: 250 });
  if (i === 1) { const x = await b.pos(`document.querySelector('.nb-conn-x')`, false); await b.clic(x, { att: 500 }); } // par la croix
  else { await b.touche('Delete', { vk: 46 }); await b.dormir(500); } // par Suppr
  const reste = (await enBase(nouvelle)).fleches;
  b.ok(!reste.includes(id) && reste.length === 2 - i, `retrait ${i + 1}/3 (${i === 1 ? 'croix' : 'Suppr'}) : la flèche visée part, les autres restent`, JSON.stringify(reste));
}
b.ok(await b.ev(`document.querySelectorAll('.note-box').length`) === 4, 'boîte sans flèche : toujours là, valide');
// ajouter à nouveau, puis annuler / rétablir
await activer();
await b.clic(await b.pos(`document.querySelector('.nb-barre [aria-label="Ajouter une flèche"]')`, false), { att: 300 });
await b.clic([page1.x + page1.w * 0.15, page1.y + page1.h * 0.5], { att: 500 });
b.ok((await enBase(nouvelle)).fleches.length === 1, 'ajouter à nouveau une flèche sur une boîte sans flèche');
await b.T.Escape(); await b.dormir(200);
await b.touche('z', { meta: true }); await b.dormir(600);
b.ok((await enBase(nouvelle)).fleches.length === 0, 'Annuler l’ajout');
await b.touche('z', { meta: true, shift: true }); await b.dormir(600);
b.ok((await enBase(nouvelle)).fleches.length === 1, 'Rétablir l’ajout');
// Échap et clic ailleurs désélectionnent
p = await milieu((await enBase(nouvelle)).fleches[0]);
await b.clic(p, { att: 250 }); await b.T.Escape(); await b.dormir(200);
b.ok(!(await b.ev(`!!document.querySelector('.nb-conn-x')`)), 'Échap : désélection (rien n’est retiré)');
b.ok((await enBase(nouvelle)).fleches.length === 1, '… et la flèche est toujours là');
// le crayon passe au travers d'une flèche (zone de prise inactive hors Sélection)
await b.outil('Crayon');
b.ok(await b.ev(`!document.querySelector('line.nb-conn-cible')`), 'outil Crayon : les flèches ne captent pas le tracé');
await b.outil('Sélection');
// conversion idempotente : les anciennes boîtes non touchées n'ont pas été réécrites
b.ok(JSON.stringify(await b.S(`const a=await S.getOne('annotations','an-v3-B');return [a.ancre,a.fleche||false,a.fleches||null]`)) === JSON.stringify([{ x: 0.45, y: 0.82, texte: null }, false, null]), 'ancienne boîte B jamais réécrite (conversion à la lecture)');
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' / '));
process.exit(0);
