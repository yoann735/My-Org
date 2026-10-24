// (24/10, docs/compte-rendu-seance-categories.md § 1) TRANSCRIPT EN DIRECT : « rester où je suis ».
// Vraie session (faux Deepgram :54400 + micro simulé voix.wav, Vite :5199 sans Supabase, Chrome headless 9333).
// Remonter d'UNE ligne (molette) → pause immédiate, vue immobile au pixel pendant ATTENTE s ; puis ~50 lignes ;
// « ↓ Reprendre » → collé en bas ; remonter puis redescendre tout en bas à la molette → suivi repris.
// Usage : node t-transcript-defil.mjs [W H] [attente_s]   (mobile/tablette : 820 1180 → doigt au lieu de la molette)
import { banc } from '../tests-pdfreader-v3/commun.mjs';
const W = +(process.argv[2] || 1440), H = +(process.argv[3] || 900), ATTENTE = +(process.argv[4] || 120);
const tactile = W < 1200;
const b = await banc(1440, 900);
await b.biblio({ recharger: true });
await b.ouvrir('Rein v3'); await b.dormir(1500);
if (tactile) {
  await b.c.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true });
  await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await b.dormir(1500);
  const btn = await b.pos(`[...document.querySelectorAll('button')].find(x=>/^Panneau/.test((x.getAttribute('aria-label')||x.title||x.innerText||'').trim()))`, false);
  if (btn) await b.clic(btn, { att: 900 });
}
const seg = await b.pos(`[...document.querySelectorAll('.pm-seg-btn')].find(x=>x.innerText.trim().startsWith('Transcript'))`, false);
await b.clic(seg, { att: 700 });
await b.clic(await b.pos(`[...document.querySelectorAll('.trx-accueil button')].find(x=>/Transcrire le cours/.test(x.innerText))`, false), { att: 1500 });
for (let i = 0; i < 20 && !(await b.ev(`(()=>{const x=[...document.querySelectorAll('.trx-feuille button')].filter(x=>/Démarrer/.test(x.innerText)).pop();return !!x&&!x.disabled})()`)); i++) await b.dormir(300);
await b.clic(await b.pos(`[...document.querySelectorAll('.trx-feuille button')].filter(x=>/Démarrer/.test(x.innerText)).pop()`, true), { att: 3000 });
b.ok(await b.ev(`window.__transcription.lireEtat().phase==='live'`), 'session en direct démarrée');
// lignes : attendre d'en avoir assez pour remonter de 50
// lignes de la session (la liste virtualisée ne rend que les lignes autour de la vue)
const nb = () => b.ev(`window.__transcription.lireEtat().session.segments.length`);
const MIN = +(process.env.MIN_LIGNES || 60);
for (let i = 0; i < 400 && (await nb()) < MIN; i++) await b.dormir(1000);
b.ok((await nb()) >= MIN, `${await nb()} lignes affichées`);
// sonde : à chaque mutation / scroll, ligne en haut de la vue + son décalage, scrollTop
await b.ev(`(()=>{const el=document.querySelector('.trx-liste');window.__sonde=[];const f=()=>{const h=el.getBoundingClientRect().top;let a=null;for(const c of el.children){if(!c.dataset||!c.dataset.id)continue;const r=c.getBoundingClientRect();if(r.bottom>h+1){a={id:c.dataset.id,dy:Math.round((r.top-h)*100)/100};break}}window.__sonde.push({t:Date.now(),st:el.scrollTop,a,bas:el.scrollHeight-el.scrollTop-el.clientHeight})};
  window.__mo=new MutationObserver(f);window.__mo.observe(el,{subtree:true,childList:true,characterData:true,attributes:true});el.addEventListener('scroll',f);window.__f=f;return 1})()`);
