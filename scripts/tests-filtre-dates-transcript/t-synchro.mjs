// 4) DEUX APPAREILS (faux Supabase) : une session enregistrée sur l'ordinateur B arrive sur l'ordinateur A par la
//    synchro, et sa date apparaît dans la Bibliothèque de A sans recharger ; suppression propagée. node t-synchro.mjs
import { appareil, dormir, CLOUD, COURS } from './commun.mjs';
const A = await appareil('ordi');
const B = await appareil('ordiB');
await A.preparer(CLOUD); await A.attendreSynchro(); await A.synchro();
await B.preparer(CLOUD, { vide: true }); await B.attendreSynchro(); await B.synchro();
A.ok(await A.biblio(), 'A : Bibliothèque');
await A.cliquerCal('Chimie'); await dormir(600);
A.ok(JSON.stringify(await A.pastilles('Liaisons chimiques')) === '["2026-11-19"]', 'A : Liaisons chimiques — 19 nov.');
B.ok(await B.biblio(), 'B : Bibliothèque (données reçues du cloud)');
await B.cliquerCal('Chimie'); await dormir(800);
B.ok(JSON.stringify(await B.pastilles('Liaisons chimiques')) === '["2026-11-19"]', 'B : les sessions reçues du cloud donnent les mêmes dates', JSON.stringify(await B.pastilles('Liaisons chimiques')));
const jour = await B.ev(`new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date())`);
// B enregistre une session (même chemin que la transcription en direct : ecrireSession puis envoi)
await B.ev(`(async () => { const s = await __imp('/src/medrevise/transcription/sessions.js'); const y = await __imp('/src/medrevise/transcription/synchro.js');
  const r = { ...s.nouvelleSession({ courseId: '${COURS.E.id}', source: 'micro' }), id: 'ts_banc_sync', endedAt: new Date().toISOString(), segments: [{ id: 'z1', t0: 3, t1: 7, text: 'Liaison covalente.', status: 'final' }] };
  await s.ecrireSession(r); await s.viderEcritures(); await y.pousserMaintenant(r.id); return 1; })()`);
B.ok(await B.attendre(`!!(${B.qFiche('Liaisons chimiques')}).querySelector('.ltd-p[data-jour="${jour}"]')`, 4000), 'B : la date du jour apparaît aussitôt');
await dormir(1500);
await A.synchro(); await dormir(800);
A.ok(await A.attendre(`!!(${A.qFiche('Liaisons chimiques')}).querySelector('.ltd-p[data-jour="${jour}"]')`, 8000), 'A : session reçue par la synchro → la date apparaît sans recharger');
await A.capture('synchro-a');
// suppression sur B, propagée
await B.ev(`(async () => { const s = await __imp('/src/medrevise/transcription/sessions.js'); await s.supprimerSession(await s.lireSession('ts_banc_sync')); return 1; })()`);
await dormir(1500); await A.synchro(); await dormir(800);
A.ok(await A.attendre(`JSON.stringify([...(${A.qFiche('Liaisons chimiques')}).querySelectorAll('.ltd-p[data-jour]')].map((p) => p.dataset.jour)) === '["2026-11-19"]'`, 8000), 'A : session supprimée sur B → la date disparaît');
process.exitCode = A.fin() + B.fin();
A.fermerWs(); B.fermerWs();
