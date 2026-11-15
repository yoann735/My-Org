// Mode file d'attente — scénarios du cahier des charges, dans Chrome : node t-scenarios.mjs ordi|tablette|tel
// (voir commun.mjs). Horloge simulée dans la page, données de test semées sur un profil vidé avant chaque scénario.
// Les séances « vues » se font À L'ÉCRAN (toucher la carte, noter) ; les journées « faites » hors du point testé passent
// par le même chemin que l'app (scheduler/repondre.js) pour garder le banc rapide.
import fs from 'node:fs';
import { appareil, paquets, nouvelles, ajouterJours, dormir } from './commun.mjs';

const type = process.argv[2] || 'ordi';
const seul = process.argv[3] || null; // un seul scénario (ex. « s1 »)
const b = await appareil(type);
const mobile = type === 'tel';
const resume = {};
const tri = (l) => [...l].sort();
const memes = (a, b2) => JSON.stringify(tri(a)) === JSON.stringify(tri(b2));
const duJour = (ids, j) => ids.filter((id) => id.startsWith('c' + j));

/* ---------- gestes ---------- */
async function versSeance() { if (!mobile) await b.aller('Réviser'); await b.attendre(`!!document.querySelector('.sfa')`, 15000); await dormir(500); }
async function versReglages() { await b.aller('Réglages'); await b.attendre(`!!document.querySelector('[data-fa="reglage"]')`, 15000); await dormir(300); }
/** jour suivant simulé : recharge l'app à 10:00, attend la clôture des journées (mode actif) */
async function jour(j) {
  await b.horloge(j);
  await b.attendre(`(async () => { const S = await __imp('/src/medrevise/lib/storage.js'); const r = await S.getFileAttente(); return !r || !r.actif || r.verifieJusquau >= ${JSON.stringify(ajouterJours(j, -1))}; })()`, 15000, 200);
  await dormir(800);
  await versSeance();
}
/** activation par l'écran (Réglages → Planification) ; au téléphone (pas de Réglages) : même écriture, par le module */
async function activer({ choisir = null, capture = null } = {}) {
  if (mobile) {
    await b.ev(`(async () => { const F = await __imp('/src/medrevise/lib/fileAttente.js'); const P = await __imp('/src/medrevise/lib/planning.js'); const S = await __imp('/src/medrevise/lib/storage.js');
      const Q = await __imp('/src/medrevise/session/SeanceFC.jsx'); const db = { sources: await S.getAll('sources'), matieres: await S.getAll('matieres'), fiches: await S.getAll('fiches'), questions: await S.getAll('questions') };
      const auj = F.jourFile(); const v = F.plusVieuxRetard(Q.flashcardsPlanifiees(db), P.dateBase, auj) || auj; await S.setFileAttente(F.etatActivation(${JSON.stringify(choisir)} || v, auj)); return 1; })()`);
    await b.ouvrir(); await versSeance();
    return null;
  }
  await versReglages();
  await b.clic(`document.querySelector('[data-fa="reglage"] .switch')`, 600);
  const ouverte = await b.attendre(`!!document.querySelector('[data-fa="feuille"]')`, 5000);
  const lire = () => b.ev(`(() => ({ phrase: (document.querySelector('[data-fa="phrase"]') || {}).innerText, choix: (document.querySelector('[data-fa="choix"]') || {}).innerText,
    actif: (document.querySelector('.fa-jour.actif') || {}).dataset?.jour || null, jours: [...document.querySelectorAll('.fa-jour')].map((e) => e.dataset.jour),
    lignes: [...document.querySelectorAll('[data-fa="apercu"] .fa-ligne[data-jour]')].map((l) => ({ jour: l.dataset.jour, retard: +l.querySelector('[data-col=retard]').innerText, revisions: +l.querySelector('[data-col=revisions]').innerText, total: +l.querySelector('[data-col=total]').innerText })),
    rienEcrit: true }))()`);
  const avant = await lire();
  avant.rienEcrit = !(await b.ev(`(async () => { const S = await __imp('/src/medrevise/lib/storage.js'); return !!(await S.getFileAttente()); })()`));
  if (capture) await b.capture(capture);
  let apres = null;
  if (choisir) { await b.clic(`document.querySelector('.fa-jour[data-jour="${choisir}"]')`, 500); apres = await lire(); if (capture) await b.capture(capture + '-date'); }
  await b.clic(`document.querySelector('[data-fa="activer"]')`, 1200);
  await b.attendre(`!document.querySelector('[data-fa="feuille"]')`, 5000);
  await versSeance();
  return { ouverte, avant, apres };
}
/** séance à l'écran : Démarrer, puis chaque carte touchée et notée. `notes` : id → note (défaut Correct = 3) ; `max` cartes */
async function seance({ notes = {}, max = Infinity, capture = null } = {}) {
  await versSeance();
  if (!(await b.clic(`document.querySelector('[data-sfa="demarrer"]')`, 1200))) return [];
  const vues = [];
  for (let k = 0; k < 400 && vues.length < max; k++) {
    if (await b.ev(`!!document.querySelector('.sfc-intercalaire')`)) { await b.clic(`document.querySelector('.sfc-intercalaire')`, 400); continue; }
    const id = await b.ev(`(document.querySelector('.sfc-carte[data-carte]') || {}).dataset?.carte || null`);
    if (!id) break;
    if (capture && vues.length === 0) await b.capture(capture);
    await b.clic(`document.querySelector('.sfc-carte[data-carte]')`, 350);
    const note = typeof notes === 'function' ? notes(id, vues.length) : (notes[id] || 3);
    await b.attendre(`!!document.querySelector('[data-note="${note}"]')`, 4000);
    await b.clic(`document.querySelector('[data-note="${note}"]')`, 200);
    await b.attendre(`(document.querySelector('.sfc-carte[data-carte]') || {}).dataset?.carte !== ${JSON.stringify(id)}`, 5000, 80);
    vues.push(id);
  }
  // quitter la séance (Terminer / fermer) puis revenir à l'écran de séance
  await b.ev(`(() => { const t = [...document.querySelectorAll('button')].find((x) => /^Terminer$|^Quitter$/.test(x.innerText.trim()) || /Quitter|Fermer la séance/.test(x.title || '')); t && t.click(); return 1; })()`);
  await dormir(900);
  return vues;
}
async function preparer(cartes, jour0) { await b.vider(); await b.horloge(jour0); await b.semer(cartes); await b.ouvrir(); await versSeance(); }
const instantane = () => b.ev(`(async () => { const S = await __imp('/src/medrevise/lib/storage.js'); return Object.fromEntries((await S.getAll('questions')).map((q) => [q.id, q])); })()`);
const journal = () => b.ev(`(async () => { const J = await __imp('/src/medrevise/journal/journal.js'); return (await J.toutLeJournal()).map((e) => ({ card: e.card_id, jour: e.jour, at: e.reviewed_at, rating: e.rating })); })()`);
const scenario = (nom) => !seul || seul === nom;

