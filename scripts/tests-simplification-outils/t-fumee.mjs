// Fumée : le cours s'ouvre, la barre a 6 outils, aucune erreur.
import { banc } from './commun.mjs';
const b = await banc();
await b.preparer();
await b.ouvrirCours();
const outils = await b.ev(`[...document.querySelectorAll('.ptb-outils [data-outil]')].map(e=>e.getAttribute('data-outil')+':'+(e.title||'').split(' — ')[0])`);
console.log(outils);
await b.capture('so-fumee');
console.log('erreurs', b.erreurs);
process.exit(0);
