// Banc « synchro rapide » (29/10, docs/compte-rendu-synchro-rapide-surlignage-listes.md) — SCÉNARIOS.
// Installation : voir mesure.mjs (faux Supabase :54399, Vite :5300, Chrome A 9335 ordinateur / B 9336 téléphone, profils
// neufs — jamais le vrai cloud). À lancer après mesure.mjs (même jeu, ~4480 enregistrements). Réseau de B : 4G simulée.
//   node t-synchro.mjs [--sans-attente]   (--sans-attente : saute l'attente réelle de 5 min)
//  1. retour sans changement : « À jour » < 1 s, AUCUNE lecture complète de la table ;
//  2. retour après 5 min réelles sans changement : idem ;
//  3. 10 réponses sur A → retour sur B : « À jour » < 3 s, cartes reçues, empreinte revérifiée en fond, A = B = cloud ;
//  4. mode avion sur B (A répond pendant ce temps) → « Hors ligne » ; retour du réseau → « À jour » < 3 s, sans lecture complète ;
//  5. ligne arrivée au cloud avec une date ANCIENNE (horloge décalée) : la vérification de fond voit l'écart, une passe
//     complète la rapatrie ;
//  6. rien de perdu (comptes A, B, cloud) ; aucune erreur console.
import { appareil, faux } from '../tests-synchro-affichage/commun.mjs';
const ATTENDRE = !process.argv.includes('--sans-attente');
const RESEAU = { offline: false, latency: 120, downloadThroughput: 1.5e6, uploadThroughput: 0.6e6 };
const A = await appareil(false); const B = await appareil(true); const v = B.v;
for (const x of [A, B]) { await x.send('Network.enable'); await x.send('Page.enable'); }
const ST = `(await import(performance.getEntriesByType('resource').map((r) => r.name).find((n) => n.includes('/lib/syncStatus.js')) || '/src/medrevise/lib/syncStatus.js'))`;
const empreintes = (b) => b.ev(`(async () => { const s = ${ST}; const l = await s.etatLocal(); const c = await s.etatCloud(); return { local: l.hash, cloud: c && c.hash, n: l.n }; })()`);
const curseur = (b) => b.ev(`(async () => ${ST}.lireCurseur())()`);
// le faux Supabase ne rend que ses 200 dernières requêtes : on filtre par horodatage, jamais par position
const lecturesCompletes = async (depuis) => (await faux()).journal.filter((j) => j.t >= depuis).filter((j) => j.p === '/rest/v1/medrevise_records' && j.m === 'GET' && /select=store%2Crecord_id%2Cdata/.test(j.q) && /store=not\.in/.test(j.q) && /order=store\.asc/.test(j.q)).length; // = pullAllRecords
const nJournal = async () => new Date().toISOString();
const retour = (b) => b.ev(`document.dispatchEvent(new Event('visibilitychange')); 1`);
async function chrono(b, declencher = retour) {
  await b.ev(`window.__mrMesuresSynchro = []; 1`);
  const t0 = Date.now(); await declencher(b); let vuAttente = false; const vu = [];
  while (Date.now() - t0 < 120000) {
    const p = await b.phase(); if (vu.at(-1) !== p) vu.push(p);
    if (p !== 'ajour') vuAttente = true;
    if ((p === 'ajour' && (vuAttente || Date.now() - t0 > 1500)) || ['horsligne', 'echec', 'incomplet'].includes(p)) break;
    await b.dormir(25);
  }
  const trace = await b.ev(`(window.__mrMesuresSynchro || []).map((x) => x.etape + ' ' + x.ms).join(', ')`);
  return { ms: Date.now() - t0, fin: vu.at(-1), phases: vu.join(' → ') + (trace ? ' [' + trace + ']' : '') };
}
const attendreVerifie = async (b, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const c = await curseur(b); if (c && c.hash) return c; await b.dormir(250); } return curseur(b); };

await A.send('Page.navigate', { url: 'http://localhost:5300/' }); await B.send('Page.navigate', { url: 'http://localhost:5300/' }); await A.dormir(3000);
await A.ouvrirApp({ recharger: false }); await B.ouvrirApp({ recharger: false });
await A.attendrePhase(['ajour'], 120000); await B.attendrePhase(['ajour'], 120000);
await attendreVerifie(B);
const comptesAvant = (await faux()).rows.filter((r) => !r.deleted).length;
await B.send('Network.emulateNetworkConditions', RESEAU);

// 1. sans changement
let j0 = await nJournal(); const r1 = [];
for (let i = 0; i < 3; i++) { r1.push(await chrono(B)); await B.dormir(800); }
v(r1.every((r) => r.fin === 'ajour' && r.ms < 1000), `1. retour sans changement : « À jour » en ${r1.map((r) => r.ms + ' ms').join(', ')} (< 1 s)`);
v((await lecturesCompletes(j0)) === 0, '1. aucune lecture complète de la table pendant ces retours');

