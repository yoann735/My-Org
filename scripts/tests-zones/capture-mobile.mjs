// Zones image v2 (11/10) — capture du verso de « m. Test zones v2 » sur TÉLÉPHONE (390 px), pour l'avant / après.
// Usage : node capture-mobile.mjs <dossier-captures> <nom>
import { writeFileSync } from 'node:fs';
import { appareil } from '../tests-collage/outils.mjs';
const [captures = '/tmp/zones', nom = 'mobile'] = process.argv.slice(2);
const A = await appareil(9335, { captures, largeur: 390, hauteur: 844, tactile: true });
const ouvert = `!!document.querySelector('.sfa, .mrm-app')`;
await A.send('Page.reload', { ignoreCache: true }); await A.dormir(3000);
if (!(await A.ev(ouvert))) await A.toucher(await A.pos(`[...document.querySelectorAll('.hub-card')].find((c) => c.textContent.includes('MedRevise'))`));
await A.attendre(ouvert, 30000); await A.dormir(5000);
const id = await A.ev(`(async () => { const s = ${A.st}; const q = (await s.getAll('questions')).find((x) => x.recto === 'm. Test zones v2'); await s.put('questions', { ...q, dueDate: new Date().toLocaleDateString('fr-CA') }); return q.id; })()`);
await A.send('Page.reload'); await A.dormir(3000); await A.attendre(ouvert, 30000); await A.dormir(5000);
await A.toucher(await A.pos(`document.querySelector('.sfa-btn')`));
await A.attendre(`!!document.querySelector('.sfc-carte')`);
for (let i = 0; i < 300; i++) {
  const cur = await A.ev(`(document.querySelector('.sfc-carte') || {}).dataset?.carte || null`);
  if (!cur || cur === id) break;
  await A.ev(`(() => { const b = [...document.querySelectorAll('.sfc-bas button')].find((x) => /Voir la réponse/.test(x.textContent)); b && b.click(); return 1; })()`); await A.dormir(100);
  await A.ev(`(document.querySelectorAll('.sfc-notes.quatre button')[2] || { click() {} }).click(), true`); await A.dormir(220);
}
await A.ev(`(() => { const b = [...document.querySelectorAll('.sfc-bas button')].find((x) => /Voir la réponse/.test(x.textContent)); b && b.click(); return 1; })()`); await A.dormir(1500);
await A.ev(`(() => { const b = [...document.querySelectorAll('.sfc-carte span[role=button], .sfc-carte button')].find((x) => /Tout révéler/.test(x.textContent)); b && b.click(); return 1; })()`); await A.dormir(2000);
const r = await A.ev(`(() => { const e = document.querySelector('.sfc-carte'); e.scrollIntoView({ block: 'start' }); const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, Math.min(r.height, 840)]; })()`);
await A.dormir(300);
const s = await A.send('Page.captureScreenshot', { format: 'png', clip: { x: r[0], y: Math.max(0, r[1]), width: r[2], height: r[3], scale: 2 } });
writeFileSync(`${captures}/${nom}.png`, Buffer.from(s.data, 'base64'));
await A.ev(`(document.querySelector('.sfc-quitter') || { click() {} }).click(), true`);
await A.send('Emulation.setTouchEmulationEnabled', { enabled: false });
await A.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
A.fermer(); process.exit(0);
