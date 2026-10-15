// Bibliothèque — tris en tablette (paysage, portrait, tactile) et téléphone (shell mobile). Base LOCALE du banc.
import { banc } from './commun.mjs';
for (const [W, H, nom] of [[1180, 820, 'paysage'], [820, 1180, 'portrait']]) {
  const b = await banc(W, H, { tactile: true });
  await b.biblio({ recharger: true });
  await b.trier('Dernière modification');
  // sous 960 px la liste est repliée en rail au chargement (comportement existant) : on la rouvre
  if (await b.ev(`!!document.querySelector('.lib-master.collapsed')`)) await b.tape(await b.pos(`document.querySelector('.lib-split [class*=split-handle], .lib-split .split-handle')`, false));
  const l = await b.fiches(), m = await b.metas();
  b.ok(l.length >= 12 && m.length === l.length, `${nom} : liste plate, une ligne « Modifiée … · matière » par fiche`, `${l.length} fiches`);
  const deb = await b.ev(`document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.topbar-actions > *')].every(e=>e.getBoundingClientRect().right <= innerWidth)`);
  b.ok(deb, `${nom} : pas de défilement horizontal`);
  const h = await b.rect(`document.querySelector('.lib-plat-rangee')`);
  b.ok(h && h.h >= 44, `${nom} : lignes ≥ 44 px au doigt`, h && Math.round(h.h) + ' px');
  const t = await b.rect(`document.querySelector('.lib-tri-bouton')`);
  b.ok(t && t.h >= 40, `${nom} : bouton Trier ≥ 40 px`, t && Math.round(t.h) + ' px');
  await b.capture(`tb-tablette-${nom}`);
  // le menu Trier s'ouvre au doigt
  await b.tape([t.cx, t.cy]);
  b.ok(await b.ev(`[...document.querySelectorAll('.ctx-menu-item')].map(x=>x.innerText.trim()).join('|')==='Ordre manuel|Dernière modification|Date d’ajout'`), `${nom} : menu Trier au doigt (3 choix)`);
  await b.capture(`tb-tablette-${nom}-menu`);
  await b.T.Escape();
  await b.affichage('Grille');
  await b.capture(`tb-tablette-${nom}-grille`);
  await b.affichage('Arbre');
  await b.trier('Ordre manuel');
  b.ok(!b.erreurs.length, `${nom} : aucune erreur`, b.erreurs.join(' / '));
}
// téléphone : shell mobile (pas de Bibliothèque) — rien ne doit casser
const t = await banc(390, 844, { tactile: true });
await t.c.send('Page.reload', { ignoreCache: true }); await t.dormir(4500);
await t.capture('tb-telephone');
t.ok(!t.erreurs.length && await t.ev(`document.body.innerText.length > 50`), 'téléphone : shell mobile affiché, sans erreur', t.erreurs.join(' / '));
await t.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
process.exit(0);
