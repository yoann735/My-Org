// Deux gestes de zoom rapprochés (molette + Ctrl = pincement du trackpad), puis mesure : largeur de chaque morceau de la
// couche de texte comparée à sa largeur exacte (item.width × scale) — un écart = couche construite sous transformation.
import { connecter } from '../tests-pdfreader-v2/cdp.mjs';
const c = await connecter('5302');
const roue = (dy) => c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 700, y: 450, deltaX: 0, deltaY: dy, modifiers: 2 });
const mesure = () => c.ev(`(async () => {
  const P = await import('/src/medrevise/pdf/pdfShared.js');
  const out = [];
  for (const pg of document.querySelectorAll('.pdfr-page[data-cle]')) {
    const l = pg.querySelector('.pdfr-textlayer'); const g = l.__mrGlyphes; if (!g) continue;
    let pire = 0, n = 0;
    for (const sp of l.querySelectorAll('span')) { const d = g.parSpan.get(sp); if (!d || !d.largeur || d.str.trim().length < 4) continue;
      const lr = l.getBoundingClientRect(), k = lr.width / l.offsetWidth; // transformation éventuelle encore active
      const w = sp.getBoundingClientRect().width / k, cible = d.largeur * (l.offsetWidth / g.page.view[2]);
      pire = Math.max(pire, Math.abs(w / cible - 1)); n++; }
    out.push(pg.dataset.cle + ':' + (pire * 100).toFixed(1) + '%');
  }
  return out.join(' ');
})()`);
console.log('avant', await mesure());
for (let i = 0; i < 8; i++) { await roue(-12); await c.dormir(20); }
await c.dormir(+process.argv[2] || 230); // le zoom est posé, le rendu (150 ms) démarre…
for (let i = 0; i < 40; i++) { await roue(i % 2 ? -3 : 3); await c.dormir(30); } // … pendant un 2e geste
await c.dormir(2500);
console.log('après', await mesure());
process.exit(0);
