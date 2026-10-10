// pose UN surlignage ambre (« citrate synthase catalyse ») sur la page 1 de PDF texte J
import { banc } from './commun-doc.mjs';
import { outilsSurl } from './surl-commun.mjs';
const B = await banc();
const U = outilsSurl(B);
await U.outil('Surligneur'); await U.couleur('Ambre');
await U.glisser(await U.coords(`document.querySelector('.pdfr-textlayer')`, 'La citrate synthase', 'citrate', 'catalyse'));
console.log(await B.S(`return (await S.getAll('highlights')).filter(h=>h.ficheId==='j-txt').map(h=>h.texte)`));
B.c.fermer();
