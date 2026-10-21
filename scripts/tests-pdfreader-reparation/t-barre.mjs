// Barre d'outils : capture (ordinateur + tablette) avec l'outil Crayon, liste des outils dans l'ordre, raccourcis ⌘1–9.
// Usage : node t-barre.mjs <suffixe> [comparer-a]   — compare la liste des outils à celle d'une autre passe
import { banc } from './commun.mjs';
import fs from 'node:fs';
const suffixe = process.argv[2] || 'apres', ref = process.argv[3] || null;
const b = await banc(1440, 900);
await b.preparer([]);
await b.ouvrirCours();
const res = {};
for (const ipad of [false, true]) {
  if (ipad) { await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1366, deviceScaleFactor: 2, mobile: true }); await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await b.dormir(1800); }
  const k = ipad ? 'tablette' : 'ordinateur';
  res[k] = await b.ev(`[...document.querySelectorAll('.ptb-outils > button, .ptb-outils > *, .tab-outils > *')].map(e=>e.matches('.ptb-sep')?'|':(e.getAttribute('aria-label')||e.title||e.className).split(' ·')[0].split(' —')[0]).filter(Boolean)`);
  for (const outil of ['Crayon', 'Gomme']) {
    await b.outil(outil); await b.dormir(500);
    const r = await b.rect(`document.querySelector('.pdfr-contexte')`);
    const t = await b.rect(`document.querySelector('.pdfr-toolbar')`);
    await b.capture(`barre-${k}-${outil.toLowerCase()}-${suffixe}`, { x: 0, y: Math.round(t.y), width: ipad ? 1024 : 1440, height: Math.round(r.b - t.y) });
    res[k + ':' + outil] = await b.ev(`(document.querySelector('.pdfr-contexte .pdfr-rangee-contenu')||{}).innerText||''`);
  }
}
// raccourcis ⌘1–9 (ordinateur)
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }); await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: false }); await b.dormir(1500);
const raccourcis = [];
for (let n = 1; n <= 8; n++) {
  await b.ev(`document.activeElement&&document.activeElement.blur&&document.activeElement.blur();1`);
  await b.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: String(n), code: 'Digit' + n, modifiers: 4, windowsVirtualKeyCode: 48 + n });
  await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: String(n), code: 'Digit' + n, modifiers: 4, windowsVirtualKeyCode: 48 + n });
  await b.dormir(250);
  raccourcis.push(n + '=' + await b.ev(`((document.querySelector('.ptb-outil.actif')||{}).title||'').split(' ·')[0]`));
}
res.raccourcis = raccourcis;
fs.writeFileSync(`../cap/barre-${suffixe}.json`, JSON.stringify(res, null, 1));
console.log(JSON.stringify(res, null, 1));
if (ref) {
  const r0 = JSON.parse(fs.readFileSync(`../cap/barre-${ref}.json`, 'utf8'));
  for (const k of ['ordinateur', 'tablette', 'raccourcis']) b.ok(JSON.stringify(r0[k]) === JSON.stringify(res[k]), `${k} : identique à « ${ref} »`, JSON.stringify(res[k]));
}
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
