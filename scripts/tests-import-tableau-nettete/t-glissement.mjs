// (17/10 soir) Glissement entre les modes du panneau : ordre Exercices · Transcript · Notes · Notions, aucune
// valeur au-delà de la cible (ni rebond, ni élastique), interruption immédiate, 20 allers-retours trackpad et
// doigt, images mesurées (rAF) et tâches longues. Usage : node t-glissement.mjs [etiquette] — base LOCALE.
import { banc } from '../tests-bibliotheque-fichier/commun.mjs';
import fs from 'node:fs';
const etiquette = process.argv[2] || 'apres';
const tactile = process.argv[3] === 'doigt';
const W = Number(process.env.W || 1440), H = Number(process.env.H || 900);
const b = await banc(1440, 900, { tactile });
await b.biblio({ recharger: true });
await b.ouvrir('Physiologie rénale (jumelle)');
if (W !== 1440) { await b.c.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true }); await b.dormir(1500);
  // tablette : le panneau est un volet qui monte depuis le bas — on l'ouvre s'il est replié
  await b.ev(`(()=>{const x=[...document.querySelectorAll('button')].find(e=>/Panneau|Exercices/.test(e.title||e.getAttribute('aria-label')||'')&&!document.querySelector('.pm-piste'));x&&x.click();return 1})()`); await b.dormir(800); }
await b.dormir(1200);
const modes = await b.ev(`[...document.querySelectorAll('.pm-seg-btn')].map(x=>x.innerText.replace(/\\s*\\d+$/,'').trim())`);
const actif = () => b.ev(`(document.querySelector('.pm-seg-btn.actif')||{}).innerText?.replace(/\\s*\\d+$/,'').trim()`);
// enregistreur : intervalle entre images + position de la piste à chaque image + tâches longues
await b.ev(`(()=>{window.__img=[];window.__lt=[];const p=document.querySelector('.pm-piste');const w=document.querySelector('.pm-vue').getBoundingClientRect().width;
  let der=0;const f=(t)=>{if(window.__rec){const m=getComputedStyle(p).transform;const tx=m&&m!=='none'?parseFloat(m.split(',')[4]):0;window.__img.push({t,dt:der?t-der:0,pos:-tx/w});}der=t;requestAnimationFrame(f)};requestAnimationFrame(f);
  try{new PerformanceObserver(l=>{if(window.__rec)l.getEntries().forEach(e=>window.__lt.push(Math.round(e.duration)))}).observe({entryTypes:['longtask']})}catch(e){};return 1})()`);
const corps = await b.dans(`document.querySelector('.pm-piste').parentElement`, 0.5, 0.45);
// profil RÉEL d'un geste de trackpad macOS : les doigts accélèrent, puis l'inertie décroît
const PROFIL = [3, 7, 13, 20, 26, 28, 24, 18, 12, 8, 5, 3, 2, 1];
// envoyés DANS la page, à la cadence d'un vrai trackpad (≈ 120 Hz) — via CDP chaque événement attend une image (33 ms)
const roue = (sens) => b.ev(`new Promise(ok=>{const el=document.querySelector('.pm-piste').parentElement;const r=el.getBoundingClientRect();const P=${JSON.stringify(PROFIL)};let k=0;
  const un=()=>{if(k>=P.length){ok(1);return;}el.dispatchEvent(new WheelEvent('wheel',{deltaX:${'${'}sens${'}'}*P[k++],deltaY:0,deltaMode:0,clientX:r.x+r.width/2,clientY:r.y+r.height*0.45,bubbles:true,cancelable:true}));setTimeout(un,8)};un();})`.replace('${sens}', String(sens)));
