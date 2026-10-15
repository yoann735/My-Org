// essai : dépôt d'un PDF (Finder simulé) sur la liste de la Bibliothèque
import { banc } from './commun.mjs';
const b = await banc(1440, 900);
await b.biblio({ recharger: true });
await b.trier('Date d’ajout');
const fx = process.argv[2];
const p = await b.pos(`[...document.querySelectorAll('.lib-plat-rangee')].find(e=>e.innerText.includes('Enzymologie'))`, false);
await b.c.send('Input.setInterceptDrags', { enabled: false });
const data = { items: [], files: [fx], dragOperationsMask: 1 };
for (const type of ['dragEnter', 'dragOver', 'drop']) { await b.c.send('Input.dispatchDragEvent', { type, x: p[0], y: p[1], data }); await b.dormir(300); }
await b.dormir(1200);
await b.capture('tb-depot-modale');
console.log(await b.ev(`document.querySelector('.modal, [role=dialog], .fc-fenetre')?.innerText?.slice(0,400)`));
process.exit(0);
