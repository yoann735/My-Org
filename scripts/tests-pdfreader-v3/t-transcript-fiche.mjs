// (20/10) Transcript ↔ fiche jumelle : une ligne dite sur la FICHE (« fiche p. 4 ») ramène le lecteur sur la fiche,
// page 4 ; une ligne de l'original (« p. 6 ») le ramène sur l'original ; le filtre « Cette page » suit le document.
// Prérequis : cours « Physiologie rénale (jumelle) » avec sa fiche (tests-fiche-jumelle : seed.mjs + t-jumelle-import.mjs).
import { banc } from './commun.mjs';
const b = await banc(1440, 900);
const S0 = { id: 'ts-v3-fiche', kind: 'session', courseId: 'f-fj', startedAt: '2026-10-20T09:00:00.000Z', endedAt: '2026-10-20T09:02:00.000Z', source: 'micro', keyterms: [],
  segments: [
    { id: 'sg-f1', t0: 1, t1: 4, text: 'Ligne dite sur la page 6 de l’original.', status: 'final', page: 6, pageCle: 6, doc: 'original' },
    { id: 'sg-f2', t0: 5, t1: 9, text: 'Ligne dite sur la page 4 de la fiche.', status: 'final', page: 4, pageCle: 4, doc: 'fiche' },
    { id: 'sg-f3', t0: 10, t1: 14, text: 'Autre ligne de la fiche, page 4.', status: 'final', page: 4, pageCle: 4, doc: 'fiche' },
  ], notes: [], fontSize: 'm', durationS: 120, createdAt: '2026-10-20T09:00:00.000Z', updatedAt: '2026-10-20T09:02:00.000Z' };
await b.S(`for(const r of await S.getAll('transcript_session'))if(r.courseId==='f-fj')await S.remove('transcript_session',r.id);await S.put('transcript_session',${JSON.stringify(S0)});return 1`);
await b.biblio({ recharger: true });
await b.ouvrir('Physiologie rénale (jumelle)'); await b.dormir(1800);
const vue = () => b.ev(`(document.querySelector('.pdfr-jumelle-bascule .seg-btn.active')||{}).innerText`);
const pageLue = () => b.ev(`parseInt((document.querySelector('.ptb-pages .tnum')||{}).innerText)`);
if ((await vue()) !== 'Original') { await b.clic(await b.pos(`[...document.querySelectorAll('.pdfr-jumelle-bascule .seg-btn')].find(x=>x.innerText.trim()==='Original')`, false), { att: 1800 }); }
await b.clic(await b.pos(`[...document.querySelectorAll('.pm-seg-btn')].find(x=>x.innerText.trim().startsWith('Transcript'))`, false), { att: 700 });
await b.clic(await b.pos(`[...document.querySelectorAll('.trx-session')].pop()`, false), { att: 700 });
const chips = await b.ev(`[...document.querySelectorAll('.trx-liste .trx-page')].map(x=>x.textContent)`);
b.ok(JSON.stringify(chips) === JSON.stringify(['p. 6', 'fiche p. 4', 'fiche p. 4']), 'numéros : « p. 6 » (original), « fiche p. 4 » (fiche)', JSON.stringify(chips));
await b.clic(await b.pos(`[...document.querySelectorAll('.trx-liste .trx-page')].find(x=>x.textContent==='fiche p. 4')`, true), { att: 2500 });
b.ok((await vue()) === 'Fiche' && (await pageLue()) === 4, 'clic « fiche p. 4 » depuis l’original : bascule sur la fiche, page 4', `${await vue()} p. ${await pageLue()}`);
await b.clic(await b.pos(`document.querySelector('.trx-cette-page')`, false), { att: 400 });
let vues = await b.ev(`[...document.querySelectorAll('.trx-liste .trx-ligne')].length`);
b.ok(vues === 2, '« Cette page » sur la fiche p. 4 : ses 2 lignes', String(vues));
await b.clic(await b.pos(`document.querySelector('.trx-cette-page')`, false), { att: 300 });
await b.clic(await b.pos(`[...document.querySelectorAll('.trx-liste .trx-page')].find(x=>x.textContent==='p. 6')`, true), { att: 2500 });
b.ok((await vue()) === 'Original' && (await pageLue()) === 6, 'clic « p. 6 » depuis la fiche : retour sur l’original, page 6', `${await vue()} p. ${await pageLue()}`);
const badge = await b.ev(`(()=>{const x=document.querySelector('.pdfr-page[data-cle="6"] .pdfr-trx-badge');return x&&x.innerText.trim()})()`);
b.ok(badge === '1 ligne', 'badge de la page 6 de l’original : « 1 ligne » (les lignes de la fiche ne comptent pas ici)', String(badge));
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' / '));
process.exit(0);
