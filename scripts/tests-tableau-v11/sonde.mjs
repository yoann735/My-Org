import { banc, COURS } from '../tests-flashcards-refonte/commun.mjs';
const b = await banc(1440, 900);
console.log(await b.ev(process.argv[2]));
process.exit(0);