/* ---------- S1 : 20/jour, mardi + mercredi oubliés ---------- */
if (scenario('s1')) {
  console.log(`\n== S1 (${b.nom}) 20 révisions/jour, mardi et mercredi oubliés`);
  await preparer(paquets('2026-11-16', 14, 20, { vue: '2026-11-15' }), '2026-11-16');
  const snap = await instantane();
  const act = await activer();
  if (act) b.ok(act.ouverte && act.avant.rienEcrit && /Aucun retard/.test(act.avant.phrase), 'activation : feuille ouverte, rien écrit avant « Activer », aucun retard', act.avant.phrase);
  let e = await b.ecran();
  b.ok(e.revisions === 20 && e.retard === 0 && !e.decalage, 'lundi : 20 révisions, pas de décalage', JSON.stringify(e));
  const lundi = await seance();
  b.ok(lundi.length === 20 && lundi.every((id) => id.startsWith('c2026-11-16')), 'lundi : séance faite à l’écran (20 cartes du lundi)', String(lundi.length));
  await jour('2026-11-19'); // jeudi (app non ouverte mardi et mercredi)
  e = await b.ecran(); let s = await b.etat();
  b.ok(s.rec.pauses.join() === '2026-11-17,2026-11-18', 'jeudi : mardi et mercredi mis en pause', s.rec.pauses.join());
  b.ok(e.revisions === 20 && e.retard === 0 && memes(s.revisions, duJour(Object.keys(snap), '2026-11-17')), 'jeudi = les 20 cartes de mardi (écran : Révisions 20, Retard 0)', JSON.stringify(e));
  b.ok(e.decalage && e.decalage.n === 2 && /2 j de décalage sur ton planning/.test(e.decalage.texte) && !e.decalage.alerte, 'ligne « 2 j de décalage sur ton planning » (discrète)', e.decalage && e.decalage.texte);
  await b.capture(`seance-decalage-${type}`);
  const jeudi = await seance({ capture: `seance-carte-${type}` });
  b.ok(jeudi.length === 20 && jeudi.every((id) => id.startsWith('c2026-11-17')), 'jeudi : séance à l’écran = 20 cartes de mardi', jeudi.slice(0, 3).join(','));
  await jour('2026-11-20'); s = await b.etat(); e = await b.ecran();
  b.ok(memes(s.revisions, duJour(Object.keys(snap), '2026-11-18')) && e.revisions === 20, 'vendredi = les 20 cartes de mercredi', String(e.revisions));
  await b.noter(s.revisions);
  await jour('2026-11-21'); s = await b.etat(); e = await b.ecran();
  b.ok(memes(s.revisions, duJour(Object.keys(snap), '2026-11-19')) && e.revisions === 20 && s.retard.length === 0, 'samedi = les 20 cartes de jeudi', String(e.revisions));
  b.ok(s.decalage === 2 && e.decalage && e.decalage.n === 2, 'décalage 2 j', String(s.decalage));
  // instantané : aucune carte non révisée modifiée ; journal aux vraies dates
  const apres = await instantane();
  const revues = new Set([...lundi, ...jeudi, ...duJour(Object.keys(snap), '2026-11-18')]);
  const modifiees = Object.keys(snap).filter((id) => !revues.has(id) && JSON.stringify(snap[id]) !== JSON.stringify(apres[id]));
  b.ok(modifiees.length === 0, `aucune dueDate ni état FSRS modifié pour les ${Object.keys(snap).length - revues.size} cartes non révisées`, modifiees.slice(0, 3).join(','));
  const j = await journal();
  const jj = Object.fromEntries(j.map((x) => [x.card, x.jour]));
  b.ok(lundi.every((id) => jj[id] === '2026-11-16') && jeudi.every((id) => jj[id] === '2026-11-19'), 'journal : vraies dates de révision (lundi 16, jeudi 19 — pas les dates décalées)', `${j.length} entrées`);
  b.ok(jeudi.every((id) => apres[id].historique.at(-1).date === '2026-11-19' && apres[id].dueDate > '2026-11-19'), 'FSRS/maison reçoivent la vraie date (historique du 19, prochaine date calculée depuis le 19)');
  resume.s1 = { pauses: s.rec.pauses, decalage: s.decalage, nonModifiees: Object.keys(snap).length - revues.size, journal: j.length };
}

