// « Fichiers du cours » en tablette (paysage + portrait, au doigt) ; téléphone : shell mobile inchangé. Base LOCALE du banc.
import { banc } from '../tests-bibliotheque-fichier/commun.mjs';
const b = await banc(1440, 900, { tactile: true });
await b.biblio({ recharger: true }); await b.ouvrir('Cours fichiers (test)');
for (const [W, H, o] of [[1180, 820, 'paysage'], [820, 1180, 'portrait']]) {
  await b.c.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true }); await b.dormir(1400);
  await b.tape(await b.pos(`document.querySelector('.tab-entete .mf-bouton')`, false));
  await b.tape(await b.pos(`document.querySelector('button[data-entree=fichiers]')`, false)); await b.dormir(900);
  const m = await b.ev(`(()=>{const d=document.querySelector('.fcrs').closest('.day-pop').getBoundingClientRect();const bt=[...document.querySelectorAll('.fcrs-actions .btn')].map(x=>x.getBoundingClientRect());return {dans:d.left>=0&&d.right<=innerWidth&&d.top>=0&&d.bottom<=innerHeight,h:Math.min(...bt.map(r=>r.height)),lignes:document.querySelectorAll('.fcrs-ligne').length,deb:document.documentElement.scrollWidth<=innerWidth}})()`);
  b.ok(m.lignes === 2 && m.dans && m.deb, `tablette ${o} : écran Fichiers du cours (2 lignes) entièrement visible`);
  b.ok(m.h >= 40, `tablette ${o} : boutons ≥ 40 px au doigt`, m.h + ' px');
  await b.capture(`fichiers-tablette-${o}`);
  await b.ev(`(()=>{[...document.querySelectorAll('.day-pop-head button')].forEach(y=>y.click());return 1})()`); await b.dormir(400);
}
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await b.dormir(1800);
b.ok(await b.ev(`document.body.innerText.includes('AUJOURD') || document.body.innerText.includes('Aujourd')`) && await b.ev(`document.documentElement.scrollWidth<=innerWidth`), 'téléphone : shell mobile (pas de lecteur, donc pas de fichiers de cours) — inchangé');
await b.capture('fichiers-telephone');
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' / '));
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
process.exit(0);
