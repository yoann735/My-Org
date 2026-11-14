// MealWeek intacte : même capture octet pour octet avec le code de départ (:5304, 7048c82) et le nouveau (:5303), aucune erreur console.
import fs from 'node:fs';
import { appareil, dormir, DOSSIER_IMG } from './commun.mjs';
const prendre = async (base) => {
  const b = await appareil('ordi', { nouvelOnglet: true });
  await b.send('Page.navigate', { url: base + '/' }); await b.attendre(`document.readyState === 'complete'`, 20000);
  await b.ev(`(localStorage.setItem('app.current', JSON.stringify('mealweek')), 1)`);
  await b.send('Page.navigate', { url: base + '/mealweek' }); await b.attendre(`document.readyState === 'complete'`, 20000); await dormir(4000);
  await b.ev(`(document.querySelectorAll('*').forEach((e) => { e.style.animation = 'none'; e.style.transition = 'none'; }), 1)`); await dormir(600);
  const texte = await b.ev(`document.body.innerText.slice(0, 100).replace(/\\s+/g, ' ')`);
  const s = await b.send('Page.captureScreenshot', { format: 'png' });
  await fetch(`http://localhost:${b.port}/json/close/${b.id}`, { method: 'PUT' }); b.fermerWs();
  return { png: Buffer.from(s.result.data, 'base64'), texte, erreurs: b.erreurs.filter((e) => !/Failed to load resource|net::ERR/.test(e || '')) };
};
const apres = await prendre('http://localhost:5303'), avant = await prendre('http://localhost:5304');
fs.writeFileSync(DOSSIER_IMG + 'mealweek-apres.png', apres.png); fs.writeFileSync(DOSSIER_IMG + 'mealweek-avant.png', avant.png);
const id = Buffer.compare(apres.png, avant.png) === 0;
console.log((id ? '✅' : '❌') + ' MealWeek : capture identique octet pour octet (avant / après) — ' + apres.texte);
console.log((apres.erreurs.length === 0 ? '✅' : '❌') + ' MealWeek : aucune erreur console ' + apres.erreurs.join(' | ').slice(0, 200));
process.exitCode = id && !apres.erreurs.length ? 0 : 1;
