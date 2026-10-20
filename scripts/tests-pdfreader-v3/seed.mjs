// Sème les cours de test du chantier v3 (base LOCALE du banc) : « Diapo lourde (zoom) » (lourd.pdf) et
// « Rein v3 » (cours.pdf de tests-fiche-jumelle/gen-pdf.mjs, 26 pages). node seed.mjs
import { banc } from './commun.mjs';
const b = await banc();
console.log(await b.semer('f-v3-lourd', 'Diapo lourde (zoom)', 'lourd.pdf'));
console.log(await b.semer('f-v3-rein', 'Rein v3', 'cours.pdf'));
process.exit(0);
