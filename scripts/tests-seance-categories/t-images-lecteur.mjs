// (24/10) Images collées du LECTEUR et de la FICHE JUMELLE (même composant ImageCollee + cadre de rognage commun).
// Copie des vraies données (profil isolé 9341 : CDP_PORT=9341), cours « Introduction 26 27 » (images réelles, fiche jumelle).
// Redimension (proportions, Maj = libre), Rogner (Entrée valide, Échap annule, Image entière = réversible), ⌘Z.
// Usage : CDP_PORT=9341 node t-images-lecteur.mjs
import { banc } from '../tests-pdfreader-v3/commun.mjs';
import { outilsImages } from './commun-images.mjs';
const b = await banc(1440, 900);
const o = outilsImages(b);
await b.ev(`localStorage.removeItem('medrevise.focus.notes');1`);
b.ok(await b.ouvrir('Introduction 26 27', { recharger: true }), 'cours « Introduction 26 27 » ouvert (vraies données copiées)');
await b.dormir(1500);
const anno = (id) => b.S(`return (await S.getAll('annotations')).find((a) => a.id === ${JSON.stringify(id)}) || null`);
const proche = (a, c, tol = 0.002) => Math.abs(a - c) <= tol;

async function scenario(nom, preparer) {
  const id = await preparer();
  b.ok(!!id, `${nom} : image sélectionnée`, id);
  const sel = `document.querySelector('.pdfr-image[data-objet="${id}"]')`;
  const a0 = await anno(id);
  // 1. redimension, proportions gardées
  await o.glisser(await o.coin(sel, 'se'), 60, 20);
  const a1 = await anno(id);
  b.ok(a1.width > a0.width * 1.05 && proche(a1.height / a1.width, a0.height / a0.width, 0.003) && proche(a1.x, a0.x) && proche(a1.y, a0.y),
    `${nom} : coin bas-droit → agrandie, proportions conservées, coin opposé fixe`, `${a0.width.toFixed(3)}×${a0.height.toFixed(3)} → ${a1.width.toFixed(3)}×${a1.height.toFixed(3)}`);
  await b.capture('img-' + nom + '-redim');
  // 2. Maj = libre
  await o.glisser(await o.coin(sel, 'nw'), 30, -40, { maj: true });
  const a2 = await anno(id);
  b.ok(!proche(a2.height / a2.width, a1.height / a1.width, 0.01) && proche(a2.x + a2.width, a1.x + a1.width) && proche(a2.y + a2.height, a1.y + a1.height),
    `${nom} : coin haut-gauche avec Maj → redimension libre (proportions changées), coin opposé fixe`);
  // les 4 coins répondent
  for (const c of ['ne', 'sw']) {
    const av = await anno(id);
    const p = await o.coin(sel, c);
    const sous = await b.ev(`(() => { const t = document.elementFromPoint(${p[0]}, ${p[1]}); return t ? t.className + ' < ' + (t.parentElement || {}).className : 'rien'; })()`);
    await o.glisser(p, c === 'ne' ? 20 : -20, c === 'ne' ? -10 : 10);
    const ap = await anno(id);
    b.ok(ap.width > av.width, `${nom} : coin ${c} → redimension`, ap.width > av.width ? '' : `coin en ${p.map(Math.round)} sous : ${sous}`);
  }
  // 3. ⌘Z × 4 (une entrée par geste) → géométrie d'origine
  for (let k = 0; k < 4; k++) await o.annulerZ();
  const a3 = await anno(id);
  b.ok(['x', 'y', 'width', 'height'].every((k) => proche(a3[k], a0[k], 1e-6)), `${nom} : ⌘Z × 4 → taille et position d’origine`);
  // 4. Rogner : cadre à poignées sur l'image entière, Entrée valide
  await b.clic(await b.pos(`document.querySelector('.mini-barre [data-option="rogner"]')`, false), { att: 500 });
  b.ok(await o.rgnOuvert() && !(await b.ev(`!!document.querySelector('.mini-barre [data-option="rogner"]')`)), `${nom} : « Rogner » ouvre le cadre de rognage (poignées, image entière en transparence)`);
  await o.glisser(await o.rgnCoin('nw'), 40, 30);
  await o.glisser(await o.rgnCoin('se'), -30, -20);
  await b.capture('img-' + nom + '-rognage');
  const ecran0 = await o.rect(sel);
  await o.entree();
  const a4 = await anno(id);
  const F0 = { x: a0.x, y: a0.y, w: a0.width, h: a0.height };
  const F4 = a4.rognage ? { x: a4.x - (a4.rognage.x / a4.rognage.w) * a4.width, y: a4.y - (a4.rognage.y / a4.rognage.h) * a4.height, w: a4.width / a4.rognage.w, h: a4.height / a4.rognage.h } : null;
  b.ok(!(await o.rgnOuvert()) && a4.rognage && a4.rognage.w < 1 && a4.rognage.h < 1 && F4 && proche(F4.x, F0.x, 1e-4) && proche(F4.w, F0.w, 1e-4) && proche(F4.y, F0.y, 1e-4),
    `${nom} : Entrée → rognage enregistré (non destructif : l’image entière reste en place, fichier inchangé)`, JSON.stringify(a4.rognage));
  b.ok(a4.blobId === a0.blobId, `${nom} : même fichier image (blobId inchangé)`);
  await b.capture('img-' + nom + '-rognee');
  // les poignées d'une image rognée sont entières (plus coupées par le corps rogné)
  const visibles = await b.ev(`(() => { const e = ${sel}; return [...e.querySelectorAll('.sel-coin')].map((c) => { const r = c.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return t === c; }); })()`);
  b.ok(visibles.length === 4 && visibles.every(Boolean), `${nom} : image rognée sélectionnée → 4 poignées entières et saisissables`);
  await o.glisser(await o.coin(sel, 'se'), 30, 30);
  const a4b = await anno(id);
  b.ok(a4b.width > a4.width && proche(a4b.height / a4b.width, a4.height / a4.width, 0.003) && JSON.stringify(a4b.rognage) === JSON.stringify(a4.rognage), `${nom} : image rognée redimensionnée (rognage conservé)`);
  await o.annulerZ();
  // 5. Échap annule
  await b.clic(await b.pos(`document.querySelector('.mini-barre [data-option="rogner"]')`, false), { att: 500 });
  await o.glisser(await o.rgnCoin('ne'), -40, 30);
  await o.echap();
  const a5 = await anno(id);
  b.ok(!(await o.rgnOuvert()) && JSON.stringify(a5.rognage) === JSON.stringify(a4.rognage) && proche(a5.width, a4.width, 1e-9), `${nom} : Échap → rognage en cours annulé, rien n’est écrit`);
  // 6. réversible : Rogner → Image entière → Entrée
  await b.clic(await b.pos(`document.querySelector('.mini-barre [data-option="rogner"]')`, false), { att: 500 });
  await b.clic(await b.pos(`document.querySelector('.rgn [data-rgn="entiere"]')`, false), { att: 300 });
  await o.entree();
  const a6 = await anno(id);
  b.ok(a6.rognage == null && ['x', 'y', 'width', 'height'].every((k) => proche(a6[k], a0[k], 1e-4)), `${nom} : « Image entière » → rognage retiré, image d’origine (réversible)`);
  // 7. ⌘Z : retour au rognage, puis à l'image sans rognage
  await o.annulerZ();
  const a7 = await anno(id);
  b.ok(JSON.stringify(a7.rognage) === JSON.stringify(a4.rognage), `${nom} : ⌘Z → le rognage revient`);
  await o.annulerZ();
  const a8 = await anno(id);
  b.ok(a8.rognage == null && ['x', 'y', 'width', 'height'].every((k) => proche(a8[k], a0[k], 1e-6)), `${nom} : ⌘Z → l’image entière d’origine`);
  void ecran0;
}

