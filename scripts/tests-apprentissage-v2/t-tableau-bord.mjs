// Apprentissage v2 : toutes les cartes, filtres et combinaisons, exclusion, Nouvelles, vignettes, aperçu, Lancer,
// INDÉPENDANCE (cartes, J, FSRS, journal, séance du jour identiques avant / après).
// node t-tableau-bord.mjs [ordinateur|tablette|telephone]
import { banc } from './commun.mjs';
const app = process.argv[2] || 'ordinateur';
const [W, H] = app === 'telephone' ? [390, 844] : app === 'tablette' ? [820, 1180] : [1440, 900];
const b = await banc(W, H, { tactile: app !== 'ordinateur' });
const ok = b.ok; let echecs = 0; const v = (c, m, d) => { if (!ok(c, m, d)) echecs++; };
await b.ouvrirApp();
await b.ev(`localStorage.removeItem('medrevise.apprentissage.filtres'); localStorage.removeItem('medrevise.apprentissage.vue'); 1`);
await b.ouvrirApp(false);
const avant = await b.empreinte();
console.log('avant :', JSON.stringify(avant));
await b.apprentissage();
const mobile = app === 'telephone';
// 1) toutes les cartes
const total = await b.ev(`(async () => (await ${b.mod('storage.js')}.getAll('questions')).filter((q) => q.type === 'flashcard' && !q.ephemeral).length)()`);
await b.ev(`(() => { const r = [...document.querySelectorAll('.alib2-reinit, .alib2-ftete .linklike')][0]; r && r.click(); return 1; })()`); await b.dormir(400);
v(await b.compteur() === total, `toutes les flashcards présentes : compteur ${await b.compteur()} = total en base ${total}`);
const texteEcran = await b.ev(`document.body.innerText`);
v(!/Mettre en apprentissage|Retirer de l’apprentissage|en apprentissage/.test(texteEcran), 'aucun « Mettre en apprentissage / Retirer » à l’écran');
await b.capture(`appr2-${app}-tout`);
// déplier tout ce qui est replié, compter les vignettes
const deplier = () => b.ev(`(() => { let n = 0; for (const t of document.querySelectorAll('.alib2-ctete[aria-expanded="false"]')) { t.click(); n++; } return n; })()`);
// 2) recherche
const mot = await b.ev(`(async () => { const q = (await ${b.mod('storage.js')}.getAll('questions')).find((x) => x.type === 'flashcard' && (x.verso || '').length > 30); return q ? q.verso.replace(/<[^>]+>/g, ' ').split(/\\s+/).filter((w) => w.length > 6)[0] : 'rein'; })()`);
await b.taper(`document.querySelector('.alib2-recherche input')`, mot.toUpperCase());
await b.dormir(400);
const nRech = await b.compteur();
const attendu = await b.ev(`(async () => { const T = ${b.mod('tableauBord.js').replace("'/src/medrevise/lib/tableauBord.js'", "'/src/medrevise/apprentissageLibre/tableauBord.js'")}; const S = ${b.mod('storage.js')};
  const db = { sources: await S.getAll('sources'), matieres: await S.getAll('matieres'), fiches: await S.getAll('fiches'), questions: await S.getAll('questions') };
  return T.filtrer(db, { ...T.FILTRES_VIDES, q: ${JSON.stringify(mot)} }).length; })()`);
