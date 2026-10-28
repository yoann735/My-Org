// Captures ordinateur (A) des trois états : chargement (latence pour le voir), à jour, hors ligne. node cap-ordinateur.mjs
import { appareil } from './commun.mjs';
const A = await appareil(false);
const reseau = (o) => A.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, ...o });
await A.send('Network.enable');
await A.ouvrirApp(); await A.attendrePhase(['ajour']); await A.reviser(); await A.dormir(3500);
await reseau({ latency: 900 });
await A.ev(`document.dispatchEvent(new Event('visibilitychange')); 1`); await A.dormir(400);
await A.capture('sync-ordi-chargement');
const p1 = await A.phase();
await A.attendrePhase(['ajour']); await A.dormir(300);
await A.capture('sync-ordi-ajour');
await reseau({ offline: true }); await A.ev(`window.dispatchEvent(new Event('offline')); document.dispatchEvent(new Event('visibilitychange')); 1`);
const p3 = await A.attendrePhase(['horsligne'], 15000); await A.dormir(300);
await A.capture('sync-ordi-horsligne');
await reseau({}); await A.ev(`window.dispatchEvent(new Event('online')); 1`); const p4 = await A.attendrePhase(['ajour'], 20000);
console.log('phases', p1, p3, p4, A.erreurs.join(' | ').slice(0, 200));
process.exit(0);
