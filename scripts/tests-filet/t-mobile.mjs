// Filet de sécurité — TÉLÉPHONE (390 px, tactile) : contrôle du jour OK (silencieux, aucun bandeau) ;
// avec une anomalie injectée : bandeau en haut de l'accueil mobile → écran Intégrité → retour.
// Pas de section « dossier » : le shell mobile n'a pas de Réglages (et Safari iOS n'a pas l'API).
// Usage : node t-mobile.mjs <dossier-captures>
import { appareil, ok, bilan } from '../tests-collage/outils.mjs';
const captures = process.argv[2] || '/tmp/filet';
const A = await appareil(9335, { captures, largeur: 390, hauteur: 844, tactile: true });
const ouvrir = async () => {
  await A.send('Page.reload'); await A.dormir(3000);
  const ouvert = `!!document.querySelector('.sfa, .mrm-app')`;
  if (!(await A.ev(ouvert))) await A.toucher(await A.pos(`[...document.querySelectorAll('.hub-card')].find((c) => c.textContent.includes('MedRevise'))`));
  await A.attendre(ouvert, 30000); await A.dormir(7000);
};
await ouvrir();
const r0 = await A.ev(`(async () => await ${A.st}.getMeta('integrite.resultat'))()`);
ok(r0 && r0.ok && r0.flashcards === 894 && !(await A.ev(`!!document.querySelector('.filet-bandeau')`)), 'téléphone : contrôle du jour OK (894 flashcards), aucun bandeau', JSON.stringify(r0 && { ok: r0.ok, flashcards: r0.flashcards, ms: r0.dureeMs }));
ok(!(await A.ev(`!!document.querySelector('[data-testid=statut-dossier]')`)), 'aucune section « dossier » sur le téléphone');
await A.capture('09-mobile-ok');
await A.ev(`(async () => { const s = ${A.st}; const q = (await s.getAll('questions')).find((x) => x.type === 'flashcard' && x.dueDate); await s.put('questions', { ...q, id: 'filet-mobile-test', recto: 'TEST mobile : sans date', dueDate: null, historique: [] }); return 1; })()`);
await ouvrir();
const b = await A.ev(`(document.querySelector('[data-testid=bandeau-anomalies]') || {}).textContent || ''`);
ok(/1 carte à vérifier/.test(b), 'anomalie injectée : bandeau « 1 carte à vérifier » en haut de l’accueil mobile', b);
await A.capture('10-mobile-bandeau');
await A.toucher(await A.pos(`document.querySelector('[data-testid=bandeau-anomalies]')`));
await A.attendre(`!!document.querySelector('.filet-ecran .filet-anomalie')`);
await A.toucher(await A.pos(`document.querySelector('.filet-anomalie .filet-a-actions button')`)); await A.dormir(2500);
ok(await A.ev(`!!document.querySelector('.filet-ok')`), 'écran Intégrité mobile : « Remettre dans le planning » → « Tout est en ordre »');
await A.toucher(await A.pos(`[...document.querySelectorAll('.filet-entete button')].find((x) => /Retour/.test(x.textContent))`)); await A.dormir(800);
ok(await A.ev(`!!document.querySelector('.sfa') && !document.querySelector('.filet-bandeau')`), 'retour à l’accueil, bandeau disparu');
await A.ev(`(async () => { await ${A.st}.remove('questions', 'filet-mobile-test'); return 1; })()`);
ok(A.erreurs.length === 0, 'aucune erreur JavaScript', A.erreurs.join(' | ').slice(0, 300));
await A.send('Emulation.setTouchEmulationEnabled', { enabled: false });
await A.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
A.fermer();
process.exit(bilan() ? 1 : 0);
