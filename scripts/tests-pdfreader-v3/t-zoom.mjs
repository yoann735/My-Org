// (20/10) Zoom sans flash blanc — 20 zooms / dézooms (pincement de trackpad = Ctrl + molette, petits deltas)
// sur la diapo IMAGE 4K de « Diapo lourde (zoom) », écran Retina simulé (1440 × 900, ×2).
// Mesures : (1) TOUTES les images peintes pendant les gestes (Page.startScreencast) → part de pixels
// « page blanche » au centre de la zone de lecture, image par image ; (2) trace Performance
// (PipelineReporter : images perdues pendant les gestes) ; (3) captures avant / pendant / après.
// Usage : node t-zoom.mjs <avant|apres> — base LOCALE du banc.
import { banc } from './commun.mjs';
import fs from 'node:fs';
const etiquette = process.argv[2] || 'apres';
// variante « ipad » : 1024 × 1366, ×2, tactile — pincements à DEUX DOIGTS (événements tactiles de confiance)
const ipad = process.argv[3] === 'ipad';
const [LW, LH] = ipad ? [1024, 1366] : [1440, 900];
const b = await banc(1440, 900, { tactile: ipad });
await b.S(`for(const r of await S.getAll('reading_position'))if(String(r.id).startsWith('rp:f-v3-lourd'))await S.remove('reading_position',r.id);
  for(const a of await S.getAll('annotations'))if(a.ficheId==='f-v3-lourd')await S.remove('annotations',a.id);
  await S.put('annotations',{id:'an-zoom-1',ficheId:'f-v3-lourd',page:1,x:0.3,y:0.4,width:0.18,height:0.06,kind:'libre',type:'boite',couleur:'ambre',fond:'plein',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Repère'}]}]},createdAt:'2026-10-20T10:00:00.000Z'});
  await S.put('annotations',{id:'an-zoom-3',ficheId:'f-v3-lourd',page:3,x:0.55,y:0.25,width:0.18,height:0.06,kind:'libre',type:'boite',couleur:'sauge',fond:'plein',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Repère 3'}]}]},createdAt:'2026-10-20T10:00:00.000Z'});return 1`);
