// TÉLÉPHONE (390 × 844, tactile) : l'app s'ouvre sans erreur ; en séance (bloc Nouvelles), les cartes faites depuis des
// boîtes (t-flashcard.mjs, à lancer avant) s'affichent : verso mis en forme, image, carte Tableau avec couleurs et fusion.
// (Sur téléphone il n'y a ni lecteur ni tableau Miro : les boîtes ne s'y éditent pas — inchangé.)
import { banc } from './commun.mjs';
const b = await banc();
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await b.c.send('Page.reload', { ignoreCache: true }); await b.dormir(4000);
for (let i = 0; i < 30; i++) {
  const ou = await b.ev(`document.querySelector('[data-sfa="lanceur"]') ? 'app' : document.querySelector('.hub-card') ? 'hub' : ''`);
  if (ou === 'app') break;
  if (ou === 'hub') await b.ev(`[...document.querySelectorAll('.hub-card')].find(x=>/MedRevise/i.test(x.innerText))?.click();1`);
  await b.dormir(500);
}
b.ok(await b.ev(`innerWidth===390 && !!document.querySelector('[data-sfa="lanceur"]')`), 'téléphone : l’app s’ouvre (accueil, lanceur de séance)');
const cibles = await b.S(`return (await S.getAll('questions')).filter(q=>q.source&&q.source.boiteId).map(q=>({id:q.id,recto:q.recto,boite:q.source.boiteId}))`);
b.ok(cibles.length >= 4, 'cartes faites depuis des boîtes présentes : ' + cibles.length);
const tap = async (js, att = 500) => { const r = await b.rect(js); if (!r) return false; await b.c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.cx, y: r.cy }] }); await b.dormir(50); await b.c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await b.dormir(att); return true; };
await tap(`document.querySelector('[data-raccourci="blocNouvelles"]')`);
await b.ev(`(()=>{const s=document.querySelector('[data-sfa="lanceur"] [data-cat="nouvelles"] select');const P=HTMLSelectElement.prototype;Object.getOwnPropertyDescriptor(P,'value').set.call(s,'tout');s.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`);
await tap(`document.querySelector('[data-sfa="demarrer"]')`, 1500);
const vus = {};
for (let k = 0; k < 40 && Object.keys(vus).length < cibles.length; k++) {
  if (!(await b.ev(`!!document.querySelector('.sfc-carte')`))) break;
  const rectoVu = await b.ev(`(()=>{const c=document.querySelector('.sfc-carte');return {t:c.innerText.slice(0,140),img:!!c.querySelector('img')}})()`);
  await tap(`document.querySelector('.sfc-carte')`, 700);
  const v = await b.ev(`(()=>{const c=document.querySelector('.sfc-carte');const t=c.innerText;return {t:t.slice(0,140),strong:!!c.querySelector('.sfc-verso strong'),img:!!c.querySelector('img'),grille:!!c.querySelector('[data-grille]'),fond:(()=>{const td=c.querySelector('[data-grille] td');return td?getComputedStyle(td).backgroundColor:null})(),fusion:!!c.querySelector('[data-grille] td[rowspan="2"]')}})()`);
  v.recto = rectoVu.t; v.imgRecto = rectoVu.img;
  const cible = cibles.find((x) => rectoVu.t.includes(x.recto) || v.t.includes(x.recto));
  if (cible) { vus[cible.boite] = v; if (cible.boite === 'bf-tab') await b.capture('bt-mobile-carte-tableau'); if (cible.boite === 'bf-txt') await b.capture('bt-mobile-carte-texte'); }
  if (!(await tap(`document.querySelector('[data-nouvelle="garder"]')`, 900))) break;
}
b.ok(vus['bf-txt'] && vus['bf-txt'].strong, 'téléphone : carte « Néphron » — verso mis en forme (gras)', JSON.stringify(vus['bf-txt']));
b.ok(vus['bf-img'] && vus['bf-img'].imgRecto, 'téléphone : carte avec l’image de la boîte', JSON.stringify(vus['bf-img']));
b.ok(vus['bf-tab'] && vus['bf-tab'].grille && vus['bf-tab'].fusion && vus['bf-tab'].fond && !/rgba\(0, 0, 0, 0\)/.test(vus['bf-tab'].fond), 'téléphone : carte Tableau — couleurs et fusion', JSON.stringify(vus['bf-tab']));
b.ok(!b.erreurs.length, 'téléphone : aucune erreur', b.erreurs.join(' | '));
await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: false });
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
process.exit(0);