const etat = () => b.ev(`(()=>{const el=document.querySelector('.trx-liste');return {st:el.scrollTop,bas:el.scrollHeight-el.scrollTop-el.clientHeight,reprendre:!!document.querySelector('.trx-reprendre'),txt:(document.querySelector('.trx-reprendre')||{}).innerText||''}})()`);
const centre = await b.ev(`(()=>{const r=document.querySelector('.trx-liste').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
// zone de la liste (au doigt, le geste doit rester DANS la liste : le volet bas de la tablette est bas)
const zone = await b.ev(`(()=>{const r=document.querySelector('.trx-liste').getBoundingClientRect();return {haut:r.y+12,bas:r.y+r.height-12}})()`);
const course = Math.max(20, zone.bas - zone.haut);
const hLigne = await b.ev(`(()=>{const l=[...document.querySelectorAll('.trx-liste .trx-ligne.final')];return l.length?Math.round(l[l.length-1].getBoundingClientRect().height):40})()`);
// geste : molette (ordinateur) ou doigt (tablette) vers le haut de `px`
const monter = async (px) => {
  if (!tactile) {
    let r = px;
    while (r > 0) { const d = Math.min(r, 40); await b.c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: centre[0], y: centre[1], deltaX: 0, deltaY: -d }); r -= d; await b.dormir(30); }
  } else {
    let r = px;
    while (r > 0) {
      const d = Math.min(r, course);
      await b.c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: centre[0], y: zone.haut }] });
      for (let k = 1; k <= 10; k++) { await b.c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: centre[0], y: zone.haut + (d * k) / 10 }] }); await b.dormir(16); }
      await b.dormir(60);
      await b.c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      r -= d; await b.dormir(80);
    }
  }
};
const descendre = async (px) => {
  if (!tactile) { let r = px; while (r > 0) { const d = Math.min(r, 120); await b.c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: centre[0], y: centre[1], deltaX: 0, deltaY: d }); r -= d; await b.dormir(30); } }
  else { let r = px; while (r > 0) { const d = Math.min(r, course);
    await b.c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: centre[0], y: zone.bas }] });
    for (let k = 1; k <= 10; k++) { await b.c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: centre[0], y: zone.bas - (d * k) / 10 }] }); await b.dormir(16); }
    await b.dormir(60); await b.c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); r -= d; await b.dormir(80); } }
};
// observe la vue pendant `s` secondes : la ligne du haut et son décalage ne doivent JAMAIS changer
const immobile = async (s, quoi) => {
  await b.dormir(400);
  const t0 = Date.now();
  await b.ev(`(window.__sonde=[],window.__f(),1)`);
  const lignesAvant = await nb();
  await b.dormir(s * 1000);
  await b.ev(`(window.__f(),1)`);
  const sd = await b.ev(`window.__sonde`);
  const ref = sd[0];
  // critère VISUEL : la même ligne en haut de la vue, au même décalage (< 1 px) ; scrollTop peut changer quand la liste
  // virtualisée recalcule ses cales au-dessus (l'ancrage compense exactement)
  const ecarts = sd.filter((x) => !x.a || !ref.a || x.a.id !== ref.a.id || Math.abs(x.a.dy - ref.a.dy) >= 1);
  const derive = Math.max(0, ...sd.filter((x) => x.a && ref.a && x.a.id === ref.a.id).map((x) => Math.abs(x.a.dy - ref.a.dy)));
  const lignesApres = await nb();
  b.ok(ecarts.length === 0 && lignesApres > lignesAvant, `${quoi} : vue immobile au pixel pendant ${s} s (${sd.length} relevés, ${lignesApres - lignesAvant} lignes arrivées entre-temps)`,
    ecarts.length ? JSON.stringify(ecarts.slice(0, 3)) + ' réf ' + JSON.stringify(ref) : `ligne du haut ${ref.a && ref.a.id} à ${ref.a && ref.a.dy} px, écart max ${derive.toFixed(2)} px`);
  return Date.now() - t0;
};
let e = await etat();
b.ok(e.bas <= 2 && !e.reprendre, 'au départ : collé en bas, pas de « Reprendre »', JSON.stringify(e));
// 0) petit geste (trackpad 15 px ; au doigt 30 px, sous ~15 px Chrome ne fait rien défiler) : pause immédiate
const PETIT = tactile ? 30 : 15;
await monter(PETIT);
e = await etat();
b.ok(e.reprendre, `petit geste de ${PETIT} px → suivi en pause immédiatement`, JSON.stringify(e) + (tactile ? ' zone ' + JSON.stringify(zone) + ' centre ' + JSON.stringify(centre) : ''));
await immobile(Math.min(ATTENTE, 20), `après ${PETIT} px`);
await b.clic(await b.pos(`document.querySelector('.trx-reprendre')`, false), { att: 2500 });
// 1) une ligne
await monter(hLigne);
e = await etat();
b.ok(e.reprendre, `remonter d'UNE ligne (${hLigne} px) → suivi en pause, « ↓ Reprendre » affiché`, JSON.stringify(e));
await immobile(ATTENTE, 'après 1 ligne');
e = await etat();
b.ok(/nouvelle/.test(e.txt), 'compteur de nouvelles lignes', e.txt);
await b.capture('sc-trx-pause' + (tactile ? '-tablette' : ''), await b.ev(`(()=>{const r=document.querySelector('.trx-liste-cadre').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(Math.min(r.height,700))}})()`));
// 2) cinquante lignes
await monter(hLigne * 50);
await immobile(Math.min(ATTENTE, 60), 'après 50 lignes');
// 3) Reprendre
await b.clic(await b.pos(`document.querySelector('.trx-reprendre')`, false), { att: 1500 });
await b.dormir(4000);
e = await etat();
b.ok(e.bas <= 2 && !e.reprendre, '« ↓ Reprendre » → collé en bas, le suivi suit les nouvelles lignes', JSON.stringify(e));
// 4) remonter puis revenir tout en bas manuellement
await monter(hLigne * 3);
b.ok((await etat()).reprendre, 'remonter de 3 lignes → pause');
await descendre(hLigne * 3 + 400);
await b.dormir(800);
const n0 = await nb();
await b.dormir(8000);
e = await etat();
b.ok(!e.reprendre && e.bas <= 2 && (await nb()) > n0, 'redescendre tout en bas à la main → suivi repris (collé en bas avec les nouvelles lignes)', JSON.stringify(e));
await b.clic(await b.pos(`document.querySelector('.trx-stop')`, false), { att: 3500 });
b.ok(await b.ev(`window.__transcription.lireEtat().phase==='idle'`), 'session arrêtée');
b.ok(b.erreurs.length === 0, 'aucune erreur JS', b.erreurs.slice(0, 3).join(' | '));
process.exit(0);
