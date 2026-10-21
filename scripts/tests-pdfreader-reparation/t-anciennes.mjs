// Anciennes annotations : capture « avant » (ancien code) puis comparaison au pixel avec le nouveau code.
// Usage : node t-anciennes.mjs avant|apres [ipad]   (zooms 100 % et 160 %)
import { banc } from './commun.mjs';
import { ANCIENNES } from './anciennes.mjs';
const quand = process.argv[2] || 'apres', ipad = process.argv[3] === 'ipad';
const b = await banc(1440, 900, { tactile: ipad });
await b.preparer(ANCIENNES);
await b.ouvrirCours({ ipad });
await b.outil('Sélection'); await b.dormir(800);
for (const z of [1, 1.6]) {
  await b.ev(`window.__mrZoom(${z});1`); await b.dormir(1500);
  await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0;document.querySelector('.pdfr-scroll').scrollLeft=0;1`); await b.dormir(900);
  const P = await b.page(1);
  const nom = `anciennes-${ipad ? 'ipad-' : ''}${z * 100}-${quand}`;
  const vue = await b.rect(`document.querySelector('.pdfr-scroll')`);
  const x = Math.max(P.x, vue.x), y = Math.max(P.y, vue.y);
  await b.capture(nom, { x: Math.round(x), y: Math.round(y), width: Math.round(Math.min(P.r, vue.r) - x), height: Math.round(Math.min(P.b, vue.b) - y) });
  if (quand === 'apres') { const e = await b.ecart(nom.replace('-apres', '-avant'), nom); b.ok(e.n >= 0 && e.max <= 2, `anciennes annotations identiques à ${z * 100} %${ipad ? ' (iPad)' : ''}`, JSON.stringify(e)); }
  else console.log('capture', nom);
}
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
