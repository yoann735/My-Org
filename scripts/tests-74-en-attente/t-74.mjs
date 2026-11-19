// Banc « 74 en attente » (19/11/2026, docs/compte-rendu-74-en-attente.md). DONNÉES DE TEST UNIQUEMENT, jamais le vrai cloud.
// Installation :
//   faux Supabase :54409 (config « fa-faux-supabase »), contrainte du vrai cloud ACTIVE : POST /__journal?actif=1&contrainteRating=1
//     (rating NOT NULL / 1..4, comme tant que supabase/migrations/20261024_review_log_evenements.sql n'est pas appliqué) ;
//   Vite :5311 = code d'APRÈS (config « fa-cloud ») ; Vite :5312 = code d'AVANT (git archive 5b0ead1, cacheDir séparé) ;
//   Chrome headless aux profils NEUFS : 9345 ordinateur 1440×900 (souris), 9346 téléphone 390×844 (tactile), 9347 tablette 820×1180 (tactile).
// Usage : node t-74.mjs avant|apres   (relancer le faux Supabase entre les deux : son état est en mémoire)
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { appareil, paquets, nouvelles, dormir } from '../tests-file-attente/commun.mjs';

const MODE = process.argv[2] || 'apres';
const BASE = MODE === 'avant' ? 'http://localhost:5312' : 'http://localhost:5311';
const FAUX = 'http://localhost:54409';
const IMG = fileURLToPath(new URL('../../docs/img/74-en-attente/', import.meta.url));
fs.mkdirSync(IMG, { recursive: true });
const faux = (q = '') => fetch(FAUX + '/__journal' + q, { method: 'POST' }).then((r) => r.json());
const etatFaux = () => fetch(FAUX + '/__etat').then((r) => r.json());
const poste = (c) => fetch(FAUX + c, { method: 'POST' }).then((r) => r.json());
let echecs = 0;
const ok = (c, m, d = '') => { console.log(`[${MODE}] ` + (c ? '✅ ' : '❌ ') + m + (d ? ' — ' + d : '')); if (!c) echecs++; return c; };

await faux('?actif=1&contrainteRating=1');
const T = await appareil('tel', BASE);
const O = await appareil('ordi', BASE);
const P = await appareil('tablette', BASE);
for (const b of [T, O, P]) b.capture = async (nom) => { const s = await b.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(IMG + nom + '.png', Buffer.from(s.result.data, 'base64')); };

const sonde = (b) => b.ev(`(async () => {
  const E = await __imp('/src/medrevise/lib/etatSynchro.js'); const St = await __imp('/src/medrevise/lib/syncStatus.js'); const J = await __imp('/src/medrevise/journal/journal.js');
  const V = await __imp('/src/medrevise/lib/vuesCartes.js');
  await E.collecterEnAttente();
  const l = E.enAttenteActuel(); const loc = await St.etatLocal(); const cl = await St.etatCloud();
  const tout = await J.toutLeJournal(); const vues = V.compterVues(tout); let totalVues = 0; vues.forEach((n) => { totalVues += n; });
  return { phase: document.documentElement.getAttribute('data-mr-synchro'), n: l ? l.elements.length : null,
    revisions: l ? l.elements.filter((e) => e.type === 'revision').length : null, exemple: l && l.elements[0] ? l.elements[0] : null,
    empreinteLocale: loc.hash, empreinteCloud: cl ? cl.hash : null, nRec: loc.n, journal: tout.length, fileJournal: (await J.idsEnAttente()).length, totalVues };
})()`);
const attendrePhase = (b, ms = 40000) => b.attendre(`['ajour','enattente','incomplet','echec'].includes(document.documentElement.getAttribute('data-mr-synchro'))`, ms, 200);
const synchroDeNouveau = async (b) => { await b.ev(`(window.dispatchEvent(new Event('online')), 1)`); await dormir(5000); await attendrePhase(b); await dormir(1500); };

