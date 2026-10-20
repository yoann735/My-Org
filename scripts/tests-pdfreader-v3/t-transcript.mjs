// (20/10) Transcript ↔ diapo : une vraie session de transcription (faux Deepgram + micro simulé) sur 3 pages
// différentes → numéros de page des segments, clic « p. N » → page, filtre « Cette page » qui suit le défilement,
// badges par page, copie avec numéros de page, ancienne session (sans page) intacte. Base LOCALE, cours « Rein v3 ».
// Banc : node ../faux-deepgram.mjs ; Vite :5199 avec DEEPGRAM_API_KEY=cle-de-test DEEPGRAM_API_URL=http://localhost:54400
// DEEPGRAM_LISTEN_URL=ws://localhost:54400/v1/listen VITE_SUPABASE_URL= ; Chrome --no-sandbox --use-fake-device-for-media-stream
// --use-file-for-fake-audio-capture=voix.wav.   Usage : node t-transcript.mjs
import { banc } from './commun.mjs';
const b = await banc(1440, 900);
const ANCIENNE = { id: 'ts-v3-ancienne', kind: 'session', courseId: 'f-v3-rein', startedAt: '2026-10-01T08:00:00.000Z', endedAt: '2026-10-01T08:01:00.000Z', source: 'micro', keyterms: [],
  segments: [{ id: 'sg-a1', t0: 1, t1: 4, text: 'Ancienne session, première ligne.', status: 'final' }, { id: 'sg-a2', t0: 5, t1: 9, text: 'Deuxième ligne sans numéro de page.', status: 'final' }],
  notes: [], fontSize: 'm', durationS: 60, createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:01:00.000Z' };
await b.S(`for(const r of await S.getAll('transcript_session'))if(r.courseId==='f-v3-rein')await S.remove('transcript_session',r.id);
  for(const r of await S.getAll('reading_position'))if(String(r.id).startsWith('rp:f-v3-rein'))await S.remove('reading_position',r.id);
  await S.put('transcript_session',${JSON.stringify(ANCIENNE)});return 1`);
await b.biblio({ recharger: true });
await b.ouvrir('Rein v3'); await b.dormir(1500);
await b.ev(`window.__mrZoom(1);1`); await b.dormir(1000);
const allerPage = (n) => b.allerPage(n);
const pageLue = () => b.ev(`parseInt((document.querySelector('.ptb-pages .tnum')||{}).innerText)`);
await allerPage(1); await b.dormir(800);
// panneau › Transcript › Transcrire › Démarrer
await b.clic(await b.pos(`[...document.querySelectorAll('.pm-seg-btn')].find(x=>x.innerText.trim().startsWith('Transcript'))`, false), { att: 700 });
await b.clic(await b.pos(`[...document.querySelectorAll('.trx-accueil button')].find(x=>/Transcrire le cours/.test(x.innerText))`, false), { att: 1500 });
for (let i = 0; i < 20 && !(await b.ev(`(()=>{const x=[...document.querySelectorAll('.trx-feuille button')].filter(x=>/Démarrer/.test(x.innerText)).pop();return !!x&&!x.disabled})()`)); i++) await b.dormir(300);
await b.clic(await b.pos(`[...document.querySelectorAll('.trx-feuille button')].filter(x=>/Démarrer/.test(x.innerText)).pop()`, true), { att: 3000 });
b.ok(await b.ev(`window.__transcription.lireEtat().phase==='live'`), 'session en direct démarrée (faux Deepgram, micro simulé)');
// trois phases : page 1, page 3, page 7 — on note les segments validés pendant chaque phase
const segs = () => b.ev(`window.__transcription.lireEtat().session.segments.map(s=>({id:s.id,page:s.page,doc:s.doc,status:s.status}))`);
const phases = [];
for (const p of [1, 3, 7]) {
  await allerPage(p);
  const avant = new Set((await segs()).map((s) => s.id));
  b.ok((await pageLue()) === p, `lecteur sur la page ${p}`);
  await b.dormir(9000);
  const nouveaux = (await segs()).filter((s) => !avant.has(s.id) && s.status === 'final');
  phases.push({ p, nouveaux });
}
for (const { p, nouveaux } of phases) {
  b.ok(nouveaux.length >= 2 && nouveaux.every((s) => s.page === p && s.doc === 'original'), `segments validés sur la page ${p} : page ${p} enregistrée`, `${nouveaux.length} segments → ${[...new Set(nouveaux.map((s) => s.page))]}`);
}
// en direct : numéros visibles, filtre « Cette page » (lecteur sur la page 7)
const lignesVues = () => b.ev(`[...document.querySelectorAll('.trx-liste .trx-ligne.final')].map(l=>({page:(l.querySelector('.trx-page')||{}).textContent||null}))`);
b.ok((await lignesVues()).every((l) => l.page), 'en direct : chaque ligne validée porte « p. N »');
await b.clic(await b.pos(`document.querySelector('.trx-cette-page')`, false), { att: 400 });
let vues = await lignesVues();
b.ok(vues.length > 0 && vues.every((l) => l.page === 'p. 7'), 'en direct : « Cette page » → seulement les lignes de la page 7', `${vues.length} lignes`);
await b.clic(await b.pos(`document.querySelector('.trx-cette-page')`, false), { att: 300 });
// arrêter
await b.clic(await b.pos(`document.querySelector('.trx-stop')`, false), { att: 3500 });
b.ok(await b.ev(`window.__transcription.lireEtat().phase==='idle'`), 'session arrêtée et enregistrée');
const rec = await b.S(`const l=(await S.getAll('transcript_session')).filter(r=>r.courseId==='f-v3-rein'&&r.kind==='session'&&r.id!=='ts-v3-ancienne');return l[0]&&{id:l[0].id,segs:l[0].segments.map(s=>({page:s.page,doc:s.doc,status:s.status,cle:s.pageCle}))}`);
const parPage = {}; rec.segs.filter((s) => s.status !== 'gap').forEach((s) => { parPage[s.page] = (parPage[s.page] || 0) + 1; });
b.ok(Object.keys(parPage).map(Number).sort((a, c) => a - c).join(',') === '1,3,7', 'base locale : segments sur les pages 1, 3 et 7 (champ « page » ajouté)', JSON.stringify(parPage));
b.ok(rec.segs.filter((s) => s.page).every((s) => s.cle === s.page), 'pageCle = n° de la page du PDF (aucune page ajoutée)');
// lecture : clic sur un « p. 3 » → le lecteur va à la page 3
await b.dormir(800);
await allerPage(12);
const p3 = await b.pos(`[...document.querySelectorAll('.trx-liste .trx-page')].find(x=>x.textContent==='p. 3')`, true);
await b.clic(p3, { att: 900 });
b.ok((await pageLue()) === 3, 'clic sur « p. 3 » : le lecteur défile jusqu’à la page 3', String(await pageLue()));
// filtre « Cette page » : suit le défilement
await b.clic(await b.pos(`document.querySelector('.trx-cette-page')`, false), { att: 400 });
vues = await lignesVues();
b.ok(vues.length === parPage[3] && vues.every((l) => l.page === 'p. 3'), `« Cette page » (page 3) : ${parPage[3]} lignes, toutes de la page 3`, `${vues.length} vues`);
await b.capture('trx-cette-page', await b.ev(`(()=>{const r=document.querySelector('.trx-panneau').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.min(560,Math.round(r.height))}})()`));
await allerPage(7);
vues = await lignesVues();
b.ok(vues.length === parPage[7] && vues.every((l) => l.page === 'p. 7'), `le filtre suit le défilement : page 7 → ${parPage[7]} lignes`, `${vues.length} vues`);
await allerPage(5);
b.ok((await lignesVues()).length === 0 && /Aucune ligne sur la page 5/.test(await b.ev(`document.querySelector('.trx-vide')?.innerText||''`)), 'page 5 (rien dit) : « Aucune ligne sur la page 5 »');
await b.clic(await b.pos(`document.querySelector('.trx-cette-page')`, false), { att: 300 });
// badges des pages
await allerPage(7);
const badge = (n) => b.ev(`(()=>{const x=document.querySelector('.pdfr-page[data-cle="${n}"] .pdfr-trx-badge');return x?x.innerText.trim():null})()`);
b.ok((await badge(7)) === `${parPage[7]} lignes` || (await badge(7)) === `${parPage[7]} ligne`, `badge de la page 7 : « ${parPage[7]} lignes »`, String(await badge(7)));
b.ok((await badge(8)) === null && (await badge(6)) === null, 'pas de badge sur une page sans transcript');
const pg7 = await b.rect(`document.querySelector('.pdfr-page[data-cle="7"]')`);
await b.capture('trx-badge-page', { x: Math.round(pg7.x + pg7.w - 360), y: Math.round(pg7.y), width: 360, height: 120 });
await allerPage(1); await b.dormir(800);
await b.clic(await b.pos(`[...document.querySelectorAll('.pm-seg-btn')].find(x=>x.innerText.trim().startsWith('Exercices'))`, false), { att: 500 });
await allerPage(2); // le badge de la page 1 reste visible en haut, mais la page lue est la 2
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop-=200;1`); await b.dormir(500);
await b.clic(await b.pos(`document.querySelector('.pdfr-page[data-cle="1"] .pdfr-trx-badge')`, true), { att: 1000 });
vues = await lignesVues();
b.ok(await b.ev(`!!document.querySelector('.trx-cette-page.actif')`) && vues.length === parPage[1] && vues.every((l) => l.page === 'p. 1') && (await pageLue()) === 1,
  'clic sur le badge de la page 1 : Transcript ouvert, filtré sur la page 1, lecteur sur la page 1', `${vues.length} lignes, page ${await pageLue()}`);
// copie avec numéros de page
await b.ev(`window.__copie=null;navigator.clipboard.writeText=(t)=>{window.__copie=t;return Promise.resolve()};1`);
await b.clic(await b.pos(`document.querySelector('.trx-chevron')`, false), { att: 400 });
await b.clic(await b.pos(`[...document.querySelectorAll('.ctx-menu-item')].find(x=>x.innerText.includes('numéros de page'))`, false), { att: 500 });
const copie = await b.ev(`window.__copie||''`);
const lignesCopie = copie.split('\n').filter(Boolean);
b.ok(lignesCopie.length >= rec.segs.filter((s) => s.status === 'final').length && lignesCopie.filter((l) => /^\[\d\d:\d\d\] \[p\. \d+\] /.test(l)).length === rec.segs.filter((s) => s.status === 'final').length,
  'copie « avec numéros de page » : chaque ligne « [mm:ss] [p. N] … »', lignesCopie.slice(0, 2).join(' / '));
await b.clic(await b.pos(`document.querySelector('.trx-groupe .btn')`, false), { att: 500 });
b.ok(!/\[p\. \d+\]/.test(await b.ev(`window.__copie||''`)), '« Copier tout » simple : inchangé, sans numéros');
// ancienne session : intacte, sans numéros
await b.clic(await b.pos(`[...document.querySelectorAll('.trx-barre button')].find(x=>x.innerText.includes('Sessions'))`, false), { att: 600 });
await b.clic(await b.pos(`[...document.querySelectorAll('.trx-session')].pop()`, false), { att: 700 });
const anc = await b.ev(`({n:document.querySelectorAll('.trx-liste .trx-ligne').length,pages:document.querySelectorAll('.trx-liste .trx-page').length,filtre:!!document.querySelector('.trx-cette-page')})`);
b.ok(anc.n === 2 && anc.pages === 0 && !anc.filtre, 'ancienne session : ses 2 lignes, sans numéro de page ni filtre', JSON.stringify(anc));
b.ok(JSON.stringify(await b.S(`return (await S.getOne('transcript_session','ts-v3-ancienne')).segments`)) === JSON.stringify(ANCIENNE.segments), 'ancienne session jamais réécrite');
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' / '));
process.exit(0);
