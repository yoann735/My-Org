// FLÈCHES : une seule implémentation — une flèche posée depuis une boîte et une flèche de l'outil Formes ont la même
// mini barre, le même trait, la même pointe et les mêmes gestes : clic = sélection (le trait s'éclaire, les points
// apparaissent), glisser le trait = toute la flèche (même tout près d'un point), glisser un point = ce point seul,
// double-clic sur le trait = un point à cet endroit, sur un point = le retirer, glisser une extrémité = la déplacer et
// la rattacher à une boîte ; la boîte rattachée bouge, le bout suit ; Annuler / Rétablir.
// Usage : node t-fleches.mjs [ipad]
import { banc } from './commun.mjs';
const ipad = process.argv[2] === 'ipad';
const b = await banc(1440, 900, { tactile: ipad });
await b.preparer([]);
await b.ouvrirCours({ ipad });
const P = await b.page(1);
const pt = (fx, fy) => [P.x + P.w * fx, P.y + P.h * fy];
const souris = (type, [x, y], ex = {}) => b.c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...ex });
const poser = async (p) => { const ex = ipad ? { pointerType: 'pen' } : {}; await souris('mouseMoved', p, ex); await souris('mousePressed', p, { ...ex, buttons: 1 }); await souris('mouseReleased', p, ex); await b.dormir(500); };
const toucher = (p) => (ipad ? b.tape(p) : b.clic(p, { att: 350 }));
// double-clic (souris) / appui long (doigt) sur le trait : un point — à 1,5 px près : Chrome tronque les coordonnées
// des événements au pixel entier
const ajout = async (p) => {
  if (ipad) { await b.c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p[0], y: p[1], id: 1 }] }); await b.dormir(750); await b.c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await b.dormir(450); return; }
  for (const n of [1, 2]) for (const type of ['mousePressed', 'mouseReleased']) await b.c.send('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', clickCount: n });
  await b.dormir(450);
};
// double-clic sur un point (au doigt : deux touchers rapides)
const doubleSur = async (p) => {
  if (ipad) { for (let k = 0; k < 2; k++) { await b.c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p[0], y: p[1], id: 1 }] }); await b.dormir(40); await b.c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await b.dormir(60); } await b.dormir(400); return; }
  for (const n of [1, 2]) for (const type of ['mousePressed', 'mouseReleased']) await b.c.send('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', clickCount: n });
  await b.dormir(400);
};
const glisser = async (de, a) => { if (ipad) await b.doigt(de, a, 10); else await b.glisser(de, a, 10); await b.dormir(300); };
const touche = async (key, code, vk, modifiers = 0) => { await b.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, modifiers }); await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers }); await b.dormir(500); };
const enPx = (q) => [P.x + q.x * P.w, P.y + q.y * P.h];
const dist = (a, c) => Math.hypot(a[0] - c[0], a[1] - c[1]);
const boites = async () => (await b.enBase()).filter((a) => a.kind === 'libre');
const options = () => b.ev(`(()=>{const m=document.querySelectorAll('.mini-barre');return m.length===1?[...m[0].querySelectorAll('[data-option],.sc-bouton')].map(x=>x.dataset.option||'couleur'):m.length})()`);
const OPTIONS = ['type', 'debut', 'fin', 'trait', 'epaisseur', 'couleur', 'supprimer'];
const option = async (nom) => toucher(await b.pos(`document.querySelector('.mini-barre [data-option="${nom}"]')`, false));

