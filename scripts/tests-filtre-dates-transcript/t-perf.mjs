// 2) MESURES — temps d'affichage de la barre latérale (Bibliothèque) bouton OFF / ON, avant / après le chantier,
//    sur la matière la plus chargée (données « lourdes » : 76 sessions, ~24 000 segments sur « Chimie »).
//    Ordinateur 1440×900, CPU normal puis ralenti ×4 (ordre de grandeur d'une tablette). Médiane de 9 mesures.
//    node t-perf.mjs   → affiche un tableau + écrit $TRAVAIL/perf-dates-transcript.json
import fs from 'node:fs';
import path from 'node:path';
import { TRAVAIL } from '../tests-section-exos/commun.mjs';
import { appareil, dormir, APRES, AVANT } from './commun.mjs';

const b = await appareil('ordi');
const N = 9; // gestes : 9 mesures ; affichage : 3 tours × 7
const med = (l) => { const s = [...l].sort((x, y) => x - y); return Math.round(s[Math.floor(s.length / 2)] * 10) / 10; };
const max = (l) => Math.round(Math.max(...l) * 10) / 10;
// temps : clic sur « Bibliothèque » (depuis l'Accueil) → arbre peint (2 images plus tard). + plus longue image pendant ce temps.
const AFFICHAGE = `(async () => {
  const aller = (t) => [...document.querySelectorAll('.sb-item')].find((e) => (e.title || '').startsWith(t));
  aller('Accueil').click(); await new Promise((r) => setTimeout(r, 400));
  const images = []; let der = performance.now(), go = true;
  const boucle = (t) => { images.push(t - der); der = t; if (go) requestAnimationFrame(boucle); };
  const t0 = performance.now(); requestAnimationFrame((t) => { der = t; requestAnimationFrame(boucle); });
  aller('Bibliothèque').click(); await Promise.resolve(); await Promise.resolve(); void document.body.offsetHeight; // rendu React (microtâche du clic) + styles + mise en page
  const travail = performance.now() - t0;
  await new Promise((r) => { const f = () => (document.querySelector('.lib-tree .lt-fiche') ? requestAnimationFrame(() => requestAnimationFrame(r)) : requestAnimationFrame(f)); f(); });
  const dt = performance.now() - t0; go = false;
  return { dt, travail, image: Math.max(0, ...images) };
})()`;
// geste dans la barre (bouton, pastille, « +N ») → peint ; plus longue image
const GESTE = (sel) => `(async () => {
  const el = ${sel}; if (!el) return null;
  const images = []; let der = performance.now(), go = true;
  const boucle = (t) => { images.push(t - der); der = t; if (go) requestAnimationFrame(boucle); };
  requestAnimationFrame((t) => { der = t; requestAnimationFrame(boucle); });
  await new Promise((r) => setTimeout(r, 50));
  const t0 = performance.now(); el.click(); await Promise.resolve(); await Promise.resolve(); void document.body.offsetHeight;
  const travail = performance.now() - t0;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const dt = performance.now() - t0; await new Promise((r) => setTimeout(r, 60)); go = false;
  return { dt, travail, image: Math.max(0, ...images.slice(1)) };
})()`;
const serie = async (js) => { const r = []; for (let i = 0; i < N; i++) { const x = await b.ev(js); if (x) r.push(x); await dormir(120); } return { ms: med(r.map((x) => x.dt)), travail: med(r.map((x) => x.travail)), travailMax: max(r.map((x) => x.travail)) }; };
const calSel = `[...(${b.qMat('Chimie')}).querySelectorAll('.ltd-cal')][0]`;

