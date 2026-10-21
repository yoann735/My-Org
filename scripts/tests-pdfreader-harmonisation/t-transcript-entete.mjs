// TRANSCRIPT (22/10) : en-tête de lecture sur UNE ligne (« ‹ Sessions · Mer. 21 oct. · 10:51 · 1 h 59 », « Reprendre »),
// même en panneau étroit (libellés abrégés) ; barre de défilement toujours visible, poignée glissée avec un repère horaire
// flottant, « ↑ Début » / « ↓ Fin ». Session de 2 h semée dans la base LOCALE (cours « Rein v3 »).
// Usage : node t-transcript-entete.mjs [ipad|mobile]
import { banc } from '../tests-pdfreader-v3/commun.mjs';
const app = process.argv[2] || 'ordinateur';
const b = await banc(1440, 900, { tactile: app !== 'ordinateur' });
const COURS = 'f-v3-rein';
const S = { id: 'ts-h-longue', kind: 'session', courseId: COURS, startedAt: '2026-10-21T08:51:00.000Z', endedAt: '2026-10-21T10:50:00.000Z', source: 'micro', keyterms: [],
  segments: Array.from({ length: 300 }, (_, i) => ({ id: 'sg-l' + i, t0: i * 24, t1: i * 24 + 20, text: `Ligne ${i + 1} du cours : le néphron filtre le plasma, réabsorbe et sécrète.`, status: 'final' })),
  notes: [], fontSize: 'm', durationS: 7140, createdAt: '2026-10-21T08:51:00.000Z', updatedAt: '2026-10-21T10:50:00.000Z' };
await b.S(`for(const r of await S.getAll('transcript_session'))if(r.courseId===${JSON.stringify(COURS)})await S.remove('transcript_session',r.id);await S.put('transcript_session',${JSON.stringify(S)});return 1`);
await b.biblio({ recharger: true });
await b.ouvrir('Rein v3'); await b.dormir(1500);
// l'appareil APRÈS l'ouverture du cours (la bibliothèque à 768 px n'a pas la même carte de cours)
if (app === 'ipad') await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1366, deviceScaleFactor: 2, mobile: true });
if (app === 'mobile') await b.c.send('Emulation.setDeviceMetricsOverride', { width: 768, height: 1024, deviceScaleFactor: 2, mobile: true });
if (app !== 'ordinateur') await b.dormir(1800);
const tape = async (p) => (app === 'ordinateur' ? b.clic(p, { att: 700 }) : (await b.tape(p), b.dormir(500)));
await tape(await b.pos(`[...document.querySelectorAll('.pm-seg-btn')].find(x=>x.innerText.trim().startsWith('Transcript'))`, false));
await tape(await b.pos(`document.querySelector('.trx-session[data-session="ts-h-longue"]')`, true));
await b.dormir(800);
const entete = () => b.ev(`(()=>{const e=document.querySelector('.trx-entete-lecture');const k=[...e.children].map(c=>{const r=c.getBoundingClientRect();return {t:Math.round(r.top+r.height/2),h:Math.round(r.height),txt:c.innerText.trim()}});
  const t=e.querySelector('.trx-titre-lecture');return {h:Math.round(e.getBoundingClientRect().height),k,tronque:t.scrollWidth>t.clientWidth+1,titre:t.innerText,larg:Math.round(document.querySelector('.trx-panneau').getBoundingClientRect().width)}})()`);
const uneLigne = (e) => e.k.every((c) => Math.abs(c.t - e.k[0].t) <= 2) && e.h <= 50 && e.k.every((c) => c.h <= 42); // tablette : boutons de 40 px
let e = await entete();
b.ok(uneLigne(e) && /^Mer\. 21 oct\. · 10:51 · 1 h 59/.test(e.titre) && (e.larg <= 360 ? e.k[0].txt === '' : e.k[0].txt === 'Sessions') && /Reprendre$/.test(e.k[2].txt) && !e.tronque, `en-tête sur une ligne (panneau de ${e.larg} px) : « ‹ Sessions · ${e.titre} » · « Reprendre »`, JSON.stringify(e));
await b.capture('trx-entete-' + app, await b.ev(`(()=>{const r=document.querySelector('.trx-panneau').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:90}})()`));
// panneau étroit : 260 px puis 220 px
for (const w of [260, 220]) {
  await b.ev(`(()=>{const p=document.querySelector('.trx-panneau');p.style.width='${w}px';p.style.maxWidth='${w}px';return 1})()`); await b.dormir(400);
  e = await entete();
  b.ok(uneLigne(e) && e.k[0].txt === '' && e.k[2].txt === '' && (e.tronque || e.titre.length > 0), `panneau étroit (${w} px) : toujours une ligne, libellés abrégés (icônes), titre tronqué proprement`, JSON.stringify(e));
  await b.capture(`trx-entete-${w}-${app}`, await b.ev(`(()=>{const r=document.querySelector('.trx-panneau').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:90}})()`));
}
await b.ev(`(()=>{const p=document.querySelector('.trx-panneau');p.style.width='';p.style.maxWidth='';return 1})()`); await b.dormir(400);
// barre de défilement : visible, poignée à sa place
const barre = () => b.ev(`(()=>{const l=document.querySelector('.trx-liste'),d=document.querySelector('.trx-defil'),p=document.querySelector('.trx-defil-poignee');if(!d)return null;const rd=d.getBoundingClientRect(),rp=p.getBoundingClientRect();
  return {st:Math.round(l.scrollTop),max:l.scrollHeight-l.clientHeight,haut:+(rp.top-rd.top).toFixed(1),hp:+rp.height.toFixed(1),piste:+rd.height.toFixed(1),visible:getComputedStyle(p).opacity!=='0'&&rp.width>=5,
  debut:!!document.querySelector('.trx-aller.debut'),fin:!!document.querySelector('.trx-aller.fin'),repere:(document.querySelector('.trx-defil-repere')||{}).innerText||null,cx:rp.x+rp.width/2,cy:rp.y+rp.height/2}})()`);