/* ---------- S2 : activation, 100 retards sur 3 jours + 50/jour ---------- */
if (scenario('s2') && !mobile) {
  console.log(`\n== S2 (${b.nom}) activation : 100 retards sur 3 jours + 50/jour`);
  const V = '2026-11-16';
  const cs = [...paquets('2026-11-17', 1, 30, { vue: V }), ...paquets('2026-11-18', 1, 30, { vue: V }), ...paquets('2026-11-19', 1, 40, { vue: V }), ...paquets('2026-11-20', 10, 50, { vue: V })];
  await preparer(cs, '2026-11-20');
  let e = await b.ecran();
  b.ok(e.retard === 100 && e.revisions === 50, 'avant : Retard 100, Révisions 50', JSON.stringify(e));
  const act = await activer({ choisir: '2026-11-19', capture: `activation-${type}` });
  const av = act.avant;
  b.ok(/17 novembre/.test(av.phrase) && /3 j de décalage/.test(av.phrase) && av.actif === '2026-11-17', 'date proposée = plus vieux retard (mardi 17 novembre) → 3 j de décalage', av.phrase);
  b.ok(av.jours.join() === '2026-11-17,2026-11-18,2026-11-19,2026-11-20', 'choix possibles : du 17 à aujourd’hui', av.jours.join());
  const attendu = [[0, 30], [0, 30], [0, 40], [0, 50], [0, 50], [0, 50], [0, 50]];
  b.ok(JSON.stringify(av.lignes.map((l) => [l.retard, l.revisions])) === JSON.stringify(attendu) && av.lignes.every((l) => l.total === l.retard + l.revisions), 'aperçu exact (17 → 30, 18 → 30, 19 → 40, puis 50/jour)', JSON.stringify(av.lignes.map((l) => l.total)));
  const ap = act.apres;
  b.ok(ap && JSON.stringify(ap.lignes.map((l) => [l.retard, l.revisions])) === JSON.stringify([[60, 40], [0, 50], [0, 50], [0, 50], [0, 50], [0, 50], [0, 50]]), 'date plus récente (19) : aperçu mis à jour en direct, 60 retards gardés', ap && JSON.stringify(ap.lignes.slice(0, 2)));
  b.ok(ap && /1 jour en pause/.test(ap.choix) && /plus anciens restent en Retard/.test(ap.choix), 'phrase du choix', ap && ap.choix);
  e = await b.ecran(); const s = await b.etat();
  b.ok(e.retard === 60 && e.revisions === 40 && s.retard.every((id) => id < 'c2026-11-19') && s.revisions.every((id) => id.startsWith('c2026-11-19')), 'après « Activer » : Retard 60 (17 et 18), Révisions 40 (19)', JSON.stringify(e));
  b.ok(s.rec.pauses.join() === '2026-11-19' && e.decalage && e.decalage.n === 1, 'jour en pause écrit : le 19 ; décalage 1 j', s.rec.pauses.join());
  resume.s2 = { proposee: av.actif, apercu: av.lignes, apresChoix: ap && ap.lignes, ecran: e };
}

