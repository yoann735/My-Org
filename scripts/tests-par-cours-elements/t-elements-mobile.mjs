// Éléments à révéler — téléphone (D, 390×844, tactile). Rejouer « node seed.mjs tel » avant. La carte « 4 fonctions »
// est écrite comme le ferait le formulaire / l'import (le téléphone n'a pas de panneau) ; révision dans la séance du jour
// (Nouvelles), un par un au doigt, Tout révéler ; session du mode Apprentissage ; carte témoin intacte.
import { banc } from './commun.mjs';
const b = await banc(true);
const v = b.v;
const ITEMS = [{ text: 'Épuration des déchets azotés', masked: true }, { text: 'Équilibre hydro-électrolytique', masked: true }, { text: 'Équilibre acido-basique', masked: false }, { text: 'Fonctions endocrines (EPO, rénine)', masked: true }];
await b.ouvrirApp({ recharger: true });
await b.S(`const A = await import('/src/medrevise/lib/adapter.js'); const today = (await import('/src/medrevise/lib/sm2.js')).todayISO();
  const c = A.toInternalItem({ id: 'el-4f', type: 'flashcard', ficheId: 'f1', theme: 'C1', recto: 'Quelles sont les 4 fonctions du rein ?', verso: 'Quatre grandes fonctions :', items: ${JSON.stringify(ITEMS)}, historique: [], nouvelle: true, dueDate: today, j0Date: today });
  await S.put('questions', c); await S.setMeta('seanceFC', null); return 1`);
await b.lanceur();
await b.parCours(false);
await b.cocher('revisions', false); await b.cocher('retard', false); await b.cocher('nouvelles', true); await b.maximum('nouvelles', 'tout');
await b.dormir(300);
await b.toucher(`document.querySelector('[data-sfa="demarrer"]')`, 1500);
const e = await b.seance();
const k = e.cartes.indexOf('el-4f');
v(k >= 0, `séance du jour (Nouvelles) : la carte à éléments est dedans (${k + 1} / ${e.cartes.length})`);
for (let i = 0; i < k; i++) {
  await b.toucher(`document.querySelector('.sfc-carte')`, 450);
  await b.toucher(`document.querySelector('[data-nouvelle="garder"]')`, 800);
}
v(await b.ev(`document.querySelector('.sfc-carte').dataset.carte`) === 'el-4f', 'carte « 4 fonctions » affichée');
await b.toucher(`document.querySelector('.sfc-carte')`, 700);
const etat = () => b.ev(`(()=>{const d=document.querySelector('.sfc');return {intro:(d.querySelector('.sfc-verso')||{}).textContent,l:d.querySelectorAll('.mu-elements .mu-ligne').length,m:d.querySelectorAll('.mu-elements .mu-masque').length,tout:(d.querySelector('.mu-elements .mu-tout-btn')||{}).textContent,cote:!!d.querySelector('.sfc-indication')}})()`);
let s = await etat();
v(s.intro === 'Quatre grandes fonctions :' && s.l === 4 && s.m === 3 && /\(3\)/.test(s.tout || ''), 'verso : introduction, 4 éléments dont 3 masqués, « Tout révéler (3) »', JSON.stringify(s));
await b.capture('el-revision-mobile-masques');
await b.toucher(`document.querySelector('.sfc .mu-elements .mu-ligne.cachee')`, 400);
s = await etat();
v(s.m === 2 && !s.cote, 'un tap révèle un élément ; la carte ne se retourne pas', JSON.stringify(s));
await b.toucher(`document.querySelector('.sfc .mu-elements .mu-ligne.cachee')`, 400);
v((await etat()).m === 1, 'deuxième tap : un de plus');
await b.capture('el-revision-mobile-un-par-un');
await b.toucher(`document.querySelector('.sfc .mu-elements .mu-tout-btn')`, 400);
v((await etat()).m === 0, '« Tout révéler » : tout est visible');
await b.capture('el-revision-mobile-tout');
// la notation de cette carte reste celle d'une Nouvelle (Garder / Passer)
v(await b.ev(`!!document.querySelector('[data-nouvelle="passer"]')`), 'boutons de la carte Nouvelle inchangés (Garder / Passer en révision)');
await b.toucher(`document.querySelector('.sfc-quitter')`, 1000);
// mode Apprentissage (session)
await b.ev(`localStorage.removeItem('medrevise.apprentissage.filtres');1`);
await b.apprentissage();
await b.taper(`document.querySelector('.alib2-recherche input')`, '4 fonctions');
await b.toucher(`document.querySelector('.alib-lancer')`, 900);
await b.toucher(`document.querySelector('.alib-session .sfc-carte')`, 700);
const m0 = await b.ev(`document.querySelectorAll('.alib-session .mu-elements .mu-masque').length`);
await b.toucher(`document.querySelector('.alib-session .mu-elements .mu-ligne.cachee')`, 400);
const m1 = await b.ev(`document.querySelectorAll('.alib-session .mu-elements .mu-masque').length`);
v(m0 === 3 && m1 === 2, `session Apprentissage (téléphone) : ${m0} masqués → ${m1}`);
await b.capture('el-apprentissage-mobile');
await b.toucher(`document.querySelector('.sfc-quitter')`, 800);
await b.taper(`document.querySelector('.alib2-recherche input')`, '');
await b.S(`await S.setMeta('seanceFC', null); return 1`);
b.fin();
