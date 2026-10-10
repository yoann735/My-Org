// Chantier 2 : mots OCR d'une IMAGE (image d'un document : notions du nœud ; image collée sur un PDF :
// surlignages imageId+mots). node t-surl-mots.mjs doc|pdf  — le cours doit être ouvert
import { banc } from './commun-doc.mjs';
import { outilsSurl } from './surl-commun.mjs';
const B = await banc();
const { ev, ok, dormir } = B;
const U = outilsSurl(B);
const mode = process.argv[2];
const calque = mode === 'doc' ? `document.querySelector('.pt-flux .pti .pti-texte')` : `document.querySelector('.pdfr-image .pi-texte')`;
for (let i = 0; i < 30 && !(await ev(`!!(${calque}) && (${calque}).textContent.includes('pyruvate')`)); i++) await dormir(1000);
const etat = mode === 'doc'
  ? () => ev(`(()=>{const ed=document.querySelector('.pt-flux').editor;let r=null;ed.state.doc.forEach(n=>{if(!r&&n.type.name==='image'&&n.attrs.ocr)r=n.attrs});const t=(ids)=>ids.map(i=>r.ocr.mots[i].t).join(' ');return (r.notions||[]).map(n=>({id:n.id,c:n.couleur,m:n.mots,t:t(n.mots)})).sort((a,b)=>a.m[0]-b.m[0])})()`)
  : () => B.S(`return (await S.getAll('highlights')).filter(h=>h.imageId&&!h.convertieEnFlux).map(h=>({id:h.id,c:h.couleur,m:h.mots,t:h.texte})).sort((a,b)=>a.m[0]-b.m[0])`);
const resume = (l) => l.map((h) => `${h.c}:«${h.t}»`).join(' | ');
const disjoints = (l) => { const vus = new Set(); for (const h of l) for (const i of h.m) { if (vus.has(i)) return false; vus.add(i); } return true; };
await U.outil('Surligneur');
const depart = await etat();
await U.couleur('Ambre'); await U.glisser(await U.coords(calque, 'glucose', 'glucose', 'lactate'));
let l = await etat();
ok(l.length === depart.length + 1, '1. mots surlignés en ambre', resume(l));
await U.glisser(await U.coords(calque, 'pyruvate', 'pyruvate', 'pyruvate'));
l = await etat();
ok(l.length === depart.length + 2 && !l.some((h) => h.t.includes('pyruvate')) && disjoints(l), '2. même couleur au milieu → retiré, scindé', resume(l));
await U.couleur('Vert sauge'); await U.glisser(await U.coords(calque, 'lactate', 'lactate', 'lactate'));
l = await etat();
ok(disjoints(l) && l.find((h) => h.t.includes('lactate')).c !== 'ambre', '3. autre couleur → remplacée, une seule couche', resume(l));
await U.couleur('Ambre'); await U.glisser(await U.coords(calque, 'pyruvate', 'pyruvate', 'pyruvate'));
l = await etat();
ok(disjoints(l) && l.some((h) => h.t.includes('glucose') && h.t.includes('pyruvate')), '4. adjacents de même couleur → fusionnés', resume(l));
const fin = resume(l);
await ev(`document.activeElement&&document.activeElement.blur&&document.activeElement.blur(),1`);
for (let i = 0; i < 4; i++) { await B.touche('z', { meta: true, code: 'KeyZ', vk: 90 }); await dormir(600); }
l = await etat();
ok(resume(l) === resume(depart), '5. ⌘Z ×4 → état de départ', resume(l) || '(aucun)');
for (let i = 0; i < 4; i++) { await B.touche('z', { meta: true, shift: true, code: 'KeyZ', vk: 90 }); await dormir(600); }
l = await etat();
ok(resume(l) === fin, '6. ⇧⌘Z ×4 → état final', resume(l));
ok(!B.erreurs.length, 'aucune exception JS', B.erreurs.join(' | '));
B.c.fermer();
