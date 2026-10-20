// (20/10 soir) Dock de couleurs : 12 couleurs vives dans l'ordre arc-en-ciel + noir, gris, blanc ; animation et
// rendu des pastilles inchangés ; variante surligneur à 40 % ; couleurs déjà posées inchangées (capture comparée à
// l'ancien code : node t-palette.mjs captures-seules sur l'ancien, puis node t-palette.mjs). Cours « Rein v3 ».
import { banc } from './commun.mjs';
import fs from 'node:fs';
const capturesSeules = process.argv[2] === 'captures-seules';
const b = await banc(1440, 900);
const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const ANCIENNES = [
  ...['ambre', 'jaune', 'orange', 'rouge', 'violet', 'poudre'].map((c, i) => ({ id: 'an-p-b' + i, ficheId: 'f-v3-rein', page: 1, x: 0.05 + i * 0.15, y: 0.55, width: 0.13, height: 0.05, kind: 'libre', type: 'boite', couleur: c, fond: 'plein', content: doc(c), createdAt: '2026-10-01T10:00:00.000Z' })),
  ...['ambre', 'orange', 'ardoise', 'noir', 'violet', 'rose'].map((c, i) => ({ id: 'an-p-t' + i, ficheId: 'f-v3-rein', page: 1, kind: 'trait', type: 'trait', mode: 'dessin', points: [[0.05 + i * 0.15, 0.75], [0.17 + i * 0.15, 0.8]], couleur: c, epaisseur: 0.008, opacite: 1, createdAt: '2026-10-01T10:00:00.000Z' })),
];
await b.S(`for(const a of await S.getAll('annotations'))if(a.ficheId==='f-v3-rein')await S.remove('annotations',a.id);
  for(const r of await S.getAll('reading_position'))if(String(r.id).startsWith('rp:f-v3-rein'))await S.remove('reading_position',r.id);
  for(const a of ${JSON.stringify(ANCIENNES)})await S.put('annotations',a);return 1`);
