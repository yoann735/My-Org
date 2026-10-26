// retire tous les tags « À apprendre » : synchro des deux appareils d'abord (un tag posé sur B revient sinon), puis
// retrait sur A (plus récent, il gagne), puis B se remet d'accord
import { banc } from './commun.mjs';
const X = {};
for (const p of ['9336', '9335']) { process.env.CDP_PORT = p; X[p] = await banc(p === '9336' ? 390 : 1440, p === '9336' ? 844 : 900); await X[p].ev(`window.dispatchEvent(new Event('online'));1`); await X[p].dormir(5000); }
const A = X['9335'], B = X['9336'];
const n = await A.S(`let n=0;for (const q of await S.getAll('questions')) if (q.aApprendre!==undefined){delete q.aApprendre; await S.put('questions', q);n++} return n`);
await A.ev(`window.dispatchEvent(new Event('online'));1`); await A.dormir(5000);
await B.ev(`window.dispatchEvent(new Event('online'));1`); await B.dormir(6000);
const t = await B.S(`return (await S.getAll('questions')).filter((q) => q.aApprendre === true).length`);
console.log('reset', n, '· tagués sur B après synchro', t); process.exit(0);
