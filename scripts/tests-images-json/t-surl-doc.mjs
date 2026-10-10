// Chantier 2 : repasser au surligneur sur le TEXTE d'un document (marques notion), à la portion près.
// Pré-requis : « Document neuf J » ouvert.
import { banc } from './commun-doc.mjs';
import { outilsSurl } from './surl-commun.mjs';
const B = await banc();
const { ev, ok, dormir } = B;
const U = outilsSurl(B);
const notions = () => ev(`(()=>{const ed=document.querySelector('.pt-flux').editor;const runs=[];ed.state.doc.descendants((n,pos)=>{if(!n.isText)return;const m=n.marks.find(x=>x.type.name==='notion');if(!m)return;const d=runs[runs.length-1];if(d&&d.id===m.attrs.id&&d.to===pos){d.to=pos+n.nodeSize;d.t+=n.text}else runs.push({id:m.attrs.id,c:m.attrs.couleur,from:pos,to:pos+n.nodeSize,t:n.text})});return runs})()`);
const resume = (l) => l.map((h) => `${h.c}:«${h.t}»`).join(' | ');
const disjoints = (l) => l.every((h, i) => i === 0 || h.from >= l[i - 1].to);
const flux = `document.querySelector('.pt-flux')`;
const L = 'Paragraphe 1. Le cycle de Krebs';
await U.outil('Surligneur');
const depart = await notions();
await U.couleur('Ambre'); await U.glisser(await U.coords(flux, L, 'cycle', 'matrice'));
let l = await notions();
ok(l.length === depart.length + 1, '1. surligné en ambre', resume(l));
await U.glisser(await U.coords(flux, L, 'Krebs', 'Krebs'));
l = await notions();
ok(l.length === depart.length + 2 && !l.some((h) => h.t.includes('Krebs')) && new Set(l.map((h) => h.id)).size === l.length, '2. même couleur au milieu → retiré, scindé en deux notions (ids distincts)', resume(l));
await U.couleur('Vert sauge'); await U.glisser(await U.coords(flux, L, 'déroule', 'mitochondriale'));
l = await notions();
ok(disjoints(l) && l.filter((h) => h.t.includes('déroule')).length === 1 && l.find((h) => h.t.includes('déroule')).c !== 'ambre', '3. autre couleur → remplacée sur la portion, une seule couche', resume(l));
await U.couleur('Ambre'); await U.glisser(await U.coords(flux, L, 'Krebs', 'Krebs'));
l = await notions();
ok(disjoints(l) && l.some((h) => h.t.includes('cycle') && h.t.includes('Krebs')), '4. adjacents de même couleur → fusionnés', resume(l));
await B.capture('surl-doc', { x: 150, y: 250, width: 900, height: 300 });
// notions enregistrées (panneau Notions) = marques du texte
await dormir(2500);
const recs = await B.S(`return (await S.getAll('highlights')).filter(h=>h.ficheId==='j-doc2'&&h.source==='doc').map(h=>h.couleur+':«'+h.texte+'»').sort()`);
ok(JSON.stringify(recs) === JSON.stringify(l.map((h) => `${h.c}:«${h.t.trim()}»`).sort()), '5. notions enregistrées = passages surlignés', JSON.stringify(recs));
const fin = resume(l);
await ev(`document.activeElement&&document.activeElement.blur&&document.activeElement.blur(),1`);
for (let i = 0; i < 4; i++) { await B.touche('z', { meta: true, code: 'KeyZ', vk: 90 }); await dormir(500); }
l = await notions();
ok(resume(l) === resume(depart), '6. ⌘Z ×4 → état de départ', resume(l) || '(aucune)');
for (let i = 0; i < 4; i++) { await B.touche('z', { meta: true, shift: true, code: 'KeyZ', vk: 90 }); await dormir(500); }
l = await notions();
ok(resume(l) === fin, '7. ⇧⌘Z ×4 → état final', resume(l));
ok(!B.erreurs.length, 'aucune exception JS', B.erreurs.join(' | '));
B.c.fermer();
