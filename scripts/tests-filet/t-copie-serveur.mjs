// Filet de sécurité — COPIE SERVEUR dans Chrome : Réglages → Sauvegardes, « Lancer une copie maintenant »
// vers le dépôt GitHub de TEST (variables de test passées à Vite), statut affiché, relance sans doublon,
// contrôle du jour OK. Données : profil de test restauré + faux Supabase local (jamais le vrai cloud).
// Usage : node t-copie-serveur.mjs <dossier-captures>
import { appareil, ok, bilan } from '../tests-collage/outils.mjs';

const captures = process.argv[2] || '/tmp/filet';
const A = await appareil(9335, { captures });
await A.send('Page.reload'); await A.dormir(2500);
const ouvert = `!!(document.querySelector('[data-app="medrevise"]') || document.querySelector('.sfa'))`;
if (!(await A.ev(ouvert))) {
  await A.ev(`(() => { const b = [...document.querySelectorAll('button, a')].find((x) => /Retour à l'accueil|mes apps/.test((x.getAttribute('title') || '') + x.textContent)); b && b.click(); return 1; })()`); await A.dormir(1200);
  await A.clic(await A.pos(`[...document.querySelectorAll('.hub-card')].find((c) => c.textContent.includes('MedRevise'))`));
}
await A.attendre(ouvert, 30000);
// synchro de démarrage : tout le profil part au faux cloud (fichiers compris) — attendre que la file se vide
for (let i = 0; i < 90; i++) {
  const n = await A.ev(`(async () => { const s = await import(performance.getEntriesByType('resource').map((r) => r.name).find((n) => n.includes('/data/sync.js'))); return (await s.outboxCount()) + (await s.blobOutboxEntries()).length; })()`).catch(() => 99);
  if (n === 0 && i > 3) break;
  await A.dormir(2000);
}
const nuage = await (await fetch('http://localhost:54399/__etat')).json();
console.log(`faux cloud : ${nuage.rows.length} enregistrements, ${nuage.blobs.length} fichiers`);
await A.ev(`(() => { const el = [...document.querySelectorAll('.sb-item')].find((b) => (b.getAttribute('title') || '').startsWith('Réglages')); el && el.click(); return 1; })()`);
await A.attendre(`!!document.querySelector('[data-testid=carte-sauvegardes]')`);
await A.attendre(`!/Lecture de l’état/.test(document.querySelector('[data-testid=statut-copie]').textContent)`, 30000);
const avant = await A.ev(`document.querySelector('[data-testid=statut-copie]').textContent`);
ok(/Aucune copie|Dernière copie/.test(avant), 'statut lu depuis GitHub avant la copie', avant);
await A.ev(`document.querySelector('[data-testid=carte-sauvegardes]').scrollIntoView({ block: 'start' }), true`);

// 1. copie manuelle — une petite modification du profil de TEST d'abord (sinon, rien n'ayant changé depuis la copie
//    précédente, aucun commit ne serait créé : c'est l'idempotence, vérifiée juste après)
await A.ev(`(async () => { const s = ${A.st}; const q = (await s.getAll('questions')).find((x) => x.type === 'qcm'); await s.put('questions', { ...q }); return 1; })()`);
for (let i = 0; i < 20; i++) { const n = await A.ev(`(async () => (await (await import(performance.getEntriesByType('resource').map((r) => r.name).find((n) => n.includes('/data/sync.js')))).outboxCount()))()`).catch(() => 1); if (!n) break; await A.dormir(1000); }
await A.clic(await A.pos(`[...document.querySelectorAll('[data-testid=carte-sauvegardes] button')].find((b) => /Lancer une copie/.test(b.textContent))`));
await A.attendre(`!!document.querySelector('[data-testid=carte-sauvegardes] .filet-retour')`, 180000);
const retour1 = await A.ev(`document.querySelector('[data-testid=carte-sauvegardes] .filet-retour').textContent`);
ok(/Copie faite : commit [0-9a-f]{7}/.test(retour1), '« Lancer une copie maintenant » → commit dans le dépôt de test', retour1);
const nouveau = (/commit ([0-9a-f]{7})/.exec(retour1) || [])[1];
await A.attendre(`document.querySelector('[data-testid=statut-copie]').textContent.includes(${JSON.stringify('commit ' + nouveau)})`, 30000).catch(() => {});
const statut = await A.ev(`document.querySelector('[data-testid=statut-copie]').textContent`);
ok(statut.includes('commit ' + nouveau) && /Dernière copie : aujourd’hui \d\d:\d\d ✓ · [\d\s\u202f\u00a0]+ flashcards · [\d\s\u202f\u00a0]+ questions · commit [0-9a-f]{7}/.test(statut), 'statut : « Dernière copie : aujourd’hui HH:MM ✓ · N flashcards · N questions »', statut);
// 2. relance sans changement
await A.clic(await A.pos(`[...document.querySelectorAll('[data-testid=carte-sauvegardes] button')].find((b) => /Lancer une copie/.test(b.textContent))`));
await A.dormir(1500);
await A.attendre(`/Rien n’a changé|Copie faite/.test(document.querySelector('[data-testid=carte-sauvegardes] .filet-retour').textContent) && !/Copie…/.test(document.querySelector('[data-testid=carte-sauvegardes]').textContent)`, 180000);
const retour2 = await A.ev(`document.querySelector('[data-testid=carte-sauvegardes] .filet-retour').textContent`);
ok(/Rien n’a changé/.test(retour2), 'relance le même jour sans changement → aucun nouveau commit', retour2);
// 3. contrôle du jour
await A.attendre(`/OK ·|à vérifier|de moins/.test(document.querySelector('[data-testid=statut-controle]').textContent)`, 60000);
const controle = await A.ev(`({ t: document.querySelector('[data-testid=statut-controle]').textContent, vert: document.querySelector('[data-testid=point-controle]').classList.contains('vert'), bandeau: !!document.querySelector('.filet-bandeau') })`);
ok(controle.vert && /OK · [\d\s\u202f\u00a0]+ flashcards/.test(controle.t) && !controle.bandeau, 'contrôle du jour : point vert « OK · N flashcards », aucun bandeau', JSON.stringify(controle));
await A.capture('01-reglages-sauvegardes-ok');
ok(A.erreurs.length === 0, 'aucune erreur JavaScript', A.erreurs.join(' | ').slice(0, 300));
A.fermer();
process.exit(bilan() ? 1 : 0);