const res = {};
const CLE = 'medrevise.biblio.datesTranscript';
// les deux origines préparées UNE fois (données lourdes), puis tours alternés : avant OFF · après OFF · après ON
await b.preparer(AVANT, { lourd: true });
await b.preparer(APRES, { lourd: true });
const brut = {};
for (const ralenti of [1, 4]) {
  const cle = 'cpu×' + ralenti;
  brut[cle] = { avant_off: [], apres_off: [], apres_on: [] };
  for (let tour = 0; tour < 3; tour++) {
    for (const [nom, base, on] of [['avant_off', AVANT, false], ['apres_off', APRES, false], ['apres_on', APRES, true]]) {
      await b.send('Page.navigate', { url: base + '/favicon.svg' }); await dormir(300);
      await b.ev(on ? `(localStorage.setItem('${CLE}', '["m_banc_chimie"]'), 1)` : `(localStorage.removeItem('${CLE}'), 1)`);
      await b.ouvrir(base); await b.biblio(); await dormir(600);
      if (on) await b.attendre(`!!document.querySelector('.ltd-ligne')`, 5000);
      await b.send('Emulation.setCPUThrottlingRate', { rate: ralenti });
      for (let i = 0; i < 7; i++) { const x = await b.ev(AFFICHAGE); if (x) brut[cle][nom].push(x); await dormir(120); }
      await b.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    }
  }
  res[cle] = {};
  for (const k of Object.keys(brut[cle])) { const r = brut[cle][k]; res[cle][k] = { n: r.length, ms: med(r.map((x) => x.dt)), travail: med(r.map((x) => x.travail)), travailMax: max(r.map((x) => x.travail)) }; }
  // gestes et calcul (après, bouton allumé)
  await b.send('Emulation.setCPUThrottlingRate', { rate: ralenti });
  res[cle].calcul = await b.S(`const m = await __imp('/src/medrevise/lib/datesTranscript.js'); const l = await S.getAll('transcript_session');
    const segs = l.reduce((n, r) => n + ((r.segments || []).length), 0);
    const f = []; const c = []; for (let i = 0; i < 5; i++) { m.oublier(); let t = performance.now(); m.integrer(l); f.push(performance.now() - t); t = performance.now(); m.integrer(l); c.push(performance.now() - t); }
    f.sort((a, b) => a - b); c.sort((a, b) => a - b);
    return { sessions: l.filter((r) => r.kind === 'session').length, segments: segs, froid_ms: Math.round(f[2] * 100) / 100, chaud_ms: Math.round(c[2] * 1000) / 1000 }`);
  res[cle].eteindre = await serie(`(async () => { const r = await (${GESTE(calSel)}); await new Promise((x) => setTimeout(x, 80)); ${calSel}.click(); await new Promise((x) => setTimeout(x, 400)); return r; })()`);
  res[cle].allumer = await serie(`(async () => { ${calSel}.click(); await new Promise((x) => setTimeout(x, 400)); const r = await (${GESTE(calSel)}); await new Promise((x) => setTimeout(x, 400)); return r; })()`);
  res[cle].filtre = await serie(`(async () => { const r = await (${GESTE(`document.querySelector('.ltd-p[data-jour="2026-11-17"]')`)}); await new Promise((x) => setTimeout(x, 50)); document.querySelector('.ltd-rappel-p') && document.querySelector('.ltd-rappel-p').click(); await new Promise((x) => setTimeout(x, 80)); return r; })()`);
  res[cle].plusN = await serie(`(async () => { const r = await (${GESTE(`document.querySelector('.ltd-plus')`)}); await new Promise((x) => setTimeout(x, 50)); document.querySelector('.ltd-plus') && document.querySelector('.ltd-plus').click(); await new Promise((x) => setTimeout(x, 80)); return r; })()`);
  await b.send('Emulation.setCPUThrottlingRate', { rate: 1 });
}
console.log(JSON.stringify(res, null, 1));
fs.writeFileSync(path.join(TRAVAIL, 'perf-dates-transcript.json'), JSON.stringify(res, null, 1));
const r1 = res['cpu×1'], r4 = res['cpu×4'];
const t = (x) => (x.travail != null ? Math.round(x.travail * 10) / 10 : x);
b.ok(r1.apres_off.travail <= r1.avant_off.travail * 1.2 + 2 && r4.apres_off.travail <= r4.avant_off.travail * 1.2 + 2, `bouton éteint : ${r1.apres_off.travail} ms de travail par affichage (avant le chantier : ${r1.avant_off.travail} ms)`);
b.ok(r1.apres_on.travail < 16, `bouton allumé : ${r1.apres_on.travail} ms de travail par affichage (< 16 ms par image)`);
b.ok([r1.filtre, r1.plusN].every((x) => x.travail < 16) && r1.allumer.travail < 16 && r1.eteindre.travail < 16, `gestes < 16 ms : allumer ${r1.allumer.travail}, filtre ${r1.filtre.travail}, +N ${r1.plusN.travail}, éteindre ${r1.eteindre.travail} ms`);
b.ok(r1.calcul.chaud_ms < 1, `calcul mémorisé : ${r1.calcul.chaud_ms} ms à chaud (${r1.calcul.froid_ms} ms à froid pour ${r1.calcul.segments} segments)`);
console.log(`CPU ×4 : affichage avant ${r4.avant_off.travail} / OFF ${r4.apres_off.travail} / ON ${r4.apres_on.travail} ms ; allumer ${r4.allumer.travail}, éteindre ${r4.eteindre.travail}, filtre ${r4.filtre.travail}, +N ${r4.plusN.travail} ms`);
process.exitCode = b.fin();
b.fermerWs();
