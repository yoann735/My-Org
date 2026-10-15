// Fiche jumelle sur DOCUMENT, tablette 820 × 1 180 tactile : segment au doigt, bascule dans les deux sens,
// l'éditeur revient côté Original ; aucun « Les deux ».
import { banc } from './commun.mjs';
const b = await banc();
b.ok(await b.ouvrir('Myologie (document)', { recharger: true }), 'cours document ouvert (1 440 px)');
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180, deviceScaleFactor: 2, mobile: true });
await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await b.dormir(1800);
const vue = () => b.ev(`document.querySelector('.pdfr-jumelle-bascule .seg-btn.active')?.innerText`);
const seg = await b.rect(`document.querySelector('.pdfr-jumelle-bascule .seg-btn')`);
b.ok(seg && seg.h >= 36, 'segment Original · Fiche ≥ 36 px', seg && `${seg.w.toFixed(0)}×${seg.h}`);
b.ok(!(await b.ev(`!!document.querySelector('.pdfr-jumelle-deux, .pdfr-jumelle, .vj')`)), 'aucun « Les deux »');
for (const cible of ['Fiche', 'Original']) {
  await b.tape(await b.pos(`[...document.querySelectorAll('.pdfr-jumelle-bascule .seg-btn')].find(x=>x.innerText===${JSON.stringify(cible)})`, false));
  for (let k = 0; k < 40 && (await vue()) !== cible; k++) await b.dormir(100);
  await b.dormir(1500);
  b.ok((await vue()) === cible && (cible === 'Fiche' ? await b.ev(`!document.querySelector('.pt-flux-cadre') && !!document.querySelector('.pdfr-textlayer')`) : await b.ev(`!!document.querySelector('.pt-flux-cadre .ProseMirror')`)), `toucher « ${cible} » : ${cible === 'Fiche' ? 'lecteur PDF de la fiche' : 'éditeur du document'}`);
  await b.capt('doc-tablette-' + cible.toLowerCase());
}
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: false });
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
b.c.fermer();
