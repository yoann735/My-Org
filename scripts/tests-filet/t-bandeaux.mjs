// Filet de sécurité — BANDEAUX ET ÉCRAN INTÉGRITÉ (profil de TEST, faux cloud) :
// 1. horloge avancée de 3 jours → « Pas de copie depuis 3 jours » ;
// 2. anomalies injectées (carte sans date, carte enterrée) → « 2 cartes à vérifier » → écran, aucune
//    correction sans clic, « Remettre dans le planning » puis « Tout remettre… » ;
// 3. baisse simulée (instantané de la veille avec 2 cartes de plus) → bandeau rouge + ids manquants.
// Usage : node t-bandeaux.mjs <dossier-captures>
import { appareil, ok, bilan } from '../tests-collage/outils.mjs';

const captures = process.argv[2] || '/tmp/filet';
const ouvert = `!!(document.querySelector('[data-app="medrevise"]') || document.querySelector('.sfa'))`;
async function ouvrir(A) {
  await A.send('Page.reload'); await A.dormir(2500);
  if (!(await A.ev(ouvert))) await A.clic(await A.pos(`[...document.querySelectorAll('.hub-card')].find((c) => c.textContent.includes('MedRevise'))`));
  await A.attendre(ouvert, 30000);
  await A.dormir(6000); // synchro + migrations + contrôle (tâche de fond)
}
const st = (A) => A.st;

// 1. copie trop ancienne : horloge de la page avancée de 3 jours (script posé avant le rechargement)
let A = await appareil(9335, { captures });
await A.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const D = Date, dec = 3 * 86400000; class X extends D { constructor(...a) { super(...(a.length ? a : [D.now() + dec])); } static now() { return D.now() + dec; } } X.UTC = D.UTC; X.parse = D.parse; globalThis.Date = X; })();` });
await ouvrir(A);
await A.attendre(`!!document.querySelector('[data-testid=bandeau-copie]')`, 20000).catch(() => {});
const bandeauCopie = await A.ev(`(document.querySelector('[data-testid=bandeau-copie]') || {}).textContent || ''`);
ok(/Pas de copie depuis 3 jours/.test(bandeauCopie), 'horloge +3 jours : bandeau orange « Pas de copie depuis 3 jours »', bandeauCopie);
await A.capture('02-bandeau-pas-de-copie');
A.fermer();
// onglet neuf, horloge réelle
const liste = await (await fetch('http://localhost:9335/json')).json();
for (const t of liste.filter((x) => x.type === 'page')) await fetch(`http://localhost:9335/json/close/${t.id}`);
await fetch('http://localhost:9335/json/new?http://localhost:5199/', { method: 'PUT' });
await new Promise((r) => setTimeout(r, 2500));
A = await appareil(9335, { captures });
await ouvrir(A); // MedRevise chargé (horloge réelle) avant d'injecter

// 2. anomalies injectées (données de TEST) : une carte sans date, une carte enterrée, dans un cours planifié
await A.ev(`(async () => { const s = ${st(A)}; const sources = await s.getAll('sources'); const mats = await s.getAll('matieres'); const fiches = await s.getAll('fiches');
  const srcOk = new Set(sources.filter((x) => x.rappelsJ !== false && !x.archive).map((x) => x.id)); const matOk = new Set(mats.filter((x) => srcOk.has(x.sourceId) && !x.archive).map((x) => x.id));
  const f = fiches.find((x) => matOk.has(x.matiereId) && !x.archive && x.rappelsJ !== false);
  await s.put('questions', { id: 'filet-test-sans-date', type: 'flashcard', ficheId: f.id, recto: 'TEST filet : carte sans date', verso: 'v', dueDate: null, intervalDays: null, historique: [] });
  await s.put('questions', { id: 'filet-test-enterree', type: 'flashcard', ficheId: f.id, recto: 'TEST filet : carte enterrée', verso: 'v', dueDate: '2026-06-15', intervalDays: 1, historique: [] });
  const i = (await s.getMeta('integrite.instantanes')) || {}; await s.setMeta('integrite.instantanes', { courant: i.courant ? { ...i.courant, ids: [...i.courant.ids, 'filet-test-sans-date', 'filet-test-enterree'].sort(), total: i.courant.total + 2, comptesParType: { ...i.courant.comptesParType, flashcard: (i.courant.comptesParType.flashcard || 0) + 2 } } : null, precedent: null });
  return f.titre; })()`);
