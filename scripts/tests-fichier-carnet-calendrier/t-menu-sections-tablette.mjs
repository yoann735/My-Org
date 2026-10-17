// (17/10) Menu Fichier en sections — tablette (paysage 1180×820 / 1024×768, portrait 820×1180, au doigt)
// et fenêtre étroite (761 px). Une seule connexion (l'émulation CDP saute à la déconnexion).
import { banc } from './commun.mjs';
const b = await banc(1440, 900, { tactile: true });
await b.biblio({ recharger: true });
await b.ouvrir('Physiologie rénale (jumelle)');
for (const [W, H, nom] of [[1180, 820, 'tablette-paysage'], [1024, 768, 'tablette-1024'], [820, 1180, 'tablette-portrait'], [761, 900, 'etroit']]) {
  await b.c.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true }); await b.dormir(1400);
  const bt = await b.rect(`[...document.querySelectorAll('.mf-bouton')].find(x=>x.offsetParent)`);
  b.ok(!!bt, `${nom} : bouton Fichier visible`, bt ? `${Math.round(bt.w)}×${Math.round(bt.h)}` : '');
  if (!bt) continue;
  await b.tape([bt.cx, bt.cy]); await b.dormir(400);
  const s = await b.lireSections();
  b.ok(s.map((x) => x.cle).join() === 'cours,original,fiche' && s.filter((x) => x.affiche).length === 1, `${nom} : trois sections, une seule « affiché »`);
  const m = await b.rect(`document.querySelector('.mf-menu')`);
  b.ok(m.x >= 0 && m.r <= W && m.b <= H, `${nom} : le menu tient dans l’écran`, `${Math.round(m.x)}→${Math.round(m.r)} × ${Math.round(m.y)}→${Math.round(m.b)}`);
  const hMin = await b.ev(`Math.min(...[...document.querySelectorAll('.mf-menu .mf-ligne > .mf-item')].map(e=>e.getBoundingClientRect().height))`);
  b.ok(hMin >= 40, `${nom} : cibles au doigt ≥ 40 px`, String(Math.round(hMin)));
  await b.ev(`document.querySelector('.mf-menu .mf-section[data-section=fiche] [data-entree=supprimer]').scrollIntoView({block:'nearest'});1`);
  const d = await b.rect(`document.querySelector('.mf-menu .mf-section[data-section=fiche] [data-entree=supprimer]')`);
  b.ok(d && d.y >= m.y - 1 && d.b <= m.b + 1, `${nom} : « Supprimer la fiche… » atteignable (le menu défile)`);
  await b.ev(`document.querySelector('.mf-menu').scrollTop=0;1`); await b.dormir(150);
  await b.capture(`fcc-menu-${nom}`, { x: 0, y: 0, width: W, height: Math.min(H, Math.round(m.b + 12)) });
  await b.T.Escape(); await b.dormir(300);
}
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' / '));
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await b.fermerLecteur();
process.exit(0);
