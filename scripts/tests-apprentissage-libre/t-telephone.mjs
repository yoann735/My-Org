// Mode Apprentissage libre (11/10) — SYNCHRO et TÉLÉPHONE. Prérequis : t-bureau.mjs (A = ordinateur, 9335).
// B = téléphone (9336, 390×844, tactile, profil vide) relié au même faux Supabase.
// 1. A pousse la liste ; B la reçoit (accueil : « 5 cartes en apprentissage ») ;
// 2. B : onglet rangé par cours, cibles ≥ 44 px, rien ne déborde ; session plein écran : toucher pour
//    retourner, champs Muscle révélés au toucher, glisser à droite = Su, à gauche = Pas su, texte jamais
//    coupé, fin de session ; cartes et journal de B inchangés ;
// 3. retrait sur B → synchro → l'ordinateur voit la liste à jour.
// Usage : node t-telephone.mjs <dossier-captures>
import { appareil, ok, bilan } from '../tests-collage/outils.mjs';
import { liste, instantane } from './commun.mjs';

const captures = process.argv[2] || '/tmp/alib';
const synchro = async (X) => { await X.ev(`(window.dispatchEvent(new Event('online')), true)`); await X.dormir(4500); };

// 1. A pousse
let A = await appareil(9335, { captures });
await synchro(A);
const faux = await (await fetch('http://localhost:54399/__etat')).json();
const ligne = faux.rows.find((r) => r.store === 'learning_set');
ok(ligne && ligne.data.cardIds.length === 5, '1a. faux cloud : un enregistrement `learning_set` (5 ids), rien d’autre de nouveau', ligne ? JSON.stringify(ligne.data.cardIds) : 'absent');
A.fermer();

const B = await appareil(9336, { captures, largeur: 390, hauteur: 844, tactile: true });
await B.send('Network.enable'); await B.send('Network.setCacheDisabled', { cacheDisabled: true });
await B.send('Page.reload', { ignoreCache: true }); await B.dormir(3000);
const ouvertM = `!!document.querySelector('.mrm-app')`;
if (!(await B.ev(ouvertM))) await B.toucher(await B.pos(`[...document.querySelectorAll('.hub-card')].find((c) => c.textContent.includes('MedRevise'))`));
await B.attendre(ouvertM, 30000); await B.dormir(6000);
await synchro(B);
const entree = await B.ev(`(document.querySelector('.alib-entree') || {}).innerText?.replace(/\\s+/g, ' ').trim() || ''`);
await B.ev(`document.querySelector('.alib-entree').scrollIntoView({ block: 'center' }), 1`); await B.dormir(300);
await B.capture('mobile-accueil');
ok(/5 cartes en apprentissage/.test(entree), '1b. téléphone : la liste arrive par la synchro — accueil « Apprentissage · 5 cartes en apprentissage »', entree);
const avantB = await instantane(B);

