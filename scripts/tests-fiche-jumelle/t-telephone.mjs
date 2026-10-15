// Téléphone 390 × 844 tactile : le shell mobile (sans lecteur PDF) se charge sans erreur, et le
// sélecteur de couleur du DESSIN mobile (même panneau « Personnalisée ») marche au doigt.
import { banc } from './commun.mjs';
const b = await banc();
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await b.c.send('Page.reload', { ignoreCache: true }); await b.dormir(5000);
if (await b.ev(`document.body.innerText.includes('Choisis ton espace')`)) { await b.ev(`[...document.querySelectorAll('.hub-card')].find(x=>/MedRevise/i.test(x.innerText))?.click();1`); await b.dormir(2000); }
b.ok(await b.ev(`!!document.querySelector('.mrm-card')`), 'téléphone : accueil mobile de MedRevise affiché');
await b.capt('telephone-accueil');
await b.tape(await b.pos(`[...document.querySelectorAll('.mrm-dessin button')].pop()`));
await b.dormir(1200);
b.ok(await b.ev(`!!document.querySelector('.md-pastille-roue')`), 'écran Dessin ouvert');
await b.ev(`document.querySelector('.md-pastille-roue').scrollIntoView({inline:'center',block:'nearest'});1`); await b.dormir(400);
await b.tape(await b.pos(`document.querySelector('.md-pastille-roue')`, false));
const fen = await b.rect(`document.querySelector('.sc-fenetre')`);
b.ok(fen && fen.x >= 0 && fen.r <= 390 && fen.y >= 0 && fen.b <= 844, 'panneau « Personnalisée » dans l’écran du téléphone', JSON.stringify(fen));
const t = await b.rect(`document.querySelector('.sc-teinte')`);
await b.doigt([t.x + t.w * 0.1, t.cy], [t.x + t.w * 0.6, t.cy]);
b.ok(Math.abs((await b.ev(`+document.querySelector('.sc-teinte').getAttribute('aria-valuenow')`)) - 216) < 8, 'teinte glissée au doigt sur le téléphone');
const cr = await b.rect(`document.querySelector('.sc-carre')`);
await b.doigt([cr.x + cr.w * 0.2, cr.y + cr.h * 0.2], [cr.x + cr.w * 0.85, cr.y + cr.h * 0.25]);
b.ok((await b.ev(`document.querySelector('.sc-hex').value`)) !== 'ffffff', 'carré glissé au doigt : une vraie couleur', await b.ev(`document.querySelector('.sc-hex').value`));
await b.capt('telephone-dessin-couleur');
const hex = await b.ev(`'#'+document.querySelector('.sc-hex').value`);
await b.tape(await b.pos(`[...document.querySelectorAll('.sc-fenetre button')].find(x=>x.innerText.includes('OK'))`, false));
b.ok(await b.ev(`JSON.parse(localStorage.getItem('medrevise.couleursPerso')||'[]')[0]`) === hex, 'OK : couleur ajoutée (dessin du téléphone)', hex);
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: false });
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
b.c.fermer();
