// Séance : « Passer → » / « ← Précédente » / renotation — scénarios du cahier des charges, À L'ÉCRAN (vrais clics,
// vrais touchers, vraies touches ← →). node t-seance.mjs ordi|tablette|tel  (installation : commun.mjs)
// Profil vidé, horloge simulée au 20/11/2026 10:00, 8 cartes de test (2 en retard, 4 révisions, 2 nouvelles).
import fs from 'node:fs';
import { appareil, jeu, ajouterJours, dormir } from './commun.mjs';

const type = process.argv[2] || 'ordi';
const b = await appareil(type);
const mobile = type === 'tel';
const souris = type === 'ordi';
const J = '2026-11-20';
const chiffres = {};
const sans = (c, ...k) => { if (!c) return c; const o = { ...c }; for (const x of k) delete o[x]; return o; };
const egal = (a, c) => JSON.stringify(a) === JSON.stringify(c);

await b.vider();
await b.horloge(J, '10:00');
await b.semer(jeu(J));
await b.ev(`(async () => { const S = await __imp('/src/medrevise/lib/storage.js'); await S.setMeta('seanceFC.choix', { nouvelles: { coche: true, max: 'tout' }, revisions: { coche: true, max: 'tout' }, retard: { coche: true, max: 'tout' }, parCours: false }); await S.setMeta('seanceFC', null); return 1; })()`);
await b.ouvrir();
const versLanceur = async () => { if (!mobile) await b.aller('Réviser'); await b.attendre(`!!document.querySelector('[data-sfa="demarrer"]')`, 15000); await dormir(500); };
await versLanceur();
const lanceur0 = await b.ecran();
b.ok(lanceur0.retard === 2 && lanceur0.revisions === 4 && lanceur0.nouvelles === 2, 'lanceur : 2 en retard · 4 révisions · 2 nouvelles', JSON.stringify(lanceur0));
await b.clic(`document.querySelector('[data-sfa="demarrer"]')`, 1500);
await b.attendre(`!!document.querySelector('.sfc-carte')`, 15000);
const S0 = await b.instantane();
const ordre = S0.seance.cartes;
b.ok(ordre.length === 8 && ordre[0] === 'ret-1' && ordre[1] === 'ret-2' && ordre.slice(6).every((id) => id.startsWith('nv-')), 'séance : Retard → Révisions → Nouvelles (8 cartes)', ordre.join(' '));
b.ok(await b.ev(`!!document.querySelector('.sfc-nav [data-nav="passer"]') && document.querySelector('.sfc-nav [data-nav="precedente"]').disabled`), 'boutons « ← Précédente » (désactivé sur la 1re carte) et « Passer → » présents');
const infobulles = await b.ev(`[...document.querySelectorAll('.sfc-nav button')].map((x) => x.title)`);
b.ok(infobulles.length === 2 && infobulles.every((t) => t && /(←|→)/.test(t)), 'infobulle sur chaque bouton (avec son raccourci)', infobulles.join(' | '));
await b.capture('01-carte-courante');

/* 1. PASSER 3 CARTES : aucune écriture */
await b.nav('passer');
if (souris) await b.touche('ArrowRight', 'ArrowRight', 39); else await b.nav('passer');
await b.nav('passer');
const S1 = await b.instantane();
b.ok(S1.seance.idx === 3 && ordre.slice(0, 3).every((id) => S1.seance.actes[id] && S1.seance.actes[id].type === 'skip'), `3 cartes passées${souris ? ' (dont une à la touche →)' : ''} : la séance avance de 3`, `idx ${S1.seance.idx} · ${await b.prog()}`);
b.ok(egal(S1.cartes, S0.cartes), 'passer : aucune carte modifiée (dates, état FSRS : instantané identique)');
b.ok(S1.journal.length === S0.journal.length, 'passer : aucune entrée de journal', `${S0.journal.length} → ${S1.journal.length}`);
b.ok(S1.seance.faites.revisions === 0 && S1.seance.faites.sautees === 3, 'compteurs : 0 vue, 3 passées', JSON.stringify(S1.seance.faites));
chiffres.passer = { journal: [S0.journal.length, S1.journal.length], cartesIdentiques: egal(S1.cartes, S0.cartes) };