// « Passer en révision » de `n` cartes Nouvelles, à l'écran (bloc Nouvelles)
async function passerNouvelles(b, n) {
  await b.aller('Réviser'); await b.attendre(`!!document.querySelector('[data-sfa="demarrer"]:not(:disabled)')`, 30000);
  await b.clic(`document.querySelector('[data-raccourci="blocNouvelles"]')`, 500);
  await b.clic(`document.querySelector('[data-sfa="demarrer"]')`, 1500);
  let k = 0;
  for (; k < n; k++) {
    if (!(await b.attendre(`!!document.querySelector('.sfc-carte')`, 8000))) break;
    await b.clic(`[...document.querySelectorAll('.sfc-bas .sfc-btn')].find((x) => /Voir la réponse/.test(x.innerText))`, 500);
    if (!(await b.attendre(`!!document.querySelector('[data-nouvelle="passer"]:not(:disabled)')`, 5000))) break;
    await b.clic(`document.querySelector('[data-nouvelle="passer"]')`, 700);
  }
  await b.ev(`(() => { const q = document.querySelector('.sfc-quitter'); q && q.click(); return 1; })()`); await dormir(800);
  return k;
}
// noter `n` cartes à l'écran (Révisions J), note « Correct »
async function noterEcran(b, n) {
  await b.aller('Réviser'); await b.attendre(`!!document.querySelector('[data-sfa="demarrer"]:not(:disabled)')`, 30000);
  await b.clic(`document.querySelector('[data-raccourci="revisionsJ"]')`, 500);
  await b.clic(`document.querySelector('[data-sfa="demarrer"]')`, 1500);
  let k = 0;
  for (; k < n; k++) {
    if (!(await b.attendre(`!!document.querySelector('.sfc-carte')`, 8000))) break;
    await b.clic(`[...document.querySelectorAll('.sfc-bas .sfc-btn')].find((x) => /Voir la réponse/.test(x.innerText))`, 500);
    if (!(await b.attendre(`!!document.querySelector('.sfc-bas [data-note="3"]:not(:disabled)')`, 5000))) break;
    await b.clic(`document.querySelector('.sfc-bas [data-note="3"]')`, 600);
  }
  await b.ev(`(() => { const q = document.querySelector('.sfc-quitter'); q && q.click(); return 1; })()`); await dormir(800);
  return k;
}
// liste dépliée « N en attente » (Réglages sur tablette/ordinateur ; section Synchronisation de l'accueil sur téléphone)
async function montrerListe(b, nom) {
  if (b.type === 'tel') { await b.aller('Accueil'); await dormir(800); await b.ev(`(() => { const s = [...document.querySelectorAll('.mrm-section-head')].find((x) => /Synchronisation/.test(x.innerText)); s && s.scrollIntoView({ block: 'start' }); return 1; })()`); }
  else { await b.aller('Réglages'); await b.attendre(`!!document.querySelector('[data-etat-synchro]')`, 15000); }
  await dormir(600);
  await b.clic(`document.querySelector('[data-etat-synchro] button')`, 600);
  await b.ev(`(() => { const r = document.querySelector('[data-etat-synchro]'); r && r.scrollIntoView({ block: 'start' }); return 1; })()`); await dormir(400);
  const texte = await b.ev(`(() => { const r = document.querySelector('[data-etat-synchro]'); return r ? r.innerText.replace(/\\s+/g, ' ').trim().slice(0, 400) : null; })()`);
  await b.capture(nom);
  return texte;
}

// ---- installation : profils vidés, jeu de test sur l'ordinateur, envoyé, reçu par le téléphone et la tablette ----
for (const b of [T, O, P]) await b.vider();
await O.ouvrir();
const today = await O.ev(`(async () => (await __imp('/src/medrevise/lib/sm2.js')).todayISO())()`);
await O.semer([...paquets(today, 1, 15, { prefixe: 'rev-' }), ...nouvelles(12)]);
await O.ouvrir(); await attendrePhase(O);
await T.ouvrir(); await attendrePhase(T);
await P.ouvrir(); await attendrePhase(P);
const s0 = await sonde(T);
ok(s0.n === 0 && s0.empreinteLocale === s0.empreinteCloud, 'départ : téléphone à jour, 0 en attente', JSON.stringify({ n: s0.n, phase: s0.phase }));

