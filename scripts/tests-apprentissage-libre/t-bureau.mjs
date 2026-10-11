// Mode Apprentissage libre (11/10) — scénario ORDINATEUR (A, port 9335, 1440×900), vrais clics souris.
// Prérequis : lancer.sh (faux Supabase JOURNAL=1, Vite 5199, Chrome headless), puis seed.mjs.
// 0. une vraie réponse dans la séance du jour (le journal des révisions n'est pas vide) ;
// 1. panneau Flashcards : « Mettre en apprentissage » → pastille, bouton qui bascule ; sélection multiple ;
//    5 cartes de 2 cours dont 2 Muscle ;
// 2. INSTANTANÉ AVANT (diagnostic, cartes brutes, journal, calendrier, séance du jour, faux cloud) ;
// 3. onglet Apprentissage : rangées par cours ; session 1 (un cours) : ordre, champs révélés un par un,
//    Su / Pas su / Skip, 2 Su d'affilée = sue, fin ; session 2 (Tout, clavier) : « Finir », bilan,
//    « Retirer les cartes sues » (confirmation) ; retrait manuel d'un clic ;
// 4. INSTANTANÉ APRÈS → strictement identique ; aucune ligne de journal ; séance du jour inchangée.
// Usage : node t-bureau.mjs <dossier-captures> <dossier-preuve>
import { writeFileSync, mkdirSync } from 'node:fs';
import { appareil, ok, bilan } from '../tests-collage/outils.mjs';
import { ouvrirMedRevise, onglet, ouvrirFiche, etatCarte, liste, instantane } from './commun.mjs';

const captures = process.argv[2] || '/tmp/alib';
const preuve = process.argv[3] || '/tmp/alib-preuve';
mkdirSync(preuve, { recursive: true });
const A = await appareil(9335, { captures });
await A.send('Network.enable'); await A.send('Network.setCacheDisabled', { cacheDisabled: true });
await A.send('Page.reload', { ignoreCache: true }); await A.dormir(3000);
await ouvrirMedRevise(A);
const bouton = (txt, dans = 'body') => A.pos(`[...document.querySelectorAll(${JSON.stringify(dans + ' button')})].filter((b) => b.offsetParent !== null && !b.disabled).find((b) => b.innerText.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(txt)}))`);
const texteSeanceDuJour = () => A.ev(`(document.querySelector('.sfa') || {}).innerText?.replace(/\\s+/g, ' ').trim() || ''`);

// 0. SÉANCE DU JOUR : une vraie réponse « Correct » (journal non vide), puis on quitte
await onglet(A, 'Réviser'); await A.dormir(1500);
await A.clic(await A.pos(`document.querySelector('.sfa-btn')`));
await A.attendre(`!!document.querySelector('.sfc-carte')`);
await A.clic(await bouton('Voir la réponse')); await A.dormir(400);
await A.clic(await A.pos(`document.querySelectorAll('.sfc-notes.quatre button')[2]`)); await A.dormir(800);
await A.clic(await A.pos(`document.querySelector('.sfc-quitter')`)); await A.dormir(1200);