/* 2. NOTER « FACILE » PUIS REVENIR ET NOTER « DIFFICILE » */
const c4 = ordre[3];
b.ok((await b.carteAffichee()) === c4, '4e carte affichée', c4);
await b.retourner();
await b.noterBouton(4);
const S2 = await b.instantane();
const E1 = S2.journal.find((e) => e.card_id === c4 && e.rating === 4);
b.ok(!!E1 && S2.journal.length === S0.journal.length + 1, '« Facile » : une entrée au journal', E1 && E1.id);
b.ok((await b.vues(c4)) === 1, 'compteur de vues : 1 après « Facile »');
await b.nav('precedente');
b.ok((await b.carteAffichee()) === c4 && (await b.prog()) === '4 / 8', '« ← Précédente » : la carte notée revient', await b.prog());
b.ok(await b.ev(`!!document.querySelector('.sfc-notes [data-note="4"][data-choisi]')`), 'sa note d’avant (« Facile ») est signalée');
await b.capture('02-carte-precedente');
// revenir sans rien toucher : ← (carte passée) puis Suivante ×2 → aucune écriture
const avantRevue = await b.instantane();
if (souris) await b.touche('ArrowLeft', 'ArrowLeft', 37); else await b.nav('precedente');
b.ok((await b.carteAffichee()) === ordre[2] && await b.ev(`/Passée sans note/.test((document.querySelector('[data-nav-info]') || {}).textContent || '')`), `${souris ? 'touche ← : ' : ''}la carte passée (3e) revient, signalée « passée sans note »`);
await b.capture('03-carte-passee');
await b.nav('suivante');
if (souris) await b.touche('ArrowRight', 'ArrowRight', 39); else await b.nav('suivante');
b.ok((await b.carteAffichee()) === ordre[4] && (await b.prog()) === '5 / 8', '« Suivante → » ×2 : retour là où j’en étais (5e carte)', await b.prog());
const apresRevue = await b.instantane();
b.ok(egal(apresRevue.cartes, avantRevue.cartes) && apresRevue.journal.length === avantRevue.journal.length, 'revenir sans rien toucher : aucune écriture (cartes et journal identiques)');
chiffres.revoir = { cartesIdentiques: egal(apresRevue.cartes, avantRevue.cartes), journal: [avantRevue.journal.length, apresRevue.journal.length] };
// renoter « Difficile »
await b.nav('precedente');
await b.noterBouton(2);
const S3 = await b.instantane();
const annul = S3.journal.find((e) => e.details && e.details.evenement === 'annulation' && e.details.annule === (E1 && E1.id));
const E2 = S3.journal.find((e) => e.card_id === c4 && e.rating === 2);
b.ok(!!annul && annul.rating === null && annul.card_id === c4, 'renotation : entrée d’annulation (rating null) qui référence la ligne « Facile »', annul && annul.id);
b.ok(!!E2 && E2.reviewed_at === E1.reviewed_at, 'nouvelle note « Difficile » à l’heure de la notation d’origine', E2 && E2.reviewed_at);
b.ok(egal(S3.journal.find((e) => e.id === E1.id), E1) && S3.journal.length === S2.journal.length + 2, 'journal en ajout seul : la ligne « Facile » est intacte, +2 entrées');
const attendu = await b.ev(`(async () => { const N = await __imp('/src/medrevise/scheduler/noter.js'); const S = await __imp('/src/medrevise/lib/storage.js');
  const r = N.noterFlashcard(${JSON.stringify(S0.cartes[c4])}, 2, { reglages: await S.getReglagesFC(), maintenant: new Date(${JSON.stringify(E1.reviewed_at)}) }).carte;
  return { dueDate: r.dueDate, fsrs: r.fsrs, intervalDays: r.intervalDays, historique: r.historique }; })()`);
const obtenu = S3.cartes[c4];
const memeFSRS = egal(attendu.fsrs, obtenu.fsrs);
b.ok(obtenu.dueDate === attendu.dueDate && memeFSRS && obtenu.intervalDays === attendu.intervalDays && egal(obtenu.historique, attendu.historique),
  'carte renotée ≡ carte notée directement « Difficile » au même moment (dueDate, état FSRS, intervalle, historique)', `due ${obtenu.dueDate} / attendu ${attendu.dueDate} · FSRS due ${obtenu.fsrs && obtenu.fsrs.due} / ${attendu.fsrs && attendu.fsrs.due}`);
b.ok((await b.vues(c4)) === 1, 'compteur de vues : toujours 1 (la notation annulée ne compte pas)');
b.ok((await b.carteAffichee()) === ordre[4], 'après la renotation : retour à la carte où j’en étais');
chiffres.renoter = { dueFacile: S2.cartes[c4].dueDate, dueRenotee: obtenu.dueDate, dueAttendue: attendu.dueDate, fsrsIdentique: memeFSRS, vues: await b.vues(c4) };

