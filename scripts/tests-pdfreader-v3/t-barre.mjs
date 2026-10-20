// (20/10) Rangée de couleurs : changer d'outil 10 fois (et revenir à Sélection) ne doit JAMAIS déplacer le document
// — position d'un mot de la couche de texte mesurée après chaque changement, au pixel. Ordinateur et tablette.
// Usage : node t-barre.mjs <avant|apres> [ordi|tablette]
import { banc } from './commun.mjs';
const etiquette = process.argv[2] || 'apres', appareil = process.argv[3] || 'ordi';
const [W, H] = appareil === 'tablette' ? [1024, 1366] : [1440, 900];
const b = await banc(1440, 900, { tactile: appareil === 'tablette' });
await b.biblio({ recharger: true });
await b.ouvrir('Rein v3'); await b.dormir(1500);
if (appareil === 'tablette') { await b.c.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true }); await b.dormir(1800); }
await b.outil('Sélection');
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=40;1`); await b.dormir(900);
const mot = () => b.ev(`(()=>{const s=[...document.querySelectorAll('.pdfr-textlayer span')].find(x=>x.textContent.trim().length>4&&x.getBoundingClientRect().top>120);const r=s.getBoundingClientRect();return {t:s.textContent.trim().slice(0,20),x:+r.left.toFixed(2),y:+r.top.toFixed(2)}})()`);
const ref = await mot();
await b.capture(`barre-${etiquette}-${appareil}-selection`, { x: 0, y: 0, width: W, height: 260 });
const outils = ['Surligneur', 'Boîte', 'Texte', 'Forme', 'Crayon', 'Gomme', 'Surligneur', 'Crayon', 'Boîte', 'Sélection'];
let maxDy = 0, maxDx = 0; const releves = [];
for (const o of outils) {
  await b.outil(o);
  // pendant le fondu (60 ms) puis après
  await b.dormir(60); const m1 = await mot();
  await b.dormir(300); const m2 = await mot();
  for (const m of [m1, m2]) { maxDy = Math.max(maxDy, Math.abs(m.y - ref.y)); maxDx = Math.max(maxDx, Math.abs(m.x - ref.x)); }
  releves.push(`${o}:${(m2.y - ref.y).toFixed(1)}`);
  if (o === 'Crayon' && !releves.some((r) => r.startsWith('cap'))) { releves.push('cap'); await b.capture(`barre-${etiquette}-${appareil}-crayon`, { x: 0, y: 0, width: W, height: 260 }); }
}
console.log('MESURE', JSON.stringify({ etiquette, appareil, mot: ref.t, maxDy, maxDx, releves: releves.join(' ') }));
if (etiquette === 'apres') b.ok(maxDy === 0 && maxDx === 0, `${appareil} : 10 changements d'outil, le document ne bouge pas d'un pixel`, `Δy max ${maxDy}, Δx max ${maxDx}`);
// les couleurs restent au même endroit : 1re pastille de la rangée, avec deux outils différents
const pastille = async () => b.ev(`(()=>{const p=document.querySelector('.pdfr-contexte .sc-pastille');if(!p)return null;const r=p.getBoundingClientRect();return [Math.round(r.left),Math.round(r.top)]})()`);
await b.outil('Surligneur'); const p1 = await pastille(); await b.outil('Boîte'); const p2 = await pastille(); await b.outil('Crayon'); const p3 = await pastille();
console.log('pastilles', JSON.stringify([p1, p2, p3]));
if (etiquette === 'apres') b.ok(p1 && p2 && p3 && p1[1] === p2[1] && p2[1] === p3[1], `${appareil} : la rangée de couleurs est toujours à la même hauteur`, JSON.stringify([p1, p2, p3]));
await b.outil('Sélection');
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' / '));
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
process.exit(0);