/* ---------- S3 : « À revoir » pendant le mode : lendemain réel ---------- */
if (scenario('s3')) {
  console.log(`\n== S3 (${b.nom}) carte notée « À revoir » pendant le mode`);
  const V = '2026-11-16';
  await preparer([...paquets('2026-11-17', 1, 5, { vue: V }), ...paquets('2026-11-20', 6, 5, { vue: V })], '2026-11-20');
  await activer();
  let s = await b.etat();
  const vues = await seance({ notes: (id, k) => (k === 0 ? 1 : 3), max: 1 });
  const cible = vues[0];
  b.ok(!!cible && s.revisions.includes(cible), '« À revoir » donné à l’écran (première carte de la séance)', cible);
  s = await b.etat();
  const c = (await instantane())[cible];
  b.ok(c.dueDate === '2026-11-21', 'dueDate réelle = demain (21)', c.dueDate);
  await jour('2026-11-21'); s = await b.etat();
  b.ok(s.rec.pauses.includes('2026-11-20') && s.revisions.includes(cible), 'le lendemain RÉEL, elle est là (même si le 20 est mis en pause)', s.rec.pauses.join());
  resume.s3 = { cible, dueDate: c.dueDate, pauses: s.rec.pauses };
}

/* ---------- S4 : deux trous (2 j puis 3 j) : 5 j, alerte orange, ordre ---------- */
if (scenario('s4')) {
  console.log(`\n== S4 (${b.nom}) deux trous successifs`);
  await preparer(paquets('2026-11-16', 20, 10, { vue: '2026-11-15' }), '2026-11-16');
  await activer();
  const ids = Object.keys(await instantane());
  await b.noter((await b.etat()).revisions);
  await jour('2026-11-19'); await b.noter((await b.etat()).revisions); // trou 17-18
  await jour('2026-11-20'); await b.noter((await b.etat()).revisions);
  await jour('2026-11-24'); // trou 21-22-23
  const s = await b.etat(); const e = await b.ecran();
  b.ok(s.decalage === 5 && e.decalage && e.decalage.n === 5, 'décalage 5 j', s.rec.pauses.join());
  b.ok(e.decalage && e.decalage.alerte && /Pense à rattraper avant les examens/.test(e.decalage.texte), 'alerte orange « Pense à rattraper avant les examens »', e.decalage && `${e.decalage.texte} (${e.decalage.couleur})`);
  b.ok(memes(s.revisions, duJour(ids, '2026-11-19')) && s.retard.length === 0, 'ordre : mardi 24 = les cartes du jeudi 19', String(s.revisions.length));
  await b.capture(`alerte-${type}`);
  await b.noter(s.revisions);
  await jour('2026-11-25');
  b.ok(memes((await b.etat()).revisions, duJour(ids, '2026-11-20')), 'mercredi 25 = les cartes du vendredi 20');
  resume.s4 = { pauses: s.rec.pauses, decalage: s.decalage, couleur: e.decalage && e.decalage.couleur };
}

