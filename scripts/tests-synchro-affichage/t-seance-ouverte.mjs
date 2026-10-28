// Une séance déjà ouverte n'est jamais modifiée sous les yeux : B (téléphone) a une séance ouverte, A répond à des cartes
// de cette séance, B revient au premier plan → passe complète, mais la séance affichée ne bouge pas (même carte, même file,
// même progression, aucun indicateur dedans). Elle se met à jour à la reprise suivante (règle existante). node t-seance-ouverte.mjs
import { appareil } from './commun.mjs';
const A = await appareil(false); const v = A.v;
const B = await appareil(true);
await B.ouvrirApp(); await B.attendrePhase(['ajour']);
await B.attendre(`!!document.querySelector('[data-sfa="demarrer"]:not(:disabled)')`, 20000);
await B.toucher(`document.querySelector('[data-raccourci="revisionsJ"]')`, 300);
await B.maximum('retard', 'tout'); await B.maximum('revisions', 'tout');
await B.toucher(`document.querySelector('[data-sfa="demarrer"]')`, 1200);
await B.attendre(`!!document.querySelector('.sfc-carte')`, 15000);
const etat = () => B.ev(`(async () => { const S = ${B.mod('storage.js')}; const s = await S.getMeta('seanceFC'); return JSON.stringify({ cartes: s.cartes, idx: s.idx, carte: (document.querySelector('.sfc-carte[data-carte], [data-carte]') || {}).dataset?.carte || document.querySelector('.sfc-carte')?.innerText.slice(0, 40), prog: (document.querySelector('.sfc-prog') || {}).innerText, attente: document.querySelectorAll('.sfc [data-chiffre="attente"]').length, html: document.querySelector('.sfc').innerText.length }); })()`).then(JSON.parse);
const avant = await etat();
// A répond aux 3 dernières cartes de la séance de B
await A.ouvrirApp(); await A.attendrePhase(['ajour']);
const cibles = avant.cartes.slice(-3);
await A.S(`const R = await import(performance.getEntriesByType('resource').map((r) => r.name).find((n) => n.includes('scheduler/repondre.js')) || '/src/medrevise/scheduler/repondre.js');
  for (const id of ${JSON.stringify(cibles)}) { const q = await S.getOne('questions', id); await R.repondreFlashcard(q, 3, { sauver: (c) => S.put('questions', c) }); } return 1`);
await A.dormir(4000); await A.ev(`window.dispatchEvent(new Event('online')); 1`); await A.attendrePhase(['ajour']);
// B revient au premier plan pendant sa séance
await B.ev(`document.dispatchEvent(new Event('visibilitychange')); 1`);
const ph = await B.attendrePhase(['ajour'], 20000);
const recues = await B.S(`return (await Promise.all(${JSON.stringify(cibles)}.map((id) => S.getOne('questions', id)))).map((q) => q.dueDate)`);
const apres = await etat();
await B.capture('sync-tel-seance-ouverte');
v(ph === 'ajour' && recues.every((d) => d > new Date().toLocaleDateString('fr-CA')), `B : passe complète pendant la séance, réponses de A reçues (échéances ${recues.join(', ')})`);
v(JSON.stringify(apres.cartes) === JSON.stringify(avant.cartes) && apres.idx === avant.idx && apres.carte === avant.carte && apres.prog === avant.prog && apres.attente === 0,
  `séance ouverte inchangée sous les yeux : même file (${apres.cartes.length}), même carte, « ${apres.prog} », aucun indicateur dedans`);
// reprise : la règle existante retire les cartes notées ailleurs
await B.ev(`(() => { const q = document.querySelector('.sfc-quitter'); q && q.click(); return 1; })()`); await B.dormir(1000);
const rep = await B.ev(`(document.querySelector('[data-sfa="reprendre"]') || {}).innerText || ''`);
const n = +(/(\d+)\s+restante/.exec(rep) || [])[1];
v(n === avant.cartes.length - avant.idx - 3, `à la reprise suivante : « ${rep.replace(/\s+/g, ' ')} » (${avant.cartes.length - avant.idx} − 3 notées sur A)`);
B.erreurs.forEach((e) => A.erreurs.push('B: ' + e)); A.echecs += B.echecs;
A.fin();