// 2. après 5 minutes réelles
if (ATTENDRE) {
  await B.dormir(5 * 60 * 1000 + 2000);
  j0 = await nJournal(); const r2 = await chrono(B);
  v(r2.fin === 'ajour' && r2.ms < 1000 && (await lecturesCompletes(j0)) === 0, `2. retour après 5 min sans changement : « À jour » en ${r2.ms} ms, sans lecture complète`);
} else console.log('   (2. attente de 5 min sautée)');

// 3. 10 réponses sur A
await A.reviser(); const k = await A.repondre(10);
await A.dormir(4500); await A.ev(`window.dispatchEvent(new Event('online')); 1`); await A.attendrePhase(['ajour'], 60000);
j0 = await nJournal();
const r3 = await chrono(B);
v(r3.fin === 'ajour' && r3.ms < 3000, `3. ${k} réponses sur A → retour sur B : « À jour » en ${r3.ms} ms (< 3 s)`, r3.phases);
v((await lecturesCompletes(j0)) === 0, '3. sans lecture complète de la table');
const c3 = await attendreVerifie(B);
v(!!(c3 && c3.hash), `3. empreinte complète revérifiée en arrière-plan (curseur ${c3 && c3.hash})`);
await B.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
// B vient d'envoyer les cartes recalculées par le journal : A les reçoit à son prochain retour
await A.dormir(1500); await A.ev(`document.dispatchEvent(new Event('visibilitychange')); 1`); await A.dormir(300); await A.attendrePhase(['ajour'], 60000);
const eA = await empreintes(A), eB = await empreintes(B);
v(eA.local === eA.cloud && eB.local === eB.cloud && eA.local === eB.local, `3. empreintes égales : A ${eA.local}, B ${eB.local}, cloud ${eB.cloud}`);
await B.send('Network.emulateNetworkConditions', RESEAU);

// 4. mode avion
await B.send('Network.emulateNetworkConditions', { ...RESEAU, offline: true });
const r4a = await chrono(B);
v(r4a.fin === 'horsligne', `4. mode avion : « ${r4a.fin} »`, r4a.phases);
await A.reviser(); const k4 = await A.repondre(3);
await A.dormir(4500); await A.ev(`window.dispatchEvent(new Event('online')); 1`); await A.attendrePhase(['ajour'], 60000);
await B.send('Network.emulateNetworkConditions', RESEAU);
j0 = await nJournal();
const r4 = await chrono(B, (b) => b.ev(`window.dispatchEvent(new Event('online')); 1`));
v(r4.fin === 'ajour' && r4.ms < 3000, `4. retour du réseau (${k4} réponses faites sur A entre-temps) : « À jour » en ${r4.ms} ms`, r4.phases);
v((await lecturesCompletes(j0)) === 0, '4. reprise incrémentale (aucune lecture complète)');
await attendreVerifie(B);

// 5. ligne au cloud avec une date ancienne (appareil à l'horloge en retard)
const vieux = new Date(Date.now() - 3 * 3600e3).toISOString();
await fetch('http://localhost:54399/rest/v1/rpc/medrevise_push', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ records: [{ store: 'fiches', record_id: 'f-horloge', data: { id: 'f-horloge', titre: 'Écrite par un appareil en retard', matiereId: 'mC', type: 'standard', updatedAt: vieux }, updated_at: vieux, deleted: false }] }) });
j0 = await nJournal();
const r5 = await chrono(B);
let recue = false;
for (let i = 0; i < 120 && !recue; i++) { recue = !!(await B.S(`return !!(await S.getOne('fiches', 'f-horloge'))`)); if (!recue) await B.dormir(250); }
await B.attendrePhase(['ajour'], 60000);
const lc5 = await lecturesCompletes(j0);
v(recue && lc5 >= 1, `5. date ancienne : « ${r5.fin} » en ${r5.ms} ms, puis vérification de fond → écart → passe complète → fiche reçue`, `reçue ${recue}, lectures complètes ${lc5} ${r5.phases}`);

// 6. rien de perdu
await B.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await A.ev(`window.dispatchEvent(new Event('online')); 1`); await A.attendrePhase(['ajour'], 60000); await A.dormir(500); await A.attendrePhase(['ajour'], 60000);
const e6A = await empreintes(A), e6B = await empreintes(B);
const comptesApres = (await faux()).rows.filter((r) => !r.deleted).length;
v(e6A.local === e6B.local && e6B.local === e6B.cloud && e6A.n === e6B.n, `6. fin : empreintes A ${e6A.local} = B ${e6B.local} = cloud ${e6B.cloud} (${e6B.n} enregistrements)`);
v(comptesApres === comptesAvant + 1, `6. cloud : ${comptesAvant} → ${comptesApres} enregistrements vivants (+1 : la fiche du scénario 5), rien de perdu`);
A.fin = A.fin || (() => {}); B.fin();
