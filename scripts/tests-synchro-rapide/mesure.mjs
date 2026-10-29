// Banc « synchro rapide » (29/10, docs/compte-rendu-synchro-rapide-surlignage-listes.md) — MESURES.
// Même installation que ../tests-synchro-affichage (faux Supabase :54399 JOURNAL=1 CONTRAINTE_RATING=0, Vite :5300,
// Chrome headless A 9335 ordinateur / B 9336 téléphone, profils NEUFS — jamais le vrai cloud).
// Volume : le jeu ../tests-selection-passages/seed.mjs + VOLUME enregistrements d'environ 1,5 Ko (ordre de grandeur du
// vrai compte : ~4500 enregistrements). Réseau de B bridé comme une 4G moyenne (RESEAU ci-dessous).
// Mesure, sur B :
//   1. retour sur l'app (visibilitychange) SANS changement ailleurs → temps jusqu'à « À jour » ;
//   2. retour après 10 réponses données sur A → temps jusqu'à « À jour » ;
//   3. détail par étape (appel direct des fonctions, mêmes conditions réseau) : envoi, récupération, application,
//      journal, empreinte locale, empreinte cloud ; + la trace de la passe si l'app l'expose (window.__mrMesuresSynchro).
//   node mesure.mjs [etiquette]   → écrit mesures-<etiquette>.json à côté
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { appareil, faux } from '../tests-synchro-affichage/commun.mjs';
const ETIQ = process.argv[2] || 'avant';
const VOLUME = 4428;
const RESEAU = { offline: false, latency: 120, downloadThroughput: 1.5e6, uploadThroughput: 0.6e6 }; // octets/s
const A = await appareil(false); const B = await appareil(true);
for (const x of [A, B]) { await x.send('Network.enable'); await x.send('Page.enable'); }
await A.send('Page.navigate', { url: 'http://localhost:5300/' }); await B.send('Page.navigate', { url: 'http://localhost:5300/' }); await A.dormir(3000);
await A.ouvrirApp({ recharger: false }); await B.ouvrirApp({ recharger: false });
await A.attendrePhase(['ajour'], 60000); await B.attendrePhase(['ajour'], 60000);
// volume réaliste (~1,5 Ko par enregistrement)
await A.S(`const n = (await S.getAll('highlights')).filter((h) => h.id.startsWith('vol-')).length; if (n < ${VOLUME}) {
  const l = []; const pad = 'x'.repeat(1200); for (let i = 0; i < ${VOLUME}; i++) l.push({ id: 'vol-' + String(i).padStart(4, '0'), ficheId: 'f-volume', page: 1 + (i % 40), texte: 'surlignage ' + i + ' ' + pad, couleur: 'jaune',
    rects: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.02 }, { x: 0.1, y: 0.23, w: 0.25, h: 0.02 }] });
  await S.putMany('highlights', l); } return 1;`);
await A.dormir(1500); await A.ev(`window.dispatchEvent(new Event('online')); 1`); await A.attendrePhase(['ajour'], 180000);
await B.ev(`window.dispatchEvent(new Event('online')); 1`); await B.dormir(300); await B.attendrePhase(['ajour'], 180000);
const cloudN = (await faux()).rows.length;
console.log(`(info) cloud : ${cloudN} enregistrements`);

await B.send('Network.emulateNetworkConditions', RESEAU);
const retour = (b) => b.ev(`window.__mrMesuresSynchro = []; document.dispatchEvent(new Event('visibilitychange')); 1`);
// temps jusqu'à « À jour » après un retour (la phase passe par « attente » puis « ajour »)
async function chrono(b) {
  const t0 = Date.now(); await retour(b); let vuAttente = false; const vu = [];
  while (Date.now() - t0 < 180000) {
    const p = await b.phase(); if (vu.at(-1) !== p) vu.push(p);
    if (p !== 'ajour') vuAttente = true;
    if (p === 'ajour' && (vuAttente || Date.now() - t0 > 1500)) break;
    if (['horsligne', 'echec', 'incomplet'].includes(p)) break;
    await b.dormir(25);
  }
  return { ms: Date.now() - t0, phases: vu.join(' → '), trace: await b.ev(`JSON.stringify(window.__mrMesuresSynchro || [])`).then(JSON.parse) };
}
const res = { etiquette: ETIQ, volume: cloudN, reseau: RESEAU };
await B.dormir(1000);
res.sansChangement = [];
for (let i = 0; i < 3; i++) { res.sansChangement.push(await chrono(B)); await B.dormir(1500); }
console.log('1. retour sans changement :', res.sansChangement.map((r) => r.ms + ' ms').join(', '), '—', res.sansChangement[0].phases);

// 10 réponses sur A
await A.reviser(); const k = await A.repondre(10);
await A.dormir(4500); await A.ev(`window.dispatchEvent(new Event('online')); 1`); await A.attendrePhase(['ajour'], 60000);
await B.dormir(500);
res.dixReponses = await chrono(B);
console.log(`2. retour après ${k} réponses sur A :`, res.dixReponses.ms, 'ms —', res.dixReponses.phases);

// 3. détail par étape (appel direct, même réseau bridé)
res.etapes = await B.ev(`(async () => {
  const mod = (n) => import(performance.getEntriesByType('resource').map((r) => r.name).find((x) => x.includes(n)) || '/src/medrevise/' + n);
  const S = await mod('lib/storage.js'); const Y = await mod('data/sync.js'); const T = await mod('lib/syncStatus.js'); const J = await mod('journal/synchro.js');
  const t = {}; const m = async (k, f) => { const d = performance.now(); const r = await f(); t[k] = Math.round(performance.now() - d); return r; };
  await m('envoi_purge', () => S.purgerOutboxAligne());
  await m('envoi_file', () => Y.flushOutbox());
  const rows = await m('recuperation_tout', () => Y.pullAllRecords());
  t.octets_recus = JSON.stringify(rows || []).length;
  await m('recuperation_et_application', () => S.reconcileAll());
  t.application = t.recuperation_et_application - t.recuperation_tout;
  await m('journal', () => J.synchroniserJournal());
  await m('empreinte_locale', () => T.etatLocal());
  await m('empreinte_cloud', () => T.etatCloud());
  return t; })()`);
console.log('3. étapes (ms) :', JSON.stringify(res.etapes));
await B.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
fs.writeFileSync(fileURLToPath(new URL(`./mesures-${ETIQ}.json`, import.meta.url)), JSON.stringify(res, null, 2));
process.exit(0);
