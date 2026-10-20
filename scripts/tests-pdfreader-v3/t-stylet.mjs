// (20/10) iPad + Apple Pencil (simulé) : le stylet dessine avec l'outil actif (pression → épaisseur, désactivable),
// le doigt fait défiler et ne dessine JAMAIS (sauf « Dessiner au doigt »), la paume posée pendant l'écriture est
// ignorée, le pincement zoome, bouton gomme d'un stylet → gomme, tracé en direct sur un canvas d'aperçu (synchrone),
// barre utilisable au doigt (≥ 40 px). Tablette 1024 × 1366 tactile, cours « Rein v3 », base LOCALE.
// Usage : node t-stylet.mjs
import { banc } from './commun.mjs';
const b = await banc(1440, 900, { tactile: true });
await b.S(`for(const a of await S.getAll('annotations'))if(a.ficheId==='f-v3-rein')await S.remove('annotations',a.id);
  for(const r of await S.getAll('reading_position'))if(String(r.id).startsWith('rp:f-v3-rein'))await S.remove('reading_position',r.id);
  localStorage.removeItem('medrevise.dessinDoigt');localStorage.removeItem('medrevise.pressionStylet');return 1`);
await b.biblio({ recharger: true });
await b.ouvrir('Rein v3'); await b.dormir(1500);
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1366, deviceScaleFactor: 2, mobile: true });
await b.dormir(2000);
b.ok(await b.ev(`!!document.querySelector('.lecteur-tab')`), 'mode tablette');
const traits = () => b.S(`return (await S.getAll('annotations')).filter(a=>a.ficheId==='f-v3-rein'&&(a.kind==='trait'||a.type==='trait'||Array.isArray(a.points))).map(a=>({id:a.id,ep:a.epaisseur,n:a.points.length}))`);
// zone de lecture VISIBLE (au-dessus du volet du panneau) : tous les gestes y tombent
const page = async () => { const z = await b.rect(`document.querySelector('.pdfr-scroll')`); return { x: z.x + 40, y: z.y + 10, w: z.w - 80, h: z.h - 20 }; };
// barre au doigt : toutes les cibles ≥ 40 px
const petites = await b.ev(`[...document.querySelectorAll('.tab-barre button, .tab-contexte button')].filter(x=>x.offsetParent).map(x=>{const r=x.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height),(x.getAttribute('aria-label')||x.title||x.innerText).slice(0,20)]}).filter(([w,h])=>Math.min(w,h)<40)`);
b.ok(!petites.length, 'barre d’outils : toutes les cibles ≥ 40 px au doigt', JSON.stringify(petites.slice(0, 6)));
await b.outil('Crayon');
const stylet = async (pts, { force = 0.5, attendre = 600 } = {}) => {
  const ev = (type, p, extra = {}) => b.c.send('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen', force, ...extra });
  await ev('mouseMoved', pts[0], { buttons: 0 }); await ev('mousePressed', pts[0]);
  for (const p of pts.slice(1)) { await ev('mouseMoved', p); await b.dormir(16); }
  await ev('mouseReleased', pts[pts.length - 1]); await b.dormir(attendre);
};
const ligne = (x0, y0, x1, y1, n = 14) => Array.from({ length: n + 1 }, (_, i) => [x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]);
let P = await page();
// 1. le stylet dessine ; aperçu en direct sur le canvas (dessiné dans l'événement, avant l'image suivante)
const avant = (await traits()).length;
{
  const pts = ligne(P.x + 80, P.y + P.h * 0.15, P.x + 380, P.y + P.h * 0.2);
  await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[0][0], y: pts[0][1], pointerType: 'pen', buttons: 0 });
  await b.c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts[0][0], y: pts[0][1], button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen', force: 0.5 });
  for (const p of pts.slice(1, 8)) await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[0], y: p[1], button: 'left', buttons: 1, pointerType: 'pen', force: 0.5 });
  const apercu = await b.ev(`(()=>{const c=[...document.querySelectorAll('canvas.pdfr-apercu-trait')].find(c=>c.width>1);if(!c)return null;const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return n})()`);
  b.ok(apercu > 50, 'stylet : tracé EN DIRECT sur le canvas d’aperçu, dès l’événement', `${apercu} pixels`);
  for (const p of pts.slice(8)) await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[0], y: p[1], button: 'left', buttons: 1, pointerType: 'pen', force: 0.5 });
  await b.c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pts[pts.length - 1][0], y: pts[pts.length - 1][1], button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' });
  await b.dormir(700);
}
let t = await traits();
b.ok(t.length === avant + 1, 'stylet : un trait enregistré au relâchement', `${avant} → ${t.length}`);
b.ok(await b.ev(`[...document.querySelectorAll('canvas.pdfr-apercu-trait')].every(c=>{if(c.width<2)return true;const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=3;i<d.length;i+=4)if(d[i]>0)return false;return true})`), 'après le relâchement : l’aperçu est effacé (le trait enregistré prend le relais)');
// 2. pression → épaisseur (légère), puis option désactivée
await stylet(ligne(P.x + 80, P.y + P.h * 0.3, P.x + 380, P.y + P.h * 0.3), { force: 0.15 });
await stylet(ligne(P.x + 80, P.y + P.h * 0.4, P.x + 380, P.y + P.h * 0.4), { force: 0.95 });
t = await traits();
const [leger, appuye] = t.slice(-2).map((x) => x.ep);
b.ok(appuye > leger * 1.3 && appuye < leger * 2.5, 'pression : appuyer épaissit le trait (légèrement)', `${leger?.toFixed(5)} → ${appuye?.toFixed(5)}`);
// rangée trop longue pour la largeur : elle défile (en douceur) jusqu'au réglage avant de le viser
const reglage = async (rx) => { await b.ev(`(()=>{const x=[...document.querySelectorAll('.pdfr-contexte button')].find(x=>${rx}.test(x.innerText));x&&x.scrollIntoView({block:'nearest',inline:'nearest'});return 1})()`); await b.dormir(700); return b.pos(`[...document.querySelectorAll('.pdfr-contexte button')].find(x=>${rx}.test(x.innerText))`, false); };
const bascule = await reglage('/Pression/');
b.ok(!!bascule, 'réglage « Pression » dans la rangée du crayon');
if (bascule) await b.tape(bascule);
b.ok(await b.ev(`localStorage.getItem('medrevise.pressionStylet')`) === '0', 'réglage « Pression » désactivé (mémorisé)');
await stylet(ligne(P.x + 80, P.y + P.h * 0.5, P.x + 380, P.y + P.h * 0.5), { force: 0.15 });
await stylet(ligne(P.x + 80, P.y + P.h * 0.6, P.x + 380, P.y + P.h * 0.6), { force: 0.95 });
t = await traits();
const [l2, a2] = t.slice(-2).map((x) => x.ep);
b.ok(Math.abs(l2 - a2) < 1e-9, 'pression désactivée : même épaisseur quelle que soit la force', `${l2} / ${a2}`);
if (bascule) await b.tape(await reglage('/Pression/'));
// 3. le doigt fait défiler, ne dessine jamais
const nAvantDoigt = (await traits()).length;
const st0 = await b.ev(`document.querySelector('.pdfr-scroll').scrollTop`);
await b.doigt([P.x + 300, P.y + P.h * 0.85], [P.x + 300, P.y + P.h * 0.25], 12);
await b.dormir(500);
const st1 = await b.ev(`document.querySelector('.pdfr-scroll').scrollTop`);
b.ok((await traits()).length === nAvantDoigt, 'doigt, crayon actif : aucun trait', `${(await traits()).length}`);
b.ok(st1 - st0 > P.h * 0.4, 'doigt : la page défile', `${st0} → ${st1}`);
// 4. paume posée pendant que le stylet écrit : ignorée
P = await page();
const n4 = (await traits()).length;
await b.c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: P.x + 600, y: P.y + P.h * 0.8, id: 7, radiusX: 30, radiusY: 30 }] });
await stylet(ligne(P.x + 100, P.y + P.h * 0.2, P.x + 350, P.y + P.h * 0.3), { attendre: 200 });
await b.c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: P.x + 610, y: P.y + P.h * 0.8 - 10, id: 7, radiusX: 30, radiusY: 30 }] });
await b.c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await b.dormir(500);
t = await traits();
b.ok(t.length === n4 + 1, 'paume posée pendant l’écriture : seul le trait du stylet est enregistré', `${n4} → ${t.length}`);
// 5. pincement à deux doigts : zoom, aucun trait
const z0 = await b.zoomPct();
const n5 = (await traits()).length;
const tp = (type, a, c) => b.c.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: a[0], y: a[1], id: 1 }, { x: c[0], y: c[1], id: 2 }] });
const cx = P.x + 400, cy = P.y + P.h * 0.5;
await tp('touchStart', [cx - 60, cy], [cx + 60, cy]);
for (let i = 1; i <= 10; i++) { await tp('touchMove', [cx - 60 - i * 12, cy], [cx + 60 + i * 12, cy]); await b.dormir(16); }
await tp('touchEnd'); await b.dormir(900);
const z1 = await b.zoomPct();
b.ok(parseInt(z1) > parseInt(z0) + 20, 'pincement : zoom avant', `${z0} → ${z1}`);
b.ok((await traits()).length === n5, 'pincement : aucun trait');
await b.ev(`window.__mrZoom && document.querySelector('.tab-barre [aria-label="Ajuster à la largeur"]').click();1`); await b.dormir(800);
// 6. « Dessiner au doigt » activé : le doigt dessine
const doigtBt = await reglage('/au doigt/i');
b.ok(!!doigtBt, 'réglage « Dessiner au doigt » (désactivé par défaut)');
if (doigtBt) await b.tape(doigtBt);
P = await page();
const n6 = (await traits()).length;
await b.doigt([P.x + 120, P.y + P.h * 0.3], [P.x + 360, P.y + P.h * 0.35], 10); await b.dormir(600);
b.ok((await traits()).length === n6 + 1, '« Dessiner au doigt » activé : le doigt trace');
if (doigtBt) await b.tape(await reglage('/au doigt/i'));
b.ok(await b.ev(`localStorage.getItem('medrevise.dessinDoigt')`) === '0', 'réglage désactivé de nouveau (mémorisé)');
// 7. bouton « gomme » d'un stylet (bout gomme, bouton latéral exposé par le navigateur) : gomme le trait
const avant7 = await traits();
P = await page();
const cibleT = await b.ev(`(()=>{const paths=[...document.querySelectorAll('.pdfr-inklayer path')];const p=paths[paths.length-1];const r=p.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
await b.ev(`(()=>{const el=document.elementFromPoint(${cibleT[0]},${cibleT[1]});const o={pointerId:41,pointerType:'pen',button:5,buttons:32,clientX:${cibleT[0]},clientY:${cibleT[1]},bubbles:true,isPrimary:true,pressure:.5};el.dispatchEvent(new PointerEvent('pointerdown',o));window.dispatchEvent(new PointerEvent('pointerup',{...o,buttons:0}));return el.className})()`);
await b.dormir(600);
b.ok((await traits()).length === avant7.length - 1, 'bout gomme du stylet (bouton 5) : le trait touché est effacé, crayon toujours actif', `${avant7.length} → ${(await traits()).length}`);
await b.capture('stylet-tablette', { x: 0, y: 0, width: 1024, height: 700 });
await b.outil('Sélection');
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' / '));
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
process.exit(0);
