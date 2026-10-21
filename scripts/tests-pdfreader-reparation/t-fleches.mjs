// Boîtes et flèches : poser des flèches depuis une boîte (la boîte ne disparaît jamais, reste sélectionnée, garde son
// texte), boîte vide + flèche, Échap pendant la visée, Annuler / Rétablir, flèche courbe : points ajoutés EXACTEMENT au
// double-clic, déplacés, retirés, toujours SUR le trait (aucun point fantôme) ; flèche de l'outil Formes = même moteur.
// Usage : node t-fleches.mjs [ipad]   (iPad : doigt pour tout, stylet pour créer — le doigt fait défiler sur la page)
import { banc } from './commun.mjs';
const ipad = process.argv[2] === 'ipad';
const b = await banc(1440, 900, { tactile: ipad });
await b.preparer([]);
await b.ouvrirCours({ ipad });
const P = await b.page(1);
const pt = (fx, fy) => [P.x + P.w * fx, P.y + P.h * fy];
const souris = (type, [x, y], extra = {}) => b.c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
// créer sur la page : souris, ou STYLET sur iPad (le doigt y fait défiler)
const poser = async (p) => { const ex = ipad ? { pointerType: 'pen' } : {}; await souris('mouseMoved', p, ex); await souris('mousePressed', p, { ...ex, buttons: 1 }); await souris('mouseReleased', p, ex); await b.dormir(500); };
const toucher = (p) => (ipad ? b.tape(p) : b.clic(p, { att: 350 }));
const double = async (p) => {
  if (ipad) { await b.c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p[0], y: p[1], id: 1 }] }); await b.dormir(750); await b.c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await b.dormir(450); return; }
  for (const n of [1, 2]) for (const type of ['mousePressed', 'mouseReleased']) await b.c.send('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', clickCount: n });
  await b.dormir(450);
};
const glisser = (de, a) => (ipad ? b.doigt(de, a, 10) : b.glisser(de, a, 10));
const touche = async (key, code, vk, modifiers = 0) => { await b.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, modifiers }); await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers }); await b.dormir(500); };
const boites = async () => (await b.enBase()).filter((a) => a.kind === 'libre');
const texte = (bt) => JSON.stringify(bt.content).match(/"text":"([^"]*)"/g)?.map((t) => t.slice(8, -1)).join('') || '';
const nbFleches = (bt) => (bt.fleches || []).length + (bt.fleche && bt.ancre ? 1 : 0);
const etat = (id) => b.ev(`(()=>{const n=[...document.querySelectorAll('.note-box')].find(e=>e.closest('.pdfr-page')&&e.querySelector('.nb-body'));const l=[...document.querySelectorAll('.pdfr-page[data-cle="1"] .note-box')];return {n:l.length,actives:l.filter(e=>e.classList.contains('active')).length,vise:!!document.querySelector('.pdfr-ancrage')}})()`);
const ajouterFleche = async () => { const p = await b.pos(`document.querySelector('.nb-barre [aria-label="Ajouter une flèche"]')`, false); if (!p) return false; await toucher(p); return true; };

// 1) boîte + un mot, puis 3 flèches depuis la même boîte
await b.outil('Boîte');
await poser(pt(0.12, 0.12));
await b.attendreFocus(); await b.ecrire('Rein'); // pas de pause : le texte est encore en attente d'écriture
let bt = (await boites())[0];
const cibles = [[0.5, 0.3], [0.35, 0.45], [0.6, 0.12]];
for (let i = 0; i < 3; i++) {
  const ok = await ajouterFleche();
  const vise = (await etat()).vise;
  await toucher(pt(...cibles[i]));
  const e = await etat(); bt = (await boites())[0];
  b.ok(ok && vise && e.n === 1 && e.actives === 1 && !e.vise && bt && nbFleches(bt) === i + 1 && texte(bt) === 'Rein',
    `flèche ${i + 1} depuis la même boîte : la boîte reste affichée et sélectionnée, son texte intact, le clic pose l’arrivée`, JSON.stringify({ ...e, fleches: bt && nbFleches(bt), texte: bt && texte(bt) }));
}
const f3 = bt.fleches[2];
b.ok(Math.abs(f3.x - 0.6) < 0.002 && Math.abs(f3.y - 0.12) < 0.002, 'le point d’arrivée est exactement le point cliqué', JSON.stringify(f3));
// 2) Échap pendant la visée : la flèche en cours est annulée, la boîte reste sélectionnée
await ajouterFleche();
await touche('Escape', 'Escape', 27);
let e = await etat(); bt = (await boites())[0];
b.ok(!e.vise && e.actives === 1 && nbFleches(bt) === 3, 'Échap pendant la visée : flèche annulée, boîte toujours sélectionnée', JSON.stringify(e));
// 3) Annuler / Rétablir
await touche('Escape', 'Escape', 27); // désélectionne la boîte (⌘Z ira au lecteur, pas à l'éditeur)
await touche('z', 'KeyZ', 90, 4);
bt = (await boites())[0];
b.ok(bt && nbFleches(bt) === 2, 'Annuler : la dernière flèche part, la boîte reste', String(bt && nbFleches(bt)));
await touche('z', 'KeyZ', 90, 12);
bt = (await boites())[0];
b.ok(bt && nbFleches(bt) === 3, 'Rétablir : la flèche revient');
// 4) boîte VIDE + flèche : elle n'est plus retirée comme « boîte vide »
if (!(await b.ev(`!!document.querySelector('.ptb-outil.actif[title^="Boîte"], .tab-outil.actif[aria-label="Boîte"]')`))) await b.outil('Boîte');
await poser(pt(0.12, 0.6));
await ajouterFleche(); await toucher(pt(0.4, 0.7));
await b.outil('Sélection'); await b.dormir(400);
let lb = await boites();
const vide = lb.find((x) => Math.abs(x.y - 0.6) < 0.05);
b.ok(lb.length === 2 && vide && nbFleches(vide) === 1, 'boîte vide + flèche : la boîte reste (avec sa flèche) quand on la quitte', JSON.stringify(lb.map((x) => [texte(x), nbFleches(x)])));

