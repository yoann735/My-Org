import { banc } from './commun.mjs';
const r = {};
for (const p of ['9335', '9336']) { process.env.CDP_PORT = p; const X = await banc(p === '9336' ? 390 : 1440, p === '9336' ? 844 : 900); r[p] = await X.S(`const q=await S.getAll('questions');return q.length+' | '+q.filter(x=>x.aApprendre===true).map(x=>x.id).sort().join(',')+' | aa007:'+JSON.stringify((q.find(x=>x.id==='aa007')||{}).aApprendre)+' '+(q.find(x=>x.id==='aa007')||{}).updatedAt`); X.fermer(); }
const c = await (await fetch('http://localhost:54399/__etat')).json();
r.cloud = c.rows.filter((x) => x.store === 'questions' && x.data.aApprendre === true).map((x) => x.record_id).sort().join(',') + ' | aa007 ' + JSON.stringify(c.rows.find((x) => x.record_id === 'aa007').data.aApprendre) + ' ' + c.rows.find((x) => x.record_id === 'aa007').updated_at;
console.log(JSON.stringify(r, null, 1)); process.exit(0);
