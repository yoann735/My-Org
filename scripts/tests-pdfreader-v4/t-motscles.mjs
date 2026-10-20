// (20/10 soir) Mots-clés proposés dans la feuille « Transcrire le cours » — sur de VRAIS cours semés dans la base
// LOCALE (semer-vrais.mjs) : au plus 50, tous cochés, « Pourquoi ? » au survol, décochés mémorisés par cours,
// « Reprendre les mots-clés de la dernière session », aucun nom de l'école. node t-motscles.mjs
import { banc } from './commun.mjs';
const b = await banc(1440, 900);
const SESSION = { id: 'ts-v4-bio', kind: 'session', courseId: 'f-v4-bio', startedAt: '2026-10-19T08:00:00.000Z', endedAt: '2026-10-19T09:00:00.000Z', source: 'micro', keyterms: ['ADN', 'ARN', 'lipide'], segments: [], notes: [], fontSize: 'm', durationS: 3600, createdAt: '2026-10-19T08:00:00.000Z', updatedAt: '2026-10-19T09:00:00.000Z' };
await b.S(`for(const r of await S.getAll('transcript_session'))if(r.courseId==='f-v4-bio'||r.courseId==='f-v4-genou')await S.remove('transcript_session',r.id);await S.put('transcript_session',${JSON.stringify(SESSION)});return 1`);
const feuille = async (titre) => {
  await b.biblio({ recharger: true });
  await b.ouvrir(titre); await b.dormir(1500);
  await b.clic(await b.pos(`[...document.querySelectorAll('.pm-seg-btn')].find(x=>x.innerText.trim().startsWith('Transcript'))`, false), { att: 700 });
  await b.clic(await b.pos(`[...document.querySelectorAll('.trx-accueil button')].find(x=>/Transcrire le cours/.test(x.innerText))`, false), { att: 1000 });
  for (let i = 0; i < 60 && !(await b.ev(`document.querySelectorAll('.trx-feuille .trx-puce').length>5`)); i++) await b.dormir(500);
};
const puces = () => b.ev(`[...document.querySelectorAll('.trx-feuille .trx-puce')].map(p=>({t:p.innerText.trim(),on:p.classList.contains('on'),manuel:!p.hasAttribute('aria-pressed'),titre:p.title}))`);
const fermer = async () => { await b.clic(await b.pos(`[...document.querySelectorAll('.trx-feuille button')].find(x=>x.innerText.trim()==='Annuler')`, true), { att: 600 }); };
// --- biologie
await feuille('Macromolécules (vrai cours)');
let p = (await puces()).filter((x) => !x.manuel);
b.ok(p.length > 20 && p.length <= 50, `biologie : ${p.length} termes proposés (au plus 50)`);
b.ok(p.every((x) => x.on), 'tous cochés');
b.ok(['acides aminés', 'ADN', 'ARN', 'nucléotide', 'lipide'].every((t) => p.some((x) => x.t === t)), 'termes attendus présents (acides aminés, ADN, ARN, nucléotide, lipide)', p.slice(0, 12).map((x) => x.t).join(' | '));
b.ok(/^Pourquoi \? score [\d,]+ = rareté/.test(p[0].titre), '« Pourquoi ? » au survol : le calcul du score', p[0].titre.split('\n')[0]);
await b.capture('motscles-bio', await b.ev(`(()=>{const r=document.querySelector('.trx-feuille').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.min(860,Math.round(r.height))}})()`));
// décocher « glucose » → mémorisé pour ce cours
await b.clic(await b.pos(`[...document.querySelectorAll('.trx-feuille .trx-puce')].find(x=>x.innerText.trim()==='glucose')`, true), { att: 600 });
await fermer();
await feuille('Macromolécules (vrai cours)');
p = await puces();
b.ok(p.find((x) => x.t === 'glucose' && !x.on), '« glucose » décoché : retrouvé décoché à la réouverture (mémorisé par cours)');
// reprendre la dernière session
const btn = await b.pos(`[...document.querySelectorAll('.trx-feuille .trx-lien')].find(x=>/dernière session/.test(x.innerText))`, true);
b.ok(!!btn, 'bouton « Reprendre les mots-clés de la dernière session »');
if (btn) { await b.clic(btn, { att: 600 }); p = await puces(); }
const coches = p.filter((x) => x.on).map((x) => x.t);
b.ok(coches.length === 3 && ['ADN', 'ARN', 'lipide'].every((t) => coches.includes(t)), 'reprise : exactement les 3 mots-clés de la dernière session cochés', coches.join(' | '));
await fermer();
// --- anatomie (OCR)
await feuille('Genou (vrai cours)');
p = (await puces()).filter((x) => !x.manuel);
const ecole = p.filter((x) => /helh|montignies|louvain|hainaut|^[ée]cole$|technologies|médicales/i.test(x.t)).map((x) => x.t);
b.ok(p.length > 20 && p.length <= 50 && !ecole.length, `anatomie : ${p.length} termes, aucun nom de l'école (logo, pied de page)`, ecole.join(' | ') || p.slice(0, 10).map((x) => x.t).join(' | '));
await b.capture('motscles-genou', await b.ev(`(()=>{const r=document.querySelector('.trx-feuille').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.min(860,Math.round(r.height))}})()`));
await fermer();
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' / '));
process.exit(0);