await b.biblio({ recharger: true });
await b.ouvrir('Diapo lourde (zoom)'); await b.dormir(2500);
await b.c.send('Emulation.setDeviceMetricsOverride', { width: LW, height: LH, deviceScaleFactor: 2, mobile: ipad });
await b.dormir(1500);
await b.ev(`window.__mrZoom(1);1`); await b.dormir(1500);
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0;1`); await b.dormir(1500);
// zone mesurée : le centre de la zone de lecture (où se trouve la diapo image)
const zone = await b.ev(`(()=>{const r=document.querySelector('.pdfr-scroll').getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height}})()`);
const cx = zone.x + zone.w / 2, cy = zone.y + Math.min(zone.h * 0.35, 260);
await b.capture(`zoom-${etiquette}${ipad ? '-ipad' : ''}-depart`, { x: zone.x, y: zone.y, width: zone.w, height: Math.min(zone.h, 600) });

// --- enregistrement : screencast (toutes les images peintes) + trace ---
const images = [];
b.c.on((m) => { if (m.method === 'Page.screencastFrame') { images.push({ t: m.params.metadata.timestamp, data: m.params.data }); b.c.send('Page.screencastFrameAck', { sessionId: m.params.sessionId }).catch(() => {}); } });
const traces = [];
b.c.on((m) => { if (m.method === 'Tracing.dataCollected') traces.push(...m.params.value); });
let traceFinie; const traceOk = new Promise((r) => { traceFinie = r; });
b.c.on((m) => { if (m.method === 'Tracing.tracingComplete') traceFinie(); });
await b.c.send('Page.enable');
await b.c.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline.frame,blink.user_timing,benchmark,cc,toplevel', transferMode: 'ReportEvents' });
await b.c.send('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: LW / 2, everyNthFrame: 1 });
await b.dormir(400);
const fenetres = [];
// sonde : à chaque image, position à l'écran de la boîte « Repère » de la page visée et transformation du conteneur
await b.ev(`(()=>{window.__sonde=[];const f=()=>{const p=document.querySelector('.pdfr-pages');const pos={};for(const bx of document.querySelectorAll('.note-box')){const m=/Repère( 3)?/.exec(bx.innerText);if(m){const r=bx.getBoundingClientRect();pos[m[1]?'b3':'b1']=[r.left,r.top]}}window.__sonde.push({t:performance.now(),pos,tr:p?p.style.transform:''});requestAnimationFrame(f)};requestAnimationFrame(f);return 1})()`);
const alignements = [];
const mesurerAlignement = (k) => b.ev(`(()=>{const out=[];for(const bx of document.querySelectorAll('.note-box')){const m=/Repère( 3)?/.exec(bx.innerText);if(!m)continue;const page=bx.closest('.pdfr-page');const rp=page.getBoundingClientRect(),r=bx.getBoundingClientRect();const fx=m[1]?0.55:0.3,fy=m[1]?0.25:0.4;out.push({dx:+(r.left-(rp.left+fx*rp.width)).toFixed(2),dy:+(r.top-(rp.top+fy*rp.height)).toFixed(2)})}
  const c=document.querySelector('.pdfr-page[data-cle] canvas.devant[data-rendu]');const rc=c&&c.getBoundingClientRect();return {k:${k},boites:out,densite:c?+(c.width/rc.width).toFixed(3):null,zoom:(document.querySelector('[data-zoom-libelle]')||{}).textContent}})()`);
const molette = (d) => b.c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: d, modifiers: 2 });
const toucheZoom = async (k) => { for (const type of ['keyDown', 'keyUp']) await b.c.send('Input.dispatchKeyEvent', { type, key: k, code: k === '+' ? 'Equal' : 'Minus', modifiers: 4, windowsVirtualKeyCode: k === '+' ? 187 : 189 }); };
for (let k = 0; k < 20; k++) {
  const sens = k % 2 === 0 ? -1 : 1; // zoom avant, puis arrière
  // gestes 0-9 : pincement sur la diapo 1 ; 10-19 : ⌘+ / ⌘− (2 crans) sur la diapo 3, plus bas dans le cours
  if (k === 10) { await b.ev(`(()=>{const p=[...document.querySelectorAll('.pdfr-page')].find(e=>e.dataset.cle==='3');const s=document.querySelector('.pdfr-scroll');s.scrollTop+=p.getBoundingClientRect().top-s.getBoundingClientRect().top-20;return 1})()`); await b.dormir(1500); }
  const t0 = Date.now() / 1000;
  await b.ev(`performance.mark('geste-${k}-debut');1`);
  if (k < 10 && ipad) { // pincement : les deux doigts s'écartent (zoom avant) ou se rapprochent (arrière), 14 pas à ~60 Hz
    const tp = (type, e) => b.c.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: cx - e, y: cy, id: 1 }, { x: cx + e, y: cy, id: 2 }] });
    const e0 = sens < 0 ? 80 : 150, e1 = sens < 0 ? 150 : 80;
    await tp('touchStart', e0);
    for (let i = 1; i <= 14; i++) { tp('touchMove', e0 + (e1 - e0) * i / 14); await b.dormir(16); }
    await b.dormir(50); // les doigts se lèvent après le dernier mouvement (pas dans la même image)
    await tp('touchEnd', e1);
  } else if (k < 10) { for (let i = 0; i < 14; i++) { molette(sens * 6); await b.dormir(16); } } // 14 petits deltas à ~60 Hz
  else { await toucheZoom(sens < 0 ? '+' : '-'); await b.dormir(60); await toucheZoom(sens < 0 ? '+' : '-'); }
  await b.dormir(700); // le rendu net suit
  await b.ev(`performance.mark('geste-${k}-fin');1`);
  alignements.push(await mesurerAlignement(k));
  fenetres.push([t0, Date.now() / 1000]);
}
await b.c.send('Page.stopScreencast');
await b.c.send('Tracing.end');
await traceOk;
await b.capture(`zoom-${etiquette}${ipad ? '-ipad' : ''}-fin`, { x: zone.x, y: zone.y, width: zone.w, height: Math.min(zone.h, 600) });

// --- saut à la fin d'un geste : position du repère juste avant / juste après le retrait de la transformation ---
const sonde = await b.ev(`window.__sonde`);
const sauts = [];
for (let i = 1; i < sonde.length; i++) {
  if (!(/scale/.test(sonde[i - 1].tr) && !/scale/.test(sonde[i].tr))) continue; // fin du geste : la mise à l'échelle CSS part
  const cles = Object.keys(sonde[i].pos).filter((c) => sonde[i - 1].pos[c]);
  if (process.env.DBG && cles.length) console.log('fin', i, cles.map((c) => [c, (sonde[i].pos[c][0] - sonde[i - 1].pos[c][0]).toFixed(1), (sonde[i].pos[c][1] - sonde[i - 1].pos[c][1]).toFixed(1)].join(':')).join(' '), sonde[i - 1].tr, '→', sonde[i].tr);
  if (cles.length) sauts.push(+Math.max(...cles.map((c) => Math.hypot(sonde[i].pos[c][0] - sonde[i - 1].pos[c][0], sonde[i].pos[c][1] - sonde[i - 1].pos[c][1]))).toFixed(2));
}
const desalignes = alignements.filter((a) => a.boites.some((q) => Math.abs(q.dx) > 1 || Math.abs(q.dy) > 1));
const flous = alignements.filter((a) => a.densite != null && a.densite < 1.95);
// --- analyse des images : part de pixels quasi blancs au centre ---
const ech = 0.5; // échelle du screencast (moitié de la largeur CSS)
const box = { x: Math.round((cx - 220) * ech), y: Math.round((cy - 120) * ech), w: Math.round(440 * ech), h: Math.round(240 * ech) };
const parts = [];
for (let i = 0; i < images.length; i += 1) {
  const p = await b.ev(`new Promise(ok=>{const im=new Image();im.onload=()=>{const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);const d=x.getImageData(${box.x},${box.y},${box.w},${box.h}).data;let bl=0,sm=0,sq=0;const n=d.length/4;for(let k=0;k<d.length;k+=4){const l=0.3*d[k]+0.59*d[k+1]+0.11*d[k+2];sm+=l;sq+=l*l;if(d[k]>232&&d[k+1]>232&&d[k+2]>232)bl++}const m=sm/n,sd=Math.sqrt(Math.max(0,sq/n-m*m));ok(sd<10?1:bl/n)};im.src='data:image/jpeg;base64,${images[i].data}'})`);
  parts.push(+p.toFixed(3));
}
const blanches = parts.map((p, i) => ({ p, i, t: images[i].t })).filter((x) => x.p > 0.5);
// garde 4 images témoins : la plus blanche et 3 au hasard pendant les gestes
const temoins = [...blanches.sort((a, c) => c.p - a.p).slice(0, 2).map((x) => x.i), Math.floor(images.length / 3), Math.floor(images.length / 2)];
temoins.forEach((i, n) => { if (images[i]) fs.writeFileSync(`../cap/zoom-${etiquette}${ipad ? '-ipad' : ''}-image-${n}.jpg`, Buffer.from(images[i].data, 'base64')); });

// --- trace : images perdues pendant les gestes ---
const marques = traces.filter((e) => e.cat && e.cat.includes('blink.user_timing') && /^geste-\d+-(debut|fin)$/.test(e.name));
const debuts = marques.filter((e) => e.name.endsWith('debut')).map((e) => e.ts).sort((a, c) => a - c);
const fins = marques.filter((e) => e.name.endsWith('fin')).map((e) => e.ts).sort((a, c) => a - c);
const dansGeste = (ts) => debuts.some((d, i) => ts >= d && ts <= (fins[i] || Infinity));
// images affichées (viz « Display::FrameDisplayed ») dans la partie ACTIVE de chaque geste (240 ms, la durée des événements du geste) : écarts > 25 ms
// = images manquées ; tâches du fil principal du moteur de rendu (CrRendererMain) > 16,7 ms = saccades
const principal = new Set(traces.filter((e) => e.name === 'thread_name' && e.args && e.args.name === 'CrRendererMain').map((e) => e.pid + ':' + e.tid));
const actif = (ts) => debuts.some((d) => ts >= d && ts <= d + 240000);
const aff = traces.filter((e) => e.name === 'Display::FrameDisplayed').map((e) => e.ts).sort((a, c) => a - c);
let presentees = 0, perdues = 0;
const fpsGestes = [];
debuts.forEach((d) => { const l = aff.filter((t) => t >= d && t <= d + 240000); presentees += l.length; for (let i = 1; i < l.length; i++) perdues += Math.max(0, Math.round((l[i] - l[i - 1]) / 16667) - 1); if (l.length > 2) fpsGestes.push((l.length - 1) / ((l[l.length - 1] - l[0]) / 1e6)); });
const taches = traces.filter((e) => e.ph === 'X' && e.name === 'ThreadControllerImpl::RunTask' && principal.has(e.pid + ':' + e.tid) && actif(e.ts));
const longues = taches.filter((e) => e.dur > 16667).length;
const tempsPrincipal = Math.round(taches.reduce((a, e) => a + e.dur, 0) / 1000 / Math.max(1, debuts.length));
const dureeGestes = debuts.length * 0.35;
const etat = { longuesSup16ms: longues, msFilPrincipalParGeste: tempsPrincipal, plusLongueTacheMs: Math.round(Math.max(0, ...taches.map((e) => e.dur)) / 1000) };
console.log('');
const res = { etiquette, appareil: ipad ? 'ipad' : 'retina', finsDeGeste: sauts.length, sautMaxPx: sauts.length ? Math.max(...sauts) : null, alignementsHors1px: desalignes.length, niveauxMesures: alignements.length, canvasFlous: flous.length, images: images.length, blanches: blanches.length, partMaxBlanc: Math.max(...parts), etatsImages: etat, presentees, perdues,
  partPerdues: +(perdues / Math.max(1, presentees + perdues)).toFixed(3), fpsMoyen: +(fpsGestes.reduce((a, c) => a + c, 0) / Math.max(1, fpsGestes.length)).toFixed(1), fpsMin: +Math.min(...fpsGestes).toFixed(1),  zoomFinal: await b.zoomPct() };
fs.writeFileSync(`../cap/zoom-${etiquette}${ipad ? '-ipad' : ''}.json`, JSON.stringify({ ...res, parts }, null, 1));
console.log('MESURE', JSON.stringify(res));
if (etiquette === 'apres') {
  b.ok(blanches.length === 0, 'aucune image peinte avec la page blanche (20 zooms)', `${images.length} images, part blanche max ${res.partMaxBlanc}`);
  b.ok(res.partPerdues <= 0.05, 'images perdues ≤ 5 % pendant les gestes', JSON.stringify(etat));
  b.ok(sauts.length >= 10 && Math.max(...sauts) <= 1, 'fin de chaque geste : aucun saut (≤ 1 px) au retrait de la transformation', `${sauts.length} fins, saut max ${Math.max(...sauts)} px`);
  b.ok(!desalignes.length, 'annotations alignées sur la page à chaque niveau de zoom (≤ 1 px)', JSON.stringify(desalignes.slice(0, 2)));
  b.ok(!flous.length, 'après chaque geste : canvas net (densité de l’écran ×2)', JSON.stringify(alignements.map((a) => a.densite)));
}
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' / '));
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
process.exit(0);
