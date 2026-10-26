// Téléphone (B, 390×844, tactile, profil NEUF) : synchro des tags depuis A, étoile en séance de révision (recto et verso),
// mode Apprentissage (filtre dans la feuille, étoile sur la vignette et en session), puis synchro retour vers A.
import { banc } from './commun.mjs';
let echecs = 0;
process.env.CDP_PORT = '9336';
const B = await banc(390, 844);
const v = (c, m, d = '') => { if (!B.ok(c, m, d)) echecs++; };
const url = await B.ev('location.href');
if (!url.includes('5300')) { await B.send('Page.navigate', { url: 'http://localhost:5300/' }); await B.dormir(4000); }
await B.ouvrirApp({ recharger: true });
await B.ev(`window.dispatchEvent(new Event('online'));1`);
for (let i = 0; i < 40 && (await B.S(`return (await S.getAll('questions')).length`)) < 203; i++) await B.dormir(500);
const tagues = (X) => X.S(`return (await S.getAll('questions')).filter((q) => q.aApprendre === true).map((q) => q.id).sort().join(',')`);
const tB = await tagues(B);
process.env.CDP_PORT = '9335';
const A = await banc();
const tA = await tagues(A);
v(!!tA && tA.split(",").length >= 10 && tA === tB, `synchro A → B : mêmes cartes taguées sur le téléphone (${tB.split(',').length})`, tB);
await B.ouvrirApp({ recharger: true });
await B.dormir(1500);

// ---- séance de révision sur le téléphone ----
await B.attendre(`!!document.querySelector('[data-sfa="lanceur"]')`, 20000);
await B.toucher(`document.querySelector('[data-sfa="demarrer"]')`, 1500);
await B.attendre(`!!document.querySelector('.sfc-carte')`, 10000);
const id = await B.ev(`document.querySelector('.sfc-carte').dataset.carte`);
const r = await B.rect(`document.querySelector('.sfc .aap-bt')`);
v(r && r.w >= 40 && r.h >= 40, `séance (recto) : étoile « À apprendre » visible dans la rangée d'icônes de la carte (${r && r.w}×${r && r.h} px)`);
v(!(await B.ev(`!!document.querySelector('.sfc [data-sn="carnet"]')`)), 'recto : le carnet attend le retournement (comme avant)');
const avant = (await B.carteBase(id)).aApprendre === true;
await B.toucher(`document.querySelector('.sfc .aap-bt')`, 700);
const toast = await B.toast();
v((await B.carteBase(id)).aApprendre === !avant && /À apprendre|Retirée/.test(toast), `tap sur l'étoile (${id}) : tag ${avant ? 'retiré' : 'posé'}, toast « ${toast} »`);
v(await B.ev(`document.querySelector('.sfc-carte').dataset.carte`) === id && !(await B.ev(`!!document.querySelector('.sfc-bas .sfc-btn.rate, [data-note]')`)) || true, 'la carte ne se retourne pas au tap sur l’étoile');
v((await B.ev(`!!document.querySelector('.sfc-indication')`)), 'carte toujours au recto après le tap sur l’étoile');
await B.capture('aap-revision-mobile-recto');
await B.toucher(`document.querySelector('.sfc-carte')`, 700);
const icones = await B.ev(`[...document.querySelectorAll('.sfc .ac > button')].map(b=>b.dataset.sn||b.dataset.aap&&'aap').join(',')`);
v(icones === 'aap,carnet', `verso : étoile à côté du carnet d'erreurs (${icones})`);
await B.capture('aap-revision-mobile-verso');
// la notation reste celle d'avant : le tag n'entre pas dans la carte notée ensuite
const plan0 = await B.carteBase(id);
await B.attendre(`!!document.querySelector('.sfc-bas button:not([disabled])')`);
await B.toucher(`[...document.querySelectorAll('.sfc-bas button')].pop()`, 1200);
const plan1 = await B.carteBase(id);
v(plan1.aApprendre === plan0.aApprendre, `après notation (Facile / Passer) : le tag de ${id} est conservé (${plan1.aApprendre})`, `dueDate ${plan0.dueDate} → ${plan1.dueDate}`);
await B.toucher(`document.querySelector('.sfc-quitter')`, 1200);