v(nRech > 0 && nRech === attendu && nRech < total, `recherche « ${mot.toUpperCase()} » (casse / accents ignorés) : ${nRech} cartes (attendu ${attendu})`);
await deplier(); await b.dormir(400);
v(await b.vignettes() === nRech, `vignettes affichées = compteur (${await b.vignettes()})`);
await b.capture(`appr2-${app}-recherche`);
await b.taper(`document.querySelector('.alib2-recherche input')`, '');
// 3) filtres (ordinateur / tablette : puces ; téléphone : feuille du bas)
const ouvrirFiltre = async (cle) => {
  if (mobile) { if (!(await b.ev(`!!document.querySelector('.alib2-feuille')`))) await b.toucher(`document.querySelector('[data-puce="filtres"]')`, 600); return; }
  if (!(await b.ev(`!!document.querySelector('.alib2-pop [data-choix="${cle}"]')`))) await b.toucher(`document.querySelector('[data-puce="${cle}"]')`, 400);
};
const fermerFiltre = async () => { if (mobile) { if (await b.ev(`!!document.querySelector('.alib2-feuille')`)) await b.toucher(`document.querySelector('.alib2-fpied .btn')`, 500); } else await b.ev(`(document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})), window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})), 1)`); await b.dormir(300); };
const choix = await b.ev(`[...document.querySelectorAll('.alib2-section')].length`);
// Matière : la première
await ouvrirFiltre('matieres');
const mat = await b.ev(`(() => { const l = [...document.querySelectorAll('[data-choix="matieres"] .alib2-option')]; return l.map((e) => ({ nom: e.querySelector('.alib2-onom').textContent, n: +e.querySelector('.tnum').textContent })); })()`);
await b.toucher(`[...document.querySelectorAll('[data-choix="matieres"] .alib2-option input')][0]`, 500);
await fermerFiltre();
v(await b.compteur() === mat[0].n, `filtre Matière « ${mat[0].nom} » : ${await b.compteur()} = ${mat[0].n}`);
// + 2e matière (multi-sélection)
if (mat.length > 1) {
  await ouvrirFiltre('matieres'); await b.toucher(`[...document.querySelectorAll('[data-choix="matieres"] .alib2-option input')][1]`, 500); await fermerFiltre();
  v(await b.compteur() === mat[0].n + mat[1].n, `deux matières : ${await b.compteur()} = ${mat[0].n}+${mat[1].n}`);
}
// Cours : exclure le premier cours de ces matières
await ouvrirFiltre('cours');
const c0 = await b.ev(`(() => { const e = document.querySelector('[data-choix="cours"] .alib2-option.cours'); return { id: e.dataset.coursChoix, nom: e.querySelector('.alib2-onom').textContent, n: +e.querySelector('.tnum').textContent }; })()`);
const n0 = await b.compteur();
await b.toucher(`document.querySelector('[data-cours-choix="${c0.id}"] [data-etat="exclus"]')`, 500);
await fermerFiltre();
v(await b.compteur() === n0 - c0.n && !(await b.ev(`!!document.querySelector('.alib2-cours[data-cours="${c0.id}"]')`)), `exclusion du cours « ${c0.nom} » : ${n0} − ${c0.n} = ${await b.compteur()}, cours absent de l’écran`);
if (!mobile) await b.capture(`appr2-${app}-exclusion`);
// inclure seulement ce cours (bascule exclu → inclus)
await ouvrirFiltre('cours'); await b.toucher(`document.querySelector('[data-cours-choix="${c0.id}"] [data-etat="inclus"]')`, 500);
if (mobile) await b.capture(`appr2-${app}-feuille`);
await fermerFiltre();
v(await b.compteur() === c0.n, `cours « ${c0.nom} » seul : ${await b.compteur()} = ${c0.n}`);
// Nouvelles
const nouvellesCours = await b.ev(`(async () => { const C = ${b.mod('categoriesFC.js')}; return (await ${b.mod('storage.js')}.getAll('questions')).filter((q) => q.ficheId === ${JSON.stringify(c0.id)} && q.type === 'flashcard' && !q.ephemeral && C.estNouvelle(q)).length; })()`);
if (mobile) await ouvrirFiltre('nouvelles');
await b.toucher(`[...document.querySelectorAll('[data-puce="nouvelles"]')].find((e) => e.offsetParent)`, 500);
await fermerFiltre();
v(await b.compteur() === nouvellesCours, `+ Nouvelles : ${await b.compteur()} = ${nouvellesCours} (définition existante)`);
await deplier(); await b.dormir(300);
const tags = await b.ev(`document.querySelectorAll('.alib2-carte .alib2-tag.nouvelle').length`);
v(tags === nouvellesCours, `tag « Nouvelle » sur chaque vignette affichée (${tags})`);
// Type : tour des types sur TOUT le jeu
await b.ev(`(() => { const r = [...document.querySelectorAll('.alib2-reinit, .alib2-ftete .linklike')].find((e) => e.offsetParent || mobile); 1; })()`);
await b.ev(`localStorage.removeItem('medrevise.apprentissage.filtres'); 1`);
await b.ouvrirApp(); await b.apprentissage();
const parType = await b.ev(`(async () => { const T = ${b.mod('tableauBord.js').replace("'/src/medrevise/lib/tableauBord.js'", "'/src/medrevise/apprentissageLibre/tableauBord.js'")};
  const q = (await ${b.mod('storage.js')}.getAll('questions')).filter(T.estCarteApprentissage); const n = {}; for (const x of q) n[T.typeCarte(x)] = (n[T.typeCarte(x)] || 0) + 1; return n; })()`);