// 1. PANNEAU FLASHCARDS — cours Myologie
await ouvrirFiche(A, 'Myologie');
let e = await etatCarte(A, 'qBiceps');
ok(e && !e.pastille && e.bouton === 'Mettre en apprentissage', '1a. carte hors liste : pas de pastille, bouton « Mettre en apprentissage »', JSON.stringify(e));
await A.clic(await A.pos(`document.querySelector('.pis-item[data-item="qBiceps"] .alib-btn-carte')`)); await A.dormir(500);
e = await etatCarte(A, 'qBiceps');
ok(e.pastille && e.bouton === 'Retirer de l’apprentissage' && JSON.stringify(await liste(A)) === '["qBiceps"]', '1b. « Mettre en apprentissage » → pastille, le bouton devient « Retirer de l’apprentissage », liste = [qBiceps]', JSON.stringify(e));
await A.clic(await A.pos(`document.querySelector('.pis-item[data-item="qBiceps"] .alib-btn-carte')`)); await A.dormir(500);
e = await etatCarte(A, 'qBiceps');
ok(!e.pastille && e.bouton === 'Mettre en apprentissage' && (await liste(A)).length === 0, '1c. « Retirer de l’apprentissage » → pastille et liste vidées, le bouton revient', JSON.stringify(e));
await A.clic(await A.pos(`document.querySelector('.pis-item[data-item="qBiceps"] .alib-btn-carte')`)); await A.dormir(500);
// sélection multiple : Triceps (Muscle) + Coiffe
await A.clic(await bouton('Sélectionner', '.pis')); await A.dormir(300);
await A.clic(await A.pos(`document.querySelector('.pis-item[data-item="qTriceps"] .alib-case')`));
await A.clic(await A.pos(`document.querySelector('.pis-item[data-item="qCoiffe"] .alib-case')`));
const libSel = await A.ev(`[...document.querySelectorAll('.alib-selbar button')].map((b) => b.innerText.trim()).join(' | ')`);
await A.ev(`document.querySelector('.alib-selbar').scrollIntoView({ block: 'start' }), 1`); await A.dormir(200);
await A.capture('bureau-selection');
ok(/Mettre les 2 cartes en apprentissage/.test(libSel), '1d. sélection multiple : 2 cases cochées → « Mettre les 2 cartes en apprentissage »', libSel);
await A.clic(await bouton('Mettre les 2 cartes', '.alib-selbar')); await A.dormir(600);
const pastillesMyo = await A.ev(`[...document.querySelectorAll('.pis-item')].filter((c) => c.querySelector('.alib-pastille')).map((c) => c.dataset.item).sort()`);
ok(JSON.stringify(pastillesMyo) === '["qBiceps","qCoiffe","qTriceps"]' && !(await A.ev(`!!document.querySelector('.alib-selbar')`)), '1e. pastilles sur Biceps, Coiffe, Triceps ; la sélection se referme', JSON.stringify(pastillesMyo));
// retrait par sélection (idem pour retirer), puis remise
await A.clic(await bouton('Sélectionner', '.pis')); await A.dormir(300);
await A.clic(await A.pos(`document.querySelector('.pis-item[data-item="qCoiffe"] .alib-case')`));
await A.clic(await A.pos(`document.querySelector('.pis-item[data-item="qHumerus"] .alib-case')`));
const libSel2 = await A.ev(`[...document.querySelectorAll('.alib-selbar button')].map((b) => b.innerText.trim()).join(' | ')`);
ok(/Mettre la carte en apprentissage/.test(libSel2) && /Retirer la carte de l’apprentissage/.test(libSel2), '1f. sélection mixte (une dedans, une dehors) : « Mettre la carte… » et « Retirer la carte… »', libSel2);
await A.clic(await bouton('Retirer la carte', '.alib-selbar')); await A.dormir(600);
ok(!(await etatCarte(A, 'qCoiffe')).pastille && !(await liste(A)).includes('qHumerus'), '1g. « Retirer » par sélection : Coiffe sort, Humérus n’entre pas');
await A.clic(await A.pos(`document.querySelector('.pis-item[data-item="qCoiffe"] .alib-btn-carte')`)); await A.dormir(500);
await A.ev(`document.querySelector('.pis-item[data-item="qBiceps"]').scrollIntoView({ block: 'start' }), 1`); await A.dormir(300);
await A.capture('bureau-fiche-pastilles');
// cours Krebs : sélection de 2 cartes
await ouvrirFiche(A, 'Biochimie');
await A.clic(await bouton('Sélectionner', '.pis')); await A.dormir(300);
await A.clic(await A.pos(`document.querySelector('.pis-item[data-item="qCitrate"] .alib-case')`));
await A.clic(await A.pos(`document.querySelector('.pis-item[data-item="qAKG"] .alib-case')`));
await A.clic(await bouton('Mettre les 2 cartes', '.alib-selbar')); await A.dormir(600);
const L = await liste(A);
ok(L.length === 5 && ['qBiceps', 'qTriceps', 'qCoiffe', 'qCitrate', 'qAKG'].every((x) => L.includes(x)), '1h. 5 cartes de 2 cours en apprentissage, dont 2 Muscle', JSON.stringify(L));

