// Fluidité de la frappe dans une boîte, document long (40 pages, 34 boîtes) : durée de chaque image (requestAnimationFrame)
// et tâches longues pendant 150 caractères tapés toutes les 40 ms. Même scénario sur l'ancien code et le nouveau :
//   BASE=http://localhost:5304 node t-performance.mjs avant   ·   node t-performance.mjs apres   [ordi|tablette]
import fs from 'node:fs';
import { appareil, dormir } from './commun.mjs';
const etiquette = process.argv[2] || 'apres'; const type = process.argv[3] || 'ordi';
const b = await appareil(type, { nouvelOnglet: true });
await b.ouvrirApp();
await b.attendre(`document.documentElement.getAttribute('data-mr-synchro') === 'ajour'`, 40000, 300);
b.ok(await b.ouvrirCours('Glandes (test)'), 'cours de 40 pages ouvert'); await dormir(2500);
const LENT = Number(process.env.LENT || 1);
if (LENT > 1) await b.send('Emulation.setCPUThrottlingRate', { rate: LENT });
await b.send('Performance.enable');
const metrique = async () => Object.fromEntries((await b.send('Performance.getMetrics')).result.metrics.map((m) => [m.name, m.value]));
const mesures = [];
for (let essai = 0; essai < 3; essai++) {
  const id = await b.nouvelleBoite(0.08, 0.2 + essai * 0.12, 1);
  await b.ev(`(() => { window.__f = []; window.__lt = []; let t0 = performance.now(); window.__go = true;
    const f = (t) => { window.__f.push(t - t0); t0 = t; if (window.__go) requestAnimationFrame(f); }; requestAnimationFrame(f);
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(e.duration))).observe({ type: 'longtask', buffered: false }); } catch (e) {}
    return 1; })()`);
  const m0 = await metrique();
  const texte = 'La glande exocrine déverse sa sécrétion par un canal excréteur ; acinus séreux, muqueux ou mixte, cellules myoépithéliales.  ';
  for (const c of texte.slice(0, 150)) { await b.ecrire(c); await dormir(40); }
  await dormir(300);
  const m1 = await metrique();
  const r = await b.ev(`(() => { window.__go = false; const f = window.__f.slice(2); const s = f.slice().sort((a, b) => a - b);
    return { images: f.length, lentes: f.filter((x) => x > 16.7 + 1).length, p95: +s[Math.floor(s.length * 0.95)].toFixed(1), max: +s[s.length - 1].toFixed(1), moyenne: +(f.reduce((a, b) => a + b, 0) / f.length).toFixed(2),
      longues: window.__lt.length, longuesMs: Math.round(window.__lt.reduce((a, b) => a + b, 0)) }; })()`);
  r.scriptMsParFrappe = +(((m1.ScriptDuration - m0.ScriptDuration) * 1000) / 150).toFixed(2);
  r.tachesMsParFrappe = +(((m1.TaskDuration - m0.TaskDuration) * 1000) / 150).toFixed(2);
  mesures.push(r);
  await b.echap(); await dormir(800);
}
const moy = (k) => +(mesures.reduce((a, m) => a + m[k], 0) / mesures.length).toFixed(2);
const res = { etiquette, type, essais: mesures, images: moy('images'), partLentes: +(100 * mesures.reduce((a, m) => a + m.lentes, 0) / mesures.reduce((a, m) => a + m.images, 0)).toFixed(2),
  p95: moy('p95'), max: Math.max(...mesures.map((m) => m.max)), moyenne: moy('moyenne'), longues: moy('longues'), longuesMs: moy('longuesMs'), scriptMsParFrappe: moy('scriptMsParFrappe'), tachesMsParFrappe: moy('tachesMsParFrappe'), lent: LENT };
console.log(JSON.stringify(res));
const f = new URL('./mesures.json', import.meta.url);
const tout = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : {};
tout[etiquette + '-' + type + (LENT > 1 ? '-cpu' + LENT : '')] = res; fs.writeFileSync(f, JSON.stringify(tout, null, 1));
// ménage : les boîtes du test
await b.send('Emulation.setCPUThrottlingRate', { rate: 1 });
await b.nettoyer();
await fetch(`http://localhost:${b.port}/json/close/${b.id}`, { method: 'PUT' });
b.fermerWs();
