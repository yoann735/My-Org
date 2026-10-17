import fs from 'node:fs';
let ok = true;
for (const n of ['grille', 'serie', 'legende', 'droite', 'jour', 'm-hero', 'm-seance']) {
  const a = `../cap/nr-avant-${n}.png`; const p = `../cap/nr-apres-${n}.png`;
  if (!fs.existsSync(a) || !fs.existsSync(p)) { console.log('⚠️', n, 'absent'); continue; }
  const same = fs.readFileSync(a).equals(fs.readFileSync(p));
  ok = ok && same;
  console.log(same ? '✅' : '❌', `${n} : identique au pixel avant/après`);
}
process.exit(ok ? 0 : 1);
