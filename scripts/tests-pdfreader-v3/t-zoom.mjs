// (20/10) Zoom sans flash blanc — 20 zooms / dézooms (pincement de trackpad = Ctrl + molette, petits deltas)
// sur la diapo IMAGE 4K de « Diapo lourde (zoom) », écran Retina simulé (1440 × 900, ×2).
// Mesures : (1) TOUTES les images peintes pendant les gestes (Page.startScreencast) → part de pixels
// « page blanche » au centre de la zone de lecture, image par image ; (2) trace Performance
// (PipelineReporter : images perdues pendant les gestes) ; (3) captures avant / pendant / après.
// Usage : node t-zoom.mjs <avant|apres> — base LOCALE du banc.
import { banc } from './commun.mjs';
import fs from 'node:fs';
const etiquette = process.argv[2] || 'apres';
const b = await banc(1440, 900);
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
await b.S(`for(const r of await S.getAll('reading_position'))if(String(r.id).startsWith('rp:f-v3-lourd'))await S.remove('reading_position',r.id);return 1`);
await b.biblio({ recharger: true });
await b.ouvrir('Diapo lourde (zoom)'); await b.dormir(2500);
await b.ev(`window.__mrZoom(1);1`); await b.dormir(1500);
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0;1`); await b.dormir(1500);
// zone mesurée : le centre de la zone de lecture (où se trouve la diapo image)
const zone = await b.ev(`(()=>{const r=document.querySelector('.pdfr-scroll').getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height}})()`);
const cx = zone.x + zone.w / 2, cy = zone.y + Math.min(zone.h * 0.35, 260);
await b.capture(`zoom-${etiquette}-depart`, { x: zone.x, y: zone.y, width: zone.w, height: Math.min(zone.h, 600) });

// --- enregistrement : screencast (toutes les images peintes) + trace ---
const images = [];
b.c.on((m) => { if (m.method === 'Page.screencastFrame') { images.push({ t: m.params.metadata.timestamp, data: m.params.data }); b.c.send('Page.screencastFrameAck', { sessionId: m.params.sessionId }).catch(() => {}); } });
const traces = [];
b.c.on((m) => { if (m.method === 'Tracing.dataCollected') traces.push(...m.params.value); });
let traceFinie; const traceOk = new Promise((r) => { traceFinie = r; });
b.c.on((m) => { if (m.method === 'Tracing.tracingComplete') traceFinie(); });
await b.c.send('Page.enable');
await b.c.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline.frame,blink.user_timing,benchmark,cc,toplevel', transferMode: 'ReportEvents' });
await b.c.send('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: 720, everyNthFrame: 1 });
await b.dormir(400);
const fenetres = [];
const molette = (d) => b.c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: d, modifiers: 2 });
const toucheZoom = async (k) => { for (const type of ['keyDown', 'keyUp']) await b.c.send('Input.dispatchKeyEvent', { type, key: k, code: k === '+' ? 'Equal' : 'Minus', modifiers: 4, windowsVirtualKeyCode: k === '+' ? 187 : 189 }); };
for (let k = 0; k < 20; k++) {
  const sens = k % 2 === 0 ? -1 : 1; // zoom avant, puis arrière
  // gestes 0-9 : pincement sur la diapo 1 ; 10-19 : ⌘+ / ⌘− (2 crans) sur la diapo 3, plus bas dans le cours
  if (k === 10) { await b.ev(`(()=>{const p=[...document.querySelectorAll('.pdfr-page')].find(e=>e.dataset.cle==='3');const s=document.querySelector('.pdfr-scroll');s.scrollTop+=p.getBoundingClientRect().top-s.getBoundingClientRect().top-20;return 1})()`); await b.dormir(1500); }
  const t0 = Date.now() / 1000;
  await b.ev(`performance.mark('geste-${k}-debut');1`);
  if (k < 10) { for (let i = 0; i < 14; i++) { molette(sens * 6); await b.dormir(16); } } // 14 petits deltas à ~60 Hz
  else { await toucheZoom(sens < 0 ? '+' : '-'); await b.dormir(60); await toucheZoom(sens < 0 ? '+' : '-'); }
  await b.dormir(700); // le rendu net suit
  await b.ev(`performance.mark('geste-${k}-fin');1`);
  fenetres.push([t0, Date.now() / 1000]);
}
await b.c.send('Page.stopScreencast');
await b.c.send('Tracing.end');
await traceOk;
await b.capture(`zoom-${etiquette}-fin`, { x: zone.x, y: zone.y, width: zone.w, height: Math.min(zone.h, 600) });

// --- analyse des images : part de pixels quasi blancs au centre ---
const ech = 720 / 1440; // échelle du screencast (largeur max 720 px pour 1440 px CSS)
const box = { x: Math.round((cx - 220) * ech), y: Math.round((cy - 120) * ech), w: Math.round(440 * ech), h: Math.round(240 * ech) };
const parts = [];
for (let i = 0; i < images.length; i += 1) {
  const p = await b.ev(`new Promise(ok=>{const im=new Image();im.onload=()=>{const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);const d=x.getImageData(${box.x},${box.y},${box.w},${box.h}).data;let bl=0,sm=0,sq=0;const n=d.length/4;for(let k=0;k<d.length;k+=4){const l=0.3*d[k]+0.59*d[k+1]+0.11*d[k+2];sm+=l;sq+=l*l;if(d[k]>232&&d[k+1]>232&&d[k+2]>232)bl++}const m=sm/n,sd=Math.sqrt(Math.max(0,sq/n-m*m));ok(sd<10?1:bl/n)};im.src='data:image/jpeg;base64,${images[i].data}'})`);
  parts.push(+p.toFixed(3));
}
const blanches = parts.map((p, i) => ({ p, i, t: images[i].t })).filter((x) => x.p > 0.5);
// garde 4 images témoins : la plus blanche et 3 au hasard pendant les gestes
const temoins = [...blanches.sort((a, c) => c.p - a.p).slice(0, 2).map((x) => x.i), Math.floor(images.length / 3), Math.floor(images.length / 2)];
temoins.forEach((i, n) => { if (images[i]) fs.writeFileSync(`../cap/zoom-${etiquette}-image-${n}.jpg`, Buffer.from(images[i].data, 'base64')); });

// --- trace : images perdues pendant les gestes ---
const marques = traces.filter((e) => e.cat && e.cat.includes('blink.user_timing') && /^geste-\d+-(debut|fin)$/.test(e.name));
const debuts = marques.filter((e) => e.name.endsWith('debut')).map((e) => e.ts).sort((a, c) => a - c);
const fins = marques.filter((e) => e.name.endsWith('fin')).map((e) => e.ts).sort((a, c) => a - c);
const dansGeste = (ts) => debuts.some((d, i) => ts >= d && ts <= (fins[i] || Infinity));
// images affichées (viz « Display::FrameDisplayed ») dans la partie ACTIVE de chaque geste (350 ms) : écarts > 25 ms
// = images manquées ; tâches du fil principal du moteur de rendu (CrRendererMain) > 16,7 ms = saccades
const principal = new Set(traces.filter((e) => e.name === 'thread_name' && e.args && e.args.name === 'CrRendererMain').map((e) => e.pid + ':' + e.tid));
const actif = (ts) => debuts.some((d) => ts >= d && ts <= d + 350000);
const aff = traces.filter((e) => e.name === 'Display::FrameDisplayed').map((e) => e.ts).sort((a, c) => a - c);
let presentees = 0, perdues = 0;
debuts.forEach((d) => { const l = aff.filter((t) => t >= d && t <= d + 350000); presentees += l.length; for (let i = 1; i < l.length; i++) perdues += Math.max(0, Math.round((l[i] - l[i - 1]) / 16667) - 1); });
const taches = traces.filter((e) => e.ph === 'X' && e.name === 'ThreadControllerImpl::RunTask' && principal.has(e.pid + ':' + e.tid) && actif(e.ts));
const longues = taches.filter((e) => e.dur > 16667).length;
const tempsPrincipal = Math.round(taches.reduce((a, e) => a + e.dur, 0) / 1000 / Math.max(1, debuts.length));
const dureeGestes = debuts.length * 0.35;
const etat = { longuesSup16ms: longues, msFilPrincipalParGeste: tempsPrincipal, plusLongueTacheMs: Math.round(Math.max(0, ...taches.map((e) => e.dur)) / 1000) };
console.log('');
const res = { etiquette, images: images.length, blanches: blanches.length, partMaxBlanc: Math.max(...parts), etatsImages: etat, presentees, perdues,
  partPerdues: +(perdues / Math.max(1, presentees + perdues)).toFixed(3), fpsMoyen: +(presentees / Math.max(0.001, dureeGestes)).toFixed(1),  zoomFinal: await b.zoomPct() };
fs.writeFileSync(`../cap/zoom-${etiquette}.json`, JSON.stringify({ ...res, parts }, null, 1));
console.log('MESURE', JSON.stringify(res));
if (etiquette === 'apres') {
  b.ok(blanches.length === 0, 'aucune image peinte avec la page blanche (20 zooms)', `${images.length} images, part blanche max ${res.partMaxBlanc}`);
  b.ok(res.partPerdues <= 0.05, 'images perdues ≤ 5 % pendant les gestes', JSON.stringify(etat));
}
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' / '));
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
process.exit(0);
