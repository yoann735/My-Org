// 3) Mode avion sur B : marqueur « Hors ligne · données du … », réponses en file, synchro au retour du réseau.
// 4) Réseau lent (latence simulée, DevTools / CDP) : < 8 s → indicateurs puis valeurs justes ; > 8 s → marqueur hors ligne,
//    puis mise à jour dès que la passe aboutit. 5) Synchro incomplète (envoi refusé par le faux cloud) : relance une fois,
//    puis « Synchro incomplète » + Réessayer. node t-horsligne.mjs
import { appareil, ENREGISTREUR, faux } from './commun.mjs';
const A = await appareil(false); const v = A.v;
const B = await appareil(true);
const reseau = (b, o) => b.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, ...o });
const retour = (b) => b.ev(`document.dispatchEvent(new Event('visibilitychange')); 1`);
const enFile = (b) => b.ev(`(async () => { const s = await import(performance.getEntriesByType('resource').map((r) => r.name).find((n) => n.includes('/data/sync.js')) || '/src/medrevise/data/sync.js'); const j = await import(performance.getEntriesByType('resource').map((r) => r.name).find((n) => n.includes('journal/journal.js')) || '/src/medrevise/journal/journal.js'); return { records: await s.outboxCount(), journal: (await j.idsEnAttente()).length }; })()`);
await B.send('Network.enable'); await B.send('Page.enable');
await B.send('Page.addScriptToEvaluateOnNewDocument', { source: ENREGISTREUR });
await B.ouvrirApp(); await B.attendrePhase(['ajour']);
await A.ouvrirApp(); await A.attendrePhase(['ajour']);
// ---------- 3) mode avion
const j0 = (await faux()).journalRevisions.n;
await reseau(B, { offline: true }); await B.ev(`window.dispatchEvent(new Event('offline')); 1`);
const tAv = Date.now(); await retour(B);
const ph = await B.attendrePhase(['horsligne', 'ajour'], 30000);
console.log('   (info) mode avion : marqueur au bout de', Date.now() - tAv, 'ms');
const bd = await B.bandeau();
const derniere = await B.ev(`localStorage.getItem('medrevise.derniereSyncOk')`);
const attendu = await B.ev(`(async () => (await import('/src/medrevise/lib/synchroAffichage.js')).libelleBandeau({ phase: 'horsligne', depuis: ${JSON.stringify(derniere)} }))()`);
v(ph === 'horsligne' && bd && bd.texte === attendu, `mode avion : « ${bd && bd.texte} »`);
const local = await B.chiffres();
v(local.revisions != null && await B.ev(`!document.querySelector('[data-sfa="demarrer"]').disabled`), `hors ligne : données locales affichées (${JSON.stringify(local)}), Démarrer actif`);
await B.capture('sync-tel-horsligne');
const n = await B.repondre(3);
const file = await enFile(B);
console.log("   (info) réponses données :", n, JSON.stringify(file), await B.ev(`document.querySelector(".sfc")?.innerText.slice(0,80)`));
v(n === 3 && file.records >= 3 && file.journal >= 3 && (await faux()).journalRevisions.n === j0, `3 réponses hors ligne : en file (${file.records} enregistrements, ${file.journal} entrées de journal), rien au cloud`);
await B.ouvrirApp({ recharger: false });
// retour du réseau
await reseau(B, {}); await B.ev(`window.dispatchEvent(new Event('online')); 1`);
const ph2 = await B.attendrePhase(['ajour'], 20000);
await B.dormir(500);
const file2 = await enFile(B);
v(ph2 === 'ajour' && file2.records === 0 && file2.journal === 0 && (await faux()).journalRevisions.n === j0 + 3, `retour du réseau : « ${(await B.bandeau() || {}).texte} », files vidées, +3 réponses au cloud`);
await A.ev(`window.dispatchEvent(new Event('online')); 1`); await A.attendrePhase(['ajour']); await A.reviser();
const cA = await A.chiffres(), cB = await B.chiffres();
v(JSON.stringify(cA) === JSON.stringify(cB), `A reçoit les réponses faites hors ligne sur B : A ${JSON.stringify(cA)} = B ${JSON.stringify(cB)}`);
// ---------- 4) réseau lent : A répond, B revient au premier plan sous latence
const lent = async (latence, nA) => {
  await A.repondre(nA); await A.dormir(4000); await A.ev(`window.dispatchEvent(new Event('online')); 1`); await A.attendrePhase(['ajour']); await A.reviser();
  const ref = await A.chiffres(); const perime = await B.planLocal();
  await B.ouvrirApp({ recharger: false }); await B.attendrePhase(['ajour']);
  // latence réellement active ? (mesurée dans la page ; sinon on réactive le domaine Network et on recommence)
  let mesure = 0;
  for (let k = 0; k < 3 && mesure < latence * 0.8; k++) {
    await B.send('Network.enable'); await reseau(B, { latency: latence });
    mesure = await B.ev(`(async () => { const t = performance.now(); await fetch('http://localhost:54399/__etat?x=' + Math.random()).catch(() => 0); return performance.now() - t; })()`);
  }
  console.log('   (info) latence', latence, ': mesurée', Math.round(mesure), 'ms · phase', await B.phase(), '· écran', await B.ev(`(document.querySelector('[data-sfa]') ? 'lanceur' : '') + (document.querySelector('.sfc') ? 'séance' : '') + ' ' + location.pathname`));
  await B.ev(`window.__vus = []; 1`);
  const t0 = Date.now(); await retour(B);
  // le déclencheur est asynchrone : attendre que la passe ait commencé (phase ≠ « ajour » d'avant) avant de suivre
  for (let i = 0; i < 40 && (await B.phase()) === 'ajour'; i++) await B.dormir(25);
  const phases = []; let der = null;
  for (let i = 0; i < 400; i++) { const p = await B.phase(); if (der !== p) { der = p; phases.push(p + '@' + (Date.now() - t0)); } if (p === 'ajour') break; await B.dormir(100); }
  if (latence > 1000) await B.capture('sync-tel-lent');
  await reseau(B, {});
  const vus = (await B.vus()).map(([, e]) => e).filter((e) => e.retard !== null);
  const res = { ref, perime, phases, vus, final: await B.chiffres(), duree: Date.now() - t0 };
  if (res.final.retard == null) console.log('   (info) états :', JSON.stringify((await B.vus()).slice(-4)), '· bandeau', JSON.stringify(await B.bandeau()), '· DOM', await B.ev(`document.querySelector('[data-sfa]') ? document.querySelector('[data-sfa]').innerText.slice(0, 120).replace(/\\s+/g, ' ') : 'pas de lanceur'`));
  return res;
};
const r1 = await lent(300, 2);
const faux1 = r1.vus.filter((e) => e.retard !== 'attente' && (e.revisions !== r1.ref.revisions || e.retard !== r1.ref.retard));
v(r1.phases[0].startsWith('attente') && r1.phases.at(-1).startsWith('ajour') && !r1.phases.some((p) => p.startsWith('horsligne')) && faux1.length === 0 && JSON.stringify(r1.final) === JSON.stringify(r1.ref),
  `latence 300 ms par requête (${r1.duree} ms) : ${r1.phases.join(' → ')} ; Retard affiché ${r1.vus.map((e) => e.retard).join(' → ')} ; jamais ${r1.perime.retard} (valeur locale périmée)`);