// ---------- A. une flèche depuis une boîte ----------
await b.outil('Boîte');
await poser(pt(0.1, 0.1));
await b.attendreFocus(); await b.ecrire('Rein');
await b.dormir(400);
await toucher(await b.pos(`document.querySelector('.mini-barre [data-option="fleche"]')`, false));
await toucher(pt(0.42, 0.3));
await b.outil('Sélection'); await b.dormir(400);
let bt = (await boites())[0];
const idf = bt.fleches[0].id;
b.ok(bt.fleches.length === 1 && bt.fleches[0].geo === 3, 'flèche posée depuis une boîte : le modèle unique (geo 3)', JSON.stringify(bt.fleches[0]));
const CHEMIN = `document.querySelector('g.nb-conn[data-conn="${idf}"] .nb-conn-cible')`;
const surChemin = (frac, sel = CHEMIN) => b.ev(`(()=>{const p=${sel};const L=p.getTotalLength();const q=p.getPointAtLength(L*${frac});const m=p.getScreenCTM();return [q.x*m.a+m.e,q.y*m.d+m.f]})()`);
// distance au trait de chaque point affiché
const surTrait = (trait, ctl) => b.ev(`(()=>{const p=${trait};const m=p.getScreenCTM();const L=p.getTotalLength();const ech=[];for(let i=0;i<=600;i++){const q=p.getPointAtLength(L*i/600);ech.push([q.x*m.a+m.e,q.y*m.d+m.f])}
  return [...document.querySelectorAll('${ctl}')].map(s=>{const r=s.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;return +Math.min(...ech.map(([u,v])=>Math.hypot(u-x,v-y))).toFixed(2)})})()`);
const TRAIT = `document.querySelector('g.nb-conn[data-conn="${idf}"] .nb-conn-trait')`;
await toucher(await surChemin(0.5));
let o = await options();
const eclaire = await b.ev(`!!document.querySelector('g.nb-conn.sel[data-conn="${idf}"] .nb-conn-halo')`);
const bouts = await b.ev(`document.querySelectorAll('.fl-bout').length`);
b.ok(JSON.stringify(o) === JSON.stringify(OPTIONS) && eclaire && bouts === 2 && !(await b.ev(`document.querySelectorAll('.sel-cadre').length`)),
  'clic sur le trait : il s’éclaire, ses deux extrémités apparaissent, mini barre type · début · fin · style · épaisseur · couleur · supprimer', JSON.stringify({ o, eclaire, bouts }));
// ---------- B. courbe, points ajoutés exactement au clic, sur la courbe, cercles de 8 px ----------
await option('type');
const clics = [];
for (const frac of [0.3, 0.7]) { const p = await surChemin(frac); clics.push(p); await ajout(p); }
bt = (await boites())[0];
let fl = bt.fleches.find((x) => x.id === idf);
const ecarts = fl.points.map((q, i) => +dist(enPx(q), clics[i]).toFixed(2));
b.ok(fl.type === 'souple' && fl.points.length === 2 && ecarts.every((d) => d <= 1.5), `courbe : 2 points ${ipad ? 'par appui long' : 'au double-clic'}, exactement à l’endroit visé`, JSON.stringify(ecarts));
let d0 = await surTrait(TRAIT, `.nb-ctl[data-conn="${idf}"]`);
const cercle = await b.ev(`(()=>{const s=document.querySelector('.nb-ctl[data-conn="${idf}"]');const c=getComputedStyle(s);return {w:s.getBoundingClientRect().width,rond:c.borderRadius,fond:c.backgroundColor}})()`);
b.ok(d0.length === 2 && d0.every((d) => d <= 1.5) && Math.abs(cercle.w - 8) <= 0.5 && cercle.fond === 'rgb(255, 255, 255)', 'la courbe passe par ses 2 points (aucune poignée fantôme) ; points = cercles de 8 px à fond blanc', JSON.stringify({ d0, cercle }));
await b.capture('fleche-courbe-points' + (ipad ? '-ipad' : ''), { x: Math.round(P.x), y: Math.round(Math.max(P.y, 0)), width: Math.round(P.w * 0.55), height: Math.round(P.h * 0.4) });
// ---------- C. glisser le trait (à 12 px d'un point) = TOUTE la flèche ; glisser un point = ce point seul ----------
const avant = fl.points.map((q) => ({ ...q }));
const pC = await b.ev(`(()=>{const p=${TRAIT};const s=document.querySelector('.nb-ctl[data-conn="${idf}"][data-i="0"]').getBoundingClientRect();const cx=s.x+s.width/2,cy=s.y+s.height/2;const m=p.getScreenCTM(),L=p.getTotalLength();
  let best=null;for(let i=0;i<=800;i++){const q=p.getPointAtLength(L*i/800);const x=q.x*m.a+m.e,y=q.y*m.d+m.f;const d=Math.abs(Math.hypot(x-cx,y-cy)-12);if(!best||d<best[2])best=[x,y,d]}return [best[0],best[1]]})()`);