console.log('par type :', JSON.stringify(parType));
for (const t of ['texte', 'muscle', 'tableau', 'molecule', 'image']) {
  await ouvrirFiltre('types');
  await b.toucher(`[...document.querySelectorAll('[data-choix="types"] [data-type="${t}"]')].find((e) => e.offsetParent)`, 400);
  await fermerFiltre();
  v(await b.compteur() === (parType[t] || 0), `Type ${t} : ${await b.compteur()} = ${parType[t] || 0}`);
  await ouvrirFiltre('types');
  await b.toucher(`[...document.querySelectorAll('[data-choix="types"] [data-type="${t}"]')].find((e) => e.offsetParent)`, 400);
  await fermerFiltre();
}
v(await b.compteur() === total, `filtres retirés : retour à ${total}`);
// combinaison : Type image + recherche
// 4) Réinitialiser
await ouvrirFiltre('types'); await b.toucher(`[...document.querySelectorAll('[data-choix="types"] [data-type="muscle"]')].find((e) => e.offsetParent)`, 400); await fermerFiltre();
await b.taper(`document.querySelector('.alib2-recherche input')`, 'zzzzqqq');
v(await b.compteur() === 0 && /Aucune carte ne correspond/.test(await b.ev('document.body.innerText')), 'combinaison sans résultat : « Aucune carte ne correspond »');
await b.toucher(`[...document.querySelectorAll('.rev-empty .btn')][0]`, 500);
v(await b.compteur() === total, `« Réinitialiser » : ${await b.compteur()}`);
// 5) vignettes : recto en haut, verso dessous, « voir plus », aperçu retournable
await b.taper(`document.querySelector('.alib2-recherche input')`, mot);
await deplier(); await b.dormir(400);
const vg = await b.ev(`(() => { const c = document.querySelector('.alib2-carte .alib2-vignette'); const r = c.querySelector('.alib2-recto').getBoundingClientRect(), s = c.querySelector('.alib2-verso'); return { rectoAuDessus: !!s && r.bottom <= s.getBoundingClientRect().top + 1, plus: document.querySelectorAll('.alib2-plus').length, largeur: Math.round(c.getBoundingClientRect().width) }; })()`);
v(vg.rectoAuDessus, `vignette : recto au-dessus du verso (largeur ${vg.largeur} px, ${vg.plus} « voir plus »)`);
if (vg.plus) { const hv = `document.querySelector('.alib2-plus').closest('.alib2-vignette').querySelector('.alib2-verso').getBoundingClientRect().height`; const h0 = await b.ev(hv); await b.toucher(`document.querySelector('.alib2-plus')`, 300); const h1 = await b.ev(hv); v(h1 > h0 && /voir moins/.test(await b.ev(`document.querySelector('.alib2-plus').textContent`)), `« voir plus » déplie le verso (${Math.round(h0)} → ${Math.round(h1)} px)`); }
await b.capture(`appr2-${app}-vignettes`);
await b.toucher(`document.querySelector('.alib2-carte .alib2-recto')`, 700);
v(await b.ev(`!!document.querySelector('.alib2-apercu')`) && /Recto/i.test(await b.ev(`document.querySelector('.alib2-acote').textContent`)), 'clic → aperçu plein (recto)');
await b.toucher(`document.querySelector('.alib2-aface')`, 500);
v(/Verso/i.test(await b.ev(`document.querySelector('.alib2-acote').textContent`)), 'aperçu retourné (verso)');
await b.capture(`appr2-${app}-apercu`);
await b.toucher(`document.querySelector('.alib2-apercu .cn-fermer')`, 400);
// 6) vue liste
if (!mobile) {
  await b.toucher(`document.querySelector('.alib2-vue[aria-label="Vue liste compacte"]')`, 500);
  v(await b.ev(`!!document.querySelector('.alib2-cartes.liste')`), 'vue liste compacte');
  await b.capture(`appr2-${app}-liste`);
  await b.toucher(`document.querySelector('.alib2-vue[aria-label="Vue grille"]')`, 400);
}
// 7) Lancer sur le filtre
const nVis = await b.compteur();
await b.toucher(`[...document.querySelectorAll('.alib-lancer')].find((e) => e.offsetParent)`, 900);
const prog = await b.ev(`(document.querySelector('.sfc-prog') || {}).textContent || ''`);
v(new RegExp('/ ' + nVis + ' sues').test(prog), `« Lancer » : session sur les ${nVis} cartes visibles (${prog})`);
const premiere = await b.ev(`document.querySelector('.sfc-carte').dataset.carte`);
const ordreEcran = await b.ev(`(() => 1)()`);
// révéler, Su, Su ; Pas su ; Skip
for (const g of ['su', 'su', 'pas', 'skip']) {
  if (g === 'skip') { await b.toucher(`document.querySelector('.alib-skip')`, 400); continue; }
  await b.toucher(`[...document.querySelectorAll('.sfc-btn')].find((e) => /Voir la réponse/.test(e.textContent))`, 400);
  await b.toucher(`document.querySelector(${g === 'su' ? "'.alib-su'" : "'.alib-passu'"})`, 400);
}
const prog2 = await b.ev(`document.querySelector('.sfc-prog').textContent`);
console.log('progression :', prog2, '· première carte :', premiere);
await b.capture(`appr2-${app}-session`);
await b.toucher(`document.querySelector('.alib-finir')`, 500);
v(!/Retirer de l’apprentissage/.test(await b.ev('document.body.innerText')), 'fin de session : plus de « Retirer de l’apprentissage »');
await b.toucher(`[...document.querySelectorAll('.sfc-btn')].find((e) => /Terminer/.test(e.textContent))`, 600);
await b.dormir(1500);
const apres = await b.empreinte();
console.log('après :', JSON.stringify(apres));
v(JSON.stringify(avant) === JSON.stringify(apres), 'INDÉPENDANCE : cartes, dueDate / FSRS / historique, journal et séance du jour identiques (SHA-256)');
v(!b.erreurs.length, 'console sans erreur', b.erreurs.slice(0, 3).join(' | '));
console.log(echecs ? `❌ ${echecs} échec(s)` : '✅ tout est vert');
b.fermer(); process.exit(0);