// ---- 1. le constat : « Passer en révision » sur le téléphone (7 cartes), puis une à une ----
const nPasses = await passerNouvelles(T, 7);
await dormir(4500); await synchroDeNouveau(T);
const s1 = await sonde(T);
const cloud1 = await etatFaux();
console.log(`[${MODE}] après ${nPasses} « Passer en révision » :`, JSON.stringify({ phase: s1.phase, n: s1.n, empreinteLocale: s1.empreinteLocale, empreinteCloud: s1.empreinteCloud, fileJournal: s1.fileJournal, evenementsAuCloud: cloud1.rows.filter((r) => r.store === 'review_log_evenement').length }));
const liste1 = await montrerListe(T, MODE + '-tel-apres-7-passages');
console.log(`[${MODE}] liste :`, liste1);
// « Revérifier » (nouvelle passe complète) + une notation de plus : le compteur ne baisse pas (avant) / reste à 0 (après)
await synchroDeNouveau(T);
const s1b = await sonde(T);
const nPasses2 = await passerNouvelles(T, 1);
await dormir(4500); await synchroDeNouveau(T);
const s1c = await sonde(T);
if (MODE === 'avant') {
  ok(s1.n === 7 && s1.fileJournal === 7, 'AVANT — reproduit : 7 éléments en attente après 7 « Passer en révision »', String(s1.n));
  ok(s1.empreinteLocale === s1.empreinteCloud, 'AVANT — reproduit : empreinte locale = empreinte cloud malgré les 7 en attente', `${s1.empreinteLocale} / ${s1.empreinteCloud}`);
  ok(s1b.n === 7, 'AVANT — reproduit : « Revérifier » ne fait pas baisser le compteur', String(s1b.n));
  ok(nPasses2 === 1 && s1c.n === 8, 'AVANT — reproduit : +1 à chaque nouvelle carte passée (7 → 8)', String(s1c.n));
  ok(cloud1.rows.filter((r) => r.store === 'review_log_evenement').length === 0 && (await faux()).lignes.filter((l) => l.rating == null).length === 0, 'AVANT — aucun de ces événements n’est au serveur');
} else {
  ok(nPasses === 7 && s1.n === 0 && s1.fileJournal === 0, 'APRÈS : 7 « Passer en révision » → 0 en attente après la synchro', String(s1.n));
  ok(s1.empreinteLocale === s1.empreinteCloud, 'APRÈS : même empreinte locale / cloud (journal compris)', s1.empreinteLocale);
  const evLocaux = await T.ev(`(async () => (await (await __imp('/src/medrevise/journal/journal.js')).toutLeJournal()).filter((e) => e.rating == null).map((e) => e.id))()`);
  const auServeur = new Set((await etatFaux()).rows.filter((r) => r.store === 'review_log_evenement').map((r) => r.record_id));
  ok(evLocaux.length >= 7 && evLocaux.every((id) => auServeur.has(id)), 'APRÈS : chaque événement « Passer en révision » du téléphone est au serveur (canal de repli, aucune migration)', `${evLocaux.length} événements locaux, tous présents`);
  ok(s1c.n === 0 && nPasses2 === 1, 'APRÈS : une carte de plus passée → toujours 0 après la synchro', String(s1c.n));
}