let d = await barre();
b.ok(d && d.visible && d.haut <= 1 && d.hp >= 28 && d.fin && !d.debut, 'barre de défilement visible au repos, poignée en haut (≥ 28 px), « ↓ Fin » proposé', JSON.stringify(d));
// glisser la poignée jusqu'au milieu : la liste défile, un repère horaire flotte
const y1 = d.cy + (d.piste - d.hp) / 2;
if (app === 'ordinateur') {
  const s = (type, y, ex = {}) => b.c.send('Input.dispatchMouseEvent', { type, x: d.cx, y, button: 'left', ...ex });
  await s('mouseMoved', d.cy); await s('mousePressed', d.cy, { buttons: 1, clickCount: 1 });
  for (let k = 1; k <= 10; k++) { await s('mouseMoved', d.cy + ((y1 - d.cy) * k) / 10, { buttons: 1 }); await b.dormir(40); }
  await b.dormir(200); var pendant = await barre();
  await b.capture('trx-defil-glisser', await b.ev(`(()=>{const r=document.querySelector('.trx-liste-cadre').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(Math.min(r.height,500))}})()`));
  await s('mouseReleased', y1, { clickCount: 1 });
} else {
  await b.c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: d.cx, y: d.cy, id: 1 }] });
  for (let k = 1; k <= 10; k++) { await b.c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: d.cx, y: d.cy + ((y1 - d.cy) * k) / 10, id: 1 }] }); await b.dormir(40); }
  await b.dormir(200); var pendant = await barre();
  await b.c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
await b.dormir(400);
d = await barre();
// la liste défile vers le milieu ; le repère correspond à la position (liste virtualisée : hauteur affinée en route)
const part = d.st / d.max, tRep = pendant.repere ? pendant.repere.split(':').map(Number).reduce((a, v) => a * 60 + v, 0) : -1;
const milieu = part > 0.35 && part < 0.68 && Math.abs(tRep - part * 7176) <= 720;
b.ok(milieu && pendant.repere && /^\d+:\d\d(:\d\d)?$/.test(pendant.repere) && !d.repere, `glisser la poignée : la liste défile jusqu’au milieu, repère horaire « ${pendant.repere} » (position ${Math.round(part * 100)} %) pendant le glisser, disparu au relâchement`, JSON.stringify({ st: d.st, max: d.max, repere: pendant.repere }));
const tMilieu = pendant.repere;
await b.capture('trx-defil-repere-' + app, await b.ev(`(()=>{const r=document.querySelector('.trx-liste-cadre').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(Math.min(r.height,500))}})()`));
// « ↑ Début » / « ↓ Fin »
await tape(await b.pos(`document.querySelector('.trx-aller.fin')`, false)); await b.dormir(900);
d = await barre();
b.ok(d.max - d.st <= 2 && d.debut && !d.fin && d.haut + d.hp >= d.piste - 1, '« ↓ Fin » : au bout de la liste, la poignée en bas', JSON.stringify(d));
await tape(await b.pos(`document.querySelector('.trx-aller.debut')`, false)); await b.dormir(900);
d = await barre();
b.ok(d.st <= 2 && !d.debut && d.fin && d.haut <= 1, '« ↑ Début » : en haut de la liste', JSON.stringify(d));
b.ok(/^\d+:\d\d(:\d\d)?$/.test(tMilieu || ''), 'repère au format mm:ss / h:mm:ss', tMilieu);
await b.S(`await S.remove('transcript_session','ts-h-longue');return 1`);
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
