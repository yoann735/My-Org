// Chaque écran qui montre des chiffres calculés, pendant une passe (latence 900 ms pour la voir) puis après :
// Accueil ordinateur (dues du jour, Série du jour, calendrier de la semaine), Réviser (Retard, Révisions, Nouvelles,
// « Rattraper », pastilles de l'arbre, « Lancer aujourd'hui »), Apprentissage (compteur, À apprendre, badges ×n, Lancer),
// accueil téléphone (chiffre du jour, « Commencer la série », calendrier « Mes J »). node t-ecrans.mjs
import { appareil } from './commun.mjs';
const A = await appareil(false); const v = A.v;
const B = await appareil(true);
for (const b of [A, B]) await b.send('Network.enable');
const lent = (b, l) => b.send('Network.emulateNetworkConditions', { offline: false, latency: l, downloadThroughput: -1, uploadThroughput: -1 });
const pendantPuisApres = async (b, sonde, nom) => {
  await lent(b, 900); await b.ev(`document.dispatchEvent(new Event('visibilitychange')); 1`); await b.dormir(350);
  const pendant = { phase: await b.phase(), ...(await b.ev(sonde)) };
  if (nom) await b.capture(nom);
  await lent(b, 0); await b.attendrePhase(['ajour']); await b.dormir(200);
  return { pendant, apres: { phase: await b.phase(), ...(await b.ev(sonde)) } };
};
// un passage pour avoir un badge ×1 (Apprentissage)
await A.S(`const r = (await S.getOne('learning_set', 'learning_set')) || { id: 'learning_set', cardIds: [] }; await S.put('learning_set', { ...r, passages: { 'c2-rev1': 1 } }); return 1`);
await A.ouvrirApp(); await A.attendrePhase(['ajour']);
// Accueil ordinateur
await A.ev(`(() => { const x = [...document.querySelectorAll('.sb-item')].find((e) => /^Accueil|Tableau/.test(e.title || e.innerText || '')); x && x.click(); return 1; })()`); await A.dormir(800);
let r = await pendantPuisApres(A, `JSON.stringify({ dues: (document.querySelector('[data-dash="dues"]') || {}).innerText || null, duesAttente: !!document.querySelector('[data-dash="dues"] [data-chiffre="attente"]'),
  serie: !!document.querySelector('[data-serie="attente"]'), cal: document.querySelectorAll('[data-cal-attente]').length, coursCal: document.querySelectorAll('.wcal-course').length })`.replace(/^/, '(()=>JSON.parse(').concat('))()'), 'sync-ordi-accueil-chargement');
v(r.pendant.phase === 'attente' && r.pendant.duesAttente && r.pendant.serie && r.pendant.cal === 7 && r.pendant.coursCal === 0, `Accueil pendant : dues, Série du jour et 7 jours du calendrier en attente (${JSON.stringify(r.pendant)})`);
v(r.apres.phase === 'ajour' && /\d+ cartes? aujourd'hui/.test(r.apres.dues) && !r.apres.serie && r.apres.cal === 0, `Accueil après : « ${r.apres.dues} », calendrier rempli (${r.apres.coursCal} cours)`);
// Réviser
await A.reviser();
r = await pendantPuisApres(A, `(()=>({ cats: document.querySelectorAll('[data-sfa="lanceur"] [data-chiffre="attente"]').length, ratt: !!document.querySelector('.tree-rattraper'), retard: document.querySelectorAll('.lt-retard').length, dues: document.querySelectorAll('.due-badge').length,
  lancer: [...document.querySelectorAll('button')].filter((x) => /Lancer aujourd/.test(x.textContent)).map((x) => x.disabled).join(), demarrer: document.querySelector('[data-sfa="demarrer"]').disabled }))()`);
v(r.pendant.cats >= 4 && !r.pendant.ratt && r.pendant.retard === 0 && r.pendant.dues === 0 && r.pendant.lancer === 'true' && r.pendant.demarrer, `Réviser pendant : chiffres du lanceur en attente, ni « Rattraper », ni alertes / pastilles de retard, Lancer aujourd'hui et Démarrer désactivés (${JSON.stringify(r.pendant)})`);
v(r.apres.cats === 0 && r.apres.dues > 0 && r.apres.lancer === 'false' && !r.apres.demarrer, `Réviser après : chiffres, pastilles (${r.apres.dues}) et boutons revenus`);
// Apprentissage
await A.apprentissage(); await A.deplier();
r = await pendantPuisApres(A, `(()=>({ compteur: !!document.querySelector('[data-compteur]'), badges: document.querySelectorAll('[data-passages]').length, lancer: document.querySelector('.alib-lancer[data-lancer]').disabled, txtLancer: document.querySelector('.alib-lancer[data-lancer]').innerText.trim() }))()`, 'sync-ordi-apprentissage-chargement');
v(!r.pendant.compteur && r.pendant.badges === 0 && r.pendant.lancer && r.pendant.txtLancer === 'Lancer', `Apprentissage pendant : compteur et badges ×n masqués, Lancer désactivé sans nombre (${JSON.stringify(r.pendant)})`);
v(r.apres.compteur && r.apres.badges === 1 && !r.apres.lancer && /\(\d+\)/.test(r.apres.txtLancer), `Apprentissage après : compteur, badge ×1, « ${r.apres.txtLancer} »`);
// accueil téléphone
await B.ouvrirApp(); await B.attendrePhase(['ajour']);
r = await pendantPuisApres(B, `(()=>({ hero: (document.querySelector('[data-hero="n"]') || {}).innerText || '', heroAttente: !!document.querySelector('[data-hero="n"] [data-chiffre="attente"]'), commencer: document.querySelector('.mrm-cta').disabled, cal: document.querySelectorAll('[data-cal-attente]').length }))()`, 'sync-tel-accueil-chargement');
v(r.pendant.heroAttente && r.pendant.hero === '' && r.pendant.commencer && r.pendant.cal === 1, `téléphone pendant : chiffre du jour en attente, « Commencer la série » désactivé, « Mes J » en attente (${JSON.stringify(r.pendant)})`);
v(/^\d+$/.test(r.apres.hero) && !r.apres.commencer && r.apres.cal === 0, `téléphone après : ${r.apres.hero} cartes dues, boutons actifs`);
await A.S(`const r = await S.getOne('learning_set', 'learning_set'); await S.put('learning_set', { ...r, passages: {} }); return 1`);
B.erreurs.forEach((e) => A.erreurs.push('B: ' + e)); A.echecs += B.echecs;
A.fin();
