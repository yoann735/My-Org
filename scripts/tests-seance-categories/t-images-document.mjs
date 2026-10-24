// (24/10) Image collée dans un DOCUMENT (éditeur TipTap, nœud image + documents/lib/imageVue.js) — copie des vraies
// données (profil isolé 9341 : CDP_PORT=9341), document « TD 2 Doc ». Redimension (proportions, Maj = libre), Rogner
// (cadre commun lib/rognageImage.js : Entrée valide, Échap annule, Image entière), ⌘Z.
// Usage : CDP_PORT=9341 node t-images-document.mjs [titre] [--avant]   (--avant : s'arrête après la redimension)
import { banc } from '../tests-pdfreader-v3/commun.mjs';
import { outilsImages } from './commun-images.mjs';
const TITRE = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'TD 2 Doc';
const AVANT = process.argv.includes('--avant');
const b = await banc(1440, 900);
const o = outilsImages(b);
b.ok(await b.ouvrir(TITRE, { recharger: true }), `document « ${TITRE} » ouvert`);
await b.dormir(1500);
await b.clic(await b.pos(`document.querySelector('[data-outil="main"]')`, false), { att: 300 });
// curseur dans le texte de la 1re page, puis ⌘V d'une image
const p = await b.pos(`document.querySelector('.ProseMirror p, .ProseMirror')`, true);
await b.clic(p, { att: 400 });
const avant = await b.ev(`(window.__ptiAvant = new Set(document.querySelectorAll('.ProseMirror .pti')), window.__ptiAvant.size)`);
await o.collerImage(`document.activeElement`);
await b.dormir(1500);
const n = await b.ev(`document.querySelectorAll('.ProseMirror .pti').length`);
b.ok(n === avant + 1, 'image collée dans le document (bloc image)', `${avant} → ${n}`);
const sel = `[...document.querySelectorAll('.ProseMirror .pti')].find((x) => !window.__ptiAvant.has(x))`;
await b.ev(`(() => { const e = ${sel}; window.__pti = e; e.scrollIntoView({ block: 'center' }); return 1; })()`);
await b.dormir(500);
const S = `window.__pti`;
const cadre = () => o.rect(`window.__pti.querySelector('.pti-cadre')`);
const attrs = () => b.ev(`(() => { const pm = window.__pti.closest('.ProseMirror'); const ed = pm.editor; let a = null; ed.state.doc.descendants((nd) => { if (nd.type.name === 'image' && nd.attrs.blobId && nd.attrs.src === window.__pti.querySelector('img').getAttribute('src')) a = nd.attrs; }); return a && { width: a.width, height: a.height, rognage: a.rognage || null, blobId: a.blobId }; })()`);
// sélection de l'image (clic dessus)
let r = await cadre();
await b.clic([r.x + r.w / 2, r.y + r.h / 2], { att: 500 });
const poignees = await b.ev(`(() => [...window.__pti.querySelectorAll('.pti-poignee')].map((k) => { const q = k.getBoundingClientRect(); const t = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2); return getComputedStyle(k).display !== 'none' && (t === k || k.contains(t)); }))()`);
b.ok(poignees.length === 4 && poignees.every(Boolean), 'image sélectionnée : 4 poignées d’angle visibles et saisissables', JSON.stringify(poignees));
const c0 = await cadre(); const a0 = await attrs();
await o.glisser(await o.coin(S, 'se'), -80, 0);
const c1 = await cadre(); const a1 = await attrs();
b.ok(c1.w < c0.w - 20 && Math.abs(c1.h / c1.w - c0.h / c0.w) < 0.02 && a1.width, 'coin bas-droit → réduite, proportions conservées', `${c0.w}×${c0.h} → ${c1.w}×${c1.h}`);
await o.glisser(await o.coin(S, 'nw'), 0, 40, { maj: true });
const c2 = await cadre(); const a2 = await attrs();
b.ok(Math.abs(c2.h / c2.w - c1.h / c1.w) > 0.03 && a2.height, 'coin haut-gauche avec Maj → libre (hauteur gardée)');
for (const c of ['ne', 'sw']) { const av = await cadre(); await o.glisser(await o.coin(S, c), c === 'ne' ? -30 : 30, 0); b.ok(Math.abs((await cadre()).w - av.w) > 10, `coin ${c} → redimension`); }
await b.capture('img-document-redim');
if (AVANT) { b.ok(b.erreurs.length === 0, 'aucune erreur JS', b.erreurs.slice(0, 3).join(' | ')); process.exit(0); }
for (let k = 0; k < 4; k++) await o.annulerZ();
const a3 = await attrs();
b.ok(a3 && a3.width === a0.width && a3.height === a0.height, '⌘Z × 4 → taille d’origine', JSON.stringify(a3));
// rognage
r = await cadre(); await b.clic([r.x + r.w / 2, r.y + r.h / 2], { att: 500 });
await b.clic(await b.pos(`window.__pti.querySelector('[data-option="rogner"]')`, false), { att: 600 });
b.ok(await o.rgnOuvert(), '« Rogner » (barre de l’image) ouvre le cadre de rognage');
await o.glisser(await o.rgnCoin('nw'), 50, 30);
await o.glisser(await o.rgnCoin('se'), -40, -20);
await b.capture('img-document-rognage');
const cr0 = await cadre();
await o.entree();
await b.dormir(400);
const a4 = await attrs(); const c4 = await cadre();
b.ok(a4.rognage && a4.rognage.w < 1 && a4.blobId === a0.blobId, 'Entrée → rognage enregistré dans le nœud (même fichier)', JSON.stringify(a4.rognage));
b.ok(Math.abs(c4.w - cr0.w * a4.rognage.w / 1) < cr0.w, 'cadre réduit à la partie gardée', `${cr0.w}×${cr0.h} → ${c4.w}×${c4.h}`);
const vis = await b.ev(`(() => { const i = window.__pti.querySelector('img'); const c = window.__pti.querySelector('.pti-cadre').getBoundingClientRect(); const ir = i.getBoundingClientRect(); return { cadre: [c.width, c.height], image: [ir.width, ir.height] }; })()`);
b.ok(vis.image[0] > vis.cadre[0] + 5, 'l’image entière est conservée (plus large que le cadre visible)', JSON.stringify(vis));
await b.capture('img-document-rognee');
// redimension d'une image rognée
r = await cadre(); await b.clic([r.x + r.w / 2, r.y + r.h / 2], { att: 500 });
await o.glisser(await o.coin(S, 'se'), 40, 0);
const a5 = await attrs(); const c5 = await cadre();
b.ok(c5.w > c4.w + 10 && Math.abs(c5.h / c5.w - c4.h / c4.w) < 0.02 && JSON.stringify(a5.rognage) === JSON.stringify(a4.rognage), 'image rognée redimensionnée (rognage et proportions conservés)');
await o.annulerZ();
// Échap
r = await cadre(); await b.clic([r.x + r.w / 2, r.y + r.h / 2], { att: 500 });
await b.clic(await b.pos(`window.__pti.querySelector('[data-option="rogner"]')`, false), { att: 600 });
await o.glisser(await o.rgnCoin('ne'), -30, 20);
await o.echap();
b.ok(JSON.stringify((await attrs()).rognage) === JSON.stringify(a4.rognage), 'Échap → rien n’est écrit');
// Image entière
r = await cadre(); await b.clic([r.x + r.w / 2, r.y + r.h / 2], { att: 500 });
await b.clic(await b.pos(`window.__pti.querySelector('[data-option="rogner"]')`, false), { att: 600 });
await b.clic(await b.pos(`document.querySelector('.rgn [data-rgn="entiere"]')`, false), { att: 300 });
await o.entree();
await b.dormir(400);
const a6 = await attrs(); const c6 = await cadre();
b.ok(!a6.rognage && Math.abs(c6.w - c0.w) < 3, '« Image entière » → rognage retiré, taille d’origine (réversible)', `${c6.w} vs ${c0.w}`);
await o.annulerZ();
b.ok(JSON.stringify((await attrs()).rognage) === JSON.stringify(a4.rognage), '⌘Z → le rognage revient');
await o.annulerZ();
const a8 = await attrs();
b.ok(a8 && !a8.rognage, '⌘Z → image entière', JSON.stringify(a8) + ' focus ' + await b.ev(`document.activeElement.className`));
b.ok(b.erreurs.length === 0, 'aucune erreur JS', b.erreurs.slice(0, 3).join(' | '));
process.exit(0);
