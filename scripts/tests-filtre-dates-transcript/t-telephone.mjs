// 3) TÉLÉPHONE : le shell téléphone (révision seule) n'a pas de Bibliothèque — rien n'y change, même avec la
//    préférence « dates de transcript » allumée sur l'appareil. node t-telephone.mjs
import { appareil, dormir, APRES } from './commun.mjs';
const b = await appareil('tel');
await b.preparer(APRES);
b.ok(await b.attendre(`!!document.querySelector('.mrm-app')`, 10000), 'téléphone : shell mobile affiché');
await b.sansAnim(); await dormir(300);
await b.capture('telephone-off');
const DOM = `(() => { const t = document.querySelector('.mrm-app').cloneNode(true); t.querySelectorAll('[style]').forEach((x) => x.removeAttribute('style')); return t.innerHTML; })()`;
const off = await b.ev(DOM);
b.ok(await b.ev(`!document.querySelector('.lib-tree, .ltd-ligne, .ltd-cal')`), 'téléphone : pas de Bibliothèque, aucun élément du chantier');
await b.ev(`(localStorage.setItem('medrevise.biblio.datesTranscript', '["m_banc_chimie"]'), 1)`);
await b.ouvrir(APRES); await b.sansAnim(); await dormir(300);
await b.capture('telephone-on');
const on = await b.ev(DOM);
b.ok(off === on, 'téléphone : écran identique (HTML complet), préférence allumée ou non', off === on ? '' : off.length + ' / ' + on.length);
b.ok(await b.ev(`!document.querySelector('.ltd-ligne, .ltd-cal')`), 'téléphone : toujours aucun élément du chantier');
process.exitCode = b.fin();
b.fermerWs();