// COURS : image réelle de la page 95
await scenario('lecteur', async () => {
  // la vue (Original / Fiche) est mémorisée par cours : repartir de l'original
  const orig = await b.pos(`[...document.querySelectorAll('.pdfr-jumelle-bascule .seg-btn')].find(x=>x.innerText==='Original')`, false);
  if (orig) await b.clic(orig, { att: 1500 });
  await b.allerPage(95); await b.dormir(1000);
  await b.clic(await b.pos(`document.querySelector('[data-outil="main"]')`, false), { att: 300 });
  const id = await b.ev(`(() => { const e = [...document.querySelectorAll('.pdfr-page[data-cle="95"] .pdfr-image')][0]; return e ? e.dataset.objet : null; })()`);
  const r = await o.rect(`document.querySelector('.pdfr-image[data-objet="${id}"]')`);
  await b.clic([r.x + r.w / 2, r.y + r.h / 2], { att: 600 });
  return id;
});
// FICHE JUMELLE : une image collée sur la fiche
await scenario('fiche-jumelle', async () => {
  await b.clic(await b.pos(`[...document.querySelectorAll('.pdfr-jumelle-bascule .seg-btn')].find(x=>x.innerText==='Fiche')`, false), { att: 1800 });
  b.ok(await b.ev(`[...document.querySelectorAll('.pdfr-jumelle-bascule .seg-btn')].find(x=>x.innerText==='Fiche').getAttribute('aria-pressed') === 'true' || /actif|active/.test([...document.querySelectorAll('.pdfr-jumelle-bascule .seg-btn')].find(x=>x.innerText==='Fiche').className)`), 'fiche jumelle affichée');
  await b.clic(await b.pos(`document.querySelector('[data-outil="main"]')`, false), { att: 300 });
  const avant = new Set(await b.ev(`[...document.querySelectorAll('.pdfr-image')].map((e) => e.dataset.objet)`));
  await b.ev(`(document.querySelector('.pdfr-scroll').focus(), 1)`);
  await o.collerImage();
  await b.dormir(1500);
  const id = await b.ev(`(() => { const n = [...document.querySelectorAll('.pdfr-image')].map((e) => e.dataset.objet).filter((x) => !${JSON.stringify([...avant])}.includes(x)); return n[0] || null; })()`);
  const rec = id && await anno(id);
  b.ok(rec && /::fiche:/.test(rec.ficheId), 'image collée sur la fiche jumelle (calque de la fiche)', rec && rec.ficheId);
  if (!(await b.ev(`!!document.querySelector('.pdfr-image[data-objet="${id}"].active')`))) {
    const r = await o.rect(`document.querySelector('.pdfr-image[data-objet="${id}"]')`);
    await b.clic([r.x + r.w / 2, r.y + r.h / 2], { att: 600 });
  }
  return id;
});
b.ok(b.erreurs.length === 0, 'aucune erreur JS', b.erreurs.slice(0, 3).join(' | '));
process.exit(0);