await ouvrir(A);
await A.attendre(`!!document.querySelector('[data-testid=bandeau-anomalies]')`, 20000).catch(() => {});
const bandeau = await A.ev(`(document.querySelector('[data-testid=bandeau-anomalies]') || {}).textContent || ''`);
ok(/2 cartes à vérifier/.test(bandeau), 'bandeau discret « 2 cartes à vérifier »', bandeau);
await A.capture('03-bandeau-anomalies');
const intactes = await A.ev(`(async () => { const s = ${st(A)}; const a = await s.getOne('questions', 'filet-test-sans-date'); const b = await s.getOne('questions', 'filet-test-enterree'); return a.dueDate === null && b.dueDate === '2026-06-15'; })()`);
ok(intactes, 'aucune correction automatique : les deux cartes sont inchangées');
await A.clic(await A.pos(`document.querySelector('[data-testid=bandeau-anomalies]')`));
await A.attendre(`!!document.querySelector('.filet-ecran .filet-anomalie')`);
const lignes = await A.ev(`[...document.querySelectorAll('.filet-anomalie')].map((x) => x.textContent.replace(/\\s+/g, ' ').trim().slice(0, 140))`);
ok(lignes.length === 2 && lignes.some((l) => /Sans date valide.*carte sans date/.test(l)) && lignes.some((l) => /Enterrée.*carte enterrée/.test(l)), 'écran : 2 anomalies (carte, cours, problème)', JSON.stringify(lignes));
await A.clic(await A.pos(`document.querySelector('.filet-anomalie[data-carte="filet-test-enterree"] .filet-a-actions button:last-child')`));
const apercu = await A.ev(`(document.querySelector('.filet-anomalie[data-carte="filet-test-enterree"] .filet-apercu') || {}).textContent || ''`);
ok(/carte enterrée/.test(apercu), '« Voir la carte » : recto / verso affichés', apercu.slice(0, 80));
await A.capture('04-ecran-integrite');
await A.clic(await A.pos(`document.querySelector('.filet-anomalie[data-carte="filet-test-sans-date"] .filet-a-actions button')`));
await A.dormir(2500);
const apres1 = await A.ev(`(async () => { const s = ${st(A)}; const a = await s.getOne('questions', 'filet-test-sans-date'); return { due: a.dueDate, reste: document.querySelectorAll('.filet-anomalie').length }; })()`);
const jour = await A.ev(`new Date().toLocaleDateString('fr-CA')`);
ok(apres1.due === jour && apres1.reste === 1, '« Remettre dans le planning (aujourd’hui) » : dueDate = aujourd’hui, anomalie retirée', JSON.stringify(apres1));
// « Tout remettre » apparaît dès 2 cartes réparables : on réinjecte une carte sans date pour l'exercer
await A.ev(`(async () => { const s = ${st(A)}; const b = await s.getOne('questions', 'filet-test-enterree'); await s.put('questions', { ...b, id: 'filet-test-sans-date-2', recto: 'TEST filet : seconde', dueDate: null }); return 1; })()`);
await ouvrir(A);
await A.attendre(`!!document.querySelector('[data-testid=bandeau-anomalies]')`, 20000).catch(() => {});
await A.clic(await A.pos(`document.querySelector('[data-testid=bandeau-anomalies]')`));
await A.attendre(`!!document.querySelector('.filet-ecran .filet-anomalie')`);
const tout = await A.pos(`[...document.querySelectorAll('.filet-ecran button')].find((b) => /Tout remettre dans le planning/.test(b.textContent))`);
ok(!!tout, 'bouton « Tout remettre dans le planning (2) »');
await A.clic(tout); await A.dormir(2500);
const apres2 = await A.ev(`({ ok: !!document.querySelector('.filet-ok'), reste: document.querySelectorAll('.filet-anomalie').length })`);
ok(apres2.ok && apres2.reste === 0, '« Tout remettre… » : plus aucune anomalie, « Tout est en ordre »', JSON.stringify(apres2));

// 3. baisse simulée : l'instantané de « la veille » comptait 2 flashcards de plus
await A.ev(`(async () => { const s = ${st(A)}; const i = await s.getMeta('integrite.instantanes'); const hier = new Date(Date.now() - 86400000).toLocaleDateString('fr-CA');
  await s.setMeta('integrite.instantanes', { courant: { ...i.courant, jour: hier, ids: [...i.courant.ids, 'disparue-1', 'disparue-2'].sort(), total: i.courant.total + 2, comptesParType: { ...i.courant.comptesParType, flashcard: i.courant.comptesParType.flashcard + 2 } }, precedent: null }); return 1; })()`);
await ouvrir(A);
await A.attendre(`!!document.querySelector('[data-testid=bandeau-baisse]')`, 20000).catch(() => {});
const rouge = await A.ev(`(document.querySelector('[data-testid=bandeau-baisse]') || {}).textContent || ''`);
ok(/2 cartes de moins qu’hier/.test(rouge), 'bandeau rouge « 2 cartes de moins qu’hier »', rouge);
await A.capture('05-bandeau-baisse');
await A.clic(await A.pos(`document.querySelector('[data-testid=bandeau-baisse]')`));
await A.attendre(`!!document.querySelector('.filet-bloc.rouge')`);
const bloc = await A.ev(`document.querySelector('.filet-bloc.rouge').textContent.replace(/\\s+/g, ' ')`);
ok(/disparue-1, disparue-2/.test(bloc) && /restore-from-github\.md/.test(bloc), 'écran : ids manquants + lien vers la procédure de restauration', bloc.slice(0, 220));
await A.capture('06-ecran-baisse');
// nettoyage du profil de test : instantané remis au jour, cartes de test retirées
await A.ev(`(async () => { const s = ${st(A)}; for (const id of ['filet-test-sans-date', 'filet-test-enterree', 'filet-test-sans-date-2']) await s.remove('questions', id); const i = await s.getMeta('integrite.instantanes'); await s.setMeta('integrite.instantanes', { courant: null, precedent: null }); return 1; })()`);
ok(A.erreurs.length === 0, 'aucune erreur JavaScript', A.erreurs.join(' | ').slice(0, 300));
A.fermer();
process.exit(bilan() ? 1 : 0);