/* 3. CARTE PASSÉE RETROUVÉE PUIS NOTÉE */
await b.nav('precedente'); await b.nav('precedente');
b.ok((await b.carteAffichee()) === ordre[2], 'carte passée retrouvée (3e)');
await b.retourner();
await b.noterBouton(3);
const S4 = await b.instantane();
b.ok(S4.journal.some((e) => e.card_id === ordre[2] && e.rating === 3) && S4.seance.actes[ordre[2]].type === 'note' && S4.cartes[ordre[2]].dueDate !== S0.cartes[ordre[2]].dueDate, 'une carte passée puis retrouvée se note normalement (« Correct »)');
b.ok((await b.carteAffichee()) === c4, 'puis la carte suivante (la 4e, déjà faite) s’affiche');

/* 4. REVENIR ET METTRE EN APPRENTISSAGE = DEPUIS LA CARTE COURANTE */
const avantAap = (await b.instantane()).cartes;
await b.clic(`document.querySelector('.sfc-carte-cadre .aap-bt')`, 900);
const apresAapPrec = (await b.instantane()).cartes;
await b.nav('suivante');
const c5 = ordre[4];
await b.clic(`document.querySelector('.sfc-carte-cadre .aap-bt')`, 900);
const apresAapCour = (await b.instantane()).cartes;
const diff = (a, c) => [...new Set([...Object.keys(a), ...Object.keys(c)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(c[k])).sort();
const dPrec = diff(avantAap[c4], apresAapPrec[c4]), dCour = diff(avantAap[c5], apresAapCour[c5]);
b.ok(apresAapPrec[c4].aApprendre === true && apresAapCour[c5].aApprendre === true && egal(dPrec, dCour), '« À apprendre » sur une carte précédente = même effet que sur la carte courante', `champs : ${dPrec.join(',')} | ${dCour.join(',')}`);
b.ok(egal(sans(apresAapPrec[c4], ...dPrec), sans(avantAap[c4], ...dPrec)), '« À apprendre » ne touche ni la date ni l’état FSRS de la carte précédente');

/* 5. FIN DES RÉVISIONS, PUIS LES NOUVELLES */
for (let k = 0; k < 6; k++) {
  const id = await b.carteAffichee();
  if (!id || id.startsWith('nv-')) break;
  await b.retourner(); await b.noterBouton(3);
}
const nv = ordre[6];
b.ok((await b.carteAffichee()) === nv, 'première Nouvelle affichée', nv);
await b.retourner();
await b.clic(`document.querySelector('[data-nouvelle="passer"]')`, 1200);
const S5 = await b.instantane();
const P1 = S5.journal.find((e) => e.card_id === nv && e.details && e.details.evenement === 'passage_revision');
b.ok(!!P1 && S5.cartes[nv].nouvelle === false, '« Passer en révision » : carte sortie des Nouvelles, événement journalisé');
await b.nav('precedente');
b.ok(await b.ev(`!!document.querySelector('[data-nouvelle="passer"].choisi')`) && await b.ev(`!document.querySelector('.sfc-notes.quatre')`), 'retour sur la Nouvelle : ses 2 boutons, son choix d’avant signalé');
await b.capture('04-nouvelle-precedente');
await b.clic(`document.querySelector('[data-nouvelle="garder"]')`, 1200);
const S6 = await b.instantane();
const annulP = S6.journal.find((e) => e.details && e.details.evenement === 'annulation' && e.details.annule === P1.id);
b.ok(!!annulP && egal(sans(S6.cartes[nv], 'updatedAt'), sans(S0.cartes[nv], 'updatedAt')), 'changé en « Garder en nouvelle » : carte exactement comme avant, passage annulé au journal');
await b.nav('precedente');
await b.clic(`document.querySelector('[data-nouvelle="passer"]')`, 1200);
const S7 = await b.instantane();
const P2 = S7.journal.filter((e) => e.card_id === nv && e.details && e.details.evenement === 'passage_revision' && e.id !== P1.id).pop();
b.ok(!!P2 && P2.reviewed_at === P1.reviewed_at && S7.cartes[nv].nouvelle === false && S7.cartes[nv].dueDate === S5.cartes[nv].dueDate, 'puis de nouveau « Passer en révision » : même résultat qu’au premier passage (heure d’origine)');
await b.retourner();
await b.clic(`document.querySelector('[data-nouvelle="garder"]')`, 1200); // nv-2 : gardée
b.ok(await b.attendre(`!!document.querySelector('.sfc-synthese')`, 5000), 'fin de séance');
const S8 = await b.instantane();
const recompte = Object.values(S8.seance.actes).reduce((o, a) => { o[a.type] = (o[a.type] || 0) + 1; return o; }, {});
const f = S8.seance.faites;
b.ok(f.revisions === 6 && f.notees === 4 && f.passees === 1 && f.gardees === 1 && f.sautees === 2 && recompte.skip === 2 && recompte.note === 4,
  'synthèse juste : 6 vues (4 notées, 1 passée en révision, 1 gardée), 2 passées sans note', JSON.stringify(f));
const synth = await b.ev(`document.querySelector('.sfc-chiffres').innerText.replace(/\\s+/g, ' ')`);
b.ok(/6 cartes vues/.test(synth) && /2 passées sans note/.test(synth), 'écran de fin : « 6 cartes vues » · « 2 passées sans note »', synth);
await b.capture('05-fin');
await b.nav('precedente');
b.ok((await b.carteAffichee()) === ordre[7], '« ← Précédente » depuis l’écran de fin : la dernière carte');
await b.nav('suivante');
b.ok(await b.ev(`!!document.querySelector('.sfc-synthese')`), '« Suivante → » : de nouveau l’écran de fin');
const vuesTotal = {}; for (const id of ordre) vuesTotal[id] = await b.vues(id);
b.ok([2, 3, 4, 5].every((k) => vuesTotal[ordre[k]] === 1) && vuesTotal[ordre[0]] === 0 && vuesTotal[ordre[1]] === 0 && vuesTotal[nv] === 0 && vuesTotal[ordre[7]] === 0, 'compteur de vues : 1 par carte notée (renotée comprise), 0 pour les passées et les Nouvelles', JSON.stringify(vuesTotal));
chiffres.vues = vuesTotal;

/* 6. COMPTEURS DU LANCEUR, SÉANCE SUIVANTE, LENDEMAIN */
await b.clic(`document.querySelector('.sfc-synthese .sfc-btn.principal')`, 1500);
await versLanceur();
const ecran = await b.ecran(); const calc = await b.etat();
b.ok(ecran.retard === calc.retard.length && ecran.revisions === calc.revisions.length && ecran.nouvelles === calc.nouvelles && calc.retard.includes('ret-1') && calc.retard.includes('ret-2'),
  'lanceur après la séance : compteurs = état réel des cartes ; les 2 cartes passées sont toujours dues (en retard)', JSON.stringify({ ecran, retard: calc.retard, revisions: calc.revisions }));
chiffres.lanceurApres = ecran;
await b.clic(`document.querySelector('[data-sfa="demarrer"]')`, 1500);
await b.attendre(`!!document.querySelector('.sfc-carte')`, 15000);
const suivante = (await b.seance()).cartes;
b.ok(suivante.includes('ret-1') && suivante.includes('ret-2') && suivante.includes(ordre[7]), 'séance suivante : les cartes passées reviennent (et la Nouvelle gardée)', suivante.join(' '));
await b.clic(`document.querySelector('.sfc-quitter')`, 1200);
// synchro : tout part, rien ne reste en attente
await b.ev(`(window.dispatchEvent(new Event('online')), 1)`);
const syncOk = await b.attendre(`(async () => { const E = await __imp('/src/medrevise/lib/etatSynchro.js'); const l = E.enAttenteActuel && E.enAttenteActuel(); return document.documentElement.getAttribute('data-mr-synchro') === 'ajour' && (!l || l.elements.length === 0); })()`, 40000, 500);
const sb = await (await fetch('http://localhost:54399/__etat')).json();
const evtCloud = sb.rows.filter((r) => r.store === 'review_log_evenement' || /review_log_evenement/.test(JSON.stringify(r).slice(0, 200)));
b.ok(syncOk, 'synchro : « à jour », 0 en attente (annulations comprises)', `${evtCloud.length} événement(s) au canal de repli, ${sb.journalRevisions.n} ligne(s) au journal cloud`);
chiffres.synchro = { ajour: syncOk, evenementsRepli: evtCloud.length, journalCloud: sb.journalRevisions.n };
// lendemain : les 2 cartes passées et jamais faites sont en retard
await b.horloge(ajouterJours(J, 1), '10:00');
const demain = await b.etat();
b.ok(demain.retard.includes('ret-1') && demain.retard.includes('ret-2'), 'lendemain (horloge simulée) : les cartes passées non faites sont en retard', demain.retard.join(' '));
chiffres.lendemain = { retard: demain.retard };

fs.mkdirSync(new URL('./resultats/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL(`./resultats/seance-${type}.json`, import.meta.url), JSON.stringify({ resultats: b.resultats, chiffres }, null, 1));
const echecs = b.fin();
b.fermerWs();
process.exit(echecs ? 1 : 0);
