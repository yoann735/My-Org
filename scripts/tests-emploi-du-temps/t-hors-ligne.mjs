// Cache local : affichage instantané et hors ligne (« Hors ligne · mis à jour il y a 2 h »).
import { ouvrir, hp, forcerServeur } from './commun-edt.mjs';

await hp('/__version?v=1'); const srv = await forcerServeur();
// 1. une lecture en ligne remplit le cache local
let b = await ouvrir({ date: new Date().toISOString() });
await b.reinit({ mode: 'ecole' }); await b.recharger(); await b.accueil(); await b.attendreEcole();
const enLigne = (await b.cartes()).map((x) => x.uid).join(',');
const cache = await b.ev(`(()=>{const c=JSON.parse(localStorage.getItem('medrevise.edt.cache.v1'));return c&&c.events.length})()`);
b.ok(cache === srv.events.length, 'cache local rempli (' + cache + ' cours)');
b.c.fermer();

// 2. deux heures plus tard, sans réseau vers /api/timetable
b = await ouvrir({ date: new Date(Date.parse(srv.generatedAt) + 2 * 3600e3 + 60e3).toISOString(), ecran: 'aucun' });
await b.couperApi();
await b.recharger(); await b.accueil();
const t0 = Date.now();
await b.attendre(`document.querySelector('.edtg-bloc')`, 5000);
const delai = Date.now() - t0;
await b.attendre(`/Hors ligne/.test((document.querySelector('.edt-fraicheur')||{}).textContent||'')`, 6000);
const fr = await b.ev(`document.querySelector('.edt-fraicheur').textContent.trim()`);
b.ok(fr === 'Hors ligne · mis à jour il y a 2 h', 'hors ligne : « Hors ligne · mis à jour il y a 2 h »', fr);
b.ok((await b.cartes()).map((x) => x.uid).join(',') === enLigne, 'hors ligne : mêmes cours, depuis le cache');
b.ok(delai < 1500, `affichage immédiat depuis le cache (${delai} ms après le chargement)`);
await b.png('edt-hors-ligne', '.edt-nav', 6);
b.ok(b.erreurs.length === 0, '0 erreur console', b.erreurs.join(' | '));
b.c.fermer();
