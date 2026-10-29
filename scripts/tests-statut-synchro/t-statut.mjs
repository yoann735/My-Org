// Banc « statut de synchro juste » (29/10, docs/compte-rendu-statut-synchro.md). Deux appareils : A (9335, ordinateur)
// et B (9336, téléphone tactile), profils NEUFS, faux Supabase local (:54399, avec /__lent et /__panne) — jamais le vrai cloud.
// Jeu : ../tests-selection-passages/seed.mjs, puis 4428 enregistrements « volume » pour retrouver l'ordre de grandeur réel.
//  1. Reproduction de l'état du téléphone : file d'envoi = TOUS les enregistrements, empreinte locale = cloud → après
//     correction : file vidée (sauvegarde avant), « À jour », jamais « Hors ligne », aucune donnée perdue.
//  2. Gros envoi : « Synchronisation… n / total », puis « À jour ».
//  3. Réponses sur A, ouverture de B : « Synchronisation… » puis « À jour », empreintes égales sur A, B et le cloud.
//  4. Réseau lent : indicateur sans faux hors-ligne, même après 30 s, puis « À jour ».
//  5. Mode avion : vrai « Hors ligne » avec l'heure de la DERNIÈRE SYNCHRO RÉUSSIE.
//  6. Erreur serveur : « Synchro en échec » + Réessayer (pas « Hors ligne ») ; Réessayer une fois réparé → « À jour ».
//  7. Comptes avant / après (local A, local B, cloud) : rien de perdu.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { appareil, ENREGISTREUR, faux } from '../tests-synchro-affichage/commun.mjs';
const DOSSIER = fileURLToPath(new URL('../../docs/img/statut-synchro/', import.meta.url));
fs.mkdirSync(DOSSIER, { recursive: true });
const FAUX = 'http://localhost:54399';
const poste = (chemin) => fetch(FAUX + chemin, { method: 'POST' }).then((r) => r.json());
const A = await appareil(false); const B = await appareil(true); const v = A.v;
for (const x of [A, B]) { await x.send('Network.enable'); await x.send('Page.enable'); await x.send('Page.addScriptToEvaluateOnNewDocument', { source: ENREGISTREUR }); }
const capture = async (b, nom) => { const s = await b.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(DOSSIER + nom + '.png', Buffer.from(s.data, 'base64')); };
const SY = `(await import(performance.getEntriesByType('resource').map((r) => r.name).find((n) => n.includes('/data/sync.js')) || '/src/medrevise/data/sync.js'))`;
const ST = `(await import(performance.getEntriesByType('resource').map((r) => r.name).find((n) => n.includes('/lib/syncStatus.js')) || '/src/medrevise/lib/syncStatus.js'))`;
const enFile = (b) => b.ev(`(async () => ${SY}.outboxCount())()`);
const empreintes = (b) => b.ev(`(async () => { const s = ${ST}; const l = await s.etatLocal(); const c = await s.etatCloud(); return { local: l.hash, n: l.n, cloud: c && c.hash, nCloud: c && c.n }; })()`);
const comptes = (b) => b.S(`const r = {}; for (const n of ['sources','matieres','fiches','questions','highlights','learning_set']) r[n] = (await S.getAll(n)).length; return r;`);
const cloudVivants = async () => (await faux()).rows.filter((r) => !r.deleted).length;
const phasesVues = async (b) => [...new Set((await b.vus()).map(([, x]) => x.bandeau).filter(Boolean))];
const retour = (b) => b.ev(`document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); 1`);
const reseau = (b, o) => b.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, ...o });
// suit la phase jusqu'à l'une des phases attendues ; rend la chronologie « phase@ms »
const suivre = async (b, fin, ms = 120000) => { const t0 = Date.now(); const vu = []; let der = null;
  while (Date.now() - t0 < ms) { const p = await b.phase(); if (p !== der) { der = p; vu.push(p + '@' + (Date.now() - t0)); } if (fin.includes(p)) break; await b.dormir(100); }
  return vu; };

