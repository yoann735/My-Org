// Carte Tableau à masque choisi — téléphone D (390×844, tactile). Rejouer « node ../tests-par-cours-elements/seed.mjs tel »
// avant. Le téléphone n'a pas de panneau (pas d'éditeur) : la carte 4 × 5 est écrite comme le ferait le formulaire
// (lib/carteTableau.js#carteTableau). Séance du jour (Nouvelles) : seules les cases masquées cachées, une case, une ligne,
// le nom, Tout révéler au doigt ; défilement horizontal interne ; session du mode Apprentissage ; ancienne carte Tableau
// (toutes cachées, noms visibles) ; cartes témoins intactes.
import { banc, TITRE, COLS, LIGNES, MASQUE, NB_CACHEES } from './commun.mjs';
const b = await banc(true);
const v = b.v;
await b.ouvrirApp({ recharger: true });
await b.semerTemoin();
const h0 = await b.temoins();
await b.S(`const T = await import('/src/medrevise/lib/carteTableau.js'); const A = await import('/src/medrevise/lib/adapter.js'); const t = (await import('/src/medrevise/lib/sm2.js')).todayISO();
  const c = A.toInternalItem({ id: 'tm-4x5', ficheId: 'f1', ...T.carteTableau({ titre: ${JSON.stringify(TITRE)}, colonnes: ${JSON.stringify(COLS)}, lignes: ${JSON.stringify(LIGNES)}, masque: ${JSON.stringify(MASQUE)}, theme: 'C1' }), historique: [], nouvelle: true, dueDate: t, j0Date: t });
  await S.put('questions', c); await S.setMeta('seanceFC', null); return 1`);
v(JSON.stringify((await b.carteBase('tm-4x5')).tableau.masque) === JSON.stringify(MASQUE), 'carte 4 × 5 écrite avec son masque');
await b.lanceur();
await b.parCours(false);
await b.cocher('revisions', false); await b.cocher('retard', false); await b.cocher('nouvelles', true); await b.maximum('nouvelles', 'tout');
await b.dormir(300);
await b.toucher(`document.querySelector('[data-sfa="demarrer"]')`, 1500);
const e = await b.seance();
const k = e.cartes.indexOf('tm-4x5');
v(k >= 0, `séance du jour (Nouvelles) : la carte Tableau est dedans (${k + 1} / ${e.cartes.length})`);
for (let i = 0; i < k; i++) { await b.toucher(`document.querySelector('.sfc-carte')`, 450); await b.toucher(`document.querySelector('[data-nouvelle="garder"]')`, 800); }
v(await b.ev(`document.querySelector('.sfc-carte').dataset.carte`) === 'tm-4x5', 'carte Tableau affichée');
await b.toucher(`document.querySelector('.sfc-carte')`, 700);
const R = `document.querySelector('.sfc')`;
let s = await b.rev(R);
const plein = MASQUE.cellules.flatMap((l, r) => l.map((x, c) => (x ? `${r}:${c}` : null))).filter(Boolean);
v(s && JSON.stringify(s.cachees) === JSON.stringify(plein) && JSON.stringify(s.noms) === '["1"]' && s.visibles.length === 20 - NB_CACHEES, `verso : ${NB_CACHEES} cases masquées cachées + le nom « Origine », ${20 - NB_CACHEES} cases visibles d’emblée`, JSON.stringify(s && { c: s.cachees.length, n: s.noms, v: s.visibles.length }));
const defil = await b.ev(`(()=>{const d=document.querySelector('.sfc .tb-defil');return {sw:d.scrollWidth,cw:d.clientWidth,page:document.documentElement.scrollWidth}})()`);
v(defil.sw > defil.cw && defil.page <= 390, 'tableau plus large que l’écran : défilement horizontal INTERNE, la page ne déborde pas', JSON.stringify(defil));
await b.capture('tm-mobile-masques');
await b.toucher(`${R}.querySelector('td.cachee[data-cellule="0:2"] .tb-masque')`, 400);
s = await b.rev(R);
v(s.cachees.length === NB_CACHEES - 1 && !(await b.ev(`!!document.querySelector('.sfc-indication')`)), 'un tap révèle une case ; la carte ne se retourne pas');
await b.toucher(`${R}.querySelector('tr[data-ligne="1"] .tb-ligne-btn')`, 400);
s = await b.rev(R);
v(s.cachees.length === NB_CACHEES - 6, '« Ligne » : les 5 cases de la ligne 2', s.cachees.join(' '));
await b.toucher(`${R}.querySelector('th.cachee .tb-masque-nom')`, 400);
v((await b.rev(R)).noms.length === 0, 'le nom masqué se révèle au tap');
await b.capture('tm-mobile-partiel');
await b.toucher(`${R}.querySelector('.tb-tout-btn')`, 400);
v((await b.rev(R)).cachees.length === 0, '« Tout révéler »');
v(await b.ev(`!!document.querySelector('[data-nouvelle="passer"]')`), 'boutons de la carte Nouvelle inchangés (Garder / Passer en révision)');
await b.ev(`(()=>{const x=document.querySelector('.sfc-quitter');x&&x.click();return 1})()`); await b.dormir(900);
// ---- mode Apprentissage (téléphone) : carte à masque, puis ancienne carte ----
await b.ev(`localStorage.removeItem('medrevise.apprentissage.filtres');1`);
await b.apprentissage();
const session = async (q) => {
  await b.taper(`document.querySelector('.alib2-recherche input')`, q);
  await b.toucher(`document.querySelector('.alib-lancer')`, 900);
  await b.toucher(`document.querySelector('.alib-session .sfc-carte')`, 700);
  return b.rev(`document.querySelector('.alib-session')`);
};
s = await session('masque choisi');
v(s && s.cachees.length === NB_CACHEES && s.noms.length === 1, `session Apprentissage : ${NB_CACHEES} cases + 1 nom cachés`, JSON.stringify(s && { c: s.cachees.length, n: s.noms }));
await b.toucher(`document.querySelector('.alib-session td.cachee .tb-masque')`, 400);
v((await b.rev(`document.querySelector('.alib-session')`)).cachees.length === NB_CACHEES - 1, 'session : une case révélée au tap');
await b.capture('tm-mobile-apprentissage');
await b.toucher(`document.querySelector('.sfc-quitter')`, 900);
s = await session('Ancien tableau');
v(s && s.cachees.length === 4 && s.noms.length === 0 && s.entetes.join('|') === 'Segment|Rôle' && s.lignesBtn === 2, 'ancienne carte Tableau : toutes les cases cachées, noms visibles (comme avant)', JSON.stringify(s));
await b.capture('tm-mobile-ancienne');
await b.toucher(`document.querySelector('.sfc-quitter')`, 900);
await b.taper(`document.querySelector('.alib2-recherche input')`, '');
v((await b.temoins()) === h0, `cartes témoins identiques (${h0})`);
b.fin();