/* ---------- S5 : journée à moitié faite ---------- */
if (scenario('s5')) {
  console.log(`\n== S5 (${b.nom}) journée à moitié faite`);
  await preparer(paquets('2026-11-16', 10, 20, { vue: '2026-11-15' }), '2026-11-16');
  await activer();
  const vues = await seance({ max: 10 });
  b.ok(vues.length === 10, 'lundi : 10 cartes sur 20 faites à l’écran');
  await jour('2026-11-17');
  const s = await b.etat();
  const restes = s.revisions;
  b.ok(s.rec.pauses.includes('2026-11-16') && restes.length === 10 && restes.every((id) => id.startsWith('c2026-11-16') && !vues.includes(id)), 'mardi : le lundi est mis en pause, les 10 restantes arrivent', s.rec.pauses.join());
  const seq = await seance({ max: 3 });
  b.ok(seq.every((id) => restes.includes(id)), 'elles passent en premier', seq.join(','));
  resume.s5 = { restes: restes.length };
}

/* ---------- S6 : « Faire le paquet suivant » ---------- */
if (scenario('s6')) {
  console.log(`\n== S6 (${b.nom}) « Faire le paquet suivant »`);
  await preparer([...paquets('2026-11-17', 10, 6, { vue: '2026-11-16' }), ...nouvelles(4)], '2026-11-20');
  await activer();
  let e = await b.ecran();
  b.ok(!e.paquet && e.decalage && e.decalage.n === 3, 'pas de bouton tant qu’il reste des révisions ; décalage 3 j', JSON.stringify(e));
  await seance({ notes: {}, max: (await b.etat()).revisions.length });
  e = await b.ecran();
  b.ok(e.paquet && e.revisions === 0 && e.retard === 0, 'Retard + Révisions finies, décalage > 0 : le bouton apparaît (les Nouvelles restent)', JSON.stringify(e));
  await b.capture(`paquet-suivant-${type}`);
  await b.clic(`document.querySelector('[data-sfa="paquet-suivant"]')`, 1500);
  await b.attendre(`(() => { const d = document.querySelector('[data-sfa="decalage"]'); return d && d.dataset.n === '2'; })()`, 6000);
  e = await b.ecran(); const s = await b.etat();
  b.ok(e.decalage && e.decalage.n === 2 && e.revisions === 6 && s.revisions.every((id) => id.startsWith('c2026-11-18')) && !e.paquet, 'après le clic : décalage 2 j, les 6 cartes du jour suivant apparaissent', JSON.stringify(e));
  resume.s6 = { decalageAvant: 3, decalageApres: e.decalage && e.decalage.n, revisions: e.revisions };
}

