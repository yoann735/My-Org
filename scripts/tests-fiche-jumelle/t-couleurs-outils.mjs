// Le MÊME sélecteur sur chaque outil : surligneur, crayon, forme, boîte, texte, couleur et fond du
// texte d'une boîte — couleur personnalisée tapée, validée, puis utilisée pour de vrai.
import { banc, rgb } from './commun.mjs';
const b = await banc();
console.log('nettoyage :', await b.nettoyer(['f-fj']));
b.ok(await b.ouvrir('Physiologie rénale (jumelle)', { recharger: true }), 'cours ouvert');
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0`); await b.dormir(700);
const pg = await b.rect(`[...document.querySelectorAll('.pdfr-textlayer span')][0].closest('.pdfr-page')`);
const lire = (st) => b.S(`return JSON.stringify((await S.getAll('${st}')).filter(a=>a.ficheId==='f-fj'))`).then(JSON.parse);
const persoOutil = async (hex) => {
  await b.clic(await b.pos(`document.querySelector('.pdfr-contexte .sc-roue-btn')`, false), { att: 500 });
  const ok = await b.ev(`document.activeElement && document.activeElement.classList.contains('sc-hex')`);
  await b.touche('a', { meta: true }); await b.ecrire(hex.slice(1)); await b.T.Enter(); await b.dormir(300);
  const actif = await b.ev(`(()=>{const p=document.querySelector('.pdfr-contexte .sc-pastille.actif');return p?getComputedStyle(p).backgroundColor:null})()`);
  return ok && actif === `rgb(${rgb(hex)})`;
};
// SURLIGNEUR
await b.clic(await b.bouton('Surligneur'));
b.ok(await persoOutil('#00897b'), 'surligneur : couleur personnalisée #00897b tapée → choisie dans la barre');
const sp = await b.rect(`[...document.querySelectorAll('.pdfr-textlayer span')].find(s=>s.textContent.includes('Capsule'))`);
await b.glisser([sp.x + 2, sp.cy], [sp.x + sp.w * 0.6, sp.cy], 12); await b.dormir(500);
b.ok((await lire('highlights')).some((h) => h.couleur === '#00897b'), 'surlignage posé en #00897b');
// CRAYON
await b.clic(await b.bouton('Crayon'));
b.ok(await persoOutil('#6d4c41'), 'crayon : #6d4c41');
await b.glisser([pg.x + 300, pg.y + 520], [pg.x + 600, pg.y + 560], 14); await b.dormir(400);
b.ok((await lire('annotations')).some((a) => a.kind === 'trait' && a.couleur === '#6d4c41'), 'trait au crayon en #6d4c41');
// FORME
await b.clic(await b.bouton('Forme'));
b.ok(await persoOutil('#3949ab'), 'forme : #3949ab');
await b.glisser([pg.x + 700, pg.y + 470], [pg.x + 900, pg.y + 560], 12); await b.dormir(500);
const forme = (await lire('annotations')).find((a) => a.kind === 'forme' || a.type === 'forme' || a.forme);
b.ok(forme && forme.couleur === '#3949ab', 'forme posée en #3949ab', forme && forme.couleur);
// BOÎTE (outil)
await b.clic(await b.bouton('Boîte'));
b.ok(await persoOutil('#f9a825'), 'boîte (outil) : #f9a825');
await b.clic([pg.x + 560, pg.y + 590], { att: 800 }); await b.ecrire("Boîte outil");
await b.T.Escape(); await b.T.Escape(); await b.dormir(400);
b.ok((await lire('annotations')).some((a) => a.kind === 'libre' && a.type === 'boite' && a.couleur === '#f9a825'), 'boîte posée en #f9a825');
// TEXTE libre
await b.clic(await b.bouton('Texte'));
b.ok(await persoOutil('#c2185b'), 'texte : #c2185b');
await b.clic([pg.x + 90, pg.y + 640], { att: 800 }); await b.ecrire("Texte libre");
await b.T.Escape(); await b.T.Escape(); await b.dormir(400);
b.ok((await lire('annotations')).some((a) => a.couleur === '#c2185b' && a.type !== 'boite'), 'texte libre posé en #c2185b');
await b.capt('outils-perso');
// FORME sélectionnée : couleur depuis SA barre, aperçu, Échap puis validation
await b.clic(await b.bouton('Sélection'));
const fr = await b.rect(`document.querySelector('.pdfr-forme')`);
if (fr) {
  await b.clic([fr.x + 1, fr.cy], { att: 500 });
  const btn = await b.pos(`document.querySelector('.pdfr-forme .pf-actions .sc-bouton, .pf-actions .sc-bouton')`, false);
  if (btn) {
    await b.clic(btn, { att: 400 });
    await b.clic(await b.pos(`document.querySelector('.sc-pop .sc-roue-btn')`, false), { att: 500 });
    await b.touche('a', { meta: true }); await b.ecrire('43a047'); await b.dormir(200);
    const trait = await b.ev(`(()=>{const p=document.querySelector('.pdfr-forme path:not(.pf-hit), .pdfr-forme rect, .pdfr-forme ellipse');return p?getComputedStyle(p).stroke:null})()`);
    b.ok(trait === `rgb(${rgb('#43a047')})`, 'forme sélectionnée : aperçu en direct', trait);
    await b.T.Enter(); await b.dormir(400);
    b.ok((await lire('annotations')).find((a) => a.id === forme.id).couleur === '#43a047', 'forme : Entrée → #43a047 enregistré');
    await b.T.Escape(); await b.dormir(200);
    await b.touche('z', { meta: true }); await b.dormir(400);
    b.ok((await lire('annotations')).find((a) => a.id === forme.id).couleur === '#3949ab', 'forme : ⌘Z → #3949ab');
  } else b.ok(false, 'barre de la forme introuvable');
} else b.ok(false, 'forme introuvable à l’écran');
// COULEUR et FOND du texte d'une boîte (TipTap)
const bx = `[...document.querySelectorAll('.note-box')].find(n=>n.innerText.includes('Boîte outil'))`;
await b.clic(await b.pos(bx, false), { att: 700 });
await b.clic(await b.pos(`${bx}.querySelector('.ProseMirror')`, false), { att: 300 });
await b.touche('a', { meta: true });
const couleurTexte = async (titre, hex) => {
  await b.clic(await b.pos(`[...document.querySelectorAll('.pdfr-contexte .sc-bouton')].find(x=>x.title===${JSON.stringify(titre)})`, false), { att: 400 });
  await b.clic(await b.pos(`document.querySelector('.sc-pop .sc-roue-btn')`, false), { att: 500 });
  await b.touche('a', { meta: true }); await b.ecrire(hex.slice(1)); await b.T.Enter(); await b.dormir(500);
};
await couleurTexte('Couleur du texte sélectionné', '#ffffff');
b.ok(await b.ev(`${bx}.querySelector('.ProseMirror').innerHTML.includes('color: rgb(255, 255, 255)')`), 'couleur du texte sélectionné : #ffffff', await b.ev(`${bx}.querySelector('.ProseMirror').innerHTML.slice(0,160)`));
await b.clic(await b.pos(`${bx}.querySelector('.ProseMirror')`, false), { att: 300 }); await b.touche('a', { meta: true });
await couleurTexte('Surligneur de fond du texte sélectionné', '#212121');
b.ok(await b.ev(`${bx}.querySelector('.ProseMirror').innerHTML.includes('background-color: rgb(33, 33, 33)')`), 'COULEUR DE FOND du texte : #212121', await b.ev(`${bx}.querySelector('.ProseMirror').innerHTML.slice(0,200)`));
await b.capt('texte-fond-perso');
const recentes = await b.ev(`localStorage.getItem('medrevise.couleursPerso')`);
b.ok(await b.ev(`[...document.querySelectorAll('.pdfr-contexte .sc-perso')].length`) <= 5, 'Récentes : 5 au plus à l’écran', recentes);
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
b.c.fermer();