await glisser(pC, [pC[0] + 30, pC[1] + 24]);
bt = (await boites())[0]; fl = bt.fleches.find((x) => x.id === idf);
const dpx = fl.points.map((q, i) => [(q.x - avant[i].x) * P.w, (q.y - avant[i].y) * P.h]);
b.ok(dpx.every(([x, y]) => Math.abs(x - 30) <= 1.5 && Math.abs(y - 24) <= 1.5) && fl.points.length === 2, 'glisser le trait, même à 12 px d’un point : toute la flèche se déplace (les 2 points du même vecteur)', JSON.stringify(dpx));
const avant2 = fl.points.map((q) => ({ ...q }));
const p0 = await b.pos(`document.querySelector('.nb-ctl[data-conn="${idf}"][data-i="0"]')`, false);
await glisser(p0, [p0[0] - 20, p0[1] + 40]);
bt = (await boites())[0]; fl = bt.fleches.find((x) => x.id === idf);
const bouge0 = dist(enPx(fl.points[0]), enPx(avant2[0])), bouge1 = dist(enPx(fl.points[1]), enPx(avant2[1]));
b.ok(Math.abs(bouge0 - Math.hypot(20, 40)) <= 1.5 && bouge1 < 0.5, 'glisser un point : ce point seul', JSON.stringify({ bouge0, bouge1 }));
d0 = await surTrait(TRAIT, `.nb-ctl[data-conn="${idf}"]`);
b.ok(d0.every((d) => d <= 1.5), 'la courbe passe toujours par ses points', JSON.stringify(d0));
await b.capture('fleche-courbe-deplacee' + (ipad ? '-ipad' : ''), { x: Math.round(P.x), y: Math.round(Math.max(P.y, 0)), width: Math.round(P.w * 0.55), height: Math.round(P.h * 0.45) });
// ---------- D. double-clic sur un point : retiré ----------
await doubleSur(await b.pos(`document.querySelector('.nb-ctl[data-conn="${idf}"][data-i="1"]')`, false));
bt = (await boites())[0]; fl = bt.fleches.find((x) => x.id === idf);
b.ok(fl.points.length === 1 && (await b.ev(`document.querySelectorAll('.nb-ctl[data-conn="${idf}"]').length`)) === 1, 'double-clic sur un point : il est retiré', JSON.stringify(fl.points));
// ---------- E. rattacher l'arrivée à une 2e boîte ; la boîte bouge, le bout suit ; glisser le trait, il reste accroché ----------
await touche('Escape', 'Escape', 27);
await b.outil('Boîte');
await poser(pt(0.1, 0.42));
await b.attendreFocus(); await b.ecrire('Uretère');
await touche('Escape', 'Escape', 27); await touche('Escape', 'Escape', 27);
await b.outil('Sélection'); await b.dormir(400);
const b2 = (await boites()).find((x) => x.id !== bt.id);
await toucher(await surChemin(0.6));
const fin = await b.pos(`document.querySelector('.fl-bout[data-bout="fin"][data-conn="${idf}"]')`, false);
const c2 = await b.rect(`document.querySelector('.note-box[data-boite="${b2.id}"]')`);
await glisser(fin, [c2.x + c2.w * 0.6, c2.y + c2.h * 0.5]);
bt = (await boites()).find((x) => x.id === bt.id); fl = bt.fleches.find((x) => x.id === idf);
// distance du bout affiché au bord de la boîte 2
const auBord = async () => b.ev(`(()=>{const p=${TRAIT};const r=document.querySelector('.note-box[data-boite="${b2.id}"]').getBoundingClientRect();const L=p.getTotalLength(),m=p.getScreenCTM();
  const q=p.getPointAtLength(L);const x=q.x*m.a+m.e,y=q.y*m.d+m.f;const dx=Math.max(r.x-x,0,x-r.right),dy=Math.max(r.y-y,0,y-r.bottom);const dans=x>r.x+2&&x<r.right-2&&y>r.y+2&&y<r.bottom-2;return {d:+Math.hypot(dx,dy).toFixed(1),dans}})()`);
