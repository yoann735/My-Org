// capture : infobulle d'un outil (nom + raccourci) et d'une icône de mini barre
import { banc } from '../tests-boites-tableaux/commun.mjs';
const b = await banc();
await b.preparer({}); await b.ouvrirCours({});
const p = await b.pos(`document.querySelector('[data-outil="dessin"]')`, false);
await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[0], y: p[1] }); await b.dormir(700);
const r = await b.rect(`document.querySelector('[data-infobulle-visible]')`);
console.log(await b.ev(`(document.querySelector('[data-infobulle-visible]')||{}).innerText`));
if (r) await b.capture('infobulle-outil', { x: Math.max(0, Math.round(r.x - 160)), y: Math.max(0, Math.round(r.y - 70)), width: Math.round(r.w + 320), height: Math.round(r.h + 110) });
const q = await b.pos(`document.querySelector('.ptb-pages button, [title^="Page précédente"]')`, false);
process.exit(0);