await poste('/__lent?ms=0'); await poste('/__panne?code=');
await A.send('Page.navigate', { url: 'http://localhost:5300/' }); await B.send('Page.navigate', { url: 'http://localhost:5300/' }); await A.dormir(3000);
await A.ouvrirApp({ recharger: false }); await B.ouvrirApp({ recharger: false });
await A.attendrePhase(['ajour'], 60000); await B.attendrePhase(['ajour'], 60000);

// ---------- volume : 4428 enregistrements créés sur A, envoyés, reçus par B (ordre de grandeur du vrai compte)
await A.S(`const ex = await S.getAll('highlights'); if (ex.filter((h) => h.id.startsWith('vol-')).length < 4428) {
  const t = new Date().toISOString(); const l = []; for (let i = 0; i < 4428; i++) l.push({ id: 'vol-' + String(i).padStart(4, '0'), ficheId: 'f-volume', page: 1, texte: 'surlignage ' + i, couleur: 'jaune', rects: [] });
  await S.putMany('highlights', l); } return 1;`);
await A.dormir(1500); await A.ev(`window.dispatchEvent(new Event('online')); 1`); await A.attendrePhase(['ajour'], 120000);
await B.ev(`window.dispatchEvent(new Event('online')); 1`); await B.attendrePhase(['ajour'], 120000);
const comptesAvant = { A: await comptes(A), B: await comptes(B), cloud: await cloudVivants() };
console.log('   (info) comptes avant :', JSON.stringify(comptesAvant));

// ---------- 1. reproduction de l'état du téléphone
const nB = await B.S(`const { set, createStore } = await import('/node_modules/.vite/deps/idb-keyval.js');
  const ob = createStore('medrevise-outbox', 'v1'); let n = 0;
  for (const nom of S.SYNCABLE_STORES) for (const r of (await S.getAll(nom))) { if (!r || !r.id) continue; await set(nom + ':' + r.id, { store: nom, record_id: r.id, data: r, updated_at: r.updatedAt, deleted: false }, ob); n++; }
  return n;`);
const avant = { file: await enFile(B), ...(await empreintes(B)) };
v(avant.file === nB && avant.local === avant.cloud && avant.n === avant.nCloud, `état reproduit sur B : empreinte locale = cloud (${avant.local}), ${avant.n} enregistrements des deux côtés, « en attente d'envoi : ${avant.file} »`);
const appelsAvant = (await faux()).journal.length;
await B.send('Page.reload', { ignoreCache: true });
const vu1 = await suivre(B, ['ajour', 'horsligne', 'echec', 'incomplet']);
await B.ouvrirApp({ recharger: false });
const apres1 = { file: await enFile(B), ...(await empreintes(B)) };
const svg = await B.S(`const { keys, createStore } = await import('/node_modules/.vite/deps/idb-keyval.js'); return (await keys(createStore('medrevise-backups', 'v1'))).filter((k) => String(k).startsWith('pre-purge-outbox-')).length;`);
const pushes = (await faux()).journal.slice(appelsAvant - (await faux()).journal.length).filter((j) => j.p.endsWith('/rpc/medrevise_push')).length;
v(apres1.file === 0, `après correction : file d'envoi vide (${apres1.file})`);
v(vu1.at(-1).startsWith('ajour') && !(await phasesVues(B)).includes('horsligne'), `statut : ${vu1.join(' → ')} ; jamais « Hors ligne »`);
v(apres1.local === apres1.cloud, `empreintes égales après correction (${apres1.local})`);
v(svg >= 1, `copie de la file faite AVANT la purge (putBackup « pre-purge-outbox-… » : ${svg})`);
console.log('   (info) appels d’envoi pendant la passe :', pushes, '(0 attendu : tout était déjà au cloud)');
await B.dormir(400); await capture(B, 'statut-tel-reproduction-ajour');

