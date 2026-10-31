// Espace entre deux lignes (31/10, docs/compte-rendu-synchro-rapide-surlignage-listes.md « Espace entre deux lignes »).
// PDF imprimé par Chrome (fx/deux-lignes.pdf : 3 paragraphes étroits, Georgia, justifié, Avenir — HTML dans le compte
// rendu) : 9 coupures de ligne, que l'ancienne lecture (range.toString()) recollait toutes (« commeexemple »). Comme un utilisateur : outil Surligneur, glisser À LA SOURIS du 1er caractère
// du dernier mot d'une ligne au dernier caractère du 1er mot de la ligne suivante → le texte enregistré est « mot1 mot2 »
// (avant : « mot1mot2 »). Aussi : passages sur une ligne (aucune espace ajoutée), sur trois lignes, et un surlignage
// enregistré AVANT le correctif (« exemplepositif ») qui reste affiché depuis son ancre (rects stockés volontairement faux).
// Banc : Vite :5302 sans Supabase + Chrome headless 9337 :
//   CDP_PORT=9337 CDP_FILTRE=5302 FX=<dossier contenant deux-lignes.pdf> node t-deux-lignes.mjs
import { banc } from '../tests-pdfreader-v3/commun.mjs';
import fs from 'node:fs';
const b = await banc(1440, 900);
let echecs = 0; const v = (c, m, d = '') => { b.ok(!!c, m, d); if (!c) echecs++; return c; };
const souris = (type, x, y, extra = {}) => b.c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
const glisser = async (de, a, pas = 12) => {
  await souris('mouseMoved', de[0], de[1]); await souris('mousePressed', de[0], de[1]);
  for (let k = 1; k <= pas; k++) { await souris('mouseMoved', de[0] + (a[0] - de[0]) * k / pas, de[1] + (a[1] - de[1]) * k / pas, { buttons: 1 }); await b.dormir(25); }
  await souris('mouseReleased', a[0], a[1]); await b.dormir(700);
};
await b.semer('f-2l', 'Deux lignes', 'deux-lignes.pdf');
await b.S(`for (const h of await S.getAll('highlights')) if (h.ficheId === 'f-2l') await S.remove('highlights', h.id); return 1;`);
await b.biblio({ recharger: true }); await b.ouvrir('Deux lignes'); await b.dormir(2000);
await b.ev(`window.__mrZoom && window.__mrZoom(1.2); 1`); await b.dormir(1500); await b.allerPage(1); await b.dormir(2500);
// mots de la page : position de leur 1er et dernier caractère (Range sur le texte), ligne = haut du morceau arrondi
const mots = () => b.ev(`(() => {
  const layer = document.querySelector('.pdfr-page[data-cle="1"] .pdfr-textlayer'); const out = []; let i = 0;
  for (const sp of layer.querySelectorAll('span')) { const t = sp.firstChild; i++; if (!t || t.nodeType !== 3) continue;
    for (const m of t.textContent.matchAll(/\\S+/gu)) {
      const r = document.createRange(); r.setStart(t, m.index); r.setEnd(t, m.index + 1); const a = r.getBoundingClientRect();
      r.setStart(t, m.index + m[0].length - 1); r.setEnd(t, m.index + m[0].length); const z = r.getBoundingClientRect();
      out.push({ mot: m[0], g: a.left + 0.5, d: z.right - 0.5, y: (a.top + a.bottom) / 2, haut: a.top, h: a.height });
    } }
  return out; })()`);
const M = await mots();
// lignes : un nouveau mot plus bas d'une demi-hauteur ouvre une ligne
let L = 0; M.forEach((m, k) => { if (k && m.haut > M[k - 1].haut + m.h / 2) L++; m.ligne = L; });
const fins = M.map((m, k) => (M[k + 1] && M[k + 1].ligne === m.ligne + 1 && /^\p{L}/u.test(m.mot) && /^\p{L}/u.test(M[k + 1].mot) ? k : -1)).filter((k) => k >= 0);
v(fins.length >= 6, `PDF : ${M.length} mots, ${L + 1} lignes, ${fins.length} passages « dernier mot / premier mot de la ligne suivante »`);
const vider = async () => {
  await b.S(`for (const h of await S.getAll('highlights')) if (h.ficheId === 'f-2l') await S.remove('highlights', h.id); return 1;`);
  await b.biblio({ recharger: true }); await b.ouvrir('Deux lignes'); await b.dormir(2000);
  await b.ev(`window.__mrZoom && window.__mrZoom(1.2); 1`); await b.dormir(1500); await b.allerPage(1); await b.dormir(2500);
  await b.outil('Surligneur'); await b.dormir(300);
};
// lecture ANCIENNE (range.toString()) et NOUVELLE (texteDeRange) de l'ancre d'un surlignage enregistré
const lectures = (id) => b.ev(`(async () => { const P = await import('/src/medrevise/pdf/pdfShared.js'); const S = await import('/src/medrevise/lib/storage.js');
  const h = await S.getOne('highlights', ${JSON.stringify(id)}); const r = P.rangeFromAnchor(document.querySelector('.pdfr-page[data-cle="1"] .pdfr-textlayer'), h.anchor);
  return r ? { ancienne: P.cleanSelectedText(r.toString(), { inline: true }), nouvelle: P.cleanSelectedText(P.texteDeRange(r), { inline: true }) } : null; })()`);