// 2. INSTANTANÉ AVANT
await onglet(A, 'Réviser'); await A.dormir(1200);
const sfaAvant = await texteSeanceDuJour();
const avant = await instantane(A);
writeFileSync(`${preuve}/avant.json`, JSON.stringify(avant, null, 2));
ok(avant.journal.length > 0 && avant.diagnostic.cartes.length === 7, `2. instantané AVANT : ${avant.diagnostic.cartes.length} cartes, ${avant.journal.length} entrée(s) de journal, plan du jour ${avant.diagnostic.planDuJour.compteurs.dues}`, sfaAvant);

// 3. ONGLET APPRENTISSAGE
await onglet(A, 'Apprentissage'); await A.dormir(1000);
const groupes = await A.ev(`[...document.querySelectorAll('.alib-groupe')].map((g) => ({ titre: g.querySelector('.alib-gtitre').innerText, n: +g.querySelector('.alib-n').innerText, cartes: [...g.querySelectorAll('.alib-carte')].map((c) => c.dataset.carte) }))`);
ok(groupes.length === 2 && JSON.stringify(groupes.map((g) => g.cartes)) === JSON.stringify([['qAKG', 'qCitrate'], ['qBiceps', 'qCoiffe', 'qTriceps']]) && groupes.every((g) => g.n === g.cartes.length),
  '3a. onglet Apprentissage : rangées par cours (compteur), cartes dans l’ordre de la fiche', JSON.stringify(groupes.map((g) => `${g.titre} (${g.n}) : ${g.cartes.join(', ')}`)));
ok(await A.ev(`!!document.querySelector('.alib-lancer:disabled')`), '3b. rien de coché → « Lancer » désactivé');
await A.clic(await A.pos(`document.querySelector('.alib-groupe[data-cours="fMyo"] .alib-gtete input')`)); await A.dormir(200);
await A.capture('bureau-onglet');
ok(/Lancer\s*\(3\)/.test(await A.ev(`document.querySelector('.alib-lancer').innerText`)), '3c. cours Myologie coché → « Lancer (3) »');
await A.clic(await A.pos(`document.querySelector('.alib-lancer')`)); await A.dormir(600);