// ---------- 2. gros envoi avec progression (A : 1500 enregistrements jamais envoyés, serveur ralenti)
const lotsAvant = await A.S(`return (await S.getAll('highlights')).filter((h) => h.id.startsWith('lot-')).length;`);
await A.S(`const { set, createStore } = await import('/node_modules/.vite/deps/idb-keyval.js'); const hs = createStore('medrevise-highlights', 'v1'); const ob = createStore('medrevise-outbox', 'v1');
  const t = new Date().toISOString(); for (let i = 0; i < 1500; i++) { const r = { id: 'lot-' + String(i).padStart(4, '0'), ficheId: 'f-volume', page: 2, texte: 'lot ' + i, couleur: 'vert', rects: [], updatedAt: t };
  await set(r.id, r, hs); await set('highlights:' + r.id, { store: 'highlights', record_id: r.id, data: r, updated_at: t, deleted: false }, ob); } return 1;`);
await poste('/__lent?ms=250');
await A.send('Page.reload', { ignoreCache: true });
let progression = null;
for (let i = 0; i < 300 && !progression; i++) { const bd = await A.bandeau(); const m = bd && /(\d+) \/ (\d+)/.exec(bd.texte); if (m && +m[1] >= 400 && +m[1] < +m[2]) progression = bd.texte; else await A.dormir(100); }
if (progression) await capture(A, 'statut-ordi-envoi-progression');
await A.attendrePhase(['ajour', 'echec', 'horsligne', 'incomplet'], 180000);
await poste('/__lent?ms=0');
v(!!progression && /Synchronisation… \d+ \/ 1\d{3}/.test(progression), `gros envoi : progression affichée « ${progression} »`);
v((await A.phase()) === 'ajour' && (await enFile(A)) === 0, `gros envoi terminé : « ${(await A.bandeau() || {}).texte} », file vide`);
await A.ouvrirApp({ recharger: false });

// ---------- 3. réponses sur A, ouverture de B
await A.reviser();
const n3 = await A.repondre(3);
await A.dormir(1500); await A.ev(`window.dispatchEvent(new Event('online')); 1`); await A.attendrePhase(['ajour'], 60000);
await B.ev(`window.__vus = []; 1`);
await B.send('Page.reload', { ignoreCache: true });
const vu3 = await suivre(B, ['ajour', 'horsligne', 'echec', 'incomplet']);
await B.ouvrirApp({ recharger: false });
const eA = await empreintes(A), eB = await empreintes(B);
v(n3 === 3 && vu3[0].startsWith('attente') && vu3.at(-1).startsWith('ajour'), `3 réponses sur A, ouverture de B : ${vu3.join(' → ')}`);
v(eA.local === eB.local && eB.local === eB.cloud && (await enFile(B)) === 0, `empreintes égales : A ${eA.local} · B ${eB.local} · cloud ${eB.cloud}`);
await capture(B, 'statut-tel-ouverture-ajour');

// ---------- 4. réseau lent (serveur à 4 s par requête) : indicateur, jamais « Hors ligne », même après 30 s
await B.ev(`window.__vus = []; 1`);
await poste('/__lent?ms=4000');
await retour(B);
const t4 = Date.now(); let a30 = null, cap30 = false;
const vu4 = [];
for (let der = null; Date.now() - t4 < 180000;) {
  const p = await B.phase(); if (p !== der) { der = p; vu4.push(p + '@' + (Date.now() - t4)); }
  if (!cap30 && Date.now() - t4 > 31000) { a30 = p; cap30 = true; await capture(B, 'statut-tel-lent-30s'); }
  if (p !== 'attente' && Date.now() - t4 > 1000) break; await B.dormir(200);
}
await poste('/__lent?ms=0');
v(a30 === 'attente', `réseau lent : à 31 s, toujours « ${(a30 === 'attente') ? 'Synchronisation…' : a30} » (chiffres en chargement)`);
v(vu4.at(-1).startsWith('ajour') && !(await phasesVues(B)).includes('horsligne'), `réseau lent : ${vu4.join(' → ')}, jamais « Hors ligne »`);