if (MODE === 'apres') {
  // ---- 2. noter 10 cartes hors ligne → 10 en attente → retour en ligne → 0, sur les deux appareils ----
  await T.ouvrir(); await attendrePhase(T);
  await T.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await T.ev(`(window.dispatchEvent(new Event('offline')), 1)`);
  const n10 = await noterEcran(T, 10);
  await dormir(4000);
  const s2 = await sonde(T);
  ok(n10 === 10 && s2.revisions === 10, 'hors ligne : 10 cartes notées → 10 en attente', `${n10} notées, ${s2.revisions} en attente`);
  await montrerListe(T, 'apres-tel-hors-ligne-10-en-attente');
  await T.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await synchroDeNouveau(T);
  const s3 = await sonde(T);
  ok(s3.n === 0 && s3.empreinteLocale === s3.empreinteCloud, 'retour en ligne : 0 en attente, empreinte = cloud', `${s3.n} · ${s3.empreinteLocale}`);
  await O.ouvrir(); await attendrePhase(O); await dormir(1500);
  // l'ouverture de l'ordinateur peut écrire (plan du jour, statistiques) : le téléphone se resynchronise, puis on compare
  await synchroDeNouveau(T); await synchroDeNouveau(O);
  const o3 = await sonde(O); const t3 = await sonde(T);
  ok(o3.n === 0 && t3.n === 0 && o3.empreinteLocale === t3.empreinteLocale && o3.empreinteCloud === t3.empreinteLocale, 'ordinateur et téléphone : 0 en attente, MÊME empreinte (= cloud)', `${o3.empreinteLocale} = ${t3.empreinteLocale} = ${o3.empreinteCloud}`);
  ok(o3.journal === s3.journal && o3.totalVues === s3.totalVues && o3.totalVues >= 10, 'compteur de vues de l’ordinateur = celui du téléphone (révisions du téléphone incluses)', `${o3.totalVues} = ${s3.totalVues}`);
  await montrerListe(O, 'apres-ordi-ajour');

  // ---- 3. app tuée en plein envoi → rouvrir : aucun doublon, aucune perte, 0 en attente ----
  await poste('/__lent?ms=6000');
  const avantKill = (await faux()).lignes.length;
  await T.noter(['rev-' + today + '-10', 'rev-' + today + '-11'], 4);
  await dormir(3800); // l'envoi automatique (3 s après la réponse) est en vol, le serveur répond dans 6 s
  await T.send('Page.navigate', { url: 'about:blank' }); // l'app est tuée
  await dormir(7000);
  await poste('/__lent?ms=0');
  await T.ouvrir(); await attendrePhase(T); await dormir(2000); await synchroDeNouveau(T);
  const s4 = await sonde(T);
  const lignes = (await faux()).lignes;
  const ids = lignes.map((l) => l.id);
  ok(s4.n === 0, 'app tuée en plein envoi puis rouverte : 0 en attente', String(s4.n));
  ok(new Set(ids).size === ids.length && lignes.length === avantKill + 2, 'aucun doublon, aucune perte au serveur', `${avantKill} → ${lignes.length}`);
  ok(s4.empreinteLocale === s4.empreinteCloud, 'empreinte = cloud après la réouverture');

  // ---- 4. tablette : même empreinte, même compteur de vues ----
  await P.ouvrir(); await attendrePhase(P); await dormir(1500);
  await synchroDeNouveau(T); await synchroDeNouveau(O); await synchroDeNouveau(P);
  const p4 = await sonde(P); const t4 = await sonde(T); const o4 = await sonde(O);
  ok([p4, t4, o4].every((x) => x.n === 0 && x.empreinteLocale === p4.empreinteCloud), 'trois appareils : 0 en attente, même empreinte partout (= cloud)', [p4, t4, o4].map((x) => x.empreinteLocale).join(' = '));
  ok(p4.totalVues === t4.totalVues && o4.totalVues === t4.totalVues, 'compteur de vues identique sur les trois appareils', `${p4.totalVues} · ${t4.totalVues} · ${o4.totalVues}`);
  await montrerListe(P, 'apres-tablette-ajour');
  await montrerListe(T, 'apres-tel-ajour');
}

// « about:blank » (app tuée) : l'horloge simulée du banc y lit localStorage — artefact du banc, pas de l'app
const errs = [...T.erreurs, ...O.erreurs, ...P.erreurs].filter((e) => !/Failed to read the 'localStorage'|validateDOMNesting|Failed to load resource|ERR_|Failed to fetch|NetworkError|timetable|emploi|backup|api\//i.test(e || ''));
ok(errs.length === 0, 'aucune erreur console', errs.join(' | ').slice(0, 500));
console.log(echecs ? `[${MODE}] ❌ ${echecs} échec(s)` : `[${MODE}] ✅ tout est vert`);
process.exit(echecs ? 1 : 0);