const geste = async (vers) => { if (tactile) await b.doigt([corps[0] + vers * 110, corps[1]], [corps[0] - vers * 110, corps[1] + 3], 6); else await roue(vers); };
const res = { etiquette, tactile, modes };
if (etiquette === 'apres') b.ok(modes.join(' · ') === 'Exercices · Transcript · Notes · Notions', 'ordre : Exercices · Transcript · Notes · Notions', modes.join(' · '));
// partir de Exercices
await b.clic(await b.pos(`[...document.querySelectorAll('.pm-seg-btn')].find(x=>x.innerText.startsWith('Exercices'))`, false), { att: 600 });
// 1. extrémité gauche : un geste vers la droite ne fait rien bouger au-delà de 0 (élastique ?)
await b.ev(`window.__img=[];window.__rec=1;1`);
await geste(-1); await b.dormir(500);
let img = await b.ev(`(window.__rec=0,window.__img)`);
const minPos = Math.min(...img.map((x) => x.pos));
res.depassementBord = +(Math.max(0, -minPos)).toFixed(3);
b.ok(etiquette !== 'apres' || minPos > -0.001, 'extrémité : la piste s’arrête net (aucun élastique au-delà d’Exercices)', `min ${minPos.toFixed(3)}`);
// 2. aimantation : jamais au-delà de la cible
await b.ev(`window.__img=[];window.__rec=1;1`);
await geste(1); await b.dormir(450);
img = await b.ev(`(window.__rec=0,window.__img)`);
const cible = Math.round(img[img.length - 1].pos);
const maxPos = Math.max(...img.map((x) => x.pos));
res.depassementCible = +(Math.max(0, maxPos - cible)).toFixed(3);
const arrivees = img.findIndex((x) => Math.abs(x.pos - cible) < 0.001);
b.ok(etiquette !== 'apres' || (cible === 1 && maxPos <= cible + 0.001), 'aimantation vers Transcript : aucune valeur au-delà de la cible (pas de rebond)', `cible ${cible}, max ${maxPos.toFixed(3)}`);
b.ok((await actif()) === 'Transcript', 'un geste → Transcript');
// 3. double switch immédiat : 2e geste PENDANT l'aimantation du 1er
await b.clic(await b.pos(`[...document.querySelectorAll('.pm-seg-btn')].find(x=>x.innerText.startsWith('Exercices'))`, false), { att: 600 });
await b.ev(`window.__img=[];window.__rec=1;1`);
await geste(1); await b.dormir(tactile ? 20 : 40); await geste(1);
const t0 = Date.now(); // fin du 2e geste (doigts levés)
let fin = -1; for (let k = 0; k < 40; k++) { if ((await actif()) === 'Notes') { fin = Date.now() - t0; break; } await b.dormir(10); }
await b.dormir(300);
img = await b.ev(`(window.__rec=0,window.__img)`);
res.doubleSwitchMs = fin;
res.doubleMax = +Math.max(...img.map((x) => x.pos)).toFixed(3);
b.ok(fin > 0 && res.doubleMax <= 2.001, 'double switch Exercices → Transcript → Notes (2e geste pendant l’aimantation du 1er) : arrivé sur Notes, sans dépasser', `posé ${fin} ms après le 2e relâchement, max ${res.doubleMax}`);
// 3 bis. durée d'une aimantation (clic sur un segment voisin) : de la première image qui bouge à la pose
await b.clic(await b.pos(`[...document.querySelectorAll('.pm-seg-btn')].find(x=>x.innerText.startsWith('Exercices'))`, false), { att: 600 });
await b.ev(`window.__img=[];window.__rec=1;1`);
await b.clic(await b.pos(`[...document.querySelectorAll('.pm-seg-btn')][1]`, false), { att: 500 });
img = await b.ev(`(window.__rec=0,window.__img)`);
{ const bouge = img.filter((x, i) => i > 0 && Math.abs(x.pos - img[i - 1].pos) > 1e-4); res.aimantationMs = bouge.length ? Math.round(bouge[bouge.length - 1].t - bouge[0].t + 16.7) : 0; res.aimantationImages = bouge.length; }
b.ok(etiquette !== 'apres' || res.aimantationMs <= 140, 'aimantation : ≈ 120 ms', `${res.aimantationMs} ms (${res.aimantationImages} images)`);
// 4. 20 allers-retours rapides
await b.clic(await b.pos(`[...document.querySelectorAll('.pm-seg-btn')].find(x=>x.innerText.startsWith('Exercices'))`, false), { att: 600 });
await b.ev(`window.__img=[];window.__lt=[];window.__rec=1;1`);
let changes = 0, prec = await actif();
for (let i = 0; i < 20; i++) {
  await geste(i % 2 === 0 ? 1 : -1); await b.dormir(tactile ? 160 : 200);
  const a = await actif(); if (a !== prec) changes++; prec = a;
}
await b.dormir(300);
img = await b.ev(`(window.__rec=0,window.__img)`);
const lt = await b.ev(`window.__lt`);
const dts = img.map((x) => x.dt).filter((x) => x > 0);
res.images = dts.length; res.duree = Math.round(img[img.length - 1].t - img[0].t);
res.fps = +(dts.length / (res.duree / 1000)).toFixed(1);
res.sup16 = dts.filter((x) => x > 16.7 * 1.5).length; // image sautée : intervalle > 25 ms (une vsync manquée)
res.max = Math.round(Math.max(...dts));
res.longues = lt.length;
res.changements = changes;
b.ok(changes === 20, `20 allers-retours ${tactile ? 'au doigt' : 'au trackpad'} : 20 changements de mode`, String(changes));
b.ok(etiquette !== 'apres' || (res.sup16 === 0 && res.longues === 0), `aucune image sautée (intervalle > 25 ms), aucune tâche longue`, `${res.images} images, ${res.fps} img/s, max ${res.max} ms, ${res.sup16} sautées, ${res.longues} tâches longues`);
fs.mkdirSync('../cap', { recursive: true });
fs.writeFileSync(`../cap/glissement-${etiquette}${tactile ? '-doigt' : ''}${W !== 1440 ? '-' + W : ''}.json`, JSON.stringify(res, null, 1));
console.log('MESURE', JSON.stringify(res));
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' / '));
process.exit(0);
