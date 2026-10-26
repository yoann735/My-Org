// Séance d'UN cours (Bibliothèque › « Réviser cette fiche », session/Session.jsx, carte 3D) — ordinateur C.
// Après t-elements.mjs (la carte « 4 fonctions » existe dans le Cours 1) : éléments masqués au verso, un par un, Tout révéler.
import { banc, COURS } from './commun.mjs';
const b = await banc(false);
const v = b.v;
await b.ouvrirApp({ recharger: true });
await b.ev(`(()=>{const x=[...document.querySelectorAll('.sb-item')].find(e=>/Biblioth/.test(e.title||e.innerText||''));x&&x.click();return 1})()`); await b.dormir(1200);
await b.ev(`(()=>{const r=[...document.querySelectorAll('button')].find(x=>(x.title||'')==='Revenir à la liste'||x.getAttribute('aria-label')==='Retour');r&&r.click();return 1})()`); await b.dormir(800);
const ligne = `[...document.querySelectorAll('.lt-fiche')].find(e=>e.innerText.trim().startsWith(${JSON.stringify(COURS[0])}))`;
await b.survol(ligne);
const bt = `(${ligne}).closest('[tabindex]').parentElement.querySelector('[title="Réviser cette fiche"]') || [...document.querySelectorAll('[title="Réviser cette fiche"]')].find(x=>x.closest('li,div')&&x.closest('li,div').innerText.includes(${JSON.stringify(COURS[0])}))`;
await b.toucher(bt, 1500);
v(await b.ev(`!!document.querySelector('.flash-card')`), 'séance du cours ouverte (Session.jsx)');
let trouve = false;
// on avance en notant « Correct » (données de test) jusqu'à la carte « 4 fonctions »
for (let k = 0; k < 14 && !trouve; k++) {
  const rr = await b.ev(`(document.querySelector('.flash-face.front')||{}).textContent||''`);
  if (rr.includes('4 fonctions du rein')) { trouve = true; break; }
  await b.toucher(`document.querySelector('.flash-card')`, 700);
  const note = `[...document.querySelectorAll('button')].find(x=>x.offsetParent&&/^\\s*Correct/.test(x.textContent))`;
  if (!(await b.ev(`!!(${note})`))) break;
  await b.toucher(note, 1200);
}
v(trouve, 'la carte « 4 fonctions » arrive dans la séance du cours');
if (trouve) {
  const m0 = await b.ev(`document.querySelectorAll('.flash-face.back .mu-elements .mu-masque').length`);
  await b.toucher(`document.querySelector('.flash-card')`, 900);
  await b.toucher(`document.querySelector('.flash-face.back .mu-elements .mu-ligne.cachee')`, 400);
  const m1 = await b.ev(`document.querySelectorAll('.flash-face.back .mu-elements .mu-masque').length`);
  const flip = await b.ev(`document.querySelector('.flash-card').classList.contains('flipped')`);
  v(m0 === 3 && m1 === 2 && flip, `face réponse : ${m0} masqués → ${m1} après un clic, la carte reste retournée`);
  await b.capture('el-seance-cours');
  await b.toucher(`document.querySelector('.flash-face.back .mu-elements .mu-tout-btn')`, 400);
  v((await b.ev(`document.querySelectorAll('.flash-face.back .mu-elements .mu-masque').length`)) === 0, 'Tout révéler');
}
b.fin();