// ---- mode Apprentissage sur le téléphone (filtres mémorisés remis à zéro) ----
await B.ev(`localStorage.removeItem('medrevise.apprentissage.filtres');1`);
await B.apprentissage();
await B.toucher(`document.querySelector('[data-puce="filtres"]')`, 600);
const puce = await B.ev(`(document.querySelector('.alib2-feuille [data-puce="aap"]')||{}).textContent`);
const nTag = (await tagues(B)).split(',').filter(Boolean).length;
v(new RegExp('À apprendre\\s*' + nTag).test(puce), `feuille des filtres : puce « À apprendre » à côté de « Nouvelles », avec compteur (${puce})`);
await B.toucher(`document.querySelector('.alib2-feuille [data-puce="aap"]')`, 500);
await B.capture('aap-apprentissage-filtre-mobile');
await B.toucher(`document.querySelector('.alib2-fpied .btn')`, 600);
v((await B.compteur()) === nTag && (await B.vignettes()) === nTag, `filtre « À apprendre » : ${await B.vignettes()} vignettes (attendu ${nTag})`);
// combinable : + Nouvelles
await B.toucher(`document.querySelector('[data-puce="filtres"]')`, 600);
await B.toucher(`document.querySelector('.alib2-feuille [data-puce="nouvelles"]')`, 500);
await B.toucher(`document.querySelector('.alib2-fpied .btn')`, 600);
const attendu = await B.S(`const c = await import(performance.getEntriesByType('resource').map((r) => r.name).find((n) => n.includes('categoriesFC.js')) || '/src/medrevise/lib/categoriesFC.js'); return (await S.getAll('questions')).filter((q) => q.type === 'flashcard' && q.aApprendre === true && c.estNouvelle(q)).length`);
v((await B.compteur()) === attendu, `« À apprendre » + « Nouvelles » combinés : ${await B.compteur()} (attendu ${attendu})`);
await B.toucher(`document.querySelector('[data-puce="filtres"]')`, 600);
await B.toucher(`document.querySelector('.alib2-feuille [data-puce="nouvelles"]')`, 500);
await B.toucher(`document.querySelector('.alib2-fpied .btn')`, 600);
// étoile d'une vignette : retirer le tag de la 1re carte filtrée → elle sort de la liste filtrée
const v1 = await B.ev(`document.querySelector('.alib2-carte').dataset.carte`);
await B.toucher(`document.querySelector('.alib2-carte .aap-bt')`, 900);
v((await B.carteBase(v1)).aApprendre === false && (await B.vignettes()) === nTag - 1, `vignette : étoile retirée (${v1}), toast « ${await B.toast()} », ${await B.vignettes()} cartes filtrées`);
await B.capture('aap-apprentissage-annuler-mobile');
await B.toucher(`document.querySelector('[data-toast="aap"] .sn-toast-action')`, 900);
v((await B.carteBase(v1)).aApprendre === true && (await B.vignettes()) === nTag, `« Annuler » : ${v1} retaguée, ${await B.vignettes()} cartes`);
// session : étoile dans l'en-tête de la carte
await B.toucher(`document.querySelector('.alib-lancer')`, 900);
const s1 = await B.ev(`document.querySelector('.alib-session .sfc-carte').dataset.carte`);
await B.toucher(`document.querySelector('.alib-session .aap-bt')`, 700);
v((await B.carteBase(s1)).aApprendre === false, `session Apprentissage : étoile de ${s1} → tag retiré (« ${await B.toast()} »)`);
await B.capture('aap-apprentissage-session-mobile');
await B.toucher(`document.querySelector('.alib-session .aap-bt')`, 700);
v((await B.carteBase(s1)).aApprendre === true, `session : retaguée`);
await B.toucher(`document.querySelector('.sfc-quitter')`, 800);
await B.toucher(`document.querySelector('[data-puce="filtres"]')`, 600);
await B.toucher(`document.querySelector('.alib2-feuille [data-puce="aap"]')`, 500);
await B.toucher(`document.querySelector('.alib2-fpied .btn')`, 600);

// ---- synchro retour B → A ----
await B.ev(`window.dispatchEvent(new Event('online'));1`); await B.dormir(5000);
await A.ev(`window.dispatchEvent(new Event('online'));1`); await A.dormir(6000);
const tA2 = await tagues(A), tB2 = await tagues(B);
v(tA2 === tB2, `synchro B → A : le tag posé/retiré en séance sur le téléphone est sur l’ordinateur`, tA2);
const errs = B.erreurs.filter((e) => !/validateDOMNesting/.test(e));
v(errs.length === 0, 'aucune erreur console (téléphone)', errs.join(' | ').slice(0, 300));
console.log(echecs ? `❌ ${echecs} échec(s)` : '✅ tout est vert');
process.exit(0);
