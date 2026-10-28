// Ligne Topographie — téléphone (D, 390×844, tactile). Rejouer « node ../tests-par-cours-elements/seed.mjs tel » avant.
// Le téléphone n'a pas de panneau (pas de formulaire) : la carte est écrite comme le ferait le formulaire (carteMuscle).
// Séance du jour (Nouvelles) : Topographie remplie + 2 autres lignes, une vide « — » ; révélation au doigt ligne par
// ligne puis « Tout révéler » ; l'ancienne carte Muscle (témoin) reste identique ; vue mobile du tableau.
import { banc } from './commun.mjs';
const b = await banc(true);
const v = b.v;
await b.ouvrirApp({ recharger: true });
const h0 = await b.S(`return JSON.stringify(await S.getOne('questions','temoin-muscle'))`);
await b.S(`const M = await import('/src/medrevise/lib/muscle.js'); const A = await import('/src/medrevise/lib/adapter.js'); const today = (await import('/src/medrevise/lib/sm2.js')).todayISO();
  const c = M.carteMuscle({ nom: 'Grand rond', lignes: { origine: 'Angle inférieur de la scapula', action: 'Adduction, rotation médiale', topographie: 'Paroi postérieure de l’aisselle' } });
  await S.put('questions', A.toInternalItem({ ...c, id: 'mu-topo', ficheId: 'f1', historique: [], nouvelle: true, dueDate: today, j0Date: today }));
  await S.setMeta('seanceFC', null); return 1`);
await b.lanceur();
await b.parCours(false);
await b.cocher('revisions', false); await b.cocher('retard', false); await b.cocher('nouvelles', true); await b.maximum('nouvelles', 'tout');
await b.dormir(300);
await b.toucher(`document.querySelector('[data-sfa="demarrer"]')`, 1500);
const e = await b.seance();
const k = e.cartes.indexOf('mu-topo');
v(k >= 0, `séance du jour : la carte « Grand rond » est dedans (${k + 1} / ${e.cartes.length})`);
for (let i = 0; i < k; i++) { await b.toucher(`document.querySelector('.sfc-carte')`, 450); await b.toucher(`document.querySelector('[data-nouvelle="garder"]')`, 800); }
await b.toucher(`document.querySelector('.sfc-carte')`, 700);
const etat = () => b.ev(`(()=>{const d=document.querySelector('.sfc');return {l:[...d.querySelectorAll('.mu-tableau .mu-ligne')].map(x=>x.dataset.ligne+'='+(x.classList.contains('cachee')?'?':x.querySelector('.mu-contenu').textContent.trim())),tout:(d.querySelector('.mu-tout-btn')||{}).textContent||'',retourne:!!d.querySelector('.sfc-indication')}})()`);
let s = await etat();
v(s.l.length === 6 && s.l[5] === 'topographie=?' && s.l[1] === 'trajet=—' && /\(3\)/.test(s.tout), 'verso : 6 lignes, Topographie en bas masquée, lignes vides « — », « Tout révéler (3) »', s.l.join(' | '));
await b.capture('topo-mobile-masques');
await b.toucher(`document.querySelector('.sfc [data-ligne="topographie"].cachee')`, 400);
s = await etat();
v(s.l[5] === 'topographie=Paroi postérieure de l’aisselle' && s.l[0] === 'origine=?' && !s.retourne, 'un tap révèle la Topographie seule ; la carte ne se retourne pas', s.l.join(' | '));
await b.capture('topo-mobile-une-ligne');
await b.toucher(`document.querySelector('.sfc .mu-tout-btn')`, 400);
s = await etat();
v(s.l.every((x) => !x.endsWith('=?')), '« Tout révéler » : tout est visible');
await b.capture('topo-mobile-tout');
v((await b.S(`return JSON.stringify(await S.getOne('questions','temoin-muscle'))`)) === h0, 'ancienne carte Muscle identique en base');
await b.S(`await S.remove('questions','mu-topo'); await S.setMeta('seanceFC', null); return 1`);
b.fin();
