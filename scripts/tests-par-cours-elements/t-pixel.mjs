// Non-régression au pixel (ordinateur C) : carte Texte ancienne et carte Muscle (composant de révélation factorisé) —
// vue agrandie (composant de la séance) au verso, aperçu du mode Apprentissage, carte de la liste du panneau.
// node t-pixel.mjs <avant|apres> → scripts/cap/px-<étiquette>-*.png ; comparer avec cmp.
import { banc } from './commun.mjs';
const tag = process.argv[2];
const b = await banc(false);
const clip = (sel) => b.ev(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}})()`);
await b.ouvrirCours('Cours témoin', { recharger: true });
await b.ongletFlashcards();
await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
for (const id of ['temoin-texte', 'temoin-muscle']) {
  await b.ev(`(()=>{${b.carteListe(id)}.scrollIntoView({block:'start'});return 1})()`); await b.dormir(500);
  await b.capture(`px-${tag}-liste-${id}`, await clip(`.pis-item[data-item="${id}"]`));
  await b.survol(b.carteListe(id));
  await b.toucher(`${b.carteListe(id)}.querySelector('[data-act="agrandir"]')`, 900);
  await b.toucher(`document.querySelector('.va .sfc-carte')`, 900);
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 }); await b.dormir(300);
  await b.capture(`px-${tag}-agrandie-${id}`, await clip('.va .sfc-carte'));
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await b.dormir(400);
}
await b.ev(`localStorage.removeItem('medrevise.apprentissage.filtres');1`);
await b.apprentissage();
for (const [id, q] of [['temoin-texte', 'Ancienne carte'], ['temoin-muscle', 'Biceps']]) {
  await b.taper(`document.querySelector('.alib2-recherche input')`, q);
  await b.toucher(`document.querySelector('.alib2-carte[data-carte="${id}"] .alib2-vignette')`, 800);
  await b.toucher(`document.querySelector('.alib2-apercu .alib2-aface')`, 800);
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 }); await b.dormir(300);
  await b.capture(`px-${tag}-apercu-${id}`, await clip('.alib2-apercu .alib2-aface'));
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await b.dormir(400);
}
await b.taper(`document.querySelector('.alib2-recherche input')`, '');
console.log(tag, 'ok', b.erreurs.filter((e) => !/validateDOMNesting/.test(e)).length, 'erreur(s)');
process.exit(0);