// session 1 : Myologie (Biceps, Coiffe, Triceps)
const vues = [];
const courante = () => A.ev(`(document.querySelector('.alib-session .sfc-carte') || {}).dataset?.carte || null`);
const retourner = async () => { await A.clic(await bouton('Voir la réponse', '.alib-session')); await A.dormir(350); };
const noter = async (txt) => { vues.push(await courante()); await A.clic(await A.pos(`[...document.querySelectorAll('.alib-notes button')].find((b) => b.innerText.trim() === ${JSON.stringify(txt)})`)); await A.dormir(350); };
const skip = async () => { vues.push((await courante()) + '(skip)'); await A.clic(await A.pos(`document.querySelector('.alib-skip')`)); await A.dormir(350); };
ok(await courante() === 'qBiceps', '3d. session : première carte = Biceps brachial (ordre conservé)');
await retourner();
const cachees0 = await A.ev(`document.querySelectorAll('.alib-session .mu-ligne.cachee').length`);
await A.clic(await A.pos(`document.querySelector('.alib-session .mu-ligne.cachee')`)); await A.dormir(250);
const cachees1 = await A.ev(`document.querySelectorAll('.alib-session .mu-ligne.cachee').length`);
await A.clic(await A.pos(`document.querySelectorAll('.alib-session .mu-ligne.cachee')[1]`)); await A.dormir(250);
const cachees2 = await A.ev(`document.querySelectorAll('.alib-session .mu-ligne.cachee').length`);
const toujoursVerso = await A.ev(`!!document.querySelector('.alib-notes')`);
await A.capture('bureau-session-muscle');
ok(cachees0 === 5 && cachees1 === 4 && cachees2 === 3 && toujoursVerso, `3e. Muscle : au retournement les 5 champs sont masqués, révélés un par un au clic (5 → ${cachees1} → ${cachees2}), la carte reste au verso`);
await noter('Su');                                   // Biceps 1
await retourner(); await noter('Pas su');            // Coiffe 0
await skip();                                        // Triceps → fin de file
const etiq = await A.ev(`(document.querySelector('.alib-suite') || {}).innerText || ''`);
ok(await courante() === 'qBiceps' && etiq === '1 Su sur 2', '3f. Skip : Triceps passe sans être noté ; Biceps revient avec « 1 Su sur 2 »', etiq);
await retourner(); await noter('Pas su');            // Biceps → 0 (remis à zéro)
await retourner(); await noter('Su');                // Coiffe 1
await retourner(); await noter('Su');                // Triceps 1
ok(await courante() === 'qBiceps' && !(await A.ev(`!!document.querySelector('.alib-suite')`)), '3g. « Pas su » remet à zéro : Biceps revient sans « 1 Su sur 2 »');
await retourner(); await noter('Su');                // Biceps 1
await retourner(); await noter('Su');                // Coiffe 2 → sue
const prog = await A.ev(`document.querySelector('.alib-session .sfc-prog').innerText`);
ok(prog === '1 / 3 sues' && await courante() === 'qTriceps', '3h. 2 « Su » d’affilée → Coiffe sue (elle n’est plus présentée) — « 1 / 3 sues »', prog);
await retourner(); await noter('Su');                // Triceps 2 → sue
await retourner(); await noter('Su');                // Biceps 2 → sue → fin
const attendu = ['qBiceps', 'qCoiffe', 'qTriceps(skip)', 'qBiceps', 'qCoiffe', 'qTriceps', 'qBiceps', 'qCoiffe', 'qTriceps', 'qBiceps'];
ok(JSON.stringify(vues) === JSON.stringify(attendu), '3i. ordre de passage exact (réinsertion après les autres, ordre gardé)', vues.join(' → '));
const fin1 = await A.ev(`(document.querySelector('.alib-bilan') || {}).innerText || ''`);
ok(fin1 === '3 cartes vues · 3 sues · 0 à retravailler', '3j. fin de session : « 3 cartes vues · 3 sues · 0 à retravailler »', fin1);
await A.clic(await bouton('Terminer', '.alib-session')); await A.dormir(500);
ok((await liste(A)).length === 5, '3k. « Terminer » sans retirer : les 5 cartes restent dans la liste (sue ≠ retirée)');

