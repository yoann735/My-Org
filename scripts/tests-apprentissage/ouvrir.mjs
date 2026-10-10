// ouvre MedRevise sur un appareil (hub → carte MedRevise) : node ouvrir.mjs 9335
import { appareil } from './banc.mjs';
const a = await appareil(process.argv[2]);
await a.send('Network.enable'); await a.send('Network.setCacheDisabled', { cacheDisabled: true });
await a.send('Page.reload'); await a.dormir(2500);
const sur = await a.ev(`!!document.querySelector('[data-app="medrevise"]')`);
if (!sur) { await a.clic('MedRevise', '.hub-card'); }
await a.attendre(`!!document.querySelector('[data-app="medrevise"]')`);
await a.dormir(2500);
console.log(process.argv[2], 'MedRevise ouvert ·', await a.ev('innerWidth'), 'px ·', (await a.texte('.sfa')).slice(0, 120) || '(pas d’encart)', '· erreurs', a.erreurs.length);
a.fermer();
