// Non-régression MealWeek : même capture avant (Vite :5315 = code de 3840ce0, git archive, cache séparé) et après
// (Vite :5316 = code du chantier), sans cloud, profil vidé, même heure simulée. node t-mealweek.mjs ordi|tel
import fs from 'node:fs';
import { appareil as appareilFA, dormir } from '../tests-file-attente/commun.mjs';
import { DOSSIER_IMG } from './commun.mjs';

const type = process.argv[2] || 'ordi';
const out = {};
for (const [nom, base] of [['avant', 'http://localhost:5315'], ['apres', 'http://localhost:5316']]) {
  const b = await appareilFA(type, base);
  await b.vider();
  await b.ev(`(localStorage.setItem('__decalageMs', String(${Date.parse('2026-11-20T10:00:00+01:00')} - Date.now())), localStorage.setItem('app.current', '"mealweek"'), 1)`);
  await b.send('Page.navigate', { url: base + '/' });
  await b.attendre(`document.readyState === 'complete' && document.body.innerText.length > 50`, 60000);
  await dormir(3500);
  const s = await b.send('Page.captureScreenshot', { format: 'png' });
  const png = Buffer.from(s.result.data, 'base64');
  fs.writeFileSync(DOSSIER_IMG + `mealweek-${nom}-${type}.png`, png);
  out[nom] = { taille: png.length, texte: await b.ev(`document.body.innerText.replace(/\\s+/g, ' ').slice(0, 4000)`), erreurs: b.erreurs.filter((e) => !/Failed to load resource|ERR_|Failed to fetch/i.test(e || '')) };
  b.fermerWs();
}
const memeTexte = out.avant.texte === out.apres.texte;
const memeImage = fs.readFileSync(DOSSIER_IMG + `mealweek-avant-${type}.png`).equals(fs.readFileSync(DOSSIER_IMG + `mealweek-apres-${type}.png`));
console.log(`[${type}] ${memeTexte ? '✅' : '❌'} MealWeek : même texte avant / après (${out.apres.texte.length} car.)`);
console.log(`[${type}] ${memeImage ? '✅' : '❌'} MealWeek : capture identique au pixel près (${out.avant.taille} / ${out.apres.taille} octets)`);
console.log(`[${type}] ${!out.apres.erreurs.length ? '✅' : '❌'} aucune erreur console`, out.apres.erreurs.join(' | ').slice(0, 300));
process.exit(memeTexte && memeImage && !out.apres.erreurs.length ? 0 : 1);
