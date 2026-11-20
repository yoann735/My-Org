// outil d'exploration : node ev.mjs <ordi|tel|tablette> "<expression>" [capture]
import { appareil } from './commun.mjs';
const b = await appareil(process.argv[2]);
try { const r = await b.ev(process.argv[3]); console.log(typeof r === 'string' ? r : JSON.stringify(r, null, 1)); } catch (e) { console.log('ERR', e.message); }
if (process.argv[4]) await b.capture(process.argv[4]);
b.fermerWs(); process.exit(0);