// 5) flèche COURBE avec 2 points ajoutés au double-clic, déplacés, puis un retiré — tout reste SUR le trait
const idf = bt.fleches[0].id;
const surChemin = (frac) => b.ev(`(()=>{const p=document.querySelector('g.nb-conn[data-conn="${idf}"] .nb-conn-cible');const L=p.getTotalLength();const q=p.getPointAtLength(L*${frac});const m=p.getScreenCTM();return [q.x*m.a+m.e,q.y*m.d+m.f]})()`);
// distance (px écran) de chaque point de contrôle affiché au trait, et nombre de poignées / de points enregistrés
const controle = () => b.ev(`(()=>{const p=document.querySelector('g.nb-conn[data-conn="${idf}"] .nb-conn-trait');const m=p.getScreenCTM();const L=p.getTotalLength();const ech=[];for(let i=0;i<=600;i++){const q=p.getPointAtLength(L*i/600);ech.push([q.x*m.a+m.e,q.y*m.d+m.f])}
  const pg=[...document.querySelectorAll('.nb-ctl[data-conn="${idf}"]')].map(s=>{const r=s.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]});
  return {poignees:pg.length,dist:pg.map(([x,y])=>+Math.min(...ech.map(([u,v])=>Math.hypot(u-x,v-y))).toFixed(2)),d:p.getAttribute('d')||''}})()`);
await toucher(await surChemin(0.5)); // sélectionne la flèche : sa rangée de réglages apparaît
const reglage = async (nom) => { await b.ev(`(()=>{const x=document.querySelector('.barre-fleche [data-reglage="${nom}"]');x&&x.scrollIntoView({block:'nearest',inline:'nearest'});return 1})()`); await b.dormir(ipad ? 700 : 100); await toucher(await b.pos(`document.querySelector('.barre-fleche [data-reglage="${nom}"]')`, false)); };
const libType = await b.ev(`(document.querySelector('.barre-fleche [data-reglage="type"]')||{}).innerText`);
b.ok(libType === 'Droite', 'rangée de la flèche : type « Droite » (segments) par défaut', libType);
await reglage('type');
const clics = [];
for (const frac of [0.3, 0.7]) {
  const p = await surChemin(frac); clics.push(p);
  await double(p);
}
bt = (await boites())[0];
let fl = bt.fleches.find((x) => x.id === idf);
const enPx = (q) => [P.x + q.x * P.w, P.y + q.y * P.h];
const ecarts = fl.points.map((q, i) => +Math.hypot(enPx(q)[0] - clics[i][0], enPx(q)[1] - clics[i][1]).toFixed(2));
b.ok(fl.type === 'souple' && fl.points.length === 2 && ecarts.every((d) => d <= 1), `courbe : 2 points ajoutés ${ipad ? 'par appui long' : 'au double-clic'}, EXACTEMENT à l’endroit visé, dans l’ordre du trait`, JSON.stringify(ecarts));
let c0 = await controle();
b.ok(c0.poignees === 2 && c0.dist.every((d) => d <= 1.5) && /C/.test(c0.d), 'aucun point fantôme : 2 poignées, chacune sur la courbe', JSON.stringify(c0.dist));
// déplacer les deux points
for (const [i, dy] of [[0, -70], [1, 60]]) {
  const p = await b.pos(`document.querySelector('.nb-ctl[data-conn="${idf}"][data-i="${i}"]')`, false);
  await glisser(p, [p[0] + 10, p[1] + dy]);
}
bt = (await boites())[0]; fl = bt.fleches.find((x) => x.id === idf);
c0 = await controle();
b.ok(c0.poignees === 2 && c0.dist.every((d) => d <= 1.5), 'points glissés : la courbe passe toujours par chacun (lisse, prévisible)', JSON.stringify({ dist: c0.dist, points: fl.points }));
await b.capture('fleche-courbe' + (ipad ? '-ipad' : ''), { x: Math.round(P.x), y: Math.round(Math.max(P.y, 0)), width: Math.round(P.w * 0.75), height: Math.round(Math.min(P.h * 0.55, 800)) });
// retirer un point (double-clic sur lui)
const p1 = await b.pos(`document.querySelector('.nb-ctl[data-conn="${idf}"][data-i="1"]')`, false);
if (ipad) { // au doigt : pas de double-clic natif — deux touchers rapides
  for (let k = 0; k < 2; k++) { await b.c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p1[0], y: p1[1], id: 1 }] }); await b.dormir(40); await b.c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await b.dormir(60); }
  await b.dormir(400);
} else for (const n of [1, 2]) for (const type of ['mousePressed', 'mouseReleased']) await b.c.send('Input.dispatchMouseEvent', { type, x: p1[0], y: p1[1], button: 'left', clickCount: n });
await b.dormir(400);
bt = (await boites())[0]; fl = bt.fleches.find((x) => x.id === idf);
c0 = await controle();
b.ok(fl.points.length === 1 && c0.poignees === 1 && c0.dist[0] <= 1.5, 'double-clic sur un point : il est retiré (1 point reste, sur le trait)', JSON.stringify(fl.points));
await touche('Escape', 'Escape', 27);