let ab = await auBord();
b.ok(fl.boiteCible === b2.id && ab.d <= 14 && !ab.dans, 'extrémité relâchée sur une autre boîte : la flèche s’y rattache et finit à son bord', JSON.stringify({ boiteCible: fl.boiteCible, ab }));
await touche('Escape', 'Escape', 27);
const cb = await b.rect(`document.querySelector('.note-box[data-boite="${b2.id}"]')`);
await toucher([cb.x + cb.w * 0.5, cb.y + cb.h * 0.5]);
await glisser([cb.x + cb.w * 0.5, cb.y + cb.h * 0.5], [cb.x + cb.w * 0.5 + 160, cb.y + cb.h * 0.5 + 40]);
ab = await auBord();
b.ok(ab.d <= 14 && !ab.dans, 'la boîte rattachée se déplace : le bout de la flèche la suit', JSON.stringify(ab));
await toucher(await surChemin(0.35));
const pT = await surChemin(0.35);
await glisser(pT, [pT[0] - 30, pT[1] + 20]);
bt = (await boites()).find((x) => x.id === bt.id); fl = bt.fleches.find((x) => x.id === idf);
ab = await auBord();
b.ok(fl.boiteCible === b2.id && ab.d <= 14, 'glisser le trait d’une flèche rattachée : ses bouts restent accrochés à leurs boîtes', JSON.stringify({ boiteCible: fl.boiteCible, ab }));
// ---------- F. Annuler / Rétablir ----------
const etatFl = async () => { const x = (await boites()).find((y) => y.id === bt.id).fleches.find((y) => y.id === idf); return JSON.stringify({ b: x.boiteCible || null, p: x.points, t: x.type }); };
const final = await etatFl();
await touche('Escape', 'Escape', 27); await touche('Escape', 'Escape', 27);
const pile = [];
for (let i = 0; i < 4; i++) { await touche('z', 'KeyZ', 90, 4); pile.push(await etatFl()); }
const detache = pile.some((s) => JSON.parse(s).b === null);
for (let i = 0; i < 4; i++) await touche('z', 'KeyZ', 90, 12);
b.ok(detache && (await etatFl()) === final, 'Annuler remonte les gestes (glisser, rattachement…) ; Rétablir revient exactement à l’état final', JSON.stringify(pile.map((s) => JSON.parse(s).b)));
// ---------- G. flèche de l'outil Formes : même mini barre, même trait, même pointe, mêmes gestes ----------
await b.outil('Forme'); await b.dormir(300);
await toucher(await b.pos(`document.querySelector('.ptb-forme[title^="Flèche"]')`, false));
const de = pt(0.1, 0.62), a = pt(0.36, 0.7);
if (ipad) { const ex = { pointerType: 'pen' }; await souris('mousePressed', de, { ...ex, buttons: 1 }); for (let k = 1; k <= 8; k++) await souris('mouseMoved', [de[0] + (a[0] - de[0]) * k / 8, de[1] + (a[1] - de[1]) * k / 8], { ...ex, buttons: 1 }); await souris('mouseReleased', a, ex); await b.dormir(400); }
else await b.glisser(de, a, 8);
await b.outil('Sélection'); await b.dormir(400);
let forme = (await b.enBase()).find((x) => x.kind === 'forme');
const HIT = `document.querySelector('.pdfr-forme[data-objet="${forme.id}"] .pf-hit')`;
await toucher(await surChemin(0.5, HIT));
o = await options();
b.ok(forme.fleche && forme.fleche.geo === 3 && JSON.stringify(o) === JSON.stringify(OPTIONS), 'flèche de Formes : le même modèle et la même mini barre qu’une flèche de boîte', JSON.stringify({ geo: forme.fleche && forme.fleche.geo, o }));
// même trait, même pointe (même épaisseur choisie) — désélectionnées toutes les deux
await touche('Escape', 'Escape', 27); await b.dormir(300);
const rendu = await b.ev(`(()=>{const t1=document.querySelector('g.nb-conn[data-conn="${idf}"] .nb-conn-trait'),t2=document.querySelector('.pdfr-forme[data-objet="${forme.id}"] .pf-trace');
  const h1=document.querySelector('g.nb-conn[data-conn="${idf}"] .nb-conn-tete'),h2=document.querySelector('.pdfr-forme[data-objet="${forme.id}"] .pf-tete');
  const bb=(h)=>{if(!h)return null;const r=h.getBBox();return +Math.hypot(r.width,r.height).toFixed(2)};
  return {ep:[+t1.getAttribute('stroke-width'),+t2.getAttribute('stroke-width')],tete:[bb(h1),bb(h2)]}})()`);
