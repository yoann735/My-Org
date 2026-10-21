// assemble des captures de ../cap côte à côte (ou en colonne) avec légendes → ../cap/<sortie>.png
import { banc } from './commun.mjs';
const [sortie, vertical, ...rest] = process.argv.slice(2);
const noms = rest.filter((_, i) => i % 2 === 0), leg = rest.filter((_, i) => i % 2 === 1);
const b = await banc();
await b.assembler(noms, sortie, leg, vertical === 'v');
process.exit(0);
