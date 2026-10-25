// Tags « Début / Fin de cours » : 2 séances (clic droit et « … »), liaison à une ANCIENNE session puis à la session EN COURS
// (faux Deepgram), pastilles page + vignette (mode Pages), liseré, liste « Séances » (menu Fichier), pastille → transcript.
// Banc 9333 (base locale ; Chrome lancé avec micro factice). node t-tags.mjs [ordinateur|tablette]
import { banc } from '../tests-fiche-jumelle/commun.mjs';
const app = process.argv[2] || 'ordinateur';
const b = await banc(1440, 900, { tactile: app === 'tablette' });
let echecs = 0; const v = (c, m, d = '') => { console.log((c ? '✅' : '❌') + ' ' + m + (d ? ' — ' + d : '')); if (!c) echecs++; };
const S = (js) => b.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const S=await import(u.find(n=>n.includes('/medrevise/lib/storage.js')));${js}})()`);
await b.ouvrir('Physiologie rénale (jumelle)', { recharger: true });
await S(`for(const t of await S.getAll('page_tag')) if(t.courseId==='f-fj') await S.remove('page_tag',t.id);
  await S.put('transcript_session',{id:'ts-ancienne',kind:'session',courseId:'f-fj',startedAt:'2026-10-20T09:00:00.000Z',endedAt:'2026-10-20T09:52:00.000Z',source:'micro',keyterms:[],segments:[{id:'s1',t0:0,t1:3,text:'Bonjour, aujourd’hui le néphron.',status:'final',page:2,doc:'original'}],notes:[],fontSize:'m',durationS:3120,createdAt:'2026-10-20T09:00:00.000Z'});
  localStorage.setItem('medrevise.vue.f-fj', JSON.stringify('original')); return 1`);
await b.ouvrir('Physiologie rénale (jumelle)', { recharger: true });
// vue Original
await b.ev(`(()=>{const s=[...document.querySelectorAll('button')].find(x=>/^(Original|Diapo)/.test(x.innerText.trim())&&x.closest('[role=group], [class*=bascule], [class*=segment]'));s&&s.click();return 1})()`); await b.dormir(1500);
if (app === 'tablette') { await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1366, deviceScaleFactor: 2, mobile: true }); await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await b.dormir(1800); }
const versPage = async (n) => { for (let i = 0; i < 30; i++) { const ok = await b.ev(`(()=>{const s=document.querySelector('.pdfr-scroll');const p=[...document.querySelectorAll('.pdfr-page')][0];const all=[...document.querySelectorAll('.pdfr-page[data-cle]')];const e=document.querySelector('.pdfr-page[data-cle="${n}"]');if(e){s.scrollTop+=e.getBoundingClientRect().top-s.getBoundingClientRect().top-20;return true}const max=Math.max(...all.map(x=>+x.dataset.cle));s.scrollTop+=(${n}>max?1:-1)*s.clientHeight*.8;return false})()`); await b.dormir(ok ? 700 : 300); if (ok) return; } };
const clicItem = async (txt) => { const p = await b.pos(`[...document.querySelectorAll('.ctx-menu-item')].find(x=>x.innerText.includes(${JSON.stringify(txt)}))`, false); if (!p) throw new Error('menu : ' + txt); await b.clic(p, { att: 600 }); };
const fenetre = async ({ date, lien, session }) => {
  await b.attendre?.(`!!document.querySelector('.tgp-fenetre')`).catch(() => {});
  for (let i = 0; i < 20 && !(await b.ev(`!!document.querySelector('.tgp-fenetre')`)); i++) await b.dormir(150);
  if (date) await b.ev(`(()=>{const i=document.querySelector('.tgp-fenetre [data-champ=date]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'${date}');i.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
  await b.dormir(400); // liste des sessions chargée
  if (lien) { await b.clic(await b.pos(`document.querySelector('.tgp-fenetre [data-lien="${lien}"]')`, false), { att: 300 }); }
  if (session) await b.ev(`(()=>{const s=document.querySelector('.tgp-fenetre [data-champ=session]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'${session}');s.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`);
  await b.dormir(200);
  const lie = await b.ev(`(()=>{const r=document.querySelector('.tgp-fenetre input[type=radio]:checked');return r&&r.dataset.lien})()`);
  await b.clic(await b.pos(`document.querySelector('.tgp-fenetre [data-action=valider]')`, false), { att: 700 });
  return lie;
};
const droit = async (n) => { await versPage(n); const r = await b.ev(`(()=>{const e=document.querySelector('.pdfr-page[data-cle="${n}"]').getBoundingClientRect();return [e.x+e.width*.3,e.y+Math.min(e.height*.5,300)]})()`);
  if (app === 'tablette') { const q = await b.pos(`document.querySelector('.pdfr-page[data-cle="${n}"] .pdfr-page-menu')`, false); await b.clic(q, { att: 500 }); return; }
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await b.c.send('Input.dispatchMouseEvent', { type, x: r[0], y: r[1], button: 'right', clickCount: 1 }); await b.dormir(500); };
const troisPoints = async (n) => { await versPage(n); await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 700, y: 400 }); const q = await b.pos(`document.querySelector('.pdfr-page[data-cle="${n}"] .pdfr-page-menu')`, false); await b.clic(q, { att: 500 }); };
const pastilles = () => b.ev(`[...document.querySelectorAll('.pdfr-page[data-cle] .pdfr-tags .tgp-pastille')].map(x=>x.closest('.pdfr-page').dataset.cle+':'+x.textContent)`);
// ---- séance 1 : ANCIENNE session ----
await droit(2);
v(await b.ev(`[...document.querySelectorAll('.ctx-menu-item')].map(x=>x.innerText).join('|')`).then((t) => /Marquer début de cours/.test(t) && /Marquer fin de cours/.test(t)), app === 'tablette' ? '« … » de la page : « Marquer début / fin de cours »' : 'clic droit sur la page : « Marquer début / fin de cours »');
await clicItem('Marquer début de cours');
let lie = await fenetre({ date: '2026-10-20', lien: 'existante', session: 'ts-ancienne' });
await troisPoints(5); await clicItem('Marquer fin de cours');
await fenetre({ date: '2026-10-20', lien: 'existante', session: 'ts-ancienne' });
let tags = await S(`return (await S.getAll('page_tag')).filter(t=>t.courseId==='f-fj'&&!t.supprime).map(t=>[t.kind,t.page,t.date,t.transcriptSessionId,t.document].join(' '))`);
v(tags.includes('debut 2 2026-10-20 ts-ancienne original') && tags.includes('fin 5 2026-10-20 ts-ancienne original'), 'séance 1 enregistrée (type page_tag) et liée à l’ancienne session', tags.join(' | '));
await versPage(3);
v((await pastilles()).some((x) => x === '2:▶ Début · 20 oct.' || x.startsWith('2:▶ Début · 20 oct.')), 'pastille « ▶ Début · 20 oct. » sur la page 2', (await pastilles()).join(' | '));
// ---- séance 2 : session EN COURS ----
const seg = await b.pos(`[...document.querySelectorAll('.pm-seg-btn')].find(x=>x.innerText.trim().startsWith('Trans'))`, false);
if (seg) await b.clic(seg, { att: 700 });
const jsClic = (js) => b.ev(`(()=>{const x=${js};if(!x)return false;x.click();return true})()`);
await jsClic(`[...document.querySelectorAll('.pm-vue[data-mode=transcript] button')].find(x=>/Retour aux sessions/.test(x.innerText+x.title))`); await b.dormir(900);
if (!(await b.ev(`window.__transcription.lireEtat().phase==='live'`))) {
  await jsClic(`[...document.querySelectorAll('button')].find(x=>/Transcrire le cours/.test(x.innerText))`); await b.dormir(1500);
  for (let i = 0; i < 20 && !(await b.ev(`(()=>{const x=[...document.querySelectorAll('.trx-feuille button')].filter(x=>/Démarrer/.test(x.innerText)).pop();return !!x&&!x.disabled})()`)); i++) await b.dormir(300);
  await jsClic(`[...document.querySelectorAll('.trx-feuille button')].filter(x=>/Démarrer/.test(x.innerText)).pop()`); await b.dormir(3500);
}
const live = await b.ev(`!!(window.__transcription&&window.__transcription.lireEtat().phase==='live')`);
v(live, 'session de transcript en direct démarrée (faux Deepgram)');
const idLive = live ? await b.ev(`window.__transcription.lireEtat().session.id`) : null;
await droit(6); await clicItem('Marquer début de cours');
lie = await fenetre({});
v(lie === 'en-cours', `nouveau tag : « Session en cours » proposée par défaut (${lie})`);
await troisPoints(9); await clicItem('Marquer fin de cours'); await fenetre({});
tags = await S(`return (await S.getAll('page_tag')).filter(t=>t.courseId==='f-fj'&&!t.supprime)`);
const t6 = tags.find((t) => t.page === 6), t9 = tags.find((t) => t.page === 9);
v(t6 && t9 && t6.transcriptSessionId === idLive && t9.transcriptSessionId === idLive && t6.date === new Date().toISOString().slice(0, 10), `séance 2 liée à la session en cours (${idLive}), datée d’aujourd’hui`);
// ---- liseré ----
await versPage(1);
const lis = await b.ev(`(async()=>{const out={};for(const n of [1,2,3,4,5,6,7,8,9,10]){const s=document.querySelector('.pdfr-scroll');let e=document.querySelector('.pdfr-page[data-cle="'+n+'"]');if(!e){continue}out[n]=e.classList.contains('en-seance')}return out})()`);
console.log('liseré (pages montées) :', JSON.stringify(lis));
const lis2 = {}; for (const n of [1, 2, 3, 5, 6, 8, 9, 10]) { await versPage(n); lis2[n] = await b.ev(`document.querySelector('.pdfr-page[data-cle="${n}"]').classList.contains('en-seance')`); }
v(!lis2[1] && lis2[2] && lis2[3] && lis2[5] && lis2[6] && lis2[8] && lis2[9] && !lis2[10], 'liseré sur les pages 2–5 et 6–9, pas sur 1 ni 10', JSON.stringify(lis2));
await versPage(5); await b.capture(`tags-${app}-page`);
// ---- vignettes (mode Pages) ----
if (app === 'tablette') { const pb = await b.pos(`[...document.querySelectorAll('button')].find(x=>/^(Afficher le panneau|Panneau)/.test(x.getAttribute('aria-label')||x.title||''))`, false); if (pb) await b.clic(pb, { att: 900 }); }
await b.ev(`[...document.querySelectorAll('.pm-seg-btn')].find(x=>x.innerText.trim().startsWith('Pages')).scrollIntoView({inline:'nearest'});1`); await b.dormir(900);
const sp = await b.pos(`[...document.querySelectorAll('.pm-seg-btn')].find(x=>x.innerText.trim().startsWith('Pages'))`, false);
if (sp) await b.clic(sp, { att: 1500 });
v(await b.ev(`(document.querySelector('.pm-seg-btn.actif')||{}).innerText.startsWith('Pages')`), 'mode « Pages » du panneau ouvert');
const vig = await b.ev(`(()=>{const l=[...document.querySelectorAll('.tgp-vignette')];return {n:l.length,tags:l.filter(x=>x.querySelector('.tgp-pastille')).map(x=>x.dataset.vignette+':'+[...x.querySelectorAll('.tgp-pastille')].map(p=>p.textContent).join('+')),seance:l.filter(x=>x.classList.contains('en-seance')).map(x=>x.dataset.vignette).join(','),canvas:l.filter(x=>{const c=x.querySelector('canvas');return c&&c.width>0}).length}})()`);
v(vig.n === 26 && vig.tags.length === 4 && vig.seance === '2,3,4,5,6,7,8,9', `vignettes : ${vig.n} pages, pastilles ${vig.tags.join(' ')}, liseré ${vig.seance}, ${vig.canvas} rendues`);
await b.ev(`document.querySelector('.tgp-vignette[data-vignette="2"]').scrollIntoView({block:'start'});1`); await b.dormir(1200);
await b.capRect?.('x', 'null').catch?.(() => {});
const rp = await b.rect(`document.querySelector('.pis-body') || document.querySelector('.tgp-panneau')`);
if (rp) await b.capture(`tags-${app}-vignettes`, { x: Math.round(rp.x), y: Math.round(rp.y), width: Math.round(rp.w), height: Math.round(Math.min(rp.h, 900 - rp.y)) });
// clic sur une vignette → page
await jsClic(`document.querySelector('.tgp-vignette[data-vignette="7"] .tgp-vbouton')`); await b.dormir(900);
v(await b.ev(`(()=>{const s=document.querySelector('.pdfr-scroll').getBoundingClientRect();const e=document.querySelector('.pdfr-page[data-cle="7"]');if(!e)return false;const r=e.getBoundingClientRect();return r.top<s.top+80&&r.bottom>s.top})()`), 'clic sur la vignette 7 → page 7 affichée');
// ---- Séances (menu Fichier) ----
await b.clic(await b.pos(`document.querySelector('.mf-bouton')`, false), { att: 500 });
await b.clic(await b.pos(`document.querySelector('[data-entree="seances"]')`, false), { att: 900 });
const sea = await b.ev(`[...document.querySelectorAll('.tgp-ligne')].map(x=>x.innerText.replace(/\\s+/g,' ').trim())`);
v(sea.length === 2 && sea.some((x) => /20 oct\. p\. 2–5/.test(x)) && sea.some((x) => /p\. 6–9/.test(x)), 'liste « Séances » : 2 séances, dates, pages début–fin, transcript lié', sea.join(' ‖ '));
await b.capture(`tags-${app}-seances`);
await b.clic(await b.pos(`[...document.querySelectorAll('.tgp-ligne')].find(x=>/p\\. 2–5/.test(x.innerText)).querySelector('.tgp-aller')`, false), { att: 1200 });
v(await b.ev(`(()=>{const s=document.querySelector('.pdfr-scroll').getBoundingClientRect();const e=document.querySelector('.pdfr-page[data-cle="2"]');if(!e)return false;const r=e.getBoundingClientRect();return r.top<s.top+80&&r.bottom>s.top})()`), 'un clic sur une séance → sa page de début');
// ---- pastille liée → transcript de l'ancienne session ----
await versPage(2);
await b.clic(await b.pos(`document.querySelector('.pdfr-page[data-cle="2"] .pdfr-tags .tgp-pastille')`, false), { att: 1500 });
const trx = await b.ev(`(()=>{const a=document.querySelector('.pm-seg-btn.actif');return a?a.innerText.trim():''})()`);
const sesAff = await b.ev(`document.querySelector('.pm-vue[data-mode=transcript]').textContent.includes('Bonjour, aujourd’hui le néphron')`);
v(/^Trans/.test(trx) && sesAff, `clic sur la pastille → panneau Transcript sur la session liée (${trx}, ligne de l’ancienne session visible : ${sesAff})`);
// ---- modifier puis retirer un lien, retirer un tag ----
await droit(9); await clicItem('Fin de cours : date et transcript');
await fenetre({ lien: 'aucun' });
let t9b = await S(`return (await S.getAll('page_tag')).find(t=>t.courseId==='f-fj'&&t.page===9&&!t.supprime)`);
v(t9b && t9b.transcriptSessionId === null, 'lien retiré du tag « Fin » page 9');
await droit(9); await clicItem('Retirer le tag « Fin »');
t9b = await S(`return (await S.getAll('page_tag')).filter(t=>t.courseId==='f-fj'&&t.page===9).map(t=>!!t.supprime)`);
v(t9b.length === 1 && t9b[0] === true, 'tag retiré = marqué « supprime » (aucun effacement)');
await troisPoints(9); await clicItem('Marquer fin de cours'); await fenetre({ lien: 'en-cours' });
// arrêt de la transcription
await jsClic(`[...document.querySelectorAll('.pm-vue[data-mode=transcript] button')].find(x=>/^Arrêter/.test(x.innerText.trim()))`); await b.dormir(1500);
await jsClic(`[...document.querySelectorAll('.day-pop button, [role=dialog] button')].find(x=>/^Arrêter/.test(x.innerText.trim()))`); await b.dormir(1000);
console.log('transcription :', await b.ev(`window.__transcription.lireEtat().phase`));
v(!(b.erreurs && b.erreurs.length), 'console sans erreur', (b.erreurs || []).slice(0, 3).join(' | '));
console.log(echecs ? `❌ ${echecs} échec(s)` : '✅ tout est vert');
process.exit(0);
