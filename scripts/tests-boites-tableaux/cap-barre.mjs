// capture de la barre du lecteur (ordinateur, tablette) : le bouton « ⋯ » toujours présent, grisé sans action
import { banc } from './commun.mjs';
const b = await banc();
await b.preparer({ annotations: [] });
for (const tablette of [false, true]) {
  await b.ouvrirCours({ tablette });
  const r = await b.rect(`document.querySelector('[data-actions-doc]').closest('.tab-barre, .ptb, .pdfr-barre, .tab-zone')?.parentElement || document.querySelector('[data-actions-doc]').parentElement`);
  const st = await b.ev(`(()=>{const e=document.querySelector('[data-actions-doc]');return {disabled:e.disabled,opacite:getComputedStyle(e).opacity}})()`);
  console.log(tablette ? 'tablette' : 'ordinateur', JSON.stringify(st));
  await b.capture('bt-barre-' + (tablette ? 'tablette' : 'ordinateur'), { x: 0, y: 0, width: tablette ? 1024 : 1440, height: 170 });
  await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: false });
}
process.exit(0);