await b.outil('Surligneur'); await b.dormir(300);
const surligner = async (i, j) => {
  const avant = await b.S(`return (await S.getAll('highlights')).filter((h) => h.ficheId === 'f-2l').map((h) => h.id)`);
  await glisser([Math.ceil(M[i].g), M[i].y], [Math.floor(M[j].d), M[j].y]);
  return b.S(`return (await S.getAll('highlights')).filter((h) => h.ficheId === 'f-2l' && !${JSON.stringify(avant)}.includes(h.id)).map((h) => ({ id: h.id, texte: h.texte }))[0] || null`);
};
const ponct = (s) => s.replace(/[,.;:!?]+$/, '');
// 1. toutes les coupures de ligne (dont « exemple positif ») — 6 au plus
const choix = fins.filter((k, n) => n % 2 === 0).slice(0, 5); // une coupure sur deux : jamais deux surlignages contigus
for (const k of choix) {
  const h = await surligner(k, k + 1);
  const att = M[k].mot + ' ' + M[k + 1].mot;
  const l = h && await lectures(h.id);
  // l'ancienne lecture recollait les deux mots (preuve que le passage est bien une coupure que le correctif répare)
  v(h && ponct(h.texte) === ponct(att) && l && !/\s/.test(l.ancienne) && l.ancienne === att.replace(' ', ''),
    `deux lignes : « ${att} » → enregistré « ${h && h.texte} » (ancienne lecture : « ${l && l.ancienne} »)`);
}
// 2. une ligne seule (3 mots) : aucune espace ajoutée ni perdue
await vider();
const k3 = M.findIndex((m, k) => M[k + 2] && M[k + 2].ligne === m.ligne);
let h = await surligner(k3, k3 + 2);
v(h && ponct(h.texte) === ponct(M.slice(k3, k3 + 3).map((m) => m.mot).join(' ')), `une ligne : « ${M.slice(k3, k3 + 3).map((m) => m.mot).join(' ')} » → « ${h && h.texte} »`);
// 3. trois lignes : de l'avant-dernier mot d'une ligne au 1er mot de la ligne + 2
const l3 = fins.find((k) => M.findIndex((m) => m.ligne === M[k].ligne + 2) > 0 && M[k - 1] && M[k - 1].ligne === M[k].ligne);
if (l3 != null) {
  const j = M.findIndex((m) => m.ligne === M[l3].ligne + 2);
  await vider();
  h = await surligner(l3 - 1, j);
  const att = M.slice(l3 - 1, j + 1).map((m) => m.mot).join(' ');
  v(h && ponct(h.texte) === ponct(att), `trois lignes : « ${att} » → « ${h && h.texte} »`);
}
await b.outil('Sélection').catch(() => {}); await b.ev(`getSelection().removeAllRanges(); 1`); await b.dormir(300);
const s = await b.c.send('Page.captureScreenshot', { format: 'png' });
fs.mkdirSync('../cap', { recursive: true }); fs.writeFileSync('../cap/deux-lignes-apres.png', Buffer.from(s.data, 'base64'));
// 4. surlignage enregistré AVANT le correctif : texte « exemplepositif », ancre juste, rects stockés faux (coin haut gauche)
const ancre = await b.ev(`(async () => { const P = await import('/src/medrevise/pdf/pdfShared.js');
  const layer = document.querySelector('.pdfr-page[data-cle="1"] .pdfr-textlayer'); const spans = [...layer.querySelectorAll('span')];
  const i = spans.findIndex((s) => s.nextSibling && s.nextSibling.nodeName === 'BR' && /\\S$/.test(s.textContent) && spans.indexOf(s) + 1 < spans.length); const j = i + 1;
  if (i < 0) return null; const a = spans[i].textContent.search(/\\S+$/); const z = spans[j].textContent.search(/\\s|$/);
  const r = P.rangeFromAnchor(layer, { v: 1, start: { item: i, char: a }, end: { item: j, char: z } });
  return { anchor: { v: 1, start: { item: i, char: a }, end: { item: j, char: z } }, ancien: P.cleanSelectedText(r.toString(), { inline: true }), nouveau: P.cleanSelectedText(P.texteDeRange(r), { inline: true }) }; })()`);