const r2 = await lent(2600, 2);
const iHL = r2.phases.findIndex((p) => p.startsWith('horsligne'));
const tHL = iHL >= 0 ? +r2.phases[iHL].split('@')[1] : -1;
v(iHL > 0 && tHL >= 7800 && tHL < 9500 && r2.phases.at(-1).startsWith('ajour') && JSON.stringify(r2.final) === JSON.stringify(r2.ref),
  `latence 2,6 s par requête (${r2.duree} ms) : ${r2.phases.join(' → ')} — marqueur hors ligne à 8 s, puis à jour avec les bonnes valeurs ${JSON.stringify(r2.final)}`);
// ---------- 5) synchro incomplète : le faux cloud refuse les envois de « questions »
await fetch('http://localhost:54399/__refuser?stores=questions');
await B.S(`const q = await S.getOne('questions', 'c4-nouv3'); await S.put('questions', { ...q, theme: 'Modifié hors cloud' }); return 1`);
await retour(B);
const ph5 = await B.attendrePhase(['incomplet', 'ajour'], 20000);
const bd5 = await B.bandeau();
v(ph5 === 'incomplet' && /Synchro incomplète/.test(bd5.texte) && await B.ev(`!!document.querySelector('[data-act="reessayer-synchro"]')`), `envoi refusé : empreintes différentes après une relance → « ${bd5 && bd5.texte} » + bouton Réessayer`);
await B.capture('sync-tel-incomplet');
await fetch('http://localhost:54399/__refuser?stores=');
await B.toucher(`document.querySelector('[data-act="reessayer-synchro"]')`, 300);
const ph6 = await B.attendrePhase(['ajour'], 20000);
const ligne = (await faux()).rows.find((r) => r.store === 'questions' && r.record_id === 'c4-nouv3');
v(ph6 === 'ajour' && ligne && ligne.data.theme === 'Modifié hors cloud', `Réessayer (cloud réparé) → « ${(await B.bandeau() || {}).texte} », modification arrivée au cloud`);
await B.S(`const q = await S.getOne('questions', 'c4-nouv3'); await S.put('questions', { ...q, theme: 'C4' }); return 1`);
B.erreurs.forEach((e) => A.erreurs.push('B: ' + e));
A.echecs += B.echecs;
A.fin();