// ---------- 5. mode avion : vrai « Hors ligne » avec l'heure de la dernière synchro réussie
const derniere = await B.ev(`localStorage.getItem('medrevise.derniereSyncOk')`);
await B.dormir(61000); // une minute plus tard : l'heure affichée ne doit PAS être l'heure actuelle
await reseau(B, { offline: true }); await B.ev(`window.dispatchEvent(new Event('offline')); 1`);
await retour(B);
const ph5 = await B.attendrePhase(['horsligne'], 20000);
const bd5 = await B.bandeau();
const attendu5 = await B.ev(`(async () => (await import('/src/medrevise/lib/synchroAffichage.js')).libelleBandeau({ phase: 'horsligne', depuis: ${JSON.stringify(derniere)} }))()`);
const maintenant = await B.ev(`(async () => (await import('/src/medrevise/lib/synchroAffichage.js')).libelleBandeau({ phase: 'horsligne', depuis: new Date().toISOString() }))()`);
v(ph5 === 'horsligne' && bd5 && bd5.texte === attendu5 && bd5.texte !== maintenant, `mode avion : « ${bd5 && bd5.texte} » (dernière synchro réussie ${derniere}, pas l'heure actuelle)`);
await capture(B, 'statut-tel-horsligne');
await reseau(B, {}); await B.ev(`window.dispatchEvent(new Event('online')); 1`);
v((await B.attendrePhase(['ajour'], 60000)) === 'ajour', 'retour du réseau : « À jour »');

// ---------- 6. erreur serveur : « Synchro en échec » + Réessayer, pas « Hors ligne »
await B.ev(`window.__vus = []; 1`);
await poste('/__panne?code=500');
await retour(B);
const ph6 = await B.attendrePhase(['echec', 'horsligne', 'incomplet'], 60000);
const bd6 = await B.bandeau();
const bouton = await B.ev(`!!document.querySelector('[data-act="reessayer-synchro"]')`);
v(ph6 === 'echec' && /Synchro en échec/.test(bd6.texte) && bouton && !(await phasesVues(B)).includes('horsligne'), `erreur serveur : « ${bd6.texte} » + Réessayer, jamais « Hors ligne »`);
await capture(B, 'statut-tel-echec');
await A.ev(`window.__vus = []; 1`); await retour(A);
const ph6a = await A.attendrePhase(['echec', 'horsligne', 'incomplet'], 60000);
await A.dormir(300); await capture(A, 'statut-ordi-echec');
v(ph6a === 'echec', `erreur serveur sur l'ordinateur aussi : « ${(await A.bandeau() || {}).texte} »`);
await poste('/__panne?code=');
await B.toucher(`document.querySelector('[data-act="reessayer-synchro"]')`, 300);
v((await B.attendrePhase(['ajour'], 60000)) === 'ajour', 'serveur réparé, « Réessayer » : « À jour »');
await A.ev(`window.dispatchEvent(new Event('online')); 1`); await A.attendrePhase(['ajour'], 60000);
await A.dormir(300); await capture(A, 'statut-ordi-ajour');

// ---------- 7. aucune donnée perdue
const comptesApres = { A: await comptes(A), B: await comptes(B), cloud: await cloudVivants() };
console.log('   (info) comptes après :', JSON.stringify(comptesApres));
const ok7 = ['sources', 'matieres', 'fiches', 'questions', 'learning_set'].every((k) => comptesApres.A[k] === comptesAvant.A[k] && comptesApres.B[k] === comptesAvant.B[k])
  && comptesApres.A.highlights === comptesAvant.A.highlights + 1500 - lotsAvant && comptesApres.B.highlights === comptesAvant.B.highlights + 1500 - lotsAvant
  && comptesApres.cloud === comptesAvant.cloud + 1500 - lotsAvant;
v(ok7, `comptes : rien de perdu (seuls les ${1500 - lotsAvant} enregistrements ajoutés au §2 en plus, partout)`);
const fin = { A: await empreintes(A), B: await empreintes(B) };
v(fin.A.local === fin.B.local && fin.B.local === fin.B.cloud, `fin : empreintes A ${fin.A.local} · B ${fin.B.local} · cloud ${fin.B.cloud}`);
B.erreurs.push(...A.erreurs);
B.echecs += A.echecs;
B.fin();
