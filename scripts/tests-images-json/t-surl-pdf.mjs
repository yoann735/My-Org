// Chantier 2 : repasser au surligneur sur un PDF (texte natif ou OCR), à la portion près.
// node t-surl-pdf.mjs <ficheId> "<ligne>"   — le cours doit être ouvert
import { banc } from './commun-doc.mjs';
import { outilsSurl } from './surl-commun.mjs';
const B = await banc();
const { ev, ok, dormir } = B;
const U = outilsSurl(B);
const [ficheId, ligne, m1, m2, m3, m4, m5] = process.argv.slice(2);
const surl = () => B.S(`return (await S.getAll('highlights')).filter(h=>h.ficheId===${JSON.stringify(ficheId)}&&!h.imageId&&!h.source).map(h=>({id:h.id,c:h.couleur,t:h.texte,a:h.anchor&&[h.anchor.start.item,h.anchor.start.char,h.anchor.end.item,h.anchor.end.char]})).sort((x,y)=>(x.a[0]-y.a[0])||(x.a[1]-y.a[1]))`);
const resume = (l) => l.map((h) => `${h.c}:«${h.t}»`).join(' | ');
const disjoints = (l) => l.every((h, i) => i === 0 || (h.a[0] > l[i - 1].a[2] || (h.a[0] === l[i - 1].a[2] && h.a[1] >= l[i - 1].a[3])));
const couche = `document.querySelector('.pdfr-page[data-cle="1"] .pdfr-textlayer') || document.querySelector('.pdfr-textlayer')`;
await U.outil('Surligneur');
// 0. propre
const depart = await surl();
// 1. surligner « m1 … m3 » en ambre
await U.couleur('Ambre'); await U.glisser(await U.coords(couche, ligne, m1, m3));
let l = await surl();
ok(l.length === depart.length + 1, '1. surligné en ambre', resume(l));
// 2. repasser le MILIEU (m2) en ambre → retiré au milieu, scindé en deux
await U.glisser(await U.coords(couche, ligne, m2, m2));
l = await surl();
ok(l.length === depart.length + 2 && l.every((h) => !h.t.includes(m2)) && disjoints(l), '2. même couleur sur le milieu → retiré sur la portion, scindé en deux', resume(l));
await B.capture('surl-2-scinde-' + ficheId, { x: 150, y: 150, width: 900, height: 500 });
// 3. repasser « m3 … m4 » en vert sauge → la portion change de couleur, une seule couche
await U.couleur('Vert sauge'); await U.glisser(await U.coords(couche, ligne, m3, m4));
l = await surl();
ok(disjoints(l) && l.some((h) => h.c === 'vert' || h.c === 'sauge' || /vert/.test(h.c)) && !l.some((h) => h.c !== l.find((x) => x.t.includes(m4)).c && h.t.includes(m3)), '3. autre couleur → remplacée sur la portion (une seule couche)', resume(l));
// 4. resurligner m2 en ambre → fusion avec le morceau ambre voisin (blanc entre les deux)
await U.couleur('Ambre'); await U.glisser(await U.coords(couche, ligne, m2, m2));
l = await surl();
const ambres = l.filter((h) => h.c === l[0].c);
ok(disjoints(l) && l.some((h) => h.t.includes(m1) && h.t.includes(m2)), '4. adjacents de même couleur → fusionnés', resume(l));
// 5. aucun doublon visuel : rectangles de surlignage ne se superposent pas
const sup = await ev(`(()=>{const rs=[...document.querySelectorAll('.pdfr-page[data-cle="1"] .pdfr-hl-rect')].map(e=>e.getBoundingClientRect());let n=0;for(let i=0;i<rs.length;i++)for(let j=i+1;j<rs.length;j++){const a=rs[i],b=rs[j];const w=Math.min(a.right,b.right)-Math.max(a.left,b.left),h=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);if(w>2&&h>2)n++}return n})()`);
ok(sup === 0, '5. aucun rectangle superposé à l’écran', 'chevauchements : ' + sup);
await B.capture('surl-4-fusion-' + ficheId, { x: 150, y: 150, width: 900, height: 500 });
// 6. annuler 4 fois → état de départ ; rétablir 4 fois → état final
const fin = resume(l);
await ev(`document.activeElement&&document.activeElement.blur&&document.activeElement.blur(),1`);
for (let i = 0; i < 4; i++) { await B.touche('z', { meta: true, code: 'KeyZ', vk: 90 }); await dormir(500); }
l = await surl();
ok(resume(l) === resume(depart), '6. ⌘Z ×4 → retour à l’état de départ', resume(l) || '(aucun)');
for (let i = 0; i < 4; i++) { await B.touche('z', { meta: true, shift: true, code: 'KeyZ', vk: 90 }); await dormir(500); }
l = await surl();
ok(resume(l) === fin, '7. ⇧⌘Z ×4 → état final rétabli', resume(l));
ok(!B.erreurs.length, 'aucune exception JS', B.erreurs.join(' | '));
B.c.fermer();