v(ancre && !/\s/.test(ancre.ancien) && ancre.nouveau.includes(' ') && ancre.nouveau.replace(' ', '') === ancre.ancien, `même plage sur une coupure : ancienne lecture « ${ancre && ancre.ancien} », nouvelle « ${ancre && ancre.nouveau} »`);
await b.S(`for (const h of await S.getAll('highlights')) if (h.ficheId === 'f-2l') await S.remove('highlights', h.id);
  await S.put('highlights', { id: 'hl-ancien', ficheId: 'f-2l', page: 1, couleur: 'jaune', texte: ${JSON.stringify(ancre && ancre.ancien)}, anchor: ${JSON.stringify(ancre && ancre.anchor)}, rects: [{ x: 0.01, y: 0.01, width: 0.05, height: 0.01 }], createdAt: '2026-10-29T10:00:00.000Z' }); return 1;`);
await b.biblio({ recharger: true }); await b.ouvrir('Deux lignes'); await b.dormir(2000);
await b.ev(`window.__mrZoom && window.__mrZoom(1.2); 1`); await b.dormir(1500); await b.allerPage(1); await b.dormir(2500);
const M2 = await mots();
const ex = M2.find((m) => ancre && m.mot === ancre.nouveau.split(' ')[0]);
const bandes = await b.ev(`[...document.querySelectorAll('.pdfr-page[data-cle="1"] .pdfr-hl-rect[data-hl="hl-ancien"]')].map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; })`);
v(bandes.length === 2 && ex && bandes.some((x) => ex.y >= x.t && ex.y <= x.b && x.l <= ex.g + 1), `ancien surlignage « ${ancre && ancre.ancien} » : toujours affiché depuis son ancre (2 bandes sur les mots, pas les rects stockés)`, JSON.stringify(bandes.map((x) => [Math.round(x.l), Math.round(x.t)])));
v((await b.S(`return (await S.getOne('highlights','hl-ancien')).texte`)) === (ancre && ancre.ancien), 'ancien surlignage : son texte n’est pas réécrit');
await b.S(`await S.remove('highlights', 'hl-ancien'); return 1;`);
// 5. PDF SANS marque de fin de ligne (pas de <br>) : morceaux posés à la main sur deux lignes, et deux morceaux d'une
// même ligne qui coupent un mot (pdf.js le fait) — lecture de texteDeRange
const synth = await b.ev(`(async () => { const P = await import('/src/medrevise/pdf/pdfShared.js');
  const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:200px;font:16px serif';
  const sp = (t, x, y) => { const s = document.createElement('span'); s.textContent = t; s.style.cssText = 'position:absolute;white-space:pre;left:' + x + 'px;top:' + y + 'px'; d.appendChild(s); return s; };
  const a = sp('un exemple', 10, 10), b2 = sp('positif du', 10, 40), c = sp('dépis', 10, 70), e = sp('tage', 46, 70), f = sp('fin ', 10, 100), g = sp('suite', 10, 130);
  document.body.appendChild(d);
  const lire = (n1, o1, n2, o2) => { const r = document.createRange(); r.setStart(n1.firstChild, o1); r.setEnd(n2.firstChild, o2); return [r.toString(), P.texteDeRange(r)]; };
  const out = { deuxLignes: lire(a, 3, b2, 7), memeLigne: lire(c, 0, e, 4), blancDejaLa: lire(f, 0, g, 5) };
  d.remove(); return out; })()`);
v(synth.deuxLignes[0] === 'exemplepositif' && synth.deuxLignes[1] === 'exemple positif', `sans <br>, deux lignes : « ${synth.deuxLignes[0]} » → « ${synth.deuxLignes[1]} »`);
v(synth.memeLigne[1] === 'dépistage', `sans <br>, un mot coupé en deux morceaux sur la même ligne : « ${synth.memeLigne[1]} » (pas d'espace ajoutée)`);
v(synth.blancDejaLa[1] === 'fin suite', `blanc déjà présent en fin de morceau : « ${synth.blancDejaLa[1]} » (pas de double espace)`);
v(b.erreurs.length === 0, 'aucune erreur console', b.erreurs.join(' | ').slice(0, 300));
console.log(echecs ? `❌ ${echecs} échec(s)` : '✅ tout est vert');
process.exit(0);