b.ok(Math.abs(rendu.ep[0] - rendu.ep[1]) < 0.01 && rendu.tete[0] && Math.abs(rendu.tete[0] - rendu.tete[1]) < 0.6, 'même trait et même pointe depuis une boîte ou depuis Formes', JSON.stringify(rendu));
await toucher(await surChemin(0.5, HIT));
const pf = await surChemin(0.4, HIT);
await ajout(pf);
forme = (await b.enBase()).find((x) => x.id === forme.id);
b.ok(forme.fleche.points && forme.fleche.points.length === 1 && dist(enPx(forme.fleche.points[0]), pf) <= 1.5, 'flèche de Formes : point ajouté exactement au clic', JSON.stringify(forme.fleche.points));
const av = { x: forme.x, y: forme.y, p: { ...forme.fleche.points[0] } };
const pg = await surChemin(0.8, HIT);
await glisser(pg, [pg[0] + 25, pg[1] - 30]);
forme = (await b.enBase()).find((x) => x.id === forme.id);
const dF = [(forme.x - av.x) * P.w, (forme.y - av.y) * P.h], dP = [(forme.fleche.points[0].x - av.p.x) * P.w, (forme.fleche.points[0].y - av.p.y) * P.h];
b.ok(Math.abs(dF[0] - 25) <= 1.5 && Math.abs(dF[1] + 30) <= 1.5 && Math.abs(dP[0] - dF[0]) <= 1 && Math.abs(dP[1] - dF[1]) <= 1, 'flèche de Formes : glisser le trait déplace toute la flèche, son point compris', JSON.stringify({ dF, dP }));
const finF = await b.pos(`document.querySelector('.pdfr-forme[data-objet="${forme.id}"] .fl-bout[data-bout="fin"]')`, false);
const c1 = await b.rect(`document.querySelector('.note-box[data-boite="${bt.id}"]')`);
await glisser(finF, [c1.x + c1.w * 0.5, c1.y + c1.h * 0.5]);
forme = (await b.enBase()).find((x) => x.id === forme.id);
b.ok(forme.attaches && forme.attaches.fin === bt.id, 'flèche de Formes : son extrémité se rattache à une boîte', JSON.stringify(forme.attaches));
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