// session 2 : Tout, au clavier, puis « Finir »
await A.clic(await A.pos(`document.querySelector('.alib-barre .alib-coche input')`)); await A.dormir(200);
await A.clic(await A.pos(`document.querySelector('.alib-lancer')`)); await A.dormir(600);
const ordre2 = [];
const clavier = async (key, code, vk) => { await A.touche(key, { code, vk }); await A.dormir(300); };
const auClavier = async (su) => { ordre2.push(await courante()); await clavier(' ', 'Space', 32); await clavier(su ? 'ArrowRight' : 'ArrowLeft', su ? 'ArrowRight' : 'ArrowLeft', su ? 39 : 37); };
await auClavier(true);   // AKG 1
await auClavier(false);  // Citrate 0
await auClavier(true);   // Biceps 1
await auClavier(true);   // Coiffe 1
await auClavier(false);  // Triceps 0
await auClavier(true);   // AKG 2 → sue
await auClavier(false);  // Citrate 0
await auClavier(true);   // Biceps 2 → sue
ok(JSON.stringify(ordre2) === JSON.stringify(['qAKG', 'qCitrate', 'qBiceps', 'qCoiffe', 'qTriceps', 'qAKG', 'qCitrate', 'qBiceps']), '3l. session « Tout » : ordre des cours puis des cartes, sans mélange ; Espace / → / ← au clavier', ordre2.join(' → '));
await A.clic(await bouton('Finir', '.alib-session')); await A.dormir(400);
const fin2 = await A.ev(`document.querySelector('.alib-bilan').innerText`);
await A.capture('bureau-fin');
ok(fin2 === '5 cartes vues · 2 sues · 3 à retravailler', '3m. « Finir » → « 5 cartes vues · 2 sues · 3 à retravailler »', fin2);
await A.clic(await bouton('Retirer de l’apprentissage les cartes sues', '.alib-session')); await A.dormir(400);
const modale = await A.ev(`(document.querySelector('.day-pop') || {}).innerText?.replace(/\\s+/g, ' ') || ''`);
await A.capture('bureau-fin-confirmation');
ok(/Retirer 2 cartes de l’apprentissage/.test(modale) && (await liste(A)).length === 5, '3n. confirmation demandée avant de retirer (rien retiré tant que je n’ai pas confirmé)', modale.slice(0, 90));
await A.clic(await A.pos(`[...document.querySelectorAll('.day-pop button')].find((b) => b.innerText.trim() === 'Retirer')`)); await A.dormir(600);
const L2 = await liste(A);
ok(L2.length === 3 && !L2.includes('qAKG') && !L2.includes('qBiceps') && /2 cartes retirées/.test(await A.ev(`document.querySelector('.alib-fin').innerText`)), '3o. confirmé : AKG et Biceps quittent la liste (3 restent)', JSON.stringify(L2));
await A.clic(await bouton('Terminer', '.alib-session')); await A.dormir(500);
// retrait manuel d'un clic dans l'onglet
await A.clic(await A.pos(`document.querySelector('.alib-carte[data-carte="qCoiffe"] .alib-retirer')`)); await A.dormir(500);
const L3 = await liste(A);
ok(L3.length === 2 && !L3.includes('qCoiffe') && !(await A.ev(`!!document.querySelector('.alib-carte[data-carte="qCoiffe"]')`)), '3p. retrait manuel d’un clic (×) dans l’onglet : Coiffe sort', JSON.stringify(L3));
// quitter en cours = abandon (rien enregistré)
if (!(await A.ev(`document.querySelector('.alib-barre .alib-coche input').checked`))) { await A.clic(await A.pos(`document.querySelector('.alib-barre .alib-coche input')`)); await A.dormir(200); }
await A.clic(await A.pos(`document.querySelector('.alib-lancer')`)); await A.dormir(500);
await retourner(); await A.clic(await A.pos(`[...document.querySelectorAll('.alib-notes button')].find((b) => b.innerText.trim() === 'Su')`)); await A.dormir(300);
await A.capture('bureau-session');
await A.clic(await A.pos(`document.querySelector('.alib-session .sfc-quitter')`)); await A.dormir(500);
ok(await A.ev(`!!document.querySelector('.alib-barre') && !document.querySelector('.alib-session')`) && (await liste(A)).length === 2, '3q. quitter en cours de session : retour à la liste, rien à reprendre ni enregistré');
// remise des 5 cartes pour la suite (synchro, téléphone)
await A.ev(`(async () => { const s = ${A.st}; await s.put('learning_set', { id: 'learning_set', cardIds: ['qBiceps', 'qTriceps', 'qCoiffe', 'qCitrate', 'qAKG'] }); return 1; })()`);

// 4. INSTANTANÉ APRÈS
await onglet(A, 'Réviser'); await A.dormir(1500);
const sfaApres = await texteSeanceDuJour();
const apres = await instantane(A);
writeFileSync(`${preuve}/apres.json`, JSON.stringify(apres, null, 2));
const diff = [];
for (const k of Object.keys(avant)) if (JSON.stringify(avant[k]) !== JSON.stringify(apres[k])) diff.push(k);
ok(diff.length === 0, '4a. instantané APRÈS strictement identique (diagnostic, cartes brutes, calendrier, journal, file d’envoi, stats, faux cloud)', diff.join(', ') || 'aucune différence');
ok(apres.journal.length === avant.journal.length && apres.cloud.journal.lignes.length === avant.cloud.journal.lignes.length, `4b. aucune ligne ajoutée au journal (local ${avant.journal.length} → ${apres.journal.length}, cloud ${avant.cloud.journal.lignes.length} → ${apres.cloud.journal.lignes.length})`);
ok(sfaAvant === sfaApres && sfaAvant.length > 0, '4c. séance des J du jour inchangée', sfaApres);
ok(A.erreurs.length === 0, 'aucune exception JavaScript', A.erreurs.join(' | ').slice(0, 300));
A.fermer();
process.exit(bilan() ? 1 : 0);