/* ---------- S8 : désactivation ---------- */
if (scenario('s8') && !mobile) {
  console.log(`\n== S8 (${b.nom}) désactivation`);
  const V = '2026-11-16';
  await preparer([...paquets('2026-11-17', 3, 10, { vue: V }), ...paquets('2026-11-20', 5, 10, { vue: V })], '2026-11-20');
  const sans = await b.ecran();
  await activer();
  const avec = await b.ecran();
  await versReglages();
  await b.clic(`document.querySelector('[data-fa="reglage"] .switch')`, 600);
  const txt = await b.ev(`(document.querySelector('[data-fa="confirmer-desactivation"]') || {}).innerText || ''`);
  await b.capture(`desactivation-${type}`);
  const n = Number((txt.match(/(\d+)/) || [])[1]);
  b.ok(n === 30 && /vont repasser en retard\. Désactiver \?/.test(txt), '« 30 cartes vont repasser en retard. Désactiver ? »', txt);
  await b.ev(`(() => { const x = [...document.querySelectorAll('.day-pop-foot button')].find((e) => /Désactiver/.test(e.innerText)); x && x.click(); return 1; })()`);
  await dormir(1500);
  await versSeance();
  const apres = await b.ecran(); const s = await b.etat();
  b.ok(apres.retard === sans.retard && apres.revisions === sans.revisions && apres.retard - avec.retard === n && !apres.decalage, 'retour au comportement actuel : mêmes compteurs qu’avant l’activation, écart = nombre annoncé', `${JSON.stringify(sans)} → ${JSON.stringify(avec)} → ${JSON.stringify(apres)}`);
  b.ok(s.rec && s.rec.actif === false && s.rec.pauses.length === 0, 'liste des jours en pause vidée');
  resume.s8 = { annonce: n, sans, avec, apres };
}

/* ---------- non-régression : Nouvelles, max par type ---------- */
if (scenario('nr')) {
  console.log(`\n== Non-régression (${b.nom}) Nouvelles, max par type, mode actif`);
  await preparer([...paquets('2026-11-17', 6, 12, { vue: '2026-11-16' }), ...nouvelles(6)], '2026-11-20');
  await activer();
  // max par type : Révisions max 5
  await b.ev(`(() => { const s = document.querySelector('[data-cat="revisions"] .sfa-max'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, '5'); s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
  await dormir(500);
  const tot = await b.ev(`document.querySelector('[data-sfa="total"]').innerText`);
  b.ok(/^11 cartes/.test(tot), 'max par type : Révisions max 5 (sur 12) + Nouvelles max 10 (6 disponibles) → 11 cartes', tot);
  // séance : 5 révisions puis les Nouvelles → Garder / Passer
  await b.clic(`document.querySelector('[data-sfa="demarrer"]')`, 1200);
  let nRev = 0;
  for (let k = 0; k < 5; k++) { await b.clic(`document.querySelector('.sfc-carte[data-carte]')`, 300); await b.clic(`document.querySelector('[data-note="3"]')`, 500); nRev++; }
  await b.clic(`document.querySelector('.sfc-carte[data-carte]')`, 400);
  const nouvelleId = await b.ev(`(document.querySelector('.sfc-carte[data-carte]') || {}).dataset?.carte`);
  const boutons = await b.ev(`[...document.querySelectorAll('[data-nouvelle]')].map((x) => x.dataset.nouvelle)`);
  b.ok(String(nouvelleId).startsWith('nv-') && boutons.join() === 'garder,passer', 'Nouvelles : « Garder en nouvelle / Passer en révision » inchangés', `${nouvelleId} ${boutons.join()}`);
  await b.clic(`document.querySelector('[data-nouvelle="garder"]')`, 600);
  await b.clic(`document.querySelector('.sfc-carte[data-carte]')`, 400);
  const passee = await b.ev(`(document.querySelector('.sfc-carte[data-carte]') || {}).dataset?.carte`);
  await b.clic(`document.querySelector('[data-nouvelle="passer"]')`, 800);
  const db = await instantane();
  b.ok(db[nouvelleId].nouvelle !== false && db[passee].nouvelle === false && db[passee].dueDate === '2026-11-21' && db[passee].j0Date === '2026-11-20', 'Garder : inchangée ; Passer : J0 aujourd’hui, due demain (réel)', `${db[passee].j0Date} → ${db[passee].dueDate}`);
  await b.ev(`(() => { const t = [...document.querySelectorAll('button')].find((x) => /Quitter|Fermer/.test(x.title || '') || /^Terminer$/.test(x.innerText.trim())); t && t.click(); return 1; })()`);
  await dormir(800);
  resume.nr = { total: tot, nouvelleId, passee };
}

const echecs = b.fin();
fs.mkdirSync(new URL('./resultats/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL(`./resultats/scenarios-${type}${seul ? '-' + seul : ''}.json`, import.meta.url), JSON.stringify({ type, resultats: b.resultats, resume }, null, 1));
process.exitCode = echecs;
b.fermerWs();
