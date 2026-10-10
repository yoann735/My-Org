// Partie C : modifier la carte — cocher « Montrer l'image au recto » ; les images restent les mêmes blobs.
import { banc } from './commun-doc.mjs';
const B = await banc();
const { ev, ok, clic, dormir } = B;
const avant = await B.S(`const q=(await S.getAll('questions')).find(q=>q.muscle&&q.recto.includes('images'));return q.muscle`);
if (!(await ev(`!!document.querySelector('.mu-form')`))) await clic(await B.pos(`[...document.querySelectorAll('button')].find(b=>(b.title||'')==='Éditer')`), { att: 800 });
const coche = await B.pos(`document.querySelector('.mu-recto-opt input')`);
await clic(coche, { att: 300 });
await clic(await B.pos(`[...document.querySelectorAll('.mu-form .imp-actions button')].find(b=>/Enregistrer|Modifier|Valider/.test(b.innerText))`), { att: 1500 });
const apres = await B.S(`const q=(await S.getAll('questions')).find(q=>q.muscle&&q.recto.includes('images'));return q.muscle`);
ok(apres.imageGenerale.auRecto === true && apres.imageGenerale.imageId === avant.imageGenerale.imageId && JSON.stringify(apres.images) === JSON.stringify(avant.images), 'modification : « au recto » coché, mêmes images (mêmes blobs, mêmes masques)', JSON.stringify(apres.imageGenerale));
ok(!B.erreurs.length, 'aucune exception JS', B.erreurs.join(' | '));
B.c.fermer();
