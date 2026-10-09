// annuler / rétablir : texte du document (⌘Z, ⌘⇧Z) et surlignage d'une image collée (bouton)
import { banc } from './commun-doc.mjs';
import { glisserAvec } from './outils-glisser.mjs';
const b = await banc();
const glisser = glisserAvec(b);
const page = process.argv[2];
if (page === 'doc') {
  await b.clic(await b.bouton('Sélection'));
  await b.clic(await b.pos(`document.querySelector('.pt-flux p')`), { att: 400 });
  await b.touche('End', { vk: 35 });
  const avant = await b.ev(`document.querySelector('.pt-flux').innerText.length`);
  await b.ecrire(' Ajout annulable.'); await b.dormir(800);
  const apres = await b.ev(`document.querySelector('.pt-flux').innerText.length`);
  await b.clic(await b.pos(`[...document.querySelectorAll('.pdfr-contexte .et-btn')].find(x=>x.title.startsWith('Annuler'))`), { att: 900 });
  const annule = await b.ev(`document.querySelector('.pt-flux').innerText.length`);
  b.ok(apres > avant && annule === avant, 'document : « Annuler » de la rangée de mise en forme retire la frappe', `${avant} → ${apres} → ${annule}`);
  await b.clic(await b.pos(`[...document.querySelectorAll('.pdfr-contexte .et-btn')].find(x=>x.title.startsWith('Rétablir'))`), { att: 900 });
  b.ok((await b.ev(`document.querySelector('.pt-flux').innerText.length`)) === apres, 'document : « Rétablir » la remet');
  await b.clic(await b.pos(`[...document.querySelectorAll('.pdfr-contexte .et-btn')].find(x=>x.title.startsWith('Annuler'))`), { att: 900 });
} else {
  const n = () => b.ev(`document.querySelectorAll('.pdfr-image .pi-hl').length`);
  await b.clic(await b.bouton('Surligneur'), { att: 400 });
  await b.clic(await b.pos(`document.querySelectorAll('.pdfr-contexte .sc-couleurs > .sc-pastille:not([title="Couleur actuelle"])')[4]`));
  const mot = (t) => b.ev(`(()=>{const s=[...document.querySelectorAll('.pdfr-image .pi-mot')].find(e=>e.textContent.trim().startsWith(${JSON.stringify(t)}));const r=s.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]})()`);
  const a = await mot('lipides');
  const n0 = await n();
  await glisser([a[0] + 2, (a[1] + a[3]) / 2], [a[2] - 4, (a[1] + a[3]) / 2]);
  const n1 = await n();
  await b.clic(await b.pos(`[...document.querySelectorAll('.pdfr-barre button')].find(x=>(x.title||'').startsWith('Annuler'))`), { att: 900 });
  const n2 = await n();
  await b.clic(await b.pos(`[...document.querySelectorAll('.pdfr-barre button')].find(x=>(x.title||'').startsWith('Rétablir'))`), { att: 900 });
  const n3 = await n();
  b.ok(n1 === n0 + 1 && n2 === n0 && n3 === n1, 'image collée : surligner, annuler, rétablir', `${n0} → ${n1} → ${n2} → ${n3}`);
  await b.clic(await b.pos(`[...document.querySelectorAll('.pdfr-barre button')].find(x=>(x.title||'').startsWith('Annuler'))`), { att: 900 });
  await b.clic(await b.bouton('Sélection'));
}
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
b.c.fermer();
