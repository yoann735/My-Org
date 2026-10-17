// (17/10 soir) Import de flashcards en tablette (1180 × 820, tactile) et fenêtre étroite (761 px) : fenêtre lisible,
// rien ne déborde, l'exemple du format s'importe. Base LOCALE (fiche « Import (test 17/10) », t-import.mjs avant).
import { banc } from './commun.mjs';
const b = await banc(1440, 900, { tactile: true });
await b.biblio({ recharger: true });
await b.ouvrir('Import (test 17/10)');
for (const [W, H, nom] of [[1180, 820, 'tablette'], [761, 900, 'etroit']]) {
  await b.c.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true }); await b.dormir(1400);
  await b.ev(`(()=>{const x=[...document.querySelectorAll('.pm-seg-btn')].find(e=>e.innerText.startsWith('Exercices'));x&&x.click();return 1})()`); await b.dormir(400);
  await b.ev(`(()=>{const x=[...document.querySelectorAll('.pis button')].filter(e=>e.offsetParent).find(e=>e.innerText.trim().startsWith('Flashcards'));x&&x.click();return 1})()`); await b.dormir(400);
  const btn = await b.rect(`document.querySelector('[data-act=importer-fc]')`);
  b.ok(btn && btn.h >= 28, `${nom} : bouton « Importer » visible`, btn && `${Math.round(btn.w)}×${Math.round(btn.h)}`);
  await b.tape([btn.cx, btn.cy]); await b.dormir(500);
  const M = `document.querySelector('[data-import-flashcards]')`;
  await b.tape(await b.dans(`${M}.querySelector('[data-act=format]')`, 0.5, 0.5)); await b.dormir(300);
  await b.tape(await b.dans(`[...${M}.querySelectorAll('button')].find(x=>x.innerText.startsWith('Essayer cet exemple'))`, 0.5, 0.5)); await b.dormir(1500);
  const a = await b.ev(`(()=>{const p=${M}.closest('.day-pop').getBoundingClientRect();return {erreurs:${M}.querySelectorAll('[data-erreur]').length,cartes:${M}.querySelector('[data-compte] b').innerText,dans:p.left>=0&&p.right<=innerWidth,page:document.scrollingElement.scrollWidth<=innerWidth}})()`);
  b.ok(a.erreurs === 0 && /6 cartes/.test(a.cartes) && a.dans && a.page, `${nom} : « Essayer cet exemple » → 6 cartes, aucune erreur ; la fenêtre tient dans l’écran`, JSON.stringify(a));
  await b.capture(`imp-${nom}`);
  await b.T.Escape(); await b.dormir(400);
}
b.ok(!b.erreurs.length, 'aucune erreur dans la page', b.erreurs.join(' / '));
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
process.exit(0);
