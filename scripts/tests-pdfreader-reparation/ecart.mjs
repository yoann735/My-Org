// écart au pixel entre deux captures de ../cap : node ecart.mjs a b
import { banc } from './commun.mjs';
const [a, c] = process.argv.slice(2);
const b = await banc();
const e = await b.ecart(a, c);
b.ok(e.n >= 0 && e.max <= 2, `${a} ↔ ${c}`, JSON.stringify(e));
process.exit(0);