// 2. ONGLET sur le téléphone
await B.toucher(await B.pos(`document.querySelector('.alib-entree')`)); await B.dormir(800);
const tailles = (sel) => B.ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].filter((e) => e.getClientRects().length).map((e) => { const r = e.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)); })`);
const deborde = () => B.ev(`document.documentElement.scrollWidth > document.documentElement.clientWidth + 1`);
const cibles = { lancer: await tailles('.alib-lancer'), retirer: await tailles('.alib-retirer'), coursLigne: await tailles('.alib-gtete'), retour: await tailles('.alib-mtete .mrm-icon-btn') };
const groupesB = await B.ev(`[...document.querySelectorAll('.alib-groupe')].map((g) => g.querySelector('.alib-gtitre').innerText + ' (' + g.querySelectorAll('.alib-carte').length + ')')`);
await B.capture('mobile-onglet');
ok(groupesB.length === 2 && Object.values(cibles).flat().every((t) => t >= 40) && cibles.retirer.every((t) => t >= 44) && cibles.lancer[0] >= 44 && !(await deborde()), '2a. onglet sur téléphone : 2 cours, cibles ≥ 44 px, rien ne déborde', JSON.stringify({ groupesB, cibles }));
await B.toucher(await B.pos(`document.querySelector('.alib-groupe[data-cours="fMyo"] .alib-gtete input')`)); await B.dormir(300);
await B.toucher(await B.pos(`document.querySelector('.alib-lancer')`)); await B.dormir(800);
const plein = await B.ev(`(() => { const s = document.querySelector('.alib-session.plein-ecran'); if (!s) return null; const r = s.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), vh: innerHeight, vw: innerWidth }; })()`);
ok(plein && plein.h === plein.vh && plein.w === plein.vw, '2b. session en plein écran (390 × 844)', JSON.stringify(plein));
const courante = () => B.ev(`(document.querySelector('.alib-session .sfc-carte') || {}).dataset?.carte || null`);
const carte = () => B.pos(`document.querySelector('.alib-session .sfc-carte')`);
// toucher la carte = retourner
await B.toucher(await carte()); await B.dormir(500);
const verso = await B.ev(`!!document.querySelector('.alib-notes')`);
const masques = await B.ev(`document.querySelectorAll('.alib-session .mu-ligne.cachee').length`);
await B.toucher(await B.pos(`document.querySelector('.alib-session .mu-ligne.cachee')`)); await B.dormir(400);
const masques2 = await B.ev(`document.querySelectorAll('.alib-session .mu-ligne.cachee').length`);
await B.toucher(await B.pos(`document.querySelector('.alib-session .mu-ligne.cachee')`)); await B.dormir(400);
const ciblesS = { pasSu: await tailles('.alib-passu'), su: await tailles('.alib-su'), skip: await tailles('.alib-skip'), finir: await tailles('.alib-finir'), quitter: await tailles('.alib-session .sfc-quitter') };
// texte jamais coupé : aucun texte tronqué (ellipse ou débordement horizontal masqué) dans la carte
const coupe = () => B.ev(`[...document.querySelectorAll('.alib-session .sfc-carte *, .alib-session .sfc-etiquette *')].filter((e) => e.children.length === 0 && e.textContent.trim() && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible').map((e) => e.textContent.slice(0, 30))`);
const coupes1 = await coupe();
await B.capture('mobile-session-muscle');
ok(verso && masques === 5 && masques2 === 4 && Object.values(ciblesS).flat().every((t) => t >= 44) && !coupes1.length && !(await deborde()),
  '2c. toucher = retourner ; champs Muscle masqués, révélés au toucher (5 → 4) ; boutons ≥ 44 px ; aucun texte coupé', JSON.stringify({ ciblesS, coupes1 }));
// glisser à droite = Su
const glisser = async (dx) => {
  const [x, y] = await carte();
  await B.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - dx / 2, y }] });
  for (let k = 1; k <= 6; k++) { await B.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - dx / 2 + (dx * k) / 6, y: y + k }] }); await B.dormir(16); }
  await B.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await B.dormir(600);
};
const c1 = await courante();
await glisser(200);
const c2 = await courante();
ok(c1 === 'qBiceps' && c2 === 'qCoiffe' && !(await B.ev(`!!document.querySelector('.alib-notes')`)), '2d. glisser à droite au verso = Su : carte suivante (Coiffe), au recto', `${c1} → ${c2}`);
await B.toucher(await carte()); await B.dormir(400);
const coupes2 = await coupe();
await B.capture('mobile-session-texte');
await glisser(-200); // Pas su
const c3 = await courante();
await B.toucher(await carte()); await B.dormir(300);
await glisser(200); // Triceps : Su
const c4 = await courante();
const etiq = await B.ev(`(document.querySelector('.alib-suite') || {}).innerText || ''`);
ok(c3 === 'qTriceps' && c4 === 'qBiceps' && etiq === '1 Su sur 2' && !coupes2.length, '2e. glisser à gauche = Pas su ; Biceps revient avec « 1 Su sur 2 » ; texte de la Coiffe entier', `${c3} → ${c4} · ${etiq}`);
await B.toucher(await carte()); await B.dormir(300);
await glisser(200); // Biceps 2 → sue
const prog = await B.ev(`document.querySelector('.alib-session .sfc-prog').innerText`);
ok(prog === '1 / 3 sues', '2f. 2e « Su » d’affilée (glissé) → Biceps sue', prog);
await B.toucher(await B.pos(`document.querySelector('.alib-finir')`)); await B.dormir(500);
const fin = await B.ev(`document.querySelector('.alib-bilan').innerText`);
const ciblesF = await tailles('.alib-fin .sfc-btn');
await B.capture('mobile-fin');
ok(fin === '3 cartes vues · 1 sue · 2 à retravailler' && ciblesF.every((t) => t >= 44) && !(await deborde()), '2g. fin de session sur téléphone : bilan, boutons ≥ 44 px', `${fin} · ${JSON.stringify(ciblesF)}`);
await B.toucher(await B.pos(`[...document.querySelectorAll('.alib-fin .sfc-btn')].find((b) => b.innerText.trim() === 'Terminer')`)); await B.dormir(500);
const apresB = await instantane(B);
const diffB = ['questions', 'journal', 'calendrier', 'diagnostic'].filter((k) => JSON.stringify(avantB[k]) !== JSON.stringify(apresB[k]));
ok(diffB.length === 0, '2h. téléphone : cartes, journal, calendrier et diagnostic inchangés après la session', diffB.join(', ') || 'aucune différence');

// 3. retrait sur le téléphone → l'ordinateur suit
await B.toucher(await B.pos(`document.querySelector('.alib-carte[data-carte="qCitrate"] .alib-retirer')`)); await B.dormir(500);
ok(!(await liste(B)).includes('qCitrate'), '3a. téléphone : retrait de « citrate synthase » d’un toucher');
await synchro(B);
A = await appareil(9335, { captures });
await synchro(A);
const LA = await liste(A);
const ecranA = await A.ev(`(async () => { const el = [...document.querySelectorAll('.sb-item')].find((b) => (b.getAttribute('title') || '') === 'Apprentissage'); el.click(); await new Promise((r) => setTimeout(r, 800)); return [...document.querySelectorAll('.alib-carte')].map((c) => c.dataset.carte); })()`);
ok(LA.length === 4 && !LA.includes('qCitrate') && !ecranA.includes('qCitrate'), '3b. ordinateur : après synchro, la liste (et l’onglet) n’ont plus que 4 cartes', JSON.stringify(ecranA));
ok(B.erreurs.length === 0 && A.erreurs.length === 0, 'aucune exception JavaScript (téléphone, ordinateur)', [...B.erreurs, ...A.erreurs].join(' | ').slice(0, 300));
await B.send('Emulation.setTouchEmulationEnabled', { enabled: false });
A.fermer(); B.fermer();
process.exit(bilan() ? 1 : 0);