await b.biblio({ recharger: true });
await b.ouvrir('Rein v3'); await b.dormir(1500);
await b.ev(`window.__mrZoom(1);1`); await b.dormir(1200);
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0;1`); await b.dormir(1000);
await b.outil('Sélection'); await b.dormir(1500); // rendu posé (première capture trop tôt = faux écarts)
const P = await b.rect(`document.querySelector('.pdfr-page[data-cle="1"]')`);
const clip = { x: Math.round(P.x), y: Math.round(P.y + P.h * 0.5), width: Math.round(P.w), height: Math.round(P.h * 0.38) };
await b.capture('palette-anciennes-' + (capturesSeules ? 'capture' : 'apres'), clip);
if (capturesSeules) process.exit(0);
const avant = fs.existsSync('../cap/palette-anciennes-capture.png') ? fs.readFileSync('../cap/palette-anciennes-capture.png') : null;
const apres = fs.readFileSync('../cap/palette-anciennes-apres.png');
const ecart = avant ? JSON.parse(await b.ev(`Promise.all(['${avant.toString('base64')}','${apres.toString('base64')}'].map(s=>new Promise(ok=>{const i=new Image();i.onload=()=>{const k=document.createElement('canvas');k.width=i.width;k.height=i.height;const x=k.getContext('2d');x.drawImage(i,0,0);ok(x.getImageData(0,0,i.width,i.height).data)};i.src='data:image/png;base64,'+s}))).then(([p,q])=>{let n=0,max=0;for(let k=0;k<p.length;k+=4){const d=Math.max(Math.abs(p[k]-q[k]),Math.abs(p[k+1]-q[k+1]),Math.abs(p[k+2]-q[k+2]));if(d>0){n++;max=Math.max(max,d)}}return JSON.stringify({n,max,total:p.length/4})})`)) : null;
b.ok(ecart && ecart.max <= 2, 'couleurs déjà posées (boîtes ambre / jaune / orange / rouge / violet / poudre, traits) : identiques à l’ancien code (écart ≤ 2/255, anticrénelage)', JSON.stringify(ecart));
const ATTENDU = [['Rouge', '#e5383b'], ['Orange', '#ea6c0a'], ['Jaune', '#ffc400'], ['Vert', '#1e9e5a'], ['Cyan', '#0e9fbe'], ['Bleu', '#2563eb'], ['Violet', '#7c3aed'], ['Magenta', '#db2777'], ['Marron', '#8b5a2b'], ['Noir', '#1f1f24'], ['Gris', '#7a7a85'], ['Blanc', '#ffffff']];
const hex = (rgb) => '#' + rgb.match(/\d+/g).slice(0, 3).map((x) => (+x).toString(16).padStart(2, '0')).join('');
for (const outil of ['Surligneur', 'Crayon', 'Boîte', 'Forme', 'Texte']) {
  await b.outil(outil); await b.dormir(300);
  const pastilles = await b.ev(`[...document.querySelectorAll('.pdfr-contexte .sc-couleurs > .sc-pastille')].filter(p=>p.title!=='Couleur actuelle').map(p=>[p.getAttribute('aria-label')||p.title,getComputedStyle(p).backgroundColor])`);
  const vus = pastilles.slice(0, 12).map(([l, c]) => [l.split(' —')[0], hex(c)]);
  b.ok(JSON.stringify(vus) === JSON.stringify(ATTENDU), `${outil} : dock de 12 couleurs vives, ordre arc-en-ciel puis noir, gris, blanc`, vus.map((v) => v[1]).join(' '));
}
// rendu et animation des pastilles : mêmes règles qu'avant (taille, transition, survol)
await b.outil('Surligneur');
const p0 = await b.ev(`(()=>{const p=document.querySelector('.pdfr-contexte .sc-pastille');const s=getComputedStyle(p);return {w:s.width,h:s.height,rayon:s.borderRadius,transition:s.transition}})()`);
const pos = await b.pos(`document.querySelector('.pdfr-contexte .sc-pastille')`, false);
await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos[0], y: pos[1] }); await b.dormir(300);
const survol = await b.ev(`getComputedStyle(document.querySelector('.pdfr-contexte .sc-pastille')).transform`);
b.ok(p0.w === '18px' && p0.h === '18px' && p0.rayon === '50%' && /transform 0\.15s/.test(p0.transition) && /box-shadow 0\.15s/.test(p0.transition), 'pastilles : même taille, forme et transition qu’avant', JSON.stringify(p0));
b.ok(/matrix\(1\.12/.test(survol), 'survol : même animation (agrandissement × 1,12)', survol);
await b.capture('palette-dock', await b.ev(`(()=>{const r=document.querySelector('.pdfr-contexte').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.min(760,Math.round(r.width)),height:Math.round(r.height)}})()`));
// variante surligneur : 40 % d'opacité (palette vive)
await b.clic(await b.pos(`[...document.querySelectorAll('.pdfr-contexte .sc-pastille')].find(p=>(p.getAttribute('aria-label')||'').startsWith('Jaune'))`, false), { att: 200 });
const sp = await b.rect(`[...document.querySelectorAll('.pdfr-page[data-cle="1"] .pdfr-textlayer span')].find(s=>s.textContent.includes('Capsule'))`);
await b.glisser([sp.x + 2, sp.cy], [sp.x + sp.w * 0.7, sp.cy], 12); await b.dormir(600);
const hl = await b.S(`return (await S.getAll('highlights')).filter(h=>h.ficheId==='f-v3-rein').map(h=>h.couleur)`);
const op = await b.ev(`(()=>{const r=document.querySelector('.pdfr-page[data-cle="1"] .pdfr-hl-rect');return r?getComputedStyle(r).opacity:null})()`);
b.ok(hl.includes('jaune-vif') && op === '0.4', 'surlignage jaune vif posé, affiché à 40 % d’opacité', `${hl} · opacité ${op}`);
await b.S(`for(const h of await S.getAll('highlights'))if(h.ficheId==='f-v3-rein')await S.remove('highlights',h.id);return 1`);
await b.outil('Sélection');
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' / '));
process.exit(0);
