// Mesure : temps d'ouverture du panneau Apprendre (clic sur l'onglet → panneau peint, 2 images d'affichage), N fois.
// node mesure.mjs <étiquette> [ordi|tablette]  → ajoute une ligne à mesures.json
import fs from 'node:fs';
import { dispositif } from './commun.mjs';
const etiquette = process.argv[2] || 'mesure';
const type = process.argv[3] || 'ordi';
const N = 9;
const b = await dispositif(type);
await b.recharger();
await b.attendrePhase(['ajour'], 60000); await b.dormir(2000);
await b.reinitApprendre();
const OUVERT = process.argv.includes('ouvert'); // 150 cartes visibles (3 gros cours), vignettes dessinées
if (OUVERT) await b.ev(`localStorage.setItem('medrevise.apprentissage.filtres', JSON.stringify({ q: '', matieres: [], coursInclus: ['g0','g1','g2'], coursExclus: [], nouvelles: false, aApprendre: false, types: [] })); 1`);
const res = [];
for (let i = 0; i < N; i++) {
  await b.ev(`(() => { const x = [...document.querySelectorAll('.sb-item')].find((e) => /^Réviser/.test(e.title || e.innerText || '')); x && x.click(); return 1; })()`);
  await b.attendre(`!document.querySelector('.alib2')`, 8000); await b.dormir(700);
  const ms = await b.ev(`(async () => { const OUVERT_JS = ${JSON.stringify(OUVERT ? '.alib2-carte' : '.alib2-groupes .alib2-cours')}; const x = document.querySelector('.sb-item[data-onglet="apprlibre"]'); const t0 = performance.now(); x.click();
    await new Promise((r) => { const f = () => (document.querySelector('.alib2 [data-compteur]') && document.querySelector(OUVERT_JS) ? requestAnimationFrame(() => requestAnimationFrame(r)) : requestAnimationFrame(f)); f(); });
    return Math.round((performance.now() - t0) * 10) / 10; })()`);
  res.push(ms);
  await b.dormir(400);
}
const tri = [...res].sort((a, c) => a - c);
const ligne = { etiquette: etiquette + (OUVERT ? ' (150 visibles)' : ' (tout, cours repliés)'), type, cartes: await b.ev(`document.querySelector('[data-compteur]').dataset.compteur`), mesures: res, mediane: tri[Math.floor(N / 2)], min: tri[0], max: tri[N - 1], le: new Date().toISOString() };
console.log(JSON.stringify(ligne));
const f = new URL('./mesures.json', import.meta.url);
const tout = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [];
tout.push(ligne); fs.writeFileSync(f, JSON.stringify(tout, null, 1));
process.exit(0);