// 6) flèche de l'outil Formes : même modèle (sommets + points), même rangée de réglages, mêmes gestes
await b.outil('Forme'); await b.dormir(300);
await toucher(await b.pos(`document.querySelector('.ptb-forme[title^="Flèche"]')`, false));
const de = pt(0.55, 0.62), a = pt(0.9, 0.7);
if (ipad) { const ex = { pointerType: 'pen' }; await souris('mousePressed', de, { ...ex, buttons: 1 }); for (let k = 1; k <= 8; k++) await souris('mouseMoved', [de[0] + (a[0] - de[0]) * k / 8, de[1] + (a[1] - de[1]) * k / 8], { ...ex, buttons: 1 }); await souris('mouseReleased', a, ex); await b.dormir(400); }
else await b.glisser(de, a, 8);
await b.outil('Sélection'); await b.dormir(400);
const forme = (await b.enBase()).find((x) => x.kind === 'forme');
const surForme = (frac) => b.ev(`(()=>{const p=document.querySelector('.pdfr-forme[data-forme="fleche"] .pf-hit');const L=p.getTotalLength();const q=p.getPointAtLength(L*${frac});const m=p.getScreenCTM();return [q.x*m.a+m.e,q.y*m.d+m.f]})()`);
await toucher(await surForme(0.5));
const memeRangee = await b.ev(`!!document.querySelector('.pdfr-contexte .barre-fleche [data-reglage="type"]')`);
b.ok(forme && memeRangee, 'flèche de forme sélectionnée : la MÊME rangée de réglages (BarreFleche) que les flèches de boîte');
await reglage('type');
const pf = await surForme(0.4);
await double(pf);
const ff = (await b.enBase()).find((x) => x.kind === 'forme');
const ecartF = ff.fleche && ff.fleche.points && ff.fleche.points[0] ? Math.hypot(enPx(ff.fleche.points[0])[0] - pf[0], enPx(ff.fleche.points[0])[1] - pf[1]) : 99;
b.ok(ff.fleche && ff.fleche.type === 'souple' && ff.fleche.points.length === 1 && ecartF <= 1, 'flèche de forme : courbe, point ajouté exactement au clic (même moteur)', JSON.stringify(ff.fleche));
const pfc = await b.ev(`(()=>{const s=document.querySelector('.pdfr-forme .pf-ctl');const p=document.querySelector('.pdfr-forme[data-forme="fleche"] .pf-trace');if(!s||!p)return 99;const r=s.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,m=p.getScreenCTM(),L=p.getTotalLength();let d=1e9;for(let i=0;i<=400;i++){const q=p.getPointAtLength(L*i/400);d=Math.min(d,Math.hypot(q.x*m.a+m.e-x,q.y*m.d+m.f-y))}return +d.toFixed(2)})()`);
b.ok(pfc <= 1.5, 'son point de contrôle est sur la courbe', String(pfc));
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
